// src/lib/caseAnalysis.ts
//
// أدوات تحليل ملفات المنازعات:
//   1) محرك الآجال القانونية (استئناف / تعرض / نقض / مصاريف الخبرة / تقادم)
//   2) كشف "العود" — نفس الخصم في عدة ملفات
//   3) فحص جودة البيانات + فك ترميز الرقم الوطني للملف والتحقق من تطابقه
//   4) تصدير أجندة الجلسات والآجال بصيغة iCal (.ics)
//
// ⚠️ تنبيه قانوني: المُدد أدناه مبنية على القواعد العامة الأكثر شيوعاً في
// قانون المسطرة المدنية والمسطرة الجنائية المغربية، وهي للمساعدة التنظيمية
// فقط ولا تُعتبر استشارة قانونية. يُنصح بمراجعتها مع المستشار القانوني
// للوكالة، خصوصاً بشأن العطل الرسمية ومُدد مصاريف الخبرة التي يحددها
// الأمر القضائي نفسه.

import type { Case } from '@/views/Contentieux/Contentieux';

// ══════════════════════════════════════════════════════════════════
// 0) أدوات التواريخ — تقبل صيغتين: يوم/شهر/سنة (صيغة بوابة محاكم) و
//    سنة-شهر-يوم (الصيغة العالمية). ضرورية حتى لا يفشل حساب الآجال بصمت
//    على تواريخ المحاضر/الجلسات القادمة من البوابة (يوم/شهر/سنة).
// ══════════════════════════════════════════════════════════════════

/** يحوّل أي تاريخ (يوم/شهر/سنة أو سنة-شهر-يوم أو ISO) إلى كائن Date محلي، أو null. */
export function parseFlexibleDate(input?: string | null): Date | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  // يوم/شهر/سنة (أو يوم-شهر-سنة) — صيغة البوابة
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) {
    const [, dd, mm, yy] = m;
    const d = new Date(Number(yy), Number(mm) - 1, Number(dd));
    return isNaN(d.getTime()) ? null : d;
  }
  // سنة-شهر-يوم
  m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (m) {
    const [, yy, mm, dd] = m;
    const d = new Date(Number(yy), Number(mm) - 1, Number(dd));
    return isNaN(d.getTime()) ? null : d;
  }
  // سقوط احتياطي: محاولة التحليل القياسي
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** يُنسّق تاريخاً إلى سنة-شهر-يوم بالتوقيت المحلي (يتفادى انزياح يوم بسبب UTC). */
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ══════════════════════════════════════════════════════════════════
// 1) محرك الآجال
// ══════════════════════════════════════════════════════════════════

export interface DeadlineItem {
  /** مفتاح ثابت لتمييز نوع الأجل (للفلترة) */
  key: string;
  /** عنوان الأجل بالعربية */
  label: string;
  /** الأساس القانوني / كيف حُسب */
  basis: string;
  /** تاريخ الانطلاق (المرجع) */
  fromDate: string;
  /** تاريخ الاستحقاق المحسوب (ISO yyyy-mm-dd) */
  dueDate: string;
  /** عدد الأيام المتبقية (سالب = منقضٍ) */
  daysLeft: number;
  /** مستوى الخطورة لعرض اللون */
  severity: 'expired' | 'critical' | 'warning' | 'ok';
}

/** عطل رسمية إضافية (يمكن تعديلها يدوياً) — صيغة yyyy-mm-dd. اتركها فارغة أو أضف عطل الأعياد المتغيرة سنوياً. */
export const CUSTOM_HOLIDAYS: string[] = [
  // أمثلة: عطل ثابتة معروفة (يمكن حذفها أو إضافة غيرها)
  // '2026-01-01', '2026-01-11', '2026-05-01', '2026-07-30', '2026-08-14',
  // '2026-08-20', '2026-08-21', '2026-11-06', '2026-11-18',
];

/**
 * يحسب تاريخ استحقاق أجل قانوني بمراعاة "الأجل الكامل" (délai franc):
 * - يبدأ العدّ من اليوم التالي لتاريخ المرجع (لا يُحسب يوم التبليغ نفسه).
 * - إذا صادف اليوم الأخير عطلة أسبوعية (سبت/أحد) أو عطلة رسمية مُدرجة،
 *   يُمدَّد الأجل لأقرب يوم عمل تالٍ.
 */
