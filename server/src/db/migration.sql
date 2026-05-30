-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: waiter screen support
-- Run after existing migrations
-- ─────────────────────────────────────────────────────────────────────────────

-- Tracks individual item changes when kitchen flags something unavailable.
-- The payment (Razorpay) is never touched programmatically.
-- Price difference is recorded so the waiter knows what to settle at the table.
-- Negative price_difference = café owes the customer.
-- Positive price_difference = customer owes the café (rare, waiter handles in person).

CREATE TABLE IF NOT EXISTS order_item_changes (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id               UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  original_item_name     VARCHAR(255)  NOT NULL,
  original_item_price    DECIMAL(10,2) NOT NULL,          -- total for that line (price × qty)
  replacement_item_name  VARCHAR(255),                    -- NULL if item simply removed
  replacement_item_price DECIMAL(10,2),                   -- NULL if item simply removed
  price_difference       DECIMAL(10,2) NOT NULL DEFAULT 0,
  change_type            VARCHAR(20)   NOT NULL
                           CHECK (change_type IN ('replaced', 'removed')),
  note                   TEXT,                            -- kitchen suggestion text
  resolved               BOOLEAN       NOT NULL DEFAULT false,
  resolved_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Tracks when a customer calls for the waiter.
-- order_id is NULL when the customer calls from the menu page before placing an order.

CREATE TABLE IF NOT EXISTS waiter_calls (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id    UUID        NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  table_name  VARCHAR(100) NOT NULL,
  order_id    UUID        REFERENCES orders(id) ON DELETE SET NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'acknowledged')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oic_order_id
  ON order_item_changes(order_id);

CREATE INDEX IF NOT EXISTS idx_oic_unresolved
  ON order_item_changes(order_id) WHERE resolved = false;

CREATE INDEX IF NOT EXISTS idx_waiter_calls_pending
  ON waiter_calls(table_id) WHERE status = 'pending';npm run migrate
