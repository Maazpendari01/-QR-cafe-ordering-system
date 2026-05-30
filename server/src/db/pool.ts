import { Pool } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      }
    : {
        host:     process.env.DB_HOST,
        port:     Number(process.env.DB_PORT) || 5432,
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      }
)

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err.message)
})

export default pool
