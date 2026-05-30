'use client'

import TableQRCard from './TableQRCard'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { menuApi, tablesApi, authApi, ordersApi } from '@/lib/api'
import type { MenuItem, MenuCategory, Table } from '@/types'
import QRCode from 'qrcode'

// ─── QR Code Card ─────────────────────────────────────────────────────────────
function QRCodeCard({ table }: { table: Table }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (canvasRef.current && typeof window !== 'undefined') {
      const url = `${window.location.origin}/menu/${table.id}`
      QRCode.toCanvas(canvasRef.current, url, {
        width: 120, margin: 1,
        color: { dark: '#0e0b08', light: '#ffffff' },
      })
    }
  }, [table.id])

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const url = `${window.location.origin}/menu/${table.id}`
      const dataUrl = await QRCode.toDataURL(url, {
        width: 300, margin: 2,
        color: { dark: '#0e0b08', light: '#ffffff' },
      })
      const link = document.createElement('a')
      link.download = `table-${table.name}-qr.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('Failed to generate QR:', err)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="p-4 rounded-xl text-center" style={{
      background: '#1a1410', border: '1px solid rgba(200,169,110,0.15)',
    }}>
      <p className="text-sm font-semibold mb-2" style={{ color: '#c8a96e' }}>
        Table {table.name}
      </p>
      <canvas ref={canvasRef} className="w-32 h-32 mx-auto mb-3 rounded-lg" />
      <p className="text-xs mb-3 truncate px-2" style={{ color: '#6b5c47' }}>
        /menu/{table.id.slice(0, 8)}...
      </p>
      <div className="flex gap-2 justify-center">
        <button onClick={handleDownload} disabled={downloading}
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{ background: '#c8a96e', color: '#0e0b08' }}>
          {downloading ? '...' : 'Download'}
        </button>
        <button onClick={() => window.open(`${window.location.origin}/menu/${table.id}`, '_blank')}
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{ background: '#2a1f14', color: '#c8a96e', border: '1px solid rgba(200,169,110,0.2)' }}>
          View
        </button>
      </div>
    </div>
  )
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const ST = {
  bg: '#0e0b08',
  surface: '#1a1410',
  hover: '#2a1f14',
  amber: '#c8a96e',
  gold: '#e8c584',
  cream: '#f5f0e8',
  muted: '#6b5c47',
  green: '#22c55e',
  red: '#ef4444',
  blue: '#60a5fa',
  border: 'rgba(200,169,110,0.10)',
  border2: 'rgba(200,169,110,0.06)',
}

const STATUS_CLR: Record<string, string> = {
  pending: '#f59e0b',
  preparing: '#60a5fa',
  ready: '#c8a96e',
  served: '#22c55e',
}
const PAY_CLR: Record<string, string> = {
  paid: '#22c55e',
  pending: '#f59e0b',
  failed: '#ef4444',
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const sfmt = (n: number) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const sfmt2 = (n: number) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const sdate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: true,
})

// ─── Types ────────────────────────────────────────────────────────────────────
interface OTopItem { name: string; quantity: number; revenue: number }
interface ODayRev { date: string; revenue: number; orders: number }
interface OMonthRev { month: string; revenue: number; orders: number }

// ─── computeStats ─────────────────────────────────────────────────────────────
function computeStats(orders: any[]) {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const weekAgo = new Date(now.getTime() - 7 * 86400000)
  const monthAgo = new Date(now.getTime() - 30 * 86400000)
  const paid = orders.filter(o => o.payment_status === 'paid')

  const bucket = (arr: any[]) => ({
    revenue: arr.reduce((s, o) => s + Number(o.total_amount), 0),
    orders: arr.length,
  })

  // Daily last 30
  const dailyMap: Record<string, ODayRev> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10)
    dailyMap[d] = { date: d, revenue: 0, orders: 0 }
  }
  paid.forEach(o => {
    const d = o.created_at?.slice(0, 10)
    if (d && dailyMap[d]) { dailyMap[d].revenue += Number(o.total_amount); dailyMap[d].orders++ }
  })

  // Monthly last 12
  const monthlyMap: Record<string, OMonthRev> = {}
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthlyMap[key] = { month: key, revenue: 0, orders: 0 }
  }
  paid.forEach(o => {
    const key = o.created_at?.slice(0, 7)
    if (key && monthlyMap[key]) { monthlyMap[key].revenue += Number(o.total_amount); monthlyMap[key].orders++ }
  })

  // Top items
  const itemMap: Record<string, { quantity: number; revenue: number }> = {}
  paid.forEach(o => {
    o.order_items?.forEach((item: any) => {
      if (!itemMap[item.name]) itemMap[item.name] = { quantity: 0, revenue: 0 }
      itemMap[item.name].quantity += item.quantity
      itemMap[item.name].revenue += item.price * item.quantity
    })
  })
  const topItems: OTopItem[] = Object.entries(itemMap)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)

  // Payment split
  const online = paid.filter(o => o.payment_method === 'online')
  const cash = paid.filter(o => o.payment_method === 'cash')

  // AOV week-over-week
  const thisWeekPaid = paid.filter(o => new Date(o.created_at) >= weekAgo)
  const prevWeekStart = new Date(now.getTime() - 14 * 86400000)
  const prevWeekPaid = paid.filter(o => {
    const d = new Date(o.created_at)
    return d >= prevWeekStart && d < weekAgo
  })
  const thisWeekAOV = thisWeekPaid.length > 0
    ? thisWeekPaid.reduce((s, o) => s + Number(o.total_amount), 0) / thisWeekPaid.length : 0
  const prevWeekAOV = prevWeekPaid.length > 0
    ? prevWeekPaid.reduce((s, o) => s + Number(o.total_amount), 0) / prevWeekPaid.length : 0
  const allTimeAOV = paid.length > 0
    ? paid.reduce((s, o) => s + Number(o.total_amount), 0) / paid.length : 0
  const aovChange = prevWeekAOV > 0 ? ((thisWeekAOV - prevWeekAOV) / prevWeekAOV) * 100 : null

  return {
    today: bucket(paid.filter(o => o.created_at?.slice(0, 10) === todayStr)),
    week: bucket(paid.filter(o => new Date(o.created_at) >= weekAgo)),
    month: bucket(paid.filter(o => new Date(o.created_at) >= monthAgo)),
    allTime: bucket(paid),
    daily: Object.values(dailyMap),
    monthly: Object.values(monthlyMap),
    topItems,
    online: { count: online.length, rev: online.reduce((s, o) => s + Number(o.total_amount), 0) },
    cash: { count: cash.length, rev: cash.reduce((s, o) => s + Number(o.total_amount), 0) },
    aov: { allTime: allTimeAOV, thisWeek: thisWeekAOV, change: aovChange, basedOn: paid.length },
  }
}

// ─── MiniBar chart ────────────────────────────────────────────────────────────
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function MiniBar({ data, vKey, height = 100, color = ST.amber, fmt }: {
  data: Record<string, any>[]; vKey: string; height?: number; color?: string; fmt?: (v: number) => string
}) {
  const vals = data.map(d => Number(d[vKey]))
  const maxVal = Math.max(...vals, 1)
  const step = Math.ceil(data.length / 6)

  const fmtLabel = (d: Record<string, any>, i: number): string => {
    if (i % step !== 0) return ''
    const raw = String(d.date || d.month || '')
    if (!raw) return ''
    if (raw.length === 7) return MO[parseInt(raw.slice(5, 7), 10) - 1] ?? ''
    const dt = new Date(raw + 'T00:00:00')
    return `${dt.getDate()} ${MO[dt.getMonth()]}`
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height }}>
        {data.map((d, i) => {
          const pct = (Number(d[vKey]) / maxVal) * 100
          const tooltip = `${d.date || d.month || ''}: ${fmt ? fmt(Number(d[vKey])) : d[vKey]}`
          return (
            <div key={i} title={tooltip} style={{
              flex: 1, height: `${Math.max(pct, 2)}%`, minWidth: 2,
              background: pct > 65 ? `linear-gradient(to top,${color},${ST.gold})`
                : pct > 30 ? `${color}bb` : `${color}33`,
              borderRadius: '3px 3px 0 0', cursor: 'default',
            }} />
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 2, marginTop: 8 }}>
        {data.map((d, i) => {
          const label = fmtLabel(d, i)
          return (
            <div key={i} style={{
              flex: 1, fontSize: 10, color: 'rgba(107,92,71,0.85)',
              textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap',
              opacity: label ? 1 : 0,
            }}>{label || '·'}</div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Calendar heatmap ────────────────────────────────────────────────────────
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function CalendarView({ orders }: { orders: any[] }) {
  const now = new Date()
  const [yr, setYr] = useState(now.getFullYear())
  const [mo, setMo] = useState(now.getMonth())
  const [tip, setTip] = useState<{ date: string; revenue: number; orders: number } | null>(null)

  const dayMap = useMemo(() => {
    const m: Record<string, { revenue: number; orders: number }> = {}
    orders.filter(o => o.payment_status === 'paid').forEach(o => {
      const d = o.created_at?.slice(0, 10)
      if (!d) return
      if (!m[d]) m[d] = { revenue: 0, orders: 0 }
      m[d].revenue += Number(o.total_amount)
      m[d].orders += 1
    })
    return m
  }, [orders])

  const monthMax = useMemo(() => {
    const prefix = `${yr}-${String(mo + 1).padStart(2, '0')}`
    return Math.max(1, ...Object.entries(dayMap)
      .filter(([d]) => d.startsWith(prefix))
      .map(([, v]) => v.revenue))
  }, [dayMap, yr, mo])

  const firstDow = (new Date(yr, mo, 1).getDay() + 6) % 7
  const daysInMo = new Date(yr, mo + 1, 0).getDate()
  const todayStr = now.toISOString().slice(0, 10)
  const isNow = yr === now.getFullYear() && mo === now.getMonth()

  const prevMo = () => { const d = new Date(yr, mo - 1); setYr(d.getFullYear()); setMo(d.getMonth()) }
  const nextMo = () => { if (!isNow) { const d = new Date(yr, mo + 1); setYr(d.getFullYear()); setMo(d.getMonth()) } }

  const cells = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMo }, (_, i) => {
      const day = i + 1
      const date = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      return { day, date, ...(dayMap[date] || { revenue: 0, orders: 0 }) }
    }),
  ]

  const cellBg = (rev: number) => {
    if (rev === 0) return 'rgba(200,169,110,0.03)'
    const t = rev / monthMax
    if (t > 0.75) return `linear-gradient(135deg,${ST.amber},${ST.gold})`
    if (t > 0.45) return 'rgba(200,169,110,0.45)'
    if (t > 0.20) return 'rgba(200,169,110,0.22)'
    return 'rgba(200,169,110,0.10)'
  }

  return (
    <div>
      {/* Month navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <button onClick={prevMo} style={{
          width: 28, height: 28, borderRadius: '50%', border: `1px solid ${ST.border}`,
          background: 'transparent', color: ST.muted, cursor: 'pointer', fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>←</button>
        <span style={{ fontFamily: 'Georgia,serif', color: ST.amber, fontSize: 14 }}>
          {MO[mo]} {yr}
        </span>
        <button onClick={nextMo} disabled={isNow} style={{
          width: 28, height: 28, borderRadius: '50%', border: `1px solid ${ST.border}`,
          background: 'transparent',
          color: isNow ? 'rgba(107,92,71,0.3)' : ST.muted,
          cursor: isNow ? 'default' : 'pointer', fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>→</button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 6 }}>
        {DOW.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, color: ST.muted, fontWeight: 600 }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
        {cells.map((cell, i) => {
          if (!cell) return <div key={`e-${i}`} style={{ aspectRatio: '1' }} />
          const bright = cell.revenue / monthMax > 0.75
          const isToday = cell.date === todayStr
          return (
            <div key={cell.date}
              onMouseEnter={() => cell.revenue > 0 ? setTip(cell) : setTip(null)}
              onMouseLeave={() => setTip(null)}
              style={{
                aspectRatio: '1', borderRadius: 8,
                background: cellBg(cell.revenue),
                border: isToday
                  ? '1.5px solid rgba(200,169,110,0.7)'
                  : `1px solid rgba(200,169,110,${cell.revenue > 0 ? '0.12' : '0.05'})`,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                cursor: cell.revenue > 0 ? 'pointer' : 'default',
              }}
            >
              <span style={{
                fontSize: 12, fontWeight: 700, lineHeight: 1,
                color: bright ? '#0e0b08' : ST.cream,
              }}>{cell.day}</span>
              {cell.orders > 0 && (
                <span style={{
                  fontSize: 8, marginTop: 2,
                  color: bright ? 'rgba(14,11,8,0.6)' : 'rgba(245,240,232,0.45)',
                }}>{cell.orders}</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Hover detail */}
      {tip && (
        <div style={{
          marginTop: 12, padding: '10px 14px', borderRadius: 10,
          background: 'rgba(200,169,110,0.07)', border: `1px solid ${ST.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, color: ST.muted }}>
            {new Date(tip.date + 'T00:00:00').toLocaleDateString('en-IN', {
              weekday: 'short', day: 'numeric', month: 'short',
            })}
          </span>
          <div style={{ display: 'flex', gap: 16 }}>
            <span style={{ fontSize: 12, color: ST.cream }}>{tip.orders} orders</span>
            <span style={{ fontFamily: 'Georgia,serif', fontSize: 13, color: ST.amber }}>{sfmt(tip.revenue)}</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 14, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 10, color: ST.muted }}>No orders</span>
        {[0.03, 0.10, 0.22, 0.45, 1].map((v, i) => (
          <div key={i} style={{
            width: 12, height: 12, borderRadius: 3,
            background: v === 1
              ? `linear-gradient(135deg,${ST.amber},${ST.gold})`
              : `rgba(200,169,110,${v})`,
          }} />
        ))}
        <span style={{ fontSize: 10, color: ST.muted }}>Peak</span>
      </div>
    </div>
  )
}

