import { Router, Request, Response, NextFunction } from 'express'
import pool from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { validateFields, validateUUID, sanitizeString } from '../middleware/validate'

const router = Router()

// ── Valid discount types ──────────────────────────────────────
// FIX: Was checking for 'flat' but DB schema CHECK constraint
// uses 'fixed'. This caused every coupon creation to fail with
// a misleading error. Both validation AND DB now agree on 'fixed'.
const DISCOUNT_TYPES = ['percentage', 'fixed'] as const
type DiscountType = typeof DISCOUNT_TYPES[number]

function isValidDiscountType(value: unknown): value is DiscountType {
  return DISCOUNT_TYPES.includes(value as DiscountType)
}

// ── POST /api/coupons/apply ───────────────────────────────────
router.post(
  '/apply',
  validateFields(['code', 'orderTotal']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code, orderTotal } = req.body

      if (isNaN(Number(orderTotal)) || Number(orderTotal) < 0) {
        res.status(400).json({
          success: false,
          error: 'orderTotal must be a positive number',
        })
        return
      }

      const result = await pool.query(
        `SELECT * FROM coupons
         WHERE UPPER(code) = UPPER($1)
           AND is_active = true
           AND (expires_at IS NULL OR expires_at > NOW())
           AND (max_uses IS NULL OR times_used < max_uses)`,
        [String(code).trim()]
      )

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Invalid or expired coupon code',
        })
        return
      }

      const coupon = result.rows[0]

      if (Number(orderTotal) < Number(coupon.minimum_order)) {
        res.status(400).json({
          success: false,
          error: `Minimum order of ₹${coupon.minimum_order} required for this coupon`,
        })
        return
      }

      let discountAmount = 0
      if (coupon.discount_type === 'percentage') {
        discountAmount =
          (Number(orderTotal) * Number(coupon.discount_value)) / 100
      } else {
        // 'fixed'
        discountAmount = Number(coupon.discount_value)
      }

      // Discount can never exceed order total
      discountAmount = Math.min(discountAmount, Number(orderTotal))
      discountAmount = Math.round(discountAmount * 100) / 100

      res.json({
        success: true,
        data: {
          code: coupon.code,
          description: coupon.description,
          discountType: coupon.discount_type,
          discountValue: Number(coupon.discount_value),
          discountAmount,
          finalTotal: Math.round((Number(orderTotal) - discountAmount) * 100) / 100,
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

// ── GET /api/coupons/auto ─────────────────────────────────────
router.get(
  '/auto',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderTotal } = req.query

      if (!orderTotal || isNaN(Number(orderTotal))) {
        res.status(400).json({
          success: false,
          error: 'orderTotal must be a valid number',
        })
        return
      }

      // Get the best applicable auto discount for this order total
      const result = await pool.query(
        `SELECT * FROM auto_discounts
         WHERE is_active = true
           AND minimum_order <= $1
         ORDER BY discount_value DESC
         LIMIT 1`,
        [Number(orderTotal)]
      )

      if (result.rows.length === 0) {
        res.json({ success: true, data: null })
        return
      }

      const discount = result.rows[0]
      let discountAmount = 0

      if (discount.discount_type === 'percentage') {
        discountAmount =
          (Number(orderTotal) * Number(discount.discount_value)) / 100
      } else {
        discountAmount = Number(discount.discount_value)
      }

      discountAmount = Math.min(discountAmount, Number(orderTotal))
      discountAmount = Math.round(discountAmount * 100) / 100

      res.json({
        success: true,
        data: {
          name: discount.name,
          description: discount.description,
          discountType: discount.discount_type,
          discountValue: Number(discount.discount_value),
          discountAmount,
          finalTotal: Math.round((Number(orderTotal) - discountAmount) * 100) / 100,
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

// ── GET /api/coupons/auto-discounts ──────────────────────────
// Must be registered BEFORE /:id to avoid route conflict
router.get(
  '/auto-discounts',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        'SELECT * FROM auto_discounts ORDER BY created_at DESC'
      )
      res.json({ success: true, data: result.rows })
    } catch (err) {
      next(err)
    }
  }
)

// ── POST /api/coupons/auto-discounts ─────────────────────────
router.post(
  '/auto-discounts',
  requireAuth,
  validateFields(['name', 'discount_type', 'discount_value']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        name,
        description,
        discount_type,
        discount_value,
        minimum_order = 0,
        is_active = true,
      } = req.body

      if (!isValidDiscountType(discount_type)) {
        res.status(400).json({
          success: false,
          error: 'discount_type must be "percentage" or "fixed"',
        })
        return
      }

      if (isNaN(Number(discount_value)) || Number(discount_value) <= 0) {
        res.status(400).json({
          success: false,
          error: 'discount_value must be a positive number',
        })
        return
      }

      if (discount_type === 'percentage' && Number(discount_value) > 100) {
        res.status(400).json({
          success: false,
          error: 'Percentage discount cannot exceed 100%',
        })
        return
      }

      const result = await pool.query(
        `INSERT INTO auto_discounts
          (name, description, discount_type, discount_value, minimum_order, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          sanitizeString(name),
          description ? sanitizeString(description) : null,
          discount_type,
          Number(discount_value),
          Number(minimum_order),
          Boolean(is_active),
        ]
      )

      res.status(201).json({ success: true, data: result.rows[0] })
    } catch (err) {
      next(err)
    }
  }
)

// ── GET /api/coupons ──────────────────────────────────────────
router.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        'SELECT * FROM coupons ORDER BY created_at DESC'
      )
      res.json({ success: true, data: result.rows })
    } catch (err) {
      next(err)
    }
  }
)

// ── POST /api/coupons ─────────────────────────────────────────
router.post(
  '/',
  requireAuth,
  validateFields(['code', 'discount_type', 'discount_value']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        code,
        description,
        discount_type,
        discount_value,
        minimum_order = 0,
        max_uses,
        expires_at,
      } = req.body

      // FIX: Was checking for 'flat' — DB schema uses 'fixed'
      if (!isValidDiscountType(discount_type)) {
        res.status(400).json({
          success: false,
          error: 'discount_type must be "percentage" or "fixed"',
        })
        return
      }

      if (isNaN(Number(discount_value)) || Number(discount_value) <= 0) {
        res.status(400).json({
          success: false,
          error: 'discount_value must be a positive number',
        })
        return
      }

      if (discount_type === 'percentage' && Number(discount_value) > 100) {
        res.status(400).json({
          success: false,
          error: 'Percentage discount cannot exceed 100%',
        })
        return
      }

      const result = await pool.query(
        `INSERT INTO coupons
          (code, description, discount_type, discount_value,
           minimum_order, max_uses, expires_at)
         VALUES (UPPER($1), $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          sanitizeString(code).toUpperCase(),
          description ? sanitizeString(description) : null,
          discount_type,
          Number(discount_value),
          Number(minimum_order),
          max_uses ? Number(max_uses) : null,
          expires_at || null,
        ]
      )

      res.status(201).json({ success: true, data: result.rows[0] })
    } catch (err: unknown) {
      // Duplicate coupon code
      if ((err as NodeJS.ErrnoException & { code?: string }).code === '23505') {
        res.status(409).json({
          success: false,
          error: 'Coupon code already exists',
        })
        return
      }
      next(err)
    }
  }
)

// ── PATCH /api/coupons/:id ────────────────────────────────────
router.patch(
  '/:id',
  requireAuth,
  validateUUID('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        description,
        discount_type,
        discount_value,
        minimum_order,
        max_uses,
        expires_at,
        is_active,
      } = req.body

      // Validate discount_type if provided
      if (discount_type !== undefined && !isValidDiscountType(discount_type)) {
        res.status(400).json({
          success: false,
          error: 'discount_type must be "percentage" or "fixed"',
        })
        return
      }

      if (
        discount_type === 'percentage' &&
        discount_value !== undefined &&
        Number(discount_value) > 100
      ) {
        res.status(400).json({
          success: false,
          error: 'Percentage discount cannot exceed 100%',
        })
        return
      }

      const result = await pool.query(
        `UPDATE coupons SET
          description    = COALESCE($1, description),
          discount_type  = COALESCE($2, discount_type),
          discount_value = COALESCE($3, discount_value),
          minimum_order  = COALESCE($4, minimum_order),
          max_uses       = COALESCE($5, max_uses),
          expires_at     = COALESCE($6, expires_at),
          is_active      = COALESCE($7, is_active)
         WHERE id = $8
         RETURNING *`,
        [
          description !== undefined ? sanitizeString(description) : null,
          discount_type ?? null,
          discount_value != null ? Number(discount_value) : null,
          minimum_order != null ? Number(minimum_order) : null,
          max_uses != null ? Number(max_uses) : null,
          expires_at ?? null,
          is_active != null ? Boolean(is_active) : null,
          req.params.id,
        ]
      )

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Coupon not found' })
        return
      }

      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      next(err)
    }
  }
)

// ── DELETE /api/coupons/:id ───────────────────────────────────
router.delete(
  '/:id',
  requireAuth,
  validateUUID('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        'DELETE FROM coupons WHERE id = $1 RETURNING id',
        [req.params.id]
      )

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Coupon not found' })
        return
      }

      res.json({ success: true, message: 'Coupon deleted' })
    } catch (err) {
      next(err)
    }
  }
)

export default router
