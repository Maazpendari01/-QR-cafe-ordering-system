// server/src/index.ts — Fixed: no DATABASE_URL required
import express, { Application, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import pool from './db/pool'

dotenv.config()

// ── Environment Validation (local-friendly) ───────────────────────
// DATABASE_URL is for cloud deploys only. Locally we use DB_HOST etc.
const REQUIRED_VARS = [
  'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET'
]
const missing = REQUIRED_VARS.filter(v => !process.env[v])
if (missing.length > 0) {
  console.error(`❌ Missing environment variables: ${missing.join(', ')}`)
  process.exit(1)
}

const app: Application = express()
const PORT = Number(process.env.PORT) || 5000

// ── Security ──────────────────────────────────────────────────
app.use(helmet())

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    const allowed = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'http://localhost:3001',
      'https://qr-cafe-ordering-system-ph6u.vercel.app',
    ]
    if (allowed.includes(origin)) return callback(null, true)
    // allow all vercel preview deployments
    if (/\.vercel\.app$/.test(origin)) return callback(null, true)
    // allow local network IPs
    if (/^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin)) return callback(null, true)
    callback(new Error(`CORS blocked: ${origin}`))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-kitchen-key'],
}))

// ── Rate limiting ─────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 1000 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, try again later.' },
})
app.use('/api/', limiter)

// ── Logging ───────────────────────────────────────────────────
app.use(morgan('dev'))

// ── Body parsing ──────────────────────────────────────────────
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// ── Routes ────────────────────────────────────────────────────
import authRouter     from './routes/auth'
import menuRouter     from './routes/menu'
import tablesRouter   from './routes/tables'
import ordersRouter   from './routes/orders'
import kitchenRouter  from './routes/kitchen'
import paymentsRouter from './routes/payments'
import couponsRouter  from './routes/coupons'
import waiterRouter   from './routes/waiter'

app.use('/api/auth',     authRouter)
app.use('/api/menu',     menuRouter)
app.use('/api/tables',   tablesRouter)
app.use('/api/orders',   ordersRouter)
app.use('/api/waiter',   waiterRouter)
app.use('/api/kitchen',  kitchenRouter)
app.use('/api/payments', paymentsRouter)
app.use('/api/coupons',  couponsRouter)

// ── Health check ──────────────────────────────────────────────
app.get('/health', async (req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1')
    res.json({
      success: true,
      message: 'Cafe backend is running',
      database: 'connected',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Database not connected',
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }
})

// ── 404 ───────────────────────────────────────────────────────
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
  })
})

// ── Global error handler ──────────────────────────────────────
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[ERROR]', err.message)
  const statusCode = (err as any).statusCode || 500
  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
})

// ── Start ─────────────────────────────────────────────────────
import { migrate } from './db/migrate'
import { seedMenu } from './routes/menu'

async function startServer(): Promise<void> {
  try {
    // 1. Verify connection
    await pool.query('SELECT 1')
    console.log('✅ Database connection verified')

    // 2. Create tables (safe: uses IF NOT EXISTS)
    await migrate()
    console.log('✅ Migrations complete')

    // 3. Seed menu data (tables now exist)
    await seedMenu()
    console.log('✅ Menu seeded')

    // 4. Start listening
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 Cafe backend running!`)
      console.log(`   Local:  http://localhost:${PORT}`)
      console.log(`   Health: http://localhost:${PORT}/health`)
      console.log(`   Mode:   ${process.env.NODE_ENV}\n`)
    })
  } catch (err) {
    console.error('❌ Failed to start server:', err)
    process.exit(1)
  }
}

startServer()

export default app
