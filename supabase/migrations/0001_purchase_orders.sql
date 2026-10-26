-- Migration: Create purchase_orders table
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id BIGSERIAL PRIMARY KEY,
  po_number TEXT NOT NULL UNIQUE,
  user_id BIGINT REFERENCES public.users(id) ON DELETE CASCADE,
  supplier TEXT,
  total_amount NUMERIC(12, 2) DEFAULT 0,
  status TEXT DEFAULT 'DRAFT',
  items JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_user_id ON public.purchase_orders(user_id);
