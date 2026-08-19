import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Module, ProjectModule } from '@/lib/types';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const admin = createAdminClient();

    // Get user's project
    const { data: membership } = await admin
      .from('staff_members')
      .select('project_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'لا يوجد مشروع' }, { status: 404 });
    }

    const projectId = membership.project_id;

    // Get all available modules + which ones are enabled for this project
    const [modulesRes, projectModulesRes] = await Promise.all([
      admin
        .from('modules')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      admin
        .from('project_modules')
        .select('*')
        .eq('project_id', projectId),
    ]);

    const modules = modulesRes.data ?? [];
    const projectModules = projectModulesRes.data ?? [];

    // Merge: mark which modules are enabled
    const enabledModuleIds = new Set(
      projectModules
        .filter((pm: ProjectModule) => pm.is_enabled)
        .map((pm: ProjectModule) => pm.module_id)
    );

    const result = (modules as Module[]).map((mod) => ({
      ...mod,
      is_enabled: enabledModuleIds.has(mod.id),
    }));

    return NextResponse.json({ modules: result });
  } catch {
    return NextResponse.json({ error: 'خطأ داخلي' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const admin = createAdminClient();

    // Get user's project
    const { data: membership } = await admin
      .from('staff_members')
      .select('project_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'لا يوجد مشروع' }, { status: 404 });
    }

    // Only owner/manager can manage modules
    if (!['owner', 'manager'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'فقط مالك أو مدير المشروع يقدر يعدّل الوحدات' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as {
      module_id: string;
      is_enabled: boolean;
    };

    const { module_id, is_enabled } = body;

    if (!module_id) {
      return NextResponse.json({ error: 'معرّف الوحدة مطلوب' }, { status: 400 });
    }

    // Verify module exists
    const { data: module } = await admin
      .from('modules')
      .select('id, code, is_core')
      .eq('id', module_id)
      .single();

    if (!module) {
      return NextResponse.json({ error: 'الوحدة غير موجودة' }, { status: 404 });
    }

    // Cannot disable core modules
    if (module.is_core && !is_enabled) {
      return NextResponse.json(
        { error: 'لا يمكن تعطيل الوحدات الأساسية' },
        { status: 400 }
      );
    }

    // Upsert project_modules
    const { error } = await admin
      .from('project_modules')
      .upsert(
        {
          project_id: membership.project_id,
          module_id,
          is_enabled,
          activated_by: is_enabled ? user.id : null,
        },
        {
          onConflict: 'project_id,module_id',
        }
      );

    if (error) {
        console.error('Error updating module:', error);
        return NextResponse.json({ error: 'فشل تحديث الوحدة' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'خطأ داخلي' }, { status: 500 });
  }
}
