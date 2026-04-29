export type Product = {
  id: string;
  owner_id: string;
  name: string;
  cost_price: number;
  sale_price: number;
  stock: number;
  stock_min: number;
  is_active: boolean;
  created_at: string;
};

export type Combo = {
  id: string;
  owner_id: string;
  name: string;
  sale_price: number;
  is_active: boolean;
  created_at: string;
};

export type ComboItem = {
  id: string;
  combo_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
};

export type Client = {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
};

export type Sale = {
  id: string;
  owner_id: string;
  client_id: string | null;
  sold_at: string;
  note: string | null;
  total_amount: number;
  total_cost: number;
  total_profit: number;
  created_at: string;
};

export type SaleItem = {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_sale_price: number;
  unit_cost_price: number;
  line_total: number;
  line_cost: number;
  line_profit: number;
  created_at: string;
};

export type CartItem = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_sale_price: number;
  unit_cost_price: number;
  line_total: number;
  source_type: "product" | "combo";
  source_name: string | null;
};
