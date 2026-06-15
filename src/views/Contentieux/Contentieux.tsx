import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search, Plus, FileText, CheckCircle2, Clock, AlertCircle,
  ChevronLeft, ChevronDown, Scale, Shield, User, FilePlus2, Activity, Landmark,
  AlertTriangle, DownloadCloud, ClipboardPaste, Lock, MousePointerClick,
  Trash2, Download, Printer, PieChartIcon, Gavel, FileCheck2, Check,
  FileSpreadsheet, Database, RefreshCw, X, Eye, Sparkles, FileDown,
  Maximize2, Minimize2, CalendarDays, MapPin, Users, ShieldAlert,
  FolderOpen, UserCog, CalendarClock, ExternalLink, ListChecks
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { CaseWizard } from './components/CaseWizard';
import { ContentieuxStats, type StatsNavigateAction } from './components/ContentieuxStats';
import { loadCases, saveCase, deleteCase, deleteCases } from '@/lib/contentieux';
import {
  computeDeadlines, nearestDeadline, getCriticalDeadlinesCount,
  relatedCasesBySameDefendant, getQualityFlags, needsManualReview,
  decodeNationalId, buildICS, downloadTextFile, buildRepeatOffenderIndex,
  getCurrentUser, setCurrentUser, appendAuditEntry,
  type DeadlineItem,
} from '@/lib/caseAnalysis';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Case {
  id: string;
  mahakimId?: string;
  fileNumber?: string;
  fileSymbol?: string;
  fileYear?: string;
  nationalId?: string;
  date: string;
  type: string;
  subject: string;
  court: string;
  status: string;
  nextSession?: string;
  defendant?: string;
  createdAt?: string;
  judge?: string;
  section?: string;
  courtLevel?: string;
  pvNumber?: string;
  pvDate?: string;
  offenseType?: string;
  pvStatus?: string;
  fine?: string;
  compensation?: string;
  restitution?: string;
  reconciliation?: boolean;
  otherSanctions?: string;
  executionStatus?: string;
  executionObstacle?: string;
  notificationMethod?: string;
  notificationDate?: string;
  executionDate?: string;
  executionAmountRecovered?: string;
  procedures?: { date: string; action: string; decision: string; number?: string }[];
  parties?: { role: string; name: string }[];
  /** آخر مزامنة/استخراج من بوابة محاكم (ISO) — لتجنب التكرار وتتبع حداثة البيانات */
  lastSyncedAt?: string;
  /** عدد مرات المزامنة من البوابة */
  syncCount?: number;

  // ── المسؤولية والمتابعة ──────────────────────────────────────────
  /** المكلَّف بالملف (مستشار قانوني / محامٍ) */
  assignedTo?: string;
  /** علم يدوي: الملف يحتاج تدقيقاً (بالإضافة للفحص التلقائي) */
  needsReview?: boolean;
  /** سجل التتبع: من عدّل وماذا ومتى */
  auditLog?: { date: string; user: string; action: string }[];

  // ── الآجال ────────────────────────────────────────────────────────
  /** تاريخ الأمر القضائي بأداء مصاريف الخبرة */
  expertFeeOrderDate?: string;
  /** هل تم أداء مصاريف الخبرة؟ */
  expertFeePaid?: boolean;
  /** عدد أيام أجل أداء مصاريف الخبرة (افتراضي 8 إن لم يُحدَّد) */
  expertFeeDeadlineDays?: string;

  // ── الربط المكاني (سلسلة القيمة: شرطة غابوية / دومين / تحسس بعدي) ──
  /** مرجع الرسم العقاري أو مطلب التحفيظ للقطعة الغابوية المعنية */
  parcelRef?: string;
  /** مساحة القطعة المتنازع عليها (هكتار) */
  parcelArea?: string;
  /** القيمة التقديرية للضرر/القطعة (درهم) */
  estimatedValue?: string;
  /** إحداثيات نقطة مرجعية على الخريطة (إن وُجدت) */
  geoLat?: string;
  geoLng?: string;
  /** رسم Polygon للقطعة بصيغة GeoJSON (نص) — اختياري */
  geoPolygon?: string;

  // ── الوثائق المرفقة ──────────────────────────────────────────────
  documents?: { name: string; url: string; type?: string; addedAt?: string }[];
}

// ─── أدوات المزامنة (منع التكرار + كشف الجديد) ──────────────────────────────

/** مفتاح مطابقة موحَّد للملف: الرقم الوطني أولاً ثم رقم محاكم */
function caseMatchKey(c: { nationalId?: string; mahakimId?: string }): string {
  const nid = (c.nationalId || '').replace(/\D/g, '');
  if (nid.length >= 8) return 'N:' + nid;
  const mid = (c.mahakimId || '').replace(/\s/g, '');
  if (mid) return 'M:' + mid;
  return '';
}

/** هل هذا الإجراء موجود في القائمة؟ (مطابقة تاريخ + نوع الإجراء) */
function procExists(list: { date: string; action: string }[], p: { date: string; action: string }) {
  const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim();
  return list.some(x => x.date === p.date && norm(x.action) === norm(p.action));
}

/**
 * دمج استخراج جديد فوق ملف موجود:
 * - يحافظ على المعرف الداخلي وكل البيانات اليدوية (محضر، عقوبات، تنفيذ، تبليغ).
 * - يحدّث بيانات البوابة (المحكمة، القاضي، الوضعية، الموضوع...).
 * - يضيف الإجراءات والأطراف الجديدة فقط (بدون تكرار).
 * - يرجع الملف المدموج + عدد الإجراءات الجديدة المكتشفة.
 */
function mergeCaseUpdate(existing: Case, incoming: Case): { merged: Case; newProcs: number; newParties: number } {
  const oldProcs = existing.procedures || [];
  const addProcs = (incoming.procedures || []).filter(p => !procExists(oldProcs, p));
  const oldParties = existing.parties || [];
  const normName = (s: string) => (s || '').replace(/\s+/g, ' ').trim();
  const addParties = (incoming.parties || []).filter(
    np => !oldParties.some(op => normName(op.name) === normName(np.name) && op.role === np.role)
  );

  const pick = (nv?: string, ov?: string) => (nv && nv !== '-' && nv !== 'غير محدد' && nv !== 'غير محددة' ? nv : ov);

  const merged: Case = {
    ...existing,
    // بيانات البوابة — الأحدث يغلب إن كان ذا قيمة
    mahakimId: pick(incoming.mahakimId, existing.mahakimId),
    nationalId: pick(incoming.nationalId, existing.nationalId),
    court: pick(incoming.court, existing.court) || existing.court,
    type: pick(incoming.type, existing.type) || existing.type,
    subject: pick(incoming.subject, existing.subject) || existing.subject,
    date: pick(incoming.date, existing.date) || existing.date,
    judge: pick(incoming.judge, existing.judge),
    section: pick(incoming.section, existing.section),
    status: pick(incoming.status, existing.status) || existing.status,
    nextSession: pick(incoming.nextSession, existing.nextSession),
    defendant: pick(incoming.defendant, existing.defendant),
    procedures: [...oldProcs, ...addProcs],
    parties: [...oldParties, ...addParties],
    lastSyncedAt: new Date().toISOString(),
    syncCount: (existing.syncCount || 0) + 1,
  };
  return { merged, newProcs: addProcs.length, newParties: addParties.length };
}

/** عرض ودّي لمدة منذ آخر مزامنة + لون الحالة */
function syncAge(iso?: string): { label: string; cls: string } | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  const days = Math.floor((Date.now() - t) / 86400000);
  const label = days <= 0 ? 'اليوم' : days === 1 ? 'أمس' : `منذ ${days} يوم`;
  const cls = days <= 3 ? 'text-emerald-600' : days <= 14 ? 'text-amber-600' : 'text-red-500';
  return { label, cls };
}

/** يحوّل تاريخاً بصيغة dd/mm/yyyy أو ISO إلى timestamp (NaN إن تعذّر) */
function parseFlexDate(d?: string): number {
  if (!d) return NaN;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
    const [dd, mm, yy] = d.split('/');
    return new Date(`${yy}-${mm}-${dd}`).getTime();
  }
  return new Date(d).getTime();
}

/** يبرز كل تكرارات نص البحث داخل قيمة نصية بإطار <mark> (مطابقة حرفية غير حساسة لحالة الأحرف) */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!text) return text;
  const q = query.trim();
  if (!q) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase()
      ? <mark key={i} className="bg-amber-200 text-stone-900 rounded px-0.5">{part}</mark>
      : <React.Fragment key={i}>{part}</React.Fragment>
  );
}

/** يحدّد الأقسام التي يظهر فيها نص البحث داخل الملف (للبحث العميق) */
function findMatchLocations(c: Case, query: string): string[] {
  const q = normalizeAr(query.trim());
  if (!q) return [];
  const found: string[] = [];
  const has = (s?: string) => !!s && normalizeAr(s).includes(q);
  if (has(c.mahakimId) || has(c.id) || has(c.nationalId)) found.push('بيانات الملف');
  if (has(c.subject) || has(c.type) || has(c.court) || has(c.judge) || has(c.section)) found.push('الموضوع/المحكمة');
  if (has(c.defendant) || (c.parties || []).some(p => has(p.name) || has(p.role))) found.push('الأطراف');
  if ((c.procedures || []).some(p => has(p.action) || has(p.decision))) found.push('الإجراءات');
  if (has(c.pvNumber) || has(c.offenseType) || has(c.pvStatus)) found.push('المخالفة');
  if (has(c.executionStatus) || has(c.executionObstacle) || has(c.notificationMethod)) found.push('التنفيذ');
  if (has(c.assignedTo) || has(c.parcelRef)) found.push('المتابعة/الموقع');
  return found;
}

const recentCases: Case[] = [
  {
    id: 'CTX-2024-001', mahakimId: '2024/1101/221', date: '2024-03-15',
    type: 'مدني', subject: 'الترامي على الملك الغابوي',
    court: 'المحكمة الابتدائية بتطوان', status: 'جلسة مبرمجة',
    nextSession: '2024-06-15', defendant: 'أحمد التطواني',
    procedures: [
      { date: '2024-03-15', action: 'تسجيل المقال', decision: '-' },
      { date: '2024-05-15', action: 'إدراج الجلسة', decision: 'تأخير لإعداد الدفاع' }
    ],
    parties: [
      { role: 'المدعي', name: 'إدارة المياه والغابات' },
      { role: 'المدعى عليه', name: 'أحمد التطواني' }
    ]
  },
  {
    id: 'CTX-2024-002', mahakimId: '2023/7101/458', date: '2023-11-02',
    type: 'جنحي', subject: 'قطع الأشجار بدون مرخص',
    court: 'محكمة الاستئناف بالقنيطرة', status: 'محجوز للمداولة',
    defendant: 'مجهول'
  },
];

// ─── Fuzzy Search ─────────────────────────────────────────────────────────────

const normalizeAr = (t: string) =>
  t.toLowerCase()
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[يى]/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '');

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function fuzzyMatchCase(c: Case, raw: string): boolean {
  if (!raw.trim()) return true;
  const q = normalizeAr(raw.trim());
  const blob = normalizeAr([
    c.id, c.mahakimId || '', c.nationalId || '', c.court, c.subject,
    c.type, c.status, c.defendant || '', c.judge || '', c.section || '',
    c.pvNumber || '', c.offenseType || '', c.pvStatus || '',
    c.executionStatus || '', c.executionObstacle || '', c.notificationMethod || '',
    c.assignedTo || '', c.parcelRef || '',
    ...(c.parties?.map(p => `${p.role} ${p.name}`) || []),
    ...(c.procedures?.map(p => `${p.action} ${p.decision}`) || []),
  ].join(' '));
  if (blob.includes(q)) return true;
  return q.split(/\s+/).filter(w => w.length >= 2).every(word => {
    if (blob.includes(word)) return true;
    const t = Math.max(1, Math.floor(word.length / 4));
    return blob.split(/\s+/).some(bw => bw.length > 1 && lev(bw, word) <= t);
  });
}

// ─── XLSX Export ──────────────────────────────────────────────────────────────

const sortProcsDesc = (procs?: { date: string }[]) =>
  [...(procs || [])].sort((a, b) => {
    const p = (d: string) => {
      if (d.match(/\d{2}\/\d{2}\/\d{4}/)) { const [dd, mm, yy] = d.split('/'); return new Date(`${yy}-${mm}-${dd}`).getTime(); }
      return new Date(d).getTime() || 0;
    };
    return p(b.date) - p(a.date);
  });

/** يبني صفوف "بطاقة الملف" الكاملة (معلومات، أطراف، إجراءات، عقوبات، تنفيذ، آجال، ربط مكاني، وثائق، جودة) */
function buildCaseSheetRows(c: Case): (string | number)[][] {
  const rows: (string | number)[][] = [];

  const section = (title: string) => {
    rows.push(['']);
    rows.push([`▌ ${title}`]);
    rows.push(['']);
  };

  // ── Info block ──
  rows.push(['بطاقة الملف', '', '', '']);
  rows.push(['المرجع الداخلي', c.id, 'رقم محاكم', c.mahakimId || '']);
  rows.push(['الرقم الوطني للملف', c.nationalId || '', 'المحكمة', c.court]);
  rows.push(['نوع الدعوى', c.type, 'الشعبة', c.section || '']);
  rows.push(['القاضي المقرر', c.judge || '', 'تاريخ التسجيل', c.date]);
  rows.push(['موضوع النزاع', c.subject, 'الخصم الرئيسي', c.defendant || '']);
  rows.push(['الوضعية', c.status, 'الجلسة القادمة', c.nextSession || '']);
  rows.push(['المكلَّف بالملف', c.assignedTo || '', 'يحتاج تدقيق', needsManualReview(c) ? 'نعم' : 'لا']);
  if (c.lastSyncedAt) {
    rows.push(['آخر مزامنة من البوابة', new Date(c.lastSyncedAt).toLocaleString('fr-MA'), 'عدد المزامنات', c.syncCount || 1]);
  }

  // ── Parties ──
  if (c.parties && c.parties.length > 0) {
    section('لائحة الأطراف');
    rows.push(['الصفة', 'الاسم / الهيئة']);
    c.parties.forEach(p => rows.push([p.role, p.name]));
  } else if (c.defendant) {
    section('لائحة الأطراف');
    rows.push(['الصفة', 'الاسم / الهيئة']);
    rows.push(['ضد', c.defendant]);
  }

  // ── Procedures ──
  if (c.procedures && c.procedures.length > 0) {
    section('الإجراءات والجلسات');
    rows.push(['تاريخ الإجراء', 'نوع الإجراء', 'القرار / الملاحظة', 'رقم الحكم / الخبرة']);
    sortProcsDesc(c.procedures).forEach(proc => rows.push([proc.date, (proc as any).action, (proc as any).decision, (proc as any).number || '']));
  }

  // ── PV ──
  if (c.pvNumber || c.offenseType || c.fine) {
    section('محضر المخالفة والعقوبات');
    rows.push(['رقم المحضر', c.pvNumber || '', 'تاريخ المحضر', c.pvDate || '']);
    rows.push(['نوع الجنحة', c.offenseType || '', 'مآل المحضر', c.pvStatus || '']);
    rows.push(['الغرامة (د.م)', c.fine ? Number(c.fine) : '', 'التعويضات (د.م)', c.compensation ? Number(c.compensation) : '']);
    rows.push(['الإرجاع', c.restitution || '', 'عقوبات أخرى', c.otherSanctions || '']);
    rows.push(['صلح', c.reconciliation ? 'نعم' : 'لا', '', '']);
  }

  // ── Execution ──
  if (c.executionStatus || c.notificationMethod) {
    section('جناح التنفيذ والتبليغات');
    rows.push(['حالة التنفيذ', c.executionStatus || '', 'طريقة التبليغ', c.notificationMethod || '']);
    rows.push(['تاريخ التبليغ', c.notificationDate || '', 'تاريخ التنفيذ', c.executionDate || '']);
    rows.push(['المبالغ المستخلصة (د.م)', c.executionAmountRecovered ? Number(c.executionAmountRecovered) : '', 'عائق التنفيذ', c.executionObstacle || '']);
  }

  // ── Deadlines ──
  const deadlines = computeDeadlines(c);
  if (deadlines.length > 0) {
    section('الآجال القانونية');
    rows.push(['الأجل', 'تاريخ الانطلاق', 'تاريخ الاستحقاق', 'الأيام المتبقية', 'الأساس القانوني']);
    deadlines.forEach(d => rows.push([d.label, d.fromDate, d.dueDate, d.daysLeft, d.basis]));
  }

  // ── الربط المكاني ──
  if (c.parcelRef || c.parcelArea || c.estimatedValue || c.geoLat) {
    section('الربط المكاني — القطعة الغابوية');
    rows.push(['مرجع الرسم العقاري / مطلب التحفيظ', c.parcelRef || '', 'المساحة (هكتار)', c.parcelArea || '']);
    rows.push(['القيمة التقديرية (د.م)', c.estimatedValue ? Number(c.estimatedValue) : '', 'الموقع (خ.ع / خ.ط)', c.geoLat && c.geoLng ? `${c.geoLat}, ${c.geoLng}` : '']);
  }

  // ── الوثائق ──
  if (c.documents && c.documents.length > 0) {
    section('الوثائق المرفقة');
    rows.push(['اسم الوثيقة', 'النوع', 'الرابط', 'تاريخ الإضافة']);
    c.documents.forEach(d => rows.push([d.name, d.type || '', d.url, d.addedAt || '']));
  }

  // ── ملاحظات الجودة ──
  const flags = getQualityFlags(c);
  if (flags.length > 0) {
    section('ملاحظات التدقيق');
    flags.forEach(f => rows.push([`⚠ ${f}`, '', '', '']));
  }

  return rows;
}

/** Single case → ONE sheet with all data laid out vertically */
export function exportSingleCaseXLSX(c: Case) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(buildCaseSheetRows(c));
  ws['!cols'] = [{ wch: 28 }, { wch: 38 }, { wch: 28 }, { wch: 38 }];
  XLSX.utils.book_append_sheet(wb, ws, 'بطاقة الملف الكاملة');
  XLSX.writeFile(wb, `ملف_${(c.mahakimId || c.id).replace(/\//g, '-')}.xlsx`);
}

/** يحوّل عنوان الملف إلى اسم ورقة Excel صالح (≤31 حرفاً، بدون رموز ممنوعة) ويضمن عدم التكرار */
function sanitizeSheetName(name: string, used: Set<string>): string {
  let s = (name || 'ملف').replace(/[\\/?*[\]:]/g, '-').trim();
  if (!s) s = 'ملف';
  if (s.length > 31) s = s.slice(0, 31);
  let final = s;
  let i = 2;
  while (used.has(final)) {
    const suffix = ` (${i})`;
    final = s.slice(0, 31 - suffix.length) + suffix;
    i++;
  }
  used.add(final);
  return final;
}

/** كل الملفات → مصنّف واحد، كل ملف في ورقة (sheet) منفصلة باسمه — للتحميل الجماعي */
export function exportAllCasesWorkbookXLSX(cases: Case[]) {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  // ورقة فهرس أولاً
  const indexRows: (string | number)[][] = [
    ['الفهرس — قائمة الملفات', '', '', ''],
    ['رقم محاكم', 'المحكمة', 'الموضوع', 'الوضعية'],
  ];
  cases.forEach(c => indexRows.push([c.mahakimId || c.id, c.court, c.subject, c.status]));
  const wsIndex = XLSX.utils.aoa_to_sheet(indexRows);
  wsIndex['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 35 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsIndex, sanitizeSheetName('فهرس', used));

  for (const c of cases) {
    const ws = XLSX.utils.aoa_to_sheet(buildCaseSheetRows(c));
    ws['!cols'] = [{ wch: 28 }, { wch: 38 }, { wch: 28 }, { wch: 38 }];
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(c.mahakimId || c.id, used));
  }

  XLSX.writeFile(wb, `كل_الملفات_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.xlsx`);
}

