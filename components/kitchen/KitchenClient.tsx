'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';
const KITCHEN_PASSWORD = 'kitchen123';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
}

interface Order {
  id: string;
  status: 'pending' | 'preparing' | 'ready' | 'needs_attention';
  table_name: string;
  total_amount: string;
  note?: string;
  attention_note?: string;
  payment_method: string;
  payment_status: string;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
}

// flaggedItems: { [orderId]: itemName[] } — local kitchen state only
type FlaggedMap = Record<string, string[]>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

function playBeep(times = 1): void {
  let delay = 0;
  for (let i = 0; i < times; i++) {
    setTimeout(() => {
      try {
        const ctx = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = i === 0 ? 880 : 660;
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      } catch { /* audio blocked */ }
    }, delay);
    delay += 450;
  }
}

// ─── ItemFlagModal ────────────────────────────────────────────────────────────
// Kitchen picks a specific item that's unavailable.
// Order status does NOT change — this is informational only.
// "Escalate whole order" is a separate explicit action at the bottom.

interface ItemFlagModalProps {
  order: Order;
  onFlagItem:    (orderId: string, itemName: string, note: string) => void;
  onEscalate:    (orderId: string, reason: string) => void;
  onClose:       () => void;
}

function ItemFlagModal({ order, onFlagItem, onEscalate, onClose }: ItemFlagModalProps) {
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [suggestion,   setSuggestion]   = useState('');
  const [showEscalate, setShowEscalate] = useState(false);
  const [escalateNote, setEscalateNote] = useState('');

  const ESCALATE_PRESETS = [
    'Wrong table — resend to kitchen',
    'Customer wants to cancel',
    'Payment issue — needs manager',
    'Allergy concern — hold order',
  ];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1a1410',
          border: '1px solid rgba(200,169,110,0.15)',
          borderRadius: '16px',
          padding: '28px',
          width: '100%',
          maxWidth: '480px',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {!showEscalate ? (
          <>
            {/* Header */}
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{
                color: '#f5f0e8', fontSize: '18px',
                margin: '0 0 4px', fontFamily: 'Georgia,serif',
              }}>
                Flag Unavailable Item
              </h2>
              <p style={{ color: '#6b5c47', fontSize: '13px', margin: 0 }}>
                {order.table_name} · select the item that can't be made
              </p>
            </div>

            {/* Item selector */}
            <p style={{
              color: '#c8a96e', fontSize: '12px', fontWeight: 600,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              margin: '0 0 10px',
            }}>
              Which item?
            </p>
            <div style={{
              display: 'flex', flexDirection: 'column', gap: '8px',
              marginBottom: '20px',
            }}>
              {order.items?.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(
                    selectedItem === item.name ? null : item.name
                  )}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 14px', borderRadius: '10px',
                    textAlign: 'left', cursor: 'pointer',
                    border: selectedItem === item.name
                      ? '1.5px solid rgba(239,68,68,0.6)'
                      : '1px solid rgba(200,169,110,0.1)',
                    background: selectedItem === item.name
                      ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.02)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Quantity badge */}
                  <span style={{
                    background: selectedItem === item.name
                      ? 'rgba(239,68,68,0.2)' : 'rgba(200,169,110,0.12)',
                    color: selectedItem === item.name ? '#f87171' : '#c8a96e',
                    borderRadius: '6px',
                    padding: '3px 10px',
                    fontSize: '14px', fontWeight: 700,
                    flexShrink: 0,
                  }}>
                    {item.quantity}x
                  </span>
                  <span style={{
                    color: selectedItem === item.name ? '#f5f0e8' : '#a89070',
                    fontSize: '15px', fontWeight: selectedItem === item.name ? 600 : 400,
                    flex: 1,
                  }}>
                    {item.name}
                  </span>
                  {selectedItem === item.name && (
                    <span style={{ color: '#ef4444', fontSize: '16px' }}>✕</span>
                  )}
                </button>
              ))}
            </div>

            {/* Replacement suggestion — only shown when an item is selected */}
            {selectedItem && (
              <div style={{ marginBottom: '20px' }}>
                <p style={{
                  color: '#c8a96e', fontSize: '12px', fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  margin: '0 0 8px',
                }}>
                  Suggest a replacement? (optional)
                </p>
                <input
                  autoFocus
                  placeholder={`e.g. "Substitute with Americano" or leave blank`}
                  value={suggestion}
                  onChange={(e) => setSuggestion(e.target.value)}
                  style={{
                    width: '100%', padding: '11px 14px',
                    background: '#0e0b08',
                    border: '1px solid rgba(200,169,110,0.15)',
                    borderRadius: '8px',
                    color: '#f5f0e8', fontSize: '14px',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1, padding: '11px',
                  background: 'transparent',
                  border: '1px solid rgba(200,169,110,0.1)',
                  borderRadius: '8px', color: '#6b5c47',
                  cursor: 'pointer', fontSize: '14px',
                }}
              >
                Cancel
              </button>
              <button
                disabled={!selectedItem}
                onClick={() => {
                  if (selectedItem) {
                    onFlagItem(order.id, selectedItem, suggestion.trim());
                  }
                }}
                style={{
                  flex: 2, padding: '11px',
                  background: selectedItem
                    ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.04)',
                  border: '1px solid rgba(239,68,68,0.35)',
                  borderRadius: '8px',
                  color: selectedItem ? '#ef4444' : '#4a3530',
                  cursor: selectedItem ? 'pointer' : 'default',
                  fontSize: '14px', fontWeight: 600,
                  transition: 'all 0.15s ease',
                }}
              >
                ✕ Flag Item — Alert Customer
              </button>
            </div>

            {/* Escalate divider */}
            <div style={{
              borderTop: '1px solid rgba(200,169,110,0.08)',
              paddingTop: '14px', textAlign: 'center',
            }}>
              <button
                onClick={() => setShowEscalate(true)}
                style={{
                  background: 'transparent', border: 'none',
                  color: '#6b5c47', fontSize: '13px',
                  cursor: 'pointer', textDecoration: 'underline',
                  textDecorationColor: 'rgba(107,92,71,0.4)',
                }}
              >
                Different problem? Escalate whole order →
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Escalate whole order panel */}
            <div style={{ marginBottom: '20px' }}>
              <button
                onClick={() => setShowEscalate(false)}
                style={{
                  background: 'transparent', border: 'none',
                  color: '#6b5c47', fontSize: '13px',
                  cursor: 'pointer', padding: '0 0 12px 0',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                ← Back
              </button>
              <h2 style={{
                color: '#ef4444', fontSize: '18px',
                margin: '0 0 4px', fontFamily: 'Georgia,serif',
              }}>
                Escalate Whole Order
              </h2>
              <p style={{ color: '#6b5c47', fontSize: '13px', margin: 0 }}>
                {order.table_name} · sends waiter to table, order pauses
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {ESCALATE_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setEscalateNote(p)}
                  style={{
                    padding: '10px 14px', borderRadius: '8px',
                    textAlign: 'left', fontSize: '14px',
                    border: escalateNote === p
                      ? '1px solid rgba(239,68,68,0.5)'
                      : '1px solid rgba(200,169,110,0.1)',
                    background: escalateNote === p
                      ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.02)',
                    color: escalateNote === p ? '#f87171' : '#a89070',
                    cursor: 'pointer',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>

            <input
              placeholder="Or describe the issue…"
              value={escalateNote}
              onChange={(e) => setEscalateNote(e.target.value)}
              style={{
                width: '100%', padding: '11px 14px', marginBottom: '16px',
                background: '#0e0b08',
                border: '1px solid rgba(200,169,110,0.15)',
                borderRadius: '8px',
                color: '#f5f0e8', fontSize: '14px',
                outline: 'none', boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowEscalate(false)}
                style={{
                  flex: 1, padding: '11px',
                  background: 'transparent',
                  border: '1px solid rgba(200,169,110,0.1)',
                  borderRadius: '8px', color: '#6b5c47',
                  cursor: 'pointer', fontSize: '14px',
                }}
              >
                Back
              </button>
              <button
                disabled={!escalateNote.trim()}
                onClick={() => escalateNote.trim() && onEscalate(order.id, escalateNote.trim())}
                style={{
                  flex: 2, padding: '11px',
                  background: escalateNote.trim()
                    ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.04)',
                  border: '1px solid rgba(239,68,68,0.35)',
                  borderRadius: '8px',
                  color: escalateNote.trim() ? '#ef4444' : '#4a3530',
                  cursor: escalateNote.trim() ? 'pointer' : 'default',
                  fontSize: '14px', fontWeight: 600,
                }}
              >
                🔔 Send Waiter
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Order card ───────────────────────────────────────────────────────────────

interface OrderCardProps {
  order:          Order;
  flaggedItems:   string[];  // item names flagged for this order
  onStatusChange: (id: string, status: string) => void;
  onOpenFlagModal:(order: Order) => void;
}

function OrderCard({ order, flaggedItems, onStatusChange, onOpenFlagModal }: OrderCardProps) {
  const isAttention = order.status === 'needs_attention';
  const [elapsed, setElapsed] = useState(timeAgo(order.created_at));

  useEffect(() => {
    const id = setInterval(() => setElapsed(timeAgo(order.created_at)), 30_000);
    return () => clearInterval(id);
  }, [order.created_at]);

  const NEXT_LABEL: Record<string, string>  = {
    pending:  'Start Preparing',
    preparing:'Mark Ready',
    // ready → 'served' is the waiter's job, not kitchen's
  };
  const NEXT_STATUS: Record<string, string> = {
    pending:  'preparing',
    preparing:'ready',
    // kitchen stops at ready — waiter marks served
  };

  const minsElapsed = Math.floor(
    (Date.now() - new Date(order.created_at).getTime()) / 60_000
  );
  const timerColor =
    minsElapsed >= 15 ? '#ef4444' :
    minsElapsed >= 8  ? '#f59e0b' : '#6b5c47';

  const hasFlaggedItems = flaggedItems.length > 0;

  return (
    <div style={{
      background: isAttention
        ? 'rgba(239,68,68,0.05)'
        : hasFlaggedItems
          ? 'rgba(245,158,11,0.03)'
          : '#111009',
      border: isAttention
        ? '1.5px solid rgba(239,68,68,0.55)'
        : hasFlaggedItems
          ? '1px solid rgba(245,158,11,0.3)'
          : '1px solid rgba(200,169,110,0.1)',
      borderRadius: '12px',
      padding: '16px',
      animation: isAttention ? 'pulseBorder 1.6s ease-in-out infinite' : 'none',
      display: 'flex', flexDirection: 'column', gap: '12px',
    }}>

      {/* Row 1 — table + timer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          color: isAttention ? '#ef4444' : hasFlaggedItems ? '#f59e0b' : '#c8a96e',
          fontFamily: 'Georgia,serif', fontSize: '20px', fontWeight: 600,
        }}>
          {order.table_name}
        </span>
        <span style={{
          fontSize: '13px', fontWeight: 600, color: timerColor,
          background: 'rgba(255,255,255,0.04)',
          padding: '3px 10px', borderRadius: '20px',
          border: `1px solid ${timerColor}33`,
        }}>
          ⏱ {elapsed}
        </span>
      </div>

      {/* Whole-order attention banner */}
      {isAttention && (
        <div style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.28)',
          borderRadius: '8px', padding: '10px 12px',
          display: 'flex', alignItems: 'flex-start', gap: '8px',
        }}>
          <span style={{ fontSize: '16px', flexShrink: 0 }}>⚠️</span>
          <div>
            <p style={{ color: '#ef4444', fontSize: '14px', fontWeight: 600, margin: '0 0 2px' }}>
              Waiter required
            </p>
            <p style={{ color: '#f87171', fontSize: '13px', margin: 0 }}>
              {order.attention_note ?? 'Issue with this order'}
            </p>
          </div>
        </div>
      )}

      {/* Items — each item shows a flag badge if unavailable */}
      <div style={{
        background: 'rgba(255,255,255,0.025)',
        borderRadius: '8px', padding: '10px 12px',
        display: 'flex', flexDirection: 'column', gap: '8px',
      }}>
        {order.items?.map((item, idx) => {
          const isFlagged = flaggedItems.includes(item.name);
          return (
            <div key={item.id ?? idx} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <span style={{
                background: isFlagged
                  ? 'rgba(239,68,68,0.15)' : 'rgba(200,169,110,0.15)',
                color: isFlagged ? '#f87171' : '#c8a96e',
                borderRadius: '6px',
                padding: '2px 9px',
                fontSize: '16px', fontWeight: 700,
                minWidth: '30px', textAlign: 'center', flexShrink: 0,
              }}>
                {item.quantity}
              </span>
              <span style={{
                color: isFlagged ? '#6b5c47' : '#f5f0e8',
                fontSize: '17px', fontWeight: 500, lineHeight: 1.3,
                flex: 1,
                textDecoration: isFlagged ? 'line-through' : 'none',
                opacity: isFlagged ? 0.6 : 1,
              }}>
                {item.name}
              </span>
              {isFlagged && (
                <span style={{
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '20px', padding: '2px 8px',
                  color: '#ef4444', fontSize: '11px', fontWeight: 600,
                  flexShrink: 0,
                }}>
                  UNAVAIL
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Customer note */}
      {order.note && !isAttention && (
        <div style={{
          background: 'rgba(200,169,110,0.04)',
          border: '1px solid rgba(200,169,110,0.1)',
          borderRadius: '8px', padding: '8px 12px',
          color: '#a89070', fontSize: '13px', lineHeight: 1.5,
        }}>
          📝 {order.note}
        </div>
      )}

      {/* Payment badge */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span style={{
          fontSize: '12px', padding: '3px 10px', borderRadius: '20px',
          background: order.payment_method === 'cash'
            ? 'rgba(34,197,94,0.1)' : 'rgba(200,169,110,0.1)',
          color: order.payment_method === 'cash' ? '#22c55e' : '#c8a96e',
          border: `1px solid ${order.payment_method === 'cash'
            ? 'rgba(34,197,94,0.25)' : 'rgba(200,169,110,0.2)'}`,
          fontWeight: 500,
        }}>
          {order.payment_method === 'cash' ? 'Cash' : 'Paid Online'}
        </span>
      </div>

      {/* Action buttons */}
      {isAttention ? (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => onStatusChange(order.id, 'preparing')}
            style={{
              flex: 1, padding: '12px',
              background: 'rgba(200,169,110,0.1)',
              border: '1px solid rgba(200,169,110,0.25)',
              borderRadius: '8px', color: '#c8a96e',
              fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            ✓ Resolved — Continue
          </button>
          <button
            onClick={() => onStatusChange(order.id, 'pending')}
            style={{
              padding: '12px 14px', background: 'transparent',
              border: '1px solid rgba(200,169,110,0.1)',
              borderRadius: '8px', color: '#6b5c47',
              fontSize: '13px', cursor: 'pointer',
            }}
          >
            Reset
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px' }}>
          {NEXT_STATUS[order.status] ? (
            <button
              onClick={() => onStatusChange(order.id, NEXT_STATUS[order.status])}
              style={{
                flex: 1, padding: '13px',
                background: 'linear-gradient(135deg,#c8a96e,#e8c584)',
                border: 'none',
                borderRadius: '8px',
                color: '#0e0b08',
                fontSize: '15px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              {NEXT_LABEL[order.status]}
            </button>
          ) : (
            /* Ready — waiter will mark served */
            <div style={{
              flex: 1, padding: '13px',
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: '8px',
              color: '#22c55e',
              fontSize: '14px', fontWeight: 600,
              textAlign: 'center',
            }}>
              Waiting for waiter
            </div>
          )}
          {/* ⚠️ opens item flag modal — NOT whole-order escalation */}
          <button
            onClick={() => onOpenFlagModal(order)}
            title="Flag unavailable item"
            style={{
              padding: '13px 14px',
              background: hasFlaggedItems
                ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.06)',
              border: hasFlaggedItems
                ? '1px solid rgba(245,158,11,0.3)'
                : '1px solid rgba(239,68,68,0.18)',
              borderRadius: '8px',
              color: hasFlaggedItems ? '#f59e0b' : '#ef4444',
              fontSize: '15px', cursor: 'pointer',
              position: 'relative',
            }}
          >
            ⚠️
            {/* Badge showing number of flagged items */}
            {flaggedItems.length > 0 && (
              <span style={{
                position: 'absolute', top: '-6px', right: '-6px',
                background: '#f59e0b', color: '#0e0b08',
                borderRadius: '50%', width: '18px', height: '18px',
                fontSize: '11px', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {flaggedItems.length}
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

interface ColumnProps {
  title:          string;
  accentColor:    string;
  orders:         Order[];
  flaggedItems:   FlaggedMap;
  onStatusChange: (id: string, status: string) => void;
  onOpenFlagModal:(order: Order) => void;
}

function Column({
  title, accentColor, orders, flaggedItems,
  onStatusChange, onOpenFlagModal,
}: ColumnProps) {
  return (
    <div style={{
      flex: 1, minWidth: '300px', maxWidth: '420px',
      background: '#0d0b08',
      border: '1px solid rgba(200,169,110,0.07)',
      borderRadius: '14px',
      display: 'flex', flexDirection: 'column',
      maxHeight: 'calc(100vh - 130px)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid rgba(200,169,110,0.07)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: '#0d0b08', flexShrink: 0,
      }}>
        <span style={{
          color: accentColor, fontFamily: 'Georgia,serif',
          fontSize: '17px', fontWeight: 600,
        }}>
          {title}
        </span>
        <span style={{
          background: `${accentColor}18`, color: accentColor,
          border: `1px solid ${accentColor}35`,
          borderRadius: '20px', padding: '3px 12px',
          fontSize: '15px', fontWeight: 700,
        }}>
          {orders.length}
        </span>
      </div>

      <div style={{
        padding: '12px', overflowY: 'auto', flex: 1,
        display: 'flex', flexDirection: 'column', gap: '10px',
      }}>
        {orders.length === 0 ? (
          <p style={{
            textAlign: 'center', color: '#2e2820',
            fontSize: '14px', paddingTop: '32px', margin: 0,
          }}>
            No orders
          </p>
        ) : orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            flaggedItems={flaggedItems[order.id] ?? []}
            onStatusChange={onStatusChange}
            onOpenFlagModal={onOpenFlagModal}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function KitchenClient() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password,      setPassword]      = useState('');
  const [authError,     setAuthError]     = useState('');

  const [orders,       setOrders]       = useState<Order[]>([]);
  const [flaggedItems, setFlaggedItems] = useState<FlaggedMap>({});
  const [connected,    setConnected]    = useState(false);
  const [flagTarget,   setFlagTarget]   = useState<Order | null>(null);

  const esRef = useRef<EventSource | null>(null);

  // ── SSE ─────────────────────────────────────────────────────────────────────
  const connectSSE = useCallback(() => {
    esRef.current?.close();
    const es = new EventSource(`${API}/api/kitchen/stream`);
    esRef.current = es;

    es.addEventListener('connected', () => setConnected(true));

    es.addEventListener('initial_orders', (e) => {
      try { setOrders(JSON.parse(e.data)); } catch {/* ignore */}
    });

    es.addEventListener('new_order', (e) => {
      try {
        const order: Order = JSON.parse(e.data);
        setOrders((prev) =>
          prev.some((o) => o.id === order.id) ? prev : [...prev, order]
        );
        playBeep(1);
      } catch {/* ignore */}
    });

    es.addEventListener('order_updated', (e) => {
      try {
        const order: Order = JSON.parse(e.data);
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? order : o))
        );
      } catch {/* ignore */}
    });

    es.addEventListener('attention_needed', (e) => {
      try {
        const order: Order = JSON.parse(e.data);
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? order : o))
        );
        playBeep(2);
      } catch {/* ignore */}
    });

    // Per-item flag — update local flagged map, do NOT move the order
    es.addEventListener('item_flagged', (e) => {
      try {
        const data = JSON.parse(e.data) as {
          orderId: string; itemName: string; note: string;
        };
        setFlaggedItems((prev) => ({
          ...prev,
          [data.orderId]: Array.from(
            new Set([...(prev[data.orderId] ?? []), data.itemName])
          ),
        }));
      } catch {/* ignore */}
    });

    es.addEventListener('order_served', (e) => {
      try {
        const { id } = JSON.parse(e.data);
        setOrders((prev) => prev.filter((o) => o.id !== id));
        // Also clear flagged items for this order
        setFlaggedItems((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } catch {/* ignore */}
    });

    es.addEventListener('payment_confirmed', (e) => {
      try {
        const order: Order = JSON.parse(e.data);
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? order : o))
        );
      } catch {/* ignore */}
    });

    es.onerror = () => {
      setConnected(false);
      esRef.current?.close();
      setTimeout(connectSSE, 3000);
    };
  }, []);

  useEffect(() => {
    if (authenticated) {
      connectSSE();
      return () => esRef.current?.close();
    }
  }, [authenticated, connectSSE]);

  // ── Status change ────────────────────────────────────────────────────────────
  const handleStatusChange = async (id: string, status: string) => {
    if (status === 'served') {
      setOrders((prev) => prev.filter((o) => o.id !== id));
      setFlaggedItems((prev) => { const n = { ...prev }; delete n[id]; return n; });
    } else {
      setOrders((prev) =>
        prev.map((o) => o.id === id ? { ...o, status: status as Order['status'] } : o)
      );
    }
    try {
      await fetch(`${API}/api/kitchen/orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      console.error('[status change]', err);
    }
  };

  // ── Flag specific item ───────────────────────────────────────────────────────
  const handleFlagItem = async (orderId: string, itemName: string, note: string) => {
    setFlagTarget(null);
    // Optimistic update
    setFlaggedItems((prev) => ({
      ...prev,
      [orderId]: Array.from(new Set([...(prev[orderId] ?? []), itemName])),
    }));
    try {
      await fetch(`${API}/api/orders/${orderId}/flag`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemName, note, flaggedBy: 'kitchen' }),
      });
    } catch (err) {
      console.error('[flag item]', err);
    }
  };

  // ── Escalate whole order ─────────────────────────────────────────────────────
  const handleEscalate = async (orderId: string, reason: string) => {
    setFlagTarget(null);
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? { ...o, status: 'needs_attention', attention_note: reason }
          : o
      )
    );
    try {
      await fetch(`${API}/api/kitchen/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'needs_attention', attention_reason: reason }),
      });
    } catch (err) {
      console.error('[escalate]', err);
    }
  };

  // ── Login screen ─────────────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0e0b08',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}>
        <div style={{
          background: '#1a1410',
          border: '1px solid rgba(200,169,110,0.1)',
          borderRadius: '14px', padding: '36px',
          width: '100%', maxWidth: '340px',
        }}>
          <h1 style={{
            color: '#c8a96e', fontFamily: 'Georgia,serif',
            fontSize: '24px', margin: '0 0 6px',
          }}>
            Kitchen Display
          </h1>
          <p style={{ color: '#6b5c47', fontSize: '14px', margin: '0 0 28px' }}>
            Staff access only
          </p>
          <input
            type="password"
            placeholder="Kitchen password"
            value={password}
            autoFocus
            onChange={(e) => { setPassword(e.target.value); setAuthError(''); }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              if (password === KITCHEN_PASSWORD) setAuthenticated(true);
              else setAuthError('Wrong password');
            }}
            style={{
              width: '100%', padding: '12px 14px',
              background: '#0e0b08',
              border: '1px solid rgba(200,169,110,0.15)',
              borderRadius: '8px', color: '#f5f0e8',
              fontSize: '15px', outline: 'none', boxSizing: 'border-box',
              marginBottom: authError ? '8px' : '16px',
            }}
          />
          {authError && (
            <p style={{ color: '#ef4444', fontSize: '13px', margin: '0 0 14px' }}>
              {authError}
            </p>
          )}
          <button
            onClick={() => {
              if (password === KITCHEN_PASSWORD) setAuthenticated(true);
              else setAuthError('Wrong password');
            }}
            style={{
              width: '100%', padding: '12px',
              background: 'linear-gradient(135deg,#c8a96e,#e8c584)',
              border: 'none', borderRadius: '8px',
              color: '#0e0b08', fontSize: '15px', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Enter Kitchen
          </button>
        </div>
      </div>
    );
  }

  // ── Split orders ──────────────────────────────────────────────────────────────
  const attentionOrders = orders.filter((o) => o.status === 'needs_attention');
  const pendingOrders   = orders.filter((o) => o.status === 'pending');
  const preparingOrders = orders.filter((o) => o.status === 'preparing');
  const readyOrders     = orders.filter((o) => o.status === 'ready');
  const totalActive     = pendingOrders.length + preparingOrders.length + readyOrders.length;

  // Count orders that have at least one flagged item
  const flaggedOrderCount = Object.keys(flaggedItems).filter(
    (id) => flaggedItems[id]?.length > 0 && orders.some((o) => o.id === id)
  ).length;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(200,169,110,0.15); border-radius: 4px; }
        @keyframes pulseBorder {
          0%,100% { border-color: rgba(239,68,68,0.45); }
          50%      { border-color: rgba(239,68,68,0.9); box-shadow: 0 0 0 3px rgba(239,68,68,0.07); }
        }
        @keyframes attBg {
          0%,100% { background: rgba(239,68,68,0.03); }
          50%      { background: rgba(239,68,68,0.08); }
        }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#0a0805', display: 'flex', flexDirection: 'column' }}>

        {/* ── Top bar ── */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid rgba(200,169,110,0.08)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#0e0b08', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <h1 style={{
              color: '#c8a96e', fontFamily: 'Georgia,serif',
              fontSize: '20px', margin: 0,
            }}>
              Kitchen Display
            </h1>
            {totalActive > 0 && (
              <span style={{
                background: 'rgba(200,169,110,0.1)', color: '#c8a96e',
                borderRadius: '20px', padding: '3px 12px',
                fontSize: '14px', fontWeight: 600,
              }}>
                {totalActive} active
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Item flags badge */}
            {flaggedOrderCount > 0 && (
              <span style={{
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.3)',
                borderRadius: '8px', padding: '5px 12px',
                color: '#f59e0b', fontSize: '13px', fontWeight: 600,
              }}>
                ✕ {flaggedOrderCount} item{flaggedOrderCount > 1 ? 's' : ''} flagged
              </span>
            )}
            {/* Whole-order attention badge */}
            {attentionOrders.length > 0 && (
              <span style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.35)',
                borderRadius: '8px', padding: '5px 12px',
                color: '#ef4444', fontSize: '13px', fontWeight: 600,
                animation: 'pulseBorder 1.6s ease-in-out infinite',
              }}>
                ⚠️ {attentionOrders.length} need{attentionOrders.length > 1 ? '' : 's'} waiter
              </span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: connected ? '#22c55e' : '#ef4444',
                boxShadow: connected ? '0 0 6px rgba(34,197,94,0.5)' : 'none',
              }} />
              <span style={{ color: '#6b5c47', fontSize: '13px' }}>
                {connected ? 'Live' : 'Reconnecting…'}
              </span>
            </div>
          </div>
        </div>

        {/* ── Attention strip — only for whole-order escalations ── */}
        {attentionOrders.length > 0 && (
          <div style={{
            margin: '14px 20px 0',
            background: 'rgba(239,68,68,0.04)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '12px', padding: '14px 16px',
            animation: 'attBg 2s ease-in-out infinite',
          }}>
            <p style={{
              color: '#ef4444', fontFamily: 'Georgia,serif',
              fontSize: '15px', fontWeight: 600, margin: '0 0 12px',
            }}>
              ⚠️ Waiter Required — {attentionOrders.length} table{attentionOrders.length > 1 ? 's' : ''}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {attentionOrders.map((order) => (
                <div key={order.id} style={{ minWidth: '260px', maxWidth: '360px', flex: '1' }}>
                  <OrderCard
                    order={order}
                    flaggedItems={flaggedItems[order.id] ?? []}
                    onStatusChange={handleStatusChange}
                    onOpenFlagModal={(o) => setFlagTarget(o)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Kanban columns ── */}
        <div style={{
          flex: 1, display: 'flex', gap: '14px',
          padding: '16px 20px 20px',
          overflow: 'hidden', alignItems: 'flex-start',
        }}>
          <Column
            title="New Orders"   accentColor="#c8a96e"
            orders={pendingOrders}
            flaggedItems={flaggedItems}
            onStatusChange={handleStatusChange}
            onOpenFlagModal={(o) => setFlagTarget(o)}
          />
          <Column
            title="Preparing"    accentColor="#e8c584"
            orders={preparingOrders}
            flaggedItems={flaggedItems}
            onStatusChange={handleStatusChange}
            onOpenFlagModal={(o) => setFlagTarget(o)}
          />
          <Column
            title="Ready"        accentColor="#22c55e"
            orders={readyOrders}
            flaggedItems={flaggedItems}
            onStatusChange={handleStatusChange}
            onOpenFlagModal={(o) => setFlagTarget(o)}
          />
        </div>
      </div>

      {/* Item flag modal */}
      {flagTarget && (
        <ItemFlagModal
          order={flagTarget}
          onFlagItem={handleFlagItem}
          onEscalate={handleEscalate}
          onClose={() => setFlagTarget(null)}
        />
      )}
    </>
  );
}
