export interface User {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'manager' | 'cashier' | 'stylist';
  category_ids?: string[];
}

export interface Tenant {
  id: number;
  business_name: string;
  slug: string;
  database_name: string;
  business_type: string;
  country: string;
  currency: string;
  currency_symbol: string;
  timezone: string;
  plan: string;
  status: string;
  role: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  sort_order: number;
  is_active: number;
  color?: string;
  icon?: string;
  children?: Category[];
}

export interface Product {
  id: string;
  category_id: string | null;
  name: string;
  description?: string;
  price: number;
  cost: number;
  sku?: string;
  barcode?: string;
  kind: 'service' | 'retail';
  service_duration_minutes: number;
  is_active: number;
  sort_order: number;
  track_inventory: number;
  stock_quantity: number;
  low_stock_threshold: number;
  tax_type: 'none' | 'inclusive' | 'exclusive';
  tax_rate: number;
  cb_percent: number;
  category?: Category;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  loyalty_points: number;
  notes?: string;
  is_active: number;
  visits_count?: number;
  total_spent?: number;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: string;
  product_name: string;
  product_sku?: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  performed_by_user_id?: string | null;
  status: 'pending' | 'in-service' | 'served' | 'cancelled';
}

export interface Order {
  id: number;
  order_number: string;
  customer_id: string | null;
  user_id: string | null;
  stylist_id: string | null;
  special_instructions?: string;
  status: 'pending' | 'in-service' | 'completed' | 'cancelled';
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  discount_type?: string;
  discount_value?: number;
  discount_reason?: string;
  round_off: number;
  total: number;
  created_at: string;
  items?: OrderItem[];
  customer?: Customer | null;
  stylist?: { id: string; name: string; role: string } | null;
  bill?: Bill | null;
}

export interface Bill {
  id: number;
  bill_number: string;
  order_id: number;
  customer_id: string | null;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  paid_amount: number;
  balance: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  payment_details?: string;
}

export interface Printer {
  id: string;
  name: string;
  connection_type: 'network' | 'usb' | 'webusb';
  ip_address?: string;
  port: number;
  paper_width: string;
  is_default: number;
}

export interface StaffMember {
  id: string;
  name: string;
  email?: string;
  role: 'owner' | 'manager' | 'cashier' | 'stylist';
  is_active: number;
}

export interface CartLine {
  product: Product;
  quantity: number;
  discount_amount: number;
  stylist_id?: string;
}
