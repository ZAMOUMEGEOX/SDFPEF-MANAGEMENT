import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, Plus, FileText, CheckCircle2, Clock, AlertCircle, ChevronLeft, Scale, Shield, User, FilePlus2, Check, ExternalLink, Calendar, Gavel, FileCheck2, Activity, Landmark, MapPin, AlertTriangle, DownloadCloud, LayoutTemplate, ClipboardPaste, Wand2, Lock, FileDigit, MousePointerClick, Copy, Trash2, Download, Printer, PieChartIcon } from 'lucide-react';
import { CaseWizard } from './components/CaseWizard';
import { ContentieuxStats } from './components/ContentieuxStats';
import { loadCases, saveCase, deleteCase, deleteCases } from '@/lib/contentieux';

export interface Case {
  id: string; // N° de dossier interne
  mahakimId?: string; // N° Mahakim Complet (ex: 2024/1101/221)
  fileNumber?: string; // رقم الملف
  fileSymbol?: string; // رمز الملف
  fileYear?: string; // سنة الملف
  nationalId?: string; // الرقم الوطني
  date: string; // Date d'ouverture
  type: string; // Type de dossier (Civil, Répressif, etc.)
  subject: string; // Objet du litige
  court: string; // Juridiction
  status: string; // Statut (En cours, Jugé, etc.)
  nextSession?: string; // Date prochaine audience
  defendant?: string; // Nom de la partie adverse
  createdAt?: string; // Date de création dans notre système
  judge?: string; // المستشار أو القاضي المقرر
  section?: string; // الشعبة
  courtLevel?: string; // الدرجة
  
  // Forestry violation specific fields
  pvNumber?: string; // رقم المحضر
  pvDate?: string; // تاريخ المحضر
  offenseType?: string; // نوع الجنحة/المخالفة
  pvStatus?: string; // حالة المحضر
  fine?: string; // الغرامة
  compensation?: string; // التعويضات
  restitution?: string; // الإرجاع
  reconciliation?: boolean; // هل تم التصالح؟
  otherSanctions?: string; // عقوبات أخرى

  // Execution tracking
  executionStatus?: string; // حالة التنفيذ
  executionObstacle?: string; // العوائق والتأخر
  notificationMethod?: string; // طريقة التبليغ
  notificationDate?: string; // تاريخ التبليغ
  executionDate?: string; // تاريخ التنفيذ
  executionAmountRecovered?: string; // المبالغ المستخلصة

  procedures?: {date: string, action: string, decision: string, number?: string}[];
  parties?: {role: string, name: string}[];
}

const recentCases: Case[] = [
  { id: 'CTX-2024-001', mahakimId: '2024/1101/221', date: '2024-03-15', type: 'مدني', subject: 'الترامي على الملك الغابوي', court: 'المحكمة الابتدائية بتطوان', status: 'جلسة مبرمجة', nextSession: '2024-06-15', defendant: 'أحمد التطواني', procedures: [{date: '2024-03-15', action: 'تسجيل المقال', decision: '-'}, {date: '2024-05-15', action: 'إدراج الجلسة', decision: 'تأخير لإعداد الدفاع'}], parties: [{role: 'المدعي', name: 'لإدارة المياه والغابات'}, {role: 'المدعى عليه', name: 'أحمد التطواني'}] },
  { id: 'CTX-2024-002', mahakimId: '2023/7101/458', date: '2023-11-02', type: 'جنحي', subject: 'قطع الأشجار بدون مرخص', court: 'محكمة الاستئناف بالقنيطرة', status: 'محجوز للمداولة', defendant: 'مجهول' },
  { id: 'CTX-2024-003', date: '2024-01-20', type: 'إداري', subject: 'طعن في قرار الإفراغ', court: 'المحكمة الإدارية بالرباط', status: 'قيد التحقيق', nextSession: '2024-05-10', defendant: 'شركة البناء الحديث' },
];

