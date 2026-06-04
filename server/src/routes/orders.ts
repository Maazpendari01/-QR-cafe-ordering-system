import { Router, Request, Response, NextFunction } from 'express'
import pool from '../db/pool'
import { broadcastToWaiter } from './waiter'
import { requireAuth } from '../middleware/auth'
import {
  validateUUID,
  validateOrderStatus,
  validatePhone,
  validateFields,
  parsePagination,
  sanitizeString,
} from '../middleware/validate'
import { broadcastToKitchens } from './kitchen'

const router = Router()

const STATUS_FLOW: Record<string, number> = {
  pending:          1,
  preparing:        2,
  ready:            3,
  served:           4,
  needs_attention:  2,
}

// ── Types ─────────────────────────────────────────────────────

interface OrderItem {
  menu_item_id: string
  quantity: number | string
}

interface DBMenuItem {
  id: string
  name: string
  price: string
  is_available: boolean
}

// ── Helper — fetch full order with items + table name ─────────

async function fetchFullOrder(orderId: string) {
  const result = await pool.query(
    `SELECT
       o.*,
       t.name AS table_name,
       json_agg(
         json_build_object(
           'id',       oi.id,
           'name',     oi.name,
           'quantity', oi.quantity,
           'price',    oi.price
         ) ORDER BY oi.created_at
       ) AS items
     FROM orders o
     LEFT JOIN tables t       ON t.id = o.table_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.id = $1
     GROUP BY o.id, t.name`,
    [orderId]
  )
  return result.rows[0] ?? null
}

// ── POST /api/orders ──────────────────────────────────────────

router.post(
  '/',
  validateFields(['table_id', 'items', 'customer_phone']),
  validatePhone,
  async (req: Request, res: Response, next: NextFunction) => {
    const client = await pool.connect()
    try {
      const {
        table_id,
        items,
        note,
        customer_phone,
        customer_email,
        payment_method = 'online',
        discount_amount = 0,
        coupon_code,
      } = req.body as {
        table_id: string
        items: OrderItem[]
        note?: string
        customer_phone: string
        customer_email?: string
        payment_method?: 'online' | 'cash'
        discount_amount?: number
        coupon_code?: string
      }

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ success: false, error: 'items must be a non-empty array' })
        return
      }

      for (const item of items) {
        if (!item.menu_item_id || !item.quantity) {
          res.status(400).json({ success: false, error: 'Each item needs: menu_item_id, quantity' })
          return
        }
        if (Number(item.quantity) < 1) {
          res.status(400).json({ success: false, error: 'Item quantity must be at least 1' })
          return
        }
      }

      const tableResult = await client.query(
        'SELECT id, name FROM tables WHERE id = $1 AND is_active = true',
        [table_id]
      )
      if (tableResult.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Table not found or inactive' })
        return
      }

      const menuItemIds = items.map((i) => i.menu_item_id)
      const priceResult = await client.query(
        `SELECT id, name, price, is_available FROM menu_items WHERE id = ANY($1)`,
        [menuItemIds]
      )
      const priceMap = new Map<string, DBMenuItem>(
        priceResult.rows.map((r: DBMenuItem) => [r.id, r])
      )

      for (const item of items) {
        const dbItem = priceMap.get(item.menu_item_id)
        if (!dbItem) {
          res.status(400).json({ success: false, error: `Menu item not found: ${item.menu_item_id}` })
          return
        }
        if (!dbItem.is_available) {
          res.status(400).json({ success: false, error: `"${dbItem.name}" is currently unavailable` })
          return
        }
      }

      const subtotal = items.reduce((sum, item) => {
        const dbItem = priceMap.get(item.menu_item_id)!
        return sum + Number(dbItem.price) * Number(item.quantity)
      }, 0)

      const safeDiscount   = Math.min(Number(discount_amount), subtotal)
      const total_amount   = Math.max(0, subtotal - safeDiscount)
      const payment_status = payment_method === 'cash' ? 'paid' : 'pending'
      const safeNote       = note        ? sanitizeString(note)                     : null
      const safeCouponCode = coupon_code ? sanitizeString(coupon_code).toUpperCase() : null

      await client.query('BEGIN')

      const orderResult = await client.query(
        `INSERT INTO orders
          (table_id, status, total_amount, note,
           customer_phone, customer_email,
           payment_status, payment_method,
           discount_amount, coupon_code)
         VALUES ($1, 'pending', $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          table_id, total_amount, safeNote,
          customer_phone, customer_email || null,
          payment_status, payment_method,
          safeDiscount, safeCouponCode,
        ]
      )
      const order = orderResult.rows[0]

      const orderItems = []
      for (const item of items) {
        const dbItem = priceMap.get(item.menu_item_id)!
        const itemResult = await client.query(
          `INSERT INTO order_items (order_id, menu_item_id, name, price, quantity)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [order.id, item.menu_item_id, dbItem.name, Number(dbItem.price), Number(item.quantity)]
        )
        orderItems.push(itemResult.rows[0])
      }

      if (safeCouponCode && payment_method === 'cash') {
        await client.query(
          `UPDATE coupons SET times_used = times_used + 1
           WHERE UPPER(code) = $1 AND (max_uses IS NULL OR times_used < max_uses)`,
          [safeCouponCode]
        )
      }

      await client.query('COMMIT')

      const broadcastPayload = {
        ...order,
        table_name: tableResult.rows[0].name,
        items: orderItems.map((i) => ({
          id:       i.id,
          name:     i.name,
          quantity: i.quantity,
          price:    i.price,
        })),
      }

      // ── FIX: Only send cash orders to kitchen immediately.
      // Online orders reach the kitchen only after payment is
      // confirmed in POST /api/payments/verify — this prevents
      // unpaid orders from appearing on the kitchen display.
      if (payment_method === 'cash') {
        broadcastToKitchens('new_order', broadcastPayload)
      }

      // Always notify waiter screen so the table grid updates
      // and cash orders appear in the Cash tab right away.
      broadcastToWaiter('new_order', broadcastPayload)

      res.status(201).json({
        success: true,
        message: 'Order placed successfully',
        data: {
          ...order,
          order_items: orderItems,
          table_name: tableResult.rows[0].name,
        },
      })
    } catch (err) {
      await client.query('ROLLBACK')
      next(err)
    } finally {
      client.release()
    }
  }
)

