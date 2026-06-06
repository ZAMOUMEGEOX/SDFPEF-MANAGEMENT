import fs from 'fs';

let content = fs.readFileSync('src/views/Contentieux.tsx', 'utf-8');

const newContent = `import React, { useState } from 'react';
import { Search, Filter, Plus, FileText, CheckCircle2, Clock, AlertCircle, ChevronLeft, Scale, Shield, User, FilePlus2, Check, ExternalLink, Calendar, Gavel, FileCheck2, Activity, Landmark, MapPin, AlertTriangle, DownloadCloud, LayoutTemplate, ClipboardPaste, Wand2, Lock, FileDigit, MousePointerClick, Copy } from 'lucide-react';

interface Case {
  id: string; // N° de dossier interne
  mahakimId?: string; // N° Mahakim Complet (ex: 2024/1101/221)
  date: string; // Date d'ouverture
  type: string; // Type de dossier (Civil, Répressif, etc.)
  subject: string; // Objet du litige
  court: string; // Juridiction
  status: string; // Statut (En cours, Jugé, etc.)
  nextSession?: string; // Date prochaine audience
  defendant?: string; // Nom de la partie adverse
  createdAt?: string; // Date de création dans notre système
}

const recentCases: Case[] = [
  { id: 'CTX-2024-001', mahakimId: '2024/1101/221', date: '2024-03-15', type: 'مدني', subject: 'الترامي على الملك الغابوي', court: 'المحكمة الابتدائية بتطوان', status: 'جلسة مبرمجة', nextSession: '2024-06-15', defendant: 'أحمد التطواني' },
  { id: 'CTX-2024-002', mahakimId: '2023/7101/458', date: '2023-11-02', type: 'جنحي', subject: 'قطع الأشجار بدون مرخص', court: 'محكمة الاستئناف بالقنيطرة', status: 'محجوز للمداولة', defendant: 'مجهول' },
  { id: 'CTX-2024-003', date: '2024-01-20', type: 'إداري', subject: 'طعن في قرار الإفراغ', court: 'المحكمة الإدارية بالرباط', status: 'قيد التحقيق', nextSession: '2024-05-10', defendant: 'شركة البناء الحديث' },
];

export function Contentieux() {
  const [viewMode, setViewMode] = useState<'list' | 'mahakim'>('list');
  const [cases, setCases] = useState<Case[]>(recentCases);

  const handleSaveExtractedCase = (newCase: Case) => {
    setCases([newCase, ...cases]);
    setViewMode('list');
  };

  if (viewMode === 'mahakim') {
    return <MahakimIntegration onClose={() => setViewMode('list')} onSave={handleSaveExtractedCase} />;
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold border-b-4 border-emerald-600 pb-2 inline-block">النزاعات والقضايا</h2>
          <p className="text-sm text-stone-500 mt-2">متابعة الملفات القضائية والتكامل مع نظام محاكم</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
           <button onClick={() => setViewMode('mahakim')} className="flex items-center justify-center gap-2 bg-emerald-500 text-emerald-950 hover:bg-emerald-400 px-6 py-3 rounded-xl font-bold transition-colors w-full sm:w-auto shadow-sm">
              استخراج البيانات <Search className="size-4" />
           </button>
           <button className="flex items-center justify-center gap-2 bg-stone-900 text-white hover:bg-stone-800 px-4 py-3 rounded-xl font-medium transition-colors w-full sm:w-auto shadow-sm">
             <Plus className="size-5" /> إضافة ملف محلي
           </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي القضايا', value: cases.length.toString(), icon: Scale, color: 'emerald' },
          { label: 'قيد التحقيق', value: '1', icon: Search, color: 'blue' },
          { label: 'جلسات مبرمجة', value: '2', icon: Calendar, color: 'orange' },
          { label: 'أحكام صادرة', value: '0', icon: Gavel, color: 'stone' },
        ].map((stat, idx) => (
          <div key={idx} className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center justify-between">
            <div>
               <p className="text-xs font-bold text-stone-500 mb-1">{stat.label}</p>
               <h3 className={\`text-2xl font-black text-\${stat.color}-700\`}>{stat.value}</h3>
            </div>
            <div className={\`p-3 bg-\${stat.color}-50 text-\${stat.color}-600 rounded-xl\`}>
               <stat.icon className="size-6" />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-stone-200 flex flex-col sm:flex-row gap-4 justify-between items-center bg-stone-50">
           <div className="relative w-full sm:w-96">
              <input type="text" placeholder="البحث برقم الملف أو الموضوع..." className="w-full bg-white border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none" />
              <Search className="size-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
           </div>
           <button className="flex items-center gap-2 px-4 py-2.5 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors">
              <Filter className="size-4" /> تصفية
           </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-stone-100/50 text-stone-500 border-b border-stone-200">
              <tr>
                <th className="px-6 py-4 font-bold">المرجع</th>
                <th className="px-6 py-4 font-bold">المحكمة / رقم محاكم</th>
                <th className="px-6 py-4 font-bold">تاريخ التسجيل</th>
                <th className="px-6 py-4 font-bold">الموضوع</th>
                <th className="px-6 py-4 font-bold">الوضعية</th>
                <th className="px-6 py-4 font-bold">الجلسة القادمة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {cases.map((c) => (
                <tr key={c.id} className="hover:bg-emerald-50/50 transition-colors cursor-pointer group">
                  <td className="px-6 py-4">
                     <span className="font-mono font-bold text-stone-700 bg-stone-100 px-2 py-1 rounded text-xs">{c.id}</span>
                  </td>
                  <td className="px-6 py-4">
                     <p className="font-bold text-stone-800">{c.court}</p>
                     {c.mahakimId && <p className="text-xs text-stone-500 font-mono flex items-center gap-1 mt-0.5"><Landmark className="size-3"/> {c.mahakimId}</p>}
                  </td>
                  <td className="px-6 py-4 font-mono text-stone-600">{c.date}</td>
                  <td className="px-6 py-4">
                     <p className="font-bold text-stone-800">{c.subject}</p>
                     <p className="text-xs text-stone-500 mt-0.5">{c.type} • ضد: {c.defendant}</p>
                  </td>
                  <td className="px-6 py-4">
                     <span className={\`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold \${
                        c.status.includes('مبرمج') ? 'bg-orange-100 text-orange-700' :
                        c.status.includes('محجوز') ? 'bg-blue-100 text-blue-700' :
                        'bg-stone-100 text-stone-700'
                     }\`}>
                        <span className="size-1.5 rounded-full bg-current"></span>
                        {c.status}
                     </span>
                  </td>
                  <td className="px-6 py-4 font-mono font-bold text-emerald-700">
                     {c.nextSession || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MahakimIntegration({ onClose, onSave }: { onClose: () => void, onSave: (c: Case) => void }) {
  const [pasteData, setPasteData] = useState('');
  const [result, setResult] = useState<any>(null);
  const [extractMode, setExtractMode] = useState<'info' | 'parsed'>('info');

  const handleReadClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setPasteData(text);
        performParsing(text);
      }
    } catch (err) {
      alert("تعذر الوصول إلى الحافظة. يرجى الصق النص يدوياً.");
    }
  };

  const handleParseManual = () => {
    if (!pasteData.trim()) return;
    performParsing(pasteData);
  }

  const performParsing = (text: string) => {
    const clean = text.replace(/\\t/g, '\\n').split('\\n').map(s => s.trim()).filter(Boolean);
    
    let mahakimId = '-';
    let court = 'المحكمة';
    let type = 'مدنية';
    let subject = 'نزاع مستخرج';
    let date = new Date().toISOString().split('T')[0];
    
    // Attempt extracting the full ID structure like 2024/1101/221
    const idMatch = text.match(/(\\d{4}\\/\\d{3,4}\\/\\d+)/);
    if (idMatch) mahakimId = idMatch[1];
    
    const courtMatch = text.match(/(المحكمة الابتدائية[^\\n]+|محكمة الاستئناف[^\\n]+)/);
    if (courtMatch) court = courtMatch[1].trim();
    
    if (text.includes('جنحي')) type = 'جنحية';
    if (text.includes('عقاري')) type = 'عقارية';
    if (text.includes('استعجالي')) type = 'استعجالية';
    if (text.includes('إداري')) type = 'إدارية';
    
    const subjIdx = clean.findIndex(s => s.includes('الموضوع'));
    if (subjIdx !== -1 && clean[subjIdx+1] && !clean[subjIdx+1].includes('حكم')) {
      subject = clean[subjIdx+1];
    }

    const dateIdx = clean.findIndex(s => s.includes('تاريخ التسجيل'));
    if (dateIdx !== -1 && clean[dateIdx+1]) {
      date = clean[dateIdx+1];
    }
    
    const parties: {role: string, name: string}[] = [];
    const partiesStart = clean.findIndex(s => s.includes('لائحة الأطراف') || s.includes('الأطراف'));
    if (partiesStart !== -1) {
      for(let i=partiesStart+1; i<clean.length; i++) {
        if (clean[i].includes('لائحة الإجراءات') || clean[i].includes('لائحة الطعون') || clean[i].includes('الملفات المرتبطة')) break;
        if (['مدعي', 'مدعى عليه', 'متهم', 'المطالب بالحق المدني'].includes(clean[i]) || clean[i].includes('مدعي') || clean[i].includes('متهم')) {
          parties.push({ role: clean[i], name: clean[i+1] || '' });
        }
      }
    }

    const procedures: {date: string, action: string, decision: string}[] = [];
    const procStart = clean.findIndex(s => s.includes('لائحة الإجراءات') || s.includes('الإجراءات'));
    if (procStart !== -1) {
      for(let i=procStart+1; i<clean.length; i++) {
         if (clean[i].match(/^202\\d-\\d{2}-\\d{2}/) || clean[i].match(/^\\d{2}\\/\\d{2}\\/202\\d/)) {
            procedures.push({
               date: clean[i],
               action: clean[i+1] || '-',
               decision: clean[i+2] && !clean[i+2].match(/^202\\d/) && !clean[i+2].match(/^\\d{2}\\//) ? clean[i+2] : '-'
            });
         }
      }
    }

    // Default processing for parties if standard Mahakim layout parsing failed
    if (parties.length === 0) {
      parties.push({ role: 'مدعي / إدارة', name: 'إدارة المياه والغابات (الاستخراج التلقائي)' });
    }

    setResult({
      mahakimId,
      court,
      type,
      subject,
      date,
      status: 'بيانات مستخرجة',
      nextSession: procedures.length > 0 ? procedures[0].date : '-',
      parties,
      procedures
    });
    setExtractMode('parsed');
  };

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm flex flex-col min-h-[800px] w-full relative overflow-hidden" dir="rtl">
      <div className="p-5 bg-emerald-900 flex justify-between items-center text-emerald-50 shrink-0 shadow-md z-20">
         <div className="flex flex-col gap-1">
            <h2 className="font-bold text-lg leading-tight flex items-center gap-2">
               <Landmark className="size-6 text-emerald-300" /> تكامل مباشر مع محاكم
            </h2>
            <p className="text-xs text-emerald-300/80">أداة الاستخراج الذكي عبر الحافظة (Clipboard) لتجاوز حماية المتصفحات (CORS).</p>
         </div>
         <div className="flex items-center gap-3">
           <button onClick={onClose} className="bg-emerald-800 hover:bg-emerald-700 p-2 rounded-lg transition-colors">
              <ChevronLeft className="size-5" />
           </button>
         </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar Search Filters & Extraction */}
        <div className="w-[450px] border-l border-stone-200 bg-stone-50 p-6 flex flex-col overflow-y-auto shrink-0 z-10 shadow-xl relative">
          
          <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl mb-6 shadow-sm">
             <h3 className="text-orange-900 font-bold text-sm flex items-center gap-2 mb-2">
               <AlertTriangle className="size-4" /> تنبيه أمني (CORS)
             </h3>
             <p className="text-[11px] text-orange-800 leading-relaxed font-bold">
               تمنع حماية المتصفحات استخراج البيانات برمجياً من داخل البوابة المدمجة. يجب عليك استخراجها يدوياً عن طريق النسخ كما هو موضح أدناه في 3 خطوات بسيطة.
             </p>
          </div>

          <div className="space-y-6 relative before:absolute before:right-[15px] before:top-2 before:bottom-6 before:w-px before:bg-emerald-200">
             
             {/* Step 1 */}
             <div className="relative pl-4">
                <div className="absolute right-0 top-0 size-8 rounded-full bg-emerald-100 text-emerald-700 font-black border-2 border-white flex items-center justify-center shadow-sm text-sm">1</div>
                <div className="mr-12">
                   <h4 className="font-bold text-sm text-stone-800 mb-1 flex items-center gap-2">
                     ابحث عن الملف داخل البوابة
                     <Search className="size-3 text-stone-400" />
                   </h4>
                   <p className="text-xs text-stone-500 leading-relaxed mb-3">استخدم نموذج البحث المدمج في اليسار للوصول إلى تفاصيل الجلسات والأطراف.</p>
                </div>
             </div>

             {/* Step 2 */}
             <div className="relative pl-4">
                <div className="absolute right-0 top-0 size-8 rounded-full bg-emerald-100 text-emerald-700 font-black border-2 border-white flex items-center justify-center shadow-sm text-sm">2</div>
                <div className="mr-12">
                   <h4 className="font-bold text-sm text-stone-800 mb-1 flex items-center gap-2">
                     حدد و احفظ النص في الحافظة
                     <MousePointerClick className="size-3 text-stone-400" />
                   </h4>
                   <p className="text-xs text-stone-500 leading-relaxed max-w-[280px]">اضغط داخل إطار بوابة محاكم، ثم اضغط <kbd className="bg-stone-200 px-1.5 py-0.5 rounded font-mono text-[10px] mx-1 border border-stone-300">Ctrl+A</kbd> لتحديد كل شيء، ثم <kbd className="bg-stone-200 px-1.5 py-0.5 rounded font-mono text-[10px] mx-1 border border-stone-300">Ctrl+C</kbd> لنسخه.</p>
                </div>
             </div>

             {/* Step 3 */}
             <div className="relative pl-4">
                <div className="absolute right-0 top-0 size-8 rounded-full bg-emerald-600 text-white font-black border-2 border-white flex items-center justify-center shadow-sm text-sm">3</div>
                <div className="mr-12">
                   <h4 className="font-bold text-sm text-stone-800 mb-3 flex items-center gap-2">
                      استخراج البيانات وحفظها
                      <ClipboardPaste className="size-3 text-stone-400" />
                   </h4>
                   <button 
                     onClick={handleReadClipboard}
                     className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-sm transition-all hover:shadow flex items-center justify-center gap-2"
                   >
                     <ClipboardPaste className="size-5" /> استخراج من الحافظة آلياً
                   </button>
                   <p className="text-[10px] text-center text-stone-500 mt-2">يحتاج إلى الإذن بقراءة الحافظة (Clipboard API)</p>
                   
                   <div className="mt-8 border-t border-stone-200 pt-6">
                      <p className="text-[11px] text-stone-500 mb-2 font-bold opacity-80">ألصق النص يدوياً كبديل:</p>
                      <textarea 
                        value={pasteData}
                        onChange={(e) => setPasteData(e.target.value)}
                        placeholder="الصق (Ctrl+V) المحتوى هنا..."
                        className="w-full bg-white border border-stone-200 rounded-lg p-3 text-[10px] font-mono text-stone-600 outline-none resize-none h-24 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-sm"
                      />
                      <button 
                        onClick={handleParseManual}
                        disabled={!pasteData.trim()}
                        className="w-full mt-2 py-2.5 bg-stone-800 disabled:opacity-50 hover:bg-stone-900 text-white rounded-lg font-bold text-xs shadow-sm transition-colors"
                      >
                        تحليل النص المكتوب
                      </button>
                   </div>
                </div>
             </div>
          </div>
        </div>

        {/* Real Mahakim Portal Iframe / Extraction View */}
        <div className="flex-1 bg-stone-100 relative flex flex-col w-full h-full">
             {extractMode === 'info' ? (
                <>
                   <div className="absolute inset-x-0 top-0 h-10 bg-emerald-900/5 backdrop-blur border-b border-emerald-900/10 flex items-center justify-center px-4 z-10 pointer-events-none">
                       <span className="text-xs font-bold text-stone-600 flex items-center gap-2">
                         <Lock className="size-3 text-stone-400" /> بوابة محاكم الأصلية (مؤمنة برمجياً ضد الانتحال)
                       </span>
                   </div>
                   <iframe 
                     src="https://www.mahakim.ma/#/suivi/dossier-suivi" 
                     title="Mahakim.ma Portal" 
                     className="w-full h-full border-0 absolute inset-0 pt-10 bg-white"
                     sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                   />
                </>
             ) : (
                <div className="absolute inset-0 bg-white p-8 overflow-y-auto animate-in fade-in duration-500 z-20">
                   <div className="flex justify-between items-start mb-8 gap-2 border-b border-stone-100 pb-6">
                    <div>
                      <h3 className="font-bold text-3xl text-emerald-900 flex items-center gap-3 mb-2">
                        <FileCheck2 className="size-8 text-emerald-600" />
                         البيانات المستخرجة بنجاح
                      </h3>
                      <p className="text-sm text-stone-500 font-medium tracking-wide">تم تفسير هيكلة الملف. يمكنك الآن حفظه في المنظومة وإدراج الخصوم.</p>
                    </div>
                    <div className="flex flex-col gap-3 shrink-0">
                       <button 
                         onClick={() => onSave({
                             id: \`CTX-\${new Date().getFullYear()}-\${Math.floor(Math.random() * 900) + 100}\`,
                             mahakimId: result.mahakimId,
                             date: result.date,
                             type: result.type,
                             subject: result.subject,
                             court: result.court,
                             status: result.status,
                             nextSession: result.nextSession,
                             defendant: result.parties.find((p:any) => p.role.includes('متهم') || p.role.includes('مدعى عليه') || p.role.includes('مستأنف عليه'))?.name || 'مجهول'
                         })}
                         className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all hover:-translate-y-0.5"
                       >
                         <DownloadCloud className="size-5" />
                         حفظ القضية برمتها في القاعدة
                       </button>
                       <button onClick={() => setExtractMode('info')} className="text-xs font-bold text-stone-400 hover:text-stone-600 underline text-center decoration-stone-300">
                          إلغاء والعودة للبوابة
                       </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
                     <ResultField label="رقم محاكم الشامل" value={result.mahakimId} mono highlight />
                     <ResultField label="المحكمة المختصة" value={result.court} />
                     <ResultField label="تاريخ التسجيل" value={result.date} mono />
                     <ResultField label="نوع القضية" value={result.type} />
                     <ResultField label="تاريخ الجلسة / آخر إجراء" value={result.nextSession} mono />
                     <ResultField label="الموضوع" value={result.subject} />
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                     {/* Parties */}
                     <div>
                       <h4 className="font-bold text-stone-800 border-b border-stone-200 pb-3 mb-5 flex items-center gap-2 text-base">
                          <User className="size-5 text-emerald-600"/>
                          الأطراف (الخصوم)
                       </h4>
                       <div className="bg-stone-50 border border-stone-200 rounded-xl overflow-hidden shadow-sm">
                          <table className="w-full text-sm text-right">
                             <thead className="bg-stone-100/50 text-stone-500 font-bold border-b border-stone-200">
                                <tr>
                                  <th className="px-5 py-4 w-1/3">الصفة</th>
                                  <th className="px-5 py-4">الاسم / الهيئة</th>
                                </tr>
                             </thead>
                             <tbody className="divide-y divide-stone-100">
                                {result.parties.map((p: any, idx: number) => (
                                  <tr key={idx}>
                                    <td className="px-5 py-4 font-bold text-stone-600"><span className="bg-white border border-stone-200 px-3 py-1.5 rounded-lg text-xs shadow-sm">{p.role}</span></td>
                                    <td className="px-5 py-4 font-bold text-stone-800 text-base">{p.name}</td>
                                  </tr>
                                ))}
                             </tbody>
                          </table>
                       </div>
                     </div>

                     {/* Procedures */}
                     <div>
                       <h4 className="font-bold text-stone-800 border-b border-stone-200 pb-3 mb-5 flex items-center gap-2 text-base">
                          <Activity className="size-5 text-emerald-600"/>
                          لائحة الإجراءات
                       </h4>
                       {result.procedures?.length > 0 ? (
                          <div className="space-y-5 relative before:absolute before:inset-0 before:mr-[19px] before:top-4 before:h-full before:w-0.5 before:bg-stone-200">
                             {result.procedures.map((proc: any, idx: number) => (
                                <div key={idx} className="relative flex items-start gap-5">
                                   <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-emerald-100 text-emerald-600 shadow-sm shrink-0 z-10 mt-1">
                                     <CheckCircle2 className="size-5" />
                                   </div>
                                   <div className="flex-1 p-5 rounded-2xl border border-stone-200 bg-white shadow-sm flex flex-col gap-1 hover:border-emerald-200 transition-colors">
                                      <p className="font-mono text-sm text-stone-400 mb-1">{proc.date}</p>
                                      <p className="font-bold text-base text-stone-800">{proc.action}</p>
                                      {proc.decision && proc.decision !== '-' && <p className="text-xs font-bold text-emerald-700 bg-emerald-50 self-start px-3 py-1.5 rounded-lg mt-3 flex items-center gap-1.5"><Gavel className="size-4"/> القرار: {proc.decision}</p>}
                                   </div>
                                </div>
                             ))}
                          </div>
                       ) : (
                          <div className="bg-stone-50 border border-stone-100 rounded-2xl p-10 text-center text-stone-500 text-base font-bold">
                             لم يتم العثور على إجراءات في النص المستخرج.
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

function ResultField({ label, value, mono, status, highlight }: { label: string, value: string, mono?: boolean, status?: boolean, highlight?: boolean }) {
   return (
      <div className={\`flex flex-col gap-2 p-5 rounded-2xl border \${highlight ? 'border-emerald-200 bg-emerald-50 shadow-sm' : 'border-stone-200 bg-white shadow-sm'}\`}>
         <span className="text-xs font-bold text-stone-500">{label}</span>
         <span className={\`text-base \${mono ? 'font-mono text-stone-600' : 'font-bold text-stone-800'} \${highlight ? 'text-emerald-900 font-black text-lg' : ''}\`}>{value}</span>
      </div>
   );
}
`

fs.writeFileSync('src/views/Contentieux.tsx', newContent);
console.log('Successfully wrote missing target content to file');
