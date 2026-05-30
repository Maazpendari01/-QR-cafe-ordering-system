import { notFound } from 'next/navigation'
import MenuWrapper from '@/components/order/menu/MenuWrapper'

interface Props {
  params: { tableId: string }
}

export default async function MenuPage({ params }: Props) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

  // Fetch table
  const tableRes = await fetch(`${API_URL}/api/tables/${params.tableId}`, {
    cache: 'no-store',
  })

  if (!tableRes.ok) notFound()

  const tableData = await tableRes.json()
  const table = tableData.data

  // Fetch full menu
  const menuRes = await fetch(`${API_URL}/api/menu`, {
    cache: 'no-store',
  })

  const menuData = await menuRes.json()
  const menuCategories = menuData.data || []

  // Flatten items from categories
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
}
