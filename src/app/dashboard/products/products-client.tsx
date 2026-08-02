'use client';

import { FormEvent, useMemo, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import { Plus, Pencil, Trash2, X, ImageIcon, Copy, Check, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney, money, currencyDecimals } from '@/lib/utils';
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

  // Live product counts per category (updates as products change).
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

  // Fresh category form every time — never leak the previous draft or error
  // into a newly opened modal (cancel/X/backdrop close without resetting).
  function openCategoryForm() {
    setCatName('');
    setCatError('');
    setShowCategoryForm(true);
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
  /**
   * Compress before upload: resize to ≤1024px longest side + re-encode WebP
   * (alpha-preserving) when the source is heavy. Small files pass through
   * untouched — no pointless re-encode.
   */
  async function compressImage(file: File): Promise<File> {
    if (file.size <= 300 * 1024) return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 500 * 1024) return file;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.85)
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
      type: 'image/webp',
    });
  }

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
      const uploadFile = await compressImage(file);
      const extMap: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
      const ext = extMap[uploadFile.type] || 'jpg';
      const path = `${projectId}/products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { data, error } = await supabase.storage
        .from('product-images')
        .upload(path, uploadFile, { upsert: false, contentType: uploadFile.type });

      if (error) {
        console.error('[Image Upload]', error);
        toast.error('فشل رفع الصورة');
        return;
      }

      if (data) {
        const { data: { publicUrl } } = supabase.storage
          .from('product-images')
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
      price: money(parsedPrice, currencyDecimals(currency)),
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
          price: money(Number(a.price), currencyDecimals(currency)),
        }));

    if (editing) {
      const { data, error } = await supabase
        .from('products')
        .update(updatePayload)
        .eq('id', editing.id)
        .eq('project_id', projectId)
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
          .eq('product_id', editing.id)
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
            .eq('product_id', editing.id)
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
        price: money(parsedPrice, currencyDecimals(currency)),
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

  async function deleteProduct(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('products').delete().eq('id', id).eq('project_id', projectId);
    if (error) {
      toast.error('فشل الحذف');
      return;
    }
    setProducts((prev) => prev.filter((p) => p.id !== id));
    toast.success('تم حذف المنتج');
  }

  async function deleteAddon(productId: string, addonId: string) {
    const supabase = createClient();
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
  }

  // ----- Duplicate product (name + "(نسخة)", copies addons & image) -----
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  async function duplicateProduct(p: ProductWithAddons) {
    if (duplicatingId) return;
    setDuplicatingId(p.id);
    const supabase = createClient();
    const insertPayload: Database['public']['Tables']['products']['Insert'] = {
      project_id: projectId,
      name: `${p.name} (نسخة)`,
      name_en: p.name_en ? `${p.name_en} (copy)` : null,
      description: p.description,
      price: p.price,
      category_id: p.category_id,
      is_available: p.is_available,
      image_url: p.image_url,
      sort_order: products.length,
    };
    const { data, error } = await supabase
      .from('products')
      .insert(insertPayload)
      .select('*')
      .single();
    if (error || !data) {
      setDuplicatingId(null);
      toast.error('فشل نسخ المنتج');
      return;
    }
    if (p.product_addons?.length) {
      await supabase.from('product_addons').insert(
        p.product_addons.map((a) => ({
          product_id: data.id,
          name: a.name,
          price: a.price,
          is_available: a.is_available,
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
    setDuplicatingId(null);
    toast.success('تم نسخ المنتج');
  }

  // ----- Bulk selection (select mode → toggle availability / delete) -----
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
    const supabase = createClient();
    const { error } = await supabase
      .from('products')
      .update({ is_available: available })
      .in('id', [...selectedIds])
      .eq('project_id', projectId);
    setBulkBusy(false);
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
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('products')
      .delete()
      .in('id', [...selectedIds]);
    setBulkBusy(false);
    setConfirmBulkDelete(false);
    if (error) {
      toast.error('فشل الحذف');
      return;
    }
    setProducts((prev) => prev.filter((p) => !selectedIds.has(p.id)));
    toast.success('تم حذف المنتجات');
    exitBulk();
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
      .eq('id', editingCat.id)
      .eq('project_id', projectId);
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
    const { error } = await supabase.from('categories').delete().eq('id', confirmDeleteCat.id).eq('project_id', projectId);
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
          {bulkMode ? (
            <>
              <Button variant="secondary" size="sm" onClick={exitBulk}>
                إلغاء التحديد
              </Button>
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                منتج جديد
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={() => setBulkMode(true)}>
                تحديد
              </Button>
              <Button variant="secondary" size="sm" onClick={openCategoryForm}>
                تصنيف جديد
              </Button>
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                منتج جديد
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
        <input
          className="input ps-10"
          placeholder="ابحث عن منتج…"
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
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveCat(null)}
            aria-pressed={!activeCat}
            className={`flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-xs font-bold transition-all ${
              !activeCat
                ? 'bg-[var(--color-primary)] text-white shadow-sm'
                : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]'
            }`}
          >
            <span>الكل</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                !activeCat ? 'bg-white/20' : 'bg-[var(--color-bg)]'
              }`}
            >
              {sortedProducts.length}
            </span>
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
                className="flex items-center gap-1.5 rounded-full py-1.5"
              >
                {c.name}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                    activeCat === c.id ? 'bg-white/20' : 'bg-[var(--color-bg)]'
                  }`}
                >
                  {categoryCounts.get(c.id) ?? 0}
                </span>
              </button>
              {/* Edit/delete — real buttons, always visible (touch + keyboard) */}
              <span className="mx-0.5 h-4 w-px bg-[var(--color-border)]" aria-hidden="true" />
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
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={bulkMode}
                onClick={() => openEdit(p)}
                aria-label={`تعديل ${p.name}`}
                className={`dashboard-card card overflow-hidden text-start transition-all active:scale-[0.98] ${
                  bulkMode && selectedIds.has(p.id) ? 'ring-2 ring-[var(--color-primary)]' : ''
                } ${!p.is_available ? 'opacity-60' : ''}`}
              >
                {/* Image / placeholder — 4:3 like the POS grid */}
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-bg)]">
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
                    <button
                      type="button"
                      onClick={() => toggleSelect(p.id)}
                      aria-label={`اختيار ${p.name}`}
                      className={`absolute start-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border-2 bg-[var(--color-surface)] shadow-sm transition-colors ${
                        selectedIds.has(p.id)
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                          : 'border-[var(--color-border)] text-transparent'
                      }`}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  ) : (
                    !p.is_available && (
                      <span className="absolute end-2 top-2 rounded-[4px] bg-[var(--color-danger)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-surface)] shadow-sm">
                        متوقف
                      </span>
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
                        <span
                          key={a.id}
                          className="rounded-full bg-[var(--color-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-secondary)]"
                        >
                          {a.name}
                        </span>
                      ))}
                      {p.product_addons.length > 2 && (
                        <span className="rounded-full bg-[var(--color-bg)] px-2 py-0.5 text-[10px] font-bold tabular-nums text-[var(--color-primary)]">
                          +{p.product_addons.length - 2}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Bulk action bar */}
          {bulkMode && (
            <div className="sticky bottom-3 z-30 mt-4 flex items-center justify-between gap-2 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-lg">
              <button
                type="button"
                onClick={toggleSelectAllVisible}
                className="flex min-h-[44px] items-center gap-2 rounded-[8px] px-3 text-sm font-semibold text-[var(--color-text-secondary)]"
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded border-2 ${
                    allVisibleSelected
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                      : 'border-[var(--color-border)]'
                  }`}
                >
                  {allVisibleSelected && <Check className="h-3 w-3" />}
                </span>
                {allVisibleSelected ? 'إلغاء الكل' : 'اختيار الكل'}
              </button>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => bulkSetAvailability(true)}
                  disabled={bulkBusy || selectedIds.size === 0}
                  className="btn btn-secondary btn-sm"
                >
                  تفعيل
                </button>
                <button
                  type="button"
                  onClick={() => bulkSetAvailability(false)}
                  disabled={bulkBusy || selectedIds.size === 0}
                  className="btn btn-secondary btn-sm"
                >
                  إيقاف
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmBulkDelete(true)}
                  disabled={bulkBusy || selectedIds.size === 0}
                  className="btn btn-danger btn-sm"
                >
                  حذف
                </button>
              </div>
            </div>
          )}
        </>
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
              {editing && (
                <>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={duplicatingId === editing.id}
                    onClick={() => {
                      setShowProductForm(false);
                      setConfirmDelete(editing);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    حذف
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={duplicatingId === editing.id}
                    onClick={() => {
                      duplicateProduct(editing);
                      setShowProductForm(false);
                    }}
                  >
                    {duplicatingId === editing.id ? (
                      '…'
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        نسخ
                      </>
                    )}
                  </Button>
                </>
              )}
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
              <Button
                variant="danger"
                block
                disabled={bulkBusy}
                onClick={bulkDelete}
              >
                {bulkBusy ? 'جاري…' : 'نعم، احذف'}
              </Button>
              <Button variant="secondary" onClick={() => setConfirmBulkDelete(false)}>
                إلغاء
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
