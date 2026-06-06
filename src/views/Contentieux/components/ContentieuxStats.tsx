import React, { useState } from 'react';
import { X, PieChartIcon, TrendingUp, BarChart3, AlertCircle, Sparkles, Bot, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { Case } from '../Contentieux';

export function ContentieuxStats({ cases, onClose }: { cases: Case[], onClose: () => void }) {
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const fetchAiAnalysis = async () => {
    setIsAnalyzing(true);
    setAiAnalysis(null);
    try {
      const response = await fetch('/api/analyze-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cases })
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
  const totalFinesAndComps = cases.reduce((sum, c) => sum + (parseFloat(c.fine || '0') || 0) + (parseFloat(c.compensation || '0') || 0), 0);
  const totalRecovered = cases.reduce((sum, c) => sum + (parseFloat(c.executionAmountRecovered || '0') || 0), 0);
  
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

  const executionRate = judgedCases.length > 0 ? ((cases.filter(c => c.executionStatus?.includes('منفذ')).length / judgedCases.length) * 100).toFixed(1) : '0';
  const notificationRate = judgedCases.length > 0 ? ((notifiedCases.length / judgedCases.length) * 100).toFixed(1) : '0';
  const recoveryRate = totalFinesAndComps > 0 ? ((totalRecovered / totalFinesAndComps) * 100).toFixed(1) : '0';

  const COLORS = ['#059669', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#8b5cf6', '#ec4899'];

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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             {/* Execution Status Chart */}
             <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
                <h3 className="font-bold text-stone-800 mb-6 text-center">حالة تنفيذ الأحكام (Taux d'exécution)</h3>
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
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
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

          </div>
        </div>
      </div>
    </div>
  );
}
