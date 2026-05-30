'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FlaggedItem } from '@/types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: string | number;
}

interface Order {
  id: string;
  table_id: string;
  status: 'pending' | 'preparing' | 'ready' | 'served' | 'needs_attention';
  table_name: string;
  total_amount: string | number;
  note?: string;
  attention_note?: string;
  payment_method: string;
  payment_status: string;
  discount_amount?: string | number;
  coupon_code?: string;
  created_at: string;
  order_items: OrderItem[];
}

// ─── Status config ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, {
  label: string;
  subtitle: string;
  color: string;
  eta: string;
  step: number;
}> = {
  pending: {
    label: 'Order Placed',
    subtitle: 'We received your order',
    color: '#c8a96e',
    eta: '~15 min',
    step: 0,
  },
  preparing: {
    label: 'Preparing',
    subtitle: 'Your order is being prepared',
    color: '#e8c584',
    eta: '~10 min',
    step: 1,
  },
  ready: {
    label: 'Ready to Collect',
    subtitle: 'Your order is ready — please collect it!',
    color: '#22c55e',
    eta: 'Now',
    step: 2,
  },
  served: {
    label: 'Served',
    subtitle: 'Enjoy your meal!',
    color: '#22c55e',
    eta: 'Done',
    step: 3,
  },
  needs_attention: {
    label: 'Attention Needed',
    subtitle: 'A waiter is on the way to your table',
    color: '#f59e0b',
    eta: 'Shortly',
    step: 1,
  },
};

const STEPS = ['Order Placed', 'Preparing', 'Ready', 'Served'];

// ─── Props ──────────────────────────────────────────────────────────────────────

interface OrderStatusClientProps {
  orderId: string;
}

// ─── FlaggedItemBanner ─────────────────────────────────────────────────────────
// Shown at the top of the page when the kitchen marks one of this order's
// items as unavailable. Each flag gets its own dismissible card.

interface FlaggedItemBannerProps {
  flags: FlaggedItem[];
  onDismiss: (itemName: string) => void;
}

