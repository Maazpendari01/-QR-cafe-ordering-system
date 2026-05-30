'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const API              = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';
const WAITER_PASSWORD  = 'waiter123';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface WaiterCall {
  id: string;
  table_id: string;
  table_name: string;
  order_id: string | null;
  status: 'pending' | 'acknowledged';
  created_at: string;
}

interface OrderAdjustment {
  id: string;
  original_item_name: string;
  original_item_price: number;
  replacement_item_name: string | null;
  change_type: 'replaced' | 'removed';
  price_difference: number;
  note: string | null;
  resolved: boolean;
}

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: string;
}

interface ReadyOrder {
  id: string;
  table_name: string;
  total_amount: string;
  payment_method: string;
  payment_status: string;
  note: string | null;
  items: OrderItem[];
  adjustments: OrderAdjustment[];
  updated_at: string;
}

// ── NEW: orders still being prepared but with flagged items ──────────────────
interface FlaggedActiveOrder {
  id: string;
  table_name: string;
  status: string;
  total_amount: string;
  payment_method: string;
  note: string | null;
  adjustments: OrderAdjustment[];
  updated_at: string;
}

interface CashOrder {
  id: string;
  table_name: string;
  total_amount: string;
  created_at: string;
}

interface TableStatus {
  id: string;
  name: string;
  current_status: string | null;
  has_call: boolean;
  has_adjustment: boolean;
}

type Tab = 'attention' | 'ready' | 'cash' | 'tables';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

