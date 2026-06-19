// ════════════════════════════════════════════════════════════════
// parcelBridge.ts — جسر النقل المشترك بين «قسم المنازعات» و«خريطة الملك الغابوي»
//
// v2 — ربط حقيقي ثنائي الاتجاه:
//   اتجاه 1 (التقاط):  منازعات → دومين: requestPick(target) يفعّل وضع الرسم
//                       ويمرّر هدف الربط (ملف/محضر) عبر sessionStorage('anef_parcel_target').
//   اتجاه 2 (تسليم):   دومين → منازعات: deliver(location) يعيد التموقع المحسوب.
//   اتجاه 3 (عرض):     منازعات → دومين: showParcel(geojson) لإظهار قطعة ملف على الخريطة.
//
// الطرفان عرضان (views) في نفس التطبيق ⇒ نقل عبر أحداث window + sessionStorage
// (يصمد عبر تبديل العرض الذي يُلغي تحميل المكوّن). الحفظ الفعلي في القاعدة يتم
// جهة الدومين عبر forestRepo (لأنها مالكة الرسم وحساب التداخل).
// ════════════════════════════════════════════════════════════════

export interface ParcelOverlapHit {
  foret: string;
  foretAr: string;
  canton: string;
  intersectionArea: number; // m²
  percentage: number;       // %
  position: string;         // داخل/جزئيا/خارج الملك الغابوي
}

export interface ParcelOverlap {
  globalPosition: string;        // داخل / جزئيا داخل / خارج الملك الغابوي
  totalPercentage: number;       // نسبة التداخل الكلية %
  totalIntersectionArea: number; // m²
  hits: ParcelOverlapHit[];
}

export interface ParcelLocation {
  geojson: any;            // هندسة القطعة (GeoJSON)
  centroidLat: number;
  centroidLng: number;
  lambertX?: number;       // EPSG:26191
  lambertY?: number;
  areaM2: number;
  perimeterKm: number;
  province?: string | null;
  overlap?: ParcelOverlap | null;
  parcelId?: string;       // معرف القطعة في domaine.parcels بعد الحفظ (للتتبّع)
  capturedAt: string;      // ISO
}

/** هدف الربط: ملف قضائي أو محضر ضابطة قضائية. */
export interface ParcelTarget {
  kind: 'case' | 'pv';
  id: string;
  ref?: string;            // mahakimId / pvCourtRef للعرض
}

/** طلب إظهار قطعة على الخريطة (من المنازعات للدومين). */
export interface ParcelShowRequest {
  geojson: any;
  openFiche?: boolean;
  ref?: string;
}

type Listener = () => void;

const _subs = new Set<Listener>();

// مفاتيح sessionStorage — مصدر الحقيقة الذي يصمد عبر تبديل العرض.
const K_TARGET  = 'anef_parcel_target';   // { kind, id, ref }
const K_PENDING = 'anef_parcel_pending';  // ParcelLocation (التموقع المُسلَّم)
const K_SHOW    = 'anef_show_parcel';      // ParcelShowRequest

function getPicking(): boolean { try { return !!(window as any).__anefParcelPicking; } catch { return false; } }
function setPicking(v: boolean) { try { (window as any).__anefParcelPicking = v; } catch {} }

function emit() { _subs.forEach((fn) => { try { fn(); } catch (_) {} }); }
function fire(name: string, detail?: any) {
  try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {}
}
function ssSet(k: string, v: any) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} }
function ssGet<T>(k: string): T | null { try { const r = sessionStorage.getItem(k); return r ? JSON.parse(r) as T : null; } catch { return null; } }
function ssDel(k: string) { try { sessionStorage.removeItem(k); } catch {} }

