import nodemailer from 'nodemailer'

interface EmailOptions {
  email: string
  orderId: string
  tableName: string
  total: number
  items: Array<{ name: string; quantity: number; price: number }>
  paymentId: string
}

function getTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('Gmail credentials not configured in .env')
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  })
}

export async function sendOrderReceiptEmail(
  options: EmailOptions
): Promise<void> {
  const { email, orderId, tableName, total, items, paymentId } = options

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('⚠️ Gmail not configured — skipping email')
    return
  }

  const transporter = getTransporter()

  // Build items table rows
  const itemRows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #f0f0f0">
          ${item.name}
        </td>
        <td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:center">
          ${item.quantity}
        </td>
        <td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:right">
          ₹${(item.price * item.quantity).toFixed(2)}
        </td>
      </tr>`
    )
    .join('')

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Order Receipt</title>
    </head>
    <body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">

      <!-- Header -->
      <div style="background:#f97316;padding:24px;border-radius:12px;text-align:center;margin-bottom:24px">
        <h1 style="color:white;margin:0;font-size:24px">☕ Café QR Order</h1>
        <p style="color:rgba(255,255,255,0.9);margin:8px 0 0">Payment Receipt</p>
      </div>

      <!-- Order Info -->
      <div style="background:#f9fafb;padding:16px;border-radius:8px;margin-bottom:20px">
        <p style="margin:4px 0"><strong>📍 Table:</strong> ${tableName}</p>
        <p style="margin:4px 0">
          <strong>🔖 Order ID:</strong>
          ${orderId.slice(0, 8).toUpperCase()}
        </p>
        <p style="margin:4px 0">
          <strong>💳 Payment ID:</strong> ${paymentId}
        </p>
        <p style="margin:4px 0">
          <strong>📅 Date:</strong>
          ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
        </p>
      </div>

      <!-- Items Table -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <thead>
          <tr style="background:#f97316;color:white">
            <th style="padding:10px;text-align:left;border-radius:8px 0 0 0">
              Item
            </th>
            <th style="padding:10px;text-align:center">Qty</th>
            <th style="padding:10px;text-align:right;border-radius:0 8px 0 0">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr style="background:#f9fafb">
            <td colspan="2"
              style="padding:12px;font-weight:bold;font-size:16px">
              Total
            </td>
            <td style="padding:12px;font-weight:bold;font-size:16px;
              text-align:right;color:#f97316">
              ₹${total.toFixed(2)}
            </td>
          </tr>
        </tfoot>
      </table>

      <!-- Footer -->
      <div style="text-align:center;color:#9ca3af;font-size:13px;
        border-top:1px solid #f0f0f0;padding-top:16px">
        <p>Thank you for dining with us! ☕</p>
        <p>Please keep this receipt for your reference.</p>
      </div>

    </body>
    </html>
  `

  await transporter.sendMail({
    from: `"Café QR Order" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `✅ Receipt — Order ${orderId.slice(0, 8).toUpperCase()} — ₹${total}`,
    html,
  })
}
