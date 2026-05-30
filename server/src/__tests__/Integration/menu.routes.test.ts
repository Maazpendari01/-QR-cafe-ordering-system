/**
 * Integration tests for /api/menu routes
 */

import request from 'supertest'
import express from 'express'
import jwt from 'jsonwebtoken'

const mockQuery = jest.fn()
jest.mock('../../db/pool', () => ({
  __esModule: true,
  default: { query: mockQuery, connect: jest.fn(), on: jest.fn() },
}))

import menuRouter from '../../routes/menu'

const app = express()
app.use(express.json())
app.use('/api/menu', menuRouter)
app.use((err: any, req: any, res: any, _next: any) => {
  res.status(err.status || 500).json({ success: false, error: err.message })
})

const JWT_SECRET = 'test-secret'
const adminToken = jwt.sign({ id: 'admin-uuid', email: 'admin@cafe.com' }, JWT_SECRET, { expiresIn: '1h' })

beforeEach(() => {
  jest.clearAllMocks()
  process.env.JWT_SECRET = JWT_SECRET
})

// ── Helpers ────────────────────────────────────────────────────

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'

function authHeader() {
  return { Authorization: `Bearer ${adminToken}` }
}

// requireAuth does one DB query to verify admin exists
function mockAuth() {
  mockQuery.mockResolvedValueOnce({ rows: [{ id: 'admin-uuid', email: 'admin@cafe.com' }] })
}

// ── GET /api/menu ──────────────────────────────────────────────

describe('GET /api/menu', () => {
  it('returns categories with nested items', async () => {
    const categories = [{ id: 'cat1', name: 'Coffee', sort_order: 1 }]
    const items = [{ id: 'item1', category_id: 'cat1', name: 'Espresso', is_available: true }]
    mockQuery
      .mockResolvedValueOnce({ rows: categories }) // categories
      .mockResolvedValueOnce({ rows: items })       // items

    const res = await request(app).get('/api/menu')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data[0].name).toBe('Coffee')
    expect(res.body.data[0].items[0].name).toBe('Espresso')
  })

  it('returns empty categories array when DB is empty', async () => {
    mockQuery.mockResolvedValue({ rows: [] })
    const res = await request(app).get('/api/menu')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })
})

// ── GET /api/menu/categories ───────────────────────────────────

describe('GET /api/menu/categories', () => {
  it('returns all categories', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'cat1', name: 'Coffee', sort_order: 1 },
        { id: 'cat2', name: 'Desserts', sort_order: 2 },
      ],
    })
    const res = await request(app).get('/api/menu/categories')
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
  })
})

// ── GET /api/menu/items ────────────────────────────────────────

describe('GET /api/menu/items', () => {
  it('returns all items with category name', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: VALID_UUID, name: 'Espresso', category_name: 'Coffee', price: '100' }],
    })
    const res = await request(app).get('/api/menu/items')
    expect(res.status).toBe(200)
    expect(res.body.data[0].name).toBe('Espresso')
  })
})

// ── GET /api/menu/items/:id ────────────────────────────────────

describe('GET /api/menu/items/:id', () => {
  it('returns 400 for invalid UUID', async () => {
    const res = await request(app).get('/api/menu/items/bad-id')
    expect(res.status).toBe(400)
  })

  it('returns 404 when item does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const res = await request(app).get(`/api/menu/items/${VALID_UUID}`)
    expect(res.status).toBe(404)
    expect(res.body.error).toContain('not found')
  })

  it('returns 200 with item data', async () => {
    const item = { id: VALID_UUID, name: 'Espresso', price: '100', category_name: 'Coffee' }
    mockQuery.mockResolvedValueOnce({ rows: [item] })
    const res = await request(app).get(`/api/menu/items/${VALID_UUID}`)
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Espresso')
  })
})

// ── POST /api/menu/categories (admin only) ─────────────────────

describe('POST /api/menu/categories', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/menu/categories').send({ name: 'Drinks' })
    expect(res.status).toBe(401)
  })

  it('returns 400 when name is missing', async () => {
    mockAuth()
    const res = await request(app)
      .post('/api/menu/categories')
      .set(authHeader())
      .send({})
    expect(res.status).toBe(400)
  })

  it('creates a category and returns 201', async () => {
    mockAuth()
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: VALID_UUID, name: 'Drinks', sort_order: 0 }],
    })
    const res = await request(app)
      .post('/api/menu/categories')
      .set(authHeader())
      .send({ name: 'Drinks' })
    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Drinks')
  })
})

// ── POST /api/menu/items (admin only) ─────────────────────────

describe('POST /api/menu/items', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/menu/items').send({ name: 'Latte', price: 150 })
    expect(res.status).toBe(401)
  })

  it('returns 400 when required fields are missing', async () => {
    mockAuth()
    const res = await request(app)
      .post('/api/menu/items')
      .set(authHeader())
      .send({ name: 'Latte' }) // missing price & category_id
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid price', async () => {
    mockAuth()
    const res = await request(app)
      .post('/api/menu/items')
      .set(authHeader())
      .send({ name: 'Latte', price: -50, category_id: VALID_UUID })
    expect(res.status).toBe(400)
  })

  it('returns 400 when category does not exist', async () => {
    mockAuth()
    mockQuery.mockResolvedValueOnce({ rows: [] }) // category check — not found
    const res = await request(app)
      .post('/api/menu/items')
      .set(authHeader())
      .send({ name: 'Latte', price: 150, category_id: VALID_UUID })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Category not found')
  })

  it('creates an item and returns 201', async () => {
    mockAuth()
    mockQuery.mockResolvedValueOnce({ rows: [{ id: VALID_UUID }] }) // category exists
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: VALID_UUID, name: 'Latte', price: '150', is_veg: true }],
    })
    const res = await request(app)
      .post('/api/menu/items')
      .set(authHeader())
      .send({ name: 'Latte', price: 150, category_id: VALID_UUID, is_veg: true })
    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Latte')
  })
})

// ── DELETE /api/menu/items/:id ─────────────────────────────────

describe('DELETE /api/menu/items/:id', () => {
  it('returns 400 for invalid UUID param', async () => {
    mockAuth()
    const res = await request(app)
      .delete('/api/menu/items/bad-id')
      .set(authHeader())
    expect(res.status).toBe(400)
  })

  it('returns 404 when item does not exist', async () => {
    mockAuth()
    mockQuery.mockResolvedValueOnce({ rows: [] }) // DELETE returns nothing
    const res = await request(app)
      .delete(`/api/menu/items/${VALID_UUID}`)
      .set(authHeader())
    expect(res.status).toBe(404)
  })

  it('deletes item and returns 200', async () => {
    mockAuth()
    mockQuery.mockResolvedValueOnce({ rows: [{ id: VALID_UUID }] })
    const res = await request(app)
      .delete(`/api/menu/items/${VALID_UUID}`)
      .set(authHeader())
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})

// ── DELETE /api/menu/categories/:id ───────────────────────────

describe('DELETE /api/menu/categories/:id', () => {
  it('returns 404 when category does not exist', async () => {
    mockAuth()
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const res = await request(app)
      .delete(`/api/menu/categories/${VALID_UUID}`)
      .set(authHeader())
    expect(res.status).toBe(404)
  })

  it('deletes category and returns 200', async () => {
    mockAuth()
    mockQuery.mockResolvedValueOnce({ rows: [{ id: VALID_UUID }] })
    const res = await request(app)
      .delete(`/api/menu/categories/${VALID_UUID}`)
      .set(authHeader())
    expect(res.status).toBe(200)
  })
})
