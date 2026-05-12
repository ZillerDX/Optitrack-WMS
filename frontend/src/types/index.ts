/**
 * TypeScript type definitions for OptiTrack WMS
 * These types match the backend Pydantic schemas
 */

// ================= User Types =================

export type UserRole = 'ADMIN' | 'STAFF' | 'USER';

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  is_active: boolean;
}

export interface UserCreate {
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  password: string;
}

export interface UserUpdate {
  email?: string;
  first_name?: string;
  last_name?: string;
  role?: UserRole;
  is_active?: boolean;
}

// ================= Product Types =================

export interface Product {
  id: number;
  sku: string;
  name: string;
  description?: string;
  category?: string;
  cost_price: number;
  sell_price: number;
  min_stock_level: number;
  unit: string;
  image_url?: string;
}

export interface ProductCreate {
  sku: string;
  name: string;
  description?: string;
  category?: string;
  cost_price: number;
  sell_price: number;
  min_stock_level?: number;
  unit?: string;
  image_url?: string;
}

export interface ProductUpdate {
  sku?: string;
  name?: string;
  description?: string;
  category?: string;
  cost_price?: number;
  sell_price?: number;
  min_stock_level?: number;
  unit?: string;
  image_url?: string;
}

// ================= Inventory Types =================

export type InventoryStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface Inventory {
  id: number;
  product_id: number;
  location: string;
  quantity: number;
  status: InventoryStatus;
}

export interface InventoryWithProduct extends Inventory {
  product: Product;
}

export interface InventoryCreate {
  product_id: number;
  location: string;
  quantity?: number;
  status?: InventoryStatus;
}

export interface InventoryUpdate {
  location?: string;
  quantity?: number;
  status?: InventoryStatus;
}

// ================= Location Types =================

export interface Location {
  id: number;
  name: string;
  description?: string;
  capacity: number;
}

export interface LocationCreate {
  name: string;
  description?: string;
  capacity: number;
}

export interface LocationUpdate {
  name?: string;
  description?: string;
  capacity?: number;
}

// ================= Transaction Types =================

export type TransactionType = 'INBOUND' | 'OUTBOUND';
export type TransactionStatus = 'COMPLETED' | 'PENDING' | 'CANCELLED';

export interface Transaction {
  id: number;
  ref_code: string;
  type: TransactionType;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: TransactionStatus;
  location?: string;
  notes?: string;
  user_id: number;
  product_id: number;
  created_at: string;
}

export interface TransactionWithProduct extends Transaction {
  product: Product;
}

export interface TransactionCreate {
  type: TransactionType;
  quantity: number;
  product_id: number;
  location: string;
  notes?: string;
}

// ================= Notification Settings Types =================

export interface NotificationSettings {
  user_id: number;
  low_stock_alerts: boolean;
  ai_insights: boolean;
}

export interface NotificationSettingsUpdate {
  low_stock_alerts?: boolean;
  ai_insights?: boolean;
}

// ================= AI Chat Types =================

export interface AIChatMessage {
  message: string;
}

export interface AIChatResponse {
  message: string;
  is_bot_response: boolean;
  created_at: string;
}

export interface ChatHistory {
  id: number;
  user_id: number;
  message: string;
  is_bot_response: boolean;
  created_at: string;
}

// ================= Auth Types =================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// ================= Dashboard Types =================

export interface DashboardStats {
  total_products: number;
  total_inventory_value: number;
  low_stock_count: number;
  total_transactions_today: number;
}

export interface SalesVsCostData {
  date: string;
  sales: number;
  cost: number;
  profit: number;
}

// ================= API Response Types =================

export interface APIError {
  detail: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}

// ================= Form Types =================

export interface LoginFormData {
  email: string;
  password: string;
}

export interface ProductFormData extends ProductCreate {}

export interface TransactionFormData extends TransactionCreate {}

export interface InventoryFormData extends InventoryCreate {}
