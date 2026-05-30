import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import pool from '../db/pool'

// Extend Express Request to include admin user
export interface AuthRequest extends Request {
  admin?: {
    id: string
    email: string
  }
}

// ── Verify JWT token ──────────────────────────────────────────────
export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: no token provided',
      })
      return
    }

    const token = authHeader.split(' ')[1]

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: token missing',
      })
      return
    }

    const secret = process.env.JWT_SECRET
    if (!secret) {
      throw new Error('JWT_SECRET not set in environment')
    }

    const decoded = jwt.verify(token, secret) as {
      id: string
      email: string
    }

    const result = await pool.query(
      'SELECT id, email FROM admins WHERE id = $1',
      [decoded.id]
    )

    if (result.rows.length === 0) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: admin not found',
      })
      return
    }

    req.admin = {
      id: decoded.id,
      email: decoded.email,
    }

    next()
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: invalid token',
      })
      return
    }
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: token expired, please login again',
      })
      return
    }
    next(err)
  }
}

// ── Kitchen middleware ────────────────────────────────────────────
export const requireKitchenAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const kitchenKey = req.headers['x-kitchen-key']

  if (!kitchenKey || kitchenKey !== process.env.KITCHEN_PASSWORD) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: invalid kitchen key',
    })
    return
  }

  next()
}
