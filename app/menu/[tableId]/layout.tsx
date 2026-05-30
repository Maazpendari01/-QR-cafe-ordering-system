import { CartProvider } from '@/hooks/useCart'
import StickyOrderBar from '@/components/order/StickyOrderBar'

export default function MenuLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <CartProvider>
      {children}
      <StickyOrderBar />
    </CartProvider>
  )
}