/** All cases → ONE wide flat sheet, one row per case */
export function exportAllCasesXLSX(cases: Case[]) {
  const wb = XLSX.utils.book_new();

  const headers = [
    'المرجع الداخلي', 'رقم محاكم', 'الرقم الوطني للملف',
    'المحكمة', 'درجة المحكمة', 'الشعبة', 'القاضي المقرر',
    'تاريخ التسجيل', 'نوع الدعوى', 'موضوع النزاع',
    'الوضعية', 'الجلسة القادمة', 'الخصم',
    'الأطراف (ملخص)', 'المكلَّف بالملف',
    'عدد الإجراءات', 'آخر تاريخ إجراء', 'القرار الأخير',
    'رقم المحضر', 'تاريخ المحضر', 'نوع الجنحة', 'مآل المحضر',
    'الغرامة (د.م)', 'التعويضات (د.م)', 'الإرجاع',
    'صلح', 'حالة التنفيذ', 'طريقة التبليغ', 'تاريخ التبليغ',
    'تاريخ التنفيذ', 'المبالغ المستخلصة (د.م)', 'عائق التنفيذ',
    'أقرب أجل', 'تاريخ استحقاقه', 'أيام متبقية',
    'يحتاج تدقيق', 'آخر مزامنة من البوابة', 'عدد المزامنات',
  ];

  const data = cases.map(c => {
    const lastProc = sortProcsDesc(c.procedures)[0];
    const partiesSummary = (c.parties || []).map(p => `${p.role}: ${p.name}`).join(' | ') || c.defendant || '';
    const nd = nearestDeadline(c);

    return [
      c.id, c.mahakimId || '', c.nationalId || '',
      c.court, c.courtLevel || '', c.section || '', c.judge || '',
      c.date, c.type, c.subject,
      c.status, c.nextSession || '', c.defendant || '',
      partiesSummary, c.assignedTo || '',
      (c.procedures || []).length, lastProc?.date || '', lastProc?.decision || '',
      c.pvNumber || '', c.pvDate || '', c.offenseType || '', c.pvStatus || '',
      c.fine ? Number(c.fine) : '', c.compensation ? Number(c.compensation) : '', c.restitution || '',
      c.reconciliation ? 'نعم' : '', c.executionStatus || '', c.notificationMethod || '', c.notificationDate || '',
      c.executionDate || '', c.executionAmountRecovered ? Number(c.executionAmountRecovered) : '', c.executionObstacle || '',
      nd?.label || '', nd?.dueDate || '', nd ? nd.daysLeft : '',
      needsManualReview(c) ? 'نعم' : 'لا',
      c.lastSyncedAt ? new Date(c.lastSyncedAt).toLocaleString('fr-MA') : '', c.syncCount || '',
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  ws['!cols'] = headers.map((h, i) => ({
    wch: [18, 18, 20, 28, 14, 16, 22, 14, 12, 30, 22, 14, 20, 40, 16, 8, 14, 30, 14, 14, 25, 18, 12, 12, 20, 6, 18, 20, 14, 14, 18, 35, 22, 14, 10, 12, 18, 8][i] || 18
  }));
  XLSX.utils.book_append_sheet(wb, ws, 'قاعدة بيانات القضايا');
  XLSX.writeFile(wb, `قاعدة_بيانات_القضايا_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.xlsx`);
}

/** تقرير دوري (شهري/فصلي) جاهز للإرسال للمديرية الجهوية — توزيع حسب المحكمة والنوع + مقارنة بفترة سابقة */
export function exportPeriodicReportXLSX(cases: Case[], from: string, to: string, label: string) {
  const wb = XLSX.utils.book_new();
  const inRange = (c: Case) => c.date >= from && c.date <= to;
  const current = cases.filter(inRange);

  // فترة سابقة بنفس الطول للمقارنة
  const f = new Date(from), t = new Date(to);
  const spanDays = Math.max(1, Math.round((t.getTime() - f.getTime()) / 86400000));
  const prevTo = new Date(f); prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - spanDays);
  const prevToStr = prevTo.toISOString().split('T')[0];
  const prevFromStr = prevFrom.toISOString().split('T')[0];
  const previous = cases.filter(c => c.date >= prevFromStr && c.date <= prevToStr);

  const judgedCount = (arr: Case[]) => arr.filter(c => /حكم|قرار|صدر/.test(c.status)).length;
  const executedCount = (arr: Case[]) => arr.filter(c => c.executionStatus?.includes('منفذ')).length;
  const recovered = (arr: Case[]) => arr.reduce((s, c) => s + (parseFloat(c.executionAmountRecovered || '0') || 0), 0);
  const sanctioned = (arr: Case[]) => arr.reduce((s, c) => s + (parseFloat(c.fine || '0') || 0) + (parseFloat(c.compensation || '0') || 0), 0);
  const winRate = (arr: Case[]) => {
    const judged = arr.filter(c => /حكم|قرار|صدر/.test(c.status));
    if (judged.length === 0) return 0;
    const favorable = judged.filter(c =>
      !/رفض|عدم قبول|عدم الاختصاص|بطلان/.test(c.status) || /لفائدة|الوكالة|قبول/.test(c.status)
    ).length;
    return (favorable / judged.length) * 100;
  };

  const rows: (string | number)[][] = [];
  rows.push([`تقرير دوري — ${label}`, '', '', '']);
  rows.push(['الفترة', `${from} → ${to}`, 'تاريخ الإصدار', new Date().toLocaleDateString('fr-MA')]);
  rows.push(['']);
  rows.push(['▌ المؤشرات العامة', '', '', '']);
  rows.push(['المؤشر', 'الفترة الحالية', 'الفترة السابقة', 'التغيّر']);
  const metric = (name: string, cur: number, prev: number, suffix = '') => {
    const diff = cur - prev;
    const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '—';
    rows.push([name, `${cur}${suffix}`, `${prev}${suffix}`, `${arrow} ${Math.abs(diff)}${suffix}`]);
  };
  metric('عدد الملفات المسجَّلة', current.length, previous.length);
  metric('عدد الأحكام/القرارات الصادرة', judgedCount(current), judgedCount(previous));
  metric('عدد الملفات المنفَّذة', executedCount(current), executedCount(previous));
  metric('نسبة الربح (تقديرية %)', Math.round(winRate(current)), Math.round(winRate(previous)), '%');
  metric('المبالغ المستخلصة (د.م)', Math.round(recovered(current)), Math.round(recovered(previous)));
  metric('المبالغ المحكوم بها (د.م)', Math.round(sanctioned(current)), Math.round(sanctioned(previous)));

  rows.push(['']);
  rows.push(['▌ التوزيع حسب المحكمة', '', '', '']);
  rows.push(['المحكمة', 'عدد الملفات', 'أحكام صادرة', 'منفَّذة']);
  const byCourt = new Map<string, Case[]>();
  current.forEach(c => { const k = c.court || 'غير محدد'; if (!byCourt.has(k)) byCourt.set(k, []); byCourt.get(k)!.push(c); });
  for (const [court, arr] of byCourt) rows.push([court, arr.length, judgedCount(arr), executedCount(arr)]);

  rows.push(['']);
  rows.push(['▌ التوزيع حسب نوع الدعوى', '', '', '']);
  rows.push(['النوع', 'عدد الملفات', 'أحكام صادرة', 'منفَّذة']);
  const byType = new Map<string, Case[]>();
  current.forEach(c => { const k = c.type || 'غير محدد'; if (!byType.has(k)) byType.set(k, []); byType.get(k)!.push(c); });
  for (const [type, arr] of byType) rows.push([type, arr.length, judgedCount(arr), executedCount(arr)]);

  rows.push(['']);
  rows.push(['▌ ملفات تحتاج تدقيقاً (للمتابعة)', '', '', '']);
  rows.push(['رقم محاكم', 'الموضوع', 'ملاحظة', '']);
  current.filter(needsManualReview).forEach(c => {
    rows.push([c.mahakimId || c.id, c.subject, getQualityFlags(c)[0] || '', '']);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 32 }, { wch: 22 }, { wch: 22 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws, 'التقرير الدوري');
  XLSX.writeFile(wb, `تقرير_دوري_${label.replace(/\s+/g, '_')}.xlsx`);
}


// ─── PDF Export — بطاقة تقنية محترفة ───────────────────────────────────────────

function esc(s: any): string {
  return String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] as string));
}

const SEVERITY_BG: Record<DeadlineItem['severity'], string> = {
  expired: '#fee2e2', critical: '#fee2e2', warning: '#fef3c7', ok: '#d1fae5',
};
const SEVERITY_FG: Record<DeadlineItem['severity'], string> = {
  expired: '#b91c1c', critical: '#c2410c', warning: '#92400e', ok: '#047857',
};
const SEVERITY_TXT: Record<DeadlineItem['severity'], string> = {
  expired: 'منتهٍ', critical: 'حرج', warning: 'قريب', ok: 'عادي',
};

/** يبني HTML لبطاقة تقنية كاملة عن ملف — تُستخدم مع html2pdf لتوليد PDF منظَّم */
function buildCaseCardHTML(c: Case): string {
  const procs = sortProcsDesc(c.procedures);
  const deadlines = computeDeadlines(c);
  const flags = getQualityFlags(c);
  const decoded = decodeNationalId(c);

  const row = (l: string, v: any) => `
    <div style="flex:1 1 50%; padding:6px 10px; box-sizing:border-box;">
      <div style="font-size:10px; color:#78716c; font-weight:700;">${esc(l)}</div>
      <div style="font-size:13px; color:#1c1917; font-weight:700;">${esc(v || '—')}</div>
    </div>`;

  const section = (title: string, body: string) => `
    <div style="margin-top:16px; page-break-inside:avoid;">
      <div style="font-size:14px; font-weight:800; color:#065f46; border-bottom:2px solid #d1fae5; padding-bottom:6px; margin-bottom:8px;">${esc(title)}</div>
      ${body}
    </div>`;

  let html = `
  <div dir="rtl" style="font-family: 'Tahoma','Segoe UI',Arial,sans-serif; width:760px; padding:24px; color:#1c1917; background:#ffffff;">
    <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #047857; padding-bottom:12px; margin-bottom:12px;">
      <div>
        <div style="font-size:18px; font-weight:900; color:#064e3b;">بطاقة تقنية للملف</div>
        <div style="font-size:11px; color:#78716c; margin-top:2px;">الوكالة الوطنية للمياه والغابات — قسم المنازعات</div>
      </div>
      <div style="text-align:left;">
        <div style="font-size:16px; font-weight:900; font-family:monospace; color:#047857;">${esc(c.mahakimId || c.id)}</div>
        <div style="font-size:10px; color:#a8a29e;">${esc(new Date().toLocaleDateString('fr-MA'))}</div>
      </div>
    </div>

    <div style="display:flex; flex-wrap:wrap; border:1px solid #e7e5e4; border-radius:10px; overflow:hidden;">
      ${row('المرجع الداخلي', c.id)}
      ${row('الرقم الوطني للملف', c.nationalId)}
      ${row('المحكمة', c.court)}
      ${row('درجة المحكمة / الشعبة', [c.courtLevel, c.section].filter(Boolean).join(' — '))}
      ${row('نوع الدعوى', c.type)}
      ${row('تاريخ التسجيل', c.date)}
      ${row('القاضي / المستشار المقرر', c.judge)}
      ${row('المكلَّف بالملف', c.assignedTo)}
      ${row('الوضعية الحالية', c.status)}
      ${row('الجلسة القادمة', c.nextSession)}
      <div style="flex:1 1 100%; padding:6px 10px; box-sizing:border-box;">
        <div style="font-size:10px; color:#78716c; font-weight:700;">موضوع النزاع</div>
        <div style="font-size:13px; color:#1c1917; font-weight:700;">${esc(c.subject)}</div>
      </div>
    </div>`;

  // ── Parties ──
  if (c.parties && c.parties.length) {
    html += section('الأطراف', `
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead><tr style="background:#f5f5f4;">
          <th style="border:1px solid #e7e5e4; padding:6px; text-align:right;">الصفة</th>
          <th style="border:1px solid #e7e5e4; padding:6px; text-align:right;">الاسم / الهيئة</th>
        </tr></thead>
        <tbody>
          ${c.parties.map(p => `<tr><td style="border:1px solid #e7e5e4; padding:6px;">${esc(p.role)}</td><td style="border:1px solid #e7e5e4; padding:6px; font-weight:700;">${esc(p.name)}</td></tr>`).join('')}
        </tbody>
      </table>`);
  }

  // ── Procedures ──
  if (procs.length) {
    html += section('الإجراءات والجلسات (الأحدث أولاً)', `
      <table style="width:100%; border-collapse:collapse; font-size:11px;">
        <thead><tr style="background:#f5f5f4;">
          <th style="border:1px solid #e7e5e4; padding:6px; width:80px;">التاريخ</th>
          <th style="border:1px solid #e7e5e4; padding:6px;">الإجراء</th>
          <th style="border:1px solid #e7e5e4; padding:6px;">القرار / الملاحظة</th>
        </tr></thead>
        <tbody>
          ${procs.map((p: any) => `<tr><td style="border:1px solid #e7e5e4; padding:6px; font-family:monospace;">${esc(p.date)}</td><td style="border:1px solid #e7e5e4; padding:6px; font-weight:700;">${esc(p.action)}${p.number ? ` (${esc(p.number)})` : ''}</td><td style="border:1px solid #e7e5e4; padding:6px; color:#047857;">${esc(p.decision)}</td></tr>`).join('')}
        </tbody>
      </table>`);
  }

  // ── PV & sanctions ──
  if (c.pvNumber || c.offenseType || c.fine) {
    html += section('محضر المخالفة والعقوبات', `
      <div style="display:flex; flex-wrap:wrap; border:1px solid #fed7aa; border-radius:10px; overflow:hidden; background:#fffbeb;">
        ${row('رقم المحضر', c.pvNumber)}
        ${row('تاريخ المحضر', c.pvDate)}
        ${row('نوع الجنحة', c.offenseType)}
        ${row('مآل المحضر', c.pvStatus)}
        ${row('الغرامة (د.م)', c.fine ? Number(c.fine).toLocaleString() : '')}
        ${row('التعويضات (د.م)', c.compensation ? Number(c.compensation).toLocaleString() : '')}
        ${row('الإرجاع', c.restitution)}
        ${row('عقوبات أخرى', c.otherSanctions)}
        ${row('صلح', c.reconciliation ? 'نعم' : 'لا')}
      </div>`);
  }

  // ── Execution ──
  if (c.executionStatus || c.notificationMethod) {
    html += section('التنفيذ والتبليغ', `
      <div style="display:flex; flex-wrap:wrap; border:1px solid #a7f3d0; border-radius:10px; overflow:hidden; background:#ecfdf5;">
        ${row('حالة التنفيذ', c.executionStatus)}
        ${row('طريقة التبليغ', c.notificationMethod)}
        ${row('تاريخ التبليغ', c.notificationDate)}
        ${row('تاريخ التنفيذ', c.executionDate)}
        ${row('المبالغ المستخلصة (د.م)', c.executionAmountRecovered ? Number(c.executionAmountRecovered).toLocaleString() : '')}
        <div style="flex:1 1 100%; padding:6px 10px; box-sizing:border-box;">
          <div style="font-size:10px; color:#78716c; font-weight:700;">عائق التنفيذ</div>
          <div style="font-size:12px; color:#1c1917;">${esc(c.executionObstacle || '—')}</div>
        </div>
      </div>`);
  }

  // ── Deadlines ──
  if (deadlines.length) {
    html += section('الآجال القانونية', `
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${deadlines.map(d => `
          <div style="flex:1 1 220px; border-radius:10px; padding:8px 10px; background:${SEVERITY_BG[d.severity]}; color:${SEVERITY_FG[d.severity]};">
            <div style="font-size:11px; font-weight:800;">${esc(d.label)} — ${SEVERITY_TXT[d.severity]}</div>
            <div style="font-size:13px; font-weight:900; font-family:monospace;">${esc(d.dueDate)} (${d.daysLeft >= 0 ? `بعد ${d.daysLeft} يوم` : `منذ ${Math.abs(d.daysLeft)} يوم`})</div>
            <div style="font-size:9px; margin-top:2px;">${esc(d.basis)}</div>
          </div>`).join('')}
      </div>`);
  }

  // ── Geo / parcel ──
  if (c.parcelRef || c.parcelArea || c.estimatedValue || c.geoLat) {
    html += section('الربط المكاني — القطعة الغابوية', `
      <div style="display:flex; flex-wrap:wrap; border:1px solid #e7e5e4; border-radius:10px; overflow:hidden;">
        ${row('مرجع الرسم العقاري / مطلب التحفيظ', c.parcelRef)}
        ${row('المساحة (هكتار)', c.parcelArea)}
        ${row('القيمة التقديرية (د.م)', c.estimatedValue ? Number(c.estimatedValue).toLocaleString() : '')}
        ${row('الموقع (خ.ع° , خ.ط°)', c.geoLat && c.geoLng ? `${c.geoLat}, ${c.geoLng}` : '')}
      </div>`);
  }

  // ── Documents ──
  if (c.documents && c.documents.length) {
    html += section('الوثائق المرفقة', `
      <ul style="font-size:12px; margin:0; padding-right:18px;">
        ${c.documents.map(d => `<li style="margin-bottom:4px;"><strong>${esc(d.name)}</strong>${d.type ? ` — ${esc(d.type)}` : ''} <span style="color:#a8a29e; font-family:monospace; font-size:10px;">${esc(d.url)}</span></li>`).join('')}
      </ul>`);
  }

  // ── National ID check ──
  if (decoded) {
    html += section('التحقق من الرقم الوطني', `
      <div style="font-size:11px; color:${decoded.matches === false ? '#b91c1c' : '#047857'};">
        رمز المحكمة: ${esc(decoded.courtCode)} — السنة: ${esc(decoded.year)} — الرمز: ${esc(decoded.symbol)} — الرقم: ${esc(decoded.number)}
        ${decoded.matches === false ? `<br/>⚠ لا يطابق رقم محاكم المسجَّل (المتوقع ${esc(decoded.rebuiltMahakimId)})` : decoded.matches === true ? ' — ✓ متطابق مع رقم محاكم' : ''}
      </div>`);
  }

  // ── Quality flags ──
  if (flags.length) {
    html += section('ملاحظات التدقيق', `
      <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:8px 12px;">
        ${flags.map(f => `<div style="font-size:11px; color:#b91c1c; font-weight:700;">⚠ ${esc(f)}</div>`).join('')}
      </div>`);
  }

  html += `
    <div style="margin-top:18px; padding-top:8px; border-top:1px solid #e7e5e4; font-size:9px; color:#a8a29e; text-align:center;">
      تم إنشاء هذه البطاقة آلياً من نظام إدارة الوكالة الوطنية للمياه والغابات — قسم المنازعات
    </div>
  </div>`;

  return html;
}

// ── تحميل html2pdf.js من CDN عند الحاجة فقط ─────────────────────────────
// لماذا CDN وليس import('html2pdf.js')؟ لأن import الديناميكي يبقى اسم وحدة
// (module specifier) ثابتاً يحاول Rollup حلّه أثناء build، فإن لم تكن
// المكتبة مثبَّتة في node_modules (npm install) يفشل البناء بالكامل —
// "Rollup failed to resolve import html2pdf.js" — حتى لو لم يُستخدم
// الاستيراد فعلياً إلا عند الضغط على زر PDF. التحميل من CDN في وقت التشغيل
// (runtime) لا يحتاج أي حزمة npm إضافية ولا يؤثر على build.
let html2pdfLoadPromise: Promise<any> | null = null;
function loadHtml2Pdf(): Promise<any> {
  const w = window as any;
  if (w.html2pdf) return Promise.resolve(w.html2pdf);
  if (html2pdfLoadPromise) return html2pdfLoadPromise;
  html2pdfLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    script.async = true;
    script.onload = () => {
      if (w.html2pdf) resolve(w.html2pdf);
      else reject(new Error('تعذّر تحميل مكتبة PDF (html2pdf غير معرَّفة بعد التحميل)'));
    };
    script.onerror = () => {
      html2pdfLoadPromise = null; // اسمح بإعادة المحاولة لاحقاً
      reject(new Error('تعذّر تحميل مكتبة PDF من الشبكة (html2pdf.js) — تحقّق من الاتصال'));
    };
    document.head.appendChild(script);
  });
  return html2pdfLoadPromise;
}

