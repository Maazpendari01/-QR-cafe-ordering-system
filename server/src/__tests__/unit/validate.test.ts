/**
 * Unit tests for src/middleware/validate.ts
 * No database — pure function / Express middleware testing.
 */

import { Request, Response, NextFunction } from 'express'
import {
  sanitizeString,
  validateFields,
  validateUUID,
  validateOrderStatus,
  validatePhone,
  validatePrice,
  parsePagination,
} from '../../middleware/validate'

// ── helpers ────────────────────────────────────────────────────

function mockRes() {
  const res: Partial<Response> = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json   = jest.fn().mockReturnValue(res)
  return res as Response
}

function mockReq(body: object = {}, params: object = {}, query: object = {}): Request {
  return { body, params, query } as unknown as Request
}

const next: NextFunction = jest.fn()

beforeEach(() => jest.clearAllMocks())

// ── sanitizeString ─────────────────────────────────────────────

describe('sanitizeString', () => {
  it('strips HTML tags', () => {
    expect(sanitizeString('<script>alert(1)</script>')).toBe('alert(1)')
  })

  it('removes < and > characters', () => {
    expect(sanitizeString('hello <world>')).toBe('hello world')
  })

  it('trims whitespace', () => {
    expect(sanitizeString('  hello  ')).toBe('hello')
  })

  it('returns empty string for non-string input', () => {
    expect(sanitizeString(123)).toBe('')
    expect(sanitizeString(null)).toBe('')
    expect(sanitizeString(undefined)).toBe('')
  })

  it('slices to 1000 characters', () => {
    const long = 'a'.repeat(2000)
    expect(sanitizeString(long)).toHaveLength(1000)
  })

  it('preserves apostrophes and quotes in notes', () => {
    expect(sanitizeString("don't add onions")).toBe("don't add onions")
  })
})

// ── validateFields ─────────────────────────────────────────────

