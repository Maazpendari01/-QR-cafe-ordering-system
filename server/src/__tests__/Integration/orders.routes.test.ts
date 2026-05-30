/**
 * Integration tests for /api/orders routes
 */

import request from 'supertest'
import express from 'express'
import jwt from 'jsonwebtoken'

// ── Mock pool + SSE broadcasts ─────────────────────────────────
const mockQuery   = jest.fn()
const mockConnect = jest.fn()
const mockClient  = { query: jest.fn(), release: jest.fn() }

jest.mock('../../db/pool', () => ({
  __esModule: true,
  default: { query: mockQuery, connect: mockConnect, on: jest.fn() },
}))

jest.mock('../../routes/kitchen', () => ({
  broadcastToKitchens: jest.fn(),
}))

jest.mock('../../routes/waiter', () => ({
  broadcastToWaiter: jest.fn(),
  default: express.Router(),
}))

import ordersRouter from '../../routes/orders'

const app = express()
app.use(express.json())
app.use('/api/orders', ordersRouter)
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(err.status || 500).json({ success: false, error: err.message })
})

const JWT_SECRET = 'test-secret'
const adminToken = jwt.sign({ id: 'admin-uuid', email: 'admin@cafe.com' }, JWT_SECRET, { expiresIn: '1h' })
const VALID_UUID  = '550e8400-e29b-41d4-a716-446655440000'
const TABLE_UUID  = '660e8400-e29b-41d4-a716-446655440001'
const ITEM_UUID   = '770e8400-e29b-41d4-a716-446655440002'
const ORDER_UUID  = '880e8400-e29b-41d4-a716-446655440003'

beforeEach(() => {
  jest.clearAllMocks()
  process.env.JWT_SECRET = JWT_SECRET
  mockConnect.mockResolvedValue(mockClient)
  mockClient.query.mockReset()
  mockClient.release.mockReset()
})

function adminAuth() {
  return { Authorization: `Bearer ${adminToken}` }
}
function mockAdminInDB() {
  mockQuery.mockResolvedValueOnce({ rows: [{ id: 'admin-uuid', email: 'admin@cafe.com' }] })
}

// ── POST /api/orders ───────────────────────────────────────────

describe('POST /api/orders', () => {
  const validBody = {
    table_id:       TABLE_UUID,
    customer_phone: '9876543210',
    items: [{ menu_item_id: ITEM_UUID, quantity: 2 }],
  }

  it('returns 400 when table_id is missing', async () => {
    const res = await request(app).post('/api/orders').send({ customer_phone: '9876543210', items: [] })
    expect(res.status).toBe(400)
  })

  it('returns 400 when items array is empty', async () => {
    const res = await request(app).post('/api/orders').send({ ...validBody, items: [] })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('non-empty array')
  })

  it('returns 400 when phone number is missing', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ table_id: TABLE_UUID, items: [{ menu_item_id: ITEM_UUID, quantity: 1 }] })
    expect(res.status).toBe(400)
  })

  it('returns 400 when item quantity is less than 1', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ ...validBody, items: [{ menu_item_id: ITEM_UUID, quantity: 0 }] })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('quantity')
  })

  it('returns 404 when table does not exist or is inactive', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }) // table not found
    const res = await request(app).post('/api/orders').send(validBody)
    expect(res.status).toBe(404)
    expect(res.body.error).toContain('Table not found')
  })

  it('returns 400 when a menu item is unavailable', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: TABLE_UUID, name: 'Table 1' }] }) // table
      .mockResolvedValueOnce({                                                   // menu items
        rows: [{ id: ITEM_UUID, name: 'Espresso', price: '100', is_available: false }],
      })
    const res = await request(app).post('/api/orders').send(validBody)
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('unavailable')
  })

  it('creates an order (cash) and returns 201', async () => {
    const newOrder = {
      id:             ORDER_UUID,
      table_id:       TABLE_UUID,
      status:         'pending',
      total_amount:   '200',
      payment_status: 'paid',      // cash → auto paid
      payment_method: 'cash',
    }

    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: TABLE_UUID, name: 'Table 1' }] })       // table
      .mockResolvedValueOnce({ rows: [{ id: ITEM_UUID, name: 'Espresso', price: '100', is_available: true }] }) // items
      .mockResolvedValueOnce(undefined)                                               // BEGIN
      .mockResolvedValueOnce({ rows: [newOrder] })                                   // INSERT order
      .mockResolvedValueOnce({ rows: [{ id: 'oi-uuid', name: 'Espresso' }] })        // INSERT order_item
      .mockResolvedValueOnce(undefined)                                               // COMMIT

    const res = await request(app)
      .post('/api/orders')
      .send({ ...validBody, payment_method: 'cash' })

    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('pending')
    expect(res.body.data.payment_status).toBe('paid')
  })

  it('rolls back on error and returns 500', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: TABLE_UUID, name: 'Table 1' }] })
      .mockResolvedValueOnce({ rows: [{ id: ITEM_UUID, name: 'Espresso', price: '100', is_available: true }] })
      .mockResolvedValueOnce(undefined)                             // BEGIN
      .mockRejectedValueOnce(new Error('DB insert failed'))         // INSERT throws
    mockClient.release.mockResolvedValue(undefined)

    const res = await request(app).post('/api/orders').send(validBody)
    expect(res.status).toBe(500)
    // ROLLBACK must have been called
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
  })
})

