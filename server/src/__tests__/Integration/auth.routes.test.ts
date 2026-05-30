/**
 * Integration tests for POST /api/auth/register, /login, GET /me
 * Pool is mocked — no real database needed.
 */

import request from 'supertest'
import express from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

// ── Mock pool before any route imports ────────────────────────
const mockQuery = jest.fn()
jest.mock('../../db/pool', () => ({
  __esModule: true,
  default: { query: mockQuery, on: jest.fn() },
}))

import authRouter from '../../routes/auth'

// ── App setup ──────────────────────────────────────────────────
const app = express()
app.use(express.json())
app.use('/api/auth', authRouter)
app.use((err: any, req: any, res: any, _next: any) => {
  res.status(err.status || err.statusCode || 500).json({
    success: false,
    error: err.message || 'Internal server error',
  })
})

const JWT_SECRET = 'test-secret'

beforeEach(() => {
  jest.clearAllMocks()
  process.env.JWT_SECRET      = JWT_SECRET
  process.env.JWT_EXPIRES_IN  = '7d'
})

// ── POST /api/auth/register ────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('returns 400 when email is missing', async () => {
    const res = await request(app).post('/api/auth/register').send({ password: 'secret123' })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 when password is missing', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'a@b.com' })
    expect(res.status).toBe(400)
  })

  it('returns 403 when an admin already exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] }) // COUNT
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'secret123' })
    expect(res.status).toBe(403)
    expect(res.body.error).toContain('Admin already exists')
  })

  it('returns 400 for invalid email format', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }) // COUNT
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'secret123' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('email')
  })

  it('returns 400 for a password shorter than 6 characters', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }) // COUNT
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'admin@cafe.com', password: 'abc' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('6 characters')
  })

  it('creates admin and returns 201 with a JWT token', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }) // COUNT — no admin yet
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'new-uuid', email: 'admin@cafe.com', created_at: new Date() }],
    }) // INSERT

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'admin@cafe.com', password: 'secret123' })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.token).toBeDefined()
    expect(res.body.data.admin.email).toBe('admin@cafe.com')
  })
})

// ── POST /api/auth/login ───────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns 400 when email is missing', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: 'admin123' })
    expect(res.status).toBe(400)
  })

  it('returns 401 when admin does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }) // SELECT — not found
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unknown@cafe.com', password: 'admin123' })
    expect(res.status).toBe(401)
    expect(res.body.error).toContain('Invalid email or password')
  })

  it('returns 401 when password is incorrect', async () => {
    const hash = await bcrypt.hash('correct-password', 10)
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'uuid', email: 'admin@cafe.com', password_hash: hash }],
    })
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@cafe.com', password: 'wrong-password' })
    expect(res.status).toBe(401)
  })

  it('returns 200 and a JWT token on success', async () => {
    const hash = await bcrypt.hash('admin123', 10)
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'admin-uuid', email: 'admin@cafe.com', password_hash: hash, created_at: new Date() }],
    })
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@cafe.com', password: 'admin123' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.token).toBeDefined()

    // Token must be verifiable
    const decoded = jwt.verify(res.body.data.token, JWT_SECRET) as any
    expect(decoded.id).toBe('admin-uuid')
  })
})

// ── GET /api/auth/me ───────────────────────────────────────────

describe('GET /api/auth/me', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('returns 401 for an invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer bad.token')
    expect(res.status).toBe(401)
  })

  it('returns 200 with admin info for a valid token', async () => {
    const token = jwt.sign({ id: 'admin-uuid', email: 'admin@cafe.com' }, JWT_SECRET, { expiresIn: '1h' })

    // requireAuth DB check
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'admin-uuid', email: 'admin@cafe.com' }] })
    // GET /me own query
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'admin-uuid', email: 'admin@cafe.com', created_at: new Date() }],
    })

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.email).toBe('admin@cafe.com')
  })
})

// ── POST /api/auth/change-password ────────────────────────────

describe('POST /api/auth/change-password', () => {
  const token = () =>
    jwt.sign({ id: 'admin-uuid', email: 'admin@cafe.com' }, JWT_SECRET, { expiresIn: '1h' })

  it('returns 401 without a token', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'old', newPassword: 'newpass' })
    expect(res.status).toBe(401)
  })

  it('returns 400 if newPassword is shorter than 6 chars', async () => {
    // requireAuth DB check
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'admin-uuid', email: 'admin@cafe.com' }] })

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token()}`)
      .send({ currentPassword: 'oldpass', newPassword: '123' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('6 characters')
  })

  it('returns 401 when current password is wrong', async () => {
    const hash = await bcrypt.hash('correct-old', 10)
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'admin-uuid', email: 'admin@cafe.com' }] }) // requireAuth
      .mockResolvedValueOnce({ rows: [{ password_hash: hash }] }) // SELECT hash

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token()}`)
      .send({ currentPassword: 'wrong-old', newPassword: 'newpass123' })
    expect(res.status).toBe(401)
  })

  it('returns 200 on successful password change', async () => {
    const hash = await bcrypt.hash('old-pass', 10)
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'admin-uuid', email: 'admin@cafe.com' }] }) // requireAuth
      .mockResolvedValueOnce({ rows: [{ password_hash: hash }] })  // SELECT hash
      .mockResolvedValueOnce({ rows: [] })                          // UPDATE

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token()}`)
      .send({ currentPassword: 'old-pass', newPassword: 'new-pass123' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})
