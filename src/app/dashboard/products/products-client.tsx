'use client';

import { FormEvent, useMemo, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import { Plus, Pencil, Trash2, X, ImageIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney, money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { Toggle } from '@/components/ui/toggle';
import type { Category, Product, ProductAddon } from '@/lib/types';
import type { Database } from '@/lib/database.types';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

type ProductWithAddons = Product & { product_addons: ProductAddon[] };

/** Temporary addon line in the product form — id is set for existing (persisted) addons */
type FormAddon = { key: string; id?: string; name: string; price: string };

/** Per-field validation errors */
type FieldErrors = {
  name?: string;
  price?: string;
};

function validateProduct(name: string, price: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!name.trim()) {
    errors.name = 'الاسم مطلوب';
  } else if (name.trim().length < 2) {
    errors.name = 'الاسم يجب أن يكون حرفين على الأقل';
  }
  const parsedPrice = Number(price);
  if (!price.trim()) {
    errors.price = 'السعر مطلوب';
  } else if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
    errors.price = 'السعر غير صالح — أدخل رقماً صحيحاً';
  }
  return errors;
}

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

  // Product form state
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [imageUrl, setImageUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null); // Fix 6
  const [formAddons, setFormAddons] = useState<FormAddon[]>([]);

  // Validation errors
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Category form
  const [catName, setCatName] = useState('');
  const [catError, setCatError] = useState('');

  // Edit category
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<Category | null>(null);

  // Image upload state
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addonKeyRef = useRef(0);
  const nextAddonKey = useCallback(() => {
    addonKeyRef.current += 1;
    return `addon_${addonKeyRef.current}`;
  }, []);

  // Inline category quick-add
  const [showQuickCat, setShowQuickCat] = useState(false);
  const [quickCatName, setQuickCatName] = useState('');

  // Search + category filter
  const [searchQuery, setSearchQuery] = useState('');
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
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.name_en ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [sortedProducts, activeCat, searchQuery]);

  function openCreate() {
    setEditing(null);
    setName('');
    setNameEn('');
    setDescription('');
    setPrice('');
    setCategoryId(categories[0]?.id ?? '');
    setIsAvailable(true);
    setImageUrl('');
    setPreviewUrl(null); // Fix 6
    setFormAddons([]);
    setFieldErrors({});
    setShowQuickCat(false);
    setQuickCatName('');
    setShowProductForm(true);
  }

  function openEdit(p: ProductWithAddons) {
    setEditing(p);
    setName(p.name);
    setNameEn(p.name_en ?? '');
    setDescription(p.description ?? '');
    setPrice(String(p.price));
    setCategoryId(p.category_id ?? '');
    setIsAvailable(p.is_available);
    setImageUrl(p.image_url ?? '');
    setPreviewUrl(null); // Fix 6
    setFormAddons(
      (p.product_addons || []).map((a) => ({
        key: nextAddonKey(),
        id: a.id,
        name: a.name,
        price: String(a.price),
      }))
    );
    setFieldErrors({});
    setShowQuickCat(false);
    setQuickCatName('');
    setShowProductForm(true);
  }

  function addFormAddon() {
    setFormAddons((prev) => [
      ...prev,
      { key: nextAddonKey(), name: '', price: '0.500' },
    ]);
  }

  function updateFormAddon(key: string, field: 'name' | 'price', value: string) {
    setFormAddons((prev) =>
      prev.map((a) => (a.key === key ? { ...a, [field]: value } : a))
    );
  }

  function removeFormAddon(key: string) {
    setFormAddons((prev) => prev.filter((a) => a.key !== key));
  }

  // ----- Image Upload (drag & drop + click) -----
  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('الملف يجب أن يكون صورة');
      return;
    }
    // Whitelist: JPG/PNG/WebP only (SVG can carry scripts in some contexts)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('الصيغة غير مدعومة — JPG أو PNG أو WebP فقط');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('الحد الأقصى لحجم الصورة 5MB');
      return;
    }

    setUploading(true);
    const objectUrl = URL.createObjectURL(file); // Fix 6: instant preview from File object
    setPreviewUrl(objectUrl);
    try {
      const supabase = createClient();
      const extMap: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
      const ext = extMap[file.type] || 'jpg';
      const path = `${projectId}/products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { data, error } = await supabase.storage
        .from('business-assets')
        .upload(path, file, { upsert: false, contentType: file.type });

      if (error) {
        console.error('[Image Upload]', error);
        toast.error('فشل رفع الصورة');
        return;
      }

      if (data) {
        const { data: { publicUrl } } = supabase.storage
          .from('business-assets')
          .getPublicUrl(data.path);
        setImageUrl(publicUrl);
        toast.success('تم رفع الصورة');
      }
    } catch {
      toast.error('خطأ في رفع الصورة');
    } finally {
      URL.revokeObjectURL(objectUrl); // Fix 6: cleanup object URL
      setPreviewUrl(null); // Fix 6
      setUploading(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so same file can be re-selected
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function onDragLeave() {
    setDragOver(false);
  }

  function removeImage() {
    setImageUrl('');
    setPreviewUrl(null); // Fix 6
  }

  // ----- Inline Quick Category -----
  async function addQuickCategory() {
    const name = quickCatName.trim();
    if (!name) return;
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('categories')
      .insert({ project_id: projectId, name, sort_order: categories.length })
      .select('*')
      .single();
    setLoading(false);
    if (error || !data) {
      toast.error('فشل إنشاء التصنيف');
      return;
    }
    const cat = data as Category;
    setCategories((prev) => [...prev, cat]);
    setCategoryId(cat.id);
    setQuickCatName('');
    setShowQuickCat(false);
    toast.success(`تم إنشاء «${cat.name}»`);
  }

  // ----- Save Product -----
  async function saveProduct(e: FormEvent) {
    e.preventDefault();
    const errors = validateProduct(name, price);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // Validate addon prices FIRST — abort on any invalid one (no silent drops)
    for (const a of formAddons) {
      if (!a.name.trim()) continue;
      const addonPrice = Number(a.price);
      if (!Number.isFinite(addonPrice) || addonPrice < 0) {
        toast.error(`سعر الإضافة «${a.name.trim()}» غير صالح`);
        return;
      }
    }

    const parsedPrice = Number(price);
    setLoading(true);
    const supabase = createClient();

    const updatePayload: Database['public']['Tables']['products']['Update'] = {
      name: name.trim(),
      name_en: nameEn.trim() || null,
      description: description.trim() || null,
      price: money(parsedPrice),
      category_id: categoryId || null,
      is_available: isAvailable,
      image_url: imageUrl.trim() || null,
    };

    const processedAddons: { id?: string; name: string; price: number }[] =
      formAddons
        .filter((a) => a.name.trim().length > 0)
        .map((a) => ({
          id: a.id,
          name: a.name.trim(),
          price: money(Number(a.price)),
        }));

    if (editing) {
      const { data, error } = await supabase
        .from('products')
        .update(updatePayload)
        .eq('id', editing.id)
        .select('*, product_addons(*)')
        .single();

      if (error || !data) {
        setLoading(false);
        toast.error('فشل التحديث');
        return;
      }

      // Upsert addons: update in place (keeps id + is_available), insert new, delete removed
      const currentAddons = editing.product_addons || [];
      const keptIds = new Set(
        processedAddons.filter((a): a is { id: string; name: string; price: number } => !!a.id).map((a) => a.id)
      );
      const removedAddons = currentAddons.filter((a) => !keptIds.has(a.id));

      if (removedAddons.length > 0) {
        const { error: deleteAddonErr } = await supabase
          .from('product_addons')
          .delete()
          .in('id', removedAddons.map((a) => a.id));
        if (deleteAddonErr) {
          console.error('[Products] Failed to delete removed addons:', deleteAddonErr);
          toast.error('فشل تحديث الإضافات');
          setLoading(false);
          return;
        }
      }

      for (const a of processedAddons) {
        if (a.id) {
          const { error: updErr } = await supabase
            .from('product_addons')
            .update({ name: a.name, price: a.price })
            .eq('id', a.id);
          if (updErr) {
            console.error('[Products] Failed to update addon:', updErr);
            toast.error('فشل تحديث الإضافات');
            setLoading(false);
            return;
          }
        } else {
          const { error: insErr } = await supabase.from('product_addons').insert({
            product_id: editing.id,
            name: a.name,
            price: a.price,
            is_available: true,
          });
          if (insErr) {
            console.error('[Products] Failed to insert new addon:', insErr);
            toast.error('فشل إضافة الإضافات');
            setLoading(false);
            return;
          }
        }
      }

      const { data: refreshed } = await supabase
        .from('products')
        .select('*, product_addons(*)')
        .eq('id', editing.id)
        .single();

      if (refreshed) {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === editing.id ? (refreshed as ProductWithAddons) : p
          )
        );
      }
      toast.success('تم تحديث المنتج');
    } else {
      const insertPayload: Database['public']['Tables']['products']['Insert'] = {
        project_id: projectId,
        name: name.trim(),
        name_en: nameEn.trim() || null,
        description: description.trim() || null,
        price: money(parsedPrice),
        category_id: categoryId || null,
        is_available: isAvailable,
        image_url: imageUrl.trim() || null,
        sort_order: products.length,
      };
      const { data, error } = await supabase
        .from('products')
        .insert(insertPayload)
        .select('*')
        .single();

      if (error || !data) {
        setLoading(false);
        toast.error('فشل الإضافة');
        return;
      }

      if (processedAddons.length > 0) {
        await supabase.from('product_addons').insert(
          processedAddons.map((a) => ({
            product_id: data.id,
            name: a.name,
            price: a.price,
            is_available: true,
          }))
        );
      }

      const { data: withAddons } = await supabase
        .from('products')
        .select('*, product_addons(*)')
        .eq('id', data.id)
        .single();

      setProducts((prev) => [
        ...prev,
        (withAddons ?? { ...data, product_addons: [] }) as ProductWithAddons,
      ]);
      toast.success('تمت إضافة المنتج');
    }
    setLoading(false);
    setShowProductForm(false);
  }

  // Delete confirmation state
  const [confirmDelete, setConfirmDelete] = useState<ProductWithAddons | null>(null);
  // Guards against double-tap on the availability toggle (two rapid requests would flip twice)
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function deleteProduct(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      toast.error('فشل الحذف');
      return;
    }
    setProducts((prev) => prev.filter((p) => p.id !== id));
    toast.success('تم حذف المنتج');
  }

  async function toggleAvailable(p: ProductWithAddons) {
    if (togglingId) return;
    setTogglingId(p.id);
    const supabase = createClient();
    const { error } = await supabase
      .from('products')
      .update({ is_available: !p.is_available })
      .eq('id', p.id);
    setTogglingId(null);
    if (error) {
      toast.error('فشل التحديث — حاول مرة ثانية');
      return;
    }
    setProducts((prev) =>
      prev.map((x) =>
        x.id === p.id ? { ...x, is_available: !x.is_available } : x
      )
    );
  }

  async function deleteAddon(productId: string, addonId: string) {
    const supabase = createClient();
    const { error } = await supabase.from('product_addons').delete().eq('id', addonId);
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
  }

  async function saveCategory(e: FormEvent) {
    e.preventDefault();
    if (!catName.trim()) {
      setCatError('اسم التصنيف مطلوب');
      return;
    }
    setCatError('');
    setLoading(true);
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
    setLoading(false);
    if (error || !data) {
      toast.error('فشل إنشاء التصنيف');
      return;
    }
    setCategories((prev) => [...prev, data as Category]);
    setCatName('');
    setShowCategoryForm(false);
    toast.success('تم إنشاء التصنيف');
  }

  async function updateCategory() {
    const name = editCatName.trim();
    if (!name || !editingCat) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('categories')
      .update({ name })
      .eq('id', editingCat.id);
    setLoading(false);
    if (error) { toast.error('فشل التحديث'); return; }
    setCategories((prev) => prev.map((c) => c.id === editingCat.id ? { ...c, name } : c));
    setEditingCat(null);
    toast.success('تم تحديث التصنيف');
  }

  async function deleteCategory() {
    if (!confirmDeleteCat) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from('categories').delete().eq('id', confirmDeleteCat.id);
    setLoading(false);
    if (error) { toast.error('فشل الحذف — تأكد من عدم وجود منتجات مرتبطة'); return; }
    setCategories((prev) => prev.filter((c) => c.id !== confirmDeleteCat.id));
    setConfirmDeleteCat(null);
    toast.success('تم حذف التصنيف');
  }


  const refresh = useCallback(async () => { router.refresh(); }, [router]);

  return (
    <div className="page">
      <PullToRefresh onRefresh={refresh}>
      <div className="page-header">
        <div>
          <h1>المنتجات</h1>
          <p>إدارة التصنيفات والمنتجات والإضافات</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowCategoryForm(true)}>
            تصنيف جديد
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            منتج جديد
          </Button>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
        <input
          className="input pl-9"
          placeholder="🔍 ابحث عن منتج…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute left-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-sm"
            aria-label="مسح البحث"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {categories.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveCat(null)}
            aria-pressed={!activeCat}
            className={`flex min-h-[44px] items-center rounded-full px-4 text-xs font-bold transition-all ${
              !activeCat
                ? 'bg-[var(--color-primary)] text-white shadow-sm'
                : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]'
            }`}
          >
            <span>الكل</span>
          </button>
          {categories.map((c) => (
            <div
              key={c.id}
              className={`flex min-h-[44px] items-center gap-0.5 rounded-full py-1 pe-1 ps-3 text-xs font-bold transition-all ${
                activeCat === c.id
                  ? 'bg-[var(--color-primary)] text-white shadow-sm'
                  : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveCat(activeCat === c.id ? null : c.id)}
                aria-pressed={activeCat === c.id}
                className="rounded-full py-1.5"
              >
                {c.name}
              </button>
              {/* Edit/delete — real buttons, always visible (touch + keyboard) */}
              <button
                type="button"
                onClick={() => { setEditingCat(c); setEditCatName(c.name); }}
                aria-label={`تعديل التصنيف ${c.name}`}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-opacity hover:opacity-70"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteCat(c)}
                aria-label={`حذف التصنيف ${c.name}`}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-opacity hover:opacity-70"
              >
                <Trash2 className="h-3 w-3 text-[var(--color-danger)]" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!filteredProducts.length ? (
        <EmptyState
          title={searchQuery || activeCat ? 'لا توجد نتائج' : 'ما فيه منتجات حالياً'}
          description={searchQuery || activeCat ? 'جرب تغيير كلمات البحث أو إلغاء الفلتر.' : 'أضف أول منتج وبيّن للعملاء قائمتك.'}
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              أضف أول منتج
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredProducts.map((p) => (
            <div key={p.id} className="dashboard-card card card-body">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  {/* Product thumbnail — next/image: srcset + lazy + zero CLS */}
                  {p.image_url ? (
                    <Image
                      src={p.image_url}
                      alt={p.name}
                      width={48}
                      height={48}
                      className="mt-0.5 h-12 w-12 shrink-0 rounded-[8px] border border-[var(--color-border)] object-cover"
                    />
                  ) : (
                    <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)]">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold">{p.name}</h3>
                      {!p.is_available && (
                        <span className="badge badge-cancelled">متوقف</span>
                      )}
                    </div>
                    {p.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-text-secondary)]">
                        {p.description}
                      </p>
                    )}
                    <p className="mt-1 text-sm font-bold text-[var(--color-primary)]">
                      {formatMoney(Number(p.price), currency)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={togglingId === p.id}
                    onClick={() => toggleAvailable(p)}
                  >
                    {togglingId === p.id ? '…' : p.is_available ? 'إيقاف' : 'تفعيل'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(p)} aria-label="تعديل">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(p)}
                    aria-label="حذف"
                  >
                    <Trash2 className="h-4 w-4 text-[var(--color-danger)]" />
                  </Button>
                </div>
              </div>

              {p.product_addons?.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-[var(--color-border)] pt-3 text-sm">
                  {p.product_addons.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between text-[var(--color-text-secondary)]"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-1 w-1 rounded-full bg-[var(--color-text-muted)]" />
                        {a.name}
                      </span>
                      <span className="font-semibold">
                        +{formatMoney(Number(a.price), currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      </PullToRefresh>

      {/* ======== PRODUCT FORM MODAL ======== */}
      {showProductForm && (
        <Modal
          title={editing ? 'تعديل منتج' : 'منتج جديد'}
          onClose={() => setShowProductForm(false)}
        >
          <form onSubmit={saveProduct} className="space-y-5">
            {/* NAME + NAME EN (2-col) */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field">
                <label className="label">الاسم بالعربي</label>
                <input
                  className={`input ${fieldErrors.name ? 'input-error' : ''}`}
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  onBlur={() => {
                    const err = validateProduct(name, price);
                    if (err.name) setFieldErrors((prev) => ({ ...prev, name: err.name }));
                  }}
                  placeholder="مثال: قهوة عربية"
                />
                {fieldErrors.name && <p className="error-text">{fieldErrors.name}</p>}
              </div>
              <div className="field">
                <label className="label">بالإنجليزي</label>
                <input
                  className="input"
                  dir="ltr"
                  maxLength={100}
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder="Arabic Coffee"
                />
              </div>
            </div>

            {/* DESCRIPTION */}
            <div className="field">
              <label className="label">الوصف</label>
              <textarea
                className="textarea"
                rows={3}
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="وصف مختصر للمنتج يظهر للعملاء في القائمة"
              />
            </div>

            {/* PRICE + CATEGORY (2-col) */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field">
                <label className="label">
                  السعر <span className="text-[var(--color-text-muted)]">({currency})</span>
                </label>
                <div className="relative">
                  <input
                    className={`input ${fieldErrors.price ? 'input-error' : ''}`}
                    type="number"
                    step="0.001"
                    min="0"
                    required
                    dir="ltr"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => {
                      setPrice(e.target.value);
                      if (fieldErrors.price) setFieldErrors((prev) => ({ ...prev, price: undefined }));
                    }}
                    onBlur={() => {
                      const err = validateProduct(name, price);
                      if (err.price) setFieldErrors((prev) => ({ ...prev, price: err.price }));
                    }}
                    placeholder="0.000"
                  />
                </div>
                {fieldErrors.price && <p className="error-text">{fieldErrors.price}</p>}
              </div>

              {/* Category select with inline quick-add */}
              <div className="field">
                <label className="label">التصنيف</label>
                <div className="flex gap-1">
                  <select
                    className="select flex-1"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    <option value="">بدون تصنيف</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => { setShowQuickCat(true); setQuickCatName(''); }}
                    className="btn btn-secondary btn-sm min-h-[44px] min-w-[44px] flex items-center justify-center"
                    title="تصنيف جديد"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {/* Inline quick-add category */}
                {showQuickCat && (
                  <div className="mt-2 flex items-center gap-2 rounded-[8px] border border-[var(--color-primary)] bg-[var(--color-primary-tint)] p-2">
                    <input
                      className="input flex-1 border-0 bg-white text-sm"
                      placeholder="اسم التصنيف الجديد"
                      maxLength={50}
                      value={quickCatName}
                      onChange={(e) => setQuickCatName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addQuickCategory(); } }}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={addQuickCategory}
                      disabled={loading || !quickCatName.trim()}
                      className="btn btn-primary btn-sm whitespace-nowrap"
                    >
                      {loading ? '…' : 'إضافة'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowQuickCat(false)}
                      aria-label="إلغاء إضافة تصنيف"
                      className="btn btn-ghost btn-sm"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ======== IMAGE UPLOAD — Drag & Drop Zone ======== */}
            <div className="field">
              <label className="label">صورة المنتج</label>
              {imageUrl ? (
                <div className="relative inline-block">
                  <Image
                    src={imageUrl}
                    alt=""
                    width={112}
                    height={112}
                    className="h-28 w-28 rounded-[10px] border border-[var(--color-border)] object-cover shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={removeImage}
                    aria-label="إزالة الصورة"
                    className="absolute -right-3 -top-3 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-danger)] text-white shadow-sm transition-transform hover:scale-110">
                      <X className="h-3.5 w-3.5" />
                    </span>
                  </button>
                  <p className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">JPG أو PNG أو WebP، حد 5MB</p>
                </div>
              ) : uploading && previewUrl ? (
                // Fix 6: instant preview while uploading
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="معاينة الصورة"
                    className="h-28 w-28 rounded-[10px] border border-[var(--color-border)] object-cover shadow-sm"
                  />
                  <div className="absolute inset-0 flex items-center justify-center rounded-[10px] bg-black/40">
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  </div>
                  <p className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">جاري رفع الصورة…</p>
                </div>
              ) : (
                <div
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-[10px] border-2 border-dashed p-6 transition-colors ${
                    dragOver
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-tint)]'
                      : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-primary)]'
                  }`}
                >
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface)] shadow-sm">
                    <ImageIcon className="h-6 w-6 text-[var(--color-text-secondary)]" />
                  </div>
                  <p className="text-sm font-semibold text-[var(--color-text-secondary)]">
                    اسحب الصورة هنا أو اضغط للاختيار
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                    JPG أو PNG أو WebP، حد أقصى 5MB
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={onFileChange}
                    disabled={uploading}
                    className="hidden"
                  />
                </div>
              )}
            </div>

            {/* ======== ADDONS ======== */}
            <div className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
              <div className="mb-3 flex items-center justify-between">
                <label className="label mb-0">الإضافات <span className="text-[var(--color-text-muted)]">(اختياري)</span></label>
                <button
                  type="button"
                  onClick={addFormAddon}
                  className="btn btn-ghost btn-sm gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  إضافة
                </button>
              </div>

              {formAddons.length === 0 && (
                <p className="rounded-[8px] bg-[var(--color-surface)] px-3 py-4 text-center text-xs text-[var(--color-text-muted)]">
                  ما فيه إضافات. أضف إضافات مثل {`{حليب، صوص، جبنة إضافية}`}
                </p>
              )}

              {formAddons.map((addon, idx) => (
                <div
                  key={addon.key}
                  className="mb-2 flex items-center gap-2 rounded-[8px] bg-[var(--color-surface)] p-2"
                >
                  <input
                    className="input flex-1 text-sm"
                    placeholder="اسم الإضافة"
                    maxLength={50}
                    value={addon.name}
                    onChange={(e) => updateFormAddon(addon.key, 'name', e.target.value)}
                  />
                  <div className="relative w-24 shrink-0">
                    <input
                      className="input w-full text-sm"
                      type="number"
                      step="0.001"
                      min="0"
                      dir="ltr"
                      inputMode="decimal"
                      placeholder="0.000"
                      value={addon.price}
                      onChange={(e) => updateFormAddon(addon.key, 'price', e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFormAddon(addon.key)}
                    aria-label={`حذف الإضافة ${addon.name || ''}`.trim()}
                    className="btn btn-ghost btn-sm shrink-0 text-[var(--color-danger)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* ======== AVAILABLE TOGGLE ======== */}
            <div className="flex items-center gap-3">
              <Toggle
                id="product-available"
                checked={isAvailable}
                onChange={setIsAvailable}
                aria-label="المنتج متاح للطلب"
              />
              <label htmlFor="product-available" className="cursor-pointer text-sm font-semibold">
                المنتج متاح للطلب
              </label>
            </div>

            {/* ======== BUTTONS ======== */}
            <div className="flex gap-2">
              <Button type="submit" block disabled={loading}>
                {loading
                  ? 'جاري الحفظ…'
                  : editing
                  ? 'حفظ التغييرات'
                  : 'إضافة المنتج'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowProductForm(false)}
              >
                إلغاء
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ======== CATEGORY MODAL ======== */}
      {showCategoryForm && (
        <Modal title="تصنيف جديد" onClose={() => setShowCategoryForm(false)}>
          <form onSubmit={saveCategory} className="space-y-4">
            <div className="field">
              <label className="label">اسم التصنيف</label>
              <input
                className={`input ${catError ? 'input-error' : ''}`}
                required
                maxLength={50}
                value={catName}
                onChange={(e) => {
                  setCatName(e.target.value);
                  if (catError) setCatError('');
                }}
                onBlur={() => {
                  if (!catName.trim()) setCatError('اسم التصنيف مطلوب');
                }}
                placeholder="مثال: مشروبات ساخنة"
                autoFocus
              />
              {catError && <p className="error-text">{catError}</p>}
            </div>
            <div className="flex gap-2">
              <Button type="submit" block disabled={loading || !catName.trim()}>
                {loading ? 'جاري…' : 'إنشاء'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCategoryForm(false)}
              >
                إلغاء
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title="تأكيد الحذف"
          onClose={() => setConfirmDelete(null)}
        >
          <div className="text-center">
            <div className="mb-3 mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-danger-tint)]">
              <Trash2 className="h-6 w-6 text-[var(--color-danger)]" />
            </div>
            <p className="mb-1 text-sm font-bold">{confirmDelete.name}</p>
            <p className="mb-5 text-xs text-[var(--color-text-secondary)]">
              هل أنت متأكد؟ هذا الإجراء لا يمكن التراجع عنه.
            </p>
            <div className="flex gap-2">
              <Button
                variant="danger"
                block
                onClick={() => {
                  const p = confirmDelete;
                  setConfirmDelete(null);
                  deleteProduct(p.id);
                }}
              >
                نعم، احذف
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmDelete(null)}
              >
                إلغاء
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {editingCat && (
        <Modal title="تعديل التصنيف" onClose={() => setEditingCat(null)}>
          <form onSubmit={(e) => { e.preventDefault(); updateCategory(); }} className="space-y-4">
            <div className="field">
              <label className="label">اسم التصنيف</label>
              <input
                className="input"
                required
                maxLength={50}
                value={editCatName}
                onChange={(e) => setEditCatName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" block disabled={loading || !editCatName.trim()}>
                {loading ? 'جاري…' : 'حفظ'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditingCat(null)}>
                إلغاء
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDeleteCat && (
        <Modal title="حذف التصنيف" onClose={() => setConfirmDeleteCat(null)}>
          <div className="text-center">
            <div className="mb-3 mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-danger-tint)]">
              <Trash2 className="h-6 w-6 text-[var(--color-danger)]" />
            </div>
            <p className="mb-1 text-sm font-bold">{confirmDeleteCat.name}</p>
            <p className="mb-5 text-xs text-[var(--color-text-secondary)]">
              هل أنت متأكد؟ المنتجات المرتبطة بهذا التصنيف ستبقى بدون تصنيف.
            </p>
            <div className="flex gap-2">
              <Button variant="danger" block disabled={loading} onClick={deleteCategory}>
                {loading ? 'جاري…' : 'نعم، احذف'}
              </Button>
              <Button variant="secondary" onClick={() => setConfirmDeleteCat(null)}>
                إلغاء
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