// ─── Order detail modal ───────────────────────────────────────────────────────
function OModal({ order, onClose }: { order: any; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(14,11,8,0.88)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: ST.surface, border: `1px solid ${ST.border}`,
        borderRadius: 24, padding: 28, maxWidth: 440, width: '100%',
        maxHeight: '82vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <p style={{ fontSize: 10, color: ST.muted, letterSpacing: '0.1em', marginBottom: 4 }}>ORDER DETAIL</p>
            <h3 style={{ fontFamily: 'Georgia,serif', color: ST.amber, fontSize: 16, margin: 0 }}>
              #{order.id.slice(0, 8).toUpperCase()}
            </h3>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(200,169,110,0.08)', border: `1px solid ${ST.border}`,
            color: ST.muted, cursor: 'pointer', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
          {[
            ['Table', order.table_name || '—'],
            ['Date', sdate(order.created_at)],
            ['Status', order.status],
            ['Payment', `${order.payment_method?.toUpperCase()} · ${order.payment_status?.toUpperCase()}`],
            ...(order.customer_phone ? [['Phone', order.customer_phone]] : []),
            ...(order.customer_email ? [['Email', order.customer_email]] : []),
          ].map(([k, v], i) => (
            <div key={i} style={{
              background: 'rgba(200,169,110,0.04)', border: `1px solid ${ST.border2}`,
              borderRadius: 10, padding: '9px 12px',
            }}>
              <div style={{ fontSize: 10, color: ST.muted, marginBottom: 2 }}>{k}</div>
              <div style={{ fontSize: 12, color: ST.cream }}>{v as string}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 10, color: ST.muted, letterSpacing: '0.08em', marginBottom: 8 }}>ITEMS</p>
        {order.order_items?.map((item: any, i: number) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '7px 0',
            borderBottom: i < order.order_items.length - 1 ? `1px solid ${ST.border2}` : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, color: '#0e0b08',
                background: `linear-gradient(135deg,${ST.amber},${ST.gold})`,
                borderRadius: 4, padding: '1px 6px',
              }}>{item.quantity}×</span>
              <span style={{ fontSize: 13, color: ST.cream }}>{item.name}</span>
            </div>
            <span style={{ fontSize: 13, color: ST.muted }}>{sfmt2(item.price * item.quantity)}</span>
          </div>
        ))}
        {order.note && (
          <div style={{
            fontSize: 12, color: ST.muted, marginTop: 12,
            background: 'rgba(200,169,110,0.04)', border: `1px solid ${ST.border2}`,
            borderRadius: 10, padding: '9px 12px',
          }}>Note: {order.note}</div>
        )}
        {Number(order.discount_amount) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            <span style={{ fontSize: 12, color: ST.green }}>
              Discount {order.coupon_code ? `(${order.coupon_code})` : ''}
            </span>
            <span style={{ fontSize: 12, color: ST.green }}>−{sfmt2(Number(order.discount_amount))}</span>
          </div>
        )}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingTop: 14, marginTop: 10, borderTop: `1px solid ${ST.border}`,
        }}>
          <span style={{ fontSize: 14, color: ST.cream, fontWeight: 600 }}>Total</span>
          <span style={{ fontFamily: 'Georgia,serif', fontSize: 22, color: ST.amber }}>
            {sfmt2(Number(order.total_amount))}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────
