'use client';

import { FormEvent, useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Plus, Pencil, Trash2, X, ImageIcon, Check, Search, ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney, money, currencyDecimals } from '@/lib/utils';
import { Btn, Card, Tag, FilterBar, Checkbox, type FilterSegment } from '@/components/dashboard/primitives';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import type { Category, Product, ProductAddon } from '@/lib/types';
import type { Database } from '@/lib/database.types';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

type ProductWithAddons = Product & { product_addons: ProductAddon[] };

import { validateProduct, removeProductImage, compressImage, type FieldErrors } from '@/lib/products-utils';
import dynamic from 'next/dynamic';

const ProductFormModal = dynamic(
  () => import('@/components/dashboard/products/product-form-modal').then((m) => m.ProductFormModal),
  { 
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent" />
      </div>
    )
  }
);

const CategoryManager = dynamic(
  () => import('@/components/dashboard/products/category-manager').then((m) => m.CategoryManager),
  { 
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent" />
      </div>
    )
  }
);

function revalidateMenuCache(projectId: string) {
  void fetch('/api/revalidate-menu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  }).catch(() => {});
}

type FormAddon = { key: string; id?: string; name: string; price: string };

export function ProductsClient({
  projectId,
  currency,
  initialCategories,
  initialProducts,
}: {
  projectId: string;
  currency: string;
  initialCategories: Category[];
  initialProducts: ProductWithAddons[];
}) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [products, setProducts] = useState(initialProducts);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editing, setEditing] = useState<ProductWithAddons | null>(null);
  const [loading, setLoading] = useState(false);

  const [catName, setCatName] = useState('');
  const [catError, setCatError] = useState('');
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<Category | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => a.sort_order - b.sort_order),
    [products]
  );

  const filteredProducts = useMemo(() => {
    let list = sortedProducts;
    if (activeCat) {
      list = list.filter((p) => p.category_id === activeCat);
    }
    if (deferredSearch.trim()) {
      const q = deferredSearch.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.name_en ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [sortedProducts, activeCat, deferredSearch]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of sortedProducts) {
      if (!p.category_id) continue;
      counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
    }
    return counts;
  }, [sortedProducts]);

  function openCreate() {
    setEditing(null);
    setShowProductForm(true);
  }

  function openCategoryForm() {
    setCatName('');
    setCatError('');
    setShowCategoryForm(true);
  }

  function openEdit(p: ProductWithAddons) {
    setEditing(p);
    setShowProductForm(true);
  }

  const [confirmDelete, setConfirmDelete] = useState<ProductWithAddons | null>(null);

  async function deleteProduct(id: string) {
    try {
      const supabase = createClient();
      const product = products.find((p) => p.id === id);
      const { error } = await supabase.from('products').delete().eq('id', id).eq('project_id', projectId);
      if (error) {
        toast.error('فشل الحذف');
        return;
      }
      setProducts((prev) => prev.filter((p) => p.id !== id));
      toast.success('تم حذف المنتج');
      removeProductImage(product?.image_url);
      revalidateMenuCache(projectId);
    } catch {
      toast.error('فشل الحذف');
    }
  }

  async function deleteAddon(productId: string, addonId: string) {
    try {
      const supabase = createClient();
      const { data: owned } = await supabase
        .from('products')
        .select('id')
        .eq('id', productId)
        .eq('project_id', projectId)
        .maybeSingle();
      if (!owned) {
        toast.error('لا يمكن حذف هذه الإضافة');
        return;
      }
      const { error } = await supabase.from('product_addons').delete().eq('product_id', productId).eq('id', addonId);
      if (error) {
        toast.error('فشل الحذف');
        return;
      }
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? { ...p, product_addons: p.product_addons.filter((a) => a.id !== addonId) }
            : p
        )
      );
    } catch {
      toast.error('فشل الحذف');
    }
  }

  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  function exitBulk() {
    setBulkMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visibleIds = filteredProducts.map((p) => p.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  async function bulkSetAvailability(available: boolean) {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('products')
        .update({ is_available: available })
        .in('id', [...selectedIds])
        .eq('project_id', projectId);
      if (error) {
        toast.error('فشل التحديث');
        return;
      }
      setProducts((prev) =>
        prev.map((p) =>
          selectedIds.has(p.id) ? { ...p, is_available: available } : p
        )
      );
      toast.success(available ? 'تم تفعيل المنتجات' : 'تم إيقاف المنتجات');
      exitBulk();
      revalidateMenuCache(projectId);
    } catch {
      toast.error('فشل التحديث');
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('products')
        .delete()
        .in('id', [...selectedIds])
        .eq('project_id', projectId);
      setConfirmBulkDelete(false);
      if (error) {
        toast.error('فشل الحذف');
        return;
      }
      setProducts((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      toast.success('تم حذف المنتجات');
      exitBulk();
      revalidateMenuCache(projectId);
    } catch {
      toast.error('فشل الحذف');
    } finally {
      setBulkBusy(false);
    }
  }

  async function saveCategory(e: FormEvent) {
    e.preventDefault();
    if (!catName.trim()) {
      setCatError('اسم التصنيف مطلوب');
      return;
    }
    setCatError('');
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('categories')
        .insert({
          project_id: projectId,
          name: catName.trim(),
          sort_order: categories.length,
        })
        .select('*')
        .single();
      if (error || !data) {
        toast.error('فشل إنشاء التصنيف');
        return;
      }
      setCategories((prev) => [...prev, data as Category]);
      setCatName('');
      setShowCategoryForm(false);
      toast.success('تم إنشاء التصنيف');
      revalidateMenuCache(projectId);
    } catch {
      toast.error('فشل إنشاء التصنيف');
    } finally {
      setLoading(false);
    }
  }

  async function updateCategory() {
    const name = editCatName.trim();
    if (!name || !editingCat) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('categories')
        .update({ name })
        .eq('id', editingCat.id)
        .eq('project_id', projectId);
      if (error) { toast.error('فشل التحديث'); return; }
      setCategories((prev) => prev.map((c) => c.id === editingCat.id ? { ...c, name } : c));
      setEditingCat(null);
      toast.success('تم تحديث التصنيف');
      revalidateMenuCache(projectId);
    } catch {
      toast.error('فشل التحديث');
    } finally {
      setLoading(false);
    }
  }

  async function deleteCategory() {
    if (!confirmDeleteCat) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('categories').delete().eq('id', confirmDeleteCat.id).eq('project_id', projectId);
      if (error) { toast.error('فشل الحذف — تأكد من عدم وجود منتجات مرتبطة'); return; }
      setCategories((prev) => prev.filter((c) => c.id !== confirmDeleteCat.id));
      toast.success('تم حذف التصنيف');
      revalidateMenuCache(projectId);
    } catch {
      toast.error('فشل الحذف — تأكد من عدم وجود منتجات مرتبطة');
    } finally {
      setLoading(false);
    }
  }

  const refresh = useCallback(async () => { router.refresh(); }, [router]);

  const categorySegments = useMemo(() => {
    const segs: FilterSegment[] = [{ key: 'all', label: 'الكل', count: sortedProducts.length }];
    categories.forEach(c => {
      segs.push({ key: c.id, label: c.name, count: categoryCounts.get(c.id) });
    });
    return segs;
  }, [categories, sortedProducts, categoryCounts]);

  return (
    <div className="page">
      <PullToRefresh onRefresh={refresh}>
      <div className="page-header">
        <div>
          <div className="crumb">
            <span>دكان</span>
            <ChevronLeft size={12} style={{ color: 'var(--color-text-muted)' }} />
            <span>المبيعات</span>
            <ChevronLeft size={12} style={{ color: 'var(--color-text-muted)' }} />
            <span>القائمة</span>
          </div>
          <h1 className="text-2xl font-bold">القائمة</h1>
          <p className="text-xs text-[var(--color-text-secondary)]">{sortedProducts.length} صنف عبر {categories.length} فئات</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {bulkMode ? (
            <>
              <Btn variant="secondary" size="sm" onClick={exitBulk}>
                إلغاء التحديد
              </Btn>
              <Btn size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                منتج جديد
              </Btn>
            </>
          ) : (
            <>
              <Btn variant="secondary" size="sm" onClick={() => setBulkMode(true)}>
                تحديد
              </Btn>
              <Btn variant="secondary" size="sm" onClick={openCategoryForm}>
                تصنيف جديد
              </Btn>
              <Btn size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                منتج جديد
              </Btn>
            </>
          )}
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
        <input
          className="input ps-10 pe-12"
          placeholder="ابحث عن منتج…"
          maxLength={100}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute end-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-sm"
            aria-label="مسح البحث"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {categories.length > 0 && (
        <FilterBar
          segments={categorySegments}
          active={activeCat ?? 'all'}
          onChange={(key) => setActiveCat(key === 'all' ? null : key)}
        />
      )}

      {!filteredProducts.length ? (
        <EmptyState
          title={searchQuery || activeCat ? 'لا توجد نتائج' : 'ما فيه منتجات حالياً'}
          description={searchQuery || activeCat ? 'جرب تغيير كلمات البحث أو إلغاء الفلتر.' : 'أضف أول منتج وبيّن للعملاء قائمتك.'}
          action={
            <Btn onClick={openCreate}>
              <Plus className="h-4 w-4" />
              أضف أول منتج
            </Btn>
          }
        />
      ) : (
        <>
          <div className="product-grid grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
            {filteredProducts.map((p) => (
              <Card
                key={p.id}
                className={`overflow-hidden text-start transition-all active:scale-[0.98] ${
                  bulkMode && selectedIds.has(p.id) ? 'ring-2 ring-[var(--color-primary)]' : ''
                } ${!p.is_available ? 'opacity-60' : ''}`}
                onClick={bulkMode ? undefined : () => openEdit(p)}
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-surface)]">
                  {p.image_url ? (
                    <Image
                      src={p.image_url}
                      alt={p.name}
                      fill
                      sizes="(max-width: 768px) 50vw, 200px"
                      className={`object-cover ${
                        !p.is_available ? 'grayscale' : ''
                      }`}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[var(--color-text-muted)]">
                      <ImageIcon className="h-7 w-7" />
                    </div>
                  )}
                  {bulkMode ? (
                    <div 
                      className="absolute start-2 top-2 flex h-11 w-11 items-center justify-center rounded-full border-2 bg-[var(--color-surface)] shadow-sm transition-colors"
                      onClick={(e) => { e.stopPropagation(); toggleSelect(p.id); }}
                    >
                      <Checkbox checked={selectedIds.has(p.id)} onChange={() => {}} />
                    </div>
                  ) : (
                    !p.is_available && (
                      <Tag bg="#C0483D" fg="#fff" className="absolute end-2 top-2">
                        متوقف
                      </Tag>
                    )
                  )}
                </div>

                <div className="p-3">
                  <h3 className="line-clamp-1 text-sm font-bold">{p.name}</h3>
                  {p.description && (
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--color-text-secondary)]">
                      {p.description}
                    </p>
                  )}
                  <p className="mt-1 text-sm font-bold tabular-nums text-[var(--color-primary)]">
                    {formatMoney(Number(p.price), currency)}
                  </p>

                  {p.product_addons?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {p.product_addons.slice(0, 2).map((a) => (
                        <Tag key={a.id} bg="var(--color-bg)" fg="var(--color-text-secondary)" className="text-[10px]">
                          {a.name}
                        </Tag>
                      ))}
                      {p.product_addons.length > 2 && (
                        <Tag bg="var(--color-bg)" fg="var(--color-primary)" className="text-[10px] font-bold">
                          +{p.product_addons.length - 2}
                        </Tag>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {bulkMode && (
            <div className="sticky bottom-3 z-[var(--z-sticky)] mt-4 flex items-center justify-between gap-2 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-lg">
              <Btn variant="secondary" size="sm" onClick={toggleSelectAllVisible}>
                {allVisibleSelected ? 'إلغاء الكل' : 'اختيار الكل'}
              </Btn>
              <div className="flex gap-1">
                <Btn variant="secondary" size="sm" onClick={() => bulkSetAvailability(true)} disabled={bulkBusy || selectedIds.size === 0}>
                  تفعيل
                </Btn>
                <Btn variant="secondary" size="sm" onClick={() => bulkSetAvailability(false)} disabled={bulkBusy || selectedIds.size === 0}>
                  إيقاف
                </Btn>
                <Btn variant="danger" size="sm" onClick={() => setConfirmBulkDelete(true)} disabled={bulkBusy || selectedIds.size === 0}>
                  حذف
                </Btn>
              </div>
            </div>
          )}
        </>
      )}

      </PullToRefresh>

      {showProductForm && (
        <ProductFormModal
          projectId={projectId}
          currency={currency}
          categories={categories}
          products={products}
          editing={editing}
          onClose={() => setShowProductForm(false)}
          onSaved={(product, editingId) => {
            setProducts((prev) =>
              editingId
                ? prev.map((p) => (p.id === editingId ? product : p))
                : [...prev, product]
            );
          }}
          onRequestDelete={(p) => {
            setShowProductForm(false);
            setConfirmDelete(p);
          }}
        />
      )}

      <CategoryManager
        showCategoryForm={showCategoryForm}
        catName={catName}
        setCatName={setCatName}
        catError={catError}
        setCatError={setCatError}
        saveCategory={saveCategory}
        loading={loading}
        onCloseCreate={() => setShowCategoryForm(false)}
        editingCat={editingCat}
        editCatName={editCatName}
        setEditCatName={setEditCatName}
        updateCategory={updateCategory}
        onCloseEdit={() => setEditingCat(null)}
        confirmDeleteCat={confirmDeleteCat}
        deleteCategory={deleteCategory}
        onCloseDelete={() => setConfirmDeleteCat(null)}
      />

      {confirmBulkDelete && (
        <Modal title="حذف المنتجات المحددة" onClose={() => setConfirmBulkDelete(false)}>
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-danger-tint)]">
              <Trash2 className="h-6 w-6 text-[var(--color-danger)]" />
            </div>
            <p className="mb-5 text-xs text-[var(--color-text-secondary)]">
              هل أنت متأكد؟ هذا الإجراء لا يمكن التراجع عنه.
            </p>
            <div className="flex gap-2">
              <Btn variant="danger" className="w-full" disabled={bulkBusy} onClick={bulkDelete}>
                {bulkBusy ? 'جاري…' : 'نعم، احذف'}
              </Btn>
              <Btn variant="secondary" onClick={() => setConfirmBulkDelete(false)}>
                إلغاء
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="حذف المنتج" onClose={() => setConfirmDelete(null)}>
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-danger-tint)]">
              <Trash2 className="h-6 w-6 text-[var(--color-danger)]" />
            </div>
            <p className="mb-5 text-xs text-[var(--color-text-secondary)]">
              هل أنت متأكد من حذف «{confirmDelete.name}»؟ لا يمكن التراجع.
            </p>
            <div className="flex gap-2">
              <Btn
                variant="danger"
                className="w-full"
                onClick={async () => {
                  await deleteProduct(confirmDelete.id);
                  setConfirmDelete(null);
                }}
              >
                نعم، احذف
              </Btn>
              <Btn variant="secondary" onClick={() => setConfirmDelete(null)}>
                إلغاء
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
