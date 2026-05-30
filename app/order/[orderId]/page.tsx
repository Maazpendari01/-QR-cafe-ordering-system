import OrderStatusClient from '@/components/order/OrderStatusClient'

interface Props {
  params: { orderId: string }
}

export default function OrderPage({ params }: Props) {
  return <OrderStatusClient orderId={params.orderId} />
}
