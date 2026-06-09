import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search, Filter, Plus, FileText, CheckCircle2, Clock, AlertCircle,
  ChevronLeft, Scale, Shield, User, FilePlus2, Activity, Landmark,
  AlertTriangle, DownloadCloud, ClipboardPaste, Lock, MousePointerClick,
  Trash2, Download, Printer, PieChartIcon, Gavel, FileCheck2, Check,
  FileSpreadsheet, Database, RefreshCw, X, Eye, Sparkles
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { CaseWizard } from './components/CaseWizard';
import { ContentieuxStats } from './components/ContentieuxStats';
import { loadCases, saveCase, deleteCase, deleteCases } from '@/lib/contentieux';

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

/** Single case → ONE sheet with all data laid out vertically */
export function exportSingleCaseXLSX(c: Case) {
  const wb = XLSX.utils.book_new();
  const rows: (string | number)[][] = [];

  const sep = () => rows.push(['']);
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
    const sorted = [...c.procedures].sort((a, b) => {
      const p = (d: string) => {
        if (d.match(/\d{2}\/\d{2}\/\d{4}/)) { const [dd, mm, yy] = d.split('/'); return new Date(`${yy}-${mm}-${dd}`).getTime(); }
        return new Date(d).getTime() || 0;
      };
      return p(b.date) - p(a.date);
    });
    sorted.forEach(proc => rows.push([proc.date, proc.action, proc.decision, (proc as any).number || '']));
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

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 28 }, { wch: 38 }, { wch: 28 }, { wch: 38 }];
  XLSX.utils.book_append_sheet(wb, ws, 'بطاقة الملف الكاملة');
  XLSX.writeFile(wb, `ملف_${(c.mahakimId || c.id).replace(/\//g, '-')}.xlsx`);
}