export function legalDeadline(fromDateStr: string, days: number): Date | null {
  if (!fromDateStr) return null;
  const base = parseFlexibleDate(fromDateStr);
  if (!base) return null;
  const d = new Date(base);
  d.setDate(d.getDate() + days); // اليوم التالي للمرجع = اليوم 1 من الأجل
  // العطلة الأسبوعية الفعلية بالمحاكم المغربية = السبت(6) والأحد(0)
  const isWeekendOrHoliday = (x: Date) => {
    const iso = toLocalISODate(x);
    return x.getDay() === 6 || x.getDay() === 0 || CUSTOM_HOLIDAYS.includes(iso);
  };
  while (isWeekendOrHoliday(d)) d.setDate(d.getDate() + 1);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  // لا نعدّل الوسائط (نسخ آمنة) — تفادياً لإفساد تواريخ مشتركة.
  const aa = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bb = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((aa - bb) / 86400000);
}

function severityFor(daysLeft: number): DeadlineItem['severity'] {
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 3) return 'critical';
  if (daysLeft <= 10) return 'warning';
  return 'ok';
}

const CIVIL_LIKE = new Set(['مدنية', 'مدني', 'عقارية', 'تجارية', 'إدارية', 'استعجالية']);

/**
 * يبني لائحة الآجال السارية لملف معيّن استناداً إلى:
 * - تاريخ التبليغ (notificationDate) — الآجال تسري منه لا من تاريخ الحكم.
 * - تاريخ الأمر بأداء مصاريف الخبرة (expertFeeOrderDate) إن وُجد ولم تُؤدَّ.
 * - تاريخ المحضر (pvDate) لأجل التقادم في الجنح الغابوية.
 *
 * لا تُعرض الآجال التي تجاوز موعدها أكثر من 30 يوماً (تُعتبر منقضية/غير ذات أثر)
 * إلا إذا أراد المستخدم رؤية كل شيء — هذا التصفية تتم في واجهة العرض.
 */