function FlaggedItemBanner({ flags, onDismiss }: FlaggedItemBannerProps) {
  if (flags.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {flags.map((flag) => (
        <div
          key={flag.itemName}
          style={{
            background: 'rgba(239,68,68,0.07)',
            border: '1px solid rgba(239,68,68,0.35)',
            borderRadius: '12px',
            padding: '16px 16px 14px',
            position: 'relative',
            animation: 'flagSlideIn 0.3s ease',
          }}
        >
          {/* Dismiss button */}
          <button
            onClick={() => onDismiss(flag.itemName)}
            aria-label="Dismiss"
            style={{
              position: 'absolute', top: '12px', right: '12px',
              background: 'transparent', border: 'none',
              color: '#6b5c47', fontSize: '16px',
              cursor: 'pointer', lineHeight: 1, padding: '2px 4px',
            }}
          >
            ×
          </button>

          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', paddingRight: '24px' }}>
            <span style={{ fontSize: '18px', flexShrink: 0, lineHeight: 1.2 }}>😔</span>
            <div>
              <p style={{
                color: '#f87171', fontSize: '14px', fontWeight: 700,
                margin: '0 0 3px', lineHeight: 1.3,
              }}>
                Item unavailable
              </p>
              <p style={{ color: '#f5f0e8', fontSize: '15px', margin: 0, lineHeight: 1.4 }}>
                <strong>{flag.itemName}</strong> can&apos;t be made right now.
              </p>
            </div>
          </div>

          {/* Kitchen suggestion */}
          {flag.note && (
            <div style={{
              marginTop: '10px',
              marginLeft: '28px',
              background: 'rgba(200,169,110,0.07)',
              border: '1px solid rgba(200,169,110,0.15)',
              borderRadius: '8px',
              padding: '8px 12px',
            }}>
              <p style={{ color: '#6b5c47', fontSize: '11px', fontWeight: 600, margin: '0 0 2px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Kitchen suggests
              </p>
              <p style={{ color: '#c8a96e', fontSize: '13px', margin: 0, lineHeight: 1.4 }}>
                {flag.note}
              </p>
            </div>
          )}

          {/* Waiter note */}
          <p style={{
            color: '#6b5c47', fontSize: '12px',
            margin: '10px 0 0 28px', lineHeight: 1.5,
          }}>
            A team member will visit your table to sort this out.
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function OrderStatusClient({ orderId }: OrderStatusClientProps) {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ── Item-flag state: keyed by itemName, value is the full FlaggedItem ─────────
  const [flaggedItems, setFlaggedItems] = useState<Record<string, FlaggedItem>>({});

  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);

  // ── Initial fetch ─────────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchOrder() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API}/api/orders/${orderId}`);
        if (!res.ok) {
          if (res.status === 404) throw new Error('Order not found');
          throw new Error(`Server error (${res.status})`);
        }
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? 'Failed to load order');
        setOrder(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load order');
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [orderId]);

  // ── SSE connection ────────────────────────────────────────────────────────────
  useEffect(() => {
    function connectSSE() {
      esRef.current?.close();

      const es = new EventSource(`${API}/api/kitchen/stream`);
      esRef.current = es;

      es.addEventListener('connected', () => {
        setConnected(true);
        retryCount.current = 0;
      });

      es.addEventListener('order_status_changed', (e) => {
        try {
          const updated = JSON.parse(e.data);
          if (updated.id === orderId) {
            setOrder((prev) => prev ? { ...prev, ...updated } : updated);
            setLastUpdated(new Date());
          }
        } catch { /* ignore malformed */ }
      });

      es.addEventListener('order_updated', (e) => {
        try {
          const updated = JSON.parse(e.data);
          if (updated.id === orderId) {
            setOrder((prev) => prev ? { ...prev, ...updated } : updated);
            setLastUpdated(new Date());
          }
        } catch { /* ignore */ }
      });

      es.addEventListener('attention_needed', (e) => {
        try {
          const updated = JSON.parse(e.data);
          if (updated.id === orderId) {
            setOrder((prev) =>
              prev ? { ...prev, ...updated, status: 'needs_attention' } : updated
            );
            setLastUpdated(new Date());
          }
        } catch { /* ignore */ }
      });

      // ── NEW: item_flagged — kitchen marked a specific item unavailable ─────────
      // Payload: { orderId, tableName, itemName, note, flaggedAt }
      // Order status does NOT change — we only add a UI flag card.
      es.addEventListener('item_flagged', (e) => {
        try {
          const flag = JSON.parse(e.data) as FlaggedItem;
          // Only act on events for this order
          if (flag.orderId !== orderId) return;
          setFlaggedItems((prev) => ({
            ...prev,
            [flag.itemName]: flag,          // keyed by itemName — deduplicates re-flags
          }));
          setLastUpdated(new Date());
        } catch { /* ignore malformed */ }
      });

      es.addEventListener('payment_confirmed', (e) => {
        try {
          const updated = JSON.parse(e.data);
          if (updated.id === orderId) {
            setOrder((prev) => prev ? { ...prev, ...updated } : updated);
            setLastUpdated(new Date());
          }
        } catch { /* ignore */ }
      });

      es.onerror = () => {
        setConnected(false);
        esRef.current?.close();
        // Exponential backoff: 3s → 6s → 12s → max 30s
        const delay = Math.min(3000 * Math.pow(2, retryCount.current), 30_000);
        retryCount.current += 1;
        retryRef.current = setTimeout(connectSSE, delay);
      };
    }

    connectSSE();

    return () => {
      esRef.current?.close();
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [orderId]);

  // ── Dismiss a single flag card ────────────────────────────────────────────────
  function dismissFlag(itemName: string) {
    setFlaggedItems((prev) => {
      const next = { ...prev };
      delete next[itemName];
      return next;
    });
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0e0b08',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            border: '3px solid rgba(200,169,110,0.2)',
            borderTopColor: '#c8a96e',
            margin: '0 auto 16px',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ color: '#6b5c47', fontSize: '14px' }}>Loading order…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────
  if (error || !order) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0e0b08',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}>
        <div style={{
          background: '#1a1410',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: '12px', padding: '32px',
          textAlign: 'center', maxWidth: '360px',
        }}>
          <p style={{ fontSize: '32px', margin: '0 0 12px' }}>☕</p>
          <h2 style={{
            color: '#ef4444', fontSize: '18px',
            margin: '0 0 8px', fontFamily: 'Georgia,serif',
          }}>
            {error ?? 'Order not found'}
          </h2>
          <p style={{ color: '#6b5c47', fontSize: '14px', margin: '0 0 20px' }}>
            Check your order ID or ask a staff member for help.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px',
              background: 'linear-gradient(135deg,#c8a96e,#e8c584)',
              border: 'none', borderRadius: '8px',
              color: '#0e0b08', fontSize: '14px', fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const config      = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
  const isAttention = order.status === 'needs_attention';
  const isReady     = order.status === 'ready';
  const isServed    = order.status === 'served';
  const showReorder = isReady || isServed;

  const total    = parseFloat(String(order.total_amount));
  const discount = parseFloat(String(order.discount_amount ?? 0));

  const menuUrl = order.table_id ? `/menu/${order.table_id}` : null;

  // Active (non-dismissed) flags as a sorted array
  const activeFlags = Object.values(flaggedItems).sort(
    (a, b) => new Date(b.flaggedAt).getTime() - new Date(a.flaggedAt).getTime()
  );

  return (
    <>
      <style>{`
        @keyframes spin       { to { transform: rotate(360deg); } }
        @keyframes fadeIn     { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse      { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes flagSlideIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes attentionPulse {
          0%,100% { background: rgba(245,158,11,0.06); border-color: rgba(245,158,11,0.3); }
          50%      { background: rgba(245,158,11,0.12); border-color: rgba(245,158,11,0.6); }
        }
        @keyframes readyGlow {
          0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
          50%      { box-shadow: 0 0 20px 4px rgba(34,197,94,0.15); }
        }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#0e0b08' }}>

        {/* ── Header ── */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(200,169,110,0.08)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <h1 style={{
              color: '#c8a96e', fontFamily: 'Georgia,serif',
              fontSize: '18px', margin: '0 0 2px',
            }}>
              Brew &amp; Co
            </h1>
            <p style={{
              color: '#6b5c47', fontSize: '11px',
              margin: 0, letterSpacing: '0.1em',
            }}>
              ORDER TRACKING
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: connected ? '#22c55e' : '#f59e0b',
              boxShadow: connected ? '0 0 5px rgba(34,197,94,0.5)' : 'none',
            }} />
            <span style={{ color: '#6b5c47', fontSize: '12px' }}>
              {connected ? 'LIVE' : 'Connecting…'}
            </span>
          </div>
        </div>

        <div style={{
          maxWidth: '580px', margin: '0 auto',
          padding: '20px 16px 40px',
          display: 'flex', flexDirection: 'column', gap: '16px',
          animation: 'fadeIn 0.3s ease',
        }}>

          {/* ── Flagged items banner — injected at the top, dismissible ── */}
          {activeFlags.length > 0 && (
            <FlaggedItemBanner flags={activeFlags} onDismiss={dismissFlag} />
          )}

          {/* ── Status hero card ── */}
          <div style={{
            background: '#1a1410',
            border: isAttention
              ? '1px solid rgba(245,158,11,0.4)'
              : `1px solid ${config.color}22`,
            borderRadius: '14px',
            padding: '28px 24px',
            textAlign: 'center',
            animation: isAttention
              ? 'attentionPulse 2s ease-in-out infinite'
              : isReady
                ? 'readyGlow 2s ease-in-out infinite'
                : 'none',
          }}>
            {/* Ready icon pulse */}
            {isReady && (
              <div style={{
                fontSize: '36px', margin: '0 0 12px',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}>
                🔔
              </div>
            )}

            <h2 style={{
              color: config.color,
              fontFamily: 'Georgia,serif',
              fontSize: '28px',
              margin: '0 0 8px',
            }}>
              {config.label}
            </h2>
            <p style={{ color: '#a89070', fontSize: '14px', margin: '0 0 16px' }}>
              {config.subtitle}
            </p>

            {/* Attention note */}
            {isAttention && order.attention_note && (
              <div style={{
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.25)',
                borderRadius: '8px', padding: '10px 14px',
                margin: '0 0 16px',
              }}>
                <p style={{ color: '#f59e0b', fontSize: '14px', margin: 0 }}>
                  ⚠️ {order.attention_note}
                </p>
              </div>
            )}

            {/* ETA pill */}
            <span style={{
              display: 'inline-block',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '20px',
              padding: '5px 16px',
              color: '#6b5c47', fontSize: '13px',
              marginBottom: '20px',
            }}>
              Estimated &nbsp;<strong style={{ color: config.color }}>{config.eta}</strong>
            </span>

            {/* Progress bar */}
            {!isAttention && (
              <div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  marginBottom: '6px',
                }}>
                  {STEPS.map((step, idx) => (
                    <span key={step} style={{
                      fontSize: '10px',
                      color: idx <= config.step ? config.color : '#3a3025',
                      fontWeight: idx === config.step ? 600 : 400,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      flex: 1, textAlign: 'center',
                    }}>
                      {step}
                    </span>
                  ))}
                </div>
                <div style={{
                  height: '4px', background: 'rgba(255,255,255,0.06)',
                  borderRadius: '4px', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${(config.step / (STEPS.length - 1)) * 100}%`,
                    background: `linear-gradient(90deg, ${config.color}88, ${config.color})`,
                    borderRadius: '4px',
                    transition: 'width 0.6s ease',
                  }} />
                </div>
              </div>
            )}
          </div>

          {/* ── "Order Another Round" button — shows when ready or served ── */}
          {showReorder && menuUrl && (
            <div style={{
              background: isServed ? 'rgba(34,197,94,0.05)' : 'rgba(200,169,110,0.05)',
              border: isServed
                ? '1px solid rgba(34,197,94,0.2)'
                : '1px solid rgba(200,169,110,0.2)',
              borderRadius: '14px',
              padding: '20px',
              textAlign: 'center',
            }}>
              {isServed ? (
                <>
                  <p style={{ fontSize: '28px', margin: '0 0 8px' }}>☕</p>
                  <p style={{
                    color: '#22c55e', fontSize: '16px',
                    fontWeight: 600, margin: '0 0 4px',
                    fontFamily: 'Georgia,serif',
                  }}>
                    Enjoy your order!
                  </p>
                  <p style={{ color: '#6b5c47', fontSize: '13px', margin: '0 0 16px' }}>
                    Thank you for visiting Brew &amp; Co
                  </p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: '24px', margin: '0 0 8px' }}>🥐</p>
                  <p style={{
                    color: '#f5f0e8', fontSize: '15px',
                    fontWeight: 600, margin: '0 0 4px',
                    fontFamily: 'Georgia,serif',
                  }}>
                    Want something else?
                  </p>
                  <p style={{ color: '#6b5c47', fontSize: '13px', margin: '0 0 16px' }}>
                    You can add more items while you wait
                  </p>
                </>
              )}

              <button
                onClick={() => router.push(menuUrl)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 28px',
                  background: 'linear-gradient(135deg, #c8a96e, #e8c584)',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#0e0b08',
                  fontSize: '15px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'Georgia,serif',
                  letterSpacing: '0.01em',
                }}
              >
                ☕ Order Another Round
              </button>
            </div>
          )}

          {/* ── Timeline ── */}
          <div style={{
            background: '#1a1410',
            border: '1px solid rgba(200,169,110,0.08)',
            borderRadius: '14px',
            padding: '20px',
          }}>
            {STEPS.map((step, idx) => {
              const done    = idx < config.step;
              const current = idx === config.step && !isAttention;
              const future  = idx > config.step;

              return (
                <div key={step} style={{
                  display: 'flex', gap: '14px', alignItems: 'flex-start',
                  position: 'relative',
                }}>
                  {/* Connector line */}
                  {idx < STEPS.length - 1 && (
                    <div style={{
                      position: 'absolute', left: '12px', top: '26px',
                      width: '2px', height: '32px',
                      background: done ? `${config.color}60` : 'rgba(255,255,255,0.06)',
                      transition: 'background 0.4s ease',
                    }} />
                  )}

                  {/* Dot */}
                  <div style={{
                    width: '26px', height: '26px', borderRadius: '50%',
                    flexShrink: 0, marginTop: '10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: done
                      ? `${config.color}22`
                      : current ? `${config.color}18`
                        : 'rgba(255,255,255,0.04)',
                    border: done || current
                      ? `1.5px solid ${config.color}55`
                      : '1.5px solid rgba(255,255,255,0.08)',
                    transition: 'all 0.4s ease',
                  }}>
                    {done ? (
                      <span style={{ color: config.color, fontSize: '12px' }}>✓</span>
                    ) : current ? (
                      <span style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: config.color,
                        boxShadow: `0 0 6px ${config.color}80`,
                      }} />
                    ) : (
                      <span style={{
                        width: '6px', height: '6px', borderRadius: '50%',
                        background: 'rgba(255,255,255,0.1)',
                      }} />
                    )}
                  </div>

                  {/* Label */}
                  <div style={{ paddingTop: '10px', paddingBottom: '20px' }}>
                    <p style={{
                      color: future ? '#3a3025' : current ? '#f5f0e8' : '#6b5c47',
                      fontSize: '15px',
                      fontWeight: current ? 600 : 400,
                      margin: '0 0 2px',
                      transition: 'color 0.4s ease',
                    }}>
                      {step}
                      {current && (
                        <span style={{
                          display: 'inline-block',
                          width: '6px', height: '6px', borderRadius: '50%',
                          background: '#22c55e',
                          marginLeft: '8px', verticalAlign: 'middle',
                          boxShadow: '0 0 4px rgba(34,197,94,0.6)',
                        }} />
                      )}
                    </p>
                    {current && (
                      <p style={{ color: '#6b5c47', fontSize: '12px', margin: 0 }}>
                        {config.subtitle}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Attention step */}
            {isAttention && (
              <div style={{ display: 'flex', gap: '14px', paddingTop: '4px' }}>
                <div style={{
                  width: '26px', height: '26px', borderRadius: '50%',
                  flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(245,158,11,0.15)',
                  border: '1.5px solid rgba(245,158,11,0.4)',
                }}>
                  <span style={{ fontSize: '12px' }}>⚠️</span>
                </div>
                <div>
                  <p style={{ color: '#f5f0e8', fontSize: '15px', fontWeight: 600, margin: '0 0 2px' }}>
                    Waiter on the way
                  </p>
                  <p style={{ color: '#6b5c47', fontSize: '12px', margin: 0 }}>
                    {order.attention_note ?? 'A team member will visit your table shortly'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Order summary ── */}
          <div style={{
            background: '#1a1410',
            border: '1px solid rgba(200,169,110,0.08)',
            borderRadius: '14px',
            padding: '20px',
          }}>
            <h3 style={{
              color: '#c8a96e', fontFamily: 'Georgia,serif',
              fontSize: '15px', margin: '0 0 16px',
            }}>
              Order Summary
            </h3>

            {order.order_items?.map((item, idx) => {
              // Dim items that the kitchen has flagged as unavailable
              const isFlagged = Boolean(flaggedItems[item.name]);
              return (
                <div key={item.id ?? idx} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: '10px',
                  opacity: isFlagged ? 0.5 : 1,
                  transition: 'opacity 0.3s ease',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      background: isFlagged
                        ? 'rgba(239,68,68,0.15)' : 'rgba(200,169,110,0.12)',
                      color: isFlagged ? '#f87171' : '#c8a96e',
                      borderRadius: '6px',
                      padding: '2px 8px',
                      fontSize: '13px', fontWeight: 700,
                      minWidth: '28px', textAlign: 'center',
                    }}>
                      {item.quantity}x
                    </span>
                    <span style={{
                      color: '#f5f0e8', fontSize: '14px',
                      textDecoration: isFlagged ? 'line-through' : 'none',
                    }}>
                      {item.name}
                    </span>
                    {isFlagged && (
                      <span style={{
                        background: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.25)',
                        borderRadius: '20px', padding: '1px 8px',
                        color: '#ef4444', fontSize: '11px', fontWeight: 600,
                      }}>
                        UNAVAIL
                      </span>
                    )}
                  </div>
                  <span style={{ color: '#6b5c47', fontSize: '14px' }}>
                    ₹{(parseFloat(String(item.price)) * item.quantity).toFixed(2)}
                  </span>
                </div>
              );
            })}

            <div style={{
              borderTop: '1px solid rgba(200,169,110,0.08)',
              marginTop: '12px', paddingTop: '12px',
            }}>
              {discount > 0 && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  marginBottom: '6px',
                }}>
                  <span style={{ color: '#6b5c47', fontSize: '13px' }}>
                    Discount {order.coupon_code && `(${order.coupon_code})`}
                  </span>
                  <span style={{ color: '#22c55e', fontSize: '13px' }}>
                    −₹{discount.toFixed(2)}
                  </span>
                </div>
              )}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ color: '#f5f0e8', fontSize: '15px', fontWeight: 600 }}>Total</span>
                <span style={{
                  color: '#c8a96e', fontSize: '20px', fontWeight: 700,
                  fontFamily: 'Georgia,serif',
                }}>
                  ₹{total.toFixed(2)}
                </span>
              </div>

              {/* Payment badge */}
              <div style={{ textAlign: 'right', marginTop: '8px' }}>
                <span style={{
                  display: 'inline-block',
                  background: order.payment_status === 'paid'
                    ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${order.payment_status === 'paid'
                    ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                  borderRadius: '20px', padding: '3px 12px',
                  color: order.payment_status === 'paid' ? '#22c55e' : '#ef4444',
                  fontSize: '12px', fontWeight: 500,
                }}>
                  {order.payment_status === 'paid' ? '✓' : '○'}&nbsp;
                  {order.payment_status.toUpperCase()} · {order.payment_method.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <p style={{
            textAlign: 'center', color: '#3a3025',
            fontSize: '12px', margin: 0,
          }}>
            Order #{order.id.slice(0, 8).toUpperCase()}
            {lastUpdated && (
              <> · Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>
            )}
          </p>
        </div>
      </div>
    </>
  );
}
