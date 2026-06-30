import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, ChevronLeft, Save, Plus, Trash2, X, AlertCircle, UserCog, CalendarClock, MapPin, FolderOpen } from 'lucide-react';
import { Case } from '../Contentieux';
import { parcelBridge, formatOverlapSummary, ParcelLocation } from './parcelBridge';

const COURTS_BY_LEVEL: Record<string, string[]> = {
  'ابتدائية': [
    'المحكمة الابتدائية بطنجة',
    'المحكمة الابتدائية بأصيلة',
    'المحكمة الابتدائية بتطوان',
    'المحكمة الابتدائية بالعرائش',
    'المحكمة الابتدائية بالقصر الكبير',
    'المحكمة الابتدائية بشفشاون',
    'المحكمة الابتدائية بالحسيمة',
    'المحكمة الابتدائية بوزان',
    'المحكمة التجارية بطنجة',
    'المحكمة الإدارية بطنجة',
  ],
  'استئناف': [
    'محكمة الاستئناف بطنجة',
    'محكمة الاستئناف بتطوان',
    'محكمة الاستئناف بالحسيمة',
    'محكمة الاستئناف التجارية بطنجة',
    'محكمة الاستئناف الإدارية بطنجة'
  ],
  'نقض': [
    'محكمة النقض بالرباط'
  ]
};

const CASE_TYPES = ['جنحية', 'مدنية', 'استعجالية', 'إدارية', 'تجارية', 'عقارية'];
const SUBJECTS = ['الترامي على الملك الغابوي', 'قطع الأشجار بدون رخصة', 'الرعي الجائر', 'إضرام النار بالغابة', 'قلع النباتات والأعشاب', 'كسر وتخريب الملك الغابوي', 'دعوى استحقاق', 'طرد محتل', 'مطلب تحفيظ عقاري', 'إفراغ', 'تعويض عن أضرار الغابة', 'ايقاف الأشغال الغابوية', 'أخرى'];
const ROLES = ['مدعي', 'مدعى عليه', 'مدخل في الدعوى', 'متدخل', 'مستأنف', 'مستأنف عليه', 'طالب', 'مطلوب', 'نائبة عامة', 'شاهد', 'خبير'];
const ACTIONS = ['المقال الافتتاحي', 'تأخير وإدراجه بجلسة', 'إنجاز خبرة', 'استبدال خبير', 'إجراء وقوف على عين المكان', 'إجراء بحث', 'حجز للمداولة', 'حجز للتأمل', 'إخراج من المداولة', 'صدور حكم تمهيدي', 'صدور حكم قطعي', 'الإدلاء بمذكرة', 'تبليغ', 'أخرى'];

interface CaseWizardProps {
  initialData?: Case;
  onSave: (c: Case) => void;
  onCancel: () => void;
}

/**
 * معرّف ملف فريد قوي. البديل القديم (رقم عشوائي 100–999) كان يتصادم بعد
 * نحو 35 ملفاً في السنة فيُكتب فوق ملف موجود (فقدان بيانات). هنا نستعمل
 * crypto.randomUUID إن توفّر، وإلا توقيتاً + عشوائياً يمنع التصادم عملياً.
 */
