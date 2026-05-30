import { Router, Request, Response, NextFunction } from 'express'
import pool from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { validateFields, validateUUID } from '../middleware/validate'

const router = Router()

// ── GET /api/tables ───────────────────────────────────────────
// Public — customer needs to see table info when scanning QR
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      `SELECT * FROM tables
       WHERE is_active = true
       ORDER BY name ASC`
    )

    res.json({
      success: true,
      data: result.rows,
    })
  } catch (err) {
    next(err)
  }
})

// ── GET /api/tables/all ───────────────────────────────────────
// Admin only — see all tables including inactive
router.get(
  '/all',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `SELECT * FROM tables ORDER BY name ASC`
      )

      res.json({
        success: true,
        data: result.rows,
      })
    } catch (err) {
      next(err)
    }
  }
)

// ── GET /api/tables/:id ───────────────────────────────────────
// Public — get single table by ID (used when customer scans QR)
router.get(
  '/:id',
  validateUUID('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `SELECT * FROM tables WHERE id = $1`,
        [req.params.id]
      )

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Table not found',
        })
        return
      }

      res.json({
        success: true,
        data: result.rows[0],
      })
    } catch (err) {
      next(err)
    }
  }
)

// ── POST /api/tables ──────────────────────────────────────────
// Admin only — create new table
router.post(
  '/',
  requireAuth,
  validateFields(['name']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, capacity = 4 } = req.body

      // Check table name not duplicate
      const existing = await pool.query(
        'SELECT id FROM tables WHERE LOWER(name) = LOWER($1)',
        [name.trim()]
      )

      if (existing.rows.length > 0) {
        res.status(400).json({
          success: false,
          error: `Table "${name}" already exists`,
        })
        return
      }

      // Validate capacity
      if (capacity < 1 || capacity > 20) {
        res.status(400).json({
          success: false,
          error: 'Capacity must be between 1 and 20',
        })
        return
      }

      const result = await pool.query(
        `INSERT INTO tables (name, capacity, is_active)
         VALUES ($1, $2, true)
         RETURNING *`,
        [name.trim(), Number(capacity)]
      )

      res.status(201).json({
        success: true,
        message: `Table "${name}" created successfully`,
        data: result.rows[0],
      })
    } catch (err) {
      next(err)
    }
  }
)

// ── PUT /api/tables/:id ───────────────────────────────────────
// Admin only — update table
router.put(
  '/:id',
  requireAuth,
  validateUUID('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, capacity, is_active } = req.body

      // Check table exists
      const existing = await pool.query(
        'SELECT id FROM tables WHERE id = $1',
        [req.params.id]
      )

      if (existing.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Table not found',
        })
        return
      }

      // Check name not duplicate (excluding current table)
      if (name) {
        const duplicate = await pool.query(
          `SELECT id FROM tables
           WHERE LOWER(name) = LOWER($1) AND id != $2`,
          [name.trim(), req.params.id]
        )

        if (duplicate.rows.length > 0) {
          res.status(400).json({
            success: false,
            error: `Table "${name}" already exists`,
          })
          return
        }
      }

      const result = await pool.query(
        `UPDATE tables SET
          name      = COALESCE($1, name),
          capacity  = COALESCE($2, capacity),
          is_active = COALESCE($3, is_active)
         WHERE id = $4
         RETURNING *`,
        [
          name?.trim(),
          capacity ? Number(capacity) : undefined,
          is_active,
          req.params.id,
        ]
      )

      res.json({
        success: true,
        message: 'Table updated successfully',
        data: result.rows[0],
      })
    } catch (err) {
      next(err)
    }
  }
)

// ── DELETE /api/tables/:id ────────────────────────────────────
// Admin only — delete table
// Soft delete if table has orders, hard delete if no orders
router.delete(
  '/:id',
  requireAuth,
  validateUUID('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if table has any orders
      const orders = await pool.query(
        'SELECT COUNT(*) FROM orders WHERE table_id = $1',
        [req.params.id]
      )

      const hasOrders = parseInt(orders.rows[0].count) > 0

      if (hasOrders) {
        // Soft delete — just mark inactive
        // Can't hard delete because orders reference this table
        await pool.query(
          'UPDATE tables SET is_active = false WHERE id = $1',
          [req.params.id]
        )

        res.json({
          success: true,
          message: 'Table deactivated (has existing orders)',
        })
      } else {
        // Hard delete — no orders reference this table
        const result = await pool.query(
          'DELETE FROM tables WHERE id = $1 RETURNING id',
          [req.params.id]
        )

        if (result.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: 'Table not found',
          })
          return
        }

        res.json({
          success: true,
          message: 'Table deleted successfully',
        })
      }
    } catch (err) {
      next(err)
    }
  }
)

// ── POST /api/tables/seed ─────────────────────────────────────
// Admin only — seed default tables (run once)
router.post(
  '/seed',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await pool.query('SELECT COUNT(*) FROM tables')
      if (parseInt(existing.rows[0].count) > 0) {
        res.json({
          success: true,
          message: 'Tables already exist — skipping seed',
        })
        return
      }

      const defaultTables = [
        { name: 'Table 1', capacity: 2 },
        { name: 'Table 2', capacity: 2 },
        { name: 'Table 3', capacity: 4 },
        { name: 'Table 4', capacity: 4 },
        { name: 'Table 5', capacity: 4 },
        { name: 'Table 6', capacity: 6 },
        { name: 'Table 7', capacity: 6 },
        { name: 'Table 8', capacity: 8 },
        { name: 'Outdoor 1', capacity: 4 },
        { name: 'Outdoor 2', capacity: 4 },
      ]

      for (const table of defaultTables) {
        await pool.query(
          'INSERT INTO tables (name, capacity) VALUES ($1, $2)',
          [table.name, table.capacity]
        )
      }

      res.status(201).json({
        success: true,
        message: `${defaultTables.length} tables created successfully`,
      })
    } catch (err) {
      next(err)
    }
  }
)

export default router