/**
 * يحوّل HTML إلى PDF عبر html2pdf.js (يُحمَّل من CDN عند أول استخدام).
 *
 * ملاحظة هامة: لا نستعمل `position: fixed; left: -9999px` لإخفاء الحاوية
 * أثناء التصوير — html2canvas يحاول قياس حدود المستند الكاملة، وإزاحة
 * -9999px تجعله يحاول رسم صورة (canvas) بعرض يتجاوز 10000px، وهو ما يستهلك
 * مئات الميغابايتات ويُسقط (crash) المتصفح خصوصاً على الهاتف. بدلاً من ذلك،
 * نعرض البطاقة داخل غطاء (overlay) أبيض ظاهر فعلياً في أعلى الشاشة (يخبر
 * المستخدم أن PDF قيد الإنشاء) — وهذا أيضاً أكثر احترافية من عمل مخفي تماماً.
 */
async function htmlToPDF(html: string, filename: string, multiPage = false) {
  const html2pdf = await loadHtml2Pdf();

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999; background: rgba(241,245,249,0.97);
    overflow: auto; padding: 16px; display: flex; flex-direction: column; align-items: center;
  `;
  const note = document.createElement('div');
  note.textContent = '⏳ جارٍ إنشاء ملف PDF — يُرجى الانتظار...';
  note.style.cssText = `
    font-family: system-ui, sans-serif; font-weight: 800; font-size: 14px;
    color: #065f46; background: #d1fae5; border: 1px solid #6ee7b7;
    border-radius: 10px; padding: 8px 16px; margin-bottom: 12px;
  `;
  overlay.appendChild(note);

  const container = document.createElement('div');
  container.innerHTML = html;
  container.style.width = '210mm'; // عرض صفحة A4 — يحدّ من حجم الصورة المُنشأة
  container.style.maxWidth = '100%';
  container.style.background = '#ffffff';
  container.style.boxShadow = '0 0 0 1px #e7e5e4';
  overlay.appendChild(container);
  document.body.appendChild(overlay);

  try {
    const opts: any = {
      margin: 8,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      // ⚠️ لا تمرّر pagebreak: undefined — مكتبة html2pdf.js تقرأ
      // pagebreak.mode مباشرة وتُسقط الصفحة بخطأ
      // "Cannot read properties of undefined (reading 'mode')" إن لم تكن
      // pagebreak كائناً دائماً (حتى لو ملفاً واحداً فقط).
      pagebreak: multiPage ? { mode: ['css', 'legacy'] } : { mode: ['avoid-all', 'css'] },
    };
    await html2pdf().set(opts).from(container).save();
  } catch (err) {
    alert('⚠️ تعذّر إنشاء ملف PDF: ' + (err instanceof Error ? err.message : String(err)));
    throw err;
  } finally {
    document.body.removeChild(overlay);
  }
}

/** تصدير بطاقة تقنية PDF لملف واحد */
export async function exportCasePDF(c: Case) {
  await htmlToPDF(buildCaseCardHTML(c), `بطاقة_${(c.mahakimId || c.id).replace(/\//g, '-')}.pdf`);
}

/** تصدير PDF واحد يضم كل الملفات (كل ملف في صفحة/صفحات منفصلة بعنوان واضح) */
export async function exportAllCasesPDF(cases: Case[]) {
  const cover = `
    <div dir="rtl" style="font-family:'Tahoma','Segoe UI',Arial,sans-serif; width:760px; padding:40px; text-align:center;">
      <div style="font-size:22px; font-weight:900; color:#064e3b; margin-bottom:8px;">تقرير شامل لملفات المنازعات</div>
      <div style="font-size:12px; color:#78716c; margin-bottom:24px;">الوكالة الوطنية للمياه والغابات — تم الإنشاء في ${esc(new Date().toLocaleString('fr-MA'))}</div>
      <div style="font-size:13px; color:#1c1917; font-weight:700;">عدد الملفات: ${cases.length}</div>
    </div>
    <div style="page-break-after: always;"></div>`;

  const pages = cases.map((c, i) => `
    ${buildCaseCardHTML(c)}
    ${i < cases.length - 1 ? '<div style="page-break-after: always;"></div>' : ''}
  `).join('');

  await htmlToPDF(cover + pages, `تقرير_شامل_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.pdf`, true);
}



function performParsing(text: string) {
  const clean = text.replace(/[\r]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const tokens = clean.split(/[\t\n]+/).map(s => s.trim()).filter(Boolean);

  const INFO_LABELS: Record<string, string> = {
    'المحكمة': 'court',
    'رقم الملف بالمحكمة': 'mahakimId',
    'نوع الملف': 'type',
    'الرقم الوطني للملف': 'nationalId',
    'الشعبة': 'section',
    'المستشار / القاضي المقرر': 'judge',
    'المستشار': 'judge',
    'القاضي المقرر': 'judge',
    'تاريخ التسجيل': 'date',
    'الموضوع': 'subject',
    'آخر حكم/قرار': 'lastDecision',
    'تاريخ آخر حكم / القرار': 'lastDecisionDate',
    'جاهزية نسخة الحكم / القرار': 'judgmentReady',
  };
  const labelKeys = Object.keys(INFO_LABELS);

  // ── Case info extraction ──
  // Each label's value = IMMEDIATELY next token (if it is not itself a label).
  // This prevents the "موضوع" field from accidentally receiving the judgment text.
  const infoMap: Record<string, string> = {};
  for (let i = 0; i < tokens.length; i++) {
    const matchLabel = labelKeys.find(l => tokens[i] === l);
    if (matchLabel) {
      const j = i + 1;
      if (j < tokens.length && !labelKeys.includes(tokens[j]) && tokens[j].length >= 1 && tokens[j].length < 250) {
        const key = INFO_LABELS[matchLabel];
        if (!infoMap[key]) infoMap[key] = tokens[j];
        i = j;
      }
      // else label has no value → skip silently
    }
  }

  // ── Validation: judgment text is NOT a subject ──
  const JUDGMENT_RE = /حكم قطعي|حكم ابتدائي|قرار رقم|رقم\s*[:\s]\s*\d{3,}/;
  if (infoMap['subject'] && JUDGMENT_RE.test(infoMap['subject'])) {
    if (!infoMap['lastDecision']) infoMap['lastDecision'] = infoMap['subject'];
    delete infoMap['subject'];
  }

  // Regex fallbacks
  if (!infoMap['mahakimId']) {
    const m = clean.match(/(\d{4}\/\d{3,4}\/\d+)/);
    if (m) infoMap['mahakimId'] = m[1];
  }
  if (!infoMap['date']) {
    const m = clean.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (m) infoMap['date'] = m[1];
  }
  if (!infoMap['court']) {
    const m = clean.match(/(المحكمة\s+الابتدائية[^\n\t]+|المحكمة\s+التجارية[^\n\t]+|محكمة\s+الاستئناف[^\n\t]+|المحكمة\s+الإدارية[^\n\t]+)/u);
    if (m) infoMap['court'] = m[1].trim();
  }
  if (!infoMap['type']) {
    if (clean.includes('جنحي') || clean.includes('جنائي')) infoMap['type'] = 'جنحية';
    else if (clean.includes('افتتاحي') || (clean.includes('مدني') && !infoMap['type'])) infoMap['type'] = 'مدنية';
    else if (clean.includes('إداري')) infoMap['type'] = 'إدارية';
    else if (clean.includes('عقاري')) infoMap['type'] = 'عقارية';
    else if (clean.includes('استعجال')) infoMap['type'] = 'استعجالية';
  }

  // Convert date format dd/mm/yyyy → yyyy-mm-dd
  let dateStr = infoMap['date'] || '';
  if (dateStr.match(/\d{2}\/\d{2}\/\d{4}/)) {
    const [dd, mm, yy] = dateStr.split('/');
    dateStr = `${yy}-${mm}-${dd}`;
  }

  // ── Section boundary detection ──
  // The portal repeats a tab navigation menu where the five section titles appear on
  // consecutive lines ("لائحة الإجراءات / لائحة الأطراف / لائحة الخبرات / ..."). The
  // actual data table follows further down. Older logic cut a section at the next title
  // marker, which — because the markers cluster together in that menu — produced an
  // almost-empty slice (0 procedures). VB.NET pastes the whole page (all 5 tabs at once),
  // so every block carries that menu; the manual two-paste flow hid the problem.
  //
  // Strategy: for a section we find the *header occurrence that is actually followed by
  // that section's data* (a date for procedures, a role word for parties). Its content
  // then runs until the page footer or the next data-bearing section header — never a
  // bare menu line.

  // All indices of a marker, as a plain array.
  const allIdx = (re: RegExp): number[] => {
    const g = new RegExp(re.source, 'g');
    const out: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = g.exec(clean)) !== null) out.push(m.index);
    return out;
  };

  // Header occurrence whose following window actually contains the section's data.
  // We scan a generous window and, among the qualifying headers, keep the one whose data
  // marker appears EARLIEST after it (closest real table), which is the true section.
  const findSection = (re: RegExp, dataMarker: RegExp): number => {
    const idxs = allIdx(re);
    if (idxs.length === 0) return -1;
    let best = -1, bestDist = Infinity;
    for (const i of idxs) {
      const window = clean.substring(i, i + 3000);
      const mm = dataMarker.exec(window);
      if (mm && mm.index < bestDist) { bestDist = mm.index; best = i; }
    }
    return best !== -1 ? best : idxs[0];
  };

  const procIdx   = findSection(/لائحة الإجراءات/, /\n\d{2}\/\d{2}\/\d{4}/);
  // Parties: the real table is a line that starts with a role keyword followed by a TAB
  // (e.g. "مدعي\tالدولة المغربية..."), or the table header "الصفة ... اسم الطرف".
  // This avoids matching the word "المدعى عليه" that appears inside procedure decisions.
  const partIdx   = findSection(
    /لائحة الأطراف/,
    /\n(مدعي|مدعى عليه|متهم|مستأنف عليه|مستأنف|طالب|مطلوب|نيابة عامة|المطالب بالحق المدني|مدخل في الدعوى)\t|الصفة\t/
  );
  const expertIdx = clean.search(/لائحة الخبرات/);
  const appealIdx = clean.search(/عرائض الطعن/);
  const relIdx    = clean.search(/الملفات المرتبطة/);

  // End of a section = the page footer, OR the nearest *data-bearing* section header that
  // sits clearly after the data starts. We ignore markers that fall inside the same tab
  // menu (within ~120 chars of the start) so the procedures/parties tables aren't clipped.
  const sectionEnd = (startIdx: number): number => {
    const footer1 = clean.indexOf('معلومات الاتصال', startIdx + 20);
    const footer2 = clean.indexOf('جميع الحقوق محفوظة', startIdx + 20);
    const dataStarts = [procIdx, partIdx].filter(i => i > startIdx + 120);
    const footers = [footer1, footer2].filter(i => i > startIdx + 20);
    const candidates = [...dataStarts, ...footers];
    return candidates.length > 0 ? Math.min(...candidates) : clean.length;
  };

  // ── Procedures ──
  const SKIP_PROC = new Set(['لائحة الإجراءات', 'تاريخ الإجراء', 'نوع الإجراء', 'القرار',
    'عرائض الطعن', 'لائحة الأطراف', 'لائحة الخبرات', 'الملفات المرتبطة']);
  const procSource = procIdx !== -1 ? clean.substring(procIdx, sectionEnd(procIdx)) : clean;
  const procLines = procSource.split('\n').map(l => l.trim()).filter(l => l && !SKIP_PROC.has(l));
  const procedures: { date: string; action: string; decision: string }[] = [];
  const dateRe = /^(\d{2}\/\d{2}\/\d{4})(?:\s+\d{2}:\d{2})?/;

  // Try tab-separated first (clean table copy)
  const tabRows = procLines.filter(l => l.includes('\t') && l.match(/\d{2}\/\d{2}\/\d{4}/));
  if (tabRows.length > 0) {
    // Build a full index so we can look ahead for "orphan" decision lines
    // e.g. "رقم 889" then "عدم الاختصاص..." on separate lines after "حكم قطعي\t..."
    tabRows.forEach((row, ri) => {
      const parts = row.split('\t').map(s => s.trim());
      const dm = parts[0].match(/(\d{2}\/\d{2}\/\d{4})/);
      if (!dm || !parts[1]) return;
      let action = parts[1];
      let decision = parts[2] || '';

      // If decision is empty, scan subsequent procLines for a non-date non-tab orphan line
      // This handles "حكم قطعي\nرقم 889\n\nعدم الاختصاص..." split across lines
      if (!decision) {
        // Find this row's position in procLines
        const rowIdx = procLines.indexOf(row);
        if (rowIdx !== -1) {
          let j = rowIdx + 1;
          while (j < procLines.length) {
            const nextLine = procLines[j];
            // Stop if we hit the next date row or a tab row with date
            if (nextLine.match(dateRe) || (nextLine.includes('\t') && nextLine.match(dateRe))) break;
            // Skip "رقم NNN" lines — append to action
            if (/^رقم\s+\d+/.test(nextLine)) {
              action = action + ' ' + nextLine;
              j++;
              continue;
            }
            // A non-date line with content = decision
            const candidate = nextLine.replace(/\t/g, '').trim();
            if (candidate && candidate.length > 2) {
              decision = candidate;
              break;
            }
            j++;
          }
        }
      }

      procedures.push({ date: dm[1], action, decision });
    });
  } else {
    // Line-by-line
    let i = 0;
    while (i < procLines.length) {
      const dm = procLines[i].match(dateRe);
      if (dm) {
        const d = dm[1];
        const inline = procLines[i].replace(dm[0], '').trim();
        const action = inline || (i+1 < procLines.length && !procLines[i+1]?.match(dateRe) ? procLines[i+1] : '');
        const decIdx = inline ? i+1 : i+2;
        const decision = decIdx < procLines.length && !procLines[decIdx]?.match(dateRe) ? procLines[decIdx] : '';
        if (action) { procedures.push({ date: d, action, decision }); i += inline ? (decision ? 2 : 1) : (decision ? 3 : 2); }
        else i++;
      } else i++;
    }
  }

  // ── Parties ──
  const ROLE_KW = ['مدعي', 'مدعى عليه', 'متهم', 'المطالب بالحق المدني',
    'طالب', 'مطلوب', 'مستأنف عليه', 'مستأنف', 'نيابة عامة', 'مدخل في الدعوى'];
  const SKIP_PARTY = new Set(['لائحة الأطراف', 'الصفة', 'الاسم / الهيئة', 'المحامون']);
  const partSource = partIdx !== -1 ? clean.substring(partIdx, sectionEnd(partIdx)) : clean;
  const partLines = partSource.split('\n').map(l => l.trim()).filter(l => l && !SKIP_PARTY.has(l) && l !== '-');
  const parties: { role: string; name: string }[] = [];

  const tabPartyRows = partLines.filter(l => l.includes('\t') && !l.match(dateRe));
  if (tabPartyRows.length > 0) {
    tabPartyRows.forEach(row => {
      const pts = row.split('\t').map(s => s.trim());
      if (pts.length >= 2 && ROLE_KW.some(r => pts[0].includes(r))) parties.push({ role: pts[0], name: pts[1] });
    });
  } else {
    for (let i = 0; i < partLines.length; i++) {
      const role = ROLE_KW.find(r => partLines[i] === r || partLines[i].startsWith(r + ' '));
      if (role) {
        const inline = partLines[i].slice(role.length).trim();
        const name = inline || (i+1 < partLines.length && !ROLE_KW.some(r => partLines[i+1].startsWith(r)) ? partLines[i+1] : 'غير محدد');
        parties.push({ role, name });
        if (name !== 'غير محدد' && !inline) i++;
      }
    }
  }
  if (parties.length === 0) {
    if (clean.includes('الوكالة الوطنية للمياه') || clean.includes('ANEF')) {
      parties.push({ role: 'مدعي / المطالب بالحق المدني', name: 'الوكالة الوطنية للمياه والغابات' });
    } else {
      parties.push({ role: 'مدعي', name: 'إدارة المياه والغابات' });
    }
    parties.push({ role: 'مدعى عليه / متهم', name: 'مجهول (استخراج تلقائي)' });
  }

  // ── Status ──
  const lastDecision = infoMap['lastDecision'] || '';
  const status = lastDecision.includes('حكم') || lastDecision.includes('قرار')
    ? `صدر: ${lastDecision}`
    : procedures.length > 0 ? 'جلسات مبرمجة' : 'بيانات مستخرجة';

  const sortedProcs = [...procedures].sort((a, b) => {
    const p = (d: string) => {
      if (d.match(/\d{2}\/\d{2}\/\d{4}/)) { const [dd, mm, yy] = d.split('/'); return new Date(`${yy}-${mm}-${dd}`).getTime(); }
      return 0;
    };
    return p(b.date) - p(a.date);
  });

  return {
    mahakimId: infoMap['mahakimId'] || '-',
    nationalId: infoMap['nationalId'] || '-',
    court: infoMap['court'] || 'غير محددة',
    type: infoMap['type'] || 'غير محدد',
    subject: infoMap['subject'] || 'غير محدد',
    date: dateStr || new Date().toISOString().split('T')[0],
    judge: infoMap['judge'] || '-',
    section: infoMap['section'] || '-',
    status,
    nextSession: sortedProcs[0]?.date || '-',
    defendant: parties.find(p => ['مدعى عليه', 'متهم', 'مستأنف عليه', 'مطلوب'].some(r => p.role.includes(r)))?.name || 'مجهول',
    parties,
    procedures: procedures.reverse(),
    lastDecision: infoMap['lastDecision'] || '',
    lastDecisionDate: infoMap['lastDecisionDate'] || '',
  };
}

// ─── CaseDetail ───────────────────────────────────────────────────────────────

function CaseDetail({ caseData, onBack, onDelete, onEdit, allCases, onSelectCase }: {
  caseData: Case; onBack: () => void; onDelete: (id: string) => void; onEdit: () => void;
  allCases: Case[]; onSelectCase: (c: Case) => void;
}) {
  const deadlines = useMemo(() => computeDeadlines(caseData), [caseData]);
  const qualityFlags = useMemo(() => getQualityFlags(caseData), [caseData]);
  const reviewFlag = needsManualReview(caseData);
  const idCheck = useMemo(() => decodeNationalId(caseData), [caseData]);
  const related = useMemo(() => relatedCasesBySameDefendant(caseData, allCases), [caseData, allCases]);

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl shadow-sm border border-stone-200">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={onBack}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl transition-all shadow hover:-translate-y-0.5 text-sm">
            <ChevronLeft className="size-4" /> رجوع للقائمة
          </button>
          <div className="border-r-2 border-stone-200 pr-4">
            <h2 className="text-lg font-bold flex items-center gap-2 flex-wrap">
              <Scale className="size-5 text-emerald-600" />
              ملف: <span className="font-mono text-emerald-700">{caseData.mahakimId || caseData.id}</span>
              {reviewFlag && (
                <span title={qualityFlags.join(' • ') || 'علِّم يدوياً كـ«يحتاج تدقيق»'}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200 cursor-help">
                  <ShieldAlert className="size-3" /> يحتاج تدقيق
                </span>
              )}
              {deadlines.some(d => d.severity === 'expired' || d.severity === 'critical') && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">
                  <CalendarClock className="size-3" /> آجال حرجة
                </span>
              )}
              {caseData.assignedTo && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  <UserCog className="size-3" /> {caseData.assignedTo}
                </span>
              )}
            </h2>
            {caseData.mahakimId && <p className="text-xs text-stone-400 font-mono mt-0.5">مرجع: {caseData.id}</p>}
            {(() => {
              const sa = syncAge(caseData.lastSyncedAt);
              if (!sa) return null;
              return (
                <p className={`text-[11px] font-bold mt-0.5 flex items-center gap-1 ${sa.cls}`}>
                  <RefreshCw className="size-3" /> آخر مزامنة من البوابة: {sa.label}{caseData.syncCount ? ` (×${caseData.syncCount})` : ''}
                </p>
              );
            })()}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => exportSingleCaseXLSX(caseData)}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg font-bold text-sm border border-emerald-200">
            <FileSpreadsheet className="size-4" /> Excel
          </button>
          <button onClick={() => exportCasePDF(caseData)}
            className="flex items-center gap-2 px-3 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg font-bold text-sm border border-rose-200">
            <FileDown className="size-4" /> بطاقة PDF
          </button>
          <button onClick={() => downloadTextFile(buildICS([caseData]), `جلسات_${(caseData.mahakimId || caseData.id).replace(/\//g, '-')}.ics`, 'text/calendar')}
            className="flex items-center gap-2 px-3 py-2 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg font-bold text-sm border border-purple-200">
            <CalendarClock className="size-4" /> iCal
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-2 px-3 py-2 bg-stone-50 text-stone-700 hover:bg-stone-100 rounded-lg font-bold text-sm border border-stone-200">
            <Printer className="size-4" /> طباعة
          </button>
          <button onClick={onEdit}
            className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-bold text-sm border border-blue-200">
            <Activity className="size-4" /> تعديل
          </button>
          <button onClick={() => { if (window.confirm('هل تريد حذف هذا الملف نهائياً؟')) onDelete(caseData.id); }}
            className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-bold text-sm border border-red-200">
            <Trash2 className="size-4" /> حذف
          </button>
        </div>
      </div>

      {/* ── الآجال القانونية: عدّادات تنازلية مبنية على دقة المسطرة المغربية ── */}
      {deadlines.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
          <h3 className="font-bold text-base border-b border-stone-100 pb-3 mb-4 flex items-center gap-2">
            <CalendarClock className="size-5 text-emerald-600" /> الآجال القانونية
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {deadlines.map(d => {
              const cls = d.severity === 'expired' ? 'bg-red-50 border-red-200 text-red-700'
                : d.severity === 'critical' ? 'bg-orange-50 border-orange-200 text-orange-700'
                : d.severity === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700';
              const tag = d.severity === 'expired' ? 'منتهٍ' : d.severity === 'critical' ? 'حرج' : d.severity === 'warning' ? 'قريب' : 'عادي';
              return (
                <div key={d.key} className={`rounded-xl border p-3 ${cls}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs">{d.label}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/70">{tag}</span>
                  </div>
                  <p className="text-2xl font-black font-mono leading-none">
                    {d.daysLeft >= 0 ? d.daysLeft : Math.abs(d.daysLeft)}
                    <span className="text-xs font-bold mr-1"> {d.daysLeft >= 0 ? 'يوم متبقي' : 'يوم تجاوز'}</span>
                  </p>
                  <p className="text-[10px] mt-1 opacity-80">يستحق في {d.dueDate} • أساسه: {d.basis}</p>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-stone-400 mt-3 leading-relaxed">
            * تقديرات آلية وفق القواعد العامة للمسطرة (الأجل الكامل délai franc + استبعاد عطل نهاية الأسبوع). يرجى التحقق من المهم منها مع المستشار القانوني، خصوصاً آجال أداء مصاريف الخبرة والعطل الرسمية.
          </p>
        </div>
      )}


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
            <h3 className="font-bold text-lg border-b border-stone-100 pb-3 mb-5 flex items-center gap-2">
              <Activity className="size-5 text-emerald-600" /> لائحة الإجراءات والجلسات
            </h3>
            {caseData.procedures && caseData.procedures.length > 0 ? (
              <div className="relative before:absolute before:right-4 before:top-2 before:bottom-2 before:w-px before:bg-stone-200 space-y-4">
                {[...caseData.procedures].sort((a, b) => {
                  const p = (d: string) => { if (d.match(/\d{2}\/\d{2}\/\d{4}/)) { const [dd, mm, yy] = d.split('/'); return new Date(`${yy}-${mm}-${dd}`).getTime(); } return new Date(d).getTime() || 0; };
                  return p(b.date) - p(a.date);
                }).map((proc, idx) => (
                  <div key={idx} className="relative pl-4 pr-12">
                    <div className="absolute right-2.5 top-1 size-3 rounded-full bg-emerald-500 ring-4 ring-emerald-50" />
                    <div className="bg-stone-50 border border-stone-100 rounded-xl p-4">
                      <div className="flex justify-between items-start mb-2 gap-2">
                        <p className="font-bold text-stone-800 text-sm leading-snug">{proc.action}</p>
                        <span className="font-mono text-xs font-bold text-stone-500 bg-white px-2 py-1 rounded border border-stone-200 shrink-0">{proc.date}</span>
                      </div>
                      {proc.decision && proc.decision !== '-' && (
                        <p className="text-sm text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 mt-1">
                          <Gavel className="size-3 shrink-0" /> {proc.decision}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-stone-400">
                <Clock className="size-10 mx-auto mb-3 text-stone-300" />
                <p className="text-sm font-medium">لا توجد إجراءات مسجلة بعد</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-3">
            <h3 className="font-bold border-b border-stone-100 pb-3 flex items-center gap-2 text-sm">
              <FileText className="size-4 text-stone-400" /> تفاصيل الملف
            </h3>
            {[
              { l: 'المحكمة', v: caseData.court },
              { l: 'موضوع النزاع', v: caseData.subject },
              { l: 'تاريخ التسجيل', v: caseData.date, m: true },
              { l: 'النوع', v: caseData.type },
              caseData.judge ? { l: 'القاضي المقرر', v: caseData.judge } : null,
              caseData.section ? { l: 'الشعبة', v: caseData.section } : null,
              caseData.assignedTo ? { l: 'المكلَّف بالملف', v: caseData.assignedTo } : null,
              caseData.nationalId ? { l: 'الرقم الوطني', v: caseData.nationalId, m: true } : null,
            ].filter(Boolean).map((item: any, idx) => (
              <div key={idx}>
                <label className="text-xs text-stone-500">{item.l}</label>
                <p className={`font-bold text-sm text-stone-800 ${item.m ? 'font-mono' : ''}`}>{item.v}</p>
              </div>
            ))}
            {idCheck && idCheck.matches !== null && (
              <div className={`text-[11px] font-bold p-2 rounded-lg flex items-center gap-1.5 ${idCheck.matches ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {idCheck.matches ? <CheckCircle2 className="size-3.5 shrink-0" /> : <AlertTriangle className="size-3.5 shrink-0" />}
                {idCheck.matches
                  ? 'الرقم الوطني متطابق مع رقم محاكم'
                  : `تنبيه: الرقم الوطني يفكَّك إلى ${idCheck.rebuiltMahakimId} ولا يطابق رقم محاكم المسجَّل (${caseData.mahakimId || '—'})`}
              </div>
            )}
            {qualityFlags.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 space-y-1">
                <p className="text-[11px] font-bold text-amber-800 flex items-center gap-1"><ShieldAlert className="size-3.5" /> ملاحظات تدقيق</p>
                <ul className="text-[10px] text-amber-700 list-disc pr-4 space-y-0.5">
                  {qualityFlags.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
            )}
          </div>

          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-3">
            <h3 className="font-bold border-b border-stone-100 pb-3 flex items-center gap-2 text-sm">
              <User className="size-4 text-stone-400" /> الأطراف
            </h3>
            {caseData.parties && caseData.parties.length > 0 ? caseData.parties.map((p, idx) => (
              <div key={idx} className="bg-stone-50 px-3 py-2.5 rounded-xl border border-stone-100">
                <p className="text-[11px] font-bold text-emerald-600 mb-0.5">{p.role}</p>
                <p className="font-bold text-sm text-stone-800">{p.name}</p>
              </div>
            )) : (
              <div className="bg-stone-50 px-3 py-2.5 rounded-xl border border-stone-100">
                <p className="text-[11px] font-bold text-emerald-600 mb-0.5">ضد</p>
                <p className="font-bold text-sm text-stone-800">{caseData.defendant || 'غير محدد'}</p>
              </div>
            )}
          </div>

          {(caseData.pvNumber || caseData.offenseType) && (
            <div className="bg-white p-5 rounded-2xl border border-orange-100 shadow-sm space-y-3">
              <h3 className="font-bold border-b border-orange-100 pb-3 flex items-center gap-2 text-sm text-orange-800">
                <Shield className="size-4 text-orange-500" /> معلومات المخالفة
              </h3>
              {caseData.pvNumber && (
                <div>
                  <label className="text-xs text-stone-500">رقم المحضر</label>
                  <p className="font-bold font-mono text-sm">{caseData.pvNumber}</p>
                  {caseData.pvDate && <p className="text-xs text-stone-400 font-mono">{caseData.pvDate}</p>}
                </div>
              )}
              {caseData.offenseType && <div><label className="text-xs text-stone-500">نوع الجنحة</label><p className="font-bold text-sm">{caseData.offenseType}</p></div>}
              {caseData.fine && <div><label className="text-xs text-stone-500">الغرامة</label><p className="font-bold font-mono text-sm">{Number(caseData.fine).toLocaleString()} درهم</p></div>}
              {caseData.reconciliation && (
                <div className="bg-emerald-50 text-emerald-800 p-3 rounded-xl border border-emerald-100 text-xs font-bold flex gap-2">
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> تم إجراء الصلح وتسديد المبالغ.
                </div>
              )}
            </div>
          )}

          {(caseData.executionStatus || caseData.executionAmountRecovered) && (
            <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100 shadow-sm space-y-3">
              <h3 className="font-bold border-b border-emerald-200 pb-3 flex items-center gap-2 text-sm text-emerald-800">
                <CheckCircle2 className="size-4 text-emerald-600" /> جناح التنفيذ
              </h3>
              {caseData.executionStatus && <div><label className="text-xs text-emerald-600">حالة التنفيذ</label><p className="font-black text-sm text-emerald-900">{caseData.executionStatus}</p></div>}
              {caseData.notificationMethod && <div><label className="text-xs text-emerald-600">التبليغ</label><p className="font-bold text-sm">{caseData.notificationMethod} {caseData.notificationDate && <span className="font-mono text-xs text-stone-500">({caseData.notificationDate})</span>}</p></div>}
              {caseData.executionAmountRecovered && <div><label className="text-xs text-emerald-600">المبالغ المستخلصة</label><p className="font-black text-emerald-700 font-mono text-xl">{Number(caseData.executionAmountRecovered).toLocaleString()} <span className="text-xs">د.م</span></p></div>}
              {caseData.executionObstacle && <div className="pt-2 border-t border-emerald-200"><label className="text-xs text-orange-600 flex items-center gap-1 mb-1"><AlertCircle className="size-3" /> عائق</label><p className="text-sm font-bold text-orange-800 bg-orange-50 p-3 rounded-xl border border-orange-100">{caseData.executionObstacle}</p></div>}
            </div>
          )}

          {(caseData.parcelRef || caseData.estimatedValue || (caseData.geoLat && caseData.geoLng) || caseData.geoPolygon) && (
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-3">
              <h3 className="font-bold border-b border-stone-100 pb-3 flex items-center gap-2 text-sm">
                <MapPin className="size-4 text-stone-400" /> الموقع الجغرافي والقطعة الغابوية
              </h3>
              {caseData.parcelRef && <div><label className="text-xs text-stone-500">مرجع القطعة / الملك الغابوي</label><p className="font-bold font-mono text-sm">{caseData.parcelRef}</p></div>}
              {caseData.parcelArea && <div><label className="text-xs text-stone-500">المساحة المتضررة</label><p className="font-bold text-sm">{caseData.parcelArea} هكتار</p></div>}
              {caseData.estimatedValue && <div><label className="text-xs text-stone-500">القيمة التقديرية للضرر</label><p className="font-black font-mono text-emerald-700 text-lg">{Number(caseData.estimatedValue).toLocaleString()} <span className="text-xs">د.م</span></p></div>}
              {caseData.geoLat && caseData.geoLng && (
                <a href={`https://www.google.com/maps?q=${caseData.geoLat},${caseData.geoLng}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 text-sm font-bold text-blue-700 hover:underline">
                  <ExternalLink className="size-3.5" /> عرض الموقع على الخريطة ({caseData.geoLat}, {caseData.geoLng})
                </a>
              )}
              {caseData.geoPolygon && <p className="text-[10px] text-stone-400">✓ حدود القطعة (مضلَّع جغرافي) مسجَّلة في الملف</p>}
            </div>
          )}

          {caseData.documents && caseData.documents.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-2">
              <h3 className="font-bold border-b border-stone-100 pb-3 flex items-center gap-2 text-sm">
                <FolderOpen className="size-4 text-stone-400" /> الوثائق المرفقة ({caseData.documents.length})
              </h3>
              {caseData.documents.map((d, i) => (
                <a key={i} href={d.url} target="_blank" rel="noreferrer"
                  className="flex items-center justify-between gap-2 bg-stone-50 hover:bg-stone-100 px-3 py-2 rounded-xl border border-stone-100 text-sm transition-colors">
                  <span className="font-bold text-stone-700 truncate flex items-center gap-2"><FileText className="size-3.5 text-stone-400 shrink-0" /> {d.name}</span>
                  {d.type && <span className="text-[10px] font-bold text-stone-400 shrink-0">{d.type}</span>}
                </a>
              ))}
            </div>
          )}

          {related.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-purple-100 shadow-sm space-y-2">
              <h3 className="font-bold border-b border-purple-100 pb-3 flex items-center gap-2 text-sm text-purple-800">
                <Users className="size-4 text-purple-500" /> تتبع العود — ملفات أخرى لنفس الخصم ({related.length})
              </h3>
              {related.map(rc => (
                <button key={rc.id} onClick={() => onSelectCase(rc)}
                  className="w-full text-right bg-purple-50 hover:bg-purple-100 px-3 py-2 rounded-xl border border-purple-100 transition-colors">
                  <p className="font-mono font-bold text-purple-800 text-xs">{rc.mahakimId || rc.id}</p>
                  <p className="text-[11px] text-stone-600 truncate mt-0.5">{rc.subject || rc.type} — {rc.date}</p>
                  <p className="text-[10px] text-stone-500 mt-0.5">{rc.status}</p>
                </button>
              ))}
            </div>
          )}

          {caseData.auditLog && caseData.auditLog.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-2">
              <h3 className="font-bold border-b border-stone-100 pb-3 flex items-center gap-2 text-sm">
                <ListChecks className="size-4 text-stone-400" /> سجل التتبع
              </h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {[...caseData.auditLog].reverse().map((entry, i) => (
                  <div key={i} className="flex items-start justify-between gap-2 text-[11px] border-b border-stone-50 pb-1.5 last:border-0">
                    <div>
                      <p className="font-bold text-stone-700">{entry.action}</p>
                      <p className="text-stone-400">{entry.user}</p>
                    </div>
                    <p className="font-mono text-stone-400 whitespace-nowrap shrink-0">
                      {new Date(entry.date).toLocaleString('fr-MA', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Contentieux Main ─────────────────────────────────────────────────────────

export function Contentieux() {
  const [activeTab, setActiveTab] = useState<'local' | 'mahakim'>('local');
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardData, setWizardData] = useState<Case | null>(null);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [cases, setCases] = useState<Case[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUserState] = useState(() => getCurrentUser());

  const handleSetCurrentUser = () => {
    const name = window.prompt('أدخل اسمك (لاستخدامه في "ملفاتي" وسجل التتبع):', currentUser);
    if (name === null) return;
    setCurrentUser(name);
    setCurrentUserState(name.trim());
  };

  useEffect(() => {
    loadCases().then(({ data }) => { setCases(data.length > 0 ? data : recentCases); setIsLoading(false); });
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.type === 'case' && detail.id) {
        const found = cases.find(c => c.id === detail.id);
        if (found) { setActiveTab('local'); setSelectedCase(found); }
      }
    };
    window.addEventListener('searchItemSelected', handler);
    return () => window.removeEventListener('searchItemSelected', handler);
  }, [cases]);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [courtFilter, setCourtFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [executionStatusFilter, setExecutionStatusFilter] = useState('all');
  const [judgeFilter, setJudgeFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [assignedFilter, setAssignedFilter] = useState('all');
  const [reviewFilter, setReviewFilter] = useState<'all' | 'review'>('all');
  const [deadlineFilter, setDeadlineFilter] = useState<'all' | 'soon'>('all');
  const [repeatFilter, setRepeatFilter] = useState<'all' | 'repeat'>('all');
  const [sessionWeekFilter, setSessionWeekFilter] = useState<'all' | 'week'>('all');
  const [densityLevel, setDensityLevel] = useState<'compact' | 'normal' | 'large'>('normal');
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [tableExpanded, setTableExpanded] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');
  const [reportLabel, setReportLabel] = useState('');

  const uniqueTypes = useMemo(() => Array.from(new Set(cases.map(c => c.type).filter(Boolean))), [cases]);
  const uniqueCourts = useMemo(() => Array.from(new Set(cases.map(c => c.court).filter(Boolean))), [cases]);
  const uniqueYears = useMemo(() => Array.from(new Set(cases.map(c => c.date?.substring(0, 4)).filter(Boolean))).sort((a, b) => Number(b) - Number(a)), [cases]);
  const uniqueExecStatuses = useMemo(() => Array.from(new Set(cases.map(c => c.executionStatus).filter(Boolean))) as string[], [cases]);
  const uniqueJudges = useMemo(() => Array.from(new Set(cases.map(c => c.judge).filter(Boolean))) as string[], [cases]);
  const uniqueSections = useMemo(() => Array.from(new Set(cases.map(c => c.section).filter(Boolean))) as string[], [cases]);
  const uniqueAssignees = useMemo(() => Array.from(new Set(cases.map(c => c.assignedTo).filter(Boolean))) as string[], [cases]);

  // فهرس "العود" للوصول السريع لعدد المتكررين دون إعادة حساب لكل ملف
  const repeatOffenderIndex = useMemo(() => buildRepeatOffenderIndex(cases), [cases]);

  const processedCases = useMemo(() => {
    let r = [...cases];
    if (statusFilter === 'active') r = r.filter(c => !c.status.includes('حكم') && !c.status.includes('قرار'));
    if (statusFilter === 'judged') r = r.filter(c => c.status.includes('حكم') || c.status.includes('قرار'));
    if (typeFilter !== 'all') r = r.filter(c => c.type === typeFilter);
    if (courtFilter !== 'all') r = r.filter(c => c.court === courtFilter);
    if (yearFilter !== 'all') r = r.filter(c => c.date?.startsWith(yearFilter));
    if (executionStatusFilter === '__executed__') r = r.filter(c => c.executionStatus?.includes('منفذ'));
    else if (executionStatusFilter === '__not_started__') r = r.filter(c => !c.executionStatus);
    else if (executionStatusFilter !== 'all') r = r.filter(c => c.executionStatus === executionStatusFilter);
    if (judgeFilter !== 'all') r = r.filter(c => c.judge === judgeFilter);
    if (sectionFilter !== 'all') r = r.filter(c => c.section === sectionFilter);
    if (assignedFilter !== 'all') r = r.filter(c => c.assignedTo === assignedFilter);
    if (reviewFilter === 'review') r = r.filter(c => needsManualReview(c));
    if (deadlineFilter === 'soon') r = r.filter(c => { const nd = nearestDeadline(c); return !!nd && nd.daysLeft <= 10; });
    if (repeatFilter === 'repeat') r = r.filter(c => relatedCasesBySameDefendant(c, cases).length > 0);
    if (sessionWeekFilter === 'week') r = r.filter(c => {
      const t = parseFlexDate(c.nextSession);
      if (isNaN(t)) return false;
      const now = Date.now();
      return t >= now - 86400000 && t <= now + 7 * 86400000;
    });
    if (searchQuery.trim()) r = r.filter(c => fuzzyMatchCase(c, searchQuery));
    if (sortConfig) {
      if (sortConfig.key === '__deadline') {
        // الأجل الأقرب أولاً؛ الملفات بلا آجال تُدفع إلى الأسفل دائماً
        const score = (c: Case) => { const nd = nearestDeadline(c); return nd ? nd.daysLeft : Infinity; };
        r.sort((a, b) => sortConfig.dir === 'asc' ? score(a) - score(b) : score(b) - score(a));
      } else {
        r.sort((a, b) => {
          const av: any = sortConfig.key === 'ref' ? (a.mahakimId || a.id) : (a as any)[sortConfig.key] ?? '';
          const bv: any = sortConfig.key === 'ref' ? (b.mahakimId || b.id) : (b as any)[sortConfig.key] ?? '';
          return av < bv ? (sortConfig.dir === 'asc' ? -1 : 1) : av > bv ? (sortConfig.dir === 'asc' ? 1 : -1) : 0;
        });
      }
    }
    return r;
  }, [cases, searchQuery, sortConfig, statusFilter, typeFilter, courtFilter, yearFilter,
      executionStatusFilter, judgeFilter, sectionFilter, assignedFilter, reviewFilter, deadlineFilter,
      repeatFilter, sessionWeekFilter]);

  /** يمسح كل الفلاتر دفعة واحدة (تُستخدم عند النقر على بطاقات الإحصائيات) */
  const resetFilters = () => {
    setStatusFilter('all'); setTypeFilter('all'); setCourtFilter('all'); setYearFilter('all');
    setExecutionStatusFilter('all'); setJudgeFilter('all'); setSectionFilter('all');
    setAssignedFilter('all'); setReviewFilter('all'); setDeadlineFilter('all');
    setRepeatFilter('all'); setSessionWeekFilter('all'); setSearchQuery('');
  };

  const tableRef = useRef<HTMLDivElement>(null);
  const bulkMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showBulkMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(e.target as Node)) setShowBulkMenu(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showBulkMenu]);
  const scrollToTable = () => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // أحجام الجدول حسب مستوى التكبير المختار
  const densityCls = densityLevel === 'compact'
    ? { cell: 'px-2 py-1.5', text: 'text-[11px]', wrap: 'text-xs' }
    : densityLevel === 'large'
    ? { cell: 'px-4 py-5', text: 'text-base', wrap: 'text-base' }
    : { cell: 'px-3 py-3.5', text: 'text-sm', wrap: 'text-sm' };

  // ── بطاقات النظرة السريعة (الإحصائيات) ──────────────────────────────
  const criticalDeadlinesCount = useMemo(() => getCriticalDeadlinesCount(cases, 7), [cases]);
  const needsReviewCount = useMemo(() => cases.filter(c => needsManualReview(c)).length, [cases]);
  const repeatOffendersCount = useMemo(
    () => Array.from(repeatOffenderIndex.values()).filter(arr => arr.length > 1).length,
    [repeatOffenderIndex]
  );
  const sessionsThisWeekCount = useMemo(() => {
    const now = Date.now();
    return cases.filter(c => {
      const t = parseFlexDate(c.nextSession);
      return !isNaN(t) && t >= now - 86400000 && t <= now + 7 * 86400000;
    }).length;
  }, [cases]);


  const handleSort = (k: string) => setSortConfig(p => ({ key: k, dir: p?.key === k && p.dir === 'asc' ? 'desc' : 'asc' }));

  const handleSaveCase = async (saved: Case) => {
    // ── منع التكرار: هل يوجد ملف بنفس الرقم الوطني / رقم محاكم؟ ──
    const key = caseMatchKey(saved);
    const existing = key
      ? cases.find(c => c.id !== saved.id && caseMatchKey(c) === key)
      : undefined;

    if (existing) {
      const { merged: mergedRaw, newProcs, newParties } = mergeCaseUpdate(existing, saved);
      const merged = appendAuditEntry(mergedRaw, 'تحديث تلقائي من بوابة محاكم (دمج بيانات)');
      await saveCase(merged);
      setCases(prev => prev.map(c => (c.id === merged.id ? merged : c)));
      if (selectedCase?.id === merged.id) setSelectedCase(merged);
      setIsWizardOpen(false); setWizardData(null);
      const news = [
        newProcs > 0 ? `${newProcs} إجراء جديد` : '',
        newParties > 0 ? `${newParties} طرف جديد` : '',
      ].filter(Boolean).join(' و ');
      alert(
        `✅ الملف ${merged.mahakimId || merged.id} موجود مسبقاً — تم تحديثه بدل إنشاء نسخة مكررة.\n` +
        (news ? `🆕 اكتُشف: ${news}.` : 'ℹ️ لا جديد منذ آخر مزامنة.')
      );
      return;
    }

    // ملف جديد أو تعديل يدوي على ملف موجود
    const isEdit = cases.some(c => c.id === saved.id);
    const withAudit = appendAuditEntry(saved, isEdit ? 'تعديل بيانات الملف' : 'إنشاء الملف');
    await saveCase(withAudit);
    setCases(prev => { const e = prev.find(c => c.id === withAudit.id); return e ? prev.map(c => c.id === withAudit.id ? withAudit : c) : [withAudit, ...prev]; });
    if (selectedCase?.id === withAudit.id) setSelectedCase(withAudit);
    setIsWizardOpen(false); setWizardData(null);
  };

  const handleDeleteCase = async (id: string) => {
    await deleteCase(id);
    setCases(prev => prev.filter(c => c.id !== id));
    setSelectedCase(null);
    setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
  };

  const handleDeleteSelected = async () => {
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedIds.size} ملف(ات)؟`)) return;
    await deleteCases(Array.from(selectedIds));
    setCases(prev => prev.filter(c => !selectedIds.has(c.id)));
    setSelectedIds(new Set());
  };

  /** يترجم نقرات بطاقات/مبيانات الإحصائيات إلى فلاتر على القائمة الرئيسية */
  const handleStatsNavigate = (action: StatsNavigateAction) => {
    resetFilters();
    switch (action.type) {
      case 'search': setSearchQuery(action.query); break;
      case 'execStatus': setExecutionStatusFilter(action.value); break;
      case 'deadlineSoon': setDeadlineFilter('soon'); break;
      case 'needsReview': setReviewFilter('review'); break;
      case 'repeatOffenders': setRepeatFilter('repeat'); break;
    }
    setIsStatsOpen(false);
    setTimeout(scrollToTable, 150);
  };

  const SortTh = ({ l, k }: { l: string; k: string }) => (
    <th className={`${densityCls.cell} font-bold cursor-pointer hover:bg-stone-100 transition-colors select-none whitespace-nowrap`} onClick={() => handleSort(k)}>
      <span className="flex items-center gap-1">{l} {sortConfig?.key === k && <span className="text-emerald-600">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>}</span>
    </th>
  );

  const badge = (s: string) => {
    const cls = s.includes('مبرمج') || s.includes('جلسة') ? 'bg-orange-100 text-orange-700' :
      s.includes('محجوز') || s.includes('تأمل') ? 'bg-blue-100 text-blue-700' :
      s.includes('حكم') || s.includes('قرار') || s.includes('صدر') ? 'bg-emerald-100 text-emerald-700' :
      'bg-stone-100 text-stone-600';
    return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${cls}`}><span className="size-1.5 rounded-full bg-current" />{s}</span>;
  };

  return (
    <div className="p-4 md:p-8 space-y-4 flex flex-col h-full" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-bold border-b-4 border-emerald-600 pb-2 inline-block">النزاعات والقضايا</h2>
          <p className="text-sm text-stone-500 mt-1.5">متابعة الملفات القضائية والتكامل مع نظام محاكم</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200">
            {[{ id: 'local', icon: Scale, label: 'القضايا المحلية' }, { id: 'mahakim', icon: Landmark, label: 'بوابة محاكم' }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === tab.id ? (tab.id === 'mahakim' ? 'bg-emerald-700 text-white shadow-sm' : 'bg-white text-stone-800 shadow-sm') : 'text-stone-500 hover:text-stone-700'}`}>
                <tab.icon className="size-4 shrink-0" /><span className="whitespace-nowrap">{tab.label}</span>
              </button>
            ))}
          </div>
          <button onClick={handleSetCurrentUser} title="تحديد اسمك لتفعيل «ملفاتي» وسجل التتبع"
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 rounded-xl text-sm font-bold shadow-sm transition-all">
            <UserCog className="size-4 text-stone-400" />
            {currentUser ? currentUser : 'تحديد اسمي'}
          </button>
          <button onClick={() => setIsStatsOpen(true)} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm hover:-translate-y-0.5 transition-all">
            <PieChartIcon className="size-4" /> الإحصائيات
          </button>
          <button onClick={() => { setWizardData(null); setIsWizardOpen(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-sm hover:-translate-y-0.5 transition-all">
            <FilePlus2 className="size-4" /> إضافة ملف
          </button>
        </div>
      </div>

      {isStatsOpen && <ContentieuxStats cases={cases} onClose={() => setIsStatsOpen(false)} onNavigate={handleStatsNavigate} />}

      {/* ── تبويب "القضايا المحلية" ── يبقى في DOM دائماً (hidden فقط) كي لا
          يتأثر بالتبديل، تناسقاً مع تبويب "بوابة محاكم" أدناه ── */}
      <div className={activeTab === 'local' ? '' : 'hidden'}>
        {selectedCase ? (
          <CaseDetail caseData={selectedCase} onBack={() => setSelectedCase(null)} onDelete={handleDeleteCase}
            onEdit={() => { setWizardData(selectedCase); setIsWizardOpen(true); }}
            allCases={cases} onSelectCase={setSelectedCase} />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'إجمالي القضايا', value: cases.length, icon: Scale, c: 'emerald', onClick: () => { resetFilters(); scrollToTable(); } },
                { label: 'قيد الرائجة', value: cases.filter(c => !c.status.includes('حكم') && !c.status.includes('قرار')).length, icon: Search, c: 'blue', onClick: () => { resetFilters(); setStatusFilter('active'); scrollToTable(); } },
                { label: 'أحكام صادرة', value: cases.filter(c => c.status.includes('حكم') || c.status.includes('قرار')).length, icon: Gavel, c: 'orange', onClick: () => { resetFilters(); setStatusFilter('judged'); scrollToTable(); } },
                { label: 'أحكام منفذة', value: cases.filter(c => c.executionStatus?.includes('منفذ')).length, icon: CheckCircle2, c: 'emerald', onClick: () => { resetFilters(); setExecutionStatusFilter('__executed__'); scrollToTable(); } },
                { label: 'آجال حرجة (≤7 أيام)', value: criticalDeadlinesCount, icon: CalendarClock, c: 'red', onClick: () => { resetFilters(); setDeadlineFilter('soon'); scrollToTable(); } },
                { label: 'يحتاج تدقيق', value: needsReviewCount, icon: ShieldAlert, c: 'amber', onClick: () => { resetFilters(); setReviewFilter('review'); scrollToTable(); } },
                { label: 'ملفات عود (خصوم متكررون)', value: repeatOffendersCount, icon: Users, c: 'purple', onClick: () => { resetFilters(); setRepeatFilter('repeat'); scrollToTable(); } },
                { label: 'جلسات هذا الأسبوع', value: sessionsThisWeekCount, icon: CalendarDays, c: 'blue', onClick: () => { resetFilters(); setSessionWeekFilter('week'); scrollToTable(); } },
              ].map((s, i) => (
                <button key={i} onClick={s.onClick}
                  className="w-full bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center justify-between text-right hover:shadow-md hover:-translate-y-0.5 hover:border-emerald-200 transition-all">
                  <div><p className="text-xs font-bold text-stone-500 mb-1">{s.label}</p><h3 className={`text-2xl font-black text-${s.c}-700`}>{s.value}</h3></div>
                  <div className={`p-3 bg-${s.c}-50 text-${s.c}-600 rounded-xl`}><s.icon className="size-6" /></div>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'المبالغ المستخلصة (د.م)', val: cases.reduce((s, c) => s + (parseFloat(c.executionAmountRecovered || '0') || 0), 0).toLocaleString(), cls: 'emerald' },
                { label: 'مجموع الغرامات المحكوم بها', val: cases.reduce((s, c) => s + (parseFloat(c.fine || '0') || 0) + (parseFloat(c.compensation || '0') || 0), 0).toLocaleString(), cls: 'orange' },
                { label: 'نسبة التنفيذ', val: (() => { const j = cases.filter(c => c.status.includes('حكم') || c.status.includes('قرار')).length; const e = cases.filter(c => c.executionStatus?.includes('منفذ')).length; return j > 0 ? ((e / j) * 100).toFixed(1) + '%' : '0%'; })(), cls: 'blue' },
              ].map((s, i) => (
                <div key={i} className={`bg-${s.cls}-50 border border-${s.cls}-100 p-5 rounded-2xl`}>
                  <p className={`text-xs font-bold text-${s.cls}-600 mb-1`}>{s.label}</p>
                  <h3 className={`text-2xl font-black text-${s.cls}-700 font-mono`}>{s.val}</h3>
                </div>
              ))}
            </div>

            <div className={tableExpanded
              ? 'fixed inset-0 z-50 bg-white overflow-y-auto'
              : 'bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden'} ref={tableRef}>
              <div className="p-4 border-b border-stone-200 bg-stone-50 space-y-3">
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="relative flex-1">
                    <input type="text" placeholder="بحث ذكي: رقم ملف، موضوع، محكمة، خصم، إجراء... (يتحمل أخطاء الكتابة)"
                      className="w-full bg-white border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                      value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                    <Search className="size-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"><X className="size-4" /></button>}
                  </div>
                  {/* أدوات العرض: الكثافة + التوسيع لملء الصفحة */}
                  <div className="flex gap-2 shrink-0">
                    <div className="flex items-center bg-white border border-stone-200 rounded-xl overflow-hidden text-stone-500">
                      <button onClick={() => setDensityLevel('compact')} title="عرض مضغوط (تفاصيل أكثر في الشاشة)"
                        className={`px-2.5 py-2.5 transition-colors ${densityLevel === 'compact' ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-stone-50'}`}>
                        <Minimize2 className="size-4" />
                      </button>
                      <button onClick={() => setDensityLevel('normal')} title="عرض عادي"
                        className={`px-2.5 py-2.5 text-[10px] font-bold border-x border-stone-200 transition-colors ${densityLevel === 'normal' ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-stone-50'}`}>
                        100%
                      </button>
                      <button onClick={() => setDensityLevel('large')} title="عرض موسّع (نص أكبر لتفاصيل أوضح)"
                        className={`px-2.5 py-2.5 transition-colors ${densityLevel === 'large' ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-stone-50'}`}>
                        <Maximize2 className="size-4" />
                      </button>
                    </div>
                    <button onClick={() => setTableExpanded(v => !v)} title={tableExpanded ? 'تصغير' : 'توسيع الجدول لملء الصفحة'}
                      className="flex items-center gap-2 px-3 py-2.5 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm font-bold hover:bg-stone-50 transition-colors">
                      {tableExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                      <span className="hidden sm:inline">{tableExpanded ? 'تصغير' : 'توسيع'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                  <div className="flex gap-2 flex-wrap items-center">
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                      className="bg-white border border-stone-200 text-stone-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20">
                      <option value="all">جميع الوضعيات</option>
                      <option value="active">قيد الرائجة</option>
                      <option value="judged">محكومة</option>
                    </select>
                    {selectedIds.size > 0 && (
                      <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 animate-in fade-in">
                        <span className="text-sm font-bold text-emerald-800">{selectedIds.size} محدد</span>
                        <button onClick={() => exportAllCasesXLSX(cases.filter(c => selectedIds.has(c.id)))} title="Excel" className="p-1 hover:bg-emerald-200 rounded text-emerald-700"><FileSpreadsheet className="size-4" /></button>
                        <button onClick={handleDeleteSelected} title="حذف" className="p-1 hover:bg-red-200 rounded text-red-600"><Trash2 className="size-4" /></button>
                      </div>
                    )}
                  </div>

                  {/* أدوات التصدير: تجميعها معاً بأسلوب موحَّد */}
                  <div className="flex gap-2 flex-wrap items-center">
                    <div className="relative" ref={bulkMenuRef}>
                      <button onClick={() => setShowBulkMenu(v => !v)}
                        className="flex items-center gap-2 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-sm">
                        <DownloadCloud className="size-4" /> تحميل الكل
                        <ChevronDown className={`size-3.5 transition-transform ${showBulkMenu ? 'rotate-180' : ''}`} />
                      </button>
                      {showBulkMenu && (
                        <div className="absolute left-0 top-full mt-1 z-30 w-64 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden text-sm">
                          <button onClick={() => { exportAllCasesXLSX(processedCases); setShowBulkMenu(false); }}
                            className="w-full text-right px-4 py-2.5 hover:bg-stone-50 flex items-center gap-2 border-b border-stone-100">
                            <FileSpreadsheet className="size-4 text-emerald-600" /> Excel — جدول مُلخَّص واحد
                          </button>
                          <button onClick={() => { exportAllCasesWorkbookXLSX(processedCases); setShowBulkMenu(false); }}
                            className="w-full text-right px-4 py-2.5 hover:bg-stone-50 flex items-center gap-2 border-b border-stone-100">
                            <Database className="size-4 text-emerald-600" /> Excel — بطاقة لكل ملف (ورقة مستقلة)
                          </button>
                          <button onClick={() => { exportAllCasesPDF(processedCases); setShowBulkMenu(false); }}
                            className="w-full text-right px-4 py-2.5 hover:bg-stone-50 flex items-center gap-2 border-b border-stone-100">
                            <FileDown className="size-4 text-rose-600" /> PDF — بطاقة تقنية لكل ملف
                          </button>
                          <button onClick={() => { downloadTextFile(buildICS(processedCases), `جلسات_وآجال_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.ics`, 'text/calendar'); setShowBulkMenu(false); }}
                            className="w-full text-right px-4 py-2.5 hover:bg-stone-50 flex items-center gap-2">
                            <CalendarClock className="size-4 text-purple-600" /> تقويم iCal — الجلسات والآجال
                          </button>
                        </div>
                      )}
                    </div>
                    <button onClick={() => setShowReportModal(true)}
                      className="flex items-center gap-2 px-3 py-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-sm font-bold border border-blue-200">
                      <ListChecks className="size-4" /> تقرير دوري
                    </button>
                    <button onClick={() => window.print()} title="طباعة"
                      className="flex items-center gap-2 px-3 py-2.5 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm font-bold hover:bg-stone-50">
                      <Printer className="size-4" /> <span className="hidden sm:inline">طباعة</span>
                    </button>
                  </div>
                </div>

                {/* ── شريط الفلاتر: ظاهر دائماً ── */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 pt-3 border-t border-stone-200">
                  {[
                    { label: 'نوع الملف', val: typeFilter, set: setTypeFilter, opts: uniqueTypes },
                    { label: 'المحكمة', val: courtFilter, set: setCourtFilter, opts: uniqueCourts },
                    { label: 'سنة التسجيل', val: yearFilter, set: setYearFilter, opts: uniqueYears },
                    { label: 'الشعبة', val: sectionFilter, set: setSectionFilter, opts: uniqueSections },
                    { label: 'القاضي المقرر', val: judgeFilter, set: setJudgeFilter, opts: uniqueJudges },
                    { label: 'المكلَّف بالملف', val: assignedFilter, set: setAssignedFilter, opts: uniqueAssignees },
                  ].map((f, i) => (
                    <div key={i}>
                      <label className="block text-xs font-bold text-stone-500 mb-1">{f.label}</label>
                      <select value={f.val} onChange={e => f.set(e.target.value)}
                        className="w-full bg-white border border-stone-200 text-stone-700 rounded-xl px-3 py-2 text-sm outline-none">
                        <option value="all">الكل</option>
                        {f.opts.map(o => <option key={String(o)} value={String(o)}>{String(o)}</option>)}
                      </select>
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-bold text-stone-500 mb-1">حالة التنفيذ</label>
                    <select value={executionStatusFilter} onChange={e => setExecutionStatusFilter(e.target.value)}
                      className="w-full bg-white border border-stone-200 text-stone-700 rounded-xl px-3 py-2 text-sm outline-none">
                      <option value="all">الكل</option>
                      <option value="__executed__">منفذة (كلياً/جزئياً)</option>
                      {uniqueExecStatuses.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2 sm:col-span-3 md:col-span-4 lg:col-span-7 flex flex-wrap items-center gap-2 pt-1">
                    <button onClick={() => setReviewFilter(p => p === 'review' ? 'all' : 'review')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${reviewFilter === 'review' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'}`}>
                      <ShieldAlert className="size-3.5" /> يحتاج تدقيق فقط
                    </button>
                    <button onClick={() => setDeadlineFilter(p => p === 'soon' ? 'all' : 'soon')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${deadlineFilter === 'soon' ? 'bg-red-100 text-red-700 border-red-300' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'}`}>
                      <CalendarClock className="size-3.5" /> آجال قريبة (≤10 أيام)
                    </button>
                    <button onClick={() => setRepeatFilter(p => p === 'repeat' ? 'all' : 'repeat')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${repeatFilter === 'repeat' ? 'bg-purple-100 text-purple-700 border-purple-300' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'}`}>
                      <Users className="size-3.5" /> ملفات عود فقط
                    </button>
                    <button onClick={() => setSessionWeekFilter(p => p === 'week' ? 'all' : 'week')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${sessionWeekFilter === 'week' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'}`}>
                      <CalendarDays className="size-3.5" /> جلسات هذا الأسبوع
                    </button>
                    {currentUser && (
                      <button onClick={() => setAssignedFilter(p => p === currentUser ? 'all' : currentUser)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${assignedFilter === currentUser ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'}`}>
                        <UserCog className="size-3.5" /> ملفاتي
                      </button>
                    )}
                    <button onClick={resetFilters}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border border-stone-200 bg-white text-stone-500 hover:bg-stone-50 hover:text-red-600 transition-colors mr-auto">
                      <X className="size-3.5" /> إعادة ضبط كل الفلاتر
                    </button>
                  </div>
                </div>
              </div>

              {isLoading ? (
                <div className="py-16 text-center text-stone-400"><RefreshCw className="size-8 mx-auto mb-3 animate-spin text-stone-300" /><p className="text-sm">جاري التحميل...</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-right">
                    <thead className="bg-stone-50 text-stone-500 border-b border-stone-200">
                      <tr>
                        <th className={`${densityCls.cell} font-bold w-10 text-center`}>#</th>
                        <th className={`${densityCls.cell} w-10`}>
                          <input type="checkbox" className="rounded border-stone-300 text-emerald-600 w-4 h-4"
                            checked={processedCases.length > 0 && selectedIds.size === processedCases.length}
                            onChange={e => setSelectedIds(e.target.checked ? new Set(processedCases.map(c => c.id)) : new Set())} />
                        </th>
                        <SortTh l="رقم الملف في المحكمة" k="mahakimId" />
                        <SortTh l="المحكمة / الشعبة" k="court" />
                        <SortTh l="التاريخ" k="date" />
                        <SortTh l="الموضوع والنوع" k="subject" />
                        <SortTh l="الخصم / المدعى عليه" k="defendant" />
                        <SortTh l="الوضعية" k="status" />
                        <SortTh l="آخر إجراء / حكم" k="nextSession" />
                        <SortTh l="الأجل الأقرب" k="__deadline" />
                        <th className={`${densityCls.cell} font-bold`}>أدوات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {processedCases.map((c, idx) => {
                        const matchLocs = searchQuery.trim() ? findMatchLocations(c, searchQuery) : [];
                        const nd = nearestDeadline(c);
                        const review = needsManualReview(c);
                        return (
                        <tr key={c.id} onClick={() => setSelectedCase(c)}
                          className={`hover:bg-emerald-50/50 transition-colors cursor-pointer group ${selectedIds.has(c.id) ? 'bg-emerald-50/30' : ''}`}>
                          <td className={`${densityCls.cell} text-center font-mono text-stone-400 ${densityCls.text}`}>{idx + 1}</td>
                          <td className={densityCls.cell} onClick={e => e.stopPropagation()}>
                            <input type="checkbox" className="rounded border-stone-300 text-emerald-600 w-4 h-4 cursor-pointer"
                              checked={selectedIds.has(c.id)}
                              onChange={() => setSelectedIds(prev => { const s = new Set(prev); s.has(c.id) ? s.delete(c.id) : s.add(c.id); return s; })} />
                          </td>
                          {/* رقم الملف في المحكمة + آخر مزامنة */}
                          <td className={densityCls.cell}>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {c.mahakimId
                                ? <span className={`font-mono font-black text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg ${densityCls.text}`}>{highlightMatch(c.mahakimId, searchQuery)}</span>
                                : <span className="font-mono text-stone-400 text-xs italic">غير مسجل</span>}
                              {review && <ShieldAlert className="size-3.5 text-amber-500 shrink-0" title="يحتاج تدقيق" />}
                            </div>
                            {(() => {
                              const sa = syncAge(c.lastSyncedAt);
                              if (!sa) return null;
                              return (
                                <p className={`text-[9px] font-bold mt-1 flex items-center gap-1 ${sa.cls}`}>
                                  <RefreshCw className="size-2.5" /> مزامنة: {sa.label}{c.syncCount ? ` (×${c.syncCount})` : ''}
                                </p>
                              );
                            })()}
                          </td>
                          {/* المحكمة + الشعبة */}
                          <td className={`${densityCls.cell} max-w-[180px]`}>
                            <p className={`font-bold text-stone-800 leading-snug truncate ${densityCls.text}`}>{highlightMatch(c.court, searchQuery)}</p>
                            {c.section && <p className="text-[10px] text-emerald-600 font-bold mt-0.5">{c.section}</p>}
                          </td>
                          {/* تاريخ التسجيل */}
                          <td className={`${densityCls.cell} font-mono text-stone-500 whitespace-nowrap ${densityCls.text}`}>{c.date}</td>
                          {/* الموضوع + النوع */}
                          <td className={`${densityCls.cell} max-w-[200px]`}>
                            <p className={`font-bold text-stone-800 leading-snug truncate ${densityCls.wrap}`}>
                              {c.subject && c.subject !== 'غير محدد' ? highlightMatch(c.subject, searchQuery) : '—'}
                            </p>
                            <p className="text-[10px] text-stone-400 mt-0.5 font-medium">{c.type || ''}</p>
                            {matchLocs.length > 0 && (
                              <p className="mt-1 flex flex-wrap gap-1">
                                {matchLocs.map(loc => (
                                  <span key={loc} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">وُجد في: {loc}</span>
                                ))}
                              </p>
                            )}
                          </td>
                          {/* الخصم / المدعى عليه */}
                          <td className={`${densityCls.cell} max-w-[160px]`}>
                            <p className={`font-bold text-stone-700 truncate ${densityCls.text}`}>
                              {highlightMatch(c.defendant || c.parties?.find(p => p.role.includes('عليه') || p.role.includes('متهم') || p.role.includes('مطلوب'))?.name || '—', searchQuery)}
                            </p>
                          </td>
                          {/* الوضعية */}
                          <td className={densityCls.cell}>{badge(c.status)}</td>
                          {/* آخر إجراء / حكم */}
                          <td className={`${densityCls.cell} max-w-[180px]`}>
                            {(() => {
                              const lastProc = [...(c.procedures || [])].sort((a, b) => {
                                const p = (d: string) => { if (d.match(/\d{2}\/\d{2}\/\d{4}/)) { const [dd, mm, yy] = d.split('/'); return new Date(`${yy}-${mm}-${dd}`).getTime(); } return new Date(d).getTime() || 0; };
                                return p(b.date) - p(a.date);
                              })[0];
                              if (!lastProc && !c.nextSession) return <span className="text-stone-300 text-xs">—</span>;
                              return (
                                <div>
                                  <p className={`font-mono font-bold text-emerald-700 whitespace-nowrap ${densityCls.text}`}>
                                    {lastProc?.date || c.nextSession || ''}
                                  </p>
                                  {lastProc?.action && (
                                    <p className="text-[10px] text-stone-600 font-medium mt-0.5 truncate max-w-[170px]">{lastProc.action}</p>
                                  )}
                                  {lastProc?.decision && lastProc.decision !== '-' && (
                                    <p className="text-[10px] text-emerald-600 italic mt-0.5 truncate max-w-[170px]">{lastProc.decision}</p>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          {/* الأجل الأقرب */}
                          <td className={densityCls.cell}>
                            {nd ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold whitespace-nowrap ${
                                nd.severity === 'expired' ? 'bg-red-100 text-red-700'
                                : nd.severity === 'critical' ? 'bg-orange-100 text-orange-700'
                                : nd.severity === 'warning' ? 'bg-amber-100 text-amber-700'
                                : 'bg-emerald-100 text-emerald-700'
                              }`}>
                                <CalendarClock className="size-3" />
                                {nd.daysLeft >= 0 ? `${nd.daysLeft}ي` : `تجاوز ${Math.abs(nd.daysLeft)}ي`}
                              </span>
                            ) : <span className="text-stone-300 text-xs">—</span>}
                          </td>
                          {/* أدوات */}
                          <td className={densityCls.cell} onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setSelectedCase(c)} title="فتح الملف" className="p-1.5 bg-white text-stone-500 hover:text-emerald-700 hover:bg-emerald-50 border border-stone-200 rounded-lg"><Eye className="size-3.5" /></button>
                              <button onClick={() => exportSingleCaseXLSX(c)} title="Excel" className="p-1.5 bg-white text-stone-500 hover:text-emerald-700 hover:bg-emerald-50 border border-stone-200 rounded-lg"><FileSpreadsheet className="size-3.5" /></button>
                              <button onClick={() => exportCasePDF(c)} title="بطاقة PDF" className="p-1.5 bg-white text-stone-500 hover:text-rose-700 hover:bg-rose-50 border border-stone-200 rounded-lg"><FileDown className="size-3.5" /></button>
                              <button onClick={() => downloadTextFile(buildICS([c]), `جلسات_${(c.mahakimId || c.id).replace(/\//g, '-')}.ics`, 'text/calendar')} title="تقويم iCal" className="p-1.5 bg-white text-stone-500 hover:text-purple-700 hover:bg-purple-50 border border-stone-200 rounded-lg"><CalendarClock className="size-3.5" /></button>
                              <button onClick={() => { setWizardData(c); setIsWizardOpen(true); }} title="تعديل" className="p-1.5 bg-white text-stone-500 hover:text-blue-700 hover:bg-blue-50 border border-stone-200 rounded-lg"><Activity className="size-3.5" /></button>
                              <button onClick={() => { if (window.confirm('حذف الملف؟')) handleDeleteCase(c.id); }} title="حذف" className="p-1.5 bg-white text-stone-500 hover:text-red-600 hover:bg-red-50 border border-stone-200 rounded-lg"><Trash2 className="size-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                      {processedCases.length === 0 && (
                        <tr><td colSpan={11} className="px-6 py-14 text-center">
                          <Search className="size-10 text-stone-200 mx-auto mb-3" />
                          <p className="text-stone-400 font-medium">لا توجد نتائج مطابقة</p>
                          {searchQuery && <p className="text-xs text-stone-400 mt-1">جرب كلمات أخرى</p>}
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="px-4 py-3 border-t border-stone-100 bg-stone-50 flex items-center justify-between text-xs text-stone-500">
                <span>{processedCases.length} ملف{processedCases.length !== cases.length ? ` (من أصل ${cases.length})` : ''}</span>
                {selectedIds.size > 0 && <span className="font-bold text-emerald-600">{selectedIds.size} محدد</span>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── تبويب "بوابة محاكم" — يبقى مُحمَّلاً دائماً (hidden فقط عند
          التبديل)، لأن إعادة تركيب الإطار/الإضافة عند كل تبديل بين
          التبويبين كانت تُفسد حالة الإضافة والبحث المدمج ── */}
      <div className={activeTab === 'mahakim' ? 'flex-1 flex flex-col min-h-[700px]' : 'hidden'}>
        <MahakimIntegration onSave={handleSaveCase} />
      </div>

      {isWizardOpen && (
        <CaseWizard initialData={wizardData || undefined} onSave={handleSaveCase}
          onCancel={() => { setIsWizardOpen(false); setWizardData(null); }} />
      )}

      {showReportModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowReportModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2"><ListChecks className="size-5 text-blue-600" /> تقرير دوري للقيادة</h3>
              <button onClick={() => setShowReportModal(false)} className="text-stone-400 hover:text-stone-600"><X className="size-5" /></button>
            </div>
            <p className="text-xs text-stone-500 leading-relaxed">
              اختر الفترة المطلوبة، وسيتم إنشاء ملف Excel يتضمن المؤشرات العامة (عدد الملفات، نسبة الأحكام، نسبة التنفيذ، المبالغ المستخلصة) مع مقارنة بالفترة السابقة، وتوزيع الملفات حسب المحكمة والنوع، ولائحة الملفات التي تحتاج تدقيقاً.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { k: 'month', l: 'هذا الشهر' },
                { k: 'lastMonth', l: 'الشهر الماضي' },
                { k: 'quarter', l: 'هذا الفصل' },
                { k: 'year', l: 'هذه السنة' },
              ].map(p => (
                <button key={p.k} type="button" onClick={() => {
                  const now = new Date();
                  let from: Date, to: Date, label: string;
                  if (p.k === 'month') {
                    from = new Date(now.getFullYear(), now.getMonth(), 1);
                    to = now;
                    label = `تقرير شهر ${now.toLocaleDateString('fr-MA', { month: 'long', year: 'numeric' })}`;
                  } else if (p.k === 'lastMonth') {
                    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    to = new Date(now.getFullYear(), now.getMonth(), 0);
                    label = `تقرير شهر ${from.toLocaleDateString('fr-MA', { month: 'long', year: 'numeric' })}`;
                  } else if (p.k === 'quarter') {
                    const q = Math.floor(now.getMonth() / 3);
                    from = new Date(now.getFullYear(), q * 3, 1);
                    to = now;
                    label = `تقرير الفصل ${q + 1} — ${now.getFullYear()}`;
                  } else {
                    from = new Date(now.getFullYear(), 0, 1);
                    to = now;
                    label = `تقرير سنة ${now.getFullYear()}`;
                  }
                  setReportFrom(from.toISOString().split('T')[0]);
                  setReportTo(to.toISOString().split('T')[0]);
                  setReportLabel(label);
                }} className="px-3 py-1.5 rounded-full text-xs font-bold border border-stone-200 bg-white text-stone-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors">
                  {p.l}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-500 mb-1">من تاريخ</label>
                <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)}
                  className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 mb-1">إلى تاريخ</label>
                <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)}
                  className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-500 mb-1">عنوان التقرير</label>
              <input type="text" value={reportLabel} onChange={e => setReportLabel(e.target.value)}
                placeholder="مثال: تقرير شهر يونيو 2026"
                className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20" />
            </div>
            <button
              disabled={!reportFrom || !reportTo}
              onClick={() => {
                exportPeriodicReportXLSX(cases, reportFrom, reportTo, reportLabel || 'تقرير دوري');
                setShowReportModal(false);
              }}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm shadow-sm flex items-center justify-center gap-2">
              <FileSpreadsheet className="size-4" /> إنشاء التقرير (Excel)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stable iframe (never re-renders) ─────────────────────────────────────────
// تُحجب التذييل السفلي (شعارات وزارة العدل/الروابط العامة) عبر "تقطيع" الإطار:
// يُجعل ارتفاع الـ iframe أكبر من حاويته بـ PORTAL_CROP_PX، وبما أن الحاوية
// الأم (.overflow-hidden في اللوحة اليمنى) تقصّ ما يفيض — يختفي الجزء السفلي
// تماماً دون أي تظليل أو تدرّج رمادي يغطي شريط البحث/النتائج المفيدة.
// ملاحظة: الإضافة (mahakim-stayawake.js) تحاول أيضاً حجب التذييل من داخل
// الصفحة نفسها بإضافة CSS — هذا التقطيع هو شبكة أمان احتياطية تعمل دائماً.
const PORTAL_CROP_PX = 200;

const PortalIframe = React.memo(
  React.forwardRef<HTMLIFrameElement>((_, ref) => (
    <iframe
      ref={ref}
      src="https://www.mahakim.ma/#/suivi/dossier-suivi"
      title="Mahakim.ma"
      className="w-full border-0 absolute top-0 left-0 right-0 pt-9 bg-white"
      style={{ height: `calc(100% + ${PORTAL_CROP_PX}px)` }}
      sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
    />
  )),
  () => true
);

// ─── MahakimIntegration ───────────────────────────────────────────────────────

// قائمة السنوات للاختيار السريع: من 2026 تنازلياً إلى 2000 (الأحدث أولاً)
const PORTAL_YEARS: number[] = Array.from({ length: 2026 - 2000 + 1 }, (_, i) => 2026 - i);

// ── محاضر الضابطة القضائية (rapport-police-judiciaire) — قوائم مقتصرة على
// ما يهمّ قسم المنازعات الغابوية فقط من بين قوائم بوابة محاكم الأطول ──

// نوع الضابطة القضائية: في بوابة محاكم هي قائمة من 5 خيارات (الأمن الوطني،
// الدرك الملكي، الموظفون المكلفون بمهمة، باقي محرري المحاضر، الضباط
// السامون) — هنا نقتصر على الخيارين المتعلقين بأعوان المياه والغابات.
const PV_AGENT_TYPES: string[] = ['الموظفون المكلفون بمهمة', 'باقي محرري المحاضر'];

// المصلحة/الجهة المعنية: قائمة بوابة محاكم طويلة جداً (كل المصالح العمومية)؛
// هذه قائمة مقتصرة على مصالح المياه والغابات بالجهة (تطوان/طنجة/الحسيمة).
// ⚠️ نصوص تقريبية بناءً على لقطات الشاشة — افتح القائمة المنسدلة الثانية
// لحقل "الضابطة القضائية" في البوابة وتحقّق من الصياغة الدقيقة، وعدّل هذه
// المصفوفة عند الحاجة (المطابقة في الإضافة هي "يحتوي على" فتتسامح مع فروق
// طفيفة، لكن يُفضَّل أن تكون النصوص هنا قريبة جداً من الأصل).
const PV_AGENCIES: string[] = [
  'رئيس مركز حماية الغابات بالمضيق - الفنيدق',
  'رئيس مركز حماية الغابات لتطوان الشرقية',
  'رئيس مركز حماية الغابات لتطوان الغربية',
  'المديرية الإقليمية للمياه والغابات بتطوان',
  'دائرة تنمية المجال الغابوي بتطوان',
  'دائرة تنمية المجال الغابوي بشفشاون',
  'دائرة تنمية المجال الغابوي بوزان',
  'دائرة تنمية المجال الغابوي بطنجة',
  'دائرة تنمية المجال الغابوي بالعرائش',
  'دائرة تنمية المجال الغابوي بالقصر الكبير',
  'دائرة تنمية المجال الغابوي بالحسيمة',
  'دائرة تنمية المجال الغابوي بتارجيست',
];

/** بطاقة محضر ضابطة قضائية مستخرَجة من بوابة محاكم — استخراج "أفضل محاولة" عام */
export interface PVRecord {
  /** رقم المحضر بالمحكمة (صيغة محاكم: سنة/رمز/رقم) */
  pvCourtRef: string;
  pvType: string;
  pvSubject: string;
  pvAction: string;
  /** رقم الملف الجنحي المرتبط (إن وُجد) — يُستخدم للبحث في شريط "تتبع الملفات" */
  linkedFileNumber: string;
  court: string;
  date: string;
  parties: { role: string; name: string }[];
  procedures: { date: string; action: string; decision: string }[];
  /** النص الكامل المستخرج — للعرض/المراجعة اليدوية دائماً */
  raw: string;
}

/**
 * استخراج "أفضل محاولة" من نص محضر الضابطة القضائية المستخرَج (بطاقة المحضر +
 * الأطراف + بطاقة الملف + الملفات الزجرية). على عكس performParsing (المُحكَم
 * لتنسيق "تتبع الملفات")، لا تتوفر عيّنات نص حقيقية لهذه الصفحة، فالاستخراج
 * هنا عام ومرن (مطابقة تسميات + أنماط أرقام الملفات)، والنص الكامل يبقى متاحاً
 * دائماً للمراجعة اليدوية.
 */
function performParsingPV(text: string): PVRecord {
  const clean = text.replace(/[\r]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const tokens = clean.split(/[\t\n]+/).map(s => s.trim()).filter(Boolean);

  const LABELS: Record<string, string> = {
    'رقم المحضر بالمحكمة': 'pvCourtRef',
    'الإجراء': 'pvAction',
    'نوع المحضر': 'pvType',
    'موضوع المحضر': 'pvSubject',
    'رقم الملف الجنحي': 'linkedFileNumber',
    'المحكمة': 'court',
    'تاريخ التسجيل': 'date',
    'تاريخ المحضر': 'date',
  };
  const labelKeys = Object.keys(LABELS);
  const map: Record<string, string> = {};
  for (let i = 0; i < tokens.length; i++) {
    const lk = labelKeys.find(l => tokens[i] === l);
    if (lk) {
      const j = i + 1;
      if (j < tokens.length && !labelKeys.includes(tokens[j]) && tokens[j].length >= 1 && tokens[j].length < 250) {
        const key = LABELS[lk];
        if (!map[key]) map[key] = tokens[j];
        i = j;
      }
    }
  }

  // كل المراجع بصيغة "سنة/رمز/رقم" الموجودة في النص. أول مرجع غالباً هو رقم
  // المحضر نفسه؛ أي مرجع آخر مختلف غالباً هو "رقم الملف الجنحي" المرتبط.
  const refRe = /\d{4}\s*\/\s*\d{2,5}\s*\/\s*\d{1,5}/g;
  const allRefs = Array.from(new Set((clean.match(refRe) || []).map(s => s.replace(/\s+/g, ''))));
  if (!map.pvCourtRef && allRefs[0]) map.pvCourtRef = allRefs[0];
  if (!map.linkedFileNumber) {
    const other = allRefs.find(r => r !== map.pvCourtRef);
    if (other) map.linkedFileNumber = other;
  }
  if (map.linkedFileNumber === '-' || map.linkedFileNumber === '–' || map.linkedFileNumber === '—') {
    map.linkedFileNumber = '';
  }

  // ── الأطراف (من قسم "════ الأطراف ════") ──
  const parties: { role: string; name: string }[] = [];
  const partSec = clean.match(/════════ الأطراف ════════([\s\S]*?)(════════|$)/);
  if (partSec) {
    const roleWords = ['مدعي', 'مدعى عليه', 'متهم', 'مشتكي', 'مشتكى به', 'ضحية', 'مسؤول مدني', 'نيابة عامة', 'مطلوب', 'طالب'];
    for (const line of partSec[1].split('\n').map(l => l.trim()).filter(Boolean)) {
      const parts = line.split('\t').map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2 && roleWords.some(r => parts[0].includes(r))) {
        parties.push({ role: parts[0], name: parts[1] });
      }
    }
  }

  // ── الإجراءات (من قسم "بيانات محضر الضابطة القضائية" — لائحة الإجراءات تُعرض افتراضياً) ──
  const procedures: { date: string; action: string; decision: string }[] = [];
  const dateRe = /^(\d{2}\/\d{2}\/\d{4})/;
  const procSec = clean.match(/════════ بيانات محضر الضابطة القضائية ════════([\s\S]*?)(════════|$)/);
  const procSource = procSec ? procSec[1] : clean;
  for (const line of procSource.split('\n').map(l => l.trim()).filter(Boolean)) {
    const parts = line.split('\t').map(s => s.trim()).filter(Boolean);
    const dm = parts.find(p => dateRe.test(p));
    if (dm && parts.length >= 2) {
      const rest = parts.filter(p => p !== dm);
      procedures.push({ date: dm, action: rest[0] || '', decision: rest[1] || '' });
    }
  }

  return {
    pvCourtRef: map.pvCourtRef || '',
    pvType: map.pvType || '',
    pvSubject: map.pvSubject || '',
    pvAction: map.pvAction || '',
    linkedFileNumber: map.linkedFileNumber || '',
    court: map.court || '',
    date: map.date || '',
    parties,
    procedures,
    raw: text,
  };
}

function MahakimIntegration({ onSave }: { onSave: (c: Case) => void }) {
  const [pasteData, setPasteData] = useState('');
  const [result, setResult] = useState<ReturnType<typeof performParsing> | null>(null);
  const [extractMode, setExtractMode] = useState<'portal' | 'parsed'>('portal');
  const [showYearMenu, setShowYearMenu] = useState(false);
  const yearMenuRef = useRef<HTMLDivElement>(null);
  const [showManualPanel, setShowManualPanel] = useState(false);
  const pasteCount = useRef(0);
  const pasteDataRef = useRef('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // علَم: بحث جديد عبر الإضافة جارٍ — نتيجته الأولى تستبدل البيانات بدل أن تتراكم
  const freshSearchRef = useRef(false);

  // ── VB.NET Bridge — استقبال البيانات تلقائياً ──────────────
  useEffect(() => {
    let last = '';
    const id = setInterval(async () => {
      try {
        const r = await fetch('http://localhost:5765/latest', {
          signal: AbortSignal.timeout(1500),
        });
        if (r.status === 204 || !r.ok) return;
        const text = await r.text();
        if (!text || text.length < 50 || text === last) return;
        last = text;
        const sep = pasteDataRef.current.trim()
          ? `\n\n════════ من VB.NET ════════\n\n` : '';
        const data = pasteDataRef.current + sep + text;
        pasteCount.current++;
        setPasteData(data);
        setResult(performParsing(data));
        setExtractMode('parsed');
      } catch { }
    }, 2500);
    return () => clearInterval(id);
  }, []);
  // ───────────────────────────────────────────────────────────
  // Keep ref in sync with state (avoids stale closure in paste listener)
  useEffect(() => { pasteDataRef.current = pasteData; }, [pasteData]);

  // ── بحث مدمج عبر VB.NET ────────────────────────────────────
  const [remoteNum, setRemoteNum] = useState('');
  const [remoteMark, setRemoteMark] = useState('');
  const [remoteYear, setRemoteYear] = useState('');
  const [remoteCourt, setRemoteCourt] = useState('تطوان');
  const [isSearching, setIsSearching] = useState(false);
  const [searchStage, setSearchStage] = useState('');
  const [bridgeReady, setBridgeReady] = useState(false);
  const [extensionReady, setExtensionReady] = useState(false);

  // ── شريط بحث محاضر الضابطة القضائية (مخالفات غابوية) ────────
  const [showPVPanel, setShowPVPanel] = useState(false);
  const [pvNumber, setPvNumber] = useState('');
  const [pvYear, setPvYear] = useState('');
  const [pvCourt, setPvCourt] = useState('تطوان');
  const [pvAgentType, setPvAgentType] = useState(PV_AGENT_TYPES[0]);
  const [pvAgency, setPvAgency] = useState(PV_AGENCIES[0]);
  const [pvShowYearMenu, setPvShowYearMenu] = useState(false);
  const pvYearMenuRef = useRef<HTMLDivElement>(null);
  const [pvIsSearching, setPvIsSearching] = useState(false);
  const [pvSearchStage, setPvSearchStage] = useState('');
  const [pvResult, setPvResult] = useState<PVRecord | null>(null);
  const [pvShowRaw, setPvShowRaw] = useState(false);

  // فحص هل تطبيق VB.NET شغّال كل 5 ثوان
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch('http://localhost:5765/status', { signal: AbortSignal.timeout(800) });
        setBridgeReady(r.ok);
      } catch { setBridgeReady(false); }
    };
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, []);

  // أوقف حالة البحث عندما تصل البيانات
  useEffect(() => {
    if (result) setIsSearching(false);
  }, [result]);

  // ── Chrome Extension: PING/PONG للكشف عن الإضافة ──────────────
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.source !== window) return;
      if (e.data?.type === 'MAHAKIM_PONG' || e.data?.type === 'MAHAKIM_EXTENSION_LOADED') {
        setExtensionReady(true);
      }
    };
    window.addEventListener('message', handler);
    const ping = () => window.postMessage({ type: 'MAHAKIM_PING' }, '*');
    ping();
    const id = setInterval(ping, 5000);
    return () => { window.removeEventListener('message', handler); clearInterval(id); };
  }, []);

  // ── Chrome Extension: استقبال النتائج/الأخطاء/التقدم (v6) ────
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.source !== window) return;
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'MAHAKIM_RESULT' && d.text && d.searchType === 'pv') {
        // نتيجة بحث محاضر الضابطة القضائية — حالة مستقلة، لا تلمس
        // pasteData/result/extractMode الخاصة بشريط "تتبع الملفات".
        setPvResult(performParsingPV(d.text));
        setPvIsSearching(false);
        setPvSearchStage('');
      } else if (d.type === 'MAHAKIM_RESULT' && d.text) {
        // بحث جديد عبر الإضافة → استبدل البيانات (ملف مختلف).
        // وإلا (تبويبة إضافية / لصق يدوي لاحق) → تراكم فوق نفس الملف.
        const isFresh = freshSearchRef.current;
        freshSearchRef.current = false;
        if (isFresh) {
          pasteCount.current = 1;
          setPasteData(d.text);
          setResult(performParsing(d.text));
        } else {
          const sep = pasteDataRef.current.trim()
            ? `\n\n════════ من الإضافة ════════\n\n` : '';
          const data = pasteDataRef.current + sep + d.text;
          pasteCount.current++;
          setPasteData(data);
          setResult(performParsing(data));
        }
        setExtractMode('parsed');
        setIsSearching(false);
        setSearchStage('');
      }
      if (d.type === 'MAHAKIM_ERROR' && d.searchType === 'pv') {
        setPvIsSearching(false);
        setPvSearchStage('');
        const PV_ERR_AR: Record<string, string> = {
          no_results: 'لا توجد نتيجة لهذا المحضر بهذه المعايير',
          pv_form_not_found: 'تعذّر فتح نموذج "محضر الضابطة القضائية" — حاول مجدداً',
          pv_numero_field_not_found: 'تعذّر العثور على حقل رقم المحضر/السنة',
          pv_agent_type_select_failed: 'تعذّر اختيار "نوع الضابطة القضائية" — تأكد أن القيمة موجودة في القائمة بالبوابة',
          pv_agency_select_failed: 'تعذّر اختيار "المصلحة/الجهة المعنية" — تأكد أن القيمة موجودة في القائمة بالبوابة',
          pv_no_response: 'لم تستجب البوابة — أعد المحاولة',
          pv_submit_not_found: 'تعذّر العثور على زر البحث',
          appeal_court_select_failed: 'تعذّر اختيار محكمة الاستئناف',
          primary_court_select_failed: 'تعذّر اختيار المحكمة الابتدائية',
          assembled_too_short: 'البيانات المستخرجة قصيرة جداً — حاول مجدداً',
          timeout: 'انتهت المهلة — أعد المحاولة',
          tab_closed: 'أُغلق تبويب البوابة قبل الاكتمال',
          website_tab_closed: 'أُغلق تبويب الموقع قبل الاكتمال',
          extension_unreachable: 'تعذّر الوصول للإضافة — أعد تحميل الصفحة',
          point_outside_viewport: 'البوابة خارج مجال الرؤية — كبّر النافذة وأعد المحاولة',
        };
        const k = String(d.error || '');
        alert('⚠️ فشل البحث عن المحضر: ' + (PV_ERR_AR[k] || k));
      } else if (d.type === 'MAHAKIM_ERROR') {
        freshSearchRef.current = false;
        setIsSearching(false);
        setSearchStage('');
        const ERR_AR: Record<string, string> = {
          no_results: 'لا توجد نتيجة لهذا الرقم في هذه المحكمة',
          timeout: 'انتهت المهلة — أعد المحاولة',
          tab_closed: 'أُغلق تبويب البوابة قبل الاكتمال',
          website_tab_closed: 'أُغلق تبويب الموقع قبل الاكتمال',
          extension_unreachable: 'تعذّر الوصول للإضافة — أعد تحميل الصفحة',
          point_outside_viewport: 'البوابة خارج مجال الرؤية — كبّر النافذة وأعد المحاولة',
        };
        const k = String(d.error || '');
        alert('⚠️ فشل البحث التلقائي: ' + (ERR_AR[k] || k));
      }
      // مرحلة التقدم الحية من الإضافة (v6)
      if (d.type === 'MAHAKIM_PROGRESS') {
        if (d.searchType === 'pv') setPvSearchStage(String(d.stage || ''));
        else setSearchStage(String(d.stage || ''));
      }
      // الإضافة تطلب إظهار البوابة قبل بدء الأتمتة داخل الـ iframe (v6)
      if (d.type === 'MAHAKIM_SHOW_PORTAL') {
        setExtractMode('portal');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);
  // ───────────────────────────────────────────────────────────────

  const handleRemoteSearch = async () => {
    if (!remoteNum.trim()) return;
    // v6: الإضافة تعمل داخل iframe البوابة في هذه الصفحة —
    // يجب أن يكون الإطار معروضاً (مركّباً في DOM) قبل بدء الأتمتة.
    setExtractMode('portal');
    setIsSearching(true);
    setSearchStage('');
    const isAppeal = remoteCourt.startsWith('استئناف ');
    const courtName = isAppeal ? remoteCourt.replace('استئناف ', '').trim() : remoteCourt;
    const primaryCourts = ['تطوان','طنجة','العرائش','القصر الكبير','شفشاون','وزان','الحسيمة','تارجيست'];
    const isPrimary = !isAppeal && primaryCourts.includes(remoteCourt);

    // الإضافة أولاً
    if (extensionReady) {
      // علّم أن نتيجة هذا البحث ملف جديد كامل — يجب أن تستبدل لا تتراكم
      freshSearchRef.current = true;
      window.postMessage({
        type: 'MAHAKIM_TO_EXTENSION',
        payload: { numero: remoteNum.trim(), mark: remoteMark.trim(), year: remoteYear.trim(), court: courtName, isPrimary },
      }, '*');
      setTimeout(() => setIsSearching(false), 90000); // مهلة أمان
      return;
    }

    // سقوط احتياطي: جسر VB.NET القديم
    try {
      const cmd = `${remoteNum}|${remoteMark}|${remoteYear}|${courtName}|${isPrimary ? 'primary' : 'appeal'}`;
      await fetch('http://localhost:5765/search', {
        method: 'POST', body: cmd, signal: AbortSignal.timeout(3000),
      });
    } catch {
      setIsSearching(false);
    }
  };
  // ───────────────────────────────────────────────────────────

  // ── بحث محاضر الضابطة القضائية (شأن المخالفات الغابوية) ─────
  const handlePVSearch = () => {
    if (!pvNumber.trim()) return;
    setExtractMode('portal');
    setPvIsSearching(true);
    setPvSearchStage('');
    setPvResult(null);
    const isAppeal = pvCourt.startsWith('استئناف ');
    const courtName = isAppeal ? pvCourt.replace('استئناف ', '').trim() : pvCourt;
    const primaryCourts = ['تطوان','طنجة','العرائش','القصر الكبير','شفشاون','وزان','الحسيمة','تارجيست'];
    const isPrimary = !isAppeal && primaryCourts.includes(pvCourt);

    if (extensionReady) {
      window.postMessage({
        type: 'MAHAKIM_TO_EXTENSION',
        payload: {
          searchType: 'pv',
          numero: pvNumber.trim(),
          year: pvYear.trim(),
          court: courtName,
          isPrimary,
          agentType: pvAgentType,
          agency: pvAgency,
        },
      }, '*');
      setTimeout(() => setPvIsSearching(false), 90000); // مهلة أمان
      return;
    }

    // لا يوجد سقوط احتياطي عبر VB.NET لهذا النوع من البحث
    setPvIsSearching(false);
    alert('⚠️ البحث عن محاضر الضابطة القضائية يتطلب تفعيل إضافة Mahakim Bridge.');
  };

  // يستخدم "رقم الملف الجنحي" المستخرَج من المحضر لبدء بحث في الشريط الأول
  const handleUseLinkedFile = () => {
    if (!pvResult?.linkedFileNumber) return;
    const parts = pvResult.linkedFileNumber.split('/').map(s => s.trim());
    if (parts.length !== 3 || parts.some(p => !p)) {
      alert('⚠️ صيغة رقم الملف غير معروفة: ' + pvResult.linkedFileNumber);
      return;
    }
    const [y, mark, num] = parts;
    // اعكس القيم في حقول الشريط الأول للعرض، ثم نفّذ البحث مباشرة بهذه القيم
    setRemoteYear(y);
    setRemoteMark(mark);
    setRemoteNum(num);
    setRemoteCourt(pvCourt);

    setExtractMode('portal');
    setIsSearching(true);
    setSearchStage('');
    const isAppeal = pvCourt.startsWith('استئناف ');
    const courtName = isAppeal ? pvCourt.replace('استئناف ', '').trim() : pvCourt;
    const primaryCourts = ['تطوان','طنجة','العرائش','القصر الكبير','شفشاون','وزان','الحسيمة','تارجيست'];
    const isPrimary = !isAppeal && primaryCourts.includes(pvCourt);

    if (extensionReady) {
      freshSearchRef.current = true;
      window.postMessage({
        type: 'MAHAKIM_TO_EXTENSION',
        payload: { searchType: 'dossier', numero: num, mark, year: y, court: courtName, isPrimary },
      }, '*');
      setTimeout(() => setIsSearching(false), 90000);
    } else {
      setIsSearching(false);
      alert('⚠️ يتطلب تفعيل إضافة Mahakim Bridge للبحث التلقائي عن الملف.');
    }
  };
  // ───────────────────────────────────────────────────────────

  // ── Auto-capture Ctrl+V anywhere on this component (outside textareas) ──
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === 'TEXTAREA' || tgt.tagName === 'INPUT') return;
      const text = e.clipboardData?.getData('text/plain') || '';
      if (text.length < 30) return;
      e.preventDefault();
      const sep = pasteDataRef.current.trim() ? `\n\n════════ لصقة ${++pasteCount.current} ════════\n\n` : '';
      const newData = pasteDataRef.current + sep + text;
      setPasteData(newData);
      const parsed = performParsing(newData);
      setResult(parsed);
      setExtractMode('parsed');
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  // ── إغلاق قائمة السنوات عند النقر خارجها ──
  useEffect(() => {
    if (!showYearMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (yearMenuRef.current && !yearMenuRef.current.contains(e.target as Node)) {
        setShowYearMenu(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showYearMenu]);

  // ── إغلاق قائمة سنوات محاضر الضابطة القضائية عند النقر خارجها ──
  useEffect(() => {
    if (!pvShowYearMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (pvYearMenuRef.current && !pvYearMenuRef.current.contains(e.target as Node)) {
        setPvShowYearMenu(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [pvShowYearMenu]);

  const handleReadClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { alert('الحافظة فارغة. الرجاء نسخ المحتوى أولاً (Ctrl+A ثم Ctrl+C)'); return; }
      const sep = pasteDataRef.current.trim() ? `\n\n════════ لصقة ${++pasteCount.current} ════════\n\n` : '';
      const newData = pasteDataRef.current + sep + text;
      setPasteData(newData);
      const parsed = performParsing(newData);
      setResult(parsed);
      setExtractMode('parsed');
    } catch {
      alert('تعذر الوصول إلى الحافظة – الصق يدوياً في المنطقة النصية أدناه ثم اضغط "تحليل".');
    }
  };

  const handleManual = () => {
    if (!pasteData.trim()) return;
    const parsed = performParsing(pasteData);
    setResult(parsed);
    setExtractMode('parsed');
  };

  const handleReset = () => {
    setPasteData('');
    setResult(null);
    setExtractMode('portal');
    pasteCount.current = 0;
  };

  const handleSave = () => {
    if (!result) return;
    const newCase: Case = {
      id: `CTX-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000) + 1000}`,
      mahakimId: result.mahakimId !== '-' ? result.mahakimId : undefined,
      nationalId: result.nationalId !== '-' ? result.nationalId : undefined,
      court: result.court,
      type: result.type,
      subject: result.subject,
      date: result.date,
      judge: result.judge !== '-' ? result.judge : undefined,
      section: result.section !== '-' ? result.section : undefined,
      status: result.status,
      nextSession: result.nextSession !== '-' ? result.nextSession : undefined,
      defendant: result.defendant,
      parties: result.parties,
      procedures: result.procedures,
      // ختم المزامنة: هذا الملف جاء من بوابة محاكم الآن
      lastSyncedAt: new Date().toISOString(),
      syncCount: 1,
    };
    onSave(newCase);
    handleReset();
  };


  const [expandedView, setExpandedView] = useState(false);

  return (
    <div className={expandedView
      ? 'fixed inset-0 z-50 bg-white flex flex-col'
      : 'bg-white rounded-2xl border border-stone-200 shadow-sm flex flex-col min-h-[700px]'} dir="rtl">
      <div className="p-4 bg-emerald-900 flex justify-between items-center text-emerald-50 shrink-0 shadow-md">
        <div>
          <h2 className="font-bold text-lg flex items-center gap-2"><Landmark className="size-5 text-emerald-300" /> تكامل مع بوابة محاكم</h2>
          <p className="text-xs text-emerald-400 mt-0.5">انسخ الصفحة كاملة (Ctrl+A → Ctrl+C) ثم اضغط الزر — كرر لكل تبويبة</p>
        </div>
        <div className="flex gap-2 items-center">
          {result && (
            <>
              <button onClick={() => setExtractMode(extractMode === 'portal' ? 'parsed' : 'portal')}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-bold rounded-lg text-xs">
                <Eye className="size-4" /> {extractMode === 'portal' ? 'عرض النتائج' : 'رجوع للبوابة'}
              </button>
              <button onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-lg text-sm shadow">
                <DownloadCloud className="size-4" /> حفظ في القاعدة
              </button>
            </>
          )}
          <button onClick={() => setExpandedView(v => !v)} title={expandedView ? 'تصغير' : 'توسيع لملء الصفحة'}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 font-bold rounded-lg text-xs shrink-0">
            {expandedView ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            {expandedView ? 'تصغير' : 'توسيع'}
          </button>
        </div>
      </div>

      <div className={`flex flex-col md:flex-row flex-1 ${expandedView ? 'overflow-y-auto md:overflow-hidden' : ''}`}>
        {/* ── Left panel ── */}
        <div className={`w-full md:w-[420px] ${expandedView ? 'md:max-h-[calc(100vh-72px)]' : 'md:max-h-[85vh]'} border-b md:border-b-0 md:border-l border-stone-200 bg-stone-50 p-5 flex flex-col gap-4 md:overflow-y-auto shrink-0`}>
          {/* ── بوابة محاكم المدمجة ── */}
          {(bridgeReady || extensionReady) ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
                <span className="size-2 bg-emerald-500 rounded-full animate-pulse shrink-0" />
                {extensionReady ? 'بوابة محاكم — عبر الإضافة 🧩' : 'بوابة محاكم — متصلة'}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-stone-500 font-bold text-center">رقم</label>
                  <input placeholder="رقم الملف" value={remoteNum}
                    onChange={e => setRemoteNum(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleRemoteSearch()}
                    className="border border-stone-200 rounded-lg px-2 py-2 text-sm text-center focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-stone-500 font-bold text-center">رمز</label>
                  <input placeholder="رمز الملف" value={remoteMark}
                    onChange={e => setRemoteMark(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleRemoteSearch()}
                    className="border border-stone-200 rounded-lg px-2 py-2 text-sm text-center focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
                <div className="flex flex-col gap-1 relative" ref={yearMenuRef}>
                  <label className="text-[10px] text-stone-500 font-bold text-center">سنة</label>
                  <div className="flex items-stretch gap-1">
                    <input placeholder="السنة" value={remoteYear}
                      onChange={e => setRemoteYear(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleRemoteSearch()}
                      className="w-full min-w-0 border border-stone-200 rounded-lg px-2 py-2 text-sm text-center focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                    <button type="button" onClick={() => setShowYearMenu(v => !v)} title="اختر السنة من القائمة"
                      className="shrink-0 border border-stone-200 rounded-lg px-1.5 bg-white hover:bg-emerald-50 text-stone-500 hover:text-emerald-700 flex items-center justify-center transition-colors">
                      <ChevronDown className={`size-3.5 transition-transform ${showYearMenu ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  {showYearMenu && (
                    <div className="absolute top-full mt-1 right-0 left-0 z-30 bg-white border border-emerald-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {PORTAL_YEARS.map(y => (
                        <button key={y} type="button"
                          onClick={() => { setRemoteYear(String(y)); setShowYearMenu(false); }}
                          className={`w-full text-center px-2 py-1.5 text-xs font-bold hover:bg-emerald-50 ${String(y) === remoteYear ? 'bg-emerald-100 text-emerald-800' : 'text-stone-700'}`}>
                          {y}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-stone-500 font-bold">المحكمة</label>
                <select value={remoteCourt} onChange={e => setRemoteCourt(e.target.value)}
                  className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none">
                  <optgroup label="محاكم استئناف">
                    {['تطوان','طنجة','الحسيمة'].map(c => (
                      <option key={'ap-'+c} value={'استئناف '+c}>{'استئناف '+c}</option>
                    ))}
                  </optgroup>
                  <optgroup label="محاكم ابتدائية">
                    {['تطوان','طنجة','العرائش','القصر الكبير','شفشاون','وزان','الحسيمة','تارجيست'].map(c => (
                      <option key={c}>{c}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <button onClick={handleRemoteSearch}
                disabled={isSearching || !remoteNum.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl py-2.5 font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-sm">
                {isSearching
                  ? <><RefreshCw className="size-4 animate-spin" /> جاري البحث في بوابة محاكم...</>
                  : <><Search className="size-4" /> بحث تلقائي</>}
              </button>
              {isSearching && (
                <p className="text-[11px] text-emerald-600 text-center animate-pulse">
                  ⏳ {searchStage
                    ? <>المرحلة: <span className="font-bold">{searchStage}</span></>
                    : 'يتم البحث... سيظهر الملف تلقائياً بعد اكتمال النسخ'}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl">
                <h3 className="text-orange-900 font-bold text-sm flex items-center gap-2 mb-2"><AlertTriangle className="size-4" /> حماية CORS</h3>
                <p className="text-[11px] text-orange-800 leading-relaxed">لا يمكن استخراج البيانات برمجياً. انسخ يدوياً من البوابة كما هو موضح.</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-[11px] text-amber-800 font-medium">
                💡 ثبّت إضافة <strong>Mahakim Bridge</strong> للبحث التلقائي بدون نسخ يدوي
              </div>
            </div>
          )}

          {/* ── شريط التحليل: استخراج وتنظيم من نص الملف ── */}
          <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
            <button type="button" onClick={() => setShowManualPanel(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-stone-700 hover:bg-stone-50 transition-colors">
              <span className="flex items-center gap-2"><ClipboardPaste className="size-4 text-emerald-600" /> شريط التحليل — استخراج وتنظيم البيانات</span>
              <ChevronDown className={`size-4 text-stone-400 transition-transform ${showManualPanel ? 'rotate-180' : ''}`} />
            </button>
            {showManualPanel && (
              <div className="px-4 pb-4 space-y-2 border-t border-stone-100 pt-3">
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  انسخ محتوى صفحة الملف من بوابة محاكم بالكامل (Ctrl+A ثم Ctrl+C) ثم اضغط الزر أدناه لاستخراجه من الحافظة، أو الصقه يدوياً في المربع ثم اضغط «تحليل النص». كرر العملية لكل تبويبة (الإجراءات، الأطراف...) فتُضاف كل لصقة إلى نفس الملف تلقائياً.
                </p>
                <button onClick={handleReadClipboard}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-sm transition-all hover:shadow flex items-center justify-center gap-2">
                  <ClipboardPaste className="size-4" />
                  {pasteData.trim() ? `إضافة لصقة أخرى (${pasteCount.current + 1})` : 'استخراج من الحافظة'}
                </button>
                {pasteData.trim() && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl text-xs font-bold text-emerald-800">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                    {pasteCount.current} لصقة محفوظة — كرر لكل تبويبة
                  </div>
                )}
                <textarea
                  value={pasteData}
                  onChange={e => setPasteData(e.target.value)}
                  placeholder="أو الصق المحتوى هنا يدوياً... (Ctrl+V)"
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-3 text-[10px] font-mono text-stone-600 outline-none resize-none h-24 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
                <div className="flex gap-2">
                  <button onClick={handleManual} disabled={!pasteData.trim()}
                    className="flex-1 py-2 bg-stone-800 disabled:opacity-40 hover:bg-stone-900 text-white rounded-lg font-bold text-xs">
                    تحليل النص
                  </button>
                  {pasteData.trim() && (
                    <button onClick={handleReset} className="px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-bold border border-red-200">
                      مسح الكل
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── محاضر الضابطة القضائية (مخالفات غابوية) ── */}
          <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
            <button type="button" onClick={() => setShowPVPanel(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-stone-700 hover:bg-stone-50 transition-colors">
              <span className="flex items-center gap-2"><ShieldAlert className="size-4 text-blue-600" /> 🚓 محاضر الضابطة القضائية (مخالفات غابوية)</span>
              <ChevronDown className={`size-4 text-stone-400 transition-transform ${showPVPanel ? 'rotate-180' : ''}`} />
            </button>
            {showPVPanel && (
              <div className="px-4 pb-4 space-y-3 border-t border-stone-100 pt-3">
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  بحث مستقل عن "محضر الضابطة القضائية" — يستخدم هذا الشريط أو شريط "تتبع الملفات" أعلاه، وليس كليهما معاً في الوقت نفسه.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1 col-span-2">
                    <label className="text-[10px] text-stone-500 font-bold text-center">رقم المحضر</label>
                    <input placeholder="رقم محضر الضابطة القضائية" value={pvNumber}
                      onChange={e => setPvNumber(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handlePVSearch()}
                      className="border border-stone-200 rounded-lg px-2 py-2 text-sm text-center focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div className="flex flex-col gap-1 relative" ref={pvYearMenuRef}>
                    <label className="text-[10px] text-stone-500 font-bold text-center">سنة</label>
                    <div className="flex items-stretch gap-1">
                      <input placeholder="السنة" value={pvYear}
                        onChange={e => setPvYear(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handlePVSearch()}
                        className="w-full min-w-0 border border-stone-200 rounded-lg px-2 py-2 text-sm text-center focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <button type="button" onClick={() => setPvShowYearMenu(v => !v)} title="اختر السنة من القائمة"
                        className="shrink-0 border border-stone-200 rounded-lg px-1.5 bg-white hover:bg-blue-50 text-stone-500 hover:text-blue-700 flex items-center justify-center transition-colors">
                        <ChevronDown className={`size-3.5 transition-transform ${pvShowYearMenu ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                    {pvShowYearMenu && (
                      <div className="absolute top-full mt-1 right-0 left-0 z-30 bg-white border border-blue-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {PORTAL_YEARS.map(y => (
                          <button key={y} type="button"
                            onClick={() => { setPvYear(String(y)); setPvShowYearMenu(false); }}
                            className={`w-full text-center px-2 py-1.5 text-xs font-bold hover:bg-blue-50 ${String(y) === pvYear ? 'bg-blue-100 text-blue-800' : 'text-stone-700'}`}>
                            {y}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 space-y-2.5">
                  <p className="text-[11px] font-bold text-stone-600">المحكمة والضابطة القضائية</p>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-stone-500 font-bold">المحكمة</label>
                    <select value={pvCourt} onChange={e => setPvCourt(e.target.value)}
                      className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none">
                      <optgroup label="محاكم استئناف">
                        {['تطوان','طنجة','الحسيمة'].map(c => (
                          <option key={'pv-ap-'+c} value={'استئناف '+c}>{'استئناف '+c}</option>
                        ))}
                      </optgroup>
                      <optgroup label="محاكم ابتدائية">
                        {['تطوان','طنجة','العرائش','القصر الكبير','شفشاون','وزان','الحسيمة','تارجيست'].map(c => (
                          <option key={'pv-'+c}>{c}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-stone-500 font-bold">نوع الضابطة القضائية</label>
                    <select value={pvAgentType} onChange={e => setPvAgentType(e.target.value)}
                      className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none">
                      {PV_AGENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-stone-500 font-bold">المصلحة/الجهة المعنية</label>
                    <select value={pvAgency} onChange={e => setPvAgency(e.target.value)}
                      className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none">
                      {PV_AGENCIES.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                </div>

                <button onClick={handlePVSearch}
                  disabled={pvIsSearching || !pvNumber.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl py-2.5 font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-sm">
                  {pvIsSearching
                    ? <><RefreshCw className="size-4 animate-spin" /> جاري البحث عن المحضر...</>
                    : <><Search className="size-4" /> بحث عن المحضر</>}
                </button>
                {pvIsSearching && (
                  <p className="text-[11px] text-blue-600 text-center animate-pulse">
                    ⏳ {pvSearchStage
                      ? <>المرحلة: <span className="font-bold">{pvSearchStage}</span></>
                      : 'يتم البحث...'}
                  </p>
                )}
                {!extensionReady && (
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-[11px] text-amber-800 font-medium">
                    💡 يتطلب هذا البحث تفعيل إضافة <strong>Mahakim Bridge</strong> — لا يوجد سقوط احتياطي عبر VB.NET لهذا النوع.
                  </div>
                )}
              </div>
            )}

            {/* ── نتيجة محضر الضابطة القضائية ── */}
            {pvResult && (
              <div className="px-4 pb-4 space-y-2 border-t border-stone-100 pt-3 bg-blue-50/40">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-blue-900 flex items-center gap-2">
                    <ShieldAlert className="size-4" /> بيانات المحضر
                  </h4>
                  {pvResult.pvCourtRef && (
                    <span className="font-mono text-xs font-bold bg-white border border-blue-200 text-blue-800 px-2 py-1 rounded-lg">
                      {pvResult.pvCourtRef}
                    </span>
                  )}
                </div>
                <div className="space-y-1 text-xs">
                  {pvResult.pvType && <p><span className="text-stone-500">نوع المحضر: </span><span className="font-bold">{pvResult.pvType}</span></p>}
                  {pvResult.pvSubject && <p><span className="text-stone-500">موضوع المحضر: </span><span className="font-bold">{pvResult.pvSubject}</span></p>}
                  {pvResult.pvAction && <p><span className="text-stone-500">الإجراء: </span><span className="font-bold">{pvResult.pvAction}</span></p>}
                  {pvResult.court && <p><span className="text-stone-500">المحكمة: </span><span className="font-bold">{pvResult.court}</span></p>}
                  {pvResult.date && <p><span className="text-stone-500">التاريخ: </span><span className="font-bold font-mono">{pvResult.date}</span></p>}
                </div>

                {pvResult.parties.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-stone-600">الأطراف</p>
                    {pvResult.parties.map((p, i) => (
                      <p key={i} className="text-[11px] text-stone-600">
                        <span className="font-bold">{p.role}</span>: {p.name}
                      </p>
                    ))}
                  </div>
                )}

                {pvResult.procedures.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-stone-600">الإجراءات</p>
                    {pvResult.procedures.map((p, i) => (
                      <p key={i} className="text-[11px] text-stone-600">
                        <span className="font-mono text-stone-400">{p.date}</span> — <span className="font-bold">{p.action}</span>{p.decision ? `: ${p.decision}` : ''}
                      </p>
                    ))}
                  </div>
                )}

                {pvResult.linkedFileNumber ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
                    <p className="text-xs text-emerald-800">
                      <span className="text-stone-500">رقم الملف الجنحي: </span>
                      <span className="font-mono font-bold">{pvResult.linkedFileNumber}</span>
                    </p>
                    <button onClick={handleUseLinkedFile}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-2 transition-all">
                      <ExternalLink className="size-3.5" /> بحث عن هذا الملف في الشريط الأول
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] text-stone-400">لم يُعثر على "رقم الملف الجنحي" المرتبط في هذا المحضر.</p>
                )}

                <button type="button" onClick={() => setPvShowRaw(v => !v)}
                  className="w-full text-[11px] font-bold text-stone-500 hover:text-stone-700 flex items-center justify-center gap-1 pt-1">
                  {pvShowRaw ? 'إخفاء' : 'عرض'} النص الكامل المستخرج
                  <ChevronDown className={`size-3 transition-transform ${pvShowRaw ? 'rotate-180' : ''}`} />
                </button>
                {pvShowRaw && (
                  <textarea readOnly value={pvResult.raw}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg p-3 text-[10px] font-mono text-stone-600 outline-none resize-none h-40" />
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel: Portal (always mounted) + Results overlay ── */}
        <div className="flex-1 bg-stone-100 relative w-full h-full overflow-hidden">
          {/* Portal — always in DOM, just hidden when showing results */}
          <div className={extractMode === 'portal' ? 'absolute inset-0' : 'absolute inset-0 invisible pointer-events-none'}>
            <div className="absolute inset-x-0 top-0 h-9 bg-white/80 backdrop-blur border-b border-stone-200 flex items-center justify-center z-10 pointer-events-none">
              <span className="text-xs font-bold text-stone-500 flex items-center gap-2"><Lock className="size-3 text-stone-400" /> بوابة محاكم الأصلية</span>
            </div>
            <PortalIframe ref={iframeRef} />
          </div>

          {/* Results view */}
          {extractMode === 'parsed' && result && (
            <div className="absolute inset-0 bg-white overflow-y-auto p-6 z-20 animate-in fade-in duration-300">
              <div className="flex justify-between items-center mb-6 pb-5 border-b border-stone-100">
                <div>
                  <h3 className="font-bold text-2xl text-emerald-900 flex items-center gap-3">
                    <FileCheck2 className="size-7 text-emerald-600" /> البيانات المستخرجة بنجاح
                  </h3>
                  <p className="text-sm text-stone-500 mt-1">راجع البيانات وتأكد من صحتها قبل الحفظ</p>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button onClick={() => setExtractMode('portal')}
                    className="bg-white border-2 border-stone-200 hover:border-emerald-400 text-stone-700 px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2">
                    <Plus className="size-4" /> إضافة بيانات من تبويبة أخرى
                  </button>
                  <button onClick={handleSave}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow">
                    <DownloadCloud className="size-5" /> حفظ الملف في القاعدة
                  </button>
                  <button onClick={handleReset} className="text-xs text-stone-400 hover:text-red-500 underline text-center">إلغاء ومسح</button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {[
                  { label: 'رقم محاكم الشامل', value: result.mahakimId, highlight: true, mono: true },
                  { label: 'الرقم الوطني', value: result.nationalId, mono: true },
                  { label: 'المحكمة', value: result.court },
                  { label: 'تاريخ التسجيل', value: result.date, mono: true },
                  { label: 'نوع القضية', value: result.type },
                  { label: 'الشعبة', value: result.section },
                  { label: 'القاضي / المستشار', value: result.judge },
                  { label: 'الوضعية / آخر حكم', value: result.status },
                  { label: 'الموضوع', value: result.subject },
                ].map((f, i) => (
                  <div key={i} className={`p-4 rounded-2xl border ${f.highlight ? 'border-emerald-200 bg-emerald-50' : 'border-stone-200 bg-white shadow-sm'}`}>
                    <span className="text-[10px] font-bold text-stone-500 block mb-1">{f.label}</span>
                    <span className={`text-sm ${f.mono ? 'font-mono text-stone-700' : 'font-bold text-stone-800'} ${f.highlight ? 'text-emerald-900 font-black text-base' : ''}`}>{f.value}</span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                <div>
                  <h4 className="font-bold text-stone-800 border-b border-stone-200 pb-3 mb-4 flex items-center gap-2 text-base">
                    <User className="size-5 text-emerald-600" /> الأطراف ({result.parties.length})
                  </h4>
                  <div className="bg-stone-50 border border-stone-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm text-right">
                      <thead className="bg-stone-100 text-stone-500 font-bold border-b border-stone-200">
                        <tr><th className="px-4 py-3 w-1/3">الصفة</th><th className="px-4 py-3">الاسم</th></tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {result.parties.map((p, i) => (
                          <tr key={i}>
                            <td className="px-4 py-3"><span className="bg-white border border-stone-200 px-2 py-1 rounded-lg text-xs font-bold shadow-sm">{p.role}</span></td>
                            <td className="px-4 py-3 font-bold text-stone-800">{p.name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-stone-800 border-b border-stone-200 pb-3 mb-4 flex items-center gap-2 text-base">
                    <Activity className="size-5 text-emerald-600" /> الإجراءات ({result.procedures.length})
                  </h4>
                  {result.procedures.length > 0 ? (
                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                      {result.procedures.map((proc, i) => (
                        <div key={i} className="bg-white border border-stone-200 rounded-xl p-4 hover:border-emerald-200 transition-colors">
                          <p className="font-mono text-xs text-stone-400 mb-1">{proc.date}</p>
                          <p className="font-bold text-stone-800 text-sm">{proc.action}</p>
                          {proc.decision && proc.decision !== '-' && (
                            <p className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg mt-2 flex items-center gap-1.5">
                              <Gavel className="size-3" /> {proc.decision}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-stone-50 border border-stone-100 rounded-2xl p-8 text-center text-stone-400 text-sm font-bold">
                      لم يتم العثور على إجراءات
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultField({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex flex-col gap-1.5 p-4 rounded-xl border ${highlight ? 'border-emerald-200 bg-emerald-50' : 'border-stone-200 bg-white'}`}>
      <span className="text-xs font-bold text-stone-500">{label}</span>
      <span className={`text-sm ${mono ? 'font-mono text-stone-600' : 'font-bold text-stone-800'} ${highlight ? 'text-emerald-900 font-black text-base' : ''}`}>{value}</span>
    </div>
  );
}