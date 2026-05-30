const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

class APIError extends Error {
  constructor(
    public status: number,
    public data: any,
    message: string
  ) {
    super(message)
    this.name = 'APIError'
  }
}

async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('cafe_admin_token')
      : null

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  })

  const data = await res.json()

  if (!res.ok) {
    const error = new APIError(
      res.status,
      data,
      data.error || `Request failed: ${res.status}`
    )
    throw error
  }

  return data
}

// ── Menu ──────────────────────────────────────────────────────
export const menuApi = {
  getAll: () =>
    apiFetch<any>('/api/menu'),

  getItems: () =>
    apiFetch<any>('/api/menu/items'),

  getCategories: () =>
    apiFetch<any>('/api/menu/categories'),

  createItem: (data: any) =>
    apiFetch<any>('/api/menu/items', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateItem: (id: string, data: any) =>
    apiFetch<any>(`/api/menu/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteItem: (id: string) =>
    apiFetch<any>(`/api/menu/items/${id}`, {
      method: 'DELETE',
    }),

  createCategory: (data: any) =>
    apiFetch<any>('/api/menu/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCategory: (id: string, data: any) =>
    apiFetch<any>(`/api/menu/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteCategory: (id: string) =>
    apiFetch<any>(`/api/menu/categories/${id}`, {
      method: 'DELETE',
    }),
}

// ── Tables ────────────────────────────────────────────────────
export const tablesApi = {
  getAll: () =>
    apiFetch<any>('/api/tables'),

  getAllAdmin: () =>
    apiFetch<any>('/api/tables/all'),

  getById: (id: string) =>
    apiFetch<any>(`/api/tables/${id}`),

  create: (data: any) =>
    apiFetch<any>('/api/tables', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: any) =>
    apiFetch<any>(`/api/tables/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch<any>(`/api/tables/${id}`, {
      method: 'DELETE',
    }),

  seed: () =>
    apiFetch<any>('/api/tables/seed', {
      method: 'POST',
    }),
}

// ── Orders ────────────────────────────────────────────────────
export const ordersApi = {
  create: (data: any) =>
    apiFetch<any>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getAll: (params?: Record<string, string>) => {
    const query = params
      ? '?' + new URLSearchParams(params).toString()
      : ''
    return apiFetch<any>(`/api/orders${query}`)
  },

  getById: (id: string) =>
    apiFetch<any>(`/api/orders/${id}`),

  updateStatus: (id: string, status: string) =>
    apiFetch<any>(`/api/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  delete: (id: string) =>
    apiFetch<any>(`/api/orders/${id}`, {
      method: 'DELETE',
    }),
}

// ── Kitchen ───────────────────────────────────────────────────
export const kitchenApi = {
  getOrders: () =>
    apiFetch<any>('/api/kitchen/orders'),

  getStats: () =>
    apiFetch<any>('/api/kitchen/stats'),

  updateStatus: (id: string, status: string) =>
    apiFetch<any>(`/api/kitchen/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  stream: () =>
    new EventSource(`${API_URL}/api/kitchen/stream`),
}

// ── Payments ──────────────────────────────────────────────────
export const paymentsApi = {
  create: (data: { orderId: string; amount: number }) =>
    apiFetch<any>('/api/payments/create', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  verify: (data: any) =>
    apiFetch<any>('/api/payments/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getStatus: (orderId: string) =>
    apiFetch<any>(`/api/payments/status/${orderId}`),
}

// ── Auth ──────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<any>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () =>
    apiFetch<any>('/api/auth/me'),

  logout: () => {
    localStorage.removeItem('cafe_admin_token')
  },
}

// ── Coupons ───────────────────────────────────────────────────
export const couponsApi = {
  apply: (code: string, orderTotal: number) =>
    apiFetch<any>('/api/coupons/apply', {
      method: 'POST',
      body: JSON.stringify({ code, orderTotal }),
    }),

  getAutoDiscount: (orderTotal: number) =>
    apiFetch<any>(`/api/coupons/auto?orderTotal=${orderTotal}`),

  getAll: () =>
    apiFetch<any>('/api/coupons'),

  create: (data: any) =>
    apiFetch<any>('/api/coupons', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: any) =>
    apiFetch<any>(`/api/coupons/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch<any>(`/api/coupons/${id}`, {
      method: 'DELETE',
    }),

  createAutoDiscount: (data: any) =>
    apiFetch<any>('/api/coupons/auto-discounts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getAutoDiscounts: () =>
    apiFetch<any>('/api/coupons/auto-discounts'),
}

export default apiFetch