function OrdersAnalyticsTab({ orders, onRefresh }: { orders: any[]; onRefresh: () => void }) {
  const [view, setView] = useState<'overview' | 'history'>('overview')
  const [chartMode, setChartMode] = useState<'daily' | 'monthly' | 'calendar'>('daily')
  const [itemSort, setItemSort] = useState<'revenue' | 'quantity'>('revenue')
  const [selected, setSelected] = useState<any>(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPayment, setFilterPayment] = useState('all')
  const [filterMethod, setFilterMethod] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const PER = 12

  const s = computeStats(orders)

  const filtered = orders.filter(o => {
    if (filterStatus !== 'all' && o.status !== filterStatus) return false
    if (filterPayment !== 'all' && o.payment_status !== filterPayment) return false
    if (filterMethod !== 'all' && o.payment_method !== filterMethod) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        o.id.toLowerCase().includes(q) ||
        (o.table_name || '').toLowerCase().includes(q) ||
        (o.customer_phone || '').includes(q)
      )
    }
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER))
  const paged = filtered.slice((page - 1) * PER, page * PER)
  const filterKey = `${filterStatus}|${filterPayment}|${filterMethod}|${search}`
  const [prevF, setPrevF] = useState(filterKey)
  if (prevF !== filterKey) { setPage(1); setPrevF(filterKey) }

  const totalPayCount = s.online.count + s.cash.count || 1
  const onlinePct = Math.round((s.online.count / totalPayCount) * 100)
  const cashPct = 100 - onlinePct

  const maxQty = useMemo(() =>
    Math.max(1, ...s.topItems.map(x => x.quantity)), [s.topItems])

  const sortedItems = useMemo(() =>
    [...s.topItems].sort((a, b) =>
      itemSort === 'revenue' ? b.revenue - a.revenue : b.quantity - a.quantity
    ), [s.topItems, itemSort])

  return (
    <div>
      <style>{`
        .ao-btn { transition: all 0.15s ease; }
        .ao-btn:hover { opacity: 0.82; }
        .ao-row { transition: background 0.1s; cursor: pointer; }
        .ao-row:hover { background: rgba(200,169,110,0.05) !important; }
        .kpi-grid    { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; }
        .bottom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 640px) {
          .kpi-grid    { grid-template-columns: repeat(2,1fr); }
          .bottom-grid { grid-template-columns: 1fr; }
        }
        select option { background: #1a1410; color: #f5f0e8; }
      `}</style>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
        {(['overview', 'history'] as const).map(v => (
          <button key={v} className="ao-btn" onClick={() => setView(v)} style={{
            padding: '7px 20px', borderRadius: 100, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
            background: view === v ? `linear-gradient(135deg,${ST.amber},${ST.gold})` : 'rgba(200,169,110,0.07)',
            color: view === v ? '#0e0b08' : ST.muted,
          }}>{v === 'overview' ? 'Overview' : 'History'}</button>
        ))}
        <button onClick={onRefresh} style={{
          marginLeft: 'auto', padding: '7px 14px', borderRadius: 100,
          border: `1px solid ${ST.border}`, background: 'transparent',
          color: ST.muted, fontSize: 11, cursor: 'pointer',
        }}>Refresh</button>
      </div>

      {/* ── OVERVIEW ── */}
      {view === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* KPI cards */}
          <div className="kpi-grid">
            {[
              { label: "Today's Revenue", val: sfmt(s.today.revenue), sub: `${s.today.orders} orders`, accent: true },
              { label: 'This Week', val: sfmt(s.week.revenue), sub: `${s.week.orders} orders`, accent: false },
              { label: 'This Month', val: sfmt(s.month.revenue), sub: `${s.month.orders} orders`, accent: false },
              { label: 'All Time', val: sfmt(s.allTime.revenue), sub: `${s.allTime.orders} paid`, accent: false },
            ].map((c, i) => (
              <div key={i} style={{
                background: c.accent
                  ? 'linear-gradient(135deg,rgba(200,169,110,0.12),rgba(232,197,132,0.06))'
                  : ST.surface,
                border: c.accent ? '1px solid rgba(200,169,110,0.25)' : `1px solid ${ST.border}`,
                borderRadius: 16, padding: '18px 20px',
              }}>
                <div style={{
                  fontFamily: 'Georgia,serif', fontSize: 24, fontWeight: 700, marginBottom: 4,
                  color: c.accent ? ST.amber : ST.cream, letterSpacing: '-0.01em',
                }}>{c.val}</div>
                <div style={{ fontSize: 11, color: ST.muted, fontWeight: 500 }}>{c.label}</div>
                <div style={{ fontSize: 10, color: 'rgba(107,92,71,0.6)', marginTop: 3 }}>{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Revenue chart — 3 view modes */}
          <div style={{
            background: ST.surface, border: `1px solid ${ST.border}`,
            borderRadius: 18, padding: '22px 24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{
                fontFamily: 'Georgia,serif', fontSize: 14, color: ST.amber,
                margin: 0, fontWeight: 400, letterSpacing: '0.02em',
              }}>Revenue</h3>
              <div style={{ display: 'flex', gap: 6 }}>
                {([
                  { key: 'daily', label: '30 Days' },
                  { key: 'monthly', label: '12 Months' },
                  { key: 'calendar', label: 'Calendar' },
                ] as const).map(m => (
                  <button key={m.key} className="ao-btn" onClick={() => setChartMode(m.key)} style={{
                    padding: '4px 12px', borderRadius: 100, border: 'none', fontSize: 11, fontWeight: 600,
                    background: chartMode === m.key
                      ? `linear-gradient(135deg,${ST.amber},${ST.gold})`
                      : 'rgba(200,169,110,0.07)',
                    color: chartMode === m.key ? '#0e0b08' : ST.muted,
                    cursor: 'pointer',
                  }}>{m.label}</button>
                ))}
              </div>
            </div>
            {chartMode === 'calendar' ? (
              <CalendarView orders={orders} />
            ) : (
              <MiniBar
                data={chartMode === 'daily' ? s.daily : s.monthly}
                vKey="revenue"
                height={110}
                color={chartMode === 'daily' ? ST.amber : ST.blue}
                fmt={v => sfmt(v)}
              />
            )}
          </div>

          {/* Bottom 2-col */}
          <div className="bottom-grid">

            {/* Top Items with Revenue / Quantity toggle */}
            <div style={{
              background: ST.surface, border: `1px solid ${ST.border}`,
              borderRadius: 18, padding: '20px 22px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <h3 style={{
                    fontFamily: 'Georgia,serif', fontSize: 14, color: ST.amber,
                    margin: '0 0 3px', fontWeight: 400,
                  }}>Top Items</h3>
                  <p style={{ fontSize: 10, color: 'rgba(107,92,71,0.55)', margin: 0 }}>
                    Ranked by {itemSort}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['revenue', 'quantity'] as const).map(mode => (
                    <button key={mode} className="ao-btn" onClick={() => setItemSort(mode)} style={{
                      padding: '3px 10px', borderRadius: 100, border: 'none',
                      fontSize: 10, fontWeight: 600, cursor: 'pointer',
                      background: itemSort === mode
                        ? `linear-gradient(135deg,${ST.amber},${ST.gold})`
                        : 'rgba(200,169,110,0.07)',
                      color: itemSort === mode ? '#0e0b08' : ST.muted,
                    }}>{mode === 'revenue' ? '₹ Rev' : '# Qty'}</button>
                  ))}
                </div>
              </div>

              {sortedItems.length === 0 ? (
                <p style={{ color: ST.muted, fontSize: 12 }}>No data yet</p>
              ) : sortedItems.map((item, i) => {
                const barPct = itemSort === 'revenue'
                  ? (item.revenue / sortedItems[0].revenue) * 100
                  : (item.quantity / maxQty) * 100
                return (
                  <div key={item.name} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, borderRadius: 4,
                          padding: '2px 6px', fontFamily: 'monospace', letterSpacing: '0.05em',
                          background: i === 0 ? `linear-gradient(135deg,${ST.amber},${ST.gold})` : 'rgba(107,92,71,0.12)',
                          color: i === 0 ? '#0e0b08' : ST.muted,
                        }}>{String(i + 1).padStart(2, '0')}</span>
                        <span style={{ fontSize: 13, color: ST.cream }}>{item.name}</span>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 13, color: ST.amber, fontFamily: 'Georgia,serif' }}>
                          {itemSort === 'revenue' ? sfmt(item.revenue) : `${item.quantity} sold`}
                        </div>
                        <div style={{ fontSize: 10, color: ST.muted }}>
                          {itemSort === 'revenue' ? `${item.quantity} sold` : sfmt(item.revenue)}
                        </div>
                      </div>
                    </div>
                    <div style={{ height: 4, borderRadius: 100, background: 'rgba(200,169,110,0.08)' }}>
                      <div style={{
                        height: '100%', borderRadius: 100, width: `${barPct}%`,
                        background: i === 0
                          ? `linear-gradient(90deg,${ST.amber},${ST.gold})`
                          : `rgba(200,169,110,${Math.max(0.15, 0.40 - i * 0.04)})`,
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Right col: Payment Split + AOV */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Payment Split */}
              <div style={{
                background: ST.surface, border: `1px solid ${ST.border}`,
                borderRadius: 18, padding: '20px 22px',
              }}>
                <h3 style={{
                  fontFamily: 'Georgia,serif', fontSize: 14, color: ST.amber,
                  margin: '0 0 14px', fontWeight: 400,
                }}>Payment Split</h3>

                {/* Split bar */}
                <div style={{
                  height: 5, borderRadius: 100, overflow: 'hidden',
                  background: 'rgba(200,169,110,0.08)', marginBottom: 14, display: 'flex',
                }}>
                  {onlinePct > 0 && <div style={{ width: `${onlinePct}%`, background: ST.blue }} />}
                  {cashPct > 0 && <div style={{ width: `${cashPct}%`, background: ST.amber }} />}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{
                    background: 'rgba(96,165,250,0.05)',
                    border: '1px solid rgba(96,165,250,0.12)',
                    borderRadius: 12, padding: '14px 16px',
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: ST.blue, marginBottom: 6 }}>
                      ONLINE · {onlinePct}%
                    </div>
                    <div style={{ fontFamily: 'Georgia,serif', fontSize: 20, color: ST.cream, fontWeight: 700, marginBottom: 2 }}>
                      {sfmt(s.online.rev)}
                    </div>
                    <div style={{ fontSize: 11, color: ST.muted }}>{s.online.count} order{s.online.count !== 1 ? 's' : ''}</div>
                  </div>
                  <div style={{
                    background: 'rgba(200,169,110,0.05)',
                    border: '1px solid rgba(200,169,110,0.15)',
                    borderRadius: 12, padding: '14px 16px',
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: ST.amber, marginBottom: 6 }}>
                      CASH · {cashPct}%
                    </div>
                    <div style={{ fontFamily: 'Georgia,serif', fontSize: 20, color: ST.cream, fontWeight: 700, marginBottom: 2 }}>
                      {sfmt(s.cash.rev)}
                    </div>
                    <div style={{ fontSize: 11, color: ST.muted }}>{s.cash.count} order{s.cash.count !== 1 ? 's' : ''}</div>
                  </div>
                </div>
              </div>

              {/* AOV */}
              <div style={{
                background: ST.surface, border: `1px solid ${ST.border}`,
                borderRadius: 18, padding: '20px 22px', flex: 1,
              }}>
                <h3 style={{
                  fontFamily: 'Georgia,serif', fontSize: 14, color: ST.amber,
                  margin: '0 0 12px', fontWeight: 400,
                }}>Avg. Order Value</h3>

                <div style={{
                  fontFamily: 'Georgia,serif', fontSize: 36, color: ST.cream,
                  fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8, lineHeight: 1,
                }}>{sfmt(s.aov.allTime)}</div>

                {s.aov.change !== null ? (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 12, fontWeight: 600,
                    color: s.aov.change >= 0 ? ST.green : ST.red,
                    background: s.aov.change >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${s.aov.change >= 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                    borderRadius: 100, padding: '3px 10px', marginBottom: 10,
                  }}>
                    {s.aov.change >= 0 ? '▲' : '▼'}
                    {Math.abs(s.aov.change).toFixed(1)}% vs last week
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: ST.muted, marginBottom: 10 }}>
                    Not enough data for comparison
                  </div>
                )}

                <div style={{ fontSize: 11, color: 'rgba(107,92,71,0.65)' }}>
                  Based on {s.aov.basedOn} paid order{s.aov.basedOn !== 1 ? 's' : ''}
                </div>

                {s.aov.thisWeek > 0 && (
                  <div style={{
                    marginTop: 14, paddingTop: 14, borderTop: `1px solid ${ST.border2}`,
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                  }}>
                    <div>
                      <div style={{ fontSize: 10, color: ST.muted, marginBottom: 3 }}>This week</div>
                      <div style={{ fontSize: 15, fontFamily: 'Georgia,serif', color: ST.amber }}>
                        {sfmt(s.aov.thisWeek)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: ST.muted, marginBottom: 3 }}>All time</div>
                      <div style={{ fontSize: 15, fontFamily: 'Georgia,serif', color: ST.cream }}>
                        {sfmt(s.aov.allTime)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY ── */}
      {view === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Filters */}
          <div style={{
            background: ST.surface, border: `1px solid ${ST.border}`,
            borderRadius: 14, padding: '14px 18px',
            display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
          }}>
            <input
              placeholder="Order ID, table, phone..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{
                flex: '1 1 180px', padding: '7px 10px',
                background: 'rgba(200,169,110,0.05)', border: `1px solid ${ST.border}`,
                borderRadius: 10, color: ST.cream, fontSize: 12, outline: 'none',
              }}
            />
            {[
              { val: filterStatus, set: setFilterStatus, opts: [['all', 'All Status'], ['pending', 'Pending'], ['preparing', 'Preparing'], ['ready', 'Ready'], ['served', 'Served']] },
              { val: filterPayment, set: setFilterPayment, opts: [['all', 'All Payments'], ['paid', 'Paid'], ['pending', 'Unpaid'], ['failed', 'Failed']] },
              { val: filterMethod, set: setFilterMethod, opts: [['all', 'All Methods'], ['online', 'Online'], ['cash', 'Cash']] },
            ].map((f, i) => (
              <select key={i} value={f.val} onChange={e => f.set(e.target.value)} style={{
                padding: '7px 10px', borderRadius: 10,
                background: 'rgba(200,169,110,0.05)', border: `1px solid ${ST.border}`,
                color: ST.cream, fontSize: 12, cursor: 'pointer',
              }}>
                {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ))}
            <span style={{ fontSize: 11, color: ST.muted, marginLeft: 'auto' }}>
              {filtered.length} orders
            </span>
          </div>

          {/* Filtered summary */}
          {filtered.length > 0 && (() => {
            const pf = filtered.filter(o => o.payment_status === 'paid')
            const rev = pf.reduce((sum, o) => sum + Number(o.total_amount), 0)
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                {[
                  { label: 'Filtered Revenue', val: sfmt(rev) },
                  { label: 'Avg Order Value', val: sfmt(pf.length ? rev / pf.length : 0) },
                  { label: 'Paid / Total', val: `${pf.length} / ${filtered.length}` },
                ].map((x, i) => (
                  <div key={i} style={{
                    background: ST.surface, border: `1px solid ${ST.border}`,
                    borderRadius: 12, padding: '12px 16px',
                  }}>
                    <div style={{ fontFamily: 'Georgia,serif', fontSize: 18, color: ST.cream, marginBottom: 2 }}>{x.val}</div>
                    <div style={{ fontSize: 11, color: ST.muted }}>{x.label}</div>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Orders table */}
          <div style={{ background: ST.surface, border: `1px solid ${ST.border}`, borderRadius: 18, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 600 }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '110px 90px 90px 100px 80px 90px 1fr',
                  padding: '10px 18px', borderBottom: `1px solid ${ST.border}`, gap: 8,
                }}>
                  {['Order ID', 'Table', 'Status', 'Payment', 'Method', 'Amount', 'Date'].map(h => (
                    <div key={h} style={{ fontSize: 10, color: ST.muted, letterSpacing: '0.07em', fontWeight: 600 }}>
                      {h.toUpperCase()}
                    </div>
                  ))}
                </div>
                {paged.length === 0 ? (
                  <div style={{ padding: '40px 18px', textAlign: 'center', color: ST.muted, fontSize: 13 }}>
                    No orders match your filters
                  </div>
                ) : paged.map((o: any, i: number) => (
                  <div key={o.id} className="ao-row" onClick={() => setSelected(o)} style={{
                    display: 'grid', gridTemplateColumns: '110px 90px 90px 100px 80px 90px 1fr',
                    padding: '11px 18px', gap: 8, alignItems: 'center',
                    borderBottom: i < paged.length - 1 ? `1px solid ${ST.border2}` : 'none',
                    background: 'transparent',
                  }}>
                    <div style={{ fontSize: 12, color: ST.amber, fontFamily: 'monospace' }}>
                      #{o.id.slice(0, 8).toUpperCase()}
                    </div>
                    <div style={{ fontSize: 12, color: ST.cream }}>{o.table_name || '—'}</div>
                    <div>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
                        background: `${STATUS_CLR[o.status]}18`, color: STATUS_CLR[o.status],
                        border: `1px solid ${STATUS_CLR[o.status]}33`, textTransform: 'capitalize',
                      }}>{o.status}</span>
                    </div>
                    <div>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
                        background: `${PAY_CLR[o.payment_status]}18`, color: PAY_CLR[o.payment_status],
                        border: `1px solid ${PAY_CLR[o.payment_status]}33`, textTransform: 'capitalize',
                      }}>{o.payment_status}</span>
                    </div>
                    <div style={{ fontSize: 11, color: ST.muted, textTransform: 'uppercase' }}>{o.payment_method}</div>
                    <div style={{ fontFamily: 'Georgia,serif', fontSize: 14, color: ST.cream }}>{sfmt2(Number(o.total_amount))}</div>
                    <div style={{ fontSize: 11, color: ST.muted }}>
                      {new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      {' '}
                      {new Date(o.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{
                width: 30, height: 30, borderRadius: '50%', border: `1px solid ${ST.border}`,
                background: 'transparent', color: page === 1 ? ST.muted : ST.cream,
                cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
              }}>←</button>
              <span style={{ fontSize: 12, color: ST.muted }}>
                Page <span style={{ color: ST.cream }}>{page}</span> of {totalPages}
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{
                width: 30, height: 30, borderRadius: '50%', border: `1px solid ${ST.border}`,
                background: 'transparent', color: page === totalPages ? ST.muted : ST.cream,
                cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
              }}>→</button>
            </div>
          )}
        </div>
      )}

      {selected && <OModal order={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

// ─── Tab type ─────────────────────────────────────────────────────────────────
type Tab = 'menu' | 'categories' | 'tables' | 'qrcode' | 'offers' | 'orders' | 'analytics'

// ─── Main AdminClient ─────────────────────────────────────────────────────────
export default function AdminClient() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('orders')
  const [loading, setLoading] = useState(true)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [tables, setTables] = useState<Table[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [qrTable, setQrTable] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('cafe_admin_token')
    if (!token) { router.push('/admin/login'); return }
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [menuRes, tablesRes, ordersRes, catRes] = await Promise.all([
        menuApi.getItems(), tablesApi.getAllAdmin(), ordersApi.getAll(), menuApi.getCategories(),
      ])
      setMenuItems(menuRes.data || [])
      setCategories(catRes.data || [])
      setTables(tablesRes.data || [])
      setOrders(ordersRes.data || [])
    } catch (err: any) {
      if (err.message?.includes('Unauthorized')) router.push('/admin/login')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => { authApi.logout(); router.push('/admin/login') }
  const openForm = (item?: any) => { setEditItem(item || null); setForm(item || {}); setShowForm(true); setError('') }
  const closeForm = () => { setShowForm(false); setEditItem(null); setForm({}); setError('') }

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      if (tab === 'menu') {
        editItem?.id ? await menuApi.updateItem(editItem.id, form) : await menuApi.createItem(form)
      } else if (tab === 'categories') {
        editItem?.id ? await menuApi.updateCategory(editItem.id, form) : await menuApi.createCategory(form)
      } else if (tab === 'tables') {
        editItem?.id ? await tablesApi.update(editItem.id, form) : await tablesApi.create(form)
      }
      await loadData(); closeForm()
    } catch (err: any) { setError(err.message || 'Save failed') } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure?')) return
    try {
      if (tab === 'menu') await menuApi.deleteItem(id)
      else if (tab === 'categories') await menuApi.deleteCategory(id)
      else if (tab === 'tables') await tablesApi.delete(id)
      await loadData()
    } catch (err: any) { alert(err.message || 'Delete failed') }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'orders', label: 'Orders & Analytics' },
    { key: 'menu', label: 'Menu Items' },
    { key: 'categories', label: 'Categories' },
    { key: 'tables', label: 'Tables' },
    { key: 'qrcode', label: 'QR Codes' },
    { key: 'offers', label: 'Offers' },
  ]

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0e0b08' }}>
      <div className="w-8 h-8 border-2 rounded-full animate-spin"
        style={{ borderColor: 'rgba(200,169,110,0.2)', borderTopColor: '#c8a96e' }} />
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#0e0b08' }}>

      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between"
        style={{ background: '#1a1410', borderBottom: '1px solid rgba(200,169,110,0.12)' }}>
        <h1 className="text-xl font-bold"
          style={{ fontFamily: 'Georgia, serif', color: '#c8a96e' }}>
          Admin Panel
        </h1>
        <div className="flex items-center gap-3">
          <button onClick={() => window.open('/kitchen', '_blank')}
            className="text-xs px-4 py-2 rounded-full"
            style={{ background: 'rgba(200,169,110,0.1)', color: '#c8a96e', border: '1px solid rgba(200,169,110,0.2)' }}>
            Kitchen
          </button>
          <button onClick={handleLogout}
            className="text-xs px-4 py-2 rounded-full"
            style={{ background: '#2a1f14', color: '#6b5c47', border: '1px solid rgba(200,169,110,0.1)' }}>
            Logout
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="px-6 py-3 flex gap-2 overflow-x-auto"
        style={{ borderBottom: '1px solid rgba(200,169,110,0.08)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0"
            style={tab === t.key
              ? { background: '#c8a96e', color: '#0e0b08' }
              : { background: '#1a1410', color: '#6b5c47', border: '1px solid rgba(200,169,110,0.1)' }
            }>{t.label}</button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold"
            style={{ fontFamily: 'Georgia, serif', color: '#c8a96e' }}>
            {TABS.find(t => t.key === tab)?.label}
          </h2>
          {!['orders', 'analytics', 'qrcode', 'offers'].includes(tab) && (
            <button onClick={() => openForm()}
              className="px-4 py-2 rounded-full text-sm font-semibold"
              style={{ background: 'linear-gradient(135deg,#c8a96e,#e8c584)', color: '#0e0b08' }}>
              + Add New
            </button>
          )}
        </div>

        <div className="space-y-2">

          {/* Orders & Analytics */}
          {tab === 'orders' && (
            <OrdersAnalyticsTab orders={orders} onRefresh={loadData} />
          )}

          {/* Menu Items */}
          {tab === 'menu' && menuItems.map(item => (
            <div key={item.id} className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{ background: '#1a1410', border: '1px solid rgba(200,169,110,0.08)' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ background: item.is_veg ? '#22c55e' : '#ef4444' }} />
                  <p className="text-sm font-semibold truncate" style={{ color: '#f5f0e8' }}>{item.name}</p>
                </div>
                <p className="text-xs mt-0.5 ml-5" style={{ color: '#6b5c47' }}>
                  ₹{item.price} · {item.is_available
                    ? <span style={{ color: '#22c55e' }}>Available</span>
                    : <span style={{ color: '#ef4444' }}>Unavailable</span>}
                </p>
              </div>
              <div className="flex gap-2 ml-4">
                <button onClick={() => openForm(item)} className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: '#2a1f14', color: '#c8a96e', border: '1px solid rgba(200,169,110,0.15)' }}>Edit</button>
                <button onClick={() => handleDelete(item.id)} className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>Delete</button>
              </div>
            </div>
          ))}

          {/* Categories */}
          {tab === 'categories' && categories.map(cat => (
            <div key={cat.id} className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{ background: '#1a1410', border: '1px solid rgba(200,169,110,0.08)' }}>
              <p className="text-sm font-semibold" style={{ color: '#f5f0e8' }}>{cat.name}</p>
              <div className="flex gap-2">
                <button onClick={() => openForm(cat)} className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: '#2a1f14', color: '#c8a96e', border: '1px solid rgba(200,169,110,0.15)' }}>Edit</button>
                <button onClick={() => handleDelete(cat.id)} className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>Delete</button>
              </div>
            </div>
          ))}

          {/* Tables */}
          {tab === 'tables' && tables.map(table => (
            <div key={table.id} className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{ background: '#1a1410', border: '1px solid rgba(200,169,110,0.08)' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: '#f5f0e8' }}>{table.name}</p>
                <p className="text-xs mt-0.5" style={{ color: '#6b5c47' }}>
                  Capacity: {table.capacity} · {table.is_active
                    ? <span style={{ color: '#22c55e' }}>Active</span>
                    : <span style={{ color: '#ef4444' }}>Inactive</span>}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setQrTable({ id: table.id, name: table.name })}
                  style={{
                    background: 'rgba(200,169,110,0.1)', border: '1px solid rgba(200,169,110,0.2)',
                    color: '#c8a96e', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12,
                  }}>QR Code</button>
                <button onClick={() => openForm(table)} className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: '#2a1f14', color: '#c8a96e', border: '1px solid rgba(200,169,110,0.15)' }}>Edit</button>
                <button onClick={() => handleDelete(table.id)} className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>Delete</button>
              </div>
            </div>
          ))}

          {/* QR Codes */}
          {tab === 'qrcode' && (
            <div>
              <p className="text-sm mb-4" style={{ color: '#6b5c47' }}>
                Scan at your table to open the menu.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {tables.filter(t => t.is_active).map(table => (
                  <QRCodeCard key={table.id} table={table} />
                ))}
              </div>
              {tables.filter(t => t.is_active).length === 0 && (
                <p className="text-center py-8" style={{ color: '#6b5c47' }}>No active tables.</p>
              )}
            </div>
          )}

          {/* Offers */}
          {tab === 'offers' && (
            <div className="p-6 rounded-xl text-center"
              style={{ background: '#1a1410', border: '1px solid rgba(200,169,110,0.08)' }}>
              <p className="text-sm" style={{ color: '#6b5c47' }}>Offers management coming soon.</p>
            </div>
          )}
        </div>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.8)' }} onClick={closeForm}>
          <div className="w-full max-w-md rounded-3xl p-6 space-y-4"
            style={{ background: '#1a1410', border: '1px solid rgba(200,169,110,0.15)' }}
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold"
              style={{ fontFamily: 'Georgia,serif', color: '#c8a96e' }}>
              {editItem ? 'Edit' : 'Add'} {tab === 'menu' ? 'Item' : tab === 'categories' ? 'Category' : 'Table'}
            </h3>

            {tab === 'menu' && (
              <div className="space-y-3">
                {[
                  { key: 'name', label: 'Name', type: 'text' },
                  { key: 'description', label: 'Description', type: 'text' },
                  { key: 'price', label: 'Price (₹)', type: 'number' },
                  { key: 'image_url', label: 'Image URL', type: 'text' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: '#6b5c47' }}>{f.label}</label>
                    <input type={f.type} value={form[f.key] || ''}
                      onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: '#0e0b08', border: '1px solid rgba(200,169,110,0.15)', color: '#f5f0e8' }} />
                  </div>
                ))}
                <div>
                  <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: '#6b5c47' }}>Category</label>
                  <select value={form.category_id || ''} onChange={e => setForm({ ...form, category_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                    style={{ background: '#0e0b08', border: '1px solid rgba(200,169,110,0.15)', color: '#f5f0e8' }}>
                    <option value="">Select category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-4">
                  {[
                    { key: 'is_veg', label: 'Vegetarian', def: true },
                    { key: 'is_available', label: 'Available', def: true },
                  ].map(cb => (
                    <label key={cb.key} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form[cb.key] ?? cb.def}
                        onChange={e => setForm({ ...form, [cb.key]: e.target.checked })} />
                      <span className="text-sm" style={{ color: '#f5f0e8' }}>{cb.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {tab === 'categories' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: '#6b5c47' }}>Name</label>
                  <input type="text" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                    style={{ background: '#0e0b08', border: '1px solid rgba(200,169,110,0.15)', color: '#f5f0e8' }} />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: '#6b5c47' }}>
                    Sort Order
                  </label>
                  <input type="number" value={form.sort_order ?? 0}
                    onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                    style={{ background: '#0e0b08', border: '1px solid rgba(200,169,110,0.15)', color: '#f5f0e8' }} />
                  <p style={{ fontSize: 11, color: '#6b5c47', marginTop: 4 }}>
                    Lower number shows first. Set Extras to 99 to push it last.
                  </p>
                </div>
              </div>
            )}

            {tab === 'tables' && (
              <div className="space-y-3">
                {[
                  { key: 'name', label: 'Table Name', type: 'text', cast: (v: string) => v },
                  { key: 'capacity', label: 'Capacity', type: 'number', cast: (v: string) => parseInt(v) },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: '#6b5c47' }}>{f.label}</label>
                    <input type={f.type} value={form[f.key] || ''}
                      onChange={e => setForm({ ...form, [f.key]: f.cast(e.target.value) })}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: '#0e0b08', border: '1px solid rgba(200,169,110,0.15)', color: '#f5f0e8' }} />
                  </div>
                ))}
              </div>
            )}

            {error && (
              <p className="text-sm text-center py-2 px-4 rounded-xl"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={closeForm} className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: '#2a1f14', color: '#6b5c47', border: '1px solid rgba(200,169,110,0.1)' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                style={{
                  background: saving ? 'rgba(200,169,110,0.5)' : 'linear-gradient(135deg,#c8a96e,#e8c584)',
                  color: '#0e0b08',
                }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {qrTable && (
        <TableQRCard tableId={qrTable.id} tableName={qrTable.name} onClose={() => setQrTable(null)} />
      )}
    </div>
  )
}
