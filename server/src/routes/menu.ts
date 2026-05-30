import { Router, Request, Response, NextFunction } from 'express'
import pool from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { validateFields, validateUUID, validatePrice } from '../middleware/validate'

const router = Router()

// ═══════════════════════════════════════════════════════════════
// SEED DATA — runs once to populate the database
// ═══════════════════════════════════════════════════════════════

export async function seedMenu(): Promise<void> {
  const client = await pool.connect()
  try {
    // Check if already seeded
    const existing = await client.query('SELECT COUNT(*) FROM categories')
    if (parseInt(existing.rows[0].count) > 0) {
      console.log('✅ Menu already seeded — skipping')
      return
    }

    console.log('🌱 Seeding menu data...')

    // ── Categories ──────────────────────────────────────────────
    const categoriesData = [
      { name: 'Coffee',                 sort_order: 1 },
      { name: 'Iced & Cold Beverages',  sort_order: 2 },
      { name: 'Desserts',               sort_order: 3 },
      { name: 'All-Day Café Plates',    sort_order: 4 },
    ]

    const categoryIds: Record<string, string> = {}

    for (const cat of categoriesData) {
      const result = await client.query(
        `INSERT INTO categories (name, sort_order)
         VALUES ($1, $2) RETURNING id`,
        [cat.name, cat.sort_order]
      )
      categoryIds[cat.name] = result.rows[0].id
    }

    console.log('✅ Categories seeded')

    // ── Menu Items ───────────────────────────────────────────────
    const menuItems = [
      // ── Coffee ──────────────────────────────────────────────
      {
        category: 'Coffee',
        name: 'Espresso',
        description: 'Strong single shot of pure espresso',
        price: 100, is_veg: true, sort_order: 1,
      },
      {
        category: 'Coffee',
        name: 'Filter Coffee',
        description: 'South Indian style filter coffee with frothy milk',
        price: 60, is_veg: true, sort_order: 2,
      },
      {
        category: 'Coffee',
        name: 'Cappuccino',
        description: 'Espresso with steamed milk and thick foam',
        price: 200, is_veg: true, sort_order: 3,
      },
      {
        category: 'Coffee',
        name: 'Latte',
        description: 'Smooth espresso with velvety steamed milk',
        price: 150, is_veg: true, sort_order: 4,
      },
      {
        category: 'Coffee',
        name: 'Americano',
        description: 'Espresso diluted with hot water, bold and clean',
        price: 200, is_veg: true, sort_order: 5,
      },
      {
        category: 'Coffee',
        name: 'Flat Coffee',
        description: 'Double espresso with steamed milk, less foam',
        price: 100, is_veg: true, sort_order: 6,
      },
      {
        category: 'Coffee',
        name: 'Moccha',
        description: 'Espresso with chocolate and steamed milk',
        price: 200, is_veg: true, sort_order: 7,
      },
      {
        category: 'Coffee',
        name: 'Irish',
        description: 'Rich espresso with a hint of Irish flavor',
        price: 200, is_veg: true, sort_order: 8,
      },
      {
        category: 'Coffee',
        name: 'Affogato',
        description: 'Vanilla ice cream drowned in hot espresso',
        price: 200, is_veg: true, sort_order: 9,
      },
      {
        category: 'Coffee',
        name: 'Cold Coffee',
        description: 'Chilled blended coffee with milk and ice',
        price: 120, is_veg: true, sort_order: 10,
      },
      {
        category: 'Coffee',
        name: 'Masala Chai',
        description: 'Spiced Indian tea with ginger and cardamom',
        price: 70, is_veg: true, sort_order: 11,
      },
      {
        category: 'Coffee',
        name: 'Dirty Chai Latte',
        description: 'Masala chai shot pulled through espresso — bold and spiced',
        price: 180, is_veg: true, sort_order: 12,
      },
      {
        category: 'Coffee',
        name: 'Dalgona Coffee',
        description: 'Whipped frothy coffee over chilled milk',
        price: 160, is_veg: true, sort_order: 13,
      },
      {
        category: 'Coffee',
        name: 'Hazelnut Latte',
        description: 'Espresso with hazelnut syrup and steamed milk',
        price: 180, is_veg: true, sort_order: 14,
      },

      // ── Iced & Cold Beverages ────────────────────────────────
      {
        category: 'Iced & Cold Beverages',
        name: 'Cold Chocolate',
        description: 'Rich blended chocolate drink with milk and ice',
        price: 150, is_veg: true, sort_order: 1,
      },
      {
        category: 'Iced & Cold Beverages',
        name: 'Hazelnut Cold Coffee',
        description: 'Cold coffee with hazelnut syrup and whipped cream',
        price: 150, is_veg: true, sort_order: 2,
      },
      {
        category: 'Iced & Cold Beverages',
        name: 'Iced Mocha',
        description: 'Chilled espresso with chocolate and milk over ice',
        price: 200, is_veg: true, sort_order: 3,
      },
      {
        category: 'Iced & Cold Beverages',
        name: 'Lemon Mint Cooler',
        description: 'Fresh lemon juice with mint and chilled soda',
        price: 150, is_veg: true, sort_order: 4,
      },
      {
        category: 'Iced & Cold Beverages',
        name: 'Oreo Shake',
        description: 'Thick milkshake blended with Oreo cookies',
        price: 150, is_veg: true, sort_order: 5,
      },
      {
        category: 'Iced & Cold Beverages',
        name: 'Peach Iced Tea',
        description: 'Chilled black tea with peach syrup and lemon',
        price: 150, is_veg: true, sort_order: 6,
      },
      {
        category: 'Iced & Cold Beverages',
        name: 'Mango Smoothie',
        description: 'Fresh mango blended with yogurt and honey',
        price: 180, is_veg: true, sort_order: 7,
      },
      {
        category: 'Iced & Cold Beverages',
        name: 'Strawberry Milkshake',
        description: 'Creamy milkshake with fresh strawberry flavor',
        price: 160, is_veg: true, sort_order: 8,
      },
      {
        category: 'Iced & Cold Beverages',
        name: 'Blue Lagoon',
        description: 'Blue curacao syrup with lemon and chilled soda',
        price: 170, is_veg: true, sort_order: 9,
      },
      {
        category: 'Iced & Cold Beverages',
        name: 'Virgin Mojito',
        description: 'Fresh mint, lime juice, sugar and soda water',
        price: 150, is_veg: true, sort_order: 10,
      },

      // ── Desserts ─────────────────────────────────────────────
      {
        category: 'Desserts',
        name: 'Chocolate Brownie',
        description: 'Dense fudgy chocolate brownie served warm',
        price: 140, is_veg: true, sort_order: 1,
      },
      {
        category: 'Desserts',
        name: 'Brownie with Ice Cream',
        description: 'Warm chocolate brownie with a scoop of vanilla ice cream',
        price: 150, is_veg: true, sort_order: 2,
      },
      {
        category: 'Desserts',
        name: 'Lava Cake',
        description: 'Warm chocolate cake with molten center',
        price: 180, is_veg: true, sort_order: 3,
      },
      {
        category: 'Desserts',
        name: 'Cheesecake',
        description: 'Creamy New York style cheesecake with berry compote',
        price: 150, is_veg: true, sort_order: 4,
      },
      {
        category: 'Desserts',
        name: 'Belgian Waffle',
        description: 'Crispy waffle with whipped cream, berries and maple syrup',
        price: 220, is_veg: true, sort_order: 5,
      },
      {
        category: 'Desserts',
        name: 'Tiramisu',
        description: 'Classic Italian dessert with mascarpone and espresso',
        price: 200, is_veg: true, sort_order: 6,
      },
      {
        category: 'Desserts',
        name: 'Nutella Pancakes',
        description: 'Fluffy pancakes with Nutella and banana slices',
        price: 180, is_veg: true, sort_order: 7,
      },

      // ── All-Day Café Plates ───────────────────────────────────
      {
        category: 'All-Day Café Plates',
        name: 'French Fries',
        description: 'Crispy golden fries with ketchup and mayo',
        price: 200, is_veg: true, sort_order: 1,
      },
      {
        category: 'All-Day Café Plates',
        name: 'Peri Peri Fries',
        description: 'Crispy fries tossed in spicy peri peri seasoning',
        price: 250, is_veg: true, sort_order: 2,
      },
      {
        category: 'All-Day Café Plates',
        name: 'Veg Panini',
        description: 'Grilled panini with veggies, pesto and mozzarella',
        price: 299, is_veg: true, sort_order: 3,
      },
      {
        category: 'All-Day Café Plates',
        name: 'Grilled Chicken Sandwich',
        description: 'Grilled chicken breast with lettuce, tomato and aioli',
        price: 250, is_veg: false, sort_order: 4,
      },
      {
        category: 'All-Day Café Plates',
        name: 'Gourmet Burger',
        description: 'Juicy beef patty with caramelized onions and special sauce',
        price: 200, is_veg: false, sort_order: 5,
      },
      {
        category: 'All-Day Café Plates',
        name: 'Creamy Pasta',
        description: 'Penne pasta in rich white sauce with herbs',
        price: 299, is_veg: true, sort_order: 6,
      },
      {
        category: 'All-Day Café Plates',
        name: 'Creamy Alfredo Pasta',
        description: 'Fettuccine in classic Alfredo sauce with parmesan',
        price: 299, is_veg: true, sort_order: 7,
      },
      {
        category: 'All-Day Café Plates',
        name: 'Paneer Butter Masala',
        description: 'Cottage cheese in rich tomato butter gravy with naan',
        price: 280, is_veg: true, sort_order: 8,
      },
      {
        category: 'All-Day Café Plates',
        name: 'Paneer Tikka Bowl',
        description: 'Grilled paneer tikka over saffron rice with mint chutney',
        price: 350, is_veg: true, sort_order: 9,
      },
      {
        category: 'All-Day Café Plates',
        name: 'Veg Buddha Bowl',
        description: 'Quinoa, roasted veggies, hummus and tahini dressing',
        price: 320, is_veg: true, sort_order: 10,
      },
      {
        category: 'All-Day Café Plates',
        name: 'Veg Fried Rice',
        description: 'Wok tossed fried rice with vegetables and soy sauce',
        price: 200, is_veg: true, sort_order: 11,
      },
      {
        category: 'All-Day Café Plates',
        name: 'Chicken Wrap',
        description: 'Grilled chicken with veggies and sauce in a soft tortilla',
        price: 280, is_veg: false, sort_order: 12,
      },
      {
        category: 'All-Day Café Plates',
        name: 'Margherita Pizza',
        description: 'Classic pizza with tomato sauce, mozzarella and fresh basil',
        price: 320, is_veg: true, sort_order: 13,
      },
      {
        category: 'All-Day Café Plates',
        name: 'Egg Bhurji Sandwich',
        description: 'Spiced scrambled eggs in toasted bread with chutney',
        price: 180, is_veg: false, sort_order: 14,
      },
      {
        category: 'All-Day Café Plates',
        name: 'Avocado Toast',
        description: 'Sourdough toast with smashed avocado, chilli flakes and lemon',
        price: 250, is_veg: true, sort_order: 15,
      },
      {
        category: 'All-Day Café Plates',
        name: 'Chicken Quesadilla',
        description: 'Crispy tortilla with grilled chicken, cheese and jalapeños',
        price: 300, is_veg: false, sort_order: 16,
      },
    ]

    // Insert all menu items
    for (const item of menuItems) {
      await client.query(
        `INSERT INTO menu_items
          (category_id, name, description, price, is_veg, is_available, sort_order)
         VALUES ($1, $2, $3, $4, $5, true, $6)`,
        [
          categoryIds[item.category],
          item.name,
          item.description,
          item.price,
          item.is_veg,
          item.sort_order,
        ]
      )
    }

    console.log(`✅ ${menuItems.length} menu items seeded`)
    console.log('🎉 Menu seeding complete!\n')

  } catch (err) {
    console.error('❌ Seeding failed:', err)
    throw err
  } finally {
    client.release()
  }
}

// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════

// ── GET /api/menu ─────────────────────────────────────────────
// Returns all categories with their items nested inside
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await pool.query(
      `SELECT * FROM categories ORDER BY sort_order ASC`
    )

    const items = await pool.query(
      `SELECT * FROM menu_items
       WHERE is_available = true
       ORDER BY sort_order ASC`
    )

    // Nest items inside their category
    const menu = categories.rows.map((cat) => ({
      ...cat,
      items: items.rows.filter((item) => item.category_id === cat.id),
    }))

    res.json({ success: true, data: menu })
  } catch (err) {
    next(err)
  }
})

// ── GET /api/menu/categories ──────────────────────────────────
router.get('/categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      `SELECT * FROM categories ORDER BY sort_order ASC`
    )
    res.json({ success: true, data: result.rows })
  } catch (err) {
    next(err)
  }
})

// ── GET /api/menu/items ───────────────────────────────────────
router.get('/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      `SELECT m.*, c.name AS category_name
       FROM menu_items m
       LEFT JOIN categories c ON m.category_id = c.id
       ORDER BY c.sort_order ASC, m.sort_order ASC`
    )
    res.json({ success: true, data: result.rows })
  } catch (err) {
    next(err)
  }
})

// ── GET /api/menu/items/:id ───────────────────────────────────
router.get('/items/:id', validateUUID('id'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      `SELECT m.*, c.name AS category_name
       FROM menu_items m
       LEFT JOIN categories c ON m.category_id = c.id
       WHERE m.id = $1`,
      [req.params.id]
    )

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Menu item not found' })
      return
    }

    res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/menu/categories ─────────────────────────────────
// Admin only
router.post(
  '/categories',
  requireAuth,
  validateFields(['name']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, sort_order = 0 } = req.body

      const result = await pool.query(
        `INSERT INTO categories (name, sort_order)
         VALUES ($1, $2) RETURNING *`,
        [name.trim(), sort_order]
      )

      res.status(201).json({
        success: true,
        message: 'Category created',
        data: result.rows[0],
      })
    } catch (err) {
      next(err)
    }
  }
)

// ── PUT /api/menu/categories/:id ──────────────────────────────
// Admin only
router.put(
  '/categories/:id',
  requireAuth,
  validateUUID('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, sort_order } = req.body

      const result = await pool.query(
        `UPDATE categories
         SET name = COALESCE($1, name),
             sort_order = COALESCE($2, sort_order)
         WHERE id = $3
         RETURNING *`,
        [name?.trim(), sort_order, req.params.id]
      )

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Category not found' })
        return
      }

      res.json({
        success: true,
        message: 'Category updated',
        data: result.rows[0],
      })
    } catch (err) {
      next(err)
    }
  }
)

// ── DELETE /api/menu/categories/:id ──────────────────────────
// Admin only
router.delete(
  '/categories/:id',
  requireAuth,
  validateUUID('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `DELETE FROM categories WHERE id = $1 RETURNING id`,
        [req.params.id]
      )

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Category not found' })
        return
      }

      res.json({ success: true, message: 'Category deleted' })
    } catch (err) {
      next(err)
    }
  }
)

// ── POST /api/menu/items ──────────────────────────────────────
// Admin only
router.post(
  '/items',
  requireAuth,
  validateFields(['name', 'price', 'category_id']),
  validatePrice,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        category_id,
        name,
        description,
        price,
        image_url,
        is_veg = true,
        is_available = true,
        sort_order = 0,
      } = req.body

      // Check category exists
      const cat = await pool.query(
        'SELECT id FROM categories WHERE id = $1',
        [category_id]
      )
      if (cat.rows.length === 0) {
        res.status(400).json({ success: false, error: 'Category not found' })
        return
      }

      const result = await pool.query(
        `INSERT INTO menu_items
          (category_id, name, description, price, image_url,
           is_veg, is_available, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          category_id,
          name.trim(),
          description?.trim() || null,
          Number(price),
          image_url || null,
          is_veg,
          is_available,
          sort_order,
        ]
      )

      res.status(201).json({
        success: true,
        message: 'Menu item created',
        data: result.rows[0],
      })
    } catch (err) {
      next(err)
    }
  }
)