// ── GET /api/orders/:id (public) ──────────────────────────────

describe('GET /api/orders/:id', () => {
  it('returns 400 for invalid UUID', async () => {
    const res = await request(app).get('/api/orders/not-a-uuid')
    expect(res.status).toBe(400)
  })

  it('returns 404 when order not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const res = await request(app).get(`/api/orders/${ORDER_UUID}`)
    expect(res.status).toBe(404)
  })

  it('returns order with items', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: ORDER_UUID, status: 'pending', table_name: 'Table 1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'oi1', name: 'Espresso', quantity: 2, price: '100' }] })
    const res = await request(app).get(`/api/orders/${ORDER_UUID}`)
    expect(res.status).toBe(200)
    expect(res.body.data.order_items).toHaveLength(1)
  })
})

// ── PATCH /api/orders/:id/status ──────────────────────────────

describe('PATCH /api/orders/:id/status', () => {
  const fullOrder = {
    id:         ORDER_UUID,
    status:     'preparing',
    table_name: 'Table 1',
    items:      [],
  }

  it('returns 400 for invalid status', async () => {
    const res = await request(app)
      .patch(`/api/orders/${ORDER_UUID}/status`)
      .send({ status: 'cooking' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when order does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const res = await request(app)
      .patch(`/api/orders/${ORDER_UUID}/status`)
      .send({ status: 'preparing' })
    expect(res.status).toBe(404)
  })

  it('returns 400 when trying to revert status (backward move)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'ready' }] }) // current = ready
    const res = await request(app)
      .patch(`/api/orders/${ORDER_UUID}/status`)
      .send({ status: 'pending' }) // trying to go back
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Cannot go back')
  })

  it('updates status successfully', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'pending' }] })    // current status
      .mockResolvedValueOnce({ rows: [] })                          // UPDATE
      .mockResolvedValueOnce({ rows: [fullOrder] })                 // fetchFullOrder
    const res = await request(app)
      .patch(`/api/orders/${ORDER_UUID}/status`)
      .send({ status: 'preparing' })
    expect(res.status).toBe(200)
    expect(res.body.message).toContain('preparing')
  })
})

// ── GET /api/orders (admin only) ──────────────────────────────

describe('GET /api/orders', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/orders')
    expect(res.status).toBe(401)
  })

  it('returns order list for admin', async () => {
    mockAdminInDB()
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: ORDER_UUID, status: 'pending', table_name: 'Table 1', order_items: [] }],
    })
    const res = await request(app).get('/api/orders').set(adminAuth())
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
  })
})

// ── DELETE /api/orders/:id (admin only) ───────────────────────

describe('DELETE /api/orders/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).delete(`/api/orders/${ORDER_UUID}`)
    expect(res.status).toBe(401)
  })

  it('returns 404 when order does not exist', async () => {
    mockAdminInDB()
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const res = await request(app)
      .delete(`/api/orders/${ORDER_UUID}`)
      .set(adminAuth())
    expect(res.status).toBe(404)
  })

  it('deletes order and returns 200', async () => {
    mockAdminInDB()
    mockQuery.mockResolvedValueOnce({ rows: [{ id: ORDER_UUID }] })
    const res = await request(app)
      .delete(`/api/orders/${ORDER_UUID}`)
      .set(adminAuth())
    expect(res.status).toBe(200)
  })
})
