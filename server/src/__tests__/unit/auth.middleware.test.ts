/**
 * Unit tests for src/middleware/auth.ts
 * Mocks pool so no real DB connection needed.
 */

import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

// ── Mock pool BEFORE importing middleware ──────────────────────
const mockQuery = jest.fn()
jest.mock('../../db/pool', () => ({
  __esModule: true,
  default: { query: mockQuery, on: jest.fn() },
}))

import { requireAuth, requireKitchenAuth, AuthRequest } from '../../middleware/auth'

// ── Helpers ────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret'

function makeToken(payload: object = { id: 'admin-uuid', email: 'admin@cafe.com' }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' })
}

function mockRes() {
  const res: Partial<Response> = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json   = jest.fn().mockReturnValue(res)
  return res as Response
}

const next: NextFunction = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  process.env.JWT_SECRET        = JWT_SECRET
  process.env.KITCHEN_PASSWORD  = 'kitchen123'
})

// ── requireAuth ────────────────────────────────────────────────

describe('requireAuth', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const req = { headers: {} } as AuthRequest
    const res = mockRes()
    await requireAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when Authorization header has no Bearer prefix', async () => {
    const req = { headers: { authorization: 'Basic abc123' } } as AuthRequest
    const res = mockRes()
    await requireAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('returns 401 for an invalid JWT token', async () => {
    const req = { headers: { authorization: 'Bearer not.a.token' } } as AuthRequest
    const res = mockRes()
    await requireAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    const body = (res.json as jest.Mock).mock.calls[0][0]
    expect(body.error).toContain('invalid token')
  })

  it('returns 401 for an expired token', async () => {
    const expired = jwt.sign({ id: 'uuid', email: 'x@x.com' }, JWT_SECRET, { expiresIn: -1 })
    const req = { headers: { authorization: `Bearer ${expired}` } } as AuthRequest
    const res = mockRes()
    await requireAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('returns 401 when admin is not found in DB', async () => {
    mockQuery.mockResolvedValue({ rows: [] })
    const token = makeToken()
    const req = { headers: { authorization: `Bearer ${token}` } } as AuthRequest
    const res = mockRes()
    await requireAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    const body = (res.json as jest.Mock).mock.calls[0][0]
    expect(body.error).toContain('admin not found')
  })

  it('attaches req.admin and calls next() for a valid token', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: 'admin-uuid', email: 'admin@cafe.com' }],
    })
    const token = makeToken({ id: 'admin-uuid', email: 'admin@cafe.com' })
    const req = { headers: { authorization: `Bearer ${token}` } } as AuthRequest
    const res = mockRes()
    await requireAuth(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(req.admin).toEqual({ id: 'admin-uuid', email: 'admin@cafe.com' })
  })
})

// ── requireKitchenAuth ─────────────────────────────────────────

describe('requireKitchenAuth', () => {
  it('returns 401 when x-kitchen-key header is missing', () => {
    const req = { headers: {} } as Request
    const res = mockRes()
    requireKitchenAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('returns 401 when x-kitchen-key is wrong', () => {
    const req = { headers: { 'x-kitchen-key': 'wrong-key' } } as unknown as Request
    const res = mockRes()
    requireKitchenAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('calls next() with the correct kitchen key', () => {
    const req = { headers: { 'x-kitchen-key': 'kitchen123' } } as unknown as Request
    const res = mockRes()
    requireKitchenAuth(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })
})
