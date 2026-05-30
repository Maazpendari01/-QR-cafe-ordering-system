import pool from './pool'
import dotenv from 'dotenv'

dotenv.config()

async function migrate(): Promise<void> {
  const client = await pool.connect()

  try {
    console.log('🔄 Running migrations...')

    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    console.log('✅ admins table ready')

    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    console.log('✅ categories table ready')

    await client.query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        image_url TEXT,
        is_veg BOOLEAN DEFAULT true,
        is_available BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    console.log('✅ menu_items table ready')

    await client.query(`
      CREATE TABLE IF NOT EXISTS tables (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        capacity INTEGER DEFAULT 4,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    console.log('✅ tables table ready')

    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
        status VARCHAR(50) DEFAULT 'pending'
          CHECK (status IN ('pending','preparing','ready','served')),
        total_amount DECIMAL(10,2) NOT NULL,
        note TEXT,
        customer_phone VARCHAR(20),
        customer_email VARCHAR(255),
        payment_status VARCHAR(50) DEFAULT 'pending'
          CHECK (payment_status IN ('pending','paid','failed')),
        payment_method VARCHAR(20) DEFAULT 'online'
          CHECK (payment_method IN ('online','cash')),
        discount_amount DECIMAL(10,2) DEFAULT 0,
        coupon_code VARCHAR(50) DEFAULT NULL,
        razorpay_order_id VARCHAR(255),
        razorpay_payment_id VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    console.log('✅ orders table ready')

    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
        menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        quantity INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    console.log('✅ order_items table ready')

    await client.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50) UNIQUE NOT NULL,
        description VARCHAR(255),
        discount_type VARCHAR(20) NOT NULL
          CHECK (discount_type IN ('percentage','fixed')),
        discount_value DECIMAL(10,2) NOT NULL,
        minimum_order DECIMAL(10,2) DEFAULT 0,
        max_uses INTEGER DEFAULT NULL,
        times_used INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        expires_at TIMESTAMPTZ DEFAULT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    console.log('✅ coupons table ready')

    await client.query(`
      CREATE TABLE IF NOT EXISTS auto_discounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description VARCHAR(255),
        discount_type VARCHAR(20) NOT NULL
          CHECK (discount_type IN ('percentage','fixed')),
        discount_value DECIMAL(10,2) NOT NULL,
        minimum_order DECIMAL(10,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    console.log('✅ auto_discounts table ready')

    // Add new columns to orders if they don't exist
    await client.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20)
          DEFAULT 'online'
          CHECK (payment_method IN ('online','cash')),
        ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50) DEFAULT NULL
    `)
    console.log('✅ orders columns updated')

    // Auto update updated_at trigger
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `)

    await client.query(`
      DROP TRIGGER IF EXISTS orders_updated_at ON orders;
      CREATE TRIGGER orders_updated_at
        BEFORE UPDATE ON orders
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at()
    `)
    console.log('✅ updated_at trigger ready')

    // Add performance indexes on frequently queried columns
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
      CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON menu_items(category_id);
      CREATE INDEX IF NOT EXISTS idx_menu_items_is_available ON menu_items(is_available);
      CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
      CREATE INDEX IF NOT EXISTS idx_coupons_is_active ON coupons(is_active)
    `)
    console.log('✅ performance indexes created')

    console.log('\n🎉 All migrations completed!\n')

  } catch (err) {
    console.error('❌ Migration failed:', err)
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch((err) => {
  console.error(err)
  process.exit(1)
})