// ── GET /api/orders/stats/summary ─────────────────────────────

router.get(
  '/stats/summary',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { range = 'today' } = req.query
      let dateFilter = ''
      if (range === 'today')      dateFilter = `AND o.created_at >= CURRENT_DATE`
      else if (range === 'week')  dateFilter = `AND o.created_at >= CURRENT_DATE - INTERVAL '7 days'`
      else if (range === 'month') dateFilter = `AND o.created_at >= CURRENT_DATE - INTERVAL '30 days'`

      const result = await pool.query(`
        SELECT
          COUNT(*)::int                                               AS total_orders,
          COALESCE(SUM(total_amount), 0)::numeric                    AS total_revenue,
          COALESCE(SUM(CASE WHEN payment_status = 'paid'
                    THEN total_amount ELSE 0 END), 0)::numeric       AS paid_revenue,
          COALESCE(SUM(CASE WHEN payment_status = 'pending'
                    THEN total_amount ELSE 0 END), 0)::numeric       AS pending_revenue,
          COUNT(CASE WHEN payment_method = 'cash'   THEN 1 END)::int AS cash_orders,
          COUNT(CASE WHEN payment_method = 'online' THEN 1 END)::int AS online_orders,
          COUNT(CASE WHEN status = 'pending'   THEN 1 END)::int      AS pending_orders,
          COUNT(CASE WHEN status = 'preparing' THEN 1 END)::int      AS preparing_orders,
          COUNT(CASE WHEN status = 'served'    THEN 1 END)::int      AS served_orders,
          COALESCE(SUM(discount_amount), 0)::numeric                 AS total_discounts
        FROM orders o WHERE 1=1 ${dateFilter}
      `)
      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      next(err)
    }
  }
)

// ── GET /api/orders ───────────────────────────────────────────

router.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, payment_status, payment_method, table_id } = req.query
      const { limit, offset } = parsePagination(req.query)

      let query = `
        SELECT o.*, t.name AS table_name,
          json_agg(json_build_object(
            'id', oi.id, 'menu_item_id', oi.menu_item_id,
            'name', oi.name, 'price', oi.price, 'quantity', oi.quantity
          )) AS order_items
        FROM orders o
        LEFT JOIN tables t       ON o.table_id = t.id
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE 1=1
      `
      const params: (string | number)[] = []
      let p = 1

      if (status)         { query += ` AND o.status = $${p++}`;         params.push(String(status)) }
      if (payment_status) { query += ` AND o.payment_status = $${p++}`; params.push(String(payment_status)) }
      if (payment_method) { query += ` AND o.payment_method = $${p++}`; params.push(String(payment_method)) }
      if (table_id)       { query += ` AND o.table_id = $${p++}`;       params.push(String(table_id)) }

      query += ` GROUP BY o.id, t.name ORDER BY o.created_at DESC LIMIT $${p++} OFFSET $${p++}`
      params.push(limit, offset)

      const result = await pool.query(query, params)
      res.json({ success: true, data: result.rows, count: result.rows.length })
    } catch (err) {
      next(err)
    }
  }
)

