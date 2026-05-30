'use client'

import { useState, useEffect } from 'react'
import SplashScreen from '@/components/order/menu/SplashScreen'
import MenuPageClient from '@/components/order/menu/MenuPageClient'
import type { Table, MenuCategory, MenuItem } from '@/types'

interface Props {
  table: Table
  categories: MenuCategory[]
  menuItems: MenuItem[]
}

export default function MenuWrapper({ table, categories, menuItems }: Props) {
  const [showSplash, setShowSplash] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setShowSplash(true)
  }, [])

  return (
    <>
      {mounted && showSplash && (
        <SplashScreen
          tableName={table.name}
          onComplete={() => setShowSplash(false)}
        />
      )}
      <div
        style={{
          opacity: !mounted || showSplash ? 0 : 1,
          transition: 'opacity 0.5s ease 0.1s',
        }}
      >
        <MenuPageClient
          table={table}
          categories={categories}
          menuItems={menuItems}
        />
      </div>
    </>
  )
}