export const parcelBridge = {
  // ── اتجاه 1: التقاط قطعة لملف/محضر ─────────────────────────────
  /**
   * يبدأ وضع التقاط قطعة، ويخزّن هدف الربط، ويطلب فتح الخريطة.
   * إن استُدعيت بدون target فالمستدعي مسؤول عن ضبط anef_parcel_target مسبقاً
   * (متوافق مع النداءات القديمة).
   */
  requestPick(target?: ParcelTarget) {
    if (target) ssSet(K_TARGET, target);
    setPicking(true);
    emit();
    fire('parcel:pick-requested');
    fire('anef:open-map'); // ليلتقطه هيكل التطبيق (App) ويبدّل للعرض الخرائطي
  },

  /** إلغاء وضع الالتقاط. */
  cancel() {
    setPicking(false);
    ssDel(K_TARGET);
    emit();
    fire('parcel:pick-cancelled');
  },

  isPicking() { return getPicking(); },

  /** الهدف الحالي للالتقاط (تقرؤه جهة الدومين عند الإرفاق لربط القطعة بالملف). */
  getTarget(): ParcelTarget | null { return ssGet<ParcelTarget>(K_TARGET); },
  clearTarget() { ssDel(K_TARGET); },

  // ── اتجاه 2: تسليم التموقع المحسوب ─────────────────────────────
  /** يُستدعى من خريطة الملك الغابوي لتسليم التموقع المحسوب لملف القضية. */
  deliver(location: ParcelLocation) {
    setPicking(false);
    ssSet(K_PENDING, location);           // يصمد عبر تبديل العرض
    emit();
    fire('parcel:delivered', location);
    fire('anef:return-from-map');          // ليعود هيكل التطبيق للعرض السابق
  },

  /** يلتقط أي تموقع مُسلَّم محفوظ (حالة إعادة تحميل المكوّن بعد تبديل العرض). */
  consumePending(): ParcelLocation | null {
    const loc = ssGet<ParcelLocation>(K_PENDING);
    if (loc) ssDel(K_PENDING);
    return loc;
  },

  // ── اتجاه 3: عرض قطعة ملف على الخريطة ──────────────────────────
  /** يطلب إظهار قطعة (من تفاصيل ملف/محضر) على خريطة الملك الغابوي. */
  showParcel(req: ParcelShowRequest) {
    ssSet(K_SHOW, req);
    fire('anef:open-map');
  },

  /** تقرؤه جهة الدومين عند التحميل لرسم القطعة المطلوبة. */
  consumeShowRequest(): ParcelShowRequest | null {
    const req = ssGet<ParcelShowRequest>(K_SHOW);
    if (req) ssDel(K_SHOW);
    return req;
  },

  // ── اشتراك تفاعلي ──────────────────────────────────────────────
  /** يُعيد دالة إلغاء الاشتراك. */
  subscribe(fn: Listener): () => void {
    _subs.add(fn);
    const onEvt = () => fn();
    window.addEventListener('parcel:pick-requested', onEvt);
    window.addEventListener('parcel:pick-cancelled', onEvt);
    window.addEventListener('parcel:delivered', onEvt);
    return () => {
      _subs.delete(fn);
      window.removeEventListener('parcel:pick-requested', onEvt);
      window.removeEventListener('parcel:pick-cancelled', onEvt);
      window.removeEventListener('parcel:delivered', onEvt);
    };
  },
};

// ── صياغة ملخّص عربي للتداخل لإدراجه في الملف ──
export function formatOverlapSummary(loc: ParcelLocation): string {
  const ha = (loc.areaM2 / 10000).toFixed(2);
  const lines: string[] = [];
  lines.push(`الموقع: ${loc.centroidLat.toFixed(5)}, ${loc.centroidLng.toFixed(5)}`);
  if (loc.lambertX != null && loc.lambertY != null) lines.push(`لامبير: X=${loc.lambertX} | Y=${loc.lambertY}`);
  lines.push(`المساحة: ${ha} هكتار (${Math.round(loc.areaM2)} م²)`);
  if (loc.province) lines.push(`الإقليم: ${loc.province}`);
  if (loc.overlap) {
    lines.push(`الوضعية إزاء الملك الغابوي: ${loc.overlap.globalPosition} (${loc.overlap.totalPercentage.toFixed(1)}% تداخل)`);
    for (const h of loc.overlap.hits.slice(0, 5)) {
      const interHa = (h.intersectionArea / 10000).toFixed(2);
      lines.push(`• ${h.foretAr || h.foret}${h.canton ? ' — قنطون ' + h.canton : ''}: ${h.percentage.toFixed(1)}% (${interHa} هـ)`);
    }
  } else {
    lines.push('الوضعية إزاء الملك الغابوي: لم يُحسب التداخل');
  }
  return lines.join('\n');
}

// ════════════════════════════════════════════════════════════════
// تكامل هيكل التطبيق (App) — موجود لديكم بالفعل في App.tsx:
//   window.addEventListener('anef:open-map',  () => setCurrentView('domaine'));
//   window.addEventListener('anef:return-from-map', () => setCurrentView('contentieux'));
// ════════════════════════════════════════════════════════════════