function formatAmount(val: string | number): string {
  return parseFloat(String(val)).toFixed(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// AdjustmentBlock — reusable for both Attention and Ready sections
// ─────────────────────────────────────────────────────────────────────────────

function AdjustmentBlock({ adjustments }: { adjustments: OrderAdjustment[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {adjustments.map((adj) => {
        const diff = parseFloat(String(adj.price_difference));
        return (
          <div
            key={adj.id}
            style={{
              background: 'rgba(245,158,11,0.05)',
              border: '1px solid rgba(245,158,11,0.15)',
              borderRadius: '8px', padding: '10px 12px',
            }}
          >
            <p style={{ color: '#f5f0e8', fontSize: '13px', margin: '0 0 3px' }}>
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>UNAVAIL: </span>
              {adj.original_item_name}
              {adj.change_type === 'replaced' && adj.replacement_item_name && (
                <span style={{ color: '#6b5c47' }}> → replaced with {adj.replacement_item_name}</span>
              )}
              {adj.change_type === 'removed' && (
                <span style={{ color: '#6b5c47' }}> → removed from order</span>
              )}
            </p>
            {diff !== 0 && (
              <p style={{
                color: diff < 0 ? '#22c55e' : '#f59e0b',
                fontSize: '13px', fontWeight: 600, margin: '0 0 3px',
              }}>
                {diff < 0
                  ? `Return ₹${Math.abs(diff).toFixed(2)} to customer`
                  : `Collect ₹${diff.toFixed(2)} from customer`}
              </p>
            )}
            {adj.note && (
              <p style={{ color: '#6b5c47', fontSize: '12px', margin: 0 }}>
                Kitchen note: {adj.note}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Attention
// ─────────────────────────────────────────────────────────────────────────────

interface AttentionSectionProps {
  calls: WaiterCall[];
  readyOrders: ReadyOrder[];
  flaggedActiveOrders: FlaggedActiveOrder[]; // ← NEW
  onAcknowledge: (callId: string) => void;
}

function AttentionSection({
  calls,
  readyOrders,
  flaggedActiveOrders,
  onAcknowledge,
}: AttentionSectionProps) {
  // Adjustments on ready orders (price settlement when serving)
  const readyWithAdjustments = readyOrders.filter(
    (o) => o.adjustments && o.adjustments.length > 0
  );

  const isEmpty =
    calls.length === 0 &&
    readyWithAdjustments.length === 0 &&
    flaggedActiveOrders.length === 0;

  if (isEmpty) {
    return (
      <EmptyState message="No attention required" sub="All tables are being handled" />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* Waiter calls */}
      {calls.map((call) => (
        <div
          key={call.id}
          style={{
            background: '#1a1410',
            border: '1px solid rgba(239,68,68,0.35)',
            borderRadius: '12px',
            padding: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <div>
              <p style={{ color: '#f5f0e8', fontFamily: 'Georgia,serif', fontSize: '18px', margin: '0 0 3px', fontWeight: 600 }}>
                {call.table_name}
              </p>
              <p style={{ color: '#6b5c47', fontSize: '12px', margin: 0 }}>
                {call.order_id ? 'Customer called from order page' : 'Customer called from menu page'}
                {' · '}{timeAgo(call.created_at)} ago
              </p>
            </div>
            <span style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: '20px', padding: '3px 10px',
              color: '#ef4444', fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em',
            }}>
              NEEDS WAITER
            </span>
          </div>
          <button
            onClick={() => onAcknowledge(call.id)}
            style={{
              width: '100%', padding: '11px',
              background: 'rgba(200,169,110,0.1)',
              border: '1px solid rgba(200,169,110,0.25)',
              borderRadius: '8px',
              color: '#c8a96e', fontSize: '14px', fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            On My Way
          </button>
        </div>
      ))}

      {/* ── NEW: flagged items on still-preparing orders ───────────────────── */}
      {flaggedActiveOrders.map((order) => (
        <div
          key={order.id}
          style={{
            background: '#1a1410',
            border: '1px solid rgba(245,158,11,0.35)',
            borderRadius: '12px',
            padding: '16px',
          }}
        >
          <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ color: '#f5f0e8', fontFamily: 'Georgia,serif', fontSize: '18px', margin: '0 0 3px', fontWeight: 600 }}>
                {order.table_name}
              </p>
              <p style={{ color: '#6b5c47', fontSize: '12px', margin: 0 }}>
                Item flagged while order is being prepared
              </p>
            </div>
            <span style={{
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: '20px', padding: '3px 10px',
              color: '#f59e0b', fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              {order.status}
            </span>
          </div>
          <AdjustmentBlock adjustments={order.adjustments} />
        </div>
      ))}

      {/* Adjustments on ready orders */}
      {readyWithAdjustments.map((order) => (
        <div
          key={order.id}
          style={{
            background: '#1a1410',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: '12px',
            padding: '16px',
          }}
        >
          <div style={{ marginBottom: '12px' }}>
            <p style={{ color: '#f5f0e8', fontFamily: 'Georgia,serif', fontSize: '18px', margin: '0 0 3px', fontWeight: 600 }}>
              {order.table_name}
            </p>
            <p style={{ color: '#6b5c47', fontSize: '12px', margin: 0 }}>
              Item adjustment — settle at table when serving
            </p>
          </div>
          <AdjustmentBlock adjustments={order.adjustments} />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Ready to Serve
// ─────────────────────────────────────────────────────────────────────────────

interface ReadySectionProps {
  orders: ReadyOrder[];
  onServed: (orderId: string, adjustmentResolved: boolean) => void;
}

function ReadySection({ orders, onServed }: ReadySectionProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (orders.length === 0) {
    return <EmptyState message="Nothing ready yet" sub="Orders will appear here when the kitchen marks them ready" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {orders.map((order) => {
        const hasAdjustment = order.adjustments && order.adjustments.length > 0;
        const isConfirming  = confirmingId === order.id;
        const totalDiff     = order.adjustments?.reduce(
          (sum, a) => sum + parseFloat(String(a.price_difference)), 0
        ) ?? 0;

        return (
          <div
            key={order.id}
            style={{
              background: '#1a1410',
              border: '1px solid rgba(34,197,94,0.2)',
              borderRadius: '12px',
              padding: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <p style={{ color: '#f5f0e8', fontFamily: 'Georgia,serif', fontSize: '20px', margin: 0, fontWeight: 600 }}>
                {order.table_name}
              </p>
              <span style={{
                background: 'rgba(34,197,94,0.1)',
                border: '1px solid rgba(34,197,94,0.25)',
                borderRadius: '20px', padding: '3px 10px',
                color: '#22c55e', fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em',
              }}>
                READY {timeAgo(order.updated_at)} AGO
              </span>
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.025)',
              borderRadius: '8px', padding: '10px 12px',
              marginBottom: '12px',
              display: 'flex', flexDirection: 'column', gap: '6px',
            }}>
              {order.items?.map((item, idx) => {
                const flagged = order.adjustments?.some(
                  (a) => a.original_item_name === item.name
                );
                return (
                  <div key={item.id ?? idx} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    opacity: flagged ? 0.4 : 1,
                  }}>
                    <span style={{
                      color: '#f5f0e8', fontSize: '15px',
                      textDecoration: flagged ? 'line-through' : 'none',
                    }}>
                      {item.quantity}x {item.name}
                    </span>
                    <span style={{ color: '#6b5c47', fontSize: '14px' }}>
                      ₹{(parseFloat(item.price) * item.quantity).toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '12px',
            }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{
                  background: order.payment_method === 'cash'
                    ? 'rgba(34,197,94,0.1)' : 'rgba(200,169,110,0.1)',
                  color: order.payment_method === 'cash' ? '#22c55e' : '#c8a96e',
                  border: `1px solid ${order.payment_method === 'cash'
                    ? 'rgba(34,197,94,0.2)' : 'rgba(200,169,110,0.2)'}`,
                  borderRadius: '20px', padding: '2px 10px',
                  fontSize: '12px', fontWeight: 500,
                }}>
                  {order.payment_method === 'cash' ? 'Cash' : 'Paid Online'}
                </span>
                {hasAdjustment && totalDiff !== 0 && (
                  <span style={{
                    background: 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.2)',
                    borderRadius: '20px', padding: '2px 10px',
                    color: '#f59e0b', fontSize: '12px', fontWeight: 500,
                  }}>
                    {totalDiff < 0 ? `Return ₹${Math.abs(totalDiff).toFixed(2)}` : `Collect ₹${totalDiff.toFixed(2)}`}
                  </span>
                )}
              </div>
              <span style={{ color: '#c8a96e', fontFamily: 'Georgia,serif', fontSize: '18px', fontWeight: 700 }}>
                ₹{formatAmount(order.total_amount)}
              </span>
            </div>

            {order.note && (
              <div style={{
                background: 'rgba(200,169,110,0.04)',
                border: '1px solid rgba(200,169,110,0.1)',
                borderRadius: '8px', padding: '8px 12px',
                marginBottom: '12px',
                color: '#a89070', fontSize: '13px', lineHeight: 1.5,
              }}>
                Note: {order.note}
              </div>
            )}

            {!isConfirming ? (
              <button
                onClick={() => {
                  if (hasAdjustment && totalDiff !== 0) {
                    setConfirmingId(order.id);
                  } else {
                    onServed(order.id, false);
                  }
                }}
                style={{
                  width: '100%', padding: '13px',
                  background: 'linear-gradient(135deg, #c8a96e, #e8c584)',
                  border: 'none', borderRadius: '8px',
                  color: '#0e0b08', fontSize: '15px', fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'Georgia,serif',
                }}
              >
                Mark Served
              </button>
            ) : (
              <div style={{
                background: 'rgba(245,158,11,0.05)',
                border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: '10px', padding: '14px',
              }}>
                <p style={{ color: '#f5f0e8', fontSize: '14px', fontWeight: 600, margin: '0 0 4px' }}>
                  {totalDiff < 0
                    ? `Was ₹${Math.abs(totalDiff).toFixed(2)} returned to the customer?`
                    : `Was ₹${totalDiff.toFixed(2)} collected from the customer?`}
                </p>
                <p style={{ color: '#6b5c47', fontSize: '13px', margin: '0 0 14px' }}>
                  This will close the adjustment in the admin panel.
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => { setConfirmingId(null); onServed(order.id, true); }}
                    style={{
                      flex: 2, padding: '11px',
                      background: 'linear-gradient(135deg, #c8a96e, #e8c584)',
                      border: 'none', borderRadius: '8px',
                      color: '#0e0b08', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    Yes, Settled
                  </button>
                  <button
                    onClick={() => { setConfirmingId(null); onServed(order.id, false); }}
                    style={{
                      flex: 1, padding: '11px',
                      background: 'transparent',
                      border: '1px solid rgba(200,169,110,0.15)',
                      borderRadius: '8px',
                      color: '#6b5c47', fontSize: '14px', cursor: 'pointer',
                    }}
                  >
                    Not Yet
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Cash Pending
// ─────────────────────────────────────────────────────────────────────────────

interface CashSectionProps {
  orders: CashOrder[];
  onCollected: (orderId: string) => void;
}

function CashSection({ orders, onCollected }: CashSectionProps) {
  if (orders.length === 0) {
    return <EmptyState message="No cash pending" sub="All cash orders have been collected" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {orders.map((order) => (
        <div
          key={order.id}
          style={{
            background: '#1a1410',
            border: '1px solid rgba(200,169,110,0.15)',
            borderRadius: '12px',
            padding: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <p style={{ color: '#f5f0e8', fontFamily: 'Georgia,serif', fontSize: '20px', margin: '0 0 3px', fontWeight: 600 }}>
                {order.table_name}
              </p>
              <p style={{ color: '#6b5c47', fontSize: '12px', margin: 0 }}>
                Order placed {timeAgo(order.created_at)} ago
              </p>
            </div>
            <p style={{ color: '#c8a96e', fontFamily: 'Georgia,serif', fontSize: '22px', fontWeight: 700, margin: 0 }}>
              ₹{formatAmount(order.total_amount)}
            </p>
          </div>
          <button
            onClick={() => onCollected(order.id)}
            style={{
              width: '100%', padding: '12px',
              background: 'rgba(200,169,110,0.1)',
              border: '1px solid rgba(200,169,110,0.25)',
              borderRadius: '8px',
              color: '#c8a96e', fontSize: '14px', fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cash Collected
          </button>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Table Overview
// ─────────────────────────────────────────────────────────────────────────────

const TABLE_STATUS_COLORS: Record<string, string> = {
  pending:          '#c8a96e',
  preparing:        '#e8c584',
  ready:            '#22c55e',
  needs_attention:  '#ef4444',
};

const TABLE_STATUS_LABELS: Record<string, string> = {
  pending:          'Order placed',
  preparing:        'Preparing',
  ready:            'Ready',
  needs_attention:  'Needs waiter',
};

interface TablesSectionProps {
  tables: TableStatus[];
}

function TablesSection({ tables }: TablesSectionProps) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
      gap: '10px',
    }}>
      {tables.map((table) => {
        const isOccupied = Boolean(table.current_status);
        const color      = table.current_status
          ? TABLE_STATUS_COLORS[table.current_status] ?? '#6b5c47'
          : '#2e2820';
        const hasAlert = table.has_call || table.has_adjustment;

        return (
          <div
            key={table.id}
            style={{
              background: '#1a1410',
              border: `1px solid ${hasAlert ? 'rgba(239,68,68,0.35)' : isOccupied ? `${color}30` : 'rgba(200,169,110,0.07)'}`,
              borderRadius: '10px',
              padding: '14px 12px',
              position: 'relative',
            }}
          >
            {hasAlert && (
              <span style={{
                position: 'absolute', top: '8px', right: '8px',
                width: '8px', height: '8px', borderRadius: '50%',
                background: '#ef4444',
                boxShadow: '0 0 5px rgba(239,68,68,0.6)',
              }} />
            )}
            <p style={{
              color: isOccupied ? color : '#3a3025',
              fontFamily: 'Georgia,serif',
              fontSize: '17px', fontWeight: 600, margin: '0 0 5px',
            }}>
              {table.name}
            </p>
            {isOccupied ? (
              <p style={{ color: '#6b5c47', fontSize: '11px', margin: 0, letterSpacing: '0.04em' }}>
                {TABLE_STATUS_LABELS[table.current_status!] ?? table.current_status}
              </p>
            ) : (
              <p style={{ color: '#2e2820', fontSize: '11px', margin: 0 }}>Empty</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({ message, sub }: { message: string; sub: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 16px' }}>
      <p style={{ color: '#3a3025', fontSize: '15px', fontFamily: 'Georgia,serif', margin: '0 0 6px' }}>
        {message}
      </p>
      <p style={{ color: '#2e2820', fontSize: '13px', margin: 0 }}>{sub}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab bar
// ─────────────────────────────────────────────────────────────────────────────

interface TabBarProps {
  active: Tab;
  attentionCount: number;
  readyCount: number;
  cashCount: number;
  onChange: (tab: Tab) => void;
}

function TabBar({ active, attentionCount, readyCount, cashCount, onChange }: TabBarProps) {
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'attention', label: 'Attention', count: attentionCount },
    { key: 'ready',     label: 'Ready',     count: readyCount },
    { key: 'cash',      label: 'Cash',      count: cashCount },
    { key: 'tables',    label: 'Tables' },
  ];

  return (
    <div style={{
      display: 'flex',
      borderBottom: '1px solid rgba(200,169,110,0.08)',
      background: '#0e0b08',
    }}>
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        const hasAlert = tab.key === 'attention' && (tab.count ?? 0) > 0;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              flex: 1, padding: '13px 4px',
              background: 'transparent', border: 'none',
              borderBottom: isActive ? '2px solid #c8a96e' : '2px solid transparent',
              color: isActive ? '#c8a96e' : '#6b5c47',
              fontSize: '13px', fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
              transition: 'color 0.2s ease',
            }}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span style={{
                background: hasAlert ? '#ef4444' : 'rgba(200,169,110,0.2)',
                color: hasAlert ? '#fff' : '#c8a96e',
                borderRadius: '20px',
                padding: '1px 7px',
                fontSize: '12px', fontWeight: 700,
                minWidth: '20px', textAlign: 'center',
              }}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function WaiterClient() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password,      setPassword]      = useState('');
  const [authError,     setAuthError]     = useState('');

  const [calls,               setCalls]               = useState<WaiterCall[]>([]);
  const [readyOrders,         setReadyOrders]         = useState<ReadyOrder[]>([]);
  const [flaggedActiveOrders, setFlaggedActiveOrders] = useState<FlaggedActiveOrder[]>([]); // ← NEW
  const [cashPending,         setCashPending]         = useState<CashOrder[]>([]);
  const [tables,              setTables]              = useState<TableStatus[]>([]);
  const [connected,           setConnected]           = useState(false);
  const [activeTab,           setActiveTab]           = useState<Tab>('attention');
  const [loading,             setLoading]             = useState(true);

  const esRef      = useRef<EventSource | null>(null);
  const retryRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);

  // ── Initial fetch ────────────────────────────────────────────────────────────
  const fetchDashboard = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/api/waiter/dashboard`);
      const json = await res.json();
      if (!json.success) return;
      const { calls, readyOrders, flaggedActiveOrders, cashPending, tables } = json.data;
      setCalls(calls ?? []);
      setReadyOrders(readyOrders ?? []);
      setFlaggedActiveOrders(flaggedActiveOrders ?? []); // ← NEW
      setCashPending(cashPending ?? []);
      setTables(tables ?? []);
    } catch (err) {
      console.error('[waiter dashboard]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── SSE ──────────────────────────────────────────────────────────────────────
  const connectSSE = useCallback(() => {
    esRef.current?.close();
    const es = new EventSource(`${API}/api/waiter/stream`);
    esRef.current = es;

    es.addEventListener('connected', () => {
      setConnected(true);
      retryCount.current = 0;
    });

    es.addEventListener('waiter_call', (e) => {
      try {
        const call: WaiterCall = JSON.parse(e.data);
        setCalls((prev) =>
          prev.some((c) => c.id === call.id) ? prev : [...prev, call]
        );
        setActiveTab('attention');
      } catch { /* ignore */ }
    });

    es.addEventListener('waiter_call_acknowledged', (e) => {
      try {
        const { id } = JSON.parse(e.data);
        setCalls((prev) => prev.filter((c) => c.id !== id));
      } catch { /* ignore */ }
    });

    es.addEventListener('order_status_changed', (e) => {
      try {
        const updated = JSON.parse(e.data);
        if (updated.status === 'ready') {
          fetchDashboard();
          setActiveTab('ready');
        }
        setTables((prev) =>
          prev.map((t) =>
            t.id === updated.table_id
              ? { ...t, current_status: updated.status }
              : t
          )
        );
      } catch { /* ignore */ }
    });

    // ── item_flagged: re-fetch so flaggedActiveOrders updates ───────────────
    es.addEventListener('item_flagged', (e) => {
      try {
        fetchDashboard();
        setActiveTab('attention');
      } catch { /* ignore */ }
    });

    es.addEventListener('new_order', (e) => {
      try {
        const order = JSON.parse(e.data);
        setTables((prev) =>
          prev.map((t) =>
            t.id === order.table_id
              ? { ...t, current_status: 'pending' }
              : t
          )
        );
        if (order.payment_method === 'cash') {
          setCashPending((prev) =>
            prev.some((o) => o.id === order.id)
              ? prev
              : [...prev, {
                  id:           order.id,
                  table_name:   order.table_name,
                  total_amount: order.total_amount,
                  created_at:   order.created_at,
                }]
          );
        }
      } catch { /* ignore */ }
    });

    es.addEventListener('order_served', (e) => {
      try {
        const { id } = JSON.parse(e.data);
        setReadyOrders((prev) => prev.filter((o) => o.id !== id));
        setFlaggedActiveOrders((prev) => prev.filter((o) => o.id !== id)); // ← NEW
      } catch { /* ignore */ }
    });

    es.addEventListener('cash_collected', (e) => {
      try {
        const { id } = JSON.parse(e.data);
        setCashPending((prev) => prev.filter((o) => o.id !== id));
      } catch { /* ignore */ }
    });

    es.onerror = () => {
      setConnected(false);
      esRef.current?.close();
      const delay = Math.min(3000 * Math.pow(2, retryCount.current), 30_000);
      retryCount.current += 1;
      retryRef.current = setTimeout(connectSSE, delay);
    };
  }, [fetchDashboard]);

  useEffect(() => {
    if (!authenticated) return;
    fetchDashboard();
    connectSSE();
    return () => {
      esRef.current?.close();
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [authenticated, connectSSE, fetchDashboard]);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleAcknowledge = async (callId: string) => {
    setCalls((prev) => prev.filter((c) => c.id !== callId));
    try {
      await fetch(`${API}/api/waiter/calls/${callId}/acknowledge`, { method: 'PATCH' });
    } catch (err) {
      console.error('[acknowledge]', err);
    }
  };

  const handleServed = async (orderId: string, adjustmentResolved: boolean) => {
    setReadyOrders((prev) => prev.filter((o) => o.id !== orderId));
    setTables((prev) =>
      prev.map((t) => {
        const order = readyOrders.find((o) => o.id === orderId);
        return order ? { ...t, current_status: null } : t;
      })
    );
    try {
      await fetch(`${API}/api/waiter/orders/${orderId}/served`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjustmentResolved }),
      });
    } catch (err) {
      console.error('[served]', err);
    }
  };

  const handleCashCollected = async (orderId: string) => {
    setCashPending((prev) => prev.filter((o) => o.id !== orderId));
    try {
      await fetch(`${API}/api/waiter/cash/${orderId}/collected`, { method: 'POST' });
    } catch (err) {
      console.error('[cash collected]', err);
    }
  };

  // ── Derived counts ────────────────────────────────────────────────────────────

  const readyWithAdjustments = readyOrders.filter(
    (o) => o.adjustments && o.adjustments.length > 0
  );
  const attentionCount = calls.length + readyWithAdjustments.length + flaggedActiveOrders.length;
  const readyCount     = readyOrders.length;
  const cashCount      = cashPending.length;

  // ── Login screen ──────────────────────────────────────────────────────────────

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
          <h1 style={{ color: '#c8a96e', fontFamily: 'Georgia,serif', fontSize: '24px', margin: '0 0 4px' }}>
            Waiter Display
          </h1>
          <p style={{ color: '#6b5c47', fontSize: '14px', margin: '0 0 28px' }}>Staff access only</p>
          <input
            type="password"
            placeholder="Waiter password"
            value={password}
            autoFocus
            onChange={(e) => { setPassword(e.target.value); setAuthError(''); }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              if (password === WAITER_PASSWORD) setAuthenticated(true);
              else setAuthError('Incorrect password');
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
            <p style={{ color: '#ef4444', fontSize: '13px', margin: '0 0 14px' }}>{authError}</p>
          )}
          <button
            onClick={() => {
              if (password === WAITER_PASSWORD) setAuthenticated(true);
              else setAuthError('Incorrect password');
            }}
            style={{
              width: '100%', padding: '12px',
              background: 'linear-gradient(135deg, #c8a96e, #e8c584)',
              border: 'none', borderRadius: '8px',
              color: '#0e0b08', fontSize: '15px', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Enter
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0e0b08',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%',
            border: '3px solid rgba(200,169,110,0.2)',
            borderTopColor: '#c8a96e', margin: '0 auto 14px',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ color: '#6b5c47', fontSize: '14px' }}>Loading…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(200,169,110,0.12); border-radius: 3px; }
      `}</style>

      <div style={{
        minHeight: '100vh', background: '#0a0805',
        display: 'flex', flexDirection: 'column',
        maxWidth: '480px', margin: '0 auto',
      }}>
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid rgba(200,169,110,0.08)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#0e0b08',
        }}>
          <div>
            <h1 style={{ color: '#c8a96e', fontFamily: 'Georgia,serif', fontSize: '18px', margin: '0 0 1px' }}>
              Brew &amp; Co
            </h1>
            <p style={{ color: '#6b5c47', fontSize: '11px', margin: 0, letterSpacing: '0.1em' }}>WAITER</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: connected ? '#22c55e' : '#f59e0b',
              boxShadow: connected ? '0 0 5px rgba(34,197,94,0.5)' : 'none',
            }} />
            <span style={{ color: '#6b5c47', fontSize: '12px' }}>
              {connected ? 'LIVE' : 'Connecting'}
            </span>
          </div>
        </div>

        <TabBar
          active={activeTab}
          attentionCount={attentionCount}
          readyCount={readyCount}
          cashCount={cashCount}
          onChange={setActiveTab}
        />

        <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
          {activeTab === 'attention' && (
            <AttentionSection
              calls={calls}
              readyOrders={readyOrders}
              flaggedActiveOrders={flaggedActiveOrders}
              onAcknowledge={handleAcknowledge}
            />
          )}
          {activeTab === 'ready' && (
            <ReadySection orders={readyOrders} onServed={handleServed} />
          )}
          {activeTab === 'cash' && (
            <CashSection orders={cashPending} onCollected={handleCashCollected} />
          )}
          {activeTab === 'tables' && (
            <TablesSection tables={tables} />
          )}
        </div>
      </div>
    </>
  );
}
