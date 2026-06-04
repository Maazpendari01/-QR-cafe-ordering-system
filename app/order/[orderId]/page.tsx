import OrderStatusClient from '@/components/order/OrderStatusClient'

interface Props {
  params: Promise<{ orderId: string }>
}

export default async function OrderPage({ params }: Props) {
  const { orderId } = await params
  return <OrderStatusClient orderId={orderId} />
}
