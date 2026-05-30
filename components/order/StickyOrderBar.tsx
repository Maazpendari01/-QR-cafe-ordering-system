'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

const STATUS_LABEL: Record<string, string> = {
  pending:   'Order Placed',
  preparing: 'Preparing',
  ready:     'Ready!',
  served:    'Served',
}

const STATUS_COLOR: Record<string, string> = {
  pending:   '#f59e0b',
  preparing: '#60a5fa',
  ready:     '#22c55e',
  served:    '#6b5c47',
}

interface OrderInfo {
  id:           string
  status:       string
  total_amount: number
  order_items:  { name: string; quantity: number }[]
  created_at:   string
}

export default function StickyOrderBar() {
  const params  = useParams()
  const tableId = params?.tableId as string

  const [orders,   setOrders]   = useState<OrderInfo[]>([])
  const [expanded, setExpanded] = useState(false)

  const storageKey = `cafe_orders_${tableId}`

  const fetchOrders = useCallback(async () => {
    if (!tableId) return
    const stored = JSON.parse(localStorage.getItem(storageKey) || '[]') as string[]
    if (!stored.length) { setOrders([]); return }

    try {
      const results = await Promise.all(
        stored.map(id =>
          fetch(`${API_URL}/api/orders/${id}`).then(r => r.json())
        )
      )
      const fetched: OrderInfo[] = results
        .filter(r => r.success && r.data)
        .map(r => r.data)

      setOrders(fetched)

      // Auto-clean served orders from localStorage after 5 minutes
      const servedIds = fetched.filter(o => o.status === 'served').map(o => o.id)
      if (servedIds.length) {
        setTimeout(() => {
          const current = JSON.parse(localStorage.getItem(storageKey) || '[]') as string[]
          localStorage.setItem(storageKey, JSON.stringify(
            current.filter(id => !servedIds.includes(id))
          ))
        }, 5 * 60 * 1000)
      }
    } catch {
      // fail silently — don't break the menu page
    }
  }, [tableId, storageKey])

  // Poll every 20 seconds
  useEffect(() => {
    fetchOrders()
    const interval = setInterval(fetchOrders, 20000)
    return () => clearInterval(interval)
  }, [fetchOrders])

  // Listen for new order placed event from CartDrawer
  useEffect(() => {
    const handler = () => { fetchOrders(); setExpanded(true) }
    window.addEventListener('cafe:order_placed', handler)
    return () => window.removeEventListener('cafe:order_placed', handler)
  }, [fetchOrders])

  // Only show active (non-served) orders
  const activeOrders = orders.filter(o => o.status !== 'served')
  if (!activeOrders.length) return null

  const readyCount     = activeOrders.filter(o => o.status === 'ready').length
  const preparingCount = activeOrders.filter(o => o.status === 'preparing').length
  const pendingCount   = activeOrders.filter(o => o.status === 'pending').length

  const dotColor = readyCount > 0 ? '#22c55e' : preparingCount > 0 ? '#60a5fa' : '#f59e0b'

  const summaryParts: string[] = []
  if (pendingCount)   summaryParts.push(`${pendingCount} placed`)
  if (preparingCount) summaryParts.push(`${preparingCount} preparing`)
  if (readyCount)     summaryParts.push(`${readyCount} ready`)

  return (
    <div style={{
      position:   'fixed',
      bottom:     0,
      left:       0,
      right:      0,
      zIndex:     60,
      background: '#1a1410',
      borderTop:  '1px solid rgba(200,169,110,0.2)',
      boxShadow:  '0 -8px 32px rgba(0,0,0,0.5)',
    }}>

      {/* Collapsed bar — always visible */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '13px 20px',
          cursor:         'pointer',
          userSelect:     'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Live pulse dot */}
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: dotColor,
            display: 'inline-block',
            boxShadow: `0 0 8px ${dotColor}`,
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#f5f0e8' }}>
            {activeOrders.length === 1 ? '1 Active Order' : `${activeOrders.length} Active Orders`}
          </span>
          <span style={{ fontSize: 12, color: '#6b5c47' }}>
            · {summaryParts.join(' · ')}
          </span>
        </div>
        <span style={{
          fontSize: 12, fontWeight: 600, color: '#c8a96e',
          flexShrink: 0,
        }}>
          {expanded ? 'Hide ↓' : 'Track ↑'}
        </span>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div style={{
          borderTop: '1px solid rgba(200,169,110,0.08)',
          maxHeight: '55vh',
          overflowY: 'auto',
        }}>
          {activeOrders.map((order, idx) => (
            <div key={order.id} style={{
              padding:      '14px 20px',
              borderBottom: idx < activeOrders.length - 1
                ? '1px solid rgba(200,169,110,0.06)'
                : 'none',
            }}>
              {/* Order header */}
              <div style={{
                display:        'flex',
                justifyContent: 'space-between',
                alignItems:     'center',
                marginBottom:   8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize:   11,
                    color:      '#6b5c47',
                    fontFamily: 'monospace',
                  }}>
                    #{order.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span style={{
                    fontSize:   10,
                    fontWeight: 700,
                    padding:    '2px 8px',
                    borderRadius: 100,
                    background: `${STATUS_COLOR[order.status]}18`,
                    color:      STATUS_COLOR[order.status],
                    border:     `1px solid ${STATUS_COLOR[order.status]}33`,
                  }}>
                    {STATUS_LABEL[order.status] || order.status}
                  </span>
                </div>
                <span style={{
                  fontFamily: 'Georgia,serif',
                  fontSize:   14,
                  color:      '#c8a96e',
                  fontWeight: 700,
                }}>
                  ₹{Number(order.total_amount).toLocaleString('en-IN')}
                </span>
              </div>

              {/* Items list */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {order.order_items?.map((item, i) => (
                  <span key={i} style={{
                    fontSize:     11,
                    color:        '#f5f0e8',
                    background:   'rgba(200,169,110,0.06)',
                    border:       '1px solid rgba(200,169,110,0.10)',
                    borderRadius: 6,
                    padding:      '3px 8px',
                  }}>
                    {item.quantity}× {item.name}
                  </span>
                ))}
              </div>

              {/* Ready callout */}
              {order.status === 'ready' && (
                <div style={{
                  marginTop:    10,
                  padding:      '8px 12px',
                  borderRadius: 10,
                  background:   'rgba(34,197,94,0.08)',
                  border:       '1px solid rgba(34,197,94,0.2)',
                  fontSize:     12,
                  color:        '#22c55e',
                  fontWeight:   600,
                }}>
                  Your order is ready — please collect from the counter
                </div>
              )}
            </div>
          ))}

          {/* Bottom padding for mobile */}
          <div style={{ height: 8 }} />
        </div>
      )}
    </div>
  )
}