/** All cases → ONE wide flat sheet, one row per case */
export function exportAllCasesXLSX(cases: Case[]) {
  const wb = XLSX.utils.book_new();

  const headers = [
    'المرجع الداخلي', 'رقم محاكم', 'الرقم الوطني للملف',
    'المحكمة', 'درجة المحكمة', 'الشعبة', 'القاضي المقرر',
    'تاريخ التسجيل', 'نوع الدعوى', 'موضوع النزاع',
    'الوضعية', 'الجلسة القادمة', 'الخصم',
    'الأطراف (ملخص)',
    'عدد الإجراءات', 'آخر تاريخ إجراء', 'القرار الأخير',
    'رقم المحضر', 'تاريخ المحضر', 'نوع الجنحة', 'مآل المحضر',
    'الغرامة (د.م)', 'التعويضات (د.م)', 'الإرجاع',
    'صلح', 'حالة التنفيذ', 'طريقة التبليغ', 'تاريخ التبليغ',
    'تاريخ التنفيذ', 'المبالغ المستخلصة (د.م)', 'عائق التنفيذ',
  ];

  const data = cases.map(c => {
    const sortedProcs = [...(c.procedures || [])].sort((a, b) => {
      const p = (d: string) => {
        if (d.match(/\d{2}\/\d{2}\/\d{4}/)) { const [dd, mm, yy] = d.split('/'); return new Date(`${yy}-${mm}-${dd}`).getTime(); }
        return new Date(d).getTime() || 0;
      };
      return p(b.date) - p(a.date);
    });
    const lastProc = sortedProcs[0];
    const partiesSummary = (c.parties || []).map(p => `${p.role}: ${p.name}`).join(' | ') || c.defendant || '';

    return [
      c.id, c.mahakimId || '', c.nationalId || '',
      c.court, c.courtLevel || '', c.section || '', c.judge || '',
      c.date, c.type, c.subject,
      c.status, c.nextSession || '', c.defendant || '',
      partiesSummary,
      (c.procedures || []).length, lastProc?.date || '', lastProc?.decision || '',
      c.pvNumber || '', c.pvDate || '', c.offenseType || '', c.pvStatus || '',
      c.fine ? Number(c.fine) : '', c.compensation ? Number(c.compensation) : '', c.restitution || '',
      c.reconciliation ? 'نعم' : '', c.executionStatus || '', c.notificationMethod || '', c.notificationDate || '',
      c.executionDate || '', c.executionAmountRecovered ? Number(c.executionAmountRecovered) : '', c.executionObstacle || '',
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  ws['!cols'] = headers.map((h, i) => ({
    wch: [18, 18, 20, 28, 14, 16, 22, 14, 12, 30, 22, 14, 20, 40, 8, 14, 30, 14, 14, 25, 18, 12, 12, 20, 6, 18, 20, 14, 14, 18, 35][i] || 18
  }));
  XLSX.utils.book_append_sheet(wb, ws, 'قاعدة بيانات القضايا');
  XLSX.writeFile(wb, `قاعدة_بيانات_القضايا_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.xlsx`);
}

// ─── Smart Parser ─────────────────────────────────────────────────────────────

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
  const findSection = (re: RegExp, dataMarker: RegExp): number => {
    const idxs = allIdx(re);
    if (idxs.length === 0) return -1;
    for (const i of idxs) {
      if (dataMarker.test(clean.substring(i, i + 2000))) return i;
    }
    return idxs[0];
  };

  const procIdx   = findSection(/لائحة الإجراءات/, /\d{2}\/\d{2}\/\d{4}/);
  const partIdx   = findSection(/لائحة الأطراف/, /مدعي|مدعى عليه|متهم|مستأنف|طالب|اسم الطرف/);
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
    tabRows.forEach(row => {
      const parts = row.split('\t').map(s => s.trim());
      const dm = parts[0].match(/(\d{2}\/\d{2}\/\d{4})/);
      if (dm && parts[1]) procedures.push({ date: dm[1], action: parts[1], decision: parts[2] || '' });
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

function CaseDetail({ caseData, onBack, onDelete, onEdit }: {
  caseData: Case; onBack: () => void; onDelete: (id: string) => void; onEdit: () => void;
}) {
  const prescDate = useMemo(() => {
    if (!caseData.pvDate) return null;
    try {
      const d = new Date(caseData.pvDate);
      if (isNaN(d.getTime())) return null;
      d.setMonth(d.getMonth() + 6);
      return d.toISOString().split('T')[0];
    } catch { return null; }
  }, [caseData.pvDate]);

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl shadow-sm border border-stone-200">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={onBack}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl transition-all shadow hover:-translate-y-0.5 text-sm">
            <ChevronLeft className="size-4" /> رجوع للقائمة
          </button>
          <div className="border-r-2 border-stone-200 pr-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Scale className="size-5 text-emerald-600" />
              ملف: <span className="font-mono text-emerald-700">{caseData.mahakimId || caseData.id}</span>
            </h2>
            {caseData.mahakimId && <p className="text-xs text-stone-400 font-mono mt-0.5">مرجع: {caseData.id}</p>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => exportSingleCaseXLSX(caseData)}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg font-bold text-sm border border-emerald-200">
            <FileSpreadsheet className="size-4" /> تحميل Excel
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
              caseData.nationalId ? { l: 'الرقم الوطني', v: caseData.nationalId, m: true } : null,
            ].filter(Boolean).map((item: any, idx) => (
              <div key={idx}>
                <label className="text-xs text-stone-500">{item.l}</label>
                <p className={`font-bold text-sm text-stone-800 ${item.m ? 'font-mono' : ''}`}>{item.v}</p>
              </div>
            ))}
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
                  {prescDate && <p className="text-xs font-bold text-orange-600 flex items-center gap-1 mt-1"><AlertCircle className="size-3" /> التقادم (6 أشهر): {prescDate}</p>}
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  const uniqueTypes = useMemo(() => Array.from(new Set(cases.map(c => c.type).filter(Boolean))), [cases]);
  const uniqueCourts = useMemo(() => Array.from(new Set(cases.map(c => c.court).filter(Boolean))), [cases]);
  const uniqueYears = useMemo(() => Array.from(new Set(cases.map(c => c.date?.substring(0, 4)).filter(Boolean))).sort((a, b) => Number(b) - Number(a)), [cases]);

  const processedCases = useMemo(() => {
    let r = [...cases];
    if (statusFilter === 'active') r = r.filter(c => !c.status.includes('حكم') && !c.status.includes('قرار'));
    if (statusFilter === 'judged') r = r.filter(c => c.status.includes('حكم') || c.status.includes('قرار'));
    if (typeFilter !== 'all') r = r.filter(c => c.type === typeFilter);
    if (courtFilter !== 'all') r = r.filter(c => c.court === courtFilter);
    if (yearFilter !== 'all') r = r.filter(c => c.date?.startsWith(yearFilter));
    if (searchQuery.trim()) r = r.filter(c => fuzzyMatchCase(c, searchQuery));
    if (sortConfig) {
      r.sort((a, b) => {
        const av: any = sortConfig.key === 'ref' ? (a.mahakimId || a.id) : (a as any)[sortConfig.key] ?? '';
        const bv: any = sortConfig.key === 'ref' ? (b.mahakimId || b.id) : (b as any)[sortConfig.key] ?? '';
        return av < bv ? (sortConfig.dir === 'asc' ? -1 : 1) : av > bv ? (sortConfig.dir === 'asc' ? 1 : -1) : 0;
      });
    }
    return r;
  }, [cases, searchQuery, sortConfig, statusFilter, typeFilter, courtFilter, yearFilter]);

  const handleSort = (k: string) => setSortConfig(p => ({ key: k, dir: p?.key === k && p.dir === 'asc' ? 'desc' : 'asc' }));

  const handleSaveCase = async (saved: Case) => {
    await saveCase(saved);
    setCases(prev => { const e = prev.find(c => c.id === saved.id); return e ? prev.map(c => c.id === saved.id ? saved : c) : [saved, ...prev]; });
    if (selectedCase?.id === saved.id) setSelectedCase(saved);
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

  const SortTh = ({ l, k }: { l: string; k: string }) => (
    <th className="px-4 py-4 font-bold cursor-pointer hover:bg-stone-100 transition-colors select-none whitespace-nowrap" onClick={() => handleSort(k)}>
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
          <button onClick={() => setIsStatsOpen(true)} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm hover:-translate-y-0.5 transition-all">
            <PieChartIcon className="size-4" /> الإحصائيات
          </button>
          <button onClick={() => { setWizardData(null); setIsWizardOpen(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-sm hover:-translate-y-0.5 transition-all">
            <FilePlus2 className="size-4" /> إضافة ملف
          </button>
        </div>
      </div>

      {isStatsOpen && <ContentieuxStats cases={cases} onClose={() => setIsStatsOpen(false)} />}

      {activeTab === 'local' ? (
        selectedCase ? (
          <CaseDetail caseData={selectedCase} onBack={() => setSelectedCase(null)} onDelete={handleDeleteCase}
            onEdit={() => { setWizardData(selectedCase); setIsWizardOpen(true); }} />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'إجمالي القضايا', value: cases.length, icon: Scale, c: 'emerald' },
                { label: 'قيد الرائجة', value: cases.filter(c => !c.status.includes('حكم') && !c.status.includes('قرار')).length, icon: Search, c: 'blue' },
                { label: 'أحكام صادرة', value: cases.filter(c => c.status.includes('حكم') || c.status.includes('قرار')).length, icon: Gavel, c: 'orange' },
                { label: 'أحكام منفذة', value: cases.filter(c => c.executionStatus?.includes('منفذ')).length, icon: CheckCircle2, c: 'emerald' },
              ].map((s, i) => (
                <div key={i} className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center justify-between">
                  <div><p className="text-xs font-bold text-stone-500 mb-1">{s.label}</p><h3 className={`text-2xl font-black text-${s.c}-700`}>{s.value}</h3></div>
                  <div className={`p-3 bg-${s.c}-50 text-${s.c}-600 rounded-xl`}><s.icon className="size-6" /></div>
                </div>
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

            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-stone-200 bg-stone-50 space-y-3">
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="relative flex-1">
                    <input type="text" placeholder="بحث ذكي: رقم ملف، موضوع، محكمة، خصم، إجراء... (يتحمل أخطاء الكتابة)"
                      className="w-full bg-white border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                      value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                    <Search className="size-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"><X className="size-4" /></button>}
                  </div>
                  <div className="flex gap-2 flex-wrap shrink-0">
                    <button onClick={() => setShowAdvanced(!showAdvanced)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold border transition-colors ${showAdvanced ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'}`}>
                      <Filter className="size-4" /> فلاتر
                    </button>
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
                    <button onClick={() => exportAllCasesXLSX(processedCases)}
                      className="flex items-center gap-2 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-sm">
                      <Database className="size-4" /> Excel الكل
                    </button>
                    <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-2.5 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm hover:bg-stone-50">
                      <Printer className="size-4" />
                    </button>
                  </div>
                </div>
                {showAdvanced && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-stone-200 animate-in slide-in-from-top-2">
                    {[
                      { label: 'نوع الملف', val: typeFilter, set: setTypeFilter, opts: uniqueTypes },
                      { label: 'المحكمة', val: courtFilter, set: setCourtFilter, opts: uniqueCourts },
                      { label: 'سنة التسجيل', val: yearFilter, set: setYearFilter, opts: uniqueYears },
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
                  </div>
                )}
              </div>

              {isLoading ? (
                <div className="py-16 text-center text-stone-400"><RefreshCw className="size-8 mx-auto mb-3 animate-spin text-stone-300" /><p className="text-sm">جاري التحميل...</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-right">
                    <thead className="bg-stone-50 text-stone-500 border-b border-stone-200">
                      <tr>
                        <th className="px-3 py-3.5 w-10">
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
                        <th className="px-3 py-3.5 font-bold">أدوات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {processedCases.map(c => (
                        <tr key={c.id} onClick={() => setSelectedCase(c)}
                          className={`hover:bg-emerald-50/50 transition-colors cursor-pointer group ${selectedIds.has(c.id) ? 'bg-emerald-50/30' : ''}`}>
                          <td className="px-3 py-3.5" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" className="rounded border-stone-300 text-emerald-600 w-4 h-4 cursor-pointer"
                              checked={selectedIds.has(c.id)}
                              onChange={() => setSelectedIds(prev => { const s = new Set(prev); s.has(c.id) ? s.delete(c.id) : s.add(c.id); return s; })} />
                          </td>
                          {/* رقم الملف في المحكمة */}
                          <td className="px-3 py-3.5">
                            {c.mahakimId
                              ? <span className="font-mono font-black text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg text-xs">{c.mahakimId}</span>
                              : <span className="font-mono text-stone-400 text-xs italic">غير مسجل</span>}
                          </td>
                          {/* المحكمة + الشعبة */}
                          <td className="px-3 py-3.5 max-w-[180px]">
                            <p className="font-bold text-stone-800 text-xs leading-snug truncate">{c.court}</p>
                            {c.section && <p className="text-[10px] text-emerald-600 font-bold mt-0.5">{c.section}</p>}
                          </td>
                          {/* تاريخ التسجيل */}
                          <td className="px-3 py-3.5 font-mono text-xs text-stone-500 whitespace-nowrap">{c.date}</td>
                          {/* الموضوع + النوع */}
                          <td className="px-3 py-3.5 max-w-[200px]">
                            <p className="font-bold text-stone-800 text-sm leading-snug truncate">
                              {c.subject && c.subject !== 'غير محدد' ? c.subject : '—'}
                            </p>
                            <p className="text-[10px] text-stone-400 mt-0.5 font-medium">{c.type || ''}</p>
                          </td>
                          {/* الخصم / المدعى عليه */}
                          <td className="px-3 py-3.5 max-w-[160px]">
                            <p className="text-xs font-bold text-stone-700 truncate">
                              {c.defendant || c.parties?.find(p => p.role.includes('عليه') || p.role.includes('متهم') || p.role.includes('مطلوب'))?.name || '—'}
                            </p>
                          </td>
                          {/* الوضعية */}
                          <td className="px-3 py-3.5">{badge(c.status)}</td>
                          {/* آخر إجراء / حكم */}
                          <td className="px-3 py-3.5 max-w-[180px]">
                            {(() => {
                              const lastProc = [...(c.procedures || [])].sort((a, b) => {
                                const p = (d: string) => { if (d.match(/\d{2}\/\d{2}\/\d{4}/)) { const [dd, mm, yy] = d.split('/'); return new Date(`${yy}-${mm}-${dd}`).getTime(); } return new Date(d).getTime() || 0; };
                                return p(b.date) - p(a.date);
                              })[0];
                              if (!lastProc && !c.nextSession) return <span className="text-stone-300 text-xs">—</span>;
                              return (
                                <div>
                                  <p className="font-mono font-bold text-emerald-700 text-xs whitespace-nowrap">
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
                          {/* أدوات */}
                          <td className="px-3 py-3.5" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setSelectedCase(c)} title="فتح الملف" className="p-1.5 bg-white text-stone-500 hover:text-emerald-700 hover:bg-emerald-50 border border-stone-200 rounded-lg"><Eye className="size-3.5" /></button>
                              <button onClick={() => exportSingleCaseXLSX(c)} title="Excel" className="p-1.5 bg-white text-stone-500 hover:text-emerald-700 hover:bg-emerald-50 border border-stone-200 rounded-lg"><FileSpreadsheet className="size-3.5" /></button>
                              <button onClick={() => { setWizardData(c); setIsWizardOpen(true); }} title="تعديل" className="p-1.5 bg-white text-stone-500 hover:text-blue-700 hover:bg-blue-50 border border-stone-200 rounded-lg"><Activity className="size-3.5" /></button>
                              <button onClick={() => { if (window.confirm('حذف الملف؟')) handleDeleteCase(c.id); }} title="حذف" className="p-1.5 bg-white text-stone-500 hover:text-red-600 hover:bg-red-50 border border-stone-200 rounded-lg"><Trash2 className="size-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {processedCases.length === 0 && (
                        <tr><td colSpan={9} className="px-6 py-14 text-center">
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
        )
      ) : (
        <div className="flex-1 flex flex-col min-h-[700px]">
          <MahakimIntegration onSave={handleSaveCase} />
        </div>
      )}

      {isWizardOpen && (
        <CaseWizard initialData={wizardData || undefined} onSave={handleSaveCase}
          onCancel={() => { setIsWizardOpen(false); setWizardData(null); }} />
      )}
    </div>
  );
}

// ─── Stable iframe (never re-renders) ─────────────────────────────────────────

const PortalIframe = React.memo(
  React.forwardRef<HTMLIFrameElement>((_, ref) => (
    <iframe
      ref={ref}
      src="https://www.mahakim.ma/#/suivi/dossier-suivi"
      title="Mahakim.ma"
      className="w-full h-full border-0 absolute inset-0 pt-9 bg-white"
      sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
    />
  )),
  () => true
);

// ─── MahakimIntegration ───────────────────────────────────────────────────────

function MahakimIntegration({ onSave }: { onSave: (c: Case) => void }) {
  const [pasteData, setPasteData] = useState('');
  const [result, setResult] = useState<ReturnType<typeof performParsing> | null>(null);
  const [extractMode, setExtractMode] = useState<'portal' | 'parsed'>('portal');
  const [focusHint, setFocusHint] = useState(false);
  const pasteCount = useRef(0);
  const pasteDataRef = useRef('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ── VB.NET Bridge ──────────────────────────────────────────
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

  // ── Focus portal (help user go straight to Ctrl+A without extra click) ──
  const handleFocusPortal = () => {
    if (iframeRef.current) {
      try { iframeRef.current.focus(); } catch {}
    }
    setFocusHint(true);
    setTimeout(() => setFocusHint(false), 5000);
  };

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
    };
    onSave(newCase);
    handleReset();
  };


  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm flex flex-col min-h-[700px] overflow-hidden" dir="rtl">
      <div className="p-4 bg-emerald-900 flex justify-between items-center text-emerald-50 shrink-0 shadow-md">
        <div>
          <h2 className="font-bold text-lg flex items-center gap-2"><Landmark className="size-5 text-emerald-300" /> تكامل مع بوابة محاكم</h2>
          <p className="text-xs text-emerald-400 mt-0.5">انسخ الصفحة كاملة (Ctrl+A → Ctrl+C) ثم اضغط الزر — كرر لكل تبويبة</p>
        </div>
        {result && (
          <div className="flex gap-2">
            <button onClick={() => setExtractMode(extractMode === 'portal' ? 'parsed' : 'portal')}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-bold rounded-lg text-xs">
              <Eye className="size-4" /> {extractMode === 'portal' ? 'عرض النتائج' : 'رجوع للبوابة'}
            </button>
            <button onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-lg text-sm shadow">
              <DownloadCloud className="size-4" /> حفظ في القاعدة
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* ── Left panel ── */}
        <div className="w-full md:w-[420px] border-b md:border-b-0 md:border-l border-stone-200 bg-stone-50 p-5 flex flex-col gap-4 overflow-y-auto shrink-0">
          <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl">
            <h3 className="text-orange-900 font-bold text-sm flex items-center gap-2 mb-2"><AlertTriangle className="size-4" /> حماية CORS</h3>
            <p className="text-[11px] text-orange-800 leading-relaxed">لا يمكن استخراج البيانات برمجياً. انسخ يدوياً من البوابة كما هو موضح.</p>
          </div>

          <div className="space-y-4 relative before:absolute before:right-[15px] before:top-2 before:bottom-6 before:w-px before:bg-emerald-200">
            {[
              { n: 1, title: 'ابحث عن الملف', desc: 'ابحث داخل البوابة بالرقم والمحكمة حتى تظهر بيانات الملف.', extra: null },
              {
                n: 2, title: 'انسخ محتوى الصفحة', desc: '', extra: (
                  <div className="mt-2 space-y-2">
                    <button onClick={handleFocusPortal}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition-all">
                      🎯 ركّز على البوابة (ثم Ctrl+A → Ctrl+C)
                    </button>
                    {focusHint && (
                      <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-xs font-bold text-blue-800 animate-in slide-in-from-top-2">
                        ✓ البوابة جاهزة — الآن اضغط
                        <kbd className="bg-white border border-blue-300 px-1.5 py-0.5 rounded font-mono mx-1">Ctrl+A</kbd>
                        ثم
                        <kbd className="bg-white border border-blue-300 px-1.5 py-0.5 rounded font-mono mx-1">Ctrl+C</kbd>
                        ثم
                        <kbd className="bg-white border border-blue-300 px-1.5 py-0.5 rounded font-mono mx-1">Ctrl+V</kbd>
                        هنا أو في أي مكان على الصفحة
                      </div>
                    )}
                    <p className="text-[10px] text-stone-500 leading-relaxed">انقر زر التركيز، ثم Ctrl+A لتحديد الكل في البوابة، ثم Ctrl+C للنسخ. كرر لكل تبويبة (الإجراءات، الأطراف...).</p>
                  </div>
                )
              },
              {
                n: 3, title: 'الصق تلقائياً', desc: '', extra: (
                  <div className="mt-2 space-y-2">
                    <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-xs font-bold text-emerald-800">
                      ⚡ الصق
                      <kbd className="bg-white border border-emerald-300 px-1.5 py-0.5 rounded font-mono mx-1">Ctrl+V</kbd>
                      في أي مكان على هذه الصفحة → يُعالَج تلقائياً
                    </div>
                    <button onClick={handleReadClipboard}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-sm transition-all hover:shadow flex items-center justify-center gap-2">
                      <ClipboardPaste className="size-5" />
                      {pasteData.trim() ? `إضافة لصقة أخرى (${pasteCount.current + 1})` : 'استخراج من الحافظة'}
                    </button>
                    {pasteData.trim() && (
                      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl text-xs font-bold text-emerald-800">
                        <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                        {pasteCount.current} لصقة محفوظة — كرر لكل تبويبة
                      </div>
                    )}
                    <div className="border-t border-stone-200 pt-3">
                      <p className="text-[11px] text-stone-500 mb-1.5 font-bold">أو الصق يدوياً:</p>
                      <textarea
                        value={pasteData}
                        onChange={e => setPasteData(e.target.value)}
                        placeholder="الصق المحتوى هنا... أو اضغط Ctrl+V في أي مكان"
                        className="w-full bg-white border border-stone-200 rounded-lg p-3 text-[10px] font-mono text-stone-600 outline-none resize-none h-24 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      />
                      <div className="flex gap-2 mt-2">
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
                  </div>
                )
              },
            ].map(step => (
              <div key={step.n} className="relative pl-4">
                <div className={`absolute right-0 top-0 size-8 rounded-full font-black border-2 border-white flex items-center justify-center shadow-sm text-sm ${step.n === 3 ? 'bg-emerald-600 text-white' : step.n === 2 ? 'bg-blue-500 text-white' : 'bg-emerald-100 text-emerald-700'}`}>{step.n}</div>
                <div className="mr-12">
                  <h4 className="font-bold text-sm text-stone-800 mb-1">{step.title}</h4>
                  {step.desc && <p className="text-xs text-stone-500">{step.desc}</p>}
                  {(step as any).extra}
                </div>
              </div>
            ))}
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
            {/* Gradient mask covering blue footer */}
            <div className="absolute bottom-0 left-0 right-0 h-[220px] bg-gradient-to-t from-stone-100 via-stone-100/70 to-transparent pointer-events-none z-10" />
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