/**
 * Dokan domain types — aligned with the exact product schema.
 * Money values use 3 decimal places (BHD).
 */

export type Currency = 'BHD' | 'SAR' | 'KWD' | 'AED' | 'OMR' | 'QAR';

export type OrderType = 'dinein' | 'walkin' | 'drivethru';

export type OrderStatus =
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled';

/** Per-item cooking state on the KDS (item-level kanban). */
export type OrderItemStatus = 'pending' | 'preparing' | 'ready';

export type StaffRole = 'owner' | 'manager' | 'staff';

export interface Project {
  id: string;
  name: string;
  slug: string;
  currency: string;
  primary_color: string;
  logo_url: string | null;
  is_active: boolean;
  subscription_expires_at: string | null;
  plan_code: string;
  vat_rate: number;
  deleted_at: string | null;
  created_at: string;
  business_type_id: string | null;
}

export interface BusinessType {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  icon: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Module {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  category: string;
  icon: string | null;
  sort_order: number;
  is_core: boolean;
  is_active: boolean;
  created_at: string;
  is_enabled: boolean;
}

export interface ProjectModule {
  id: string;
  project_id: string;
  module_id: string;
  is_enabled: boolean;
  activated_at: string;
  activated_by: string | null;
}

export interface Table {
  id: string;
  project_id: string;
  branch_id: string | null;
  number: number;
  slug: string;
  qrcode: string;
  is_active: boolean;
  created_at?: string;
}

export interface Category {
  id: string;
  project_id: string;
  name: string;
  name_en: string | null;
  sort_order: number;
  is_active?: boolean;
  created_at?: string;
}

export interface Product {
  id: string;
  project_id: string;
  category_id: string | null;
  name: string;
  name_en: string | null;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
  created_at?: string;
}

export interface ProductAddon {
  id: string;
  product_id: string;
  name: string;
  price: number;
  is_available: boolean;
}

/** Snapshot of an addon stored on an order line */
export interface OrderItemAddon {
  id: string;
  name: string;
  price: number;
}

export interface Order {
  id: string;
  project_id: string;
  table_id: string | null;
  type: OrderType;
  status: OrderStatus;
  total_amount: number;
  order_number: number;
  notes: string | null;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  addons: OrderItemAddon[];
  notes: string | null;
  /** KDS cooking state — derived order status syncs automatically. */
  status?: OrderItemStatus;
}

export interface StaffMember {
  id: string;
  project_id: string;
  user_id: string;
  role: StaffRole;
  created_at?: string;
}

/** Public order API request body */
export interface PublicOrderItemInput {
  productId: string;
  quantity: number;
  addonIds?: string[];
  notes?: string;
}

export interface PublicOrderRequest {
  projectSlug: string;
  tableSlug: string;
  items: PublicOrderItemInput[];
  notes?: string;
}

export interface PublicOrderResponse {
  order: {
    id: string;
    status: OrderStatus;
    totalAmount: number;
  };
}

/** Cart line used on the public menu */
export interface CartLine {
  key: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  addons: OrderItemAddon[];
  notes: string;
}

/** Dashboard onboarding checklist item */
export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  href: string;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'جديد',
  preparing: 'قيد التحضير',
  ready: 'جاهز',
  delivered: 'تم التسليم',
  cancelled: 'ملغى',
};

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  dinein: 'طاولة',
  walkin: 'سفري',
  drivethru: 'سيارة',
};

export const CURRENCIES: { value: Currency; label: string }[] = [
  { value: 'BHD', label: 'دينار بحريني (BHD)' },
  { value: 'SAR', label: 'ريال سعودي (SAR)' },
  { value: 'KWD', label: 'دينار كويتي (KWD)' },
  { value: 'AED', label: 'درهم إماراتي (AED)' },
  { value: 'OMR', label: 'ريال عُماني (OMR)' },
  { value: 'QAR', label: 'ريال قطري (QAR)' },
];

export const DEFAULT_PRIMARY_COLOR = '#4F46E5';

// ---------------------------------------------------------------------------
// Billing / plans (0006_crm_erp_billing.sql)
// ---------------------------------------------------------------------------

export type PlanCode = 'free' | 'growth' | 'enterprise';

export interface SubscriptionPlan {
  id: string;
  code: PlanCode;
  name: string;
  name_en: string | null;
  price: number;
  billing_interval: 'monthly' | 'yearly';
  max_staff: number | null;
  max_branches: number | null;
  max_tables: number | null;
  max_products: number | null;
  features: string[];
  is_active: boolean;
}

export const PLAN_LABELS: Record<PlanCode, { ar: string; en: string }> = {
  free: { ar: 'مجاني', en: 'Free' },
  growth: { ar: 'نمو', en: 'Growth' },
  enterprise: { ar: 'مؤسسة', en: 'Enterprise' },
};

// ---------------------------------------------------------------------------
// CRM (0006_crm_erp_billing.sql)
// ---------------------------------------------------------------------------

export interface Customer {
  id: string;
  project_id: string;
  phone: string;
  name: string | null;
  name_en: string | null;
  email: string | null;
  loyalty_points: number;
  total_spent: number;
  visit_count: number;
  last_visit_at: string | null;
  is_opted_in: boolean;
  notes: string | null;
  created_at: string;
}

export type LoyaltyKind = 'earn' | 'redeem' | 'adjust';

export interface LoyaltyEvent {
  id: string;
  project_id: string;
  customer_id: string;
  kind: LoyaltyKind;
  points: number;
  reason: string | null;
  created_at: string;
}

export type CampaignChannel = 'sms' | 'whatsapp' | 'email' | 'push';
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';

export interface Campaign {
  id: string;
  project_id: string;
  name: string;
  channel: CampaignChannel;
  message_ar: string;
  message_en: string | null;
  audience_filter: Record<string, unknown>;
  status: CampaignStatus;
  scheduled_at: string | null;
  sent_count: number;
  created_at: string;
}

export const CAMPAIGN_CHANNEL_LABELS: Record<CampaignChannel, string> = {
  sms: 'رسائل SMS',
  whatsapp: 'واتساب',
  email: 'بريد إلكتروني',
  push: 'إشعارات',
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'مسودة',
  scheduled: 'مجدولة',
  sending: 'قيد الإرسال',
  sent: 'أُرسلت',
  cancelled: 'ملغاة',
};

// ---------------------------------------------------------------------------
// ERP / Back-office (0006_crm_erp_billing.sql)
// ---------------------------------------------------------------------------

export interface InventoryItem {
  id: string;
  project_id: string;
  supplier_id: string | null;
  name: string;
  sku: string | null;
  unit: string;
  qty_on_hand: number;
  reorder_level: number;
  cost: number;
  is_active: boolean;
  created_at: string;
}

export interface Supplier {
  id: string;
  project_id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export type PurchaseOrderStatus = 'draft' | 'ordered' | 'received' | 'cancelled';

export interface PurchaseOrder {
  id: string;
  project_id: string;
  supplier_id: string;
  status: PurchaseOrderStatus;
  total: number;
  expected_at: string | null;
  received_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  project_id: string;
  category: string;
  amount: number;
  description: string | null;
  occurred_on: string;
  created_at: string;
}

export const EXPENSE_CATEGORIES = [
  'مواد خام',
  'إيجار',
  'رواتب',
  'كهرباء وماء',
  'صيانة',
  'تسويق',
  'تراخيص',
  'أخرى',
];
