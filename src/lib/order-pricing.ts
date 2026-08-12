import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/database.types';
import type { OrderItemAddon, OrderType, PublicOrderItemInput } from '@/lib/types';
import { money, currencyDecimals } from '@/lib/utils';

type AdminClient = SupabaseClient<Database>;

/** Acceptable idempotency-key charset: uuid (crypto.randomUUID) + URL-safe
 *  separators. Keeps the key index tiny and unabusable. */
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;

export function isIdempotencyKeyValid(value: unknown): value is string {
  return typeof value === 'string' && IDEMPOTENCY_KEY_RE.test(value);
}

function toJson<T>(value: T): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

/** Look up an order created with the same idempotency key (the unique
 *  (project_id, key) index guarantees at most one). Used for the route-level
 *  pre-check and as the race fallback after a 23505. */
export async function findExistingOrderByKey(
  supabase: AdminClient,
  projectId: string,
  idempotencyKey: string
): Promise<{ id: string; status: string; totalAmount: number; orderNumber: number } | null> {
  const { data } = await supabase
    .from('orders')
    .select('id, status, total_amount, order_number')
    .eq('project_id', projectId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    status: data.status as string,
    totalAmount: Number(data.total_amount),
    orderNumber: Number(data.order_number),
  };
}

export type ValidatedOrderLine = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  addons: OrderItemAddon[];
  notes: string | null;
};

export type CreateOrderResult =
  | {
      ok: true;
      order: { id: string; status: string; totalAmount: number; orderNumber: number };
    }
  | {
      ok: false;
      error: string;
      status: number;
      duplicateKey?: boolean;
    };

/**
 * Shared server-side order creation:
 * - Re-validates project + optional table
 * - Fetches real product/addon prices
 * - Recalculates total_amount
 * - Inserts order + order_items
 *
 * Used by public order API and POS.
 */
