'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Order, OrderStatus } from '@/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: '#f59e0b',
  preparing: '#3b82f6',
  ready: '#22c55e',
  served: '#6b5c47',
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  preparing: 'Preparing',
  ready: 'Ready',
  served: 'Served',
}

export default function OrderHistoryClient() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    fetchOrders()
  }, [filter])

  async function fetchOrders() {
    try {
      setLoading(true)
      const token = localStorage.getItem('cafe_admin_token')
      const url = filter === 'all' 
        ? `${API_URL}/api/orders` 
        : `${API_URL}/api/orders?status=${filter}`
      
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const data = await res.json()
      
      if (data.success) {
        setOrders(data.data || [])
      } else {
        setError(data.error || 'Failed to load orders')
      }
    } catch (err) {
      setError('Failed to load orders')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatCurrency = (amount: number) => {
    return `₹${Number(amount).toFixed(2)}`
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0e0b08', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          border: '2px solid rgba(200,169,110,0.15)',
          borderTopColor: '#c8a96e',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0e0b08' }}>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .order-row { animation: slideUp 0.3s ease both; }
      `}</style>

      {/* Header */}
      <header style={{
        padding: '20px 16px',
        background: '#1a1410',
        borderBottom: '1px solid rgba(200,169,110,0.08)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1 style={{
            fontFamily: 'Georgia, serif',
            fontSize: 22,
            color: '#c8a96e',
            fontWeight: 400,
            margin: 0,
          }}>
            📋 Order History
          </h1>
          <span style={{ fontSize: 12, color: '#6b5c47' }}>
            {orders.length} orders
          </span>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {['all', 'pending', 'preparing', 'ready', 'served'].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              style={{
                padding: '8px 16px',
                borderRadius: 100,
                border: 'none',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                background: filter === status 
                  ? 'linear-gradient(135deg, #c8a96e, #e8c584)' 
                  : 'rgba(200,169,110,0.08)',
                color: filter === status ? '#0e0b08' : 'rgba(240,235,227,0.6)',
                border: filter === status ? 'none' : '1px solid rgba(200,169,110,0.1)',
              }}
            >
              {status === 'all' ? 'All Orders' : STATUS_LABELS[status as OrderStatus]}
            </button>
          ))}
        </div>
      </header>

      {/* Orders List */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && (
          <div style={{
            padding: '16px',
            borderRadius: 12,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#ef4444',
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {orders.length === 0 && !error && (
          <div style={{
            padding: '48px 16px',
            textAlign: 'center',
            color: '#6b5c47',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <p>No orders found</p>
          </div>
        )}

        {orders.map((order, index) => (
          <div
            key={order.id}
            className="order-row"
            style={{
              background: '#1a1410',
              border: '1px solid rgba(200,169,110,0.08)',
              borderRadius: 16,
              padding: '16px',
              animationDelay: `${index * 0.05}s`,
            }}
            onClick={() => router.push(`/order/${order.id}`)}
          >
            {/* Top row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ 
                    fontSize: 11, 
                    fontWeight: 600, 
                    color: '#c8a96e',
                    letterSpacing: '0.05em',
                  }}>
                    #{order.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 100,
                    fontSize: 10,
                    fontWeight: 600,
                    background: `${STATUS_COLORS[order.status as OrderStatus]}15`,
                    color: STATUS_COLORS[order.status as OrderStatus],
                    border: `1px solid ${STATUS_COLORS[order.status as OrderStatus]}30`,
                  }}>
                    {STATUS_LABELS[order.status as OrderStatus]}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: '#6b5c47', margin: 0 }}>
                  {formatDate(order.created_at)}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ 
                  fontSize: 16, 
                  fontWeight: 600, 
                  color: '#f5f0e8', 
                  margin: '0 0 2px',
                  fontFamily: 'Georgia, serif',
                }}>
                  {formatCurrency(order.total_amount)}
                </p>
                <span style={{ 
                  fontSize: 10, 
                  color: order.payment_status === 'paid' ? '#22c55e' : '#f59e0b',
                }}>
                  {order.payment_status === 'paid' ? '✓ Paid' : '◐ Pending'}
                </span>
              </div>
            </div>

            {/* Items preview */}
            {order.order_items && order.order_items.length > 0 && (
              <div style={{ 
                display: 'flex', 
                gap: 8, 
                flexWrap: 'wrap',
                paddingTop: 12,
                borderTop: '1px solid rgba(200,169,110,0.06)',
              }}>
                {order.order_items.slice(0, 3).map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 8px',
                      borderRadius: 8,
                      background: 'rgba(200,169,110,0.05)',
                    }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#c8a96e' }}>
                      {item.quantity}×
                    </span>
                    <span style={{ fontSize: 11, color: 'rgba(240,235,227,0.7)' }}>
                      {item.name}
                    </span>
                  </div>
                ))}
                {order.order_items.length > 3 && (
                  <span style={{ fontSize: 11, color: '#6b5c47', alignSelf: 'center' }}>
                    +{order.order_items.length - 3} more
                  </span>
                )}
              </div>
            )}

            {/* Table info */}
            {order.table_id && (
              <div style={{ 
                marginTop: 12, 
                paddingTop: 12, 
                borderTop: '1px solid rgba(200,169,110,0.06)',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
                color: '#6b5c47',
              }}>
                <span>Table: {order.table_id}</span>
                <span>{order.payment_method || 'N/A'}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}