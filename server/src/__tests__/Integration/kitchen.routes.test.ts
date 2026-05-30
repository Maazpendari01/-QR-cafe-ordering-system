/**
 * Integration tests for /api/kitchen routes
 */

import request from 'supertest'
import express from 'express'

const mockQuery = jest.fn()
jest.mock('../../db/pool', () => ({
  __esModule: true,
  default: { query: mockQuery, on: jest.fn() },
}))

// Mock waiter broadcast so kitchen tests are isolated
jest.mock('../../routes/waiter', () => ({
  broadcastToWaiter: jest.fn(),
  default: express.Router(),
}))

import kitchenRouter from '../../routes/kitchen'

const app = express()
app.use(express.json())
app.use('/api/kitchen', kitchenRouter)
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(err.status || 500).json({ success: false, error: err.message })
})

const ORDER_UUID = '880e8400-e29b-41d4-a716-446655440003'

beforeEach(() => jest.clearAllMocks())

// ── GET /api/kitchen/orders ────────────────────────────────────

describe('GET /api/kitchen/orders', () => {
  it('returns active orders', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: ORDER_UUID, status: 'pending', table_name: 'Table 1', items: [] },
        { id: ORDER_UUID, status: 'preparing', table_name: 'Table 2', items: [] },
      ],
    })
    const res = await request(app).get('/api/kitchen/orders')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveLength(2)
  })

  it('returns empty array when no active orders', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const res = await request(app).get('/api/kitchen/orders')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'))
    const res = await request(app).get('/api/kitchen/orders')
    expect(res.status).toBe(500)
  })
})

// ── GET /api/kitchen/stats ─────────────────────────────────────

describe('GET /api/kitchen/stats', () => {
  it('returns order counts by status', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ pending: '3', preparing: '2', ready: '1', needs_attention: '0' }],
    })
    const res = await request(app).get('/api/kitchen/stats')
    expect(res.status).toBe(200)
    expect(res.body.data.pending).toBe('3')
  })
})

// ── PATCH /api/kitchen/orders/:id/status ──────────────────────

describe('PATCH /api/kitchen/orders/:id/status', () => {
  it('returns 400 for invalid status', async () => {
    const res = await request(app)
      .patch(`/api/kitchen/orders/${ORDER_UUID}/status`)
      .send({ status: 'burning' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Invalid status')
  })

  it('returns 404 when order does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }) // current order not found
    const res = await request(app)
      .patch(`/api/kitchen/orders/${ORDER_UUID}/status`)
      .send({ status: 'preparing' })
    expect(res.status).toBe(404)
  })

  it('updates order to preparing', async () => {
    const currentOrder = {
      id: ORDER_UUID, status: 'pending', table_id: 'tid',
      table_name: 'Table 1', customer_phone: null,
    }
    const fullOrder = {
      id: ORDER_UUID, status: 'preparing', table_name: 'Table 1', items: [],
    }

    mockQuery
      .mockResolvedValueOnce({ rows: [currentOrder] }) // SELECT current
      .mockResolvedValueOnce({ rows: [{ ...currentOrder, status: 'preparing' }] }) // UPDATE
      .mockResolvedValueOnce({ rows: [fullOrder] })     // full order for broadcast

    const res = await request(app)
      .patch(`/api/kitchen/orders/${ORDER_UUID}/status`)
      .send({ status: 'preparing' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('preparing')
  })

  it('updates order to ready', async () => {
    const currentOrder = { id: ORDER_UUID, status: 'preparing', table_id: 'tid', table_name: 'Table 1' }
    mockQuery
      .mockResolvedValueOnce({ rows: [currentOrder] })
      .mockResolvedValueOnce({ rows: [{ ...currentOrder, status: 'ready' }] })
      .mockResolvedValueOnce({ rows: [{ id: ORDER_UUID, status: 'ready', items: [] }] })

    const res = await request(app)
      .patch(`/api/kitchen/orders/${ORDER_UUID}/status`)
      .send({ status: 'ready' })
    expect(res.status).toBe(200)
  })

  it('handles needs_attention with reason', async () => {
    const currentOrder = { id: ORDER_UUID, status: 'preparing', table_id: 'tid', table_name: 'Table 1' }
    mockQuery
      .mockResolvedValueOnce({ rows: [currentOrder] })
      .mockResolvedValueOnce({ rows: [{ ...currentOrder, status: 'needs_attention' }] })
      .mockResolvedValueOnce({ rows: [{ id: ORDER_UUID, status: 'needs_attention', items: [] }] })

    const res = await request(app)
      .patch(`/api/kitchen/orders/${ORDER_UUID}/status`)
      .send({ status: 'needs_attention', attention_reason: 'Item out of stock' })
    expect(res.status).toBe(200)
  })
})