export function computeDeadlines(c: Case): DeadlineItem[] {
  const items: DeadlineItem[] = [];
  const today = new Date();
  const isJudged = /حكم|قرار|صدر/.test(c.status || '');

  // ── استئناف / تعرض / نقض — تسري من تاريخ التبليغ ──
  if (c.notificationDate && isJudged) {
    const isAppealCourt = /استئناف|نقض/.test(c.court || '');
    const isCassationLevel = /نقض/.test(c.court || '') || /استئناف/.test(c.court || '');

    if (CIVIL_LIKE.has(c.type) || c.type === 'مدنية') {
      // استئناف الأحكام الابتدائية المدنية: 30 يوماً من التبليغ
      if (!isAppealCourt) {
        const due = legalDeadline(c.notificationDate, 30);
        if (due) {
          const dl = daysBetween(new Date(due), new Date(today));
          items.push({
            key: 'appeal_civil', label: 'أجل الاستئناف (مدني)',
            basis: 'م. 134 ق.م.م — 30 يوماً من تاريخ التبليغ',
            fromDate: c.notificationDate, dueDate: toLocalISODate(due),
            daysLeft: dl, severity: severityFor(dl),
          });
        }
      }
      // النقض: 30 يوماً من تبليغ القرار الاستئنافي
      if (isAppealCourt && !/نقض/.test(c.court || '')) {
        const due = legalDeadline(c.notificationDate, 30);
        if (due) {
          const dl = daysBetween(new Date(due), new Date(today));
          items.push({
            key: 'cassation', label: 'أجل النقض',
            basis: 'م. 358 ق.م.م — 30 يوماً من تبليغ القرار الاستئنافي',
            fromDate: c.notificationDate, dueDate: toLocalISODate(due),
            daysLeft: dl, severity: severityFor(dl),
          });
        }
      }
      void isCassationLevel;
    }

    // التعرض على الأحكام الغيابية: 10 أيام من التبليغ
    if (/غياب/.test(c.status || '') || /غياب/.test(c.executionObstacle || '')) {
      const due = legalDeadline(c.notificationDate, 10);
      if (due) {
        const dl = daysBetween(new Date(due), new Date(today));
        items.push({
          key: 'opposition', label: 'أجل التعرض',
          basis: 'م. 130 ق.م.م — 10 أيام من التبليغ (حكم غيابي)',
          fromDate: c.notificationDate, dueDate: toLocalISODate(due),
          daysLeft: dl, severity: severityFor(dl),
        });
      }
    }

    // استئناف الأحكام الجنحية الغابوية: 10 أيام (يحتاج تأكيد حسب نوع المخالفة)
    if (c.type === 'جنحية' || c.type === 'جنحي') {
      const due = legalDeadline(c.notificationDate, 10);
      if (due) {
        const dl = daysBetween(new Date(due), new Date(today));
        items.push({
          key: 'appeal_criminal', label: 'أجل الاستئناف (جنحي)',
          basis: 'ق.م.ج — 10 أيام من التبليغ (تحقق من النص حسب نوع المخالفة)',
          fromDate: c.notificationDate, dueDate: toLocalISODate(due),
          daysLeft: dl, severity: severityFor(dl),
        });
      }
    }
  }

  // ── مصاريف الخبرة: من تاريخ الأمر بأدائها ──
  if (c.expertFeeOrderDate && !c.expertFeePaid) {
    const days = Number(c.expertFeeDeadlineDays) > 0 ? Number(c.expertFeeDeadlineDays) : 8;
    const due = legalDeadline(c.expertFeeOrderDate, days);
    if (due) {
      const dl = daysBetween(new Date(due), new Date(today));
      items.push({
        key: 'expert_fee', label: 'أداء مصاريف الخبرة',
        basis: `${days} يوماً من تاريخ الأمر — إسقاط الحق عند عدم الأداء`,
        fromDate: c.expertFeeOrderDate, dueDate: toLocalISODate(due),
        daysLeft: dl, severity: severityFor(dl),
      });
    }
  }

  // ── التقادم في الجنح الغابوية: 6 أشهر من تاريخ المحضر ──
  if (c.pvDate && !c.reconciliation && c.pvStatus !== 'حفظ / تقادم') {
    const base = parseFlexibleDate(c.pvDate);
    if (base) {
      const due = new Date(base);
      due.setMonth(due.getMonth() + 6);
      const dl = daysBetween(new Date(due), new Date(today));
      items.push({
        key: 'prescription', label: 'تقادم المتابعة (محضر المخالفة)',
        basis: 'تقادم الجنح الغابوية — 6 أشهر من تاريخ المحضر',
        fromDate: c.pvDate, dueDate: toLocalISODate(due),
        daysLeft: dl, severity: severityFor(dl),
      });
    }
  }

  return items.sort((a, b) => a.daysLeft - b.daysLeft);
}

/** أقرب أجل (الأكثر إلحاحاً) لملف، أو null إن لم توجد آجال */
export function nearestDeadline(c: Case): DeadlineItem | null {
  const all = computeDeadlines(c).filter(d => d.severity !== 'expired' || d.daysLeft >= -30);
  return all[0] || null;
}

/** عدد الآجال "الحرجة" (≤ 7 أيام ولم تنقضِ) عبر كل الملفات — لشارة القائمة الجانبية */
export function getCriticalDeadlinesCount(cases: Case[], thresholdDays = 7): number {
  let n = 0;
  for (const c of cases) {
    for (const d of computeDeadlines(c)) {
      if (d.daysLeft >= 0 && d.daysLeft <= thresholdDays) n++;
    }
  }
  return n;
}

// ══════════════════════════════════════════════════════════════════
// 2) كشف "العود" — نفس الخصم في عدة ملفات
// ══════════════════════════════════════════════════════════════════

const normName = (s: string) =>
  (s || '')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[يى]/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();

/** كل الأسماء التي تُعتبر "خصماً" في ملف (المدعى عليه / المتهم / المطلوب...) */
export function defendantNames(c: Case): string[] {
  const names = new Set<string>();
  if (c.defendant) names.add(c.defendant);
  for (const p of c.parties || []) {
    if (/مدعى عليه|متهم|مطلوب|مستأنف عليه/.test(p.role)) names.add(p.name);
  }
  return Array.from(names).filter(n => n && n !== 'مجهول' && !n.includes('غير محدد'));
}