function CaseDetail({ caseData, onBack, onDelete, onEdit }: { caseData: Case, onBack: () => void, onDelete: (id: string) => void, onEdit: () => void }) {
  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      <div className="flex items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-sm border border-stone-200">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 bg-stone-50 hover:bg-stone-100 text-stone-700 font-bold rounded-xl transition-colors border border-stone-200">
             <ChevronLeft className="size-4" />
             الرجوع للائحة الملفات
          </button>
          <div className="border-r-2 border-stone-200 pr-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              ملف رقم: <span className="font-mono text-emerald-700">{caseData.mahakimId || caseData.id}</span>
            </h2>
            {caseData.mahakimId && <p className="text-sm text-stone-500 font-mono mt-1">المرجع الداخلي: {caseData.id}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={onEdit}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg font-bold text-sm transition-colors"
          >
            <Activity className="size-4" /> تعديل الملف
          </button>
          <button 
            onClick={() => {
              onDelete(caseData.id);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-bold text-sm transition-colors"
          >
            <Trash2 className="size-4" /> حذف الملف
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-6">
             <h3 className="font-bold text-lg border-b border-stone-100 pb-3 flex items-center gap-2">
               <Activity className="size-5 text-emerald-600" />
               لائحة الإجراءات والجلسات (Chronologie)
             </h3>
             {caseData.procedures && caseData.procedures.length > 0 ? (
               <div className="relative before:absolute before:right-4 before:top-2 before:bottom-2 before:w-px before:bg-stone-200 space-y-6">
                 {caseData.procedures.map((proc, idx) => (
                   <div key={idx} className="relative pl-4 pr-12">
                      <div className="absolute right-2.5 top-1 size-3 rounded-full bg-emerald-500 ring-4 ring-emerald-50"></div>
                      <div className="bg-stone-50 border border-stone-100 rounded-xl p-4">
                        <div className="flex justify-between items-start mb-2">
                          <p className="font-bold text-stone-800 text-sm">{proc.action}</p>
                          <span className="font-mono text-xs font-bold text-stone-500 bg-white px-2 py-1 rounded border border-stone-200">{proc.date}</span>
                        </div>
                        <p className="text-sm text-stone-600">{proc.decision}</p>
                      </div>
                   </div>
                 ))}
               </div>
             ) : (
               <div className="text-center py-8 text-stone-500">
                  <Clock className="size-8 text-stone-300 mx-auto mb-3" />
                  <p className="text-sm">لا توجد إجراءات مسجلة بعد</p>
               </div>
             )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
             <h3 className="font-bold border-b border-stone-100 pb-3 flex items-center gap-2">
               <FileText className="size-5 text-stone-400" /> تفاصيل الملف
             </h3>
             <div className="space-y-4">
               <div>
                  <label className="text-xs text-stone-500">المحكمة</label>
                  <p className="font-bold text-sm text-stone-800">{caseData.court}</p>
               </div>
               <div>
                  <label className="text-xs text-stone-500">موضوع النزاع</label>
                  <p className="font-bold text-sm text-stone-800">{caseData.subject}</p>
               </div>
               <div>
                  <label className="text-xs text-stone-500">تاريخ التسجيل</label>
                  <p className="font-bold font-mono text-sm text-stone-800">{caseData.date}</p>
               </div>
               <div>
                  <label className="text-xs text-stone-500">النوع</label>
                  <p className="font-bold text-sm text-stone-800">{caseData.type}</p>
               </div>
             </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
             <h3 className="font-bold border-b border-stone-100 pb-3 flex items-center gap-2">
               <User className="size-5 text-stone-400" /> لائحة الأطراف (الخصوم)
             </h3>
             {caseData.parties && caseData.parties.length > 0 ? (
               <div className="space-y-3">
                 {caseData.parties.map((party, idx) => (
                   <div key={idx} className="bg-stone-50 p-3 rounded-xl border border-stone-100">
                      <p className="text-[11px] font-bold text-emerald-600 mb-1">{party.role}</p>
                      <p className="font-bold text-sm text-stone-800">{party.name}</p>
                   </div>
                 ))}
               </div>
             ) : (
               <div className="bg-stone-50 p-3 rounded-xl border border-stone-100">
                  <p className="text-[11px] font-bold text-emerald-600 mb-1">ضد</p>
                  <p className="font-bold text-sm text-stone-800">{caseData.defendant || 'غير محدد'}</p>
               </div>
             )}
          </div>

          {(caseData.pvNumber || caseData.offenseType) && (
             <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4 animate-in slide-in-from-bottom-2">
                <h3 className="font-bold border-b border-stone-100 pb-3 flex items-center gap-2">
                  <Shield className="size-5 text-stone-400" /> معلومات المخالفة
                </h3>
                <div className="space-y-4">
                  {caseData.pvNumber && (
                    <div>
                        <label className="text-xs text-stone-500">رقم المحضر</label>
                        <p className="font-bold font-mono text-sm text-stone-800">{caseData.pvNumber}</p>
                        {caseData.pvDate && (
                           <div className="flex items-center gap-4 mt-0.5">
                             <p className="text-xs text-stone-500">{caseData.pvDate}</p>
                             <p className="text-[11px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100 flex items-center gap-1.5" title="التقادم: 6 أشهر بعد ختم المحضر. 3 سنوات في حالة عدم تحرير محضر">
                               <AlertCircle className="size-3" /> التقادم: {
                                  (() => {
                                     try {
                                        const d = new Date(caseData.pvDate);
                                        if (isNaN(d.getTime())) return '';
                                        d.setMonth(d.getMonth() + 6);
                                        return d.toISOString().split('T')[0];
                                     } catch (e) {
                                        return '';
                                     }
                                  })()
                               }
                             </p>
                           </div>
                        )}
                    </div>
                  )}
                  {caseData.offenseType && (
                    <div>
                        <label className="text-xs text-stone-500">نوع الجنحة / المخالفة</label>
                        <p className="font-bold text-sm text-stone-800">{caseData.offenseType}</p>
                    </div>
                  )}
                  {caseData.pvStatus && (
                    <div>
                        <label className="text-xs text-stone-500">مآل المحضر / المتابعة</label>
                        <p className="font-bold text-sm text-blue-700">{caseData.pvStatus}</p>
                    </div>
                  )}
                  {caseData.fine && (
                    <div>
                        <label className="text-xs text-stone-500">الغرامة المحددة</label>
                        <p className="font-bold text-sm text-stone-800 font-mono">{caseData.fine} درهم</p>
                    </div>
                  )}
                  {(caseData.compensation || caseData.restitution || caseData.otherSanctions) && (
                    <div className="pt-2 border-t border-stone-100 space-y-2">
                       {caseData.compensation && (
                         <div className="flex justify-between items-center text-sm">
                           <span className="text-stone-500">التعويضات:</span>
                           <span className="font-bold font-mono text-stone-800">{caseData.compensation} درهم</span>
                         </div>
                       )}
                       {caseData.restitution && (
                         <div className="flex justify-between items-center text-sm">
                           <span className="text-stone-500">الإرجاع:</span>
                           <span className="font-bold text-stone-800">{caseData.restitution}</span>
                         </div>
                       )}
                       {caseData.otherSanctions && (
                         <div className="flex justify-between items-center text-sm pt-1 border-t border-stone-50">
                           <span className="text-stone-500">عقوبات أخرى:</span>
                           <span className="font-bold text-red-600">{caseData.otherSanctions}</span>
                         </div>
                       )}
                    </div>
                  )}
                  {caseData.reconciliation && (
                    <div className="bg-emerald-50 text-emerald-800 p-3 rounded-xl border border-emerald-100 text-xs font-bold flex gap-2">
                       <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-emerald-600" />
                       <span className="leading-relaxed">تم إجراء الصلح بشأن هذه المخالفة وتسديد المبالغ المستحقة.</span>
                    </div>
                  )}
                </div>
             </div>
          )}

          {(caseData.executionStatus || caseData.executionAmountRecovered || caseData.notificationMethod) && (
             <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 shadow-sm space-y-4 animate-in slide-in-from-bottom-2">
                <h3 className="font-bold border-b border-emerald-200 pb-3 flex items-center gap-2 text-emerald-800">
                  <CheckCircle2 className="size-5 text-emerald-600" /> جناح التنفيذ والتبليغات
                </h3>
                <div className="space-y-4">
                  {caseData.executionStatus && (
                    <div>
                        <label className="text-xs text-emerald-600">حالة التنفيذ</label>
                        <p className="font-black text-sm text-emerald-900">{caseData.executionStatus}</p>
                    </div>
                  )}
                  {caseData.notificationMethod && (
                    <div>
                        <label className="text-xs text-emerald-600">طريقة التبليغ</label>
                        <div className="flex items-center gap-4">
                           <p className="font-bold text-sm text-stone-800">{caseData.notificationMethod}</p>
                           {caseData.notificationDate && <p className="text-xs text-stone-500 font-mono py-0.5 px-2 bg-white rounded border border-emerald-100">{caseData.notificationDate}</p>}
                        </div>
                    </div>
                  )}
                  {caseData.executionDate && (
                    <div>
                        <label className="text-xs text-emerald-600">تاريخ التنفيذ</label>
                        <p className="font-bold font-mono text-sm text-stone-800">{caseData.executionDate}</p>
                    </div>
                  )}
                  {caseData.executionAmountRecovered && (
                    <div>
                        <label className="text-xs text-emerald-600">المبالغ المستخلصة</label>
                        <p className="font-black text-emerald-700 font-mono text-lg">{caseData.executionAmountRecovered} <span className="text-xs text-emerald-600 font-bold ml-1">درهم</span></p>
                    </div>
                  )}
                  {caseData.executionObstacle && (
                    <div className="pt-2 border-t border-emerald-200">
                        <label className="text-xs text-orange-600 flex items-center gap-1.5 mb-1"><AlertCircle className="size-3.5" /> عائق التنفيذ / التأخر</label>
                        <p className="font-bold text-sm text-orange-800 bg-orange-50 p-3 rounded-xl border border-orange-100">{caseData.executionObstacle}</p>
                    </div>
                  )}
                </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Contentieux() {
  const [activeTab, setActiveTab] = useState<'local' | 'mahakim'>('local');
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [selectedCasesIds, setSelectedCasesIds] = useState<Set<string>>(new Set());
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardData, setWizardData] = useState<Case | null>(null);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  
  // Persist cases with localStorage
  const [cases, setCases] = useState<Case[]>([]);
const [isLoading, setIsLoading] = useState(true);

useEffect(() => {
  loadCases().then(({ data }) => {
    setCases(data.length > 0 ? data : recentCases);
    setIsLoading(false);
  });
}, []);

  useEffect(() => {
    const handleSearchItemSelected = (e: Event) => {
       const customEvent = e as CustomEvent;
       const detail = customEvent.detail;
       if (detail && detail.type === 'case' && detail.id) {
          const foundCase = cases.find(c => c.id === detail.id);
          if (foundCase) {
             setActiveTab('local');
             setSelectedCase(foundCase);
          }
       }
    };
    window.addEventListener('searchItemSelected', handleSearchItemSelected);
    return () => window.removeEventListener('searchItemSelected', handleSearchItemSelected);
  }, [cases]);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Case | 'reference', direction: 'asc' | 'desc' } | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [courtFilter, setCourtFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const uniqueTypes = useMemo(() => Array.from(new Set(cases.map(c => c.type).filter(Boolean))), [cases]);
  const uniqueCourts = useMemo(() => Array.from(new Set(cases.map(c => c.court).filter(Boolean))), [cases]);
  const uniqueYears = useMemo(() => Array.from(new Set(cases.map(c => c.date.substring(0, 4)).filter(Boolean))).sort((a,b) => Number(b)-Number(a)), [cases]);

  const processedCases = useMemo(() => {
    let result = [...cases];

    // Status Filter
    if (statusFilter !== 'all') {
      result = result.filter(c => {
         if (statusFilter === 'active') return !c.status.includes('حكم') && !c.status.includes('قرار');
         if (statusFilter === 'judged') return c.status.includes('حكم') || c.status.includes('قرار');
         return true;
      });
    }
    
    // Type Filter
    if (typeFilter !== 'all') {
      result = result.filter(c => c.type === typeFilter);
    }
    
    // Court Filter
    if (courtFilter !== 'all') {
      result = result.filter(c => c.court === courtFilter);
    }
    
    // Year Filter
    if (yearFilter !== 'all') {
      result = result.filter(c => c.date.startsWith(yearFilter));
    }

    // Search
    if (searchQuery.trim()) {
      const lowerQ = searchQuery.toLowerCase();
      result = result.filter(c => 
        c.id.toLowerCase().includes(lowerQ) || 
        (c.mahakimId && c.mahakimId.toLowerCase().includes(lowerQ)) ||
        c.subject.toLowerCase().includes(lowerQ) ||
        c.court.toLowerCase().includes(lowerQ) ||
        (c.defendant && c.defendant.toLowerCase().includes(lowerQ))
      );
    }

    // Sort
    if (sortConfig) {
      result.sort((a, b) => {
        let aVal: any = sortConfig.key === 'reference' ? (a.mahakimId || a.id) : a[sortConfig.key as keyof Case];
        let bVal: any = sortConfig.key === 'reference' ? (b.mahakimId || b.id) : b[sortConfig.key as keyof Case];
        
        if (aVal === undefined) aVal = '';
        if (bVal === undefined) bVal = '';

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [cases, searchQuery, sortConfig, statusFilter, typeFilter, courtFilter, yearFilter]);

  const handleSort = (key: keyof Case | 'reference') => {
    setSortConfig(current => ({
      key,
      direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

const handleSaveExtractedCase = async (newCase: Case) => {
  await saveCase(newCase);
  setCases(prev => [newCase, ...prev.filter(c => c.id !== newCase.id)]);
  setActiveTab('local');
};

  const handleSaveWizardCase = async (savedCase: Case) => {
  await saveCase(savedCase);
  setCases(prev => {
    const exists = prev.find(c => c.id === savedCase.id);
    if (exists) return prev.map(c => c.id === savedCase.id ? savedCase : c);
    return [savedCase, ...prev];
  });
  if (selectedCase && selectedCase.id === savedCase.id) {
    setSelectedCase(savedCase);
  }
  setIsWizardOpen(false);
  setWizardData(null);
};

  const handleDeleteCase = async (id: string) => {
  await deleteCase(id);
  setCases(cases.filter(c => c.id !== id));
  setSelectedCase(null);
  setSelectedCasesIds(prev => {
    const newSet = new Set(prev);
    newSet.delete(id);
    return newSet;
  });
};

  const handleToggleSelectCase = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCasesIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const handleToggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allIds = processedCases.map(c => c.id);
      setSelectedCasesIds(new Set(allIds));
    } else {
      setSelectedCasesIds(new Set());
    }
  };

const handleDeleteSelected = async () => {
  if (window.confirm(`هل أنت متأكد من حذف ${selectedCasesIds.size} ملف(ات)؟`)) {
    await deleteCases(Array.from(selectedCasesIds));
    setCases(cases.filter(c => !selectedCasesIds.has(c.id)));
    setSelectedCasesIds(new Set());
  }
};

  const handleExportSelectedCSV = () => {
    const selected = processedCases.filter(c => selectedCasesIds.has(c.id));
    if (selected.length === 0) return;
    
    const headers = ['المرجع', 'رقم محاكم', 'المحكمة', 'تاريخ التسجيل', 'الموضوع', 'النوع', 'وضعية الملف', 'الخصم', 'الجلسة القادمة'];
    const csvContent = [
      headers.join(','),
      ...selected.map(c => [
        `"${c.id}"`,
        `"${c.mahakimId || ''}"`,
        `"${c.court}"`,
        `"${c.date}"`,
        `"${c.subject}"`,
        `"${c.type}"`,
        `"${c.status}"`,
        `"${c.defendant || ''}"`,
        `"${c.nextSession || ''}"`
      ].join(','))
    ].join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ملفات_محددة_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.csv`;
    link.click();
  };

  const exportSingleCaseCSV = (c: Case) => {
    let csvContent = '\uFEFF'; // BOM for Excel

    // 1. General Info
    csvContent += "بطاقة الملف\n\n";
    csvContent += `"المحكمة","رقم الملف بالمحكمة","نوع الملف"\n`;
    csvContent += `"${c.court}","${c.mahakimId || ''}","${c.type}"\n`;
    
    csvContent += `"الرقم الوطني للملف","الشعبة","المستشار / القاضي المقرر"\n`;
    csvContent += `"${c.nationalId || ''}","${c.section || ''}","${c.judge || ''}"\n`;

    csvContent += `"تاريخ التسجيل","الموضوع","الوضعية / الجلسة القادمة"\n`;
    csvContent += `"${c.date}","${c.subject}","${c.status} ${c.nextSession ? ' (' + c.nextSession + ')' : ''}"\n\n\n`;

    // 2. Parties
    csvContent += "لائحة الأطراف\n\n";
    csvContent += `"الصفة","اسم الطرف"\n`;
    if (c.parties && c.parties.length > 0) {
       c.parties.forEach(p => {
          csvContent += `"${p.role}","${p.name}"\n`;
       });
    } else {
       csvContent += `"لا توجد أطراف مسجلة",""\n`;
    }
    csvContent += '\n\n';

    // 3. Procedures (Chronology)
    csvContent += "لائحة الإجراءات\n\n";
    csvContent += `"تاريخ الإجراء","نوع الإجراء","القرار"\n`;
    if (c.procedures && c.procedures.length > 0) {
       const parseDate = (dStr: string) => {
          if (!dStr) return 0;
          if (dStr.match(/\d{2}\/\d{2}\/\d{4}/)) {
             const parts = dStr.split('/');
             return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
          }
          return new Date(dStr).getTime() || 0;
       };
       
       const sortedProcedures = [...c.procedures].sort((a, b) => parseDate(b.date) - parseDate(a.date));

       sortedProcedures.forEach((p) => {
          csvContent += `"${p.date}","${p.action.replace(/"/g, '""')}","${p.decision.replace(/"/g, '""')}"\n`;
       });
    } else {
       csvContent += `"لا توجد إجراءات مسجلة","",""\n`;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `تفاصيل_الملف_${c.id}.csv`;
    link.click();
  };

  const printSingleCase = (c: Case) => {
    setSelectedCase(c);
    setTimeout(() => {
        window.print();
    }, 300);
  };

  const exportToCSV = () => {
    const headers = ['المرجع', 'رقم محاكم', 'المحكمة', 'تاريخ التسجيل', 'الموضوع', 'النوع', 'وضعية الملف', 'الخصم', 'الجلسة القادمة'];
    const csvContent = [
      headers.join(','),
      ...processedCases.map(c => [
        `"${c.id}"`,
        `"${c.mahakimId || ''}"`,
        `"${c.court}"`,
        `"${c.date}"`,
        `"${c.subject}"`,
        `"${c.type}"`,
        `"${c.status}"`,
        `"${c.defendant || ''}"`,
        `"${c.nextSession || ''}"`
      ].join(','))
    ].join('\n');
    
    // Add BOM for Excel UTF-8 display correctly
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `قضايا_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.csv`;
    link.click();
  };

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6 flex flex-col h-full" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-bold border-b-4 border-emerald-600 pb-2 inline-block">النزاعات والقضايا</h2>
          <p className="text-sm text-stone-500 mt-2">متابعة الملفات القضائية والتكامل مع نظام محاكم</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
          <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200 overflow-x-auto w-full sm:w-auto">
             <button 
               onClick={() => setActiveTab('local')} 
               className={`flex items-center justify-center flex-1 sm:flex-none gap-2 px-4 md:px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'local' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
             >
               <Scale className="size-4 shrink-0" /> <span className="whitespace-nowrap">القضايا المحلية</span>
             </button>
             <button 
               onClick={() => setActiveTab('mahakim')} 
               className={`flex items-center justify-center flex-1 sm:flex-none gap-2 px-4 md:px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'mahakim' ? 'bg-emerald-600 text-white shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
             >
               <Landmark className="size-4 shrink-0" /> <span className="whitespace-nowrap">بوابة محاكم</span>
             </button>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button 
              onClick={() => setIsStatsOpen(true)}
              className="flex items-center justify-center flex-1 sm:flex-none gap-2 px-4 md:px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5"
            >
               <PieChartIcon className="size-5 shrink-0" /> <span className="whitespace-nowrap">الإحصائيات</span>
            </button>
            <button 
              onClick={() => {
                setWizardData(null);
                setIsWizardOpen(true);
              }}
              className="flex items-center justify-center flex-1 sm:flex-none gap-2 px-4 md:px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5"
            >
               <FilePlus2 className="size-5 shrink-0" /> <span className="whitespace-nowrap">إضافة ملف</span>
            </button>
          </div>
        </div>
      </div>

      {isStatsOpen && <ContentieuxStats cases={cases} onClose={() => setIsStatsOpen(false)} />}

      {activeTab === 'local' ? (
        selectedCase ? (
          <CaseDetail 
            caseData={selectedCase} 
            onBack={() => setSelectedCase(null)} 
            onDelete={handleDeleteCase} 
            onEdit={() => {
              setWizardData(selectedCase);
              setIsWizardOpen(true);
            }} 
          />
        ) : (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'إجمالي القضايا', value: cases.length.toString(), icon: Scale, color: 'emerald' },
              { label: 'قيد التحقيق / الجلسات', value: cases.filter(c => !c.status.includes('حكم') && !c.status.includes('قرار')).length.toString(), icon: Search, color: 'blue' },
              { label: 'أحكام صادرة', value: cases.filter(c => c.status.includes('حكم') || c.status.includes('قرار')).length.toString(), icon: Gavel, color: 'orange' },
              { label: 'أحكام منفذة (كليا/جزئيا)', value: cases.filter(c => c.executionStatus?.includes('منفذ')).length.toString(), icon: CheckCircle2, color: 'emerald' },
            ].map((stat, idx) => (
              <div key={idx} className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center justify-between">
                <div>
                   <p className="text-xs font-bold text-stone-500 mb-1">{stat.label}</p>
                   <h3 className={`text-2xl font-black text-${stat.color}-700`}>{stat.value}</h3>
                </div>
                <div className={`p-3 bg-${stat.color}-50 text-${stat.color}-600 rounded-xl`}>
                   <stat.icon className="size-6" />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl shadow-sm flex items-center justify-between">
                  <div>
                      <p className="text-xs font-bold text-emerald-600 mb-1">المبالغ المستخلصة (درهم)</p>
                      <h3 className="text-2xl font-black text-emerald-700 font-mono">
                         {cases.reduce((sum, c) => sum + (parseFloat(c.executionAmountRecovered || '0') || 0), 0).toLocaleString()}
                      </h3>
                  </div>
              </div>
              <div className="bg-orange-50 border border-orange-100 p-5 rounded-2xl shadow-sm flex items-center justify-between">
                  <div>
                      <p className="text-xs font-bold text-orange-600 mb-1">مجموع الغرامات المحكوم بها</p>
                      <h3 className="text-2xl font-black text-orange-700 font-mono">
                         {cases.reduce((sum, c) => sum + (parseFloat(c.fine || '0') || 0) + (parseFloat(c.compensation || '0') || 0), 0).toLocaleString()}
                      </h3>
                  </div>
              </div>
              <div className="bg-blue-50 border border-blue-100 p-5 rounded-2xl shadow-sm flex items-center justify-between">
                  <div>
                      <p className="text-xs font-bold text-blue-600 mb-1">نسبة التنفيذ الإجمالية</p>
                      <h3 className="text-2xl font-black text-blue-700 font-mono">
                         {(() => {
                            const judged = cases.filter(c => c.status.includes('حكم') || c.status.includes('قرار')).length;
                            const executed = cases.filter(c => c.executionStatus?.includes('منفذ')).length;
                            return judged > 0 ? ((executed / judged) * 100).toFixed(1) + '%' : '0%';
                         })()}
                      </h3>
                  </div>
              </div>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-stone-200 bg-stone-50 space-y-4">
              <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                 <div className="relative w-full md:w-96 flex-1">
                    <input 
                      type="text" 
                      placeholder="البحث السريع المتقدم برقم الملف أو الموضوع أو المحكمة..." 
                      className="w-full bg-white border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-shadow" 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <Search className="size-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                 </div>
                 <div className="flex gap-2 shrink-0 flex-wrap">
                   <button 
                     onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                     className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors ${showAdvancedFilters ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'}`}
                   >
                     <Filter className="size-4" /> فلاتر إضافية
                   </button>
                   {selectedCasesIds.size > 0 && (
                     <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-xl border border-emerald-200 ml-2 animate-in fade-in">
                       <span className="text-sm font-bold">{selectedCasesIds.size} محدد</span>
                       <button onClick={handleExportSelectedCSV} className="p-1 hover:bg-emerald-200 rounded text-emerald-700 transition" title="تحميل المحدد CSV"><Download className="size-4" /></button>
                       <button onClick={handleDeleteSelected} className="p-1 hover:bg-red-200 rounded text-red-600 transition" title="حذف المحدد"><Trash2 className="size-4" /></button>
                     </div>
                   )}
                   <select 
                     value={statusFilter} 
                     onChange={(e) => setStatusFilter(e.target.value)}
                     className="bg-white border border-stone-200 text-stone-700 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 outline-none"
                   >
                      <option value="all">جميع الوضعيات</option>
                      <option value="active">قيد الرائجة</option>
                      <option value="judged">محكومة</option>
                   </select>
                   <button onClick={exportToCSV} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors" title="تحميل التقرير">
                      <Download className="size-4" /> CSV 
                   </button>
                   <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors" title="طباعة">
                      <Printer className="size-4" /> PDF
                   </button>
                 </div>
              </div>

              {showAdvancedFilters && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-stone-200 animate-in slide-in-from-top-2">
                   <div>
                      <label className="block text-xs font-bold text-stone-500 mb-1.5">نوع الملف / القضية</label>
                      <select 
                        value={typeFilter} 
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="w-full bg-white border border-stone-200 text-stone-700 rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      >
                         <option value="all">الكل</option>
                         {uniqueTypes.map(t => <option key={t as string} value={t as string}>{t as string}</option>)}
                      </select>
                   </div>
                   <div>
                      <label className="block text-xs font-bold text-stone-500 mb-1.5">المحكمة المختصة</label>
                      <select 
                        value={courtFilter} 
                        onChange={(e) => setCourtFilter(e.target.value)}
                        className="w-full bg-white border border-stone-200 text-stone-700 rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      >
                         <option value="all">الكل</option>
                         {uniqueCourts.map(c => <option key={c as string} value={c as string}>{c as string}</option>)}
                      </select>
                   </div>
                   <div>
                      <label className="block text-xs font-bold text-stone-500 mb-1.5">سنة التسجيل</label>
                      <select 
                        value={yearFilter} 
                        onChange={(e) => setYearFilter(e.target.value)}
                        className="w-full bg-white border border-stone-200 text-stone-700 rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 outline-none"
                      >
                         <option value="all">الكل</option>
                         {uniqueYears.map(y => <option key={y as string} value={y as string}>{y as string}</option>)}
                      </select>
                   </div>
                </div>
              )}
            </div>
            
            <div className="overflow-x-auto print:p-8">
              <table className="w-full text-sm text-right">
                <thead className="bg-stone-100/50 text-stone-500 border-b border-stone-200">
                  <tr>
                    <th className="px-6 py-4 font-bold w-12">
                      <input 
                        type="checkbox" 
                        className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                        checked={processedCases.length > 0 && selectedCasesIds.size === processedCases.length}
                        onChange={handleToggleSelectAll}
                      />
                    </th>
                    <th className="px-6 py-4 font-bold cursor-pointer hover:bg-stone-100 transition-colors" onClick={() => handleSort('reference')}>
                      <div className="flex items-center gap-2">المرجع {sortConfig?.key === 'reference' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</div>
                    </th>
                    <th className="px-6 py-4 font-bold cursor-pointer hover:bg-stone-100 transition-colors" onClick={() => handleSort('court')}>
                      <div className="flex items-center gap-2">المحكمة {sortConfig?.key === 'court' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</div>
                    </th>
                    <th className="px-6 py-4 font-bold cursor-pointer hover:bg-stone-100 transition-colors" onClick={() => handleSort('date')}>
                      <div className="flex items-center gap-2">تاريخ التسجيل {sortConfig?.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</div>
                    </th>
                    <th className="px-6 py-4 font-bold cursor-pointer hover:bg-stone-100 transition-colors" onClick={() => handleSort('subject')}>
                      <div className="flex items-center gap-2">الموضوع {sortConfig?.key === 'subject' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</div>
                    </th>
                    <th className="px-6 py-4 font-bold cursor-pointer hover:bg-stone-100 transition-colors" onClick={() => handleSort('status')}>
                      <div className="flex items-center gap-2">الوضعية {sortConfig?.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</div>
                    </th>
                    <th className="px-6 py-4 font-bold cursor-pointer hover:bg-stone-100 transition-colors" onClick={() => handleSort('nextSession')}>
                      <div className="flex items-center gap-2">الجلسة القادمة {sortConfig?.key === 'nextSession' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</div>
                    </th>
                    <th className="px-6 py-4 font-bold">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {processedCases.map((c) => (
                    <tr onClick={() => setSelectedCase(c)} key={c.id} className={`hover:bg-emerald-50/50 transition-colors cursor-pointer group ${selectedCasesIds.has(c.id) ? 'bg-emerald-50/30' : ''}`}>
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                          checked={selectedCasesIds.has(c.id)}
                          onChange={(e) => handleToggleSelectCase(c.id, e as any)}
                        />
                      </td>
                      <td className="px-6 py-4">
                         <span className="font-mono font-bold text-stone-700 bg-stone-100 px-2 py-1 rounded text-xs">{c.mahakimId || c.id}</span>
                         {!c.mahakimId && <p className="text-[10px] text-stone-400 mt-1">مؤقت</p>}
                      </td>
                      <td className="px-6 py-4">
                         <p className="font-bold text-stone-800">{c.court}</p>
                      </td>
                      <td className="px-6 py-4 font-mono text-stone-600">{c.date}</td>
                      <td className="px-6 py-4">
                         <p className="font-bold text-stone-800">{c.subject}</p>
                         <p className="text-xs text-stone-500 mt-0.5">{c.type} • ضد: {c.defendant || c.parties?.find(p => p.role.includes('عليه') || p.role.includes('متهم'))?.name || 'غير محدد'}</p>
                      </td>
                      <td className="px-6 py-4">
                         <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                            c.status.includes('مبرمج') ? 'bg-orange-100 text-orange-700' :
                            c.status.includes('محجوز') ? 'bg-blue-100 text-blue-700' :
                            'bg-stone-100 text-stone-700'
                         }`}>
                            <span className="size-1.5 rounded-full bg-current"></span>
                            {c.status}
                         </span>
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-emerald-700">
                         {c.nextSession || '-'}
                      </td>
                      <td className="px-6 py-4 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                         <button onClick={() => exportSingleCaseCSV(c)} className="p-2 bg-white text-stone-500 hover:text-emerald-700 hover:bg-emerald-50 border border-stone-200 hover:border-emerald-200 rounded-lg transition-all" title="تحميل المعطيات CSV" aria-label="تحميل CSV">
                           <Download className="size-4" />
                         </button>
                         <button onClick={() => printSingleCase(c)} className="p-2 bg-white text-stone-500 hover:text-emerald-700 hover:bg-emerald-50 border border-stone-200 hover:border-emerald-200 rounded-lg transition-all" title="طباعة المعطيات PDF (عبر النافذة المنفصلة)" aria-label="طباعة القائمة">
                           <Printer className="size-4" />
                         </button>
                      </td>
                    </tr>
                  ))}
                  {processedCases.length === 0 && (
                     <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-stone-500">
                          لا توجد نتائج مطابقة لبحثك.
                        </td>
                     </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )
      ) : (
        <div className="flex-1 flex flex-col min-h-[700px]">
          <MahakimIntegration onSave={handleSaveExtractedCase} />
        </div>
      )}
      
      {isWizardOpen && (
        <CaseWizard 
          initialData={wizardData || undefined} 
          onSave={handleSaveWizardCase} 
          onCancel={() => {
            setIsWizardOpen(false);
            setWizardData(null);
          }} 
        />
      )}
    </div>
  );
}

function MahakimIntegration({ onSave }: { onSave: (c: Case) => void }) {
  const [pasteData, setPasteData] = useState('');
  const [result, setResult] = useState<any>(null);
  const [extractMode, setExtractMode] = useState<'info' | 'parsed'>('info');

  const handleReadClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const newData = pasteData.trim() ? pasteData + '\n\n' + text : text;
        setPasteData(newData);
        performParsing(newData);
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
    // Basic clean up
    const cleanedText = text.replace(/[\r]/g, '').replace(/\n+/g, '\n').trim();
    // Split by both newlines and tabs to get a flat array of cells (useful for tabular data)
    const cells = cleanedText.split(/[\t\n]+/).map(s => s.trim()).filter(Boolean);
    const lines = cleanedText.split('\n').map(s => s.trim()).filter(Boolean);
    const fullText = cells.join(' ');
    
    let mahakimId = '-';
    let nationalId = '-';
    let court = 'المحكمة لم تحدد';
    let type = 'غير محدد';
    let subject = 'غير محدد';
    let date = new Date().toISOString().split('T')[0];
    let judge = '-';
    let section = '-';
    
    const labels = [
      'المحكمة', 'رقم الملف بالمحكمة', 'نوع الملف', 'الرقم الوطني للملف', 'الرقم الوطني',
      'الشعبة', 'المستشار / القاضي المقرر', 'القاضي المقرر', 'المستشار',
      'تاريخ التسجيل', 'الموضوع', 'آخر حكم/قرار', 'تاريخ آخر حكم / القرار', 
      'جاهزية نسخة الحكم / القرار', 'القرار', 'نوع الإجراء', 'تاريخ الإجراء', 'لائحة الإجراءات', 'لائحة الأطراف', 'الصفة', 'الاسم / الهيئة'
    ];

    const findNextCell = (keywords: string[]) => {
       const idx = cells.findIndex(c => keywords.some(k => c === k || c.startsWith(k)));
       if (idx !== -1 && idx + 1 < cells.length) {
          const val = cells[idx + 1];
          if (!labels.includes(val)) {
              return val;
          }
       }
       return null;
    };

    const courtVal = findNextCell(['المحكمة']);
    if (courtVal && !courtVal.includes('رقم الملف')) court = courtVal;

    const mahakimIdVal = findNextCell(['رقم الملف بالمحكمة']);
    if (mahakimIdVal) mahakimId = mahakimIdVal;
    
    const typeVal = findNextCell(['نوع الملف']);
    if (typeVal && !typeVal.includes('الرقم الوطني')) type = typeVal;

    const natIdVal = findNextCell(['الرقم الوطني للملف', 'الرقم الوطني']);
    if (natIdVal) nationalId = natIdVal;

    const sectionVal = findNextCell(['الشعبة']);
    if (sectionVal && !sectionVal.includes('المستشار')) section = sectionVal;

    const judgeVal = findNextCell(['المستشار', 'القاضي المقرر', 'المستشار / القاضي المقرر']);
    if (judgeVal) judge = judgeVal;

    const dateVal = findNextCell(['تاريخ التسجيل']);
    if (dateVal && dateVal.match(/\d{2}\/\d{2}\/\d{4}/)) date = dateVal;

    const subjIdx = cells.findIndex(c => c === 'الموضوع');
    if (subjIdx !== -1 && cells[subjIdx+1]) {
       if (!cells[subjIdx+1].includes('آخر حكم') && !cells[subjIdx+1].match(/\d{2}\/\d{2}\/\d{4}/)) {
          subject = cells[subjIdx+1];
       }
    }

    if (mahakimId === '-') {
        const idMatch = fullText.match(/(\d{4}\/\d{3,4}\/\d+)/);
        if (idMatch) mahakimId = idMatch[1];
    }
    if (date === new Date().toISOString().split('T')[0]) {
        const dateMatch = fullText.match(/(\d{2}\/\d{2}\/\d{4})/);
        if (dateMatch) date = dateMatch[1]; 
    }
    if (court === 'المحكمة لم تحدد') {
        const courtMatch = fullText.match(/(المحكمة الابتدائية[^\n\t]+|محكمة الاستئناف[^\n\t]+)/);
        if (courtMatch) court = courtMatch[1].trim();
    }
    if (type === 'غير محدد') {
        if (fullText.includes('جنحي')) type = 'جنحية';
        else if (fullText.includes('مدني')) type = 'مدنية';
        else if (fullText.includes('عقاري')) type = 'عقارية';
        else if (fullText.includes('استعجالي')) type = 'استعجالية';
        else if (fullText.includes('إداري')) type = 'إدارية';
    }

    // Procedures Extraction (Robust by detecting date lines)
    const procedures: {date: string, action: string, decision: string}[] = [];
    
    // Date regex (e.g. 15/11/2024 or 2024-11-15)
    // Sometimes the copy paste mixes times and dates.
    const procRegex = /(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})\s*(?:[0-9]{1,2}:[0-9]{2})?/g;
    
    let match;
    const dateIndices = [];
    while ((match = procRegex.exec(fullText)) !== null) {
       dateIndices.push({ date: match[1], index: match.index });
    }
    
    // Segment text by dates to extract procedure details
    if (dateIndices.length > 0) {
       // Filter out the registration date if it was caught, keep tracking only table dates
       for (let i = 0; i < dateIndices.length; i++) {
          const start = dateIndices[i].index;
          const end = i + 1 < dateIndices.length ? dateIndices[i+1].index : fullText.length;
          const chunk = fullText.substring(start, end).replace(dateIndices[i].date, '').replace(/[0-9]{1,2}[:.][0-9]{2}/g, '').trim();
          
          if (chunk.length > 5) {
             // Split chunk intuitively
             let action = "إجراء";
             let decision = "-";
             
             if (chunk.includes('حكم قطعي') || chunk.includes('تأمل') || chunk.includes('تأخير')) {
                const words = chunk.split(' ');
                action = words.slice(0, Math.min(4, words.length)).join(' ');
                decision = words.slice(Math.min(4, words.length)).join(' ') || action;
             } else {
                action = chunk;
             }
             
             procedures.push({
                date: dateIndices[i].date,
                action: action.substring(0, 50) + (action.length > 50 ? '...' : ''),
                decision: decision.substring(0, 50) + (decision.length > 50 ? '...' : '')
             });
          }
       }
    }

    // Parties Extraction (simpler approach: guess from list)
    const parties: {role: string, name: string}[] = [];
    const roleKeywords = ['مدعي', 'مدعى عليه', 'متهم', 'المطالب بالحق المدني', 'طالب', 'مطلوب', 'مستأنف عليه', 'مستأنف', 'نيابة عامة'];
    
    for (let i = 0; i < cells.length; i++) {
       const cell = cells[i];
       const matchingRole = roleKeywords.find(r => cell.startsWith(r + ' ') || cell === r);
       
       if (matchingRole) {
          if (cell === matchingRole) {
             // Name is likely on the next cell
             if (cells[i+1] && !roleKeywords.some(r => cells[i+1].startsWith(r)) && !cells[i+1].includes('المحامون')) {
                parties.push({ role: matchingRole, name: cells[i+1] });
                // We don't skip the next cell in case there's another matching heuristic, 
                // but usually it's fine as it won't match a role keyword.
             } else {
                parties.push({ role: matchingRole, name: "غير محدد" });
             }
          } else {
             // Name is on the same cell after the role
             const name = cell.substring(matchingRole.length).trim();
             if (name.length > 0) {
                 parties.push({ role: matchingRole, name: name });
             }
          }
       }
    }

    // Default fallback if no parties found
    if (parties.length === 0) {
        if (fullText.includes('الوكالة الوطنية للمياه والغابات') || fullText.includes('إدارة المياه والغابات') || fullText.includes('ANEF')) {
           parties.push({ role: 'مدعي / المطالب بالحق المدني', name: 'الوكالة الوطنية للمياه والغابات' });
        } else {
           parties.push({ role: 'طالب', name: 'إدارة المياه والغابات' });
        }
        parties.push({ role: 'مدعى عليه / متهم', name: 'مجهول (حسب الاستخراج)' });
    }


    setResult({
      mahakimId,
      nationalId,
      court,
      type,
      subject,
      date,
      judge,
      section,
      status: procedures.length > 0 ? 'جلسات مبرمجة' : 'بيانات مستخرجة',
      nextSession: procedures.length > 0 ? procedures[0].date : '-',
      parties,
      procedures: procedures.reverse() // Often the earliest dates appear later or vice versa
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
         </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden relative">
        {/* Sidebar Search Filters & Extraction */}
        <div className="w-full md:w-[450px] border-b md:border-b-0 md:border-l border-stone-200 bg-stone-50 p-4 md:p-6 flex flex-col overflow-y-auto shrink-0 z-10 shadow-xl relative">
          
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
        <div className="flex-1 bg-stone-100 relative w-full h-full overflow-hidden">
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
                       <button onClick={() => setExtractMode('info')} className="bg-white border-2 border-emerald-600 hover:bg-emerald-50 text-emerald-700 px-8 py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all hover:-translate-y-0.5">
                          <Plus className="size-5" />
                          إضافة بيانات تبويب آخر (الأطراف، الإجراءات...)
                       </button>
                       <button 
                         onClick={() => onSave({
                             id: `CTX-${new Date().getFullYear()}-${Math.floor(Math.random() * 900) + 100}`,
                             mahakimId: result.mahakimId,
                             nationalId: result.nationalId,
                             judge: result.judge,
                             section: result.section,
                             date: result.date,
                             type: result.type,
                             subject: result.subject,
                             court: result.court,
                             status: result.status,
                             nextSession: result.nextSession,
                             defendant: result.parties?.find((p:any) => p.role.includes('متهم') || p.role.includes('مدعى عليه') || p.role.includes('مستأنف عليه'))?.name || 'مجهول',
                             parties: result.parties,
                             procedures: result.procedures
                         })}
                         className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all hover:-translate-y-0.5"
                       >
                         <DownloadCloud className="size-5" />
                         حفظ القضية برمتها في القاعدة
                       </button>
                       <button onClick={() => { setPasteData(''); setExtractMode('info'); }} className="text-xs font-bold text-stone-400 hover:text-red-600 underline text-center decoration-stone-300">
                          إلغاء ومسح البيانات والعودة للبوابة
                       </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
                     <ResultField label="رقم محاكم الشامل" value={result.mahakimId} mono highlight />
                     <ResultField label="الرقم الوطني للملف" value={result.nationalId} mono />
                     <ResultField label="المحكمة المختصة" value={result.court} />
                     <ResultField label="تاريخ التسجيل" value={result.date} mono />
                     <ResultField label="نوع القضية" value={result.type} />
                     <ResultField label="الشعبة" value={result.section} />
                     <ResultField label="القاضي المقرر / المستشار" value={result.judge} />
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
      <div className={`flex flex-col gap-2 p-5 rounded-2xl border ${highlight ? 'border-emerald-200 bg-emerald-50 shadow-sm' : 'border-stone-200 bg-white shadow-sm'}`}>
         <span className="text-xs font-bold text-stone-500">{label}</span>
         <span className={`text-base ${mono ? 'font-mono text-stone-600' : 'font-bold text-stone-800'} ${highlight ? 'text-emerald-900 font-black text-lg' : ''}`}>{value}</span>
      </div>
   );
}
