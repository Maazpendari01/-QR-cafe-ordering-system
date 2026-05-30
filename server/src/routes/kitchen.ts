import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { broadcastToWaiter } from './waiter';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// SSE client registry
// ─────────────────────────────────────────────────────────────────────────────

const kitchenClients = new Set<Response>();

export function broadcastToKitchens(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  kitchenClients.forEach((client) => {
    try {
      client.write(payload);
    } catch {
      kitchenClients.delete(client);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/kitchen/orders — active orders for initial page load
// ─────────────────────────────────────────────────────────────────────────────

router.get('/orders', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        o.id,
        o.status,
        o.total_amount,
        o.note,
        o.payment_method,
        o.payment_status,
        o.created_at,
        o.updated_at,
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
      WHERE o.status IN ('pending', 'preparing', 'ready', 'needs_attention')
      GROUP BY o.id, t.name
      ORDER BY o.created_at ASC
    `);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[kitchen/orders]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch kitchen orders' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/kitchen/stream — SSE realtime stream
// ─────────────────────────────────────────────────────────────────────────────

router.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Kitchen stream connected' })}\n\n`);

  kitchenClients.add(res);

  // Send current active orders immediately on connect
  pool.query(`
    SELECT
      o.id, o.status, o.total_amount, o.note,
      o.payment_method, o.payment_status,
      o.created_at, o.updated_at,
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
    WHERE o.status IN ('pending','preparing','ready','needs_attention')
    GROUP BY o.id, t.name
    ORDER BY o.created_at ASC
  `).then((result) => {
    res.write(`event: initial_orders\ndata: ${JSON.stringify(result.rows)}\n\n`);
  }).catch((err) => {
    console.error('[kitchen/stream initial_orders]', err);
  });

  // Heartbeat every 25s to keep proxies from closing the connection
  const heartbeat = setInterval(() => {
    try {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
    } catch {
      clearInterval(heartbeat);
      kitchenClients.delete(res);
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    kitchenClients.delete(res);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/kitchen/orders/:id/status
// Kitchen moves orders through: pending → preparing → ready
// 'served' is now owned by the waiter screen via PATCH /api/waiter/orders/:id/served
// This route still accepts 'served' for backward compatibility but the
// KitchenClient UI no longer exposes that button.
// ─────────────────────────────────────────────────────────────────────────────

router.patch('/orders/:id/status', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, attention_reason } = req.body as {
    status: string;
    attention_reason?: string;
  };

  const validStatuses = ['pending', 'preparing', 'ready', 'served', 'needs_attention'];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
    });
  }

  try {
    // Fetch current order to get table_id and other fields we need
    const current = await pool.query(
      `SELECT
         o.id, o.status, o.table_id,
         t.name AS table_name,
         o.customer_phone
       FROM orders o
       LEFT JOIN tables t ON t.id = o.table_id
       WHERE o.id = $1`,
      [id]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    // Update the order status
    let updateQuery: string;
    let updateParams: unknown[];

    if (status === 'needs_attention' && attention_reason) {
      updateQuery = `
        UPDATE orders
        SET status = $1, note = COALESCE(note || ' | ', '') || $2, updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `;
      updateParams = [status, `${attention_reason}`, id];
    } else {
      updateQuery = `
        UPDATE orders
        SET status = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      updateParams = [status, id];
    }

    const updated = await pool.query(updateQuery, updateParams);

    // Fetch full order with items for broadcast payload
    const fullOrder = await pool.query(
      `SELECT
         o.id, o.status, o.total_amount, o.note,
         o.table_id,
         o.payment_method, o.payment_status,
         o.created_at, o.updated_at,
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
      [id]
    );

    const orderData = fullOrder.rows[0];

    // ── Kitchen broadcasts ────────────────────────────────────────────────────

    if (status === 'needs_attention') {
      broadcastToKitchens('attention_needed', {
        ...orderData,
        attention_reason: attention_reason ?? 'Item issue',
      });
    } else if (status === 'served') {
      // Customer tracking page gets the status update
      broadcastToKitchens('order_updated', orderData);
      // Kitchen board removes the card
      broadcastToKitchens('order_served', { id });
    } else {
      broadcastToKitchens('order_updated', orderData);
    }

    // Always tell the customer tracking page what the new status is
    broadcastToKitchens('order_status_changed', orderData);

    // ── Waiter broadcasts ─────────────────────────────────────────────────────

    if (status === 'ready') {
      // Order appears in waiter Ready tab — waiter picks it up and marks served
      broadcastToWaiter('order_status_changed', orderData);
    }

    if (status === 'needs_attention') {
      // Order appears in waiter Attention tab with the reason
      broadcastToWaiter('attention_needed', {
        ...orderData,
        attention_note: attention_reason ?? 'Item issue',
      });
    }

    if (status === 'served') {
      // If kitchen sets served directly (edge case), waiter screen clears the card
      broadcastToWaiter('order_served', { id });
    }

    return res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    console.error('[kitchen/status]', err);
    return res.status(500).json({ success: false, error: 'Failed to update order status' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/kitchen/stats — quick counts for dashboard header
// ─────────────────────────────────────────────────────────────────────────────

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')         AS pending,
        COUNT(*) FILTER (WHERE status = 'preparing')       AS preparing,
        COUNT(*) FILTER (WHERE status = 'ready')           AS ready,
        COUNT(*) FILTER (WHERE status = 'needs_attention') AS needs_attention
      FROM orders
      WHERE status IN ('pending','preparing','ready','needs_attention')
    `);

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[kitchen/stats]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

export default router;
