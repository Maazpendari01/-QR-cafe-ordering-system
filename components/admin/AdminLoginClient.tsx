'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api'

export default function AdminLoginClient() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please enter email and password')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await authApi.login(email, password)
      localStorage.setItem('cafe_admin_token', res.data.token)
      router.push('/admin')
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: '#0e0b08' }}
    >
      <div
        className="w-full max-w-sm rounded-3xl p-8"
        style={{
          background: '#1a1410',
          border: '1px solid rgba(200,169,110,0.15)',
        }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">☕</div>
          <h1
            className="text-3xl font-bold"
            style={{ fontFamily: 'Georgia, serif', color: '#c8a96e' }}
          >
            Brew & Co
          </h1>
          <p className="text-sm mt-1" style={{ color: '#6b5c47' }}>
            Admin Portal
          </p>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label
              className="text-xs font-semibold uppercase tracking-wider block mb-2"
              style={{ color: '#6b5c47' }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="admin@cafe.com"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
              style={{
                background: '#0e0b08',
                border: '1px solid rgba(200,169,110,0.2)',
                color: '#f5f0e8',
              }}
            />
          </div>

          <div>
            <label
              className="text-xs font-semibold uppercase tracking-wider block mb-2"
              style={{ color: '#6b5c47' }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
              style={{
                background: '#0e0b08',
                border: '1px solid rgba(200,169,110,0.2)',
                color: '#f5f0e8',
              }}
            />
          </div>

          {error && (
            <p
              className="text-sm text-center py-2 px-4 rounded-xl"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
            >
              {error}
            </p>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-sm transition-all mt-2"
            style={{
              background: loading
                ? 'rgba(200,169,110,0.5)'
                : 'linear-gradient(135deg, #c8a96e, #e8c584)',
              color: '#0e0b08',
            }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-amber-900/30 border-t-amber-900 rounded-full animate-spin" />
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </div>

        <p
          className="text-center text-xs mt-6"
          style={{ color: '#6b5c47' }}
        >
          Cafe QR Order System v1.0
        </p>
      </div>
    </div>
  )
}
