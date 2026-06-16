// src/lib/contentieux.ts
import { supabase } from '@/lib/supabase'
import type { Case } from '@/views/Contentieux/Contentieux'

// ══════════════════════════════════════════════════
// جدول Supabase المطلوب — نفّذ هذا SQL في Supabase مرة واحدة:
//
// CREATE TABLE contentieux_cases (
//   id text PRIMARY KEY,
//   data jsonb NOT NULL,
//   created_at timestamptz DEFAULT now(),
//   updated_at timestamptz DEFAULT now()
// );
// ALTER TABLE contentieux_cases ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "allow_all" ON contentieux_cases FOR ALL USING (true);
// ══════════════════════════════════════════════════

export async function loadCases(): Promise<{ data: Case[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('contentieux_cases')
      .select('data')
      .order('created_at', { ascending: false })

    if (error) return { data: [], error: error.message }

    const cases = (data || []).map((row: any) => row.data as Case)
    return { data: cases, error: null }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function saveCase(c: Case): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('contentieux_cases')
      .upsert({ id: c.id, data: c, updated_at: new Date().toISOString() })

    if (error) return { success: false, error: error.message }
    return { success: true, error: null }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function deleteCase(id: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('contentieux_cases')
      .delete()
      .eq('id', id)

    if (error) return { success: false, error: error.message }
    return { success: true, error: null }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function deleteCases(ids: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('contentieux_cases')
      .delete()
      .in('id', ids)

    if (error) return { success: false, error: error.message }
    return { success: true, error: null }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}
