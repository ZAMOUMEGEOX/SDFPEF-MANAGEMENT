import React, { useState, useMemo } from 'react';
import { X, PieChartIcon, TrendingUp, BarChart3, AlertCircle, Sparkles, Bot, Loader2, ShieldAlert, CalendarClock, Users, MousePointerClick } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { Case } from '../Contentieux';
import type { PVRecord } from '../Contentieux';
import { computeDeadlines, buildRepeatOffenderIndex, getQualityFlags } from '@/lib/caseAnalysis';

/** قراءة مبلغ مالي قد يحوي فواصل آلاف/مسافات/أرقاماً عربية. */
function parseAmount(v?: string | number | null): number {
  if (v == null) return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
       .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
       .replace(/[^\d.,-]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else s = s.replace(/,/g, '.');
  const parts = s.split('.');
  if (parts.length > 2) s = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
/** منفَّذ (جزئياً أو كلياً) — مطابقة صريحة بدل احتواء نصّي هشّ. */
function isExecuted(c: { executionStatus?: string }): boolean {
  const s = (c.executionStatus || '').trim();
  return s === 'منفذ كليا' || s === 'منفذ جزئيا';
}

/** أوامر التنقل التي يمكن لبطاقات/مبيانات الإحصائيات إصدارها لتصفية القائمة الرئيسية */
export type StatsNavigateAction =
  | { type: 'search'; query: string }
  | { type: 'execStatus'; value: string }
  | { type: 'deadlineSoon' }
  | { type: 'needsReview' }
  | { type: 'repeatOffenders' };

export function ContentieuxStats({ cases, pvRecords = [], onClose, onNavigate }: { cases: Case[], pvRecords?: PVRecord[], onClose: () => void, onNavigate?: (action: StatsNavigateAction) => void }) {
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const fetchAiAnalysis = async () => {
    setIsAnalyzing(true);
    setAiAnalysis(null);
    try {
      // حماية الخصوصية: لا تُرسَل أسماء الأطراف/الخصوم لجهة خارجية. نُرسل نسخة
      // مُعمّاة تحتفظ بالحقول التحليلية (محكمة/نوع/وضعية/تواريخ/مبالغ) فقط.
      const redactedCases = cases.map((c, i) => ({
        ...c,
        defendant: c.defendant ? `طرف#${i + 1}` : c.defendant,
        parties: (c.parties || []).map((p, j) => ({ role: p.role, name: `طرف#${i + 1}.${j + 1}` })),
        auditLog: undefined,
      }));
      const response = await fetch('/api/analyze-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cases: redactedCases })
      });
      const data = await response.json();
      if (data.analysis) {
        setAiAnalysis(data.analysis);
      } else {
        setAiAnalysis("Erreur: Impossible de générer l'analyse.");
      }
    } catch(err) {
      setAiAnalysis("Erreur de connexion avec l'IA.");
    } finally {
      setIsAnalyzing(false);
    }
  };
  // Statistics calculations
  const totalCases = cases.length;
  
  // 1. Status Distribution
  const statusCounts = cases.reduce((acc, c) => {
    const s = c.status || 'غير محدد';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  // 2. Execution Status
  const executionCounts = cases.reduce((acc, c) => {
    // Only consider cases that have a judgment
    if (!c.status.includes('حكم') && !c.status.includes('قرار') && !c.executionStatus) return acc;
    const s = c.executionStatus || 'لم يبدأ بعد';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const executionData = Object.entries(executionCounts).map(([name, value]) => ({ name, value }));

  // 3. Financials (Fines + Compensations vs Recovered)
  const totalFinesAndComps = cases.reduce((sum, c) => sum + parseAmount(c.fine) + parseAmount(c.compensation), 0);
  const totalRecovered = cases.reduce((sum, c) => sum + parseAmount(c.executionAmountRecovered), 0);
  
  const financialData = [
    { name: 'مبالغ محكوم بها', value: totalFinesAndComps, color: '#f97316' },
    { name: 'مبالغ مستخلصة', value: totalRecovered, color: '#10b981' }
  ];

  // 4. Notification Taux
  const judgedCases = cases.filter(c => c.status.includes('حكم') || c.status.includes('قرار'));
  const notifiedCases = judgedCases.filter(c => c.notificationMethod && c.notificationMethod !== 'تعذر التبليغ' && c.notificationMethod !== '');
  const unnotifiedCases = judgedCases.filter(c => !c.notificationMethod || c.notificationMethod === 'تعذر التبليغ');

  const notificationData = [
    { name: 'تم التبليغ', value: notifiedCases.length },
    { name: 'لم يبلغ / تعذر', value: unnotifiedCases.length }
  ];

  const executionRate = judgedCases.length > 0 ? ((cases.filter(isExecuted).length / judgedCases.length) * 100).toFixed(1) : '0';
  const notificationRate = judgedCases.length > 0 ? ((notifiedCases.length / judgedCases.length) * 100).toFixed(1) : '0';
  const recoveryRate = totalFinesAndComps > 0 ? ((totalRecovered / totalFinesAndComps) * 100).toFixed(1) : '0';

  const COLORS = ['#059669', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#8b5cf6', '#ec4899'];

  /** يستدعي onNavigate إن وُجد، ويُغلق اللوحة بحيث تظهر القائمة المُصفّاة فوراً */
  const nav = (action: StatsNavigateAction) => {
    if (!onNavigate) return;
    onNavigate(action);
  };

  // 5. الآجال القانونية حسب الخطورة (عبر جميع الملفات)
  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = { expired: 0, critical: 0, warning: 0, ok: 0 };
    for (const c of cases) for (const d of computeDeadlines(c)) counts[d.severity] = (counts[d.severity] || 0) + 1;
    return counts;
  }, [cases]);
  const severityData = [
    { name: 'منتهٍ', key: 'expired', value: severityCounts.expired, color: '#dc2626' },
    { name: 'حرج (≤3أ)', key: 'critical', value: severityCounts.critical, color: '#f97316' },
    { name: 'قريب (≤10أ)', key: 'warning', value: severityCounts.warning, color: '#f59e0b' },
    { name: 'عادي', key: 'ok', value: severityCounts.ok, color: '#10b981' },
  ];
  const criticalDeadlineFiles = severityCounts.expired + severityCounts.critical;

  // 6. أكثر الخصوم عوداً (تكرار نفس الخصم في عدة ملفات)
  const topRepeatOffenders = useMemo(() => {
    const idx = buildRepeatOffenderIndex(cases);
    return Array.from(idx.entries())
      .filter(([, arr]) => arr.length > 1)
      .map(([name, arr]) => ({ name, count: arr.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [cases]);

  // 7. ملفات تحتاج تدقيقاً (جودة البيانات)
  const needsReviewCount = useMemo(() => cases.filter(c => c.needsReview || getQualityFlags(c).length > 0).length, [cases]);

  // 8. توزيع الملفات حسب المحكمة والنوع (لائحة 16: مزيد من زوايا التحليل)
  const courtDist = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of cases) { const k = c.court || 'غير محدد'; counts[k] = (counts[k] || 0) + 1; }
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [cases]);
  const typeDist = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of cases) { const k = c.type || 'غير محدد'; counts[k] = (counts[k] || 0) + 1; }
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [cases]);

  // 9. إحصاء محاضر الضابطة القضائية (يظهر فقط إن مُرّرت المحاضر)
  const pvStats = useMemo(() => {
    const total = pvRecords.length;
    const linked = pvRecords.filter(p => !!p.linkedCaseId).length;
    const withFileNum = pvRecords.filter(p => !!(p.linkedFileNumber || (p as any).fileNum)).length;
    return { total, linked, unlinked: total - linked, withFileNum, withoutFileNum: total - withFileNum };
  }, [pvRecords]);

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center md:p-4 z-50 md:overflow-y-auto" dir="rtl">
      <div className="bg-stone-50 md:rounded-2xl w-full h-full md:h-auto md:max-h-[90vh] max-w-6xl shadow-2xl relative flex flex-col md:my-8 animate-in zoom-in-95">
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-stone-200 bg-white md:rounded-t-2xl shrink-0 sticky top-0 z-10 pt-[max(1rem,env(safe-area-inset-top))]">
          <h2 className="text-lg md:text-xl font-black text-stone-800 flex items-center gap-2">
            <PieChartIcon className="size-5 md:size-6 text-emerald-600" />
            لوحة المبيانات والإحصائيات
          </h2>
          <div className="flex items-center gap-4">
            <button 
              onClick={fetchAiAnalysis}
              disabled={isAnalyzing}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white rounded-xl font-bold text-sm shadow-md transition-all hover:scale-105 disabled:opacity-70 disabled:scale-100"
            >
              {isAnalyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {isAnalyzing ? "Analyse en cours..." : "Générer Rapport IA"}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
              <X className="size-5 text-stone-500" />
            </button>
          </div>
        </div>

        <div className="p-4 md:p-6 overflow-y-auto flex-1 space-y-6 md:space-y-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">

          {/* إحصاء محاضر الضابطة القضائية */}
          {pvStats.total > 0 && (
            <div className="bg-white p-4 md:p-6 rounded-2xl border border-blue-100 shadow-sm">
              <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2">
                <CalendarClock className="size-4 text-blue-600" /> محاضر الضابطة القضائية
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'إجمالي المحاضر', value: pvStats.total, cls: 'text-blue-700' },
                  { label: 'مربوطة بملف', value: pvStats.linked, cls: 'text-emerald-600' },
                  { label: 'غير مربوطة', value: pvStats.unlinked, cls: 'text-amber-600' },
                  { label: 'بلا رقم ملف زجري', value: pvStats.withoutFileNum, cls: 'text-red-500' },
                ].map((s, i) => (
                  <div key={i} className="bg-stone-50 rounded-xl p-3 text-center border border-stone-100">
                    <p className={`text-2xl font-black ${s.cls}`}>{s.value}</p>
                    <p className="text-[11px] text-stone-500 mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* AI Analysis Section */}
          {(aiAnalysis || isAnalyzing) && (
             <div className="bg-gradient-to-r from-emerald-50 to-emerald-100/50 border border-emerald-200 p-6 rounded-2xl shadow-sm relative overflow-hidden animate-in slide-in-from-top-2">
                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                <h3 className="font-bold text-emerald-800 mb-4 flex items-center gap-2">
                   <Bot className="size-5 text-emerald-600" />
                   Rapport Stratégique IA (AtlasIA)
                </h3>
                {isAnalyzing ? (
                  <div className="text-emerald-700 flex flex-col items-center justify-center py-6 gap-3">
                    <Loader2 className="size-8 animate-spin text-emerald-600" />
                    <p className="text-sm font-medium">L'intelligence artificielle analyse le portefeuille des dossiers contentieux...</p>
                  </div>
                ) : (
                  <div 
                    className="prose prose-sm prose-emerald max-w-none text-stone-700 font-medium"
                    dangerouslySetInnerHTML={{ __html: aiAnalysis as string }}
                  />
                )}
             </div>
          )}

          {/* Key Rates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-emerald-100 shadow-sm">
               <div className="flex justify-between items-start mb-4">
                  <h3 className="font-bold text-emerald-800">نسبة التبليغ</h3>
                  <div className="p-2 bg-emerald-50 rounded-xl"><AlertCircle className="size-5 text-emerald-600" /></div>
               </div>
               <div className="flex items-end gap-2">
                  <span className="text-4xl font-black text-emerald-600 font-mono">{notificationRate}%</span>
                  <span className="text-sm text-stone-500 mb-1">من الأحكام</span>
               </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-blue-100 shadow-sm">
               <div className="flex justify-between items-start mb-4">
                  <h3 className="font-bold text-blue-800">نسبة التنفيذ</h3>
                  <div className="p-2 bg-blue-50 rounded-xl"><TrendingUp className="size-5 text-blue-600" /></div>
               </div>
               <div className="flex items-end gap-2">
                  <span className="text-4xl font-black text-blue-600 font-mono">{executionRate}%</span>
                  <span className="text-sm text-stone-500 mb-1">من الأحكام</span>
               </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-orange-100 shadow-sm">
               <div className="flex justify-between items-start mb-4">
                  <h3 className="font-bold text-orange-800">نسبة الاستخلاص المالي</h3>
                  <div className="p-2 bg-orange-50 rounded-xl"><BarChart3 className="size-5 text-orange-600" /></div>
               </div>
               <div className="flex items-end gap-2">
                  <span className="text-4xl font-black text-orange-600 font-mono">{recoveryRate}%</span>
                  <span className="text-sm text-stone-500 mb-1">من المبالغ المحكوم بها</span>
               </div>
            </div>

            <button onClick={() => nav({ type: 'deadlineSoon' })}
              className="bg-white p-6 rounded-2xl border border-red-100 shadow-sm text-right hover:shadow-md hover:-translate-y-0.5 transition-all">
               <div className="flex justify-between items-start mb-4">
                  <h3 className="font-bold text-red-800">آجال حرجة/منتهية</h3>
                  <div className="p-2 bg-red-50 rounded-xl"><CalendarClock className="size-5 text-red-600" /></div>
               </div>
               <div className="flex items-end gap-2">
                  <span className="text-4xl font-black text-red-600 font-mono">{criticalDeadlineFiles}</span>
                  <span className="text-sm text-stone-500 mb-1">أجل عاجل</span>
               </div>
               {onNavigate && <p className="text-[10px] text-stone-400 mt-2 flex items-center gap-1"><MousePointerClick className="size-3" /> انقر للتصفية</p>}
            </button>

            <button onClick={() => nav({ type: 'needsReview' })}
              className="bg-white p-6 rounded-2xl border border-amber-100 shadow-sm text-right hover:shadow-md hover:-translate-y-0.5 transition-all">
               <div className="flex justify-between items-start mb-4">
                  <h3 className="font-bold text-amber-800">يحتاج تدقيق</h3>
                  <div className="p-2 bg-amber-50 rounded-xl"><ShieldAlert className="size-5 text-amber-600" /></div>
               </div>
               <div className="flex items-end gap-2">
                  <span className="text-4xl font-black text-amber-600 font-mono">{needsReviewCount}</span>
                  <span className="text-sm text-stone-500 mb-1">ملف</span>
               </div>
               {onNavigate && <p className="text-[10px] text-stone-400 mt-2 flex items-center gap-1"><MousePointerClick className="size-3" /> انقر للتصفية</p>}
            </button>
          </div>


          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             {/* Execution Status Chart */}
             <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
                <h3 className="font-bold text-stone-800 mb-6 text-center">حالة تنفيذ الأحكام (Taux d'exécution)</h3>
                {onNavigate && <p className="text-[10px] text-stone-400 text-center mb-2 flex items-center justify-center gap-1"><MousePointerClick className="size-3" /> انقر على قطاع للتصفية</p>}
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={executionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {executionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]}
                            style={{ cursor: onNavigate ? 'pointer' : 'default' }}
                            onClick={() => nav({ type: 'execStatus', value: entry.name === 'لم يبدأ بعد' ? '__not_started__' : entry.name })} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
             </div>

             {/* Notification Chart */}
             <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
                <h3 className="font-bold text-stone-800 mb-6 text-center">حالة التبليغات (Taux de Notification)</h3>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={notificationData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        <Cell fill="#059669" />
                        <Cell fill="#ef4444" />
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
             </div>

             {/* Financial Chart */}
             <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm lg:col-span-2">
                <h3 className="font-bold text-stone-800 mb-6 text-center">المداخيل الزجرية (المحكوم به مقابل المستخلص)</h3>
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={financialData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(val) => `${val.toLocaleString()} د.م`} axisLine={false} tickLine={false} />
                      <RechartsTooltip formatter={(val: number) => [`${val.toLocaleString()} درهم`, 'المبلغ']} />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                        {financialData.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
             </div>

             {/* توزيع الملفات حسب الوضعية */}
             <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
                <h3 className="font-bold text-stone-800 mb-6 text-center">توزيع الملفات حسب الوضعية</h3>
                {onNavigate && <p className="text-[10px] text-stone-400 text-center mb-2 flex items-center justify-center gap-1"><MousePointerClick className="size-3" /> انقر على قطاع للتصفية</p>}
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label={({name, percent}) => `${(percent * 100).toFixed(0)}%`}
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]}
                            style={{ cursor: onNavigate ? 'pointer' : 'default' }}
                            onClick={() => nav({ type: 'search', query: entry.name })} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
             </div>

             {/* الآجال القانونية حسب الخطورة */}
             <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
                <h3 className="font-bold text-stone-800 mb-6 text-center">الآجال القانونية حسب الخطورة (كل الملفات)</h3>
                {onNavigate && <p className="text-[10px] text-stone-400 text-center mb-2 flex items-center justify-center gap-1"><MousePointerClick className="size-3" /> انقر على «منتهٍ» أو «حرج» للتصفية</p>}
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={severityData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
                      <RechartsTooltip />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                        {severityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color}
                            style={{ cursor: (onNavigate && (entry.key === 'expired' || entry.key === 'critical')) ? 'pointer' : 'default' }}
                            onClick={() => { if (entry.key === 'expired' || entry.key === 'critical') nav({ type: 'deadlineSoon' }); }} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
             </div>

             {/* توزيع الملفات حسب المحكمة */}
             <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
                <h3 className="font-bold text-stone-800 mb-6 text-center">توزيع الملفات حسب المحكمة (أعلى 8)</h3>
                {onNavigate && <p className="text-[10px] text-stone-400 text-center mb-2 flex items-center justify-center gap-1"><MousePointerClick className="size-3" /> انقر على عمود للتصفية</p>}
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={courtDist} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} angle={-30} textAnchor="end" interval={0} height={60} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
                      <RechartsTooltip />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#3b82f6">
                        {courtDist.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill="#3b82f6"
                            style={{ cursor: onNavigate ? 'pointer' : 'default' }}
                            onClick={() => nav({ type: 'search', query: entry.name })} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
             </div>

             {/* توزيع الملفات حسب النوع */}
             <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
                <h3 className="font-bold text-stone-800 mb-6 text-center">توزيع الملفات حسب النوع (أعلى 8)</h3>
                {onNavigate && <p className="text-[10px] text-stone-400 text-center mb-2 flex items-center justify-center gap-1"><MousePointerClick className="size-3" /> انقر على عمود للتصفية</p>}
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={typeDist} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} angle={-30} textAnchor="end" interval={0} height={60} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
                      <RechartsTooltip />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#8b5cf6">
                        {typeDist.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill="#8b5cf6"
                            style={{ cursor: onNavigate ? 'pointer' : 'default' }}
                            onClick={() => nav({ type: 'search', query: entry.name })} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
             </div>

             {/* أكثر الخصوم عوداً */}
             {topRepeatOffenders.length > 0 && (
               <div className="bg-white p-6 rounded-2xl border border-purple-100 shadow-sm lg:col-span-2">
                  <h3 className="font-bold text-stone-800 mb-1 text-center flex items-center justify-center gap-2"><Users className="size-4 text-purple-600" /> أكثر الخصوم عوداً (تتبع العود)</h3>
                  <p className="text-xs text-stone-400 text-center mb-4">أسماء ظهرت في أكثر من ملف واحد كخصم/متهم</p>
                  {onNavigate && <p className="text-[10px] text-stone-400 text-center mb-2 flex items-center justify-center gap-1"><MousePointerClick className="size-3" /> انقر على اسم لعرض ملفاته</p>}
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topRepeatOffenders} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                        <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" width={160} axisLine={false} tickLine={false} />
                        <RechartsTooltip formatter={(val: number) => [`${val} ملف`, 'عدد الملفات']} />
                        <Bar dataKey="count" radius={[0, 8, 8, 0]} fill="#a855f7">
                          {topRepeatOffenders.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill="#a855f7"
                              style={{ cursor: onNavigate ? 'pointer' : 'default' }}
                              onClick={() => nav({ type: 'search', query: entry.name })} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
               </div>
             )}


          </div>
        </div>
      </div>
    </div>
  );
}