function makeCaseId(): string {
  const yr = new Date().getFullYear();
  try {
    if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
      return `CTX-${yr}-${(crypto as any).randomUUID().split('-')[0]}`;
    }
  } catch { /* ignore */ }
  return `CTX-${yr}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function CaseWizard({ initialData, onSave, onCancel }: CaseWizardProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<Partial<Case>>(initialData || {
    id: makeCaseId(),
    date: new Date().toISOString().split('T')[0],
    type: CASE_TYPES[0],
    status: 'قيد التحقيق',
    procedures: [],
    parties: []
  });

  const [formError, setFormError] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialData) {
      setFormData(JSON.parse(JSON.stringify(initialData)));
    } else {
      setFormData({
        id: makeCaseId(),
        date: new Date().toISOString().split('T')[0],
        type: CASE_TYPES[0],
        status: 'قيد التحقيق',
        procedures: [],
        parties: []
      });
    }
  }, [initialData]);

  const updateField = (field: keyof Case, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // ── الربط المكاني: استقبال التموقع من خريطة الملك الغابوي (النقطة 1) ──
  const [awaitingParcel, setAwaitingParcel] = useState(false);
  const applyParcelLocation = (loc: ParcelLocation) => {
    if (!loc) return;
    setAwaitingParcel(false);
    setFormData(prev => ({
      ...prev,
      geoLat: loc.centroidLat.toFixed(6),
      geoLng: loc.centroidLng.toFixed(6),
      geoPolygon: (() => { try { return JSON.stringify(loc.geojson?.geometry || loc.geojson); } catch { return prev.geoPolygon; } })(),
      parcelArea: (loc.areaM2 / 10000).toFixed(2),
      geoProvince: loc.province || prev.geoProvince,
      geoOverlap: formatOverlapSummary(loc),
      geoPosition: loc.overlap?.globalPosition || prev.geoPosition,
      geoOverlapPct: loc.overlap?.totalPercentage,
    }));
    setStep(6);
  };

  // عند التحميل: التقط أي قطعة مُسلَّمة محفوظة (حالة تبديل العرض وإعادة فتح المعالج)
  React.useEffect(() => {
    try {
      const pending = sessionStorage.getItem('anef_parcel_pending');
      if (pending) { sessionStorage.removeItem('anef_parcel_pending'); applyParcelLocation(JSON.parse(pending)); }
    } catch {}
  }, []);

  // أثناء بقاء المعالج مفتوحاً (دون تبديل عرض): استقبل فورياً
  React.useEffect(() => {
    const onDelivered = (e: Event) => {
      const loc = (e as CustomEvent).detail as ParcelLocation;
      if (loc) { try { sessionStorage.removeItem('anef_parcel_pending'); } catch {} applyParcelLocation(loc); }
    };
    window.addEventListener('parcel:delivered', onDelivered);
    return () => { window.removeEventListener('parcel:delivered', onDelivered); };
  }, []);

  const startParcelPick = () => {
    setAwaitingParcel(true);
    // احفظ مسودّة الملف الحالية كي تُستعاد بعد العودة من الخريطة (تبديل العرض يُلغي تحميل المعالج)
    try { sessionStorage.setItem('anef_wizard_draft', JSON.stringify(formData)); } catch {}
    parcelBridge.requestPick();
  };

  const handleSave = () => {
    if (!formData.court || !formData.subject) {
      setFormError("المرجو إدخال 'المحكمة' و 'موضوع النزاع' في قسم 'معلومات أساسية' قبل الحفظ.");
      setStep(1);
      return;
    }
    const finalData = {
      ...formData,
      id: formData.id || makeCaseId(),
      date: formData.date || new Date().toISOString().split('T')[0],
      type: formData.type || CASE_TYPES[0],
      court: formData.court || 'محكمة غير محددة',
      subject: formData.subject || 'بدون موضوع',
      status: formData.status || 'مسجل',
    } as Case;
    onSave(finalData);
  };

  const content = (
    <div className="fixed inset-0 z-[9999] bg-stone-900/50 flex items-center justify-center md:p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white md:rounded-2xl shadow-xl w-full h-full md:h-auto max-w-4xl md:max-h-[90vh] flex flex-col overflow-hidden relative">
        {/* Header */}
        <div className="flex justify-between items-center p-4 md:p-6 border-b border-stone-200 pt-[max(1rem,env(safe-area-inset-top))]">
           <div className="flex flex-col gap-1 w-full mr-2">
             <h2 className="text-xl font-bold">{initialData ? 'تعديل الملف' : 'إضافة ملف'}</h2>
             {formError && <p className="text-sm font-bold text-red-600 bg-red-50 px-3 py-1 rounded-lg break-words">{formError}</p>}
           </div>
           <button onClick={onCancel} className="p-2 hover:bg-stone-100 rounded-lg text-stone-500 transition-colors shrink-0">
              <X className="size-5" />
           </button>
        </div>

        {/* Wizard Progress */}
        <div className="flex overflow-x-auto no-scrollbar border-b border-stone-100 bg-stone-50/50 px-4 md:px-6">
           {['معلومات أساسية', 'محضر المخالفة', 'الأطراف', 'الإجراءات والجلسات', 'جناح التنفيذ', 'المتابعة والربط'].map((s, i) => (
              <button 
                key={i} 
                onClick={() => setStep(i + 1)}
                className={`flex-none px-4 py-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${step === i + 1 ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-stone-500 hover:text-stone-700'}`}
              >
                {i + 1}. {s}
              </button>
           ))}
        </div>

        {/* Wizard Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-stone-50">
          {step === 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
               <div className="space-y-1.5">
                  <label className="text-sm font-medium text-stone-700">درجة المحكمة</label>
                  <select value={formData.courtLevel || 'ابتدائية'} onChange={e => {
                     updateField('courtLevel', e.target.value);
                     updateField('court', COURTS_BY_LEVEL[e.target.value][0]);
                  }} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                     <option value="ابتدائية">ابتدائية</option>
                     <option value="استئناف">استئناف</option>
                     <option value="نقض">نقض</option>
                  </select>
               </div>
               <div className="space-y-1.5">
                  <label className="text-sm font-medium text-stone-700">المحكمة *</label>
                  <select value={formData.court || ''} onChange={e => updateField('court', e.target.value)} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" required>
                     {!formData.court && <option value="">اختر المحكمة</option>}
                     {(COURTS_BY_LEVEL[formData.courtLevel || 'ابتدائية'] || COURTS_BY_LEVEL['ابتدائية']).map(c => (
                        <option key={c} value={c}>{c}</option>
                     ))}
                  </select>
               </div>
               <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium text-stone-700">رقم الملف بمحاكم (السنة / الرمز / الرقم)</label>
                  <div className="flex gap-2 items-center" dir="ltr">
                     <input type="text" placeholder="السنة (ex: 2024)" value={formData.fileYear || ''} onChange={e => {
                        updateField('fileYear', e.target.value);
                        updateField('mahakimId', `${e.target.value}/${formData.fileSymbol || ''}/${formData.fileNumber || ''}`);
                     }} className="w-1/3 border border-stone-300 rounded-xl px-4 py-2 text-sm font-mono text-center focus:ring-2 focus:ring-emerald-500 outline-none" />
                     <span className="text-stone-400 font-bold">/</span>
                     <input type="text" placeholder="الرمز (ex: 7101)" value={formData.fileSymbol || ''} onChange={e => {
                        updateField('fileSymbol', e.target.value);
                        updateField('mahakimId', `${formData.fileYear || ''}/${e.target.value}/${formData.fileNumber || ''}`);
                     }} className="w-1/3 border border-stone-300 rounded-xl px-4 py-2 text-sm font-mono text-center focus:ring-2 focus:ring-emerald-500 outline-none" />
                     <span className="text-stone-400 font-bold">/</span>
                     <input type="text" placeholder="الرقم (ex: 123)" value={formData.fileNumber || ''} onChange={e => {
                        updateField('fileNumber', e.target.value);
                        updateField('mahakimId', `${formData.fileYear || ''}/${formData.fileSymbol || ''}/${e.target.value}`);
                     }} className="w-1/3 border border-stone-300 rounded-xl px-4 py-2 text-sm font-mono text-center focus:ring-2 focus:ring-emerald-500 outline-none" />
                  </div>
               </div>
               <div className="space-y-1.5">
                  <label className="text-sm font-medium text-stone-700">الرقم الوطني للملف</label>
                  <input type="text" value={formData.nationalId || ''} onChange={e => updateField('nationalId', e.target.value)} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
               </div>
               <div className="space-y-1.5">
                  <label className="text-sm font-medium text-stone-700">الشعبة</label>
                  <input type="text" value={formData.section || ''} onChange={e => updateField('section', e.target.value)} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
               </div>
               <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium text-stone-700">موضوع النزاع *</label>
                  <select value={formData.subject || ''} onChange={e => updateField('subject', e.target.value)} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" required>
                     <option value="">اختر الموضوع</option>
                     {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
               </div>
               <div className="space-y-1.5">
                  <label className="text-sm font-medium text-stone-700">نوع الدعوى</label>
                  <select value={formData.type || ''} onChange={e => updateField('type', e.target.value)} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                     {CASE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                     <option value="أخرى">أخرى</option>
                  </select>
               </div>
               <div className="space-y-1.5">
                  <label className="text-sm font-medium text-stone-700">تاريخ التسجيل</label>
                  <input type="date" value={formData.date || ''} onChange={e => updateField('date', e.target.value)} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" />
               </div>
               <div className="space-y-1.5">
                  <label className="text-sm font-medium text-stone-700">المستشار / القاضي المقرر</label>
                  <input type="text" value={formData.judge || ''} onChange={e => updateField('judge', e.target.value)} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
               </div>
               <div className="space-y-1.5">
                  <label className="text-sm font-medium text-stone-700">الوضعية الحالية</label>
                  <input type="text" value={formData.status || ''} onChange={e => updateField('status', e.target.value)} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
               </div>
               <div className="space-y-1.5">
                  <label className="text-sm font-medium text-stone-700">تاريخ الجلسة القادمة</label>
                  <input type="date" value={formData.nextSession || ''} onChange={e => updateField('nextSession', e.target.value)} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" />
               </div>
            </div>
          )}

          {step === 2 && (
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
               <div className="space-y-1.5">
                  <label className="text-sm font-medium text-stone-700">رقم المحضر</label>
                  <input type="text" value={formData.pvNumber || ''} onChange={e => updateField('pvNumber', e.target.value)} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" />
               </div>
               <div className="space-y-1.5 flex flex-col">
                   <label className="text-sm font-medium text-stone-700">تاريخ المحضر</label>
                   <input type="date" value={formData.pvDate || ''} onChange={e => updateField('pvDate', e.target.value)} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" />
                   {formData.pvDate && (
                      <div className="mt-1 text-xs font-bold text-orange-600 flex items-center gap-1.5">
                         <AlertCircle className="size-3.5" />
                         تاريخ السقوط بالتقادم (6 أشهر): {
                            (() => {
                               try {
                                 const d = new Date(formData.pvDate);
                                 if (isNaN(d.getTime())) return '';
                                 d.setMonth(d.getMonth() + 6);
                                 return d.toISOString().split('T')[0];
                               } catch (e) {
                                 return '';
                               }
                            })()
                         }
                      </div>
                   )}
               </div>
               <div className="space-y-1.5 sm:col-span-2">
                   <label className="text-sm font-medium text-stone-700">نوع الجنحة / المخالفة</label>
                   <input type="text" value={formData.offenseType || ''} onChange={e => updateField('offenseType', e.target.value)} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="مثال: قطع أشجار، إضرام نار..." />
               </div>
               
               <div className="space-y-1.5 sm:col-span-2">
                   <label className="text-sm font-medium text-stone-700">مآل المحضر / المتابعة</label>
                   <div className="flex gap-2 flex-wrap">
                      {['قيد الدراسة', 'مصادق عليه', 'إجراء صلح', 'متابعة قضائية', 'حفظ / تقادم'].map(s => (
                         <button
                           key={s}
                           onClick={() => updateField('pvStatus', s)}
                           className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${formData.pvStatus === s ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'}`}
                         >
                           {s}
                         </button>
                      ))}
                   </div>
               </div>

               <div className="space-y-1.5">
                   <label className="text-sm font-medium text-stone-700">الغرامة (درهم)</label>
                   <input type="number" min="0" value={formData.fine || ''} onChange={e => updateField('fine', e.target.value)} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="0.00" />
               </div>
               <div className="space-y-1.5">
                   <label className="text-sm font-medium text-stone-700">التعويضات (درهم)</label>
                   <input type="number" min="0" value={formData.compensation || ''} onChange={e => updateField('compensation', e.target.value)} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="0.00" />
               </div>
               <div className="space-y-1.5">
                   <label className="text-sm font-medium text-stone-700">الإرجاع (درهم/قيمة)</label>
                   <input type="text" value={formData.restitution || ''} onChange={e => updateField('restitution', e.target.value)} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="مثال: 500 درهم أو حجز خشب" />
               </div>
               <div className="space-y-1.5">
                   <label className="text-sm font-medium text-stone-700">عقوبات أخرى</label>
                   <input type="text" value={formData.otherSanctions || ''} onChange={e => updateField('otherSanctions', e.target.value)} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="مثال: مصادرة" />
               </div>
               <div className="space-y-1.5 sm:col-span-2 mt-2">
                   <label className="flex items-center gap-3 text-sm font-bold text-stone-800 cursor-pointer bg-stone-100 p-4 rounded-xl border border-stone-200 hover:bg-stone-200 transition-colors">
                      <input 
                         type="checkbox" 
                         checked={!!formData.reconciliation} 
                         onChange={e => updateField('reconciliation', e.target.checked)} 
                         className="size-5 rounded text-emerald-600 focus:ring-emerald-500 border-stone-300" 
                      />
                      إجراء التصالح بشأن الجنحة الغابوية
                   </label>
                   {formData.reconciliation && (
                      <p className="text-xs text-stone-500 mt-2 pr-8">تم إجراء التصالح وتسديد المبالغ المستحقة وفق الضوابط، وتقع المتابعة فقط لإثبات الإدانة وتنفيذ العقوبات الجنائية أو الإضافية كالمصادرة إن وجدت.</p>
                   )}
               </div>
             </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <button 
                onClick={() => {
                  const newParties = [...(formData.parties || []), { role: 'مدعي', name: '' }];
                  updateField('parties', newParties);
                }}
                className="flex items-center gap-2 text-sm font-bold text-emerald-600 bg-emerald-50 px-4 py-2 rounded-lg hover:bg-emerald-100 transition-colors"
              >
                <Plus className="size-4" /> إضافة طرف جديد
              </button>
              
              <div className="space-y-3">
                {formData.parties?.map((p, idx) => (
                  <div key={idx} className="flex gap-4 items-start bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
                    <div className="space-y-1.5 w-1/3">
                      <label className="text-xs text-stone-500">الصفة</label>
                      <select value={p.role} onChange={(e) => {
                        const newParties = [...(formData.parties || [])];
                        newParties[idx] = { ...newParties[idx], role: e.target.value };
                        updateField('parties', newParties);
                      }} className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-sm outline-none">
                         {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5 flex-1">
                      <label className="text-xs text-stone-500">الاسم / الهيئة</label>
                      <input type="text" value={p.name} onChange={(e) => {
                        const newParties = [...(formData.parties || [])];
                        newParties[idx] = { ...newParties[idx], name: e.target.value };
                        updateField('parties', newParties);
                      }} className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-sm outline-none" />
                    </div>
                    <button onClick={() => {
                      const newParties = (formData.parties || []).filter((_, i) => i !== idx);
                      updateField('parties', newParties);
                    }} className="mt-6 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                {(!formData.parties || formData.parties.length === 0) && (
                  <p className="text-stone-500 text-sm text-center py-8">لا يوجد أطراف مضافة</p>
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <button 
                onClick={() => {
                  const newProc = [...(formData.procedures || []), { date: new Date().toISOString().split('T')[0], action: ACTIONS[0], decision: '' }];
                  updateField('procedures', newProc);
                }}
                className="flex items-center gap-2 text-sm font-bold text-emerald-600 bg-emerald-50 px-4 py-2 rounded-lg hover:bg-emerald-100 transition-colors"
              >
                <Plus className="size-4" /> إضافة إجراء جديد
              </button>
              
              <div className="space-y-3">
                {formData.procedures?.map((p, idx) => (
                  <div key={idx} className="flex flex-col gap-3 bg-white p-4 rounded-xl border border-stone-200 shadow-sm relative">
                    <button onClick={() => {
                      const newProc = (formData.procedures || []).filter((_, i) => i !== idx);
                      updateField('procedures', newProc);
                    }} className="absolute top-4 left-4 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="size-4" />
                    </button>
                    <div className="flex gap-4 items-start w-5/6">
                       <div className="space-y-1.5 w-1/3 shrink-0">
                         <label className="text-xs text-stone-500">التاريخ</label>
                         <input type="date" value={p.date} onChange={(e) => {
                           const newProc = [...(formData.procedures || [])];
                           newProc[idx] = { ...newProc[idx], date: e.target.value };
                           updateField('procedures', newProc);
                         }} className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-sm font-mono outline-none" />
                       </div>
                       <div className="space-y-1.5 flex-1">
                         <label className="text-xs text-stone-500">نوع الإجراء</label>
                         <select value={p.action} onChange={(e) => {
                           const newProc = [...(formData.procedures || [])];
                           newProc[idx] = { ...newProc[idx], action: e.target.value };
                           updateField('procedures', newProc);
                         }} className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-sm outline-none">
                            {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                         </select>
                       </div>
                    </div>
                    <div className="flex gap-4">
                       <div className="space-y-1.5 flex-1">
                         <label className="text-xs text-stone-500">القرار / الملاحظة</label>
                         <input type="text" value={p.decision} onChange={(e) => {
                           const newProc = [...(formData.procedures || [])];
                           newProc[idx] = { ...newProc[idx], decision: e.target.value };
                           updateField('procedures', newProc);
                         }} placeholder="القرار المتخذ..." className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-sm outline-none" />
                       </div>
                       {(p.action?.includes('خبر') || p.action?.includes('حكم') || p.action?.includes('قرار')) && (
                         <div className="space-y-1.5 w-1/3 shrink-0">
                           <label className="text-xs text-stone-500">رقم الخبرة / الحكم</label>
                           <input type="text" value={p.number || ''} onChange={(e) => {
                             const newProc = [...(formData.procedures || [])];
                             newProc[idx] = { ...newProc[idx], number: e.target.value };
                             updateField('procedures', newProc);
                           }} placeholder="الرقم..." className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-sm font-mono outline-none" />
                         </div>
                       )}
                    </div>
                  </div>
                ))}
                {(!formData.procedures || formData.procedures.length === 0) && (
                  <p className="text-stone-500 text-sm text-center py-8">لا يوجد إجراءات مضافة</p>
                )}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-sm font-medium text-stone-700">حالة التنفيذ</label>
                    <div className="flex gap-2 flex-wrap">
                      {['لم يبدأ بعد', 'قيد التبليغ', 'قيد التنفيذ', 'منفذ جزئيا', 'منفذ كليا', 'متعذر (عائق)'].map(s => (
                         <button
                           key={s}
                           onClick={() => updateField('executionStatus', s)}
                           className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${formData.executionStatus === s ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'}`}
                         >
                           {s}
                         </button>
                      ))}
                   </div>
                </div>
                
                <div className="space-y-1.5">
                   <label className="text-sm font-medium text-stone-700">طريقة التبليغ</label>
                   <select value={formData.notificationMethod || ''} onChange={e => updateField('notificationMethod', e.target.value)} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                      <option value="">اختر طريقة التبليغ</option>
                      <option value="مفوض قضائي">مفوض قضائي</option>
                      <option value="البريد المضمون">البريد المضمون</option>
                      <option value="السلطة الإدارية (قائد/شيخ)">السلطة الإدارية (قائد/شيخ)</option>
                      <option value="أعوان المياه والغابات">أعوان المياه والغابات</option>
                      <option value="الدرك الملكي/الشرطة">الدرك الملكي / الشرطة</option>
                      <option value="تعذر التبليغ">تعذر التبليغ</option>
                   </select>
                </div>

                <div className="space-y-1.5">
                   <label className="text-sm font-medium text-stone-700">تاريخ التبليغ</label>
                   <input type="date" value={formData.notificationDate || ''} onChange={e => updateField('notificationDate', e.target.value)} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                   <label className="text-sm font-medium text-stone-700">عائق التنفيذ (إن وجد) / أين التأخر؟</label>
                   <textarea value={formData.executionObstacle || ''} onChange={e => updateField('executionObstacle', e.target.value)} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none min-h-[80px]" placeholder="مثال: عدم العثور على المعني بالأمر، عسر مادي، رفض الأداء..." />
                </div>

                <div className="space-y-1.5">
                   <label className="text-sm font-medium text-stone-700">تاريخ التنفيذ</label>
                   <input type="date" value={formData.executionDate || ''} onChange={e => updateField('executionDate', e.target.value)} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>

                <div className="space-y-1.5">
                   <label className="text-sm font-medium text-stone-700">المبالغ المستخلصة (درهم)</label>
                   <input type="number" min="0" value={formData.executionAmountRecovered || ''} onChange={e => updateField('executionAmountRecovered', e.target.value)} className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="0.00" />
                </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-6">
              {/* المتابعة والمسؤولية */}
              <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm space-y-4">
                <h3 className="font-bold text-sm text-stone-700 flex items-center gap-2"><UserCog className="size-4 text-blue-500" /> المتابعة والمسؤولية</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                     <label className="text-sm font-medium text-stone-700">المكلَّف بالملف (مستشار قانوني / محامٍ)</label>
                     <input type="text" value={formData.assignedTo || ''} onChange={e => updateField('assignedTo', e.target.value)}
                       className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="مثال: ذ. فلان الفلاني" />
                  </div>
                  <div className="space-y-1.5 flex flex-col">
                     <label className="text-sm font-medium text-stone-700">تصنيف الملف</label>
                     <label className="flex items-center gap-3 text-sm font-bold text-amber-800 cursor-pointer bg-amber-50 px-4 py-2.5 rounded-xl border border-amber-200 hover:bg-amber-100 transition-colors h-full">
                        <input type="checkbox" checked={!!formData.needsReview} onChange={e => updateField('needsReview', e.target.checked)}
                          className="size-5 rounded text-amber-600 focus:ring-amber-500 border-amber-300" />
                        وضع علامة «يحتاج تدقيق» يدوياً
                     </label>
                  </div>
                </div>
              </div>

              {/* آجال مصاريف الخبرة */}
              <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm space-y-4">
                <h3 className="font-bold text-sm text-stone-700 flex items-center gap-2"><CalendarClock className="size-4 text-purple-500" /> أجل أداء مصاريف الخبرة</h3>
                <p className="text-xs text-stone-400">يُسقط هذا الأجل الحق في الخبرة إن لم يُؤدَّ المبلغ في موعده. يُحتسب تلقائياً من تاريخ الأمر القضائي.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="space-y-1.5">
                     <label className="text-sm font-medium text-stone-700">تاريخ الأمر بأداء المصاريف</label>
                     <input type="date" value={formData.expertFeeOrderDate || ''} onChange={e => updateField('expertFeeOrderDate', e.target.value)}
                       className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" />
                  </div>
                  <div className="space-y-1.5">
                     <label className="text-sm font-medium text-stone-700">عدد أيام الأجل</label>
                     <input type="number" min="1" value={formData.expertFeeDeadlineDays || ''} onChange={e => updateField('expertFeeDeadlineDays', e.target.value)}
                       className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="8 (افتراضي)" />
                  </div>
                  <div className="space-y-1.5 flex flex-col">
                     <label className="text-sm font-medium text-stone-700">حالة الأداء</label>
                     <label className="flex items-center gap-3 text-sm font-bold text-stone-700 cursor-pointer bg-stone-100 px-4 py-2.5 rounded-xl border border-stone-200 hover:bg-stone-200 transition-colors h-full">
                        <input type="checkbox" checked={!!formData.expertFeePaid} onChange={e => updateField('expertFeePaid', e.target.checked)}
                          className="size-5 rounded text-emerald-600 focus:ring-emerald-500 border-stone-300" />
                        تم الأداء داخل الأجل
                     </label>
                  </div>
                </div>
              </div>

              {/* الموقع الجغرافي والقطعة الغابوية */}
              <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="font-bold text-sm text-stone-700 flex items-center gap-2"><MapPin className="size-4 text-emerald-600" /> الموقع الجغرافي والقطعة الغابوية</h3>
                  <button type="button" onClick={startParcelPick}
                    className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded-lg shadow-sm transition-colors">
                    <MapPin className="size-4" /> تحديد التموقع وحساب التداخل على الخريطة
                  </button>
                </div>

                {awaitingParcel && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 text-[12px] text-emerald-800 leading-relaxed">
                    <strong>وضع التحديد مُفعّل.</strong> افتح قسم «الملك الغابوي»، ارسم القطعة موضوع النزاع (يُحسب التداخل تلقائياً)، ثم اضغط <strong>«إرفاق القطعة بملف القضية»</strong>. ستُملأ الحقول هنا تلقائياً.
                  </div>
                )}

                {formData.geoOverlap && (
                  <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-stone-600">التداخل مع الملك الغابوي</span>
                      {formData.geoPosition && (
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          (formData.geoPosition.includes('خارج')) ? 'bg-stone-200 text-stone-600'
                          : (formData.geoPosition.includes('جزئيا')) ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'}`}>
                          {formData.geoPosition}{formData.geoOverlapPct != null ? ` — ${formData.geoOverlapPct.toFixed(1)}%` : ''}
                        </span>
                      )}
                    </div>
                    <pre className="text-[11px] text-stone-700 whitespace-pre-wrap font-sans leading-relaxed">{formData.geoOverlap}</pre>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                     <label className="text-sm font-medium text-stone-700">مرجع القطعة / الرسم العقاري</label>
                     <input type="text" value={formData.parcelRef || ''} onChange={e => updateField('parcelRef', e.target.value)}
                       className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="مثال: TF 12345/T أو مطلب 6789" />
                  </div>
                  <div className="space-y-1.5">
                     <label className="text-sm font-medium text-stone-700">المساحة المتضررة (هكتار)</label>
                     <input type="number" min="0" step="0.01" value={formData.parcelArea || ''} onChange={e => updateField('parcelArea', e.target.value)}
                       className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="0.00" />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                     <label className="text-sm font-medium text-stone-700">القيمة التقديرية للضرر (درهم)</label>
                     <input type="number" min="0" value={formData.estimatedValue || ''} onChange={e => updateField('estimatedValue', e.target.value)}
                       className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="0.00" />
                  </div>
                  <div className="space-y-1.5">
                     <label className="text-sm font-medium text-stone-700">خط العرض (Latitude)</label>
                     <input type="text" dir="ltr" value={formData.geoLat || ''} onChange={e => updateField('geoLat', e.target.value)}
                       className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="مثال: 35.5731" />
                  </div>
                  <div className="space-y-1.5">
                     <label className="text-sm font-medium text-stone-700">خط الطول (Longitude)</label>
                     <input type="text" dir="ltr" value={formData.geoLng || ''} onChange={e => updateField('geoLng', e.target.value)}
                       className="w-full border border-stone-300 rounded-xl px-4 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="مثال: -5.3683" />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                     <label className="text-sm font-medium text-stone-700">حدود القطعة (GeoJSON Polygon — اختياري)</label>
                     <textarea dir="ltr" value={formData.geoPolygon || ''} onChange={e => updateField('geoPolygon', e.target.value)}
                       className="w-full border border-stone-300 rounded-xl px-4 py-2 text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none min-h-[70px]" placeholder='{"type":"Polygon","coordinates":[[[...]]]}' />
                  </div>
                </div>
              </div>

              {/* الوثائق المرفقة */}
              <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-stone-700 flex items-center gap-2"><FolderOpen className="size-4 text-stone-500" /> الوثائق المرفقة (روابط)</h3>
                  <button onClick={() => updateField('documents', [...(formData.documents || []), { name: '', url: '', type: '' }])}
                    className="flex items-center gap-2 text-sm font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
                    <Plus className="size-4" /> إضافة وثيقة
                  </button>
                </div>
                <div className="space-y-3">
                  {(formData.documents || []).map((d, idx) => (
                    <div key={idx} className="flex gap-3 items-start bg-stone-50 p-3 rounded-xl border border-stone-200">
                      <div className="space-y-1.5 flex-1">
                        <label className="text-xs text-stone-500">اسم الوثيقة</label>
                        <input type="text" value={d.name} onChange={e => {
                          const docs = [...(formData.documents || [])];
                          docs[idx] = { ...docs[idx], name: e.target.value };
                          updateField('documents', docs);
                        }} placeholder="مثال: نسخة الحكم الابتدائي" className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-sm outline-none" />
                      </div>
                      <div className="space-y-1.5 flex-1">
                        <label className="text-xs text-stone-500">الرابط (URL)</label>
                        <input type="text" dir="ltr" value={d.url} onChange={e => {
                          const docs = [...(formData.documents || [])];
                          docs[idx] = { ...docs[idx], url: e.target.value };
                          updateField('documents', docs);
                        }} placeholder="https://..." className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-sm font-mono outline-none" />
                      </div>
                      <div className="space-y-1.5 w-1/4">
                        <label className="text-xs text-stone-500">النوع</label>
                        <input type="text" value={d.type || ''} onChange={e => {
                          const docs = [...(formData.documents || [])];
                          docs[idx] = { ...docs[idx], type: e.target.value };
                          updateField('documents', docs);
                        }} placeholder="PDF" className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-sm outline-none" />
                      </div>
                      <button onClick={() => updateField('documents', (formData.documents || []).filter((_, i) => i !== idx))}
                        className="mt-6 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                  {(!formData.documents || formData.documents.length === 0) && (
                    <p className="text-stone-500 text-sm text-center py-4">لا توجد وثائق مرفقة</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 md:p-6 border-t border-stone-200 bg-white flex justify-between items-center pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button 
            onClick={() => setStep(Math.max(1, step - 1))}
            className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${step === 1 ? 'opacity-0 pointer-events-none' : 'text-stone-600 hover:bg-stone-100 rounded-lg'}`}
          >
            <ChevronRight className="size-4" /> السابق
          </button>
          
          {step < 6 ? (
            <button 
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm transition-colors"
            >
              التالي <ChevronLeft className="size-4" />
            </button>
          ) : (
            <button 
              onClick={handleSave}
              className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm transition-colors shadow-sm"
            >
              <Save className="size-4" /> حفظ الملف
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}