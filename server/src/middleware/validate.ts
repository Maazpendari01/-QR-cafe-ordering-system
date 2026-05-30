import { Request, Response, NextFunction } from 'express'

// ── Valid order statuses ───────────────────────────────────────────
export const ORDER_STATUSES = [
  'pending',
  'preparing',
  'ready',
  'served',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

// ── Strip HTML tags from free-text inputs ─────────────────────────
// Only strips actual injection vectors (< >) not quotes,
// so customer notes like "Extra spicy, don't add onions" survive intact
export function sanitizeString(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    // Replace full opening+closing tags with their inner content (e.g. <script>alert(1)</script> -> alert(1))
    .replace(/<([a-z][a-z0-9]*)\b[^>]*>([\s\S]*?)<\/\1>/gi, '$2')
    // Remove any remaining stray < or > characters but keep the text inside (e.g. hello <world> -> hello world)
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 1000)
}

// ── Check required fields exist in body ───────────────────────────
// FIX: old check used loose falsy — rejected false and 0 as "missing"
// e.g. { is_veg: false } or { sort_order: 0 } would fail validation
export const validateFields = (requiredFields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const missing = requiredFields.filter((field) => {
      const value = req.body[field]
      return (
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim() === '')
      )
    })

    if (missing.length > 0) {
      res.status(400).json({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}`,
      })
      return
    }

    next()
  }
}

// ── Validate UUID format ───────────────────────────────────────────
export const validateUUID = (paramName: string = 'id') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const uuid = req.params[paramName]
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    if (!uuidRegex.test(uuid)) {
      res.status(400).json({
        success: false,
        error: `Invalid ${paramName}: must be a valid UUID`,
      })
      return
    }

    next()
  }
}

// ── Validate order status ─────────────────────────────────────────
export const validateOrderStatus = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { status } = req.body

  if (status && !ORDER_STATUSES.includes(status)) {
    res.status(400).json({
      success: false,
      error: `Invalid status. Must be one of: ${ORDER_STATUSES.join(', ')}`,
    })
    return
  }

  next()
}

// ── Validate phone number ─────────────────────────────────────────
// Strips formatting chars first, then counts actual digits.
// Accepts 10-digit Indian numbers (starting 6-9) or international (10-15 digits).
// NOTE: Twilio will silently fail on malformed numbers — validate strictly here.
export const validatePhone = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { customer_phone } = req.body

  if (!customer_phone) {
    res.status(400).json({
      success: false,
      error: 'Phone number is required',
    })
    return
  }

  const digitsOnly = String(customer_phone).replace(/[\s\-().+]/g, '')
  const isIndian = /^[6-9]\d{9}$/.test(digitsOnly)
  const isInternational = /^\d{10,15}$/.test(digitsOnly)

  if (!isIndian && !isInternational) {
    res.status(400).json({
      success: false,
      error: 'Invalid phone number — must be a valid 10-digit Indian number or international number (10–15 digits)',
    })
    return
  }

  next()
}

// ── Validate price is positive number ────────────────────────────
export const validatePrice = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { price } = req.body

  if (price !== undefined) {
    const numPrice = Number(price)
    if (isNaN(numPrice) || numPrice <= 0) {
      res.status(400).json({
        success: false,
        error: 'Price must be a positive number',
      })
      return
    }
  }

  next()
}

// ── Validate & clamp pagination query params ──────────────────────
// Prevents ?limit=9999999 from loading entire DB into memory
export function parsePagination(query: Request['query']): {
  limit: number
  offset: number
} {
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100)
  const offset = Math.max(Number(query.offset) || 0, 0)
  return { limit, offset }
}