describe('validateFields', () => {
  it('calls next() when all required fields are present', () => {
    const req = mockReq({ email: 'a@b.com', password: 'secret' })
    const res = mockRes()
    validateFields(['email', 'password'])(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('returns 400 when a field is missing', () => {
    const req = mockReq({ email: 'a@b.com' })
    const res = mockRes()
    validateFields(['email', 'password'])(req, res, next)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('password') })
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 400 when a field is an empty string', () => {
    const req = mockReq({ email: '' })
    const res = mockRes()
    validateFields(['email'])(req, res, next)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('does NOT reject false (boolean) as missing', () => {
    // is_veg: false is a valid value
    const req = mockReq({ is_veg: false })
    const res = mockRes()
    validateFields(['is_veg'])(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('does NOT reject 0 (number) as missing', () => {
    // sort_order: 0 is valid
    const req = mockReq({ sort_order: 0 })
    const res = mockRes()
    validateFields(['sort_order'])(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('reports all missing fields in error message', () => {
    const req = mockReq({})
    const res = mockRes()
    validateFields(['name', 'price', 'category_id'])(req, res, next)
    const errorMsg = (res.json as jest.Mock).mock.calls[0][0].error as string
    expect(errorMsg).toContain('name')
    expect(errorMsg).toContain('price')
    expect(errorMsg).toContain('category_id')
  })
})

// ── validateUUID ───────────────────────────────────────────────

describe('validateUUID', () => {
  it('calls next() for a valid UUID', () => {
    const req = mockReq({}, { id: '550e8400-e29b-41d4-a716-446655440000' })
    const res = mockRes()
    validateUUID('id')(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('returns 400 for an invalid UUID', () => {
    const req = mockReq({}, { id: 'not-a-uuid' })
    const res = mockRes()
    validateUUID('id')(req, res, next)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    )
  })

  it('returns 400 for a sequential integer ID', () => {
    const req = mockReq({}, { id: '12345' })
    const res = mockRes()
    validateUUID('id')(req, res, next)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('uses the provided param name', () => {
    const req = mockReq({}, { tableId: 'bad-id' })
    const res = mockRes()
    validateUUID('tableId')(req, res, next)
    expect(res.status).toHaveBeenCalledWith(400)
    const error = (res.json as jest.Mock).mock.calls[0][0].error as string
    expect(error).toContain('tableId')
  })
})

// ── validateOrderStatus ────────────────────────────────────────

describe('validateOrderStatus', () => {
  it('calls next() for valid statuses', () => {
    for (const status of ['pending', 'preparing', 'ready', 'served']) {
      const req = mockReq({ status })
      const res = mockRes()
      validateOrderStatus(req, res, next)
      expect(next).toHaveBeenCalled()
      jest.clearAllMocks()
    }
  })

  it('returns 400 for invalid status', () => {
    const req = mockReq({ status: 'cooking' })
    const res = mockRes()
    validateOrderStatus(req, res, next)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('calls next() when status is absent (optional field)', () => {
    const req = mockReq({})
    const res = mockRes()
    validateOrderStatus(req, res, next)
    expect(next).toHaveBeenCalled()
  })
})

// ── validatePhone ──────────────────────────────────────────────

describe('validatePhone', () => {
  it('accepts a valid 10-digit Indian mobile number', () => {
    const req = mockReq({ customer_phone: '9876543210' })
    const res = mockRes()
    validatePhone(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('accepts numbers starting with 6', () => {
    const req = mockReq({ customer_phone: '6012345678' })
    const res = mockRes()
    validatePhone(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('accepts international format (10–15 digits)', () => {
    const req = mockReq({ customer_phone: '14155552671' })
    const res = mockRes()
    validatePhone(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('rejects phone number shorter than 10 digits', () => {
    const req = mockReq({ customer_phone: '98765' })
    const res = mockRes()
    validatePhone(req, res, next)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('rejects missing phone number', () => {
    const req = mockReq({})
    const res = mockRes()
    validatePhone(req, res, next)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('strips formatting characters before validating', () => {
    const req = mockReq({ customer_phone: '+91 98765 43210' })
    const res = mockRes()
    validatePhone(req, res, next)
    expect(next).toHaveBeenCalled()
  })
})

// ── validatePrice ──────────────────────────────────────────────

describe('validatePrice', () => {
  it('calls next() for a positive number', () => {
    const req = mockReq({ price: 150 })
    const res = mockRes()
    validatePrice(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('calls next() when price is absent (not required by this middleware)', () => {
    const req = mockReq({})
    const res = mockRes()
    validatePrice(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('returns 400 for zero price', () => {
    const req = mockReq({ price: 0 })
    const res = mockRes()
    validatePrice(req, res, next)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 400 for negative price', () => {
    const req = mockReq({ price: -50 })
    const res = mockRes()
    validatePrice(req, res, next)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 400 for non-numeric price', () => {
    const req = mockReq({ price: 'free' })
    const res = mockRes()
    validatePrice(req, res, next)
    expect(res.status).toHaveBeenCalledWith(400)
  })
})

// ── parsePagination ────────────────────────────────────────────

describe('parsePagination', () => {
  it('returns defaults when no query params', () => {
    const { limit, offset } = parsePagination({})
    expect(limit).toBe(50)
    expect(offset).toBe(0)
  })

  it('clamps limit to max 100', () => {
    const { limit } = parsePagination({ limit: '9999' })
    expect(limit).toBe(100)
  })

  it('clamps limit to min 1', () => {
    const { limit } = parsePagination({ limit: '-5' })
    expect(limit).toBe(1)
  })

  it('clamps offset to min 0', () => {
    const { offset } = parsePagination({ offset: '-10' })
    expect(offset).toBe(0)
  })

  it('parses valid limit and offset', () => {
    const { limit, offset } = parsePagination({ limit: '20', offset: '40' })
    expect(limit).toBe(20)
    expect(offset).toBe(40)
  })
})
