/**
 * Integration tests for /api/tables routes
 */

import request from 'supertest'
import express from 'express'
import jwt from 'jsonwebtoken'

const mockQuery = jest.fn()
jest.mock('../../db/pool', () => ({
  __esModule: true,
  default: { query: mockQuery, on: jest.fn() },
}))

import tablesRouter from '../../routes/tables'

const app = express()
app.use(express.json())
app.use('/api/tables', tablesRouter)
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

// ── GET /api/tables (public) ───────────────────────────────────

describe('GET /api/tables', () => {
  it('returns active tables', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'tid1', name: 'Table 1', capacity: 4, is_active: true },
        { id: 'tid2', name: 'Table 2', capacity: 2, is_active: true },
      ],
    })
    const res = await request(app).get('/api/tables')
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
  })

  it('returns empty array when no tables', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const res = await request(app).get('/api/tables')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })
})

// ── GET /api/tables/all (admin) ────────────────────────────────

describe('GET /api/tables/all', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/tables/all')
    expect(res.status).toBe(401)
  })

  it('returns all tables including inactive', async () => {
    mockAdminAuth()
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'tid1', name: 'Table 1', is_active: true },
        { id: 'tid2', name: 'Old Table', is_active: false },
      ],
    })
    const res = await request(app).get('/api/tables/all').set(auth())
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
  })
})

// ── GET /api/tables/:id (public) ──────────────────────────────

describe('GET /api/tables/:id', () => {
  it('returns 400 for invalid UUID', async () => {
    const res = await request(app).get('/api/tables/not-a-uuid')
    expect(res.status).toBe(400)
  })

  it('returns 404 when table not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const res = await request(app).get(`/api/tables/${VALID_UUID}`)
    expect(res.status).toBe(404)
  })

  it('returns table data', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: VALID_UUID, name: 'Table 1', capacity: 4, is_active: true }],
    })
    const res = await request(app).get(`/api/tables/${VALID_UUID}`)
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Table 1')
  })
})

// ── POST /api/tables (admin) ───────────────────────────────────

describe('POST /api/tables', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/tables').send({ name: 'Table 9' })
    expect(res.status).toBe(401)
  })

  it('returns 400 when name is missing', async () => {
    mockAdminAuth()
    const res = await request(app).post('/api/tables').set(auth()).send({})
    expect(res.status).toBe(400)
  })

  it('returns 400 for duplicate table name', async () => {
    mockAdminAuth()
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing' }] }) // duplicate check
    const res = await request(app)
      .post('/api/tables')
      .set(auth())
      .send({ name: 'Table 1' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('already exists')
  })

  it('returns 400 for capacity out of range', async () => {
    mockAdminAuth()
    mockQuery.mockResolvedValueOnce({ rows: [] }) // no duplicate
    const res = await request(app)
      .post('/api/tables')
      .set(auth())
      .send({ name: 'Mega Table', capacity: 50 })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Capacity')
  })

  it('creates table and returns 201', async () => {
    mockAdminAuth()
    mockQuery.mockResolvedValueOnce({ rows: [] }) // no duplicate
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: VALID_UUID, name: 'Table 9', capacity: 4, is_active: true }],
    })
    const res = await request(app)
      .post('/api/tables')
      .set(auth())
      .send({ name: 'Table 9', capacity: 4 })
    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Table 9')
  })
})

// ── PUT /api/tables/:id (admin) ────────────────────────────────

describe('PUT /api/tables/:id', () => {
  it('returns 404 when table does not exist', async () => {
    mockAdminAuth()
    mockQuery.mockResolvedValueOnce({ rows: [] }) // not found
    const res = await request(app)
      .put(`/api/tables/${VALID_UUID}`)
      .set(auth())
      .send({ name: 'New Name' })
    expect(res.status).toBe(404)
  })

  it('updates table and returns 200', async () => {
    mockAdminAuth()
    mockQuery.mockResolvedValueOnce({ rows: [{ id: VALID_UUID }] }) // exists
    mockQuery.mockResolvedValueOnce({ rows: [] })                    // no duplicate
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: VALID_UUID, name: 'Updated Table', capacity: 6, is_active: true }],
    })
    const res = await request(app)
      .put(`/api/tables/${VALID_UUID}`)
      .set(auth())
      .send({ name: 'Updated Table', capacity: 6 })
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Updated Table')
  })
})

// ── DELETE /api/tables/:id (admin) ────────────────────────────

describe('DELETE /api/tables/:id', () => {
  it('soft deletes (deactivates) when table has orders', async () => {
    mockAdminAuth()
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] }) // has orders
    mockQuery.mockResolvedValueOnce({ rows: [] })                // UPDATE

    const res = await request(app)
      .delete(`/api/tables/${VALID_UUID}`)
      .set(auth())
    expect(res.status).toBe(200)
    expect(res.body.message).toContain('deactivated')
  })

  it('hard deletes when table has no orders', async () => {
    mockAdminAuth()
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }) // no orders
    mockQuery.mockResolvedValueOnce({ rows: [{ id: VALID_UUID }] }) // DELETE success

    const res = await request(app)
      .delete(`/api/tables/${VALID_UUID}`)
      .set(auth())
    expect(res.status).toBe(200)
    expect(res.body.message).toContain('deleted')
  })
})