// ── PUT /api/menu/items/:id ───────────────────────────────────
// Admin only
router.put(
  '/items/:id',
  requireAuth,
  validateUUID('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        category_id,
        name,
        description,
        price,
        image_url,
        is_veg,
        is_available,
        sort_order,
      } = req.body

      const result = await pool.query(
        `UPDATE menu_items SET
          category_id  = COALESCE($1, category_id),
          name         = COALESCE($2, name),
          description  = COALESCE($3, description),
          price        = COALESCE($4, price),
          image_url    = COALESCE($5, image_url),
          is_veg       = COALESCE($6, is_veg),
          is_available = COALESCE($7, is_available),
          sort_order   = COALESCE($8, sort_order)
         WHERE id = $9
         RETURNING *`,
        [
          category_id,
          name?.trim(),
          description?.trim(),
          price ? Number(price) : undefined,
          image_url,
          is_veg,
          is_available,
          sort_order,
          req.params.id,
        ]
      )

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Menu item not found' })
        return
      }

      res.json({
        success: true,
        message: 'Menu item updated',
        data: result.rows[0],
      })
    } catch (err) {
      next(err)
    }
  }
)

// ── DELETE /api/menu/items/:id ────────────────────────────────
// Admin only
router.delete(
  '/items/:id',
  requireAuth,
  validateUUID('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query(
        `DELETE FROM menu_items WHERE id = $1 RETURNING id`,
        [req.params.id]
      )

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Menu item not found' })
        return
      }

      res.json({ success: true, message: 'Menu item deleted' })
    } catch (err) {
      next(err)
    }
  }
)

export default router
