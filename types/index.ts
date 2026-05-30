export interface Table {
  id: string
  name: string
  capacity: number
  is_active: boolean
  created_at: string
}

export interface MenuCategory {
  id: string
  name: string
  sort_order: number
  created_at: string
  items?: MenuItem[]
}

export interface MenuItem {
  id: string
  category_id: string
  name: string
  description: string | null
  price: number
  image_url: string | null
  is_veg: boolean
  is_available: boolean
  sort_order: number
  created_at: string
}

export interface CartItem {
  menuItem: MenuItem
  quantity: number
}

export interface CartState {
  tableId: string | null
  items: CartItem[]
}

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'needs_attention'
export type PaymentStatus = 'pending' | 'paid' | 'failed'

export interface OrderItem {
  id: string
  order_id: string
  menu_item_id: string
  name: string
  price: number
  quantity: number
  created_at: string
}

export interface Order {
  id: string
  table_id: string
  table_name?: string
  status: OrderStatus
  total_amount: number
  note: string | null
  customer_phone: string | null
  customer_email: string | null
  payment_status: PaymentStatus
  payment_method: 'online' | 'cash'
  discount_amount: number
  coupon_code: string | null
  razorpay_order_id: string | null
  razorpay_payment_id: string | null
  order_items?: OrderItem[]
  created_at: string
  updated_at: string
}

// ── Item-level flag (not whole-order status change) ──────────────────────────
// Sent via SSE event 'item_flagged' when kitchen marks a specific item
// as unavailable. Order status does NOT change — only a UI flag is shown.
export interface FlaggedItem {
  orderId: string
  tableName: string
  itemName: string
  note: string        // kitchen's suggestion, e.g. "Substitute with Americano"
  flaggedAt: string   // ISO timestamp
}

export interface Database {
  public: {
    Tables: {
      tables: { Row: Table }
      categories: { Row: MenuCategory }
      menu_items: { Row: MenuItem }
      orders: { Row: Order }
      order_items: { Row: OrderItem }
    }
  }
}
