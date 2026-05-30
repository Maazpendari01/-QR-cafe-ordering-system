import { Router, Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import jwt, { SignOptions, Secret } from 'jsonwebtoken'
import pool from '../db/pool'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { validateFields } from '../middleware/validate'

const router = Router()

// ── POST /api/auth/register ───────────────────────────────────
// Create first admin account — only works if no admins exist yet
router.post(
  '/register',
  validateFields(['email', 'password']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body

      // Only allow registration if no admins exist yet
      const existing = await pool.query(
        'SELECT COUNT(*) FROM admins'
      )
      if (parseInt(existing.rows[0].count) > 0) {
        res.status(403).json({
          success: false,
          error: 'Admin already exists. Contact your administrator.',
        })
        return
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        res.status(400).json({
          success: false,
          error: 'Invalid email format',
        })
        return
      }

      // Validate password length
      if (password.length < 6) {
        res.status(400).json({
          success: false,
          error: 'Password must be at least 6 characters',
        })
        return
      }

      // Hash password — never store plain text
      const salt = await bcrypt.genSalt(12)
      const password_hash = await bcrypt.hash(password, salt)

      // Create admin
      const result = await pool.query(
        `INSERT INTO admins (email, password_hash)
         VALUES ($1, $2)
         RETURNING id, email, created_at`,
        [email.toLowerCase().trim(), password_hash]
      )

      // Generate JWT token
      const secret = process.env.JWT_SECRET! as Secret
      const expiresIn = process.env.JWT_EXPIRES_IN || '7d'
      const token = jwt.sign(
        { id: result.rows[0].id, email: result.rows[0].email },
        secret,
        { expiresIn } as SignOptions
      )

      res.status(201).json({
        success: true,
        message: 'Admin account created successfully',
        data: {
          admin: result.rows[0],
          token,
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

// ── POST /api/auth/login ──────────────────────────────────────
// Admin login — returns JWT token
router.post(
  '/login',
  validateFields(['email', 'password']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body

      // Find admin by email
      const result = await pool.query(
        'SELECT * FROM admins WHERE email = $1',
        [email.toLowerCase().trim()]
      )

      if (result.rows.length === 0) {
        res.status(401).json({
          success: false,
          error: 'Invalid email or password',
        })
        return
      }

      const admin = result.rows[0]

      // Check password
      const isValid = await bcrypt.compare(password, admin.password_hash)
      if (!isValid) {
        res.status(401).json({
          success: false,
          error: 'Invalid email or password',
        })
        return
      }

      // Generate JWT token
      const secret = process.env.JWT_SECRET! as Secret
      const expiresIn = process.env.JWT_EXPIRES_IN || '7d'
      const token = jwt.sign(
        { id: admin.id, email: admin.email },
        secret,
        { expiresIn } as SignOptions
      )

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          admin: {
            id: admin.id,
            email: admin.email,
            created_at: admin.created_at,
          },
          token,
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

// ── GET /api/auth/me ──────────────────────────────────────────
// Get current logged in admin info
router.get(
  '/me',
  requireAuth,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        'SELECT id, email, created_at FROM admins WHERE id = $1',
        [req.admin!.id]
      )

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Admin not found',
        })
        return
      }

      res.json({
        success: true,
        data: result.rows[0],
      })
    } catch (err) {
      next(err)
    }
  }
)

// ── POST /api/auth/change-password ────────────────────────────
// Change admin password
router.post(
  '/change-password',
  requireAuth,
  validateFields(['currentPassword', 'newPassword']),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { currentPassword, newPassword } = req.body

      if (newPassword.length < 6) {
        res.status(400).json({
          success: false,
          error: 'New password must be at least 6 characters',
        })
        return
      }

      // Get current password hash
      const result = await pool.query(
        'SELECT password_hash FROM admins WHERE id = $1',
        [req.admin!.id]
      )

      // Verify current password
      const isValid = await bcrypt.compare(
        currentPassword,
        result.rows[0].password_hash
      )

      if (!isValid) {
        res.status(401).json({
          success: false,
          error: 'Current password is incorrect',
        })
        return
      }

      // Hash new password
      const salt = await bcrypt.genSalt(12)
      const password_hash = await bcrypt.hash(newPassword, salt)

      await pool.query(
        'UPDATE admins SET password_hash = $1 WHERE id = $2',
        [password_hash, req.admin!.id]
      )

      res.json({
        success: true,
        message: 'Password changed successfully',
      })
    } catch (err) {
      next(err)
    }
  }
)

export default router
