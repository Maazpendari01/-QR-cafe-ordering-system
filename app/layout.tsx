import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Brew & Co',
  description: 'QR Cafe Ordering System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
