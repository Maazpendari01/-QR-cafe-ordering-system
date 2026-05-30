'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import Image from 'next/image'
import { useCart } from '@/hooks/useCart'
import CartDrawer from '@/components/cart/CartDrawer'
import ItemDetailSheet from '@/components/order/menu/ItemDetailSheet'
import type { Table, MenuCategory, MenuItem } from '@/types'

interface Props {
  table: Table
  categories: MenuCategory[]
  menuItems: MenuItem[]
}

type VegFilter = 'all' | 'veg' | 'nonveg'

function haptic(pattern: number | number[] = 10) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern)
    }
  } catch {}
}

export default function MenuPageClient({ table, categories, menuItems }: Props) {
  const { addItem, totalItems, totalPrice, setTable, state, updateQty } = useCart()
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id || '')
  const [cartOpen, setCartOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [vegFilter, setVegFilter] = useState<VegFilter>('all')
  const [searchFocused, setSearchFocused] = useState(false)
  const [addedItemId, setAddedItemId] = useState<string | null>(null)
  const [pressedItemId, setPressedItemId] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  const headerRef = useRef<HTMLElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)

  // ✅ FIXED: was calling setTable directly in render body (causes hook crash)
  useEffect(() => {
    if (state.tableId !== table.id) setTable(table.id)
  }, [table.id])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollToCategory = useCallback((categoryId: string) => {
    setActiveCategory(categoryId)
    const el = document.getElementById(`cat-${categoryId}`)
    if (!el) return
    const headerHeight = headerRef.current?.offsetHeight ?? 0
    const top = el.getBoundingClientRect().top + window.scrollY - headerHeight - 16
    window.scrollTo({ top, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (categories.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) {
          setActiveCategory(visible[0].target.id.replace('cat-', ''))
        }
      },
      {
        rootMargin: `-${(headerRef.current?.offsetHeight ?? 80) + 8}px 0px -50% 0px`,
        threshold: 0,
      }
    )
    categories.forEach((cat) => {
      const el = document.getElementById(`cat-${cat.id}`)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [categories])

  const handleAddItem = useCallback((item: MenuItem) => {
    addItem(item)
    haptic(12)
    setAddedItemId(item.id)
    setTimeout(() => setAddedItemId(null), 500)
  }, [addItem])

  const handleUpdateQty = useCallback((itemId: string, qty: number) => {
    updateQty(itemId, qty)
    haptic(qty > 0 ? 8 : [8, 30, 8])
  }, [updateQty])

  const handlePressStart = (itemId: string) => setPressedItemId(itemId)
  const handlePressEnd = () => setPressedItemId(null)

  const handleItemTap = useCallback((item: MenuItem) => {
    haptic(8)
    setSelectedItem(item)
  }, [])

  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesSearch =
        searchQuery === '' ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesVeg =
        vegFilter === 'all' ||
        (vegFilter === 'veg' && item.is_veg) ||
        (vegFilter === 'nonveg' && !item.is_veg)
      return matchesSearch && matchesVeg
    })
  }, [menuItems, searchQuery, vegFilter])

  const visibleCategories = useMemo(
    () => categories.filter((cat) => filteredItems.some((item) => item.category_id === cat.id)),
    [categories, filteredItems]
  )

  const itemsByCategory = (categoryId: string) =>
    filteredItems.filter((i) => i.category_id === categoryId)

  const getCartQty = (itemId: string) =>
    state.items.find((i) => i.menuItem.id === itemId)?.quantity || 0

  const formatPrice = (p: number) => `₹${p}`
  const isSearching = searchQuery !== '' || vegFilter !== 'all'

  const categoryEmoji: Record<string, string> = {
    'coffee': '☕', 'iced': '🧊', 'cold': '🧊',
    'dessert': '🍰', 'desserts': '🍰', 'food': '🍽️',
    'plates': '🍽️', 'beverages': '🥤', 'snacks': '🥐',
  }
  const getCategoryEmoji = (name: string) => {
    const key = Object.keys(categoryEmoji).find(k => name.toLowerCase().includes(k))
    return key ? categoryEmoji[key] : '✦'
  }

  const BG = '#13100d'
  const SURFACE = '#1c1711'
  const GOLD = '#c8a96e'
  const GOLD_LIGHT = '#e8c584'
  const TEXT_PRIMARY = '#f0ebe3'
  const TEXT_SECONDARY = 'rgba(240,235,227,0.45)'
  const TEXT_MUTED = 'rgba(240,235,227,0.22)'
  const DIVIDER = 'rgba(200,169,110,0.1)'
  const BORDER = 'rgba(200,169,110,0.12)'

  return (
    <div className="min-h-screen pb-36" style={{ background: BG }}>

      <style jsx global>{`
        .item-row {
          transition: background 0.15s ease, transform 0.12s ease;
          -webkit-tap-highlight-color: transparent;
          cursor: pointer;
        }
        .item-row:active {
          background: rgba(200,169,110,0.06) !important;
          transform: scale(0.995);
        }
        .add-btn {
          transition: all 0.15s cubic-bezier(0.34,1.56,0.64,1);
          -webkit-tap-highlight-color: transparent;
          cursor: pointer;
          user-select: none;
        }
        .add-btn:active {
          transform: scale(0.85) !important;
          background: rgba(200,169,110,0.25) !important;
        }
        .qty-btn {
          transition: transform 0.1s ease, background 0.1s ease;
          -webkit-tap-highlight-color: transparent;
          cursor: pointer;
        }
        .qty-btn:active {
          transform: scale(0.7) !important;
          background: rgba(200,169,110,0.3) !important;
        }
        .cart-btn {
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .cart-btn:active {
          transform: scale(0.97) !important;
          box-shadow: 0 4px 16px rgba(200,169,110,0.2) !important;
        }
        .cat-pill {
          transition: all 0.2s ease;
          -webkit-tap-highlight-color: transparent;
          cursor: pointer;
        }
        .cat-pill:active {
          transform: scale(0.93);
          opacity: 0.8;
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        @keyframes addedPop {
          0% { transform: scale(1); }
          40% { transform: scale(0.88); }
          70% { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
        .just-added {
          animation: addedPop 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards;
        }
      `}</style>

      {/* ── Sticky Header ─────────────────────────────────── */}
      <header
        ref={headerRef}
        className="sticky top-0 z-30 transition-all duration-500"
        style={{
          background: scrolled ? `rgba(19,16,13,0.97)` : 'transparent',
          backdropFilter: scrolled ? 'blur(20px)' : 'none',
          borderBottom: scrolled ? `1px solid ${DIVIDER}` : '1px solid transparent',
        }}
      >
        <div className="px-5 pt-4 pb-2 flex items-center justify-between max-w-lg mx-auto">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span style={{ color: TEXT_MUTED, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600 }}>
                {table.name}
              </span>
              <span style={{ color: TEXT_MUTED, fontSize: 8 }}>•</span>
              <span style={{ color: TEXT_MUTED, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600 }}>
                Menu
              </span>
            </div>
            <h1
              className="text-2xl font-bold"
              style={{ fontFamily: 'Georgia, serif', color: GOLD_LIGHT, lineHeight: 1.1 }}
            >
              Brew & Co
            </h1>
          </div>

          {totalItems > 0 && scrolled && (
            <button
              className="cart-btn flex items-center gap-2 px-4 py-2 rounded-full"
              onClick={() => { haptic([8, 20, 8]); setCartOpen(true) }}
              style={{
                background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`,
                boxShadow: '0 4px 16px rgba(200,169,110,0.3)',
              }}
            >
              <span className="text-xs font-bold" style={{ color: '#0e0b08' }}>{totalItems}</span>
              <span className="text-xs font-semibold" style={{ color: '#0e0b08' }}>{formatPrice(totalPrice)}</span>
            </button>
          )}
        </div>

        <div className="px-5 pb-2 max-w-lg mx-auto">
          <div
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl transition-all duration-300"
            style={{
              background: searchFocused ? 'rgba(200,169,110,0.07)' : SURFACE,
              border: searchFocused ? `1px solid rgba(200,169,110,0.3)` : `1px solid ${BORDER}`,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={TEXT_SECONDARY} strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search dishes, drinks..."
              className="flex-1 text-sm outline-none bg-transparent"
              style={{ color: TEXT_PRIMARY }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="w-5 h-5 rounded-full flex items-center justify-center add-btn"
                style={{ background: 'rgba(200,169,110,0.12)', color: GOLD }}
              >
                <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="px-5 pb-3 flex items-center gap-2 overflow-x-auto scrollbar-hide max-w-lg mx-auto">
          <button
            className="cat-pill flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            onClick={() => setVegFilter(vegFilter === 'veg' ? 'all' : 'veg')}
            style={vegFilter === 'veg'
              ? { background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }
              : { background: SURFACE, color: TEXT_SECONDARY, border: `1px solid ${BORDER}` }
            }
          >
            <div className="w-2.5 h-2.5 border rounded-sm flex items-center justify-center" style={{ borderColor: '#4ade80' }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#4ade80' }} />
            </div>
            Veg
          </button>

          <button
            className="cat-pill flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            onClick={() => setVegFilter(vegFilter === 'nonveg' ? 'all' : 'nonveg')}
            style={vegFilter === 'nonveg'
              ? { background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }
              : { background: SURFACE, color: TEXT_SECONDARY, border: `1px solid ${BORDER}` }
            }
          >
            <div className="w-2.5 h-2.5 border rounded-sm flex items-center justify-center" style={{ borderColor: '#f87171' }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#f87171' }} />
            </div>
            Non-veg
          </button>

          <div className="flex-shrink-0 w-px h-4" style={{ background: DIVIDER }} />

          {!isSearching && categories.map((cat) => (
            <button
              key={cat.id}
              className="cat-pill flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold"
              onClick={() => scrollToCategory(cat.id)}
              style={activeCategory === cat.id
                ? { background: GOLD, color: '#0e0b08', fontWeight: 700 }
                : { background: SURFACE, color: TEXT_SECONDARY, border: `1px solid ${BORDER}` }
              }
            >
              {cat.name}
            </button>
          ))}
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────── */}
      {!isSearching && (
        <div ref={heroRef} className="relative px-5 pt-5 pb-7 max-w-lg mx-auto">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(ellipse 80% 60% at 50% 0%, rgba(200,169,110,0.05) 0%, transparent 70%)` }}
          />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: TEXT_MUTED, letterSpacing: '0.22em' }}>
              Crafted with care
            </p>
            <h2 className="text-3xl font-bold leading-tight mb-2" style={{ fontFamily: 'Georgia, serif', color: TEXT_PRIMARY }}>
              What would you<br />
              <span style={{ color: GOLD }}>like today?</span>
            </h2>
            <p className="text-xs" style={{ color: TEXT_MUTED }}>
              {menuItems.filter(i => i.is_available).length} items · Fresh daily
            </p>

            <div className="mt-4 flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  className="cat-pill flex-shrink-0 flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl"
                  onClick={() => scrollToCategory(cat.id)}
                  style={{
                    background: activeCategory === cat.id ? 'rgba(200,169,110,0.1)' : SURFACE,
                    border: activeCategory === cat.id ? `1px solid rgba(200,169,110,0.22)` : `1px solid ${BORDER}`,
                    minWidth: 70,
                  }}
                >
                  <span style={{ fontSize: 20 }}>{getCategoryEmoji(cat.name)}</span>
                  <span
                    className="text-xs font-semibold text-center leading-tight"
                    style={{ color: activeCategory === cat.id ? GOLD : TEXT_SECONDARY, maxWidth: 58 }}
                  >
                    {cat.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Menu content ──────────────────────────────────── */}
      <main className="max-w-lg mx-auto">

        {isSearching && (
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <p className="text-sm" style={{ color: TEXT_SECONDARY }}>
              {filteredItems.length === 0 ? 'No items found' : `${filteredItems.length} result${filteredItems.length !== 1 ? 's' : ''}`}
            </p>
            <button
              className="add-btn text-xs px-3 py-1.5 rounded-full"
              onClick={() => { setSearchQuery(''); setVegFilter('all') }}
              style={{ background: 'rgba(200,169,110,0.08)', color: GOLD, border: `1px solid ${BORDER}` }}
            >
              Clear all
            </button>
          </div>
        )}

        {filteredItems.length === 0 && (
          <div className="text-center py-20 px-5">
            <div className="text-5xl mb-4 opacity-20">
              {vegFilter === 'veg' ? '🌿' : vegFilter === 'nonveg' ? '🍗' : '🔍'}
            </div>
            <p className="text-lg font-semibold mb-2" style={{ fontFamily: 'Georgia, serif', color: GOLD }}>
              {searchQuery ? `Nothing for "${searchQuery}"` : `No ${vegFilter} items`}
            </p>
            <p className="text-sm" style={{ color: TEXT_MUTED }}>Try adjusting your filters</p>
          </div>
        )}

        {(isSearching ? visibleCategories : categories).map((category) => {
          const items = itemsByCategory(category.id)
          if (!items.length) return null

          return (
            <section key={category.id} id={`cat-${category.id}`} className="mb-8">

              <div
                className="flex items-center gap-3 px-5 py-3 mb-0"
                style={{
                  background: `linear-gradient(to right, rgba(200,169,110,0.05), transparent)`,
                  borderTop: `1px solid ${DIVIDER}`,
                  borderBottom: `1px solid ${DIVIDER}`,
                }}
              >
                <span style={{ fontSize: 18 }}>{getCategoryEmoji(category.name)}</span>
                <div className="flex-1">
                  <h2
                    className="text-sm font-bold"
                    style={{ fontFamily: 'Georgia, serif', color: GOLD }}
                  >
                    {category.name}
                  </h2>
                  <p className="text-xs" style={{ color: TEXT_MUTED }}>
                    {items.length} item{items.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              <div>
                {items.map((item, index) => {
                  const qty = getCartQty(item.id)
                  const justAdded = addedItemId === item.id
                  const isPressed = pressedItemId === item.id

                  return (
                    <div
                      key={item.id}
                      className="item-row flex items-center gap-4 px-5 py-4"
                      style={{
                        background: isPressed ? 'rgba(200,169,110,0.05)' : 'transparent',
                        borderBottom: index < items.length - 1
                          ? `1px solid ${DIVIDER}`
                          : 'none',
                      }}
                      onClick={() => handleItemTap(item)}
                      onMouseDown={() => handlePressStart(item.id)}
                      onMouseUp={handlePressEnd}
                      onMouseLeave={handlePressEnd}
                      onTouchStart={() => handlePressStart(item.id)}
                      onTouchEnd={handlePressEnd}
                      onTouchCancel={handlePressEnd}
                    >
                      {/* Left: text content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 mb-1">
                          <div
                            className="flex-shrink-0 mt-[3px] w-3.5 h-3.5 border-2 flex items-center justify-center rounded-sm"
                            style={{ borderColor: item.is_veg ? '#4ade80' : '#f87171' }}
                          >
                            <div
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: item.is_veg ? '#4ade80' : '#f87171' }}
                            />
                          </div>
                          <h3
                            className="font-semibold text-sm leading-snug"
                            style={{ color: item.is_available ? TEXT_PRIMARY : TEXT_MUTED }}
                          >
                            {item.name}
                          </h3>
                        </div>

                        {item.description && (
                          <p
                            className="text-xs leading-relaxed line-clamp-2 pl-5"
                            style={{ color: TEXT_MUTED }}
                          >
                            {item.description}
                          </p>
                        )}

                        <div className="flex items-center gap-2 mt-2 pl-5">
                          <span
                            className="text-sm font-bold"
                            style={{ fontFamily: 'Georgia, serif', color: GOLD }}
                          >
                            {formatPrice(item.price)}
                          </span>
                          {!item.is_available && (
                            <span
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{
                                background: 'rgba(255,255,255,0.04)',
                                color: TEXT_MUTED,
                                border: '1px solid rgba(255,255,255,0.06)',
                              }}
                            >
                              Sold out
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: image + button */}
                      <div className="flex-shrink-0 flex flex-col items-center gap-2.5">
                        <div
                          className="relative w-[86px] h-[86px] rounded-2xl overflow-hidden"
                          style={{
                            background: SURFACE,
                            border: `1px solid ${BORDER}`,
                          }}
                        >
                          {item.image_url ? (
                            <Image
                              src={item.image_url}
                              alt={item.name}
                              fill
                              className="object-cover"
                              sizes="86px"
                              style={{ opacity: item.is_available ? 1 : 0.3 }}
                            />
                          ) : (
                            <div
                              className="h-full w-full flex items-center justify-center"
                              style={{ fontSize: 26, opacity: 0.12 }}
                            >
                              {item.is_veg ? '🌿' : '🍗'}
                            </div>
                          )}
                        </div>

                        {item.is_available && (
                          qty === 0 ? (
                            <button
                              className={`add-btn w-[86px] py-2 rounded-xl text-xs font-bold tracking-wide ${justAdded ? 'just-added' : ''}`}
                              onClick={(e) => { e.stopPropagation(); handleAddItem(item) }}
                              style={{
                                background: justAdded ? 'rgba(200,169,110,0.2)' : SURFACE,
                                color: justAdded ? GOLD_LIGHT : GOLD,
                                border: `1px solid ${justAdded ? 'rgba(200,169,110,0.4)' : BORDER}`,
                                letterSpacing: '0.04em',
                              }}
                            >
                              {justAdded ? '✓ Added' : '+ Add'}
                            </button>
                          ) : (
                            <div
                              className="flex items-center justify-between w-[86px] rounded-xl px-1.5 py-1.5"
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                background: 'rgba(200,169,110,0.1)',
                                border: `1px solid rgba(200,169,110,0.22)`,
                              }}
                            >
                              <button
                                className="qty-btn w-7 h-7 flex items-center justify-center rounded-lg font-bold"
                                onClick={(e) => { e.stopPropagation(); handleUpdateQty(item.id, qty - 1) }}
                                style={{ color: GOLD, background: 'rgba(200,169,110,0.1)', fontSize: 16 }}
                              >
                                −
                              </button>
                              <span className="text-xs font-bold" style={{ color: GOLD_LIGHT }}>
                                {qty}
                              </span>
                              <button
                                className="qty-btn w-7 h-7 flex items-center justify-center rounded-lg font-bold"
                                onClick={(e) => { e.stopPropagation(); handleAddItem(item) }}
                                style={{ color: GOLD, background: 'rgba(200,169,110,0.1)', fontSize: 16 }}
                              >
                                +
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}

        <div className="h-4" />
      </main>

      {/* ── Floating cart ─────────────────────────────────── */}
      {totalItems > 0 && (
        <div
          className="fixed bottom-6 z-40"
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 40px)',
            maxWidth: 488,
          }}
        >
          <button
            className="cart-btn w-full py-4 px-5 rounded-2xl flex items-center justify-between"
            onClick={() => { haptic([10, 20, 10]); setCartOpen(true) }}
            style={{
              background: `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_LIGHT} 50%, ${GOLD} 100%)`,
              boxShadow: '0 8px 32px rgba(200,169,110,0.35), 0 2px 8px rgba(0,0,0,0.5)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(14,11,8,0.2)' }}
              >
                <span className="text-xs font-bold" style={{ color: '#0e0b08' }}>{totalItems}</span>
              </div>
              <span className="font-bold text-sm" style={{ color: '#0e0b08' }}>
                View Order
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="font-bold text-base"
                style={{ fontFamily: 'Georgia, serif', color: '#0e0b08' }}
              >
                {formatPrice(totalPrice)}
              </span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0e0b08" strokeWidth="2.5" opacity="0.6">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </button>
        </div>
      )}

      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        tableId={table.id}
        tableNumber={table.name}
      />

      <ItemDetailSheet
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        qty={selectedItem ? getCartQty(selectedItem.id) : 0}
        onAdd={handleAddItem}
        onUpdateQty={handleUpdateQty}
      />
    </div>
  )
}
