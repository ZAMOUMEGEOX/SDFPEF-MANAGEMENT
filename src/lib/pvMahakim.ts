// src/lib/pvMahakim.ts  — v7.0
// مكتبة إدارة محاضر الضابطة القضائية في Supabase
// ══════════════════════════════════════════════════════════════════
//
// جدول Supabase المطلوب — نفّذ هذا SQL مرة واحدة:
//
// CREATE TABLE pv_records (
//   id text PRIMARY KEY,
//   data jsonb NOT NULL,
//   created_at timestamptz DEFAULT now(),
//   updated_at timestamptz DEFAULT now()
// );
// ALTER TABLE pv_records ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "allow_all" ON pv_records FOR ALL USING (true);
//
// -- ربط المحضر بالملف (اختياري — للاستعلام العكسي)
// CREATE INDEX IF NOT EXISTS pv_linked_case ON pv_records
//   USING gin ((data->'linkedCaseId'));
// ══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase'

// ─── نوع سجل المحضر الكامل ─────────────────────────────────────────────────
export interface PVRecord {
  id: string;
  // معرف الملف المرتبط في contentieux_cases (بعد الربط)
  linkedCaseId?: string;

  // ── بيانات المحضر الأساسية ──────────────────────────────────────────────
  /** رقم المحضر كما أدخله المستخدم في شريط البحث */
  pvInputNumber: string;
  /** رقم المحضر بالمحكمة (من بوابة محاكم — صيغة الإدخال) */
  pvCourtRef: string;
  pvDate: string;
  pvType: string;
  pvSubject: string;
  pvAgency: string;
  pvAgentType: string;
  pvOffense: string;

  // ── بيانات الملف الجنحي المرتبط (من تبويبة "الملفات الزجرية") ──────────
  /** رقم الملف الزجري كما يظهر في البوابة: 9276/2107/2025 */
  linkedFileNumber: string;
  /** بيانات تبويبة "بطاقة الملف" */
  linkedFile: {
    fileNumber: string;   // رقم الملف
    fileType: string;     // نوع الملف (جنحي/جنائي...)
    court: string;        // المحكمة
    section: string;      // الشعبة
    date: string;         // تاريخ التسجيل
    status: string;       // الوضعية
    judge: string;        // القاضي
    nextSession: string;  // الجلسة القادمة
  };

  // ── الأطراف والإجراءات ──────────────────────────────────────────────────
  parties: { role: string; name: string }[];
  procedures: { date: string; action: string; decision: string }[];

  // ── النص الخام والمزامنة ────────────────────────────────────────────────
  rawText: string;
  court: string;
  createdAt: string;
  lastSyncedAt: string;
}

// ─── CRUD ──────────────────────────────────────────────────────────────────

export async function loadPVRecords(): Promise<{ data: PVRecord[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('pv_records')
      .select('data')
      .order('created_at', { ascending: false });
    if (error) return { data: [], error: error.message };
    return { data: (data || []).map((r: any) => r.data as PVRecord), error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function savePVRecord(pv: PVRecord): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('pv_records')
      .upsert({ id: pv.id, data: pv, updated_at: new Date().toISOString() });
    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deletePVRecord(id: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase.from('pv_records').delete().eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function linkPVToCase(pvId: string, caseId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    // جلب المحضر أولاً
    const { data, error } = await supabase
      .from('pv_records')
      .select('data')
      .eq('id', pvId)
      .single();
    if (error || !data) return { success: false, error: error?.message || 'not_found' };
    const pv: PVRecord = data.data;
    pv.linkedCaseId = caseId;
    pv.lastSyncedAt = new Date().toISOString();
    return savePVRecord(pv);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── مولّد ID حتمي للمحضر ───────────────────────────────────────────────────
// نفس (الرقم + السنة [+ المحكمة]) ⇒ نفس المعرّف، فيُحدَّث السجلّ في مكانه عبر
// upsert بدل تكراره. (لا طابع زمني — التكرار كان يُضخّم الحصيلة والإحصاء.)
export function generatePVId(pvNumber: string, year: string, court = ''): string {
  const ct = court ? court.replace(/[\/\\\s]+/g, '-') : 'محكمة';
  const num = String(pvNumber || '').replace(/[\/\\\s]+/g, '-');
  const yr = (String(year || '').match(/\d{4}/)?.[0]) || '';
  return `PV-${ct}-${num}-${yr}`.replace(/-+/g, '-').replace(/-$/, '');
}