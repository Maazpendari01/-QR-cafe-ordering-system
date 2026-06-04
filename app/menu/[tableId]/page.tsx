export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import MenuWrapper from '@/components/order/menu/MenuWrapper'

interface Props {
  params: Promise<{ tableId: string }>
}

export default async function MenuPage({ params }: Props) {
  const { tableId } = await params

  const API_URL =
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'https://cafe-qr-backend-bhby.onrender.com'

  try {
    const tableRes = await fetch(`${API_URL}/api/tables/${tableId}`, {
      cache: 'no-store',
    })

    if (!tableRes.ok) notFound()

    const tableData = await tableRes.json()
    const table = tableData.data
    if (!table) notFound()

    const menuRes = await fetch(`${API_URL}/api/menu`, {
      cache: 'no-store',
    })

    if (!menuRes.ok) notFound()

    const menuData = await menuRes.json()
    const menuCategories = menuData.data || []

    const menuItems = menuCategories.flatMap((cat: any) =>
      (cat.items || []).map((item: any) => ({
        ...item,
        category_id: cat.id,
      }))
    )

    return (
      <MenuWrapper
        table={table}
        categories={menuCategories}
        menuItems={menuItems}
      />
    )
  } catch (error) {
    console.error('[MenuPage] Error:', error)
    notFound()
  }
}