// ── GET /api/orders/table/:tableId ────────────────────────────

router.get(
  '/table/:tableId',
  validateUUID('tableId'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `SELECT o.*,
           json_agg(json_build_object(
             'id', oi.id, 'name', oi.name, 'price', oi.price, 'quantity', oi.quantity
           )) AS order_items
         FROM orders o
         LEFT JOIN order_items oi ON o.id = oi.order_id
         WHERE o.table_id = $1 AND o.status != 'served'
         GROUP BY o.id ORDER BY o.created_at DESC`,
        [req.params.tableId]
      )
      res.json({ success: true, data: result.rows })
    } catch (err) {
      next(err)
    }
  }
)

// ── GET /api/orders/:id ───────────────────────────────────────

router.get(
  '/:id',
  validateUUID('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orderResult = await pool.query(
        `SELECT o.*, t.name AS table_name FROM orders o
         LEFT JOIN tables t ON o.table_id = t.id WHERE o.id = $1`,
        [req.params.id]
      )
      if (orderResult.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Order not found' })
        return
      }
      const itemsResult = await pool.query(
        'SELECT * FROM order_items WHERE order_id = $1',
        [req.params.id]
      )
      res.json({
        success: true,
        data: { ...orderResult.rows[0], order_items: itemsResult.rows },
      })
    } catch (err) {
      next(err)
    }
  }
)

// ── PATCH /api/orders/:id/status ──────────────────────────────

router.patch(
  '/:id/status',
  validateUUID('id'),
  validateOrderStatus,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = req.body as { status: string }

      if (!status) {
        res.status(400).json({ success: false, error: 'status is required' })
        return
      }

      const current = await pool.query(
        'SELECT status FROM orders WHERE id = $1',
        [req.params.id]
      )
      if (current.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Order not found' })
        return
      }

      const currentLevel = STATUS_FLOW[current.rows[0].status]
      const newLevel     = STATUS_FLOW[status]

      if (currentLevel === undefined || newLevel === undefined) {
        res.status(400).json({ success: false, error: 'Invalid status value' })
        return
      }

      if (newLevel < currentLevel) {
        res.status(400).json({
          success: false,
          error: `Cannot go back from "${current.rows[0].status}" to "${status}"`,
        })
        return
      }

      await pool.query(
        `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`,
        [status, req.params.id]
      )

      const fullOrder = await fetchFullOrder(req.params.id)

      if (fullOrder) {
        if (status === 'served') {
          // Kitchen card removed
          broadcastToKitchens('order_served', { id: req.params.id })
          // Waiter screen also removes the card from Ready tab
          broadcastToWaiter('order_served', { id: req.params.id })
        } else {
          broadcastToKitchens('order_updated', fullOrder)
        }

        // Customer tracking page always gets the status update
        broadcastToKitchens('order_status_changed', fullOrder)

        // Waiter screen reacts to relevant status changes
        if (status === 'ready') {
          // Moves order from kitchen to waiter Ready tab
          broadcastToWaiter('order_status_changed', fullOrder)
        }

        if (status === 'needs_attention') {
          // Shows in waiter Attention tab
          broadcastToWaiter('attention_needed', fullOrder)
        }
      }

      res.json({
        success: true,
        message: `Order status updated to "${status}"`,
        data: fullOrder,
      })
    } catch (err) {
      next(err)
    }
  }
)

// ── PATCH /api/orders/:id/payment ─────────────────────────────

router.patch(
  '/:id/payment',
  requireAuth,
  validateUUID('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { payment_status, razorpay_order_id, razorpay_payment_id } = req.body as {
        payment_status: string
        razorpay_order_id?: string
        razorpay_payment_id?: string
      }

      if (!payment_status) {
        res.status(400).json({ success: false, error: 'payment_status is required' })
        return
      }

      const result = await pool.query(
        `UPDATE orders SET
           payment_status      = $1,
           razorpay_order_id   = $2,
           razorpay_payment_id = $3,
           updated_at          = NOW()
         WHERE id = $4 RETURNING *`,
        [payment_status, razorpay_order_id || null, razorpay_payment_id || null, req.params.id]
      )
      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Order not found' })
        return
      }

      const fullOrder = await fetchFullOrder(req.params.id)
      if (fullOrder) {
        broadcastToKitchens('payment_confirmed', fullOrder)
        broadcastToKitchens('order_status_changed', fullOrder)
        // Waiter screen cash tab updates payment badge
        broadcastToWaiter('payment_confirmed', fullOrder)
      }

      res.json({ success: true, message: 'Payment status updated', data: result.rows[0] })
    } catch (err) {
      next(err)
    }
  }
)

