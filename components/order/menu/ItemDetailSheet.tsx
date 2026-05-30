'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import type { MenuItem } from '@/types'

interface Props {
  item: MenuItem | null
  onClose: () => void
  qty: number
  onAdd: (item: MenuItem) => void
  onUpdateQty: (itemId: string, qty: number) => void
}

const GOLD = '#c8a96e'
const GOLD_LIGHT = '#e8c584'
const BG = '#13100d'
const SURFACE = '#1c1711'
const TEXT_PRIMARY = '#f0ebe3'
const TEXT_SECONDARY = 'rgba(240,235,227,0.45)'

export default function ItemDetailSheet({ item, onClose, qty, onAdd, onUpdateQty }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const isOpen = item !== null

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  if (!item) return null

  return (
    <>
      <style>{`
        @keyframes sheetSlideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes backdropIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .sheet-backdrop { animation: backdropIn 0.25s ease; }
        .sheet-panel { animation: sheetSlideUp 0.35s cubic-bezier(0.22, 1, 0.36, 1); }
        .sheet-qty-btn {
          transition: transform 0.1s ease, background 0.1s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .sheet-qty-btn:active { transform: scale(0.75); background: rgba(200,169,110,0.3) !important; }
        .sheet-add-btn {
          transition: transform 0.15s cubic-bezier(0.34,1.56,0.64,1), opacity 0.15s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .sheet-add-btn:active { transform: scale(0.96); opacity: 0.85; }
      `}</style>

      {/* Backdrop */}
      <div
        className="sheet-backdrop"
        onClick={handleBackdropClick}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.8)',
          zIndex: 60,
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      >
        {/* Sheet */}
        <div
          ref={sheetRef}
          className="sheet-panel"
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: 0, left: 0, right: 0,
            background: '#1a1410',
            borderRadius: '24px 24px 0 0',
            maxHeight: '88vh',
            overflowY: 'auto',
            border: '1px solid rgba(200,169,110,0.12)',
            borderBottom: 'none',
          }}
        >
          {/* Drag handle */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
            <div style={{ width: 36, height: 4, borderRadius: 100, background: 'rgba(200,169,110,0.2)' }} />
          </div>

          {/* Close button — fixed inside sheet, not absolute to viewport */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px 0' }}>
            <button
              onClick={onClose}
              style={{
                width: 30, height: 30,
                borderRadius: '50%',
                background: 'rgba(200,169,110,0.1)',
                border: '1px solid rgba(200,169,110,0.2)',
                color: GOLD, fontSize: 18, lineHeight: '30px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>

          {/* Image — smaller */}
          <div style={{
            margin: '8px 20px 0',
            height: 150,
            borderRadius: 16,
            overflow: 'hidden',
            background: SURFACE,
            border: '1px solid rgba(200,169,110,0.1)',
            position: 'relative',
          }}>
            {item.image_url ? (
              <Image
                src={item.image_url}
                alt={item.name}
                fill
                className="object-cover"
                sizes="(max-width: 480px) 100vw, 440px"
                style={{ opacity: item.is_available ? 1 : 0.4 }}
              />
            ) : (
              <div style={{
                height: '100%', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 48, opacity: 0.12,
              }}>
                {item.is_veg ? '🌿' : '🍗'}
              </div>
            )}

            {/* Gradient overlay */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              height: 48,
              background: 'linear-gradient(to top, #1a1410, transparent)',
            }} />

            {/* Veg badge */}
            <div style={{
              position: 'absolute', top: 10, left: 10,
              width: 20, height: 20,
              border: `2px solid ${item.is_veg ? '#4ade80' : '#f87171'}`,
              borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.5)',
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: item.is_veg ? '#4ade80' : '#f87171',
              }} />
            </div>
          </div>

          {/* Content */}
          <div style={{ padding: '16px 20px 32px' }}>

            {/* Name + price */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <h2 style={{
                fontFamily: 'Georgia, serif',
                fontSize: 21,
                color: TEXT_PRIMARY,
                fontWeight: 400,
                margin: 0,
                flex: 1,
                paddingRight: 12,
                lineHeight: 1.3,
              }}>
                {item.name}
              </h2>
              <span style={{
                fontFamily: 'Georgia, serif',
                fontSize: 20,
                color: GOLD,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                ₹{item.price}
              </span>
            </div>

            {/* Veg label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <div style={{
                width: 14, height: 14,
                border: `2px solid ${item.is_veg ? '#4ade80' : '#f87171'}`,
                borderRadius: 3,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.is_veg ? '#4ade80' : '#f87171' }} />
              </div>
              <span style={{ fontSize: 12, color: item.is_veg ? '#4ade80' : '#f87171' }}>
                {item.is_veg ? 'Vegetarian' : 'Non-Vegetarian'}
              </span>
            </div>

            <div style={{ height: 1, background: 'rgba(200,169,110,0.08)', marginBottom: 12 }} />

            {/* Description */}
            <p style={{
              fontSize: 14,
              color: item.description ? TEXT_SECONDARY : 'rgba(240,235,227,0.2)',
              lineHeight: 1.7,
              marginBottom: 20,
              fontStyle: item.description ? 'normal' : 'italic',
            }}>
              {item.description || 'A Brew & Co classic, crafted fresh daily.'}
            </p>

            {/* Sold out */}
            {!item.is_available && (
              <div style={{
                padding: '10px 16px', borderRadius: 12, marginBottom: 16, textAlign: 'center',
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              }}>
                <span style={{ fontSize: 13, color: '#ef4444' }}>Currently unavailable</span>
              </div>
            )}

            {/* Add / qty */}
            {item.is_available && (
              qty === 0 ? (
                <button
                  className="sheet-add-btn"
                  onClick={() => { onAdd(item); onClose() }}
                  style={{
                    width: '100%', padding: '15px',
                    borderRadius: 100, border: 'none',
                    background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`,
                    color: BG, fontWeight: 700, fontSize: 15,
                    cursor: 'pointer', fontFamily: 'Georgia, serif',
                    letterSpacing: '0.04em',
                  }}
                >
                  Add to Order — ₹{item.price}
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    background: 'rgba(200,169,110,0.08)',
                    border: '1px solid rgba(200,169,110,0.2)',
                    borderRadius: 100, padding: '4px',
                  }}>
                    <button
                      className="sheet-qty-btn"
                      onClick={() => onUpdateQty(item.id, qty - 1)}
                      style={{
                        width: 40, height: 40, borderRadius: '50%', border: 'none',
                        background: 'rgba(200,169,110,0.1)', color: GOLD, fontSize: 20,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                      }}
                    >−</button>
                    <span style={{ minWidth: 36, textAlign: 'center', fontSize: 16, fontWeight: 700, color: GOLD_LIGHT }}>
                      {qty}
                    </span>
                    <button
                      className="sheet-qty-btn"
                      onClick={() => onAdd(item)}
                      style={{
                        width: 40, height: 40, borderRadius: '50%', border: 'none',
                        background: 'rgba(200,169,110,0.1)', color: GOLD, fontSize: 20,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                      }}
                    >+</button>
                  </div>
                  <button
                    className="sheet-add-btn"
                    onClick={onClose}
                    style={{
                      flex: 1, padding: '14px', borderRadius: 100, border: 'none',
                      background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`,
                      color: BG, fontWeight: 700, fontSize: 14,
                      cursor: 'pointer', fontFamily: 'Georgia, serif',
                    }}
                  >
                    Done — ₹{item.price * qty}
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </>
  )
}
