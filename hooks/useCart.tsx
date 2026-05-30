'use client'

import {
  createContext,
  useContext,
  useReducer,
  ReactNode,
} from 'react'
import type { MenuItem, CartItem, CartState } from '@/types'

// ── Actions ───────────────────────────────────────────────────
type CartAction =
  | { type: 'ADD_ITEM'; item: MenuItem }
  | { type: 'REMOVE_ITEM'; itemId: string }
  | { type: 'UPDATE_QTY'; itemId: string; quantity: number }
  | { type: 'CLEAR_CART' }
  | { type: 'SET_TABLE'; tableId: string }

// ── Reducer ───────────────────────────────────────────────────
function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'SET_TABLE':
      return { ...state, tableId: action.tableId }

    case 'ADD_ITEM': {
      const existing = state.items.find(
        (i) => i.menuItem.id === action.item.id
      )
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            i.menuItem.id === action.item.id
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        }
      }
      return {
        ...state,
        items: [...state.items, { menuItem: action.item, quantity: 1 }],
      }
    }

    case 'UPDATE_QTY': {
      if (action.quantity <= 0) {
        return {
          ...state,
          items: state.items.filter(
            (i) => i.menuItem.id !== action.itemId
          ),
        }
      }
      return {
        ...state,
        items: state.items.map((i) =>
          i.menuItem.id === action.itemId
            ? { ...i, quantity: action.quantity }
            : i
        ),
      }
    }

    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter((i) => i.menuItem.id !== action.itemId),
      }

    case 'CLEAR_CART':
      return { ...state, items: [] }

    default:
      return state
  }
}

// ── Context ───────────────────────────────────────────────────
interface CartContextType {
  state: CartState
  addItem: (item: MenuItem) => void
  removeItem: (itemId: string) => void
  updateQty: (itemId: string, quantity: number) => void
  clearCart: () => void
  setTable: (tableId: string) => void
  totalItems: number
  totalPrice: number
}

const CartContext = createContext<CartContextType | null>(null)

// ── Provider ──────────────────────────────────────────────────
export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, {
    tableId: null,
    items: [],
  })

  const addItem = (item: MenuItem) =>
    dispatch({ type: 'ADD_ITEM', item })

  const removeItem = (itemId: string) =>
    dispatch({ type: 'REMOVE_ITEM', itemId })

  const updateQty = (itemId: string, quantity: number) =>
    dispatch({ type: 'UPDATE_QTY', itemId, quantity })

  const clearCart = () =>
    dispatch({ type: 'CLEAR_CART' })

  const setTable = (tableId: string) =>
    dispatch({ type: 'SET_TABLE', tableId })

  const totalItems = state.items.reduce(
    (sum, i) => sum + i.quantity, 0
  )

  const totalPrice = state.items.reduce(
    (sum, i) => sum + i.menuItem.price * i.quantity, 0
  )

  return (
    <CartContext.Provider
      value={{
        state,
        addItem,
        removeItem,
        updateQty,
        clearCart,
        setTable,
        totalItems,
        totalPrice,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────
export function useCart(): CartContextType {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within CartProvider')
  }
  return context
}