export async function createSecureOrder(
  supabase: AdminClient,
  params: {
    projectId: string;
    currency?: string;
    tableId: string | null;
    type: OrderType;
    items: PublicOrderItemInput[];
    notes?: string | null;
    callerUserId?: string;
    idempotencyKey?: string | null;
  }
): Promise<CreateOrderResult> {
  const { projectId, currency, tableId, type, items, notes, callerUserId, idempotencyKey } = params;

  // B7: Fail-fast UUID validation for projectId
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(projectId)) {
    return { ok: false, error: 'معرف المشروع غير صالح', status: 400 };
  }

  // Server-side rounding per the project's currency (BHD=3, SAR/AED/QAR=2…)
  const decimals = currencyDecimals(currency ?? 'BHD');
  if (!items.length) {
    return { ok: false, error: 'السلة فارغة', status: 400 };
  }
  if (items.length > 50) {
    return { ok: false, error: 'عدد الأصناف كبير جداً', status: 400 };
  }

  const orderNotes = typeof notes === 'string' ? notes : '';
  if (orderNotes.length > 500) {
    return { ok: false, error: 'ملاحظات الطلب طويلة جداً (الحد 500 حرف)', status: 400 };
  }

  const validated: ValidatedOrderLine[] = [];
  let totalAmount = 0;

  const productIds = [...new Set(items.map((i) => String(i.productId).trim()))];
  const addonIds = [
    ...new Set(
      items.flatMap((i) =>
        (Array.isArray(i.addonIds) ? i.addonIds : []).map((a) => String(a).trim())
      )
    ),
  ];

  const [productsRes, addonsRes] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, price, is_available, project_id')
      .in('id', productIds)
      .eq('project_id', projectId),
    addonIds.length > 0
      ? supabase
          .from('product_addons')
          .select('id, name, price, is_available, product_id')
          .in('id', addonIds)
          .eq('is_available', true)
      : Promise.resolve({ data: [] as never[] }),
  ]);
  const productsById = new Map((productsRes.data ?? []).map((p) => [p.id, p]));
  const addonsByProduct = new Map<string, NonNullable<typeof addonsRes.data>[number][]>();
  for (const a of addonsRes.data ?? []) {
    const list = addonsByProduct.get(a.product_id) ?? [];
    list.push(a);
    addonsByProduct.set(a.product_id, list);
  }

  for (const item of items) {
    const quantity = typeof item.quantity === 'number' ? item.quantity : NaN;
    if (
      !item.productId ||
      !Number.isFinite(quantity) ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      return { ok: false, error: 'بيانات صنف غير صالحة', status: 400 };
    }
    if (quantity > 99) {
      return { ok: false, error: 'الكمية غير مسموحة', status: 400 };
    }
    const itemNotes = typeof item.notes === 'string' ? item.notes : '';
    if (itemNotes.length > 200) {
      return { ok: false, error: 'ملاحظات الصنف طويلة جداً (الحد 200 حرف)', status: 400 };
    }
    const product = productsById.get(String(item.productId).trim());
    if (!product || !product.is_available) {
      return {
        ok: false,
        error: 'منتج غير متاح أو لا ينتمي لهذا المتجر',
        status: 400,
      };
    }
    const addonIdsForLine = Array.isArray(item.addonIds)
      ? [...new Set(item.addonIds.map((a) => String(a).trim()))]
      : [];
    const addonDetails: OrderItemAddon[] = [];
    let addonTotal = 0;
    if (addonIdsForLine.length > 0) {
      const productAddons = (addonsByProduct.get(product.id) ?? []).filter((a) =>
        addonIdsForLine.includes(a.id)
      );
      const found = productAddons;
      if (found.length !== addonIdsForLine.length) {
        return {
          ok: false,
          error: 'إضافة غير صالحة',
          status: 400,
        };
      }
      for (const addon of found) {
        const price = money(Number(addon.price), decimals);
        addonTotal = money(addonTotal + price, decimals);
        addonDetails.push({
          id: addon.id,
          name: addon.name,
          price,
        });
      }
    }
    const unitPrice = money(Number(product.price) + addonTotal, decimals);
    if (unitPrice < 0) {
      return { ok: false, error: 'سعر الصنف غير صالح', status: 400 };
    }
    const lineTotal = money(unitPrice * quantity, decimals);
    totalAmount = money(totalAmount + lineTotal, decimals);
    validated.push({
      product_id: product.id,
      product_name: product.name,
      quantity,
      unit_price: unitPrice,
      addons: addonDetails,
      notes: itemNotes || null,
    });
  }

  const { data: numData, error: numErr } = await supabase.rpc('next_order_number', {
    p_project_id: projectId,
    p_caller_user_id: callerUserId,
  });
  if (numErr || !numData) {
    console.error('Order number error:', numErr);
    return { ok: false, error: 'فشل إنشاء رقم الطلب', status: 500 };
  }

  const { data: created, error: createErr } = await supabase.rpc(
    'create_order_transactional',
    {
      p_project_id: projectId,
      p_table_id: tableId ?? undefined,
      p_type: type,
      p_status: 'pending',
      p_total_amount: totalAmount,
      p_notes: orderNotes.trim() || undefined,
      p_order_number: numData,
      p_caller_user_id: callerUserId,
      p_idempotency_key: idempotencyKey?.trim() || undefined,
      p_items: validated.map((line) => ({
        product_id: line.product_id,
        product_name: line.product_name,
        quantity: line.quantity,
        unit_price: line.unit_price,
        addons: toJson(line.addons),
        notes: line.notes,
      })),
    }
  );
  if (createErr || !created) {
    console.error('Order create error:', createErr);
    return {
      ok: false,
      error: 'فشل إنشاء الطلب',
      status: 500,
      duplicateKey: (createErr as { code?: string } | null)?.code === '23505',
    };
  }
  const createdOrder = created as {
    id: string;
    status: string;
    total_amount: number;
    order_number: number;
  };
  return {
    ok: true,
    order: {
      id: createdOrder.id,
      status: createdOrder.status,
      totalAmount: money(Number(createdOrder.total_amount), decimals),
      orderNumber: Number(createdOrder.order_number),
    },
  };
}
