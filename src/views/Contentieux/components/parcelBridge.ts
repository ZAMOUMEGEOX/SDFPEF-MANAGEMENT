// ════════════════════════════════════════════════════════════════
// parcelBridge.ts — جسر مشترك بين «قسم المنازعات» و«خريطة الملك الغابوي»
//
// الهدف (النقطة 1): تحديد تموقع العقار موضوع الدعوى/المحضر على الخريطة،
// وحساب تداخله مع الملك الغابوي، ثم إرفاق النتيجة بالملف القضائي.
//
// الطرفان عرضان (views) في نفس التطبيق، فلا حاجة لـ iframe ولا postMessage
// عابر للأصل — نستعمل نمطاً بسيطاً: مفرد (singleton) + أحداث window.
//
// التدفّق:
//   1) CaseWizard.requestPick()  → يفعّل وضع الالتقاط ويُطلِق 'anef:open-map'.
//   2) المستخدم يفتح قسم الملك الغابوي، يرسم القطعة (يُحسب التداخل تلقائياً).
//   3) DomaineForestier يعرض زر «إرفاق بالملف» → deliver(location).
//   4) deliver يُطلق 'parcel:delivered'، فيلتقطه CaseWizard ويملأ الحقول.
//
// ملاحظة تنقّل: الأحداث 'anef:open-map' و'anef:return-from-map' يلتقطها
// هيكل التطبيق (App) ليبدّل العرض — انظر تعليمات الدمج في آخر الملف.
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
  capturedAt: string;      // ISO
}

type Listener = () => void;

const _subs = new Set<Listener>();
// علم الالتقاط مخزَّن على window كي يُشارَك بين العرضين حتى لو اختلفت نسخ الوحدة.
function getPicking(): boolean { try { return !!(window as any).__anefParcelPicking; } catch { return false; } }
function setPicking(v: boolean) { try { (window as any).__anefParcelPicking = v; } catch {} }

function emit() { _subs.forEach((fn) => { try { fn(); } catch (_) {} }); }
function fire(name: string, detail?: any) {
  try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {}
}

export const parcelBridge = {
  /** يبدأ وضع التقاط قطعة لملف قضائي، ويطلب فتح الخريطة. */
  requestPick() {
    setPicking(true);
    emit();
    fire('parcel:pick-requested');
    fire('anef:open-map'); // ليلتقطه هيكل التطبيق ويبدّل للعرض الخرائطي
  },

  /** إلغاء وضع الالتقاط. */
  cancel() {
    setPicking(false);
    emit();
    fire('parcel:pick-cancelled');
  },

  isPicking() { return getPicking(); },

  /** يُستدعى من خريطة الملك الغابوي لتسليم التموقع المحسوب. */
  deliver(location: ParcelLocation) {
    setPicking(false);
    emit();
    fire('parcel:delivered', location);
    fire('anef:return-from-map'); // ليعود هيكل التطبيق للعرض السابق
  },

  /** اشتراك تفاعلي لتغيّر حالة الالتقاط (للمكوّنات). يُعيد دالة إلغاء الاشتراك. */
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
// تعليمات الدمج في هيكل التطبيق (App) — سطران فقط:
//
//   useEffect(() => {
//     const toMap  = () => setCurrentView('domaine');     // عرض خريطة الملك الغابوي لديكم
//     const toBack = () => setCurrentView('contentieux');  // عرض قسم المنازعات لديكم
//     window.addEventListener('anef:open-map', toMap);
//     window.addEventListener('anef:return-from-map', toBack);
//     return () => { window.removeEventListener('anef:open-map', toMap);
//                    window.removeEventListener('anef:return-from-map', toBack); };
//   }, []);
//
// استبدلوا 'domaine' و'contentieux' بقيم ViewState الفعلية في مشروعكم.
// إن لم تُضَف هذه الأسطر، يبقى نقل البيانات يعمل، لكن يبدّل المستخدم العرض يدوياً.
// ════════════════════════════════════════════════════════════════