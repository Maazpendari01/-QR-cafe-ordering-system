import MenuWrapper from '@/components/order/menu/MenuWrapper'

interface Props {
  params: { tableId: string }
}

export default async function MenuPage({ params }: Props) {
  const API_URL =
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'https://cafe-qr-backend-bhby.onrender.com'

  // Fetch table
  const tableRes = await fetch(`${API_URL}/api/tables/${params.tableId}`, {
    cache: 'no-store',
  })

  if (!tableRes.ok) {
    throw new Error(`Table API failed: ${tableRes.status}`)
  }

  const tableData = await tableRes.json()
  const table = tableData.data

  // Fetch menu
  const menuRes = await fetch(`${API_URL}/api/menu`, {
    cache: 'no-store',
  })

  if (!menuRes.ok) {
    throw new Error(`Menu API failed: ${menuRes.status}`)
  }

  const menuData = await menuRes.json()
  const menuCategories = menuData.data || []

  const menuItems = menuCategories.flatMap((cat: any) =>
    (cat.items || []).map((item: any) => ({
      ...item,
      category_id: cat.id,
    }))
  )

  // TEMPORARY DEBUG PAGE
  return (
    <div style={{ padding: 20, color: 'white', background: '#111', minHeight: '100vh' }}>
      <h1>Menu Route Works ✅</h1>

      <h2>Table</h2>
      <pre>{JSON.stringify(table, null, 2)}</pre>

      <h2>Categories</h2>
      <p>{menuCategories.length}</p>

      <h2>Items</h2>
      <p>{menuItems.length}</p>
    </div>
  )

  /*
  return (
    <MenuWrapper
      table={table}
      categories={menuCategories}
      menuItems={menuItems}
    />
  )
  */
}