/**
 * يبني خريطة: اسم الخصم المُطبَّع → كل الملفات التي يظهر فيها كخصم.
 * يُستخدم لعرض "هذا الخصم له N ملفات أخرى" — كشف المخالفين المعتادين.
 */
export function buildRepeatOffenderIndex(cases: Case[]): Map<string, Case[]> {
  const idx = new Map<string, Case[]>();
  for (const c of cases) {
    for (const raw of defendantNames(c)) {
      const key = normName(raw);
      if (!key) continue;
      if (!idx.has(key)) idx.set(key, []);
      idx.get(key)!.push(c);
    }
  }
  return idx;
}

/** الملفات الأخرى لنفس خصم(ـي) الملف المحدد (باستثناء الملف نفسه) */
export function relatedCasesBySameDefendant(c: Case, cases: Case[]): Case[] {
  const names = defendantNames(c).map(normName);
  if (names.length === 0) return [];
  const seen = new Set<string>();
  const out: Case[] = [];
  for (const other of cases) {
    if (other.id === c.id) continue;
    const otherNames = defendantNames(other).map(normName);
    if (otherNames.some(n => names.includes(n)) && !seen.has(other.id)) {
      seen.add(other.id);
      out.push(other);
    }
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════
// 3) فحص جودة البيانات + فك ترميز الرقم الوطني
// ══════════════════════════════════════════════════════════════════

export interface DecodedNationalId {
  courtCode: string;
  year: string;
  symbol: string;
  number: string;
  /** رقم محاكم المُعاد بناؤه من الرقم الوطني (سنة/رمز/رقم) */
  rebuiltMahakimId: string;
  /** هل يطابق mahakimId المسجَّل في الملف؟ (null إن لم يوجد mahakimId للمقارنة) */
  matches: boolean | null;
}

/**
 * يفكّ ترميز الرقم الوطني للملف (14 رقماً): رمز المحكمة (3) + السنة (4) +
 * رمز نوع الملف (4) + الرقم التسلسلي (3) — مثال: 26220241101221
 *  → 262 | 2024 | 1101 | 221  →  2024/1101/221
 */
export function decodeNationalId(c: Case): DecodedNationalId | null {
  const nid = (c.nationalId || '').replace(/\D/g, '');
  if (nid.length !== 14) return null;
  const courtCode = nid.slice(0, 3);
  const year = nid.slice(3, 7);
  const symbol = nid.slice(7, 11);
  const number = String(parseInt(nid.slice(11, 14), 10));
  const rebuiltMahakimId = `${year}/${symbol}/${number}`;
  const mid = (c.mahakimId || '').trim();
  const matches = mid && mid !== '-'
    ? mid.replace(/\s/g, '') === rebuiltMahakimId.replace(/\s/g, '')
    : null;
  return { courtCode, year, symbol, number, rebuiltMahakimId, matches };
}

/** لائحة ملاحظات الجودة لملف — تُستخدم لشارة "يحتاج تدقيق" */
export function getQualityFlags(c: Case): string[] {
  const flags: string[] = [];
  if (!c.subject || c.subject === 'غير محدد') flags.push('موضوع النزاع غير محدد');
  if (!c.court || /غير محدد/.test(c.court)) flags.push('المحكمة غير محددة');
  if (!c.mahakimId || c.mahakimId === '-') flags.push('رقم الملف بالمحكمة غير مسجَّل');
  if (!c.defendant || c.defendant === 'مجهول') flags.push('الخصم/المدعى عليه غير محدد');

  const decoded = decodeNationalId(c);
  if (decoded && decoded.matches === false) {
    flags.push(`الرقم الوطني لا يطابق رقم محاكم (المتوقع ${decoded.rebuiltMahakimId})`);
  }

  const isJudged = /حكم|قرار|صدر/.test(c.status || '');
  if (isJudged && !c.notificationDate) {
    flags.push('صدر حكم/قرار ولم يُسجَّل تاريخ التبليغ — لا يمكن حساب آجال الطعن');
  }
  if (c.executionStatus?.includes('منفذ كليا') && !c.executionDate) {
    flags.push('الملف "منفذ كلياً" بدون تاريخ تنفيذ');
  }
  return flags;
}

/** هل الملف يحتاج تدقيقاً يدوياً؟ (علامة يدوية أو ملاحظات جودة) */
export function needsManualReview(c: Case): boolean {
  return !!c.needsReview || getQualityFlags(c).length > 0;
}

// ══════════════════════════════════════════════════════════════════
// 4) تصدير iCal (.ics) — أجندة الجلسات والآجال
// ══════════════════════════════════════════════════════════════════

function icsDate(d: string): string {
  // إخراج بصيغة YYYYMMDD (حدث يوم كامل) — يقبل يوم/شهر/سنة وسنة-شهر-يوم.
  const x = parseFlexibleDate(d);
  if (!x) return '';
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const dd = String(x.getDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

function icsEscape(s: string): string {
  return (s || '').replace(/[\\,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
}

/**
 * يبني محتوى ملف iCal يضم:
 * - الجلسة القادمة (nextSession) لكل ملف.
 * - كل الآجال الحرجة المحسوبة (استئناف/تعرض/نقض/خبرة/تقادم).
 * يمكن استيراده في Outlook/Google Calendar للمزامنة.
 */
export function buildICS(cases: Case[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SDFPEF//Contentieux//AR',
    'CALSCALE:GREGORIAN',
  ];

  const pushEvent = (uid: string, dateISO: string, title: string, desc: string) => {
    const dt = icsDate(dateISO);
    if (!dt) return;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}@sdfpef-contentieux`);
    lines.push(`DTSTAMP:${dt}T000000Z`);
    lines.push(`DTSTART;VALUE=DATE:${dt}`);
    lines.push(`SUMMARY:${icsEscape(title)}`);
    lines.push(`DESCRIPTION:${icsEscape(desc)}`);
    lines.push('END:VEVENT');
  };

  for (const c of cases) {
    const ref = c.mahakimId || c.id;
    if (c.nextSession) {
      pushEvent(`session-${c.id}`, c.nextSession, `جلسة: ${ref}`, `${c.court} — ${c.subject}`);
    }
    for (const d of computeDeadlines(c)) {
      if (d.severity === 'expired') continue;
      pushEvent(`deadline-${c.id}-${d.key}`, d.dueDate, `${d.label}: ${ref}`, `${d.basis} — ${c.court}`);
    }
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadTextFile(content: string, filename: string, mime = 'text/calendar;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── المتابعة والمسؤولية: مستخدم حالي + سجل تتبع (Audit Trail) ──────────────
// ملاحظة: لا يتوفر نظام مصادقة (auth) كامل في هذا المشروع حتى الآن، فاعتُمد
// حل خفيف يعتمد على localStorage لتعريف "المستخدم الحالي" على هذا الجهاز
// (يُطلب منه إدخال اسمه مرة واحدة). هذا يكفي لتفعيل ميزتي "ملفاتي" (تصفية
// حسب المكلَّف بالملف) و"سجل التتبع" (من عدّل/أنشأ وماذا ومتى). إن أُضيف
// نظام مصادقة حقيقي مستقبلاً (Supabase Auth مثلاً)، يُستبدل getCurrentUser
// بقراءة المستخدم المسجَّل دخوله مباشرة دون تغيير بقية الكود.

const CURRENT_USER_KEY = 'sdfpef_contentieux_current_user';

/** اسم المستخدم الحالي على هذا الجهاز (فارغ إن لم يُحدَّد بعد) */
export function getCurrentUser(): string {
  try { return localStorage.getItem(CURRENT_USER_KEY) || ''; } catch { return ''; }
}

/** يحفظ اسم المستخدم الحالي على هذا الجهاز */
export function setCurrentUser(name: string) {
  try { localStorage.setItem(CURRENT_USER_KEY, name.trim()); } catch { /* ignore */ }
}

/** يضيف قيداً جديداً لسجل تتبع الملف (من فعل ماذا ومتى) */
export function appendAuditEntry(c: Case, action: string): Case {
  const user = getCurrentUser() || 'مستخدم غير معرَّف';
  const entry = { date: new Date().toISOString(), user, action };
  return { ...c, auditLog: [...(c.auditLog || []), entry] };
}