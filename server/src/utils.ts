// ── Custom Error Classes ──────────────────────────────────────────

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, message)
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(400, message)
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message)
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(409, message)
  }
}

// ── Environment Validation ────────────────────────────────────────

export function validateEnv(): void {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'FRONTEND_URL',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
  ]

  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    console.error(`❌ Missing environment variables: ${missing.join(', ')}`)
    process.exit(1)
  }

  console.log('✅ All required environment variables are set')
}
