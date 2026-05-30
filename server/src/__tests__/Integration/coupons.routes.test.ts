/**
 * Integration tests for /api/coupons routes
 */

import request from 'supertest'
import express from 'express'
import jwt from 'jsonwebtoken'

const mockQuery = jest.fn()
jest.mock('../../db/pool', () => ({
  __esModule: true,
  default: { query: mockQuery, on: jest.fn() },
}))

import couponsRouter from '../../routes/coupons'

const app = express()
app.use(express.json())
app.use('/api/coupons', couponsRouter)
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(err.status || 500).json({ success: false, error: err.message })
})

const JWT_SECRET = 'test-secret'
const adminToken = jwt.sign({ id: 'admin-uuid', email: 'admin@cafe.com' }, JWT_SECRET, { expiresIn: '1h' })
const VALID_UUID  = '550e8400-e29b-41d4-a716-446655440000'

beforeEach(() => {
  jest.clearAllMocks()
  process.env.JWT_SECRET = JWT_SECRET
})

function auth() { return { Authorization: `Bearer ${adminToken}` } }
function mockAdminAuth() {
  mockQuery.mockResolvedValueOnce({ rows: [{ id: 'admin-uuid', email: 'admin@cafe.com' }] })
}

// ── POST /api/coupons/apply ────────────────────────────────────

describe('POST /api/coupons/apply', () => {
  it('returns 400 when code is missing', async () => {
    const res = await request(app).post('/api/coupons/apply').send({ orderTotal: 300 })
    expect(res.status).toBe(400)
  })

  it('returns 400 when orderTotal is missing', async () => {
    const res = await request(app).post('/api/coupons/apply').send({ code: 'BREW20' })
    expect(res.status).toBe(400)
  })

  it('returns 404 for an invalid or expired coupon code', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }) // not found
    const res = await request(app)
      .post('/api/coupons/apply')
      .send({ code: 'INVALID', orderTotal: 500 })
    expect(res.status).toBe(404)
    expect(res.body.error).toContain('expired')
  })

  it('returns 400 when order total is below minimum', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ code: 'BREW20', discount_type: 'percentage', discount_value: '20', minimum_order: '200' }],
    })
    const res = await request(app)
      .post('/api/coupons/apply')
      .send({ code: 'BREW20', orderTotal: 100 }) // below 200
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Minimum order')
  })

  it('calculates percentage discount correctly', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        code: 'BREW20', description: '20% off',
        discount_type: 'percentage', discount_value: '20', minimum_order: '200',
      }],
    })
    const res = await request(app)
      .post('/api/coupons/apply')
      .send({ code: 'BREW20', orderTotal: 500 })
    expect(res.status).toBe(200)
    expect(res.body.data.discountAmount).toBe(100)    // 20% of 500
    expect(res.body.data.finalTotal).toBe(400)
  })

  it('calculates fixed discount correctly', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        code: 'FLAT50', description: '₹50 off',
        discount_type: 'fixed', discount_value: '50', minimum_order: '300',
      }],
    })
    const res = await request(app)
      .post('/api/coupons/apply')
      .send({ code: 'FLAT50', orderTotal: 350 })
    expect(res.status).toBe(200)
    expect(res.body.data.discountAmount).toBe(50)
    expect(res.body.data.finalTotal).toBe(300)
  })

  it('caps discount so final total never goes below 0', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        code: 'FLAT500', description: '₹500 off',
        discount_type: 'fixed', discount_value: '500', minimum_order: '0',
      }],
    })
    const res = await request(app)
      .post('/api/coupons/apply')
      .send({ code: 'FLAT500', orderTotal: 100 }) // discount > total
    expect(res.status).toBe(200)
    expect(res.body.data.discountAmount).toBe(100) // capped at order total
    expect(res.body.data.finalTotal).toBe(0)
  })
})

// ── GET /api/coupons/auto ──────────────────────────────────────

describe('GET /api/coupons/auto', () => {
  it('returns 400 when orderTotal query param is missing', async () => {
    const res = await request(app).get('/api/coupons/auto')
    expect(res.status).toBe(400)
  })

  it('returns null when no auto discount applies', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const res = await request(app).get('/api/coupons/auto?orderTotal=100')
    expect(res.status).toBe(200)
    expect(res.body.data).toBeNull()
  })

  it('returns auto discount for qualifying order', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        name: 'Big Order Deal', description: '15% off ₹500+',
        discount_type: 'percentage', discount_value: '15', minimum_order: '500',
      }],
    })
    const res = await request(app).get('/api/coupons/auto?orderTotal=600')
    expect(res.status).toBe(200)
    expect(res.body.data.discountAmount).toBe(90) // 15% of 600
    expect(res.body.data.finalTotal).toBe(510)
  })
})

// ── POST /api/coupons (admin) ─────────────────────────────────

describe('POST /api/coupons', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/coupons').send({ code: 'TEST', discount_type: 'percentage', discount_value: 10 })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid discount_type', async () => {
    mockAdminAuth()
    const res = await request(app)
      .post('/api/coupons')
      .set(auth())
      .send({ code: 'BAD', discount_type: 'flat', discount_value: 50 })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('percentage')
  })

  it('returns 400 for percentage > 100', async () => {
    mockAdminAuth()
    const res = await request(app)
      .post('/api/coupons')
      .set(auth())
      .send({ code: 'OVER', discount_type: 'percentage', discount_value: 150 })
    expect(res.status).toBe(400)
  })

  it('creates coupon and returns 201', async () => {
    mockAdminAuth()
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: VALID_UUID, code: 'SUMMER30', discount_type: 'percentage', discount_value: '30' }],
    })
    const res = await request(app)
      .post('/api/coupons')
      .set(auth())
      .send({ code: 'SUMMER30', discount_type: 'percentage', discount_value: 30 })
    expect(res.status).toBe(201)
    expect(res.body.data.code).toBe('SUMMER30')
  })

  it('returns 409 for duplicate coupon code', async () => {
    mockAdminAuth()
    const pgUniqueError: any = new Error('duplicate key')
    pgUniqueError.code = '23505'
    mockQuery.mockRejectedValueOnce(pgUniqueError)
    const res = await request(app)
      .post('/api/coupons')
      .set(auth())
      .send({ code: 'BREW20', discount_type: 'percentage', discount_value: 20 })
    expect(res.status).toBe(409)
    expect(res.body.error).toContain('already exists')
  })
})

// ── DELETE /api/coupons/:id (admin) ───────────────────────────

describe('DELETE /api/coupons/:id', () => {
  it('returns 404 when coupon not found', async () => {
    mockAdminAuth()
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const res = await request(app)
      .delete(`/api/coupons/${VALID_UUID}`)
      .set(auth())
    expect(res.status).toBe(404)
  })

  it('deletes coupon and returns 200', async () => {
    mockAdminAuth()
    mockQuery.mockResolvedValueOnce({ rows: [{ id: VALID_UUID }] })
    const res = await request(app)
      .delete(`/api/coupons/${VALID_UUID}`)
      .set(auth())
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})
