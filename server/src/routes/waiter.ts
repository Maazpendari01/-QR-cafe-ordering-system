import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { broadcastToKitchens } from './kitchen';

const router = Router();

const waiterClients = new Set<Response>();

export function broadcastToWaiter(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  waiterClients.forEach((client) => {
    try {
      client.write(payload);
    } catch {
      waiterClients.delete(client);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/waiter/stream
// ─────────────────────────────────────────────────────────────────────────────

router.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  waiterClients.add(res);
  res.write('event: connected\ndata: {}\n\n');

  const keepAlive = setInterval(() => {
    try { res.write(': ping\n\n'); }
    catch { clearInterval(keepAlive); }
  }, 25_000);

  req.on('close', () => {
    waiterClients.delete(res);
    clearInterval(keepAlive);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/waiter/dashboard
// ─────────────────────────────────────────────────────────────────────────────

// FIX: Each query runs independently so a missing table (e.g. order_item_changes,
// waiter_calls) or any other DB error on one section does NOT wipe out all the
// other sections. Previously a single failure caused success:false and the
// entire waiter dashboard showed empty even when ready orders existed.
async function safeQuery<T = Record<string, unknown>>(
  label: string,
  fn: () => Promise<{ rows: T[] }>
): Promise<T[]> {
  try {
    const result = await fn();
    return result.rows;
  } catch (err) {
    console.error(`[waiter dashboard – ${label} failed]`, err);
    return [];
  }
}

router.get('/dashboard', async (_req: Request, res: Response) => {
  // 1. Pending waiter calls
  const calls = await safeQuery('calls', () =>
    pool.query(`
      SELECT id, table_id, table_name, order_id, status, created_at
      FROM   waiter_calls
      WHERE  status = 'pending'
      ORDER  BY created_at ASC
    `)
  );

  // 2. Ready orders — try full query with adjustments first,
  //    fall back to a simpler query without order_item_changes if that table
  //    does not yet exist in the production database.
  let readyOrders = await safeQuery('ready-orders-full', () =>
    pool.query(`
      SELECT
        o.id,
        o.total_amount,
        o.payment_method,
        o.payment_status,
        o.note,
        o.updated_at,
        t.name AS table_name,
        COALESCE(
          json_agg(
            json_build_object(
              'id',       oi.id,
              'name',     oi.name,
              'quantity', oi.quantity,
              'price',    oi.price
            ) ORDER BY oi.created_at
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'
        ) AS items,
        COALESCE(
          (
            SELECT json_agg(json_build_object(
              'id',                    oic.id,
              'original_item_name',    oic.original_item_name,
              'original_item_price',   oic.original_item_price,
              'replacement_item_name', oic.replacement_item_name,
              'change_type',           oic.change_type,
              'price_difference',      oic.price_difference,
              'note',                  oic.note,
              'resolved',              oic.resolved
            ))
            FROM order_item_changes oic
            WHERE oic.order_id = o.id AND oic.resolved = false
          ),
          '[]'
        ) AS adjustments
      FROM   orders o
      JOIN   tables t         ON t.id = o.table_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE  o.status = 'ready'
      GROUP  BY o.id, t.name
      ORDER  BY o.updated_at ASC
    `)
  );

  // Fallback: if full query failed (order_item_changes missing), run without it
  if (readyOrders.length === 0) {
    const fallback = await safeQuery('ready-orders-fallback', () =>
      pool.query(`
        SELECT
          o.id,
          o.total_amount,
          o.payment_method,
          o.payment_status,
          o.note,
          o.updated_at,
          t.name AS table_name,
          COALESCE(
            json_agg(
              json_build_object(
                'id',       oi.id,
                'name',     oi.name,
                'quantity', oi.quantity,
                'price',    oi.price
              ) ORDER BY oi.created_at
            ) FILTER (WHERE oi.id IS NOT NULL),
            '[]'
          ) AS items,
          '[]'::json AS adjustments
        FROM   orders o
        JOIN   tables t         ON t.id = o.table_id
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE  o.status = 'ready'
        GROUP  BY o.id, t.name
        ORDER  BY o.updated_at ASC
      `)
    );
    // Only replace if we actually got rows (distinguishes "table missing" from "no ready orders")
    if (fallback.length > 0) {
      readyOrders = fallback;
    }
  }

  // 3. Flagged items on orders that are NOT yet ready
  const flaggedActiveOrders = await safeQuery('flagged-active', () =>
    pool.query(`
      SELECT
        o.id,
        o.status,
        o.total_amount,
        o.payment_method,
        o.note,
        o.updated_at,
        t.name AS table_name,
        COALESCE(
          (
            SELECT json_agg(json_build_object(
              'id',                    oic.id,
              'original_item_name',    oic.original_item_name,
              'original_item_price',   oic.original_item_price,
              'replacement_item_name', oic.replacement_item_name,
              'change_type',           oic.change_type,
              'price_difference',      oic.price_difference,
              'note',                  oic.note,
              'resolved',              oic.resolved
            ))
            FROM order_item_changes oic
            WHERE oic.order_id = o.id AND oic.resolved = false
          ),
          '[]'
        ) AS adjustments
      FROM orders o
      JOIN tables t ON t.id = o.table_id
      WHERE o.status IN ('pending', 'preparing', 'needs_attention')
        AND EXISTS (
          SELECT 1 FROM order_item_changes oic
          WHERE oic.order_id = o.id AND oic.resolved = false
        )
      ORDER BY o.updated_at ASC
    `)
  );

  // 4. Cash orders pending collection
  const cashPending = await safeQuery('cash-pending', () =>
    pool.query(`
      SELECT
        o.id,
        o.total_amount,
        o.created_at,
        t.name AS table_name
      FROM   orders o
      JOIN   tables t ON t.id = o.table_id
      WHERE  o.payment_method  = 'cash'
        AND  o.payment_status  = 'pending'
        AND  o.status NOT IN ('served')
      ORDER  BY o.created_at ASC
    `)
  );

  // 5. Table overview — try with has_adjustment, fall back without if
  //    order_item_changes doesn't exist
  let tables = await safeQuery('tables-full', () =>
    pool.query(`
      SELECT
        t.id,
        t.name,
        (
          SELECT o.status
          FROM   orders o
          WHERE  o.table_id = t.id
            AND  o.status NOT IN ('served')
          ORDER  BY o.created_at DESC
          LIMIT  1
        ) AS current_status,
        EXISTS (
          SELECT 1 FROM waiter_calls wc
          WHERE  wc.table_id = t.id AND wc.status = 'pending'
        ) AS has_call,
        EXISTS (
          SELECT 1
          FROM   orders o
          JOIN   order_item_changes oic ON oic.order_id = o.id
          WHERE  o.table_id   = t.id
            AND  oic.resolved = false
            AND  o.status NOT IN ('served')
        ) AS has_adjustment
      FROM   tables t
      WHERE  t.is_active = true
      ORDER  BY t.name
    `)
  );

  if (tables.length === 0) {
    tables = await safeQuery('tables-fallback', () =>
      pool.query(`
        SELECT
          t.id,
          t.name,
          (
            SELECT o.status
            FROM   orders o
            WHERE  o.table_id = t.id
              AND  o.status NOT IN ('served')
            ORDER  BY o.created_at DESC
            LIMIT  1
          ) AS current_status,
          false AS has_call,
          false AS has_adjustment
        FROM   tables t
        WHERE  t.is_active = true
        ORDER  BY t.name
      `)
    );
  }

  res.json({
    success: true,
    data: {
      calls,
      readyOrders,
      flaggedActiveOrders,
      cashPending,
      tables,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/waiter/orders/:id/served
// ─────────────────────────────────────────────────────────────────────────────

router.patch('/orders/:id/served', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { adjustmentResolved = false } = req.body as { adjustmentResolved?: boolean };

  try {
    await pool.query('BEGIN');

    const result = await pool.query(
      `UPDATE orders
       SET    status = 'served', updated_at = NOW()
       WHERE  id = $1
       RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (adjustmentResolved) {
      try {
        await pool.query(
          `UPDATE order_item_changes
           SET    resolved = true, resolved_at = NOW()
           WHERE  order_id = $1 AND resolved = false`,
          [id]
        );
      } catch (err) {
        console.error('[waiter served – adjustment resolve failed, continuing]', err);
      }
    }

    await pool.query('COMMIT');

    broadcastToWaiter('order_served', { id });
    broadcastToKitchens('order_updated', { id, status: 'served' });
    res.json({ success: true });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('[waiter served]', err);
    res.status(500).json({ success: false, error: 'Failed to mark served' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/waiter/calls/:id/acknowledge
// ─────────────────────────────────────────────────────────────────────────────

router.patch('/calls/:id/acknowledge', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE waiter_calls
       SET    status = 'acknowledged'
       WHERE  id = $1 AND status = 'pending'
       RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }

    broadcastToWaiter('waiter_call_acknowledged', { id });
    res.json({ success: true });
  } catch (err) {
    console.error('[acknowledge call]', err);
    res.status(500).json({ success: false, error: 'Failed to acknowledge call' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/waiter/cash/:id/collected
// ─────────────────────────────────────────────────────────────────────────────

router.post('/cash/:id/collected', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE orders
       SET    payment_status = 'paid', updated_at = NOW()
       WHERE  id = $1 AND payment_method = 'cash'
       RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    broadcastToWaiter('cash_collected', { id });
    res.json({ success: true });
  } catch (err) {
    console.error('[cash collected]', err);
    res.status(500).json({ success: false, error: 'Failed to update payment' });
  }
});

export default router;
