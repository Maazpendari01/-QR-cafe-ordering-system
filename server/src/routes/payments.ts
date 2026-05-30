import { Router, Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import pool from '../db/pool'
import { validateFields, validateUUID } from '../middleware/validate'
import { broadcastToKitchens } from './kitchen'

const router = Router()

// ── Lazy load Razorpay ────────────────────────────────────────
// Server starts in cash-only mode if credentials are missing.
// Throws only when an online payment is actually attempted.
function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay credentials not configured in .env')
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Razorpay = require('razorpay')
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  })
}

// ── POST /api/payments/create ─────────────────────────────────
router.post(
  '/create',
  validateFields(['orderId']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderId } = req.body

      const orderResult = await pool.query(
        'SELECT * FROM orders WHERE id = $1',
        [orderId]
      )

      if (orderResult.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Order not found' })
        return
      }

      const order = orderResult.rows[0]

      if (order.payment_status === 'paid') {
        res.status(400).json({ success: false, error: 'Order is already paid' })
        return
      }

      if (order.payment_method !== 'online') {
        res.status(400).json({
          success: false,
          error: 'This order is set for cash payment',
        })
        return
      }

      // Always use DB amount — never trust client-supplied amount
      const dbAmount = Number(order.total_amount)

      if (dbAmount <= 0) {
        res.status(400).json({
          success: false,
          error: 'Order amount must be greater than 0',
        })
        return
      }

      const razorpay = getRazorpay()
      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(dbAmount * 100), // paise
        currency: 'INR',
        receipt: `order_${Date.now()}`,
        notes: {
          order_id: orderId,
          table_id: order.table_id,
        },
      })

      await pool.query(
        `UPDATE orders
         SET razorpay_order_id = $1, updated_at = NOW()
         WHERE id = $2`,
        [razorpayOrder.id, orderId]
      )

      res.json({
        success: true,
        data: {
          orderId: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          keyId: process.env.RAZORPAY_KEY_ID,
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

// ── POST /api/payments/verify ─────────────────────────────────
router.post(
  '/verify',
  validateFields([
    'razorpay_order_id',
    'razorpay_payment_id',
    'razorpay_signature',
    'orderId',
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        orderId,
        customerEmail,
        customerPhone,
        tableName,
      } = req.body as {
        razorpay_order_id: string
        razorpay_payment_id: string
        razorpay_signature: string
        orderId: string
        customerEmail?: string
        customerPhone?: string
        tableName?: string
      }

      // Verify Razorpay signature
      const secret = process.env.RAZORPAY_KEY_SECRET
      if (!secret) {
        throw new Error('RAZORPAY_KEY_SECRET not configured')
      }

      const body = `${razorpay_order_id}|${razorpay_payment_id}`
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex')

      if (expectedSignature !== razorpay_signature) {
        await pool.query(
          `UPDATE orders SET payment_status = 'failed', updated_at = NOW()
           WHERE id = $1 AND payment_status = 'pending'`,
          [orderId]
        )
        res.status(400).json({
          success: false,
          error: 'Payment verification failed — invalid signature',
        })
        return
      }

      // AND payment_status != 'paid' prevents double-update if webhook fires first
      const result = await pool.query(
        `UPDATE orders SET
          payment_status      = 'paid',
          razorpay_order_id   = $1,
          razorpay_payment_id = $2,
          updated_at          = NOW()
         WHERE id = $3
           AND payment_status != 'paid'
         RETURNING *`,
        [razorpay_order_id, razorpay_payment_id, orderId]
      )

      // If 0 rows — webhook already marked it paid. Fetch for response.
      const order =
        result.rows.length > 0
          ? result.rows[0]
          : (
              await pool.query('SELECT * FROM orders WHERE id = $1', [orderId])
            ).rows[0]

      if (!order) {
        res.status(404).json({ success: false, error: 'Order not found' })
        return
      }

      // Only broadcast + notify if we were the one to mark it paid
      if (result.rows.length > 0) {
        const itemsResult = await pool.query(
          'SELECT * FROM order_items WHERE order_id = $1',
          [orderId]
        )

        broadcastToKitchens('payment_confirmed', {
          order: {
            ...order,
            order_items: itemsResult.rows,
            table_name: tableName,
          },
          message: 'Payment confirmed — order is active',
        })

        // FIX: Increment coupon usage here for online payments.
        // Cash orders increment on creation (orders.ts).
        // Online orders must wait until payment is confirmed —
        // incrementing on order creation would burn coupons for abandoned payments.
        if (order.coupon_code) {
          try {
            await pool.query(
              `UPDATE coupons
               SET times_used = times_used + 1
               WHERE UPPER(code) = UPPER($1)
                 AND (max_uses IS NULL OR times_used < max_uses)`,
              [order.coupon_code]
            )
          } catch (couponErr) {
            // Don't fail payment if coupon update fails
            console.error('❌ Coupon increment failed:', couponErr)
          }
        }

        // Send SMS — don't fail payment if this errors
        if (customerPhone) {
          try {
            const { sendOrderConfirmationSMS } = await import('../services/sms')
            await sendOrderConfirmationSMS({
              phone: customerPhone,
              orderId,
              tableName,
              total: Number(order.total_amount),
              items: itemsResult.rows,
            })
          } catch (smsErr) {
            console.error('❌ SMS failed:', smsErr)
          }
        }

        // Send email — don't fail payment if this errors
        if (customerEmail) {
          try {
            const { sendOrderReceiptEmail } = await import('../services/email')
            await sendOrderReceiptEmail({
              email: customerEmail,
              orderId,
              tableName,
              total: Number(order.total_amount),
              items: itemsResult.rows,
              paymentId: razorpay_payment_id,
            })
          } catch (emailErr) {
            console.error('❌ Email failed:', emailErr)
          }
        }
      }

      res.json({
        success: true,
        message: 'Payment verified successfully',
        data: {
          orderId,
          paymentId: razorpay_payment_id,
          amount: order.total_amount,
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

// ── POST /api/payments/webhook ────────────────────────────────
// IMPORTANT: In server/src/index.ts add this BEFORE express.json():
//   app.use('/api/payments/webhook', express.raw({ type: 'application/json' }))
// Without this, express.json() parses the body first and HMAC
// signature verification always fails.
router.post(
  '/webhook',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
      const rawBody = req.body as Buffer

      if (webhookSecret) {
        const signature = req.headers['x-razorpay-signature'] as string
        const expectedSignature = crypto
          .createHmac('sha256', webhookSecret)
          .update(rawBody)
          .digest('hex')

        if (expectedSignature !== signature) {
          res.status(400).json({ success: false, error: 'Invalid webhook signature' })
          return
        }
      }

      const event = JSON.parse(rawBody.toString('utf8'))

      if (event.event === 'payment.captured') {
        const payment = event.payload.payment.entity
        const orderId = payment.notes?.order_id

        if (orderId) {
          await pool.query(
            `UPDATE orders SET
              payment_status      = 'paid',
              razorpay_payment_id = $1,
              updated_at          = NOW()
             WHERE id = $2
               AND payment_status != 'paid'`,
            [payment.id, orderId]
          )
          console.log(`✅ Webhook: payment confirmed for order ${orderId}`)
        }
      }

      if (event.event === 'payment.failed') {
        const payment = event.payload.payment.entity
        const orderId = payment.notes?.order_id

        if (orderId) {
          await pool.query(
            `UPDATE orders SET
              payment_status = 'failed',
              updated_at     = NOW()
             WHERE id = $1
               AND payment_status = 'pending'`,
            [orderId]
          )
          console.log(`❌ Webhook: payment failed for order ${orderId}`)
        }
      }

      res.json({ success: true, received: true })
    } catch (err) {
      next(err)
    }
  }
)

// ── GET /api/payments/status/:orderId ─────────────────────────
router.get(
  '/status/:orderId',
  validateUUID('orderId'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `SELECT
          id,
          status,
          payment_status,
          total_amount,
          razorpay_order_id,
          razorpay_payment_id,
          updated_at
         FROM orders WHERE id = $1`,
        [req.params.orderId]
      )

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Order not found' })
        return
      }

      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      next(err)
    }
  }
)

export default router
