import twilio from 'twilio'

interface SMSOptions {
  phone: string
  orderId: string
  tableName: string
  total: number
  items: Array<{ name: string; quantity: number; price: number }>
}

export async function sendOrderConfirmationSMS(
  options: SMSOptions
): Promise<void> {
  const { phone, orderId, tableName, total, items } = options

  if (
    !process.env.TWILIO_ACCOUNT_SID ||
    !process.env.TWILIO_AUTH_TOKEN ||
    !process.env.TWILIO_PHONE_NUMBER
  ) {
    console.warn('⚠️ Twilio not configured — skipping SMS')
    return
  }

  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  )

  // Build items summary
  const itemsSummary = items
    .map((i) => `${i.quantity}x ${i.name}`)
    .join(', ')

  const message =
    `✅ Order Confirmed! \n` +
    `📍 ${tableName}\n` +
    `🛒 ${itemsSummary}\n` +
    `💰 Total: ₹${total}\n` +
    `🔖 Order ID: ${orderId.slice(0, 8).toUpperCase()}\n` +
    `Your order is being prepared. Thank you! ☕`

  await client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phone.startsWith('+') ? phone : `+91${phone}`,
  })
}

export async function sendOrderReadySMS(
  phone: string,
  tableName: string
): Promise<void> {
  if (
    !process.env.TWILIO_ACCOUNT_SID ||
    !process.env.TWILIO_AUTH_TOKEN ||
    !process.env.TWILIO_PHONE_NUMBER
  ) {
    console.warn('⚠️ Twilio not configured — skipping SMS')
    return
  }

  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  )

  const message =
    `🔔 Your order is READY!\n` +
    `📍 ${tableName}\n` +
    `Please collect your order. Enjoy your meal! ☕`

  await client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phone.startsWith('+') ? phone : `+91${phone}`,
  })
}
