/**
 * TypeScript type definitions for OptiTrack WMS
 */

// ========== Product Types ==========

export interface Product {
  id: number;
  sku: string;
  name: string;
  barcode?: string;
  supplier?: string;
  cost_price: number;
  sell_price: number;
  min_stock_level: number;
  unit: string;
  image_url?: string;
}

// ========== Inventory Types ==========

export interface Inventory {
  id: number;
  product_id: number;
  location: string;
  quantity: number;
  status: string;
}

// ========== Transaction Types ==========

export interface Transaction {
  id: number;
  ref_code: string;
  type: 'INBOUND' | 'OUTBOUND' | 'ADJUST';
  quantity: number;
  unit_price: number;
  total_price: number;
  status: string;
  location?: string;
  notes?: string;
  user_id: number;
  product_id: number;
  created_at: string;
  product?: Product;
}
