import { Router, Request, Response, NextFunction } from 'express'
import pool from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { validateUUID, validateFields } from '../middleware/validate'

const router = Router()

// ── GET /api/offers ───────────────────────────────────────────
// Public — get all active offers
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `SELECT id, code, description, discount_type, discount_value,
                min_order_amount, buy_quantity, get_quantity,
                (SELECT name FROM menu_items WHERE id = offers.get_item_id) as free_item_name,
                valid_from, valid_until
         FROM offers
         WHERE is_active = true
           AND (valid_from IS NULL OR valid_from <= NOW())
           AND (valid_until IS NULL OR valid_until >= NOW())
           AND (max_uses IS NULL OR used_count < max_uses)
         ORDER BY created_at DESC`
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

// ── POST /api/offers/validate ─────────────────────────────────
// Validate a coupon code and calculate discount
router.post(
  '/validate',
  validateFields(['code', 'orderAmount']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code, orderAmount } = req.body

      const result = await pool.query(
        `SELECT * FROM offers
         WHERE LOWER(code) = LOWER($1)
           AND is_active = true
           AND (valid_from IS NULL OR valid_from <= NOW())
           AND (valid_until IS NULL OR valid_until >= NOW())
           AND (max_uses IS NULL OR used_count < max_uses)`,
        [code]
      )

      if (result.rows.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid or expired coupon code',
        })
        return
      }

      const offer = result.rows[0]
      let discount = 0
      let message = ''

      // Check minimum order amount
      if (offer.min_order_amount && Number(orderAmount) < Number(offer.min_order_amount)) {
        res.status(400).json({
          success: false,
          error: `Minimum order amount of ₹${offer.min_order_amount} required`,
        })
        return
      }

      switch (offer.discount_type) {
        case 'percentage':
          discount = (Number(orderAmount) * Number(offer.discount_value)) / 100
          message = `${offer.discount_value}% off applied!`
          break

        case 'fixed':
          discount = Number(offer.discount_value)
          message = `₹${offer.discount_value} off applied!`
          break

        case 'buy_x_get_y':
          message = `Buy ${offer.buy_quantity} get ${offer.get_quantity} free!`
          discount = 0 // Discount shown as free item
          break

        case 'min_order':
          if (Number(orderAmount) >= Number(offer.discount_value)) {
            discount = Number(offer.min_order_amount) || 50
            message = `Flat ₹${discount} discount applied!`
          }
          break
      }

      res.json({
        success: true,
        data: {
          offer: {
            id: offer.id,
            code: offer.code,
            description: offer.description,
            discount_type: offer.discount_type,
          },
          discount,
          message,
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

// ── POST /api/offers ──────────────────────────────────────────
// Admin only — create a new offer
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
        min_order_amount,
        buy_quantity,
        get_quantity,
        get_item_id,
        max_uses,
        valid_from,
        valid_until,
      } = req.body

      // Check if code already exists
      const existing = await pool.query(
        'SELECT id FROM offers WHERE LOWER(code) = LOWER($1)',
        [code]
      )

      if (existing.rows.length > 0) {
        res.status(400).json({
          success: false,
          error: 'Coupon code already exists',
        })
        return
      }

      const result = await pool.query(
        `INSERT INTO offers
          (code, description, discount_type, discount_value,
           min_order_amount, buy_quantity, get_quantity, get_item_id,
           max_uses, valid_from, valid_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          code,
          description || null,
          discount_type,
          discount_value,
          min_order_amount || null,
          buy_quantity || null,
          get_quantity || null,
          get_item_id || null,
          max_uses || null,
          valid_from || null,
          valid_until || null,
        ]
      )

      res.status(201).json({
        success: true,
        message: 'Offer created successfully',
        data: result.rows[0],
      })
    } catch (err) {
      next(err)
    }
  }
)

// ── PUT /api/offers/:id ───────────────────────────────────────
// Admin only — update an offer
router.put(
  '/:id',
  requireAuth,
  validateUUID('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const {
        description,
        discount_value,
        min_order_amount,
        max_uses,
        is_active,
        valid_until,
      } = req.body

      const result = await pool.query(
        `UPDATE offers
         SET description = COALESCE($1, description),
             discount_value = COALESCE($2, discount_value),
             min_order_amount = COALESCE($3, min_order_amount),
             max_uses = COALESCE($4, max_uses),
             is_active = COALESCE($5, is_active),
             valid_until = $6
         WHERE id = $7
         RETURNING *`,
        [
          description,
          discount_value,
          min_order_amount,
          max_uses,
          is_active,
          valid_until,
          id,
        ]
      )

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Offer not found',
        })
        return
      }

      res.json({
        success: true,
        message: 'Offer updated',
        data: result.rows[0],
      })
    } catch (err) {
      next(err)
    }
  }
)

// ── DELETE /api/offers/:id ─────────────────────────────────────
// Admin only — delete an offer
router.delete(
  '/:id',
  requireAuth,
  validateUUID('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        'DELETE FROM offers WHERE id = $1 RETURNING id',
        [req.params.id]
      )

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Offer not found',
        })
        return
      }

      res.json({
        success: true,
        message: 'Offer deleted',
      })
    } catch (err) {
      next(err)
    }
  }
)

export default router