'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCart } from '@/hooks/useCart'
import { ordersApi, paymentsApi } from '@/lib/api'

interface Props {
  isOpen: boolean
  onClose: () => void
  tableId: string
  tableNumber: string
}

declare global {
  interface Window { Razorpay: any }
}

interface DiscountInfo {
  code?: string
  name?: string
  description: string
  discountAmount: number
  finalTotal: number
}

type PaymentMethod = 'online' | 'cash'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

// Save order ID to localStorage for sticky bar tracking
function saveActiveOrder(tableId: string, orderId: string) {
  const key      = `cafe_orders_${tableId}`
  const existing = JSON.parse(localStorage.getItem(key) || '[]') as string[]
  const updated  = [...existing.filter(id => id !== orderId), orderId]
  localStorage.setItem(key, JSON.stringify(updated))
}

export default function CartDrawer({
  isOpen,
  onClose,
  tableId,
  tableNumber,
}: Props) {
  const router = useRouter()
  const { state, updateQty, clearCart, totalItems, totalPrice } = useCart()
  const [placing, setPlacing] = useState(false)
  const [notes, setNotes] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [error, setError] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('online')

  // Discount state
  const [couponCode, setCouponCode] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponError, setCouponError] = useState('')
  const [discount, setDiscount] = useState<DiscountInfo | null>(null)
  const [autoDiscount, setAutoDiscount] = useState<DiscountInfo | null>(null)

  const activeDiscount = discount || autoDiscount
  const finalTotal = Math.max(
    0,
    totalPrice - (activeDiscount?.discountAmount || 0)
  )

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // Load Razorpay script
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    document.body.appendChild(script)
    return () => {
      if (document.body.contains(script)) document.body.removeChild(script)
    }
  }, [])

  // Check auto discount when total changes
  useEffect(() => {
    if (totalPrice <= 0 || discount) return
    async function checkAutoDiscount() {
      try {
        const res = await fetch(
          `${API_URL}/api/coupons/auto?orderTotal=${totalPrice}`
        )
        const data = await res.json()
        if (data.success && data.data) {
          setAutoDiscount(data.data)
        } else {
          setAutoDiscount(null)
        }
      } catch {}
    }
    checkAutoDiscount()
  }, [totalPrice, discount])

  const applyCoupon = async () => {
    if (!couponCode.trim()) return
    setCouponLoading(true)
    setCouponError('')
    try {
      const res = await fetch(`${API_URL}/api/coupons/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode, orderTotal: totalPrice }),
      })
      const data = await res.json()
      if (data.success) {
        setDiscount(data.data)
        setAutoDiscount(null)
        setCouponError('')
      } else {
        setCouponError(data.error || 'Invalid coupon')
      }
    } catch {
      setCouponError('Failed to apply coupon')
    } finally {
      setCouponLoading(false)
    }
  }

  const removeCoupon = () => {
    setDiscount(null)
    setCouponCode('')
    setCouponError('')
  }

  const formatPrice = (p: number) => `₹${Math.round(p)}`

  // Validation utilities
  const validatePhone = (phone: string): boolean => {
    const phoneRegex = /^[0-9]{10}$/
    return phoneRegex.test(phone.replace(/\D/g, ''))
  }

  const validateEmail = (email: string): boolean => {
    if (!email) return true
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const placeOrder = async () => {
    if (!state.items.length) return

    // Validate phone number
    if (!customerPhone.trim()) {
      setError('Phone number is required')
      return
    }

    if (!validatePhone(customerPhone)) {
      setError('Please enter a valid 10-digit phone number')
      return
    }

    // Validate email if provided
    if (customerEmail && !validateEmail(customerEmail)) {
      setError('Please enter a valid email address')
      return
    }

    setError('')
    setPlacing(true)

    try {
      // Create order in DB
      const orderRes = await ordersApi.create({
        table_id: tableId,
        customer_phone: customerPhone,
        customer_email: customerEmail || undefined,
        note: notes || undefined,
        payment_method: paymentMethod,
        coupon_code: discount?.code || undefined,
        discount_amount: activeDiscount?.discountAmount || 0,
        items: state.items.map((i) => ({
          menu_item_id: i.menuItem.id,
          name: i.menuItem.name,
          price: i.menuItem.price,
          quantity: i.quantity,
        })),
      })

      const order = orderRes.data

      // Cash — skip payment, go back to menu with sticky bar
      if (paymentMethod === 'cash') {
        saveActiveOrder(tableId, order.id)
        clearCart()
        onClose()
        router.push(`/menu/${tableId}`)
        window.dispatchEvent(new Event('cafe:order_placed'))
        return
      }

      // Online — open Razorpay
      const paymentRes = await paymentsApi.create({
        orderId: order.id,
        amount: finalTotal,
      })

      const paymentData = paymentRes.data

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: paymentData.amount,
        currency: 'INR',
        name: 'Brew & Co',
        description: `Order at ${tableNumber}`,
        order_id: paymentData.orderId,
        prefill: {
          email: customerEmail,
          contact: customerPhone,
        },
        theme: { color: '#c8a96e' },
        handler: async (response: any) => {
          const verifyRes = await paymentsApi.verify({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            orderId: order.id,
            customerEmail,
            customerPhone,
            items: state.items.map((i) => ({
              name: i.menuItem.name,
              quantity: i.quantity,
              price: i.menuItem.price,
            })),
            total: finalTotal,
            tableName: tableNumber,
          })

          if (verifyRes.success) {
            saveActiveOrder(tableId, order.id)
            clearCart()
            onClose()
            router.push(`/menu/${tableId}`)
            window.dispatchEvent(new Event('cafe:order_placed'))
          } else {
            setError('Payment verification failed')
            setPlacing(false)
          }
        },
        modal: {
          ondismiss: () => setPlacing(false),
        },
      }

      const razorpayInstance = new window.Razorpay(options)
      razorpayInstance.open()
    } catch (err: any) {
      setError(err.message || 'Failed to place order')
      setPlacing(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'rgba(0,0,0,0.75)' }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl
          max-h-[92vh] flex flex-col transition-transform duration-300 ease-out
          ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
        style={{
          background: '#1a1410',
          border: '1px solid rgba(200,169,110,0.15)',
          borderBottom: 'none',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div
            className="w-10 h-1 rounded-full"
            style={{ background: 'rgba(200,169,110,0.2)' }}
          />
        </div>

        {/* Header */}
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ borderBottom: '1px solid rgba(200,169,110,0.1)' }}
        >
          <div>
            <h2
              className="text-xl font-bold"
              style={{ fontFamily: 'Georgia, serif', color: '#c8a96e' }}
            >
              Your Order
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#6b5c47' }}>
              {tableNumber}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{
              background: '#2a1f14',
              color: '#6b5c47',
              border: '1px solid rgba(200,169,110,0.1)',
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {state.items.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3 opacity-30">🛒</div>
              <p style={{ color: '#6b5c47' }}>Your cart is empty</p>
            </div>
          ) : (
            <>
              {/* Items */}
              {state.items.map(({ menuItem, quantity }) => (
                <div
                  key={menuItem.id}
                  className="flex items-center gap-3 py-2"
                  style={{
                    borderBottom: '1px solid rgba(200,169,110,0.06)',
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: '#f5f0e8' }}
                    >
                      {menuItem.name}
                    </p>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: '#6b5c47' }}
                    >
                      {formatPrice(menuItem.price)} each
                    </p>
                  </div>
                  <div
                    className="flex items-center gap-2 rounded-full px-2 py-1"
                    style={{
                      background: '#2a1f14',
                      border: '1px solid rgba(200,169,110,0.2)',
                    }}
                  >
                    <button
                      onClick={() => updateQty(menuItem.id, quantity - 1)}
                      className="w-6 h-6 flex items-center justify-center font-bold"
                      style={{ color: '#c8a96e' }}
                    >
                      −
                    </button>
                    <span
                      className="text-xs w-4 text-center font-semibold"
                      style={{ color: '#f5f0e8' }}
                    >
                      {quantity}
                    </span>
                    <button
                      onClick={() => updateQty(menuItem.id, quantity + 1)}
                      className="w-6 h-6 flex items-center justify-center font-bold"
                      style={{ color: '#c8a96e' }}
                    >
                      +
                    </button>
                  </div>
                  <span
                    className="text-sm font-semibold w-14 text-right"
                    style={{
                      fontFamily: 'Georgia, serif',
                      color: '#c8a96e',
                    }}
                  >
                    {formatPrice(menuItem.price * quantity)}
                  </span>
                </div>
              ))}

              {/* Auto discount banner */}
              {autoDiscount && !discount && (
                <div
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                  style={{
                    background: 'rgba(34,197,94,0.08)',
                    border: '1px solid rgba(34,197,94,0.2)',
                  }}
                >
                  <span>🎉</span>
                  <div className="flex-1">
                    <p
                      className="text-xs font-semibold"
                      style={{ color: '#22c55e' }}
                    >
                      {autoDiscount.name} applied!
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: '#6b5c47' }}
                    >
                      Saving {formatPrice(autoDiscount.discountAmount)}
                    </p>
                  </div>
                </div>
              )}

              {/* Coupon input */}
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: '#6b5c47' }}
                >
                  Have a coupon?
                </p>
                {discount ? (
                  <div
                    className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                    style={{
                      background: 'rgba(34,197,94,0.08)',
                      border: '1px solid rgba(34,197,94,0.2)',
                    }}
                  >
                    <div>
                      <p
                        className="text-xs font-bold"
                        style={{ color: '#22c55e' }}
                      >
                        {discount.code} applied!
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: '#6b5c47' }}
                      >
                        Saving {formatPrice(discount.discountAmount)}
                      </p>
                    </div>
                    <button
                      onClick={removeCoupon}
                      className="text-xs px-2 py-1 rounded-lg"
                      style={{
                        color: '#ef4444',
                        background: 'rgba(239,68,68,0.1)',
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) =>
                        setCouponCode(e.target.value.toUpperCase())
                      }
                      onKeyDown={(e) =>
                        e.key === 'Enter' && applyCoupon()
                      }
                      placeholder="Enter coupon code"
                      className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none uppercase"
                      style={{
                        background: '#0e0b08',
                        border: '1px solid rgba(200,169,110,0.15)',
                        color: '#f5f0e8',
                      }}
                    />
                    <button
                      onClick={applyCoupon}
                      disabled={couponLoading || !couponCode}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold"
                      style={{
                        background: couponCode ? '#c8a96e' : '#2a1f14',
                        color: couponCode ? '#0e0b08' : '#6b5c47',
                      }}
                    >
                      {couponLoading ? '...' : 'Apply'}
                    </button>
                  </div>
                )}
                {couponError && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: '#ef4444' }}
                  >
                    {couponError}
                  </p>
                )}
              </div>

              {/* Customer details */}
              <div className="space-y-3">
                <p
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: '#6b5c47' }}
                >
                  Your Details
                </p>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Phone number (required) *"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{
                    background: '#0e0b08',
                    border: '1px solid rgba(200,169,110,0.2)',
                    color: '#f5f0e8',
                  }}
                />
                <p style={{ fontSize: 11, color: '#6b5c47', marginTop: -6 }}>
                  Used only to notify you when your order is ready. Never shared with staff.
                </p>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="Email (optional — for receipt)"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{
                    background: '#0e0b08',
                    border: '1px solid rgba(200,169,110,0.2)',
                    color: '#f5f0e8',
                  }}
                />
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special instructions? (optional)"
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
                  style={{
                    background: '#0e0b08',
                    border: '1px solid rgba(200,169,110,0.2)',
                    color: '#f5f0e8',
                  }}
                />
              </div>

              {/* Payment method */}
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-wider mb-2"
                  style={{ color: '#6b5c47' }}
                >
                  Payment Method
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        key: 'online' as PaymentMethod,
                        label: 'Pay Online',
                        sub: 'Cards, UPI, Wallets',
                      },
                      {
                        key: 'cash' as PaymentMethod,
                        label: 'Pay at Counter',
                        sub: 'Cash on delivery',
                      },
                    ] as const
                  ).map((method) => (
                    <button
                      key={method.key}
                      onClick={() => setPaymentMethod(method.key)}
                      className="p-3 rounded-xl text-left transition-all"
                      style={
                        paymentMethod === method.key
                          ? {
                              background: 'rgba(200,169,110,0.15)',
                              border: '1.5px solid #c8a96e',
                            }
                          : {
                              background: '#0e0b08',
                              border: '1px solid rgba(200,169,110,0.1)',
                            }
                      }
                    >
                      <p
                        className="text-sm font-semibold"
                        style={{
                          color:
                            paymentMethod === method.key
                              ? '#c8a96e'
                              : '#f5f0e8',
                        }}
                      >
                        {method.label}
                      </p>
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: '#6b5c47' }}
                      >
                        {method.sub}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {state.items.length > 0 && (
          <div
            className="px-5 pb-8 pt-4 space-y-3"
            style={{ borderTop: '1px solid rgba(200,169,110,0.1)' }}
          >
            {error && (
              <p
                className="text-sm text-center py-2 px-4 rounded-xl"
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  color: '#ef4444',
                }}
              >
                {error}
              </p>
            )}

            {/* Price breakdown */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span style={{ color: '#6b5c47' }}>
                  Subtotal ({totalItems} items)
                </span>
                <span style={{ color: '#f5f0e8' }}>
                  {formatPrice(totalPrice)}
                </span>
              </div>

              {activeDiscount && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#22c55e' }}>
                    Discount{' '}
                    {discount?.code ? `(${discount.code})` : ''}
                  </span>
                  <span style={{ color: '#22c55e' }}>
                    − {formatPrice(activeDiscount.discountAmount)}
                  </span>
                </div>
              )}

              <div
                className="flex justify-between pt-2"
                style={{
                  borderTop: '1px solid rgba(200,169,110,0.1)',
                }}
              >
                <span
                  className="font-semibold"
                  style={{ color: '#f5f0e8' }}
                >
                  Total
                </span>
                <span
                  className="text-2xl font-bold"
                  style={{
                    fontFamily: 'Georgia, serif',
                    color: '#c8a96e',
                  }}
                >
                  {formatPrice(finalTotal)}
                </span>
              </div>
            </div>

            <button
              onClick={placeOrder}
              disabled={placing}
              className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all"
              style={{
                background: placing
                  ? 'rgba(200,169,110,0.4)'
                  : 'linear-gradient(135deg, #c8a96e, #e8c584)',
                color: '#0e0b08',
              }}
            >
              {placing ? (
                <>
                  <span className="w-4 h-4 border-2 border-amber-900/30 border-t-amber-900 rounded-full animate-spin" />
                  Processing...
                </>
              ) : paymentMethod === 'cash' ? (
                `Place Order — ${formatPrice(finalTotal)}`
              ) : (
                `Pay ${formatPrice(finalTotal)}`
              )}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