// ── PATCH /api/orders/:id/flag ────────────────────────────────

router.patch(
  '/:id/flag',
  validateUUID('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        itemName, note = '', flaggedBy = 'kitchen',
        managerAction, managerNote,
      } = req.body as {
        itemName?: string; note?: string; flaggedBy?: string
        managerAction?: string; managerNote?: string
      }

      const orderResult = await pool.query(
        `SELECT o.id, o.table_id, o.customer_phone, o.customer_email,
                t.name AS table_name
         FROM orders o LEFT JOIN tables t ON o.table_id = t.id WHERE o.id = $1`,
        [req.params.id]
      )
      if (orderResult.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Order not found' })
        return
      }

      const order = orderResult.rows[0]

      if (itemName) {
        const itemRow = await pool.query(
          `SELECT oi.price, oi.quantity
           FROM   order_items oi
           WHERE  oi.order_id = $1 AND oi.name = $2
           LIMIT  1`,
          [req.params.id, itemName]
        )

        if (itemRow.rows[0]) {
          const lineTotal =
            parseFloat(itemRow.rows[0].price) * itemRow.rows[0].quantity
          await pool.query(
            `INSERT INTO order_item_changes
               (order_id, original_item_name, original_item_price,
                change_type, price_difference, note)
             VALUES ($1, $2, $3, 'removed', $4, $5)`,
            [
              req.params.id,
              itemName,
              lineTotal,
              -lineTotal,
              note || null,
            ]
          )
        }

        const flagPayload = {
          orderId:       order.id,
          tableId:       order.table_id,
          tableName:     order.table_name || 'Unknown Table',
          itemName,
          note,
          flaggedBy,
          flaggedAt:     new Date().toISOString(),
          customerPhone: order.customer_phone || null,
          customerEmail: order.customer_email || null,
        }

        broadcastToKitchens('item_flagged', flagPayload)
        broadcastToWaiter('item_flagged', flagPayload)

        console.log(`Item flagged: "${itemName}" on order ${order.id} (${order.table_name})`)
      }

      if (managerAction) {
        console.log(`Manager action on order ${order.id}: ${managerAction} — ${managerNote || ''}`)
      }

      res.json({
        success: true,
        message: itemName
          ? `Item "${itemName}" flagged — waiter notified`
          : 'Manager action recorded',
      })
    } catch (err) {
      next(err)
    }
  }
)

// ── POST /api/orders/:id/call-waiter ─────────────────────────

router.post(
  '/:id/call-waiter',
  validateUUID('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params

      const orderResult = await pool.query(
        `SELECT o.table_id, t.name AS table_name
         FROM   orders o
         JOIN   tables t ON t.id = o.table_id
         WHERE  o.id = $1`,
        [id]
      )
      if (!orderResult.rows[0]) {
        res.status(404).json({ success: false, error: 'Order not found' })
        return
      }
      const { table_id, table_name } = orderResult.rows[0]

      // Prevent duplicate pending calls for the same table
      const existing = await pool.query(
        `SELECT id FROM waiter_calls WHERE table_id = $1 AND status = 'pending'`,
        [table_id]
      )
      if (existing.rows.length > 0) {
        res.json({ success: true, duplicate: true })
        return
      }

      const callResult = await pool.query(
        `INSERT INTO waiter_calls (table_id, table_name, order_id)
         VALUES ($1, $2, $3) RETURNING *`,
        [table_id, table_name, id]
      )

      broadcastToWaiter('waiter_call', callResult.rows[0])
      res.json({ success: true, data: callResult.rows[0] })
    } catch (err) {
      next(err)
    }
  }
)

// ── DELETE /api/orders/:id ────────────────────────────────────

router.delete(
  '/:id',
  requireAuth,
  validateUUID('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        'DELETE FROM orders WHERE id = $1 RETURNING id',
        [req.params.id]
      )
      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Order not found' })
        return
      }
      res.json({ success: true, message: 'Order deleted' })
    } catch (err) {
      next(err)
    }
  }
)

export default router
