import React, { useState, useEffect } from 'react';
import { MapPin, Users, AlertTriangle, FileText, Plus, Shield, Search, Filter, Download, Briefcase, FileOutput, FilePlus2, User, Calendar, Scale, ChevronLeft, Check, FileCode2, Map, Gavel } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { loadInfractions, updateInfractionStatut, formatPVNumber, type InfractionRecord, type InfractionKPIs } from '@/lib/pv';

const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

// ══════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════
const AGENTS_LIST = [
  { nom: 'الزاموم أحمد',   grade: 'تقني متخصص للمياه والغابات', residence: 'بريستنكا' },
  { nom: 'تجريبات موسى',  grade: 'تقني للمياه والغابات',         residence: 'كدية الطيفور' },
  { nom: 'طوال محمد',     grade: 'تقني للمياه والغابات',         residence: 'المضيق' },
  { nom: 'مجاهيد مهدي',  grade: 'تقني للمياه والغابات',         residence: 'المضيق' },
  { nom: 'المعتمد يوسف', grade: 'تقني للمياه والغابات',         residence: 'الفنيدق' },
]

const INFRACTION_TYPES = [
  'التسييج بأعمدة حديدية وأسلاك',
  'حفر واستخراج الأتربة',
  'إعداد صهريج مائي',
  'التعشيب',
  'قطع وحمل العود الحي',
  'غرس أشجار مثمرة',
  'بناء بمواد صلبة',
  'وضع براكة بمواد قابلة للاشتعال',
  'الحرث',
  'تشذيب الأشجار',
  'إعداد بئر',
  'أخرى',
]

const COMMUNES_LIST = [
  'ملاليين','عليين','المضيق','الفنيدق','مرتيل',
  'دار بن قريش','أزلا','أولاد ميمون','أنجرة',
  'بني يدر','الزيتونة','تغرامت','القصر الصغير',
]

const FORETS_LIST = [
  'الغابة المخزنية الحوز',
  'غابة جبل درسة',
  'الغابة المخزنية الحلوفا',
  'غابة بابا علي',
  'الغابة المخزنية بليونش',
]

const IMAALA_LIST = ['إقليم تطوان', 'عمالة المضيق-الفنيدق']

const LEGAL_SUGGESTIONS = [
  'الترامي على الملك الغابوي باستخراج الأتربة والبناء',
  'الترامي على الملك الغابوي للدولة بالحرث',
  'قطع وحمل العود الحي داخل الملك الغابوي',
  'التعشيب متبوع بالحرث وقطع العود الحي',
  'الترامي على الملك الغابوي باستخراج الأتربة، التعشيب، قطع وحمل العود الحي والبناء',
]

// ══════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════
interface AgentData { nom: string; grade: string; residence: string }

interface PVFormData {
  pvNum: string; pvYear: string; brigade: string
  date: string; heure: string
  nbAgents: number; activeAgent: number
  agent1: AgentData; agent2: AgentData; agent3: AgentData
  foret: string; canton: string; decreeNum: string; decreeDate: string
  placeName: string; commune: string; province: string
  coordX: string; coordY: string
  infractions: string[]; ha: string; are: string; ca: string
  degats: Array<{ type: string; quantite: string; equivalent: string }>
  firstName: string; lastName: string; filiation: string; motherName: string
  birthPlace: string; cin: string; dob: string; profession: string
  maritalStatus: string; address: string; outsideMaroc: boolean
  legalDescription: string
}

const EMPTY_FORM: PVFormData = {
  pvNum: '', pvYear: '', brigade: 'BM',
  date: new Date().toISOString().split('T')[0], heure: '',
  nbAgents: 1, activeAgent: 1,
  agent1: { nom: '', grade: 'تقني متخصص للمياه والغابات', residence: '' },
  agent2: { nom: '', grade: 'تقني للمياه والغابات', residence: '' },
  agent3: { nom: '', grade: 'تقني للمياه والغابات', residence: '' },
  foret: '', canton: '', decreeNum: '', decreeDate: '',
  placeName: '', commune: '', province: 'إقليم تطوان',
  coordX: '', coordY: '',
  infractions: [], ha: '0', are: '0', ca: '0',
  degats: [{ type: '', quantite: '', equivalent: '' }],
  firstName: '', lastName: '', filiation: '', motherName: '',
  birthPlace: '', cin: '', dob: '', profession: '',
  maritalStatus: 'متزوج', address: '', outsideMaroc: false,
  legalDescription: '',
}

// ══════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════
export function PoliceForestiere() {
  const [showForm, setShowForm] = useState(false);
  const [pvData, setPvData] = useState<InfractionRecord[]>([]);
  const [kpis, setKpis] = useState<InfractionKPIs>({ total: 0, surface: 0, parquet: 0, mois: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    const { data, kpis: k } = await loadInfractions({ limit: 100 });
    setPvData(data);
    setKpis(k);
    setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-serif italic text-emerald-900">Police Forestière & Répression</h1>
          <p className="text-xs md:text-sm text-stone-500 mt-1">Gestion des patrouilles, centres de conservation et saisie des procès-verbaux.</p>
        </div>
        {!showForm ? (
          <button onClick={() => setShowForm(true)} className="flex items-center justify-center gap-2 px-4 py-3 md:py-2 w-full sm:w-auto bg-emerald-800 text-white rounded-xl text-xs uppercase tracking-widest font-bold hover:bg-emerald-900 transition-colors shadow-sm">
            <FilePlus2 className="size-4" />
            Nouveau Procès-Verbal
          </button>
        ) : (
          <button onClick={() => setShowForm(false)} className="flex items-center justify-center gap-2 px-4 py-3 md:py-2 w-full sm:w-auto bg-white border border-stone-200 text-stone-700 rounded-xl text-xs uppercase tracking-widest font-bold hover:bg-stone-50 transition-colors shadow-sm">
            <ChevronLeft className="size-4" />
            Retour au suivi
          </button>
        )}
      </div>

      {showForm
        ? <PVForm onClose={() => setShowForm(false)} onSaved={fetchData} />
        : <PVManagement pvData={pvData} kpis={kpis} isLoading={isLoading} onRefresh={fetchData} />
      }
    </div>
  );
}

// ══════════════════════════════════════════════════════
// PV MANAGEMENT (LIST)
// ══════════════════════════════════════════════════════
function PVManagement({ pvData, kpis, isLoading, onRefresh }: {
  pvData: InfractionRecord[];
  kpis: InfractionKPIs;
  isLoading: boolean;
  onRefresh: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.type === 'police' && detail?.id) setSearchQuery(detail.id);
    };
    window.addEventListener('searchItemSelected', handler);
    return () => window.removeEventListener('searchItemSelected', handler);
  }, []);

  const filtered = pvData.filter(pv =>
    formatPVNumber(pv).toLowerCase().includes(searchQuery.toLowerCase()) ||
    (pv.contrevenant_nom || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (pv.foret_nom || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (pv.commune || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusLabel = (s: string | null) => {
    switch(s) {
      case 'transmis_parquet': return { label: 'Transmis', cls: 'bg-emerald-100 text-emerald-800 border border-emerald-200' }
      case 'en_cours':         return { label: 'Enquête', cls: 'bg-orange-100 text-orange-800 border border-orange-200' }
      case 'cloture':          return { label: 'Clôturé', cls: 'bg-stone-100 text-stone-800 border border-stone-200' }
      default:                 return { label: 'Nouveau', cls: 'bg-blue-100 text-blue-800 border border-blue-200' }
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* KPI Section */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
        <KPICard title="PV Rédigés (Total)" value={String(kpis.total)} trend={`${kpis.mois} ce mois`} type="emerald" icon={FileText} />
        <KPICard title="Surface (Ha)" value={kpis.surface.toFixed(2)} trend="Total infractions" type="orange" icon={Map} />
        <KPICard title="Transmis Parquet" value={String(kpis.parquet)} trend="Dossiers" type="red" icon={Scale} />
        <KPICard title="Ce Mois" value={String(kpis.mois)} trend="Nouveaux PV" type="stone" icon={Shield} />
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-5 border-b border-stone-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-white text-stone-600">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher par N° PV, contrevenant, forêt..."
              className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-stone-800 font-mono"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={onRefresh} className="flex justify-center items-center gap-2 px-4 py-2 bg-white border border-stone-200 text-stone-700 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-stone-50 transition-colors">
              ↻ Actualiser
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-stone-400">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mr-3" />
              Chargement...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-stone-400 text-sm">
              {searchQuery ? 'Aucun résultat pour cette recherche' : 'Aucun PV enregistré'}
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] text-stone-500 font-bold uppercase tracking-widest bg-stone-50/50 border-b border-stone-200">
                <tr>
                  <th className="px-6 py-4">Référence PV</th>
                  <th className="px-6 py-4">Date & Forêt</th>
                  <th className="px-6 py-4">Nature Infraction</th>
                  <th className="px-6 py-4">Contrevenant</th>
                  <th className="px-6 py-4">Statut</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.map((pv) => {
                  const s = statusLabel(pv.statut)
                  return (
                    <tr key={pv.id} className="hover:bg-stone-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-stone-900 text-xs font-mono">{formatPVNumber(pv)}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-stone-800 font-medium">{pv.date_redaction || '—'}</span>
                          <span className="text-[10px] text-stone-500 uppercase tracking-widest">{pv.foret_nom || '—'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-stone-800 italic text-xs max-w-[200px] truncate" dir="rtl">
                        {(pv.infraction_types || []).join('، ') || pv.description_juridique || '—'}
                      </td>
                      <td className="px-6 py-4 text-stone-600 font-medium" dir="rtl">
                        {[pv.contrevenant_prenom, pv.contrevenant_nom].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-widest ${s.cls}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            title="Transmettre au Parquet"
                            onClick={() => updateInfractionStatut(pv.id, 'transmis_parquet').then(onRefresh)}
                            className="p-2 text-stone-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg border border-stone-200 transition-colors"
                          >
                            <Gavel className="size-4" />
                          </button>
                          <button
                            title="Générer DOCX"
                            onClick={() => generateDocxFromRecord(pv)}
                            className="p-2 text-stone-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg border border-stone-200 transition-colors"
                          >
                            <FileCode2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// GENERATE DOCX FROM SAVED RECORD
// ══════════════════════════════════════════════════════
function generateDocxFromRecord(pv: InfractionRecord) {
  const pvNum = formatPVNumber(pv)
  const contrevenant = [pv.contrevenant_prenom, pv.contrevenant_nom].filter(Boolean).join(' ') || 'مجهول'
  generateDocxContent({
    pvNum,
    date: pv.date_redaction || '',
    heure: pv.heure_constat || '',
    agent1: { nom: pv.agent_1_nom || '', grade: pv.agent_1_grade || '', residence: pv.agent_1_residence || '' },
    foret: pv.foret_nom || '',
    canton: pv.foret_section || '',
    decreeNum: pv.decret_num || '',
    placeName: pv.lieu_dit || '',
    commune: pv.commune || '',
    province: pv.imaala || '',
    infractions: pv.infraction_types || [],
    ha: String(pv.surface_hectares || 0),
    are: String(pv.surface_ares || 0),
    ca: String(pv.surface_centiares || 0),
    contrevenant,
    cin: pv.contrevenant_cin || '',
    legalDescription: pv.description_juridique || '',
  })
}

function generateDocxContent(d: any) {
  const content = `<html dir="rtl" lang="ar">
<head><meta charset="utf-8"><title>محضر الضبط</title>
<style>
  body{font-family:'Traditional Arabic',Arial;padding:40px;line-height:2;font-size:14pt}
  .header{text-align:center;margin-bottom:30px;border-bottom:2px solid #000;padding-bottom:15px}
  .section{margin:15px 0}
  .bold{font-weight:bold}
  table{width:100%;border-collapse:collapse;margin:10px 0}
  td{padding:6px 10px;border:1px solid #ccc}
</style></head>
<body>
<div class="header">
  <p>المملكة المغربية</p>
  <p>وزارة الفلاحة والصيد البحري والتنمية القروية والمياه والغابات</p>
  <p class="bold" style="font-size:16pt">الوكالة الوطنية للمياه والغابات</p>
  <p>المديرية الإقليمية بتطوان</p>
  <br/>
  <p class="bold" style="font-size:18pt">مـحـضـر ضـبـط الـجـنـح الـغـابـويـة</p>
  <p>رقم: <span class="bold">${d.pvNum}</span></p>
</div>

<div class="section">
  <p>نحن <span class="bold">${d.agent1.nom}</span>، بصفتنا <span class="bold">${d.agent1.grade}</span>، 
  المقيم بـ${d.agent1.residence}، المكلفون بمراقبة وصون الملك الغابوي،</p>
  <p>بتاريخ <span class="bold">${d.date}</span>، <span class="bold">${d.heure || ''}</span>،</p>
  <p>أثناء قيامنا بمهام المراقبة والحراسة بغابة <span class="bold">${d.foret}</span>، 
  قسم <span class="bold">${d.canton}</span>،</p>
  <p>بالموقع المسمى: <span class="bold">${d.placeName}</span>، 
  جماعة <span class="bold">${d.commune}</span>، 
  <span class="bold">${d.province}</span>،</p>
</div>

<div class="section">
  <p class="bold">الجرائم المعاينة:</p>
  <p>${d.infractions.map((i: string) => `• ${i}`).join('<br/>')}</p>
  <p>المساحة: <span class="bold">${d.ha} هـ ${d.are} آر ${d.ca} سنتيار</span></p>
</div>

<div class="section">
  <p class="bold">هوية المخالف:</p>
  <p>السيد/ة: <span class="bold">${d.contrevenant}</span></p>
  <p>رقم بطاقة التعريف: <span class="bold">${d.cin || '—'}</span></p>
</div>

<div class="section">
  <p class="bold">الوصف القانوني:</p>
  <p>${d.legalDescription}</p>
</div>

<div style="margin-top:60px;display:flex;justify-content:space-between">
  <div style="text-align:center"><p>توقيع المحرر</p><br/><br/>________________</div>
  <div style="text-align:center"><p>توقيع المخالف</p><br/><br/>________________</div>
</div>
</body></html>`

  const blob = new Blob(['\ufeff', content], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `PV_${d.pvNum.replace(/\//g, '-')}.doc`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ══════════════════════════════════════════════════════
// PV FORM (7 STEPS)
// ══════════════════════════════════════════════════════
function PVForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState<PVFormData>(EMPTY_FORM);
  const [mapCoords, setMapCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const totalSteps = 7;
  const steps = [
    { id: 1, label: 'PV & Date' },
    { id: 2, label: 'Agents' },
    { id: 3, label: 'Localisation' },
    { id: 4, label: 'Infractions' },
    { id: 5, label: 'Dégâts' },
    { id: 6, label: 'Contrevenant' },
    { id: 7, label: 'Finaliser' },
  ];

  const set = <K extends keyof PVFormData>(key: K, val: PVFormData[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  const setAgent = (n: 1 | 2 | 3, field: keyof AgentData, val: string) =>
    setForm(f => ({ ...f, [`agent${n}`]: { ...f[`agent${n}`], [field]: val } }));

  const handleNext = () => setCurrentStep(p => Math.min(p + 1, totalSteps));
  const handlePrev = () => setCurrentStep(p => Math.max(p - 1, 1));

  const handleAgentQuickSelect = (agentN: 1 | 2 | 3, nom: string) => {
    const found = AGENTS_LIST.find(a => a.nom === nom);
    if (found) setForm(f => ({ ...f, [`agent${agentN}`]: found }));
  };

  const toggleInfraction = (inf: string) => {
    setForm(f => ({
      ...f,
      infractions: f.infractions.includes(inf)
        ? f.infractions.filter(i => i !== inf)
        : [...f.infractions, inf]
    }));
  };

  const addDegat = () => setForm(f => ({
    ...f,
    degats: [...f.degats, { type: '', quantite: '', equivalent: '' }]
  }));

  const setDegat = (idx: number, field: string, val: string) => setForm(f => ({
    ...f,
    degats: f.degats.map((d, i) => i === idx ? { ...d, [field]: val } : d)
  }));

  const pvNum = `${form.pvNum}/${form.pvYear}/${form.brigade}`;

  const savePV = async () => {
    setSaving(true); setSaveError('');
    try {
      const res = await fetch('/api/save-pv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          numero_pv_ordre: form.pvNum,
          numero_carnet: form.pvYear.split('/')[0] || form.pvYear,
          brigade_code: form.brigade,
          date_redaction: form.date,
          heure_constat: form.heure,
          nb_agents: form.nbAgents,
          agent_1_nom: form.agent1.nom,
          agent_1_grade: form.agent1.grade,
          agent_1_residence: form.agent1.residence,
          agent_2_nom: form.agent2.nom,
          agent_2_grade: form.agent2.grade,
          agent_2_residence: form.agent2.residence,
          agent_3_nom: form.agent3.nom,
          agent_3_grade: form.agent3.grade,
          agent_3_residence: form.agent3.residence,
          foret_nom: form.foret,
          foret_nom_ar: form.foret,
          foret_section: form.canton,
          decret_num: form.decreeNum,
          decret_date: form.decreeDate,
          lieu_dit: form.placeName,
          commune: form.commune,
          qiada: form.commune,
          imaala: form.province,
          coord_x: form.coordX || (mapCoords ? String(mapCoords.lng) : ''),
          coord_y: form.coordY || (mapCoords ? String(mapCoords.lat) : ''),
          infraction_types: form.infractions,
          infraction_details: {},
          surface_hectares: form.ha,
          surface_ares: form.are,
          surface_centiares: form.ca,
          degats: form.degats,
          contrevenant_prenom: form.firstName,
          contrevenant_nom: form.lastName,
          contrevenant_nasab: form.filiation,
          contrevenant_mere: form.motherName,
          contrevenant_ddn: form.dob,
          contrevenant_lieu_naiss: form.birthPlace,
          contrevenant_situation: form.maritalStatus,
          contrevenant_profession: form.profession,
          contrevenant_cin: form.cin,
          contrevenant_adresse: form.address,
          contrevenant_hors_maroc: form.outsideMaroc,
          description_juridique: form.legalDescription,
          statut: 'nouveau',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSaveError(data.error || 'Erreur lors de la sauvegarde');
        return false;
      }
      return true;
    } catch (e) {
      setSaveError('Erreur de connexion');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOnly = async () => {
    const ok = await savePV();
    if (ok) { setForm(EMPTY_FORM); setCurrentStep(1); onSaved(); onClose(); }
  };

  const handleSaveAndGenerate = async () => {
    generateDocxContent({
      pvNum, date: form.date, heure: form.heure, agent1: form.agent1,
      foret: form.foret, canton: form.canton, decreeNum: form.decreeNum,
      placeName: form.placeName, commune: form.commune, province: form.province,
      infractions: form.infractions, ha: form.ha, are: form.are, ca: form.ca,
      contrevenant: `${form.firstName} ${form.lastName}`,
      cin: form.cin, legalDescription: form.legalDescription,
    });
    const ok = await savePV();
    if (ok) { setForm(EMPTY_FORM); setCurrentStep(1); onSaved(); onClose(); }
  };

  const LocationPicker = () => {
    useMapEvents({
      click(e) {
        setMapCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
        set('coordX', e.latlng.lng.toFixed(6));
        set('coordY', e.latlng.lat.toFixed(6));
      }
    });
    return mapCoords ? <Marker position={[mapCoords.lat, mapCoords.lng]} icon={customIcon} /> : null;
  };

  const currentAgentData = form[`agent${form.activeAgent}` as 'agent1' | 'agent2' | 'agent3'];

  return (
    <div className="bg-white text-stone-800 rounded-2xl border border-stone-200 shadow-sm flex flex-col w-full" dir="rtl">
      {/* Stepper */}
      <div className="px-8 py-5 border-b border-stone-100 bg-stone-50/50 overflow-x-auto hide-scrollbar rounded-t-2xl">
        <div className="flex items-center gap-3 min-w-max">
          {steps.map((step, index) => {
            const isActive = currentStep === step.id;
            const isPast = currentStep > step.id;
            return (
              <div key={step.id} className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCurrentStep(step.id)}
                  className={`flex items-center gap-2 pl-4 pr-1 py-1.5 rounded-full border bg-white cursor-pointer hover:bg-stone-50 transition-colors ${
                    isActive ? 'border-emerald-500 shadow-sm' :
                    isPast ? 'border-stone-200 opacity-60' :
                    'border-stone-200 opacity-40'
                  }`}
                >
                  <span className={`text-xs font-bold font-mono tracking-widest pl-2 ${isActive ? 'text-emerald-700' : 'text-stone-500'}`}>{step.label}</span>
                  <div className={`size-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isActive ? 'bg-emerald-100 text-emerald-700' :
                    isPast ? 'bg-stone-100 text-stone-500' :
                    'bg-stone-50 text-stone-400'
                  }`}>
                    {isPast ? <Check className="size-3" /> : step.id}
                  </div>
                </button>
                {index < steps.length - 1 && <div className={`w-8 h-px ${isPast ? 'bg-emerald-500/30' : 'bg-stone-200'}`}></div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-4 md:p-8 min-h-[400px]">
        {/* STEP 1 */}
        {currentStep === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-lg font-serif italic text-emerald-900 mb-6">رقم المحضر والتاريخ</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <FormInputLight label="رقم في الدفتر" type="text" placeholder="مثال: 05" value={form.pvNum} onChange={(e: any) => set('pvNum', e.target.value)} />
              <div className="md:col-span-2">
                <FormInputLight label="رقم الدفتر / السنة" type="text" placeholder="مثال: 02/2025" value={form.pvYear} onChange={(e: any) => set('pvYear', e.target.value)} />
              </div>
              <FormInputLight label="البريغاد" type="text" placeholder="مثال: BM" value={form.brigade} onChange={(e: any) => set('brigade', e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <FormInputLight label="تاريخ التحرير" type="date" value={form.date} onChange={(e: any) => set('date', e.target.value)} />
              <FormInputLight label="وقت المعاينة" type="time" placeholder="اختر وقت المعاينة" value={form.heure} onChange={(e: any) => set('heure', e.target.value)} />
            </div>
            {form.pvNum && form.pvYear && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-mono">
                رقم المحضر: <strong>{pvNum}</strong>
              </div>
            )}
          </div>
        )}

        {/* STEP 2 */}
        {currentStep === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-lg font-serif italic text-emerald-900 mb-6">المحررون</h3>
            <div className="flex gap-4 mb-6 border-b border-stone-200 pb-4">
              {[1, 2, 3].map(n => (
                <button key={n} type="button"
                  onClick={() => { set('activeAgent', n as 1|2|3); if (n > form.nbAgents) set('nbAgents', n as 1|2|3); }}
                  className={`flex-1 py-3 border-b-2 font-bold text-sm rounded-t-lg transition-colors ${
                    form.activeAgent === n
                      ? 'border-emerald-600 text-emerald-700 bg-emerald-50'
                      : 'border-transparent text-stone-500 hover:text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  محرر {n}
                </button>
              ))}
            </div>
            <div className="p-6 border border-stone-200 rounded-xl space-y-6 bg-stone-50/50">
              <div className="space-y-2 text-right w-full">
                <label className="text-xs font-bold text-stone-600">اختيار سريع</label>
                <select
                  dir="rtl"
                  className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-stone-800 outline-none appearance-none shadow-sm"
                  value={currentAgentData.nom}
                  onChange={e => handleAgentQuickSelect(form.activeAgent as 1|2|3, e.target.value)}
                >
                  <option value="" disabled>— اختر ليتم ملء الخانات تلقائياً —</option>
                  {AGENTS_LIST.map(a => <option key={a.nom} value={a.nom}>{a.nom}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormInputLight label="الاسم الكامل" type="text" placeholder="الاسم الكامل" value={currentAgentData.nom} onChange={(e: any) => setAgent(form.activeAgent as 1|2|3, 'nom', e.target.value)} />
                <FormInputLight label="الصفة / الدرجة" type="text" placeholder="تقني متخصص..." value={currentAgentData.grade} onChange={(e: any) => setAgent(form.activeAgent as 1|2|3, 'grade', e.target.value)} />
              </div>
              <FormInputLight label="محل الإقامة" type="text" placeholder="مدينة / جماعة" value={currentAgentData.residence} onChange={(e: any) => setAgent(form.activeAgent as 1|2|3, 'residence', e.target.value)} />
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {currentStep === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-lg font-serif italic text-emerald-900 mb-6">الموقع والغابة</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 text-right">
                <label className="text-xs font-bold text-stone-600">الغابة</label>
                <select dir="rtl" value={form.foret} onChange={e => set('foret', e.target.value)} className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-stone-800 outline-none appearance-none shadow-sm">
                  <option value="">— اختر الغابة —</option>
                  {FORETS_LIST.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <FormInputLight label="القسم (Canton)" type="text" placeholder="القسم أ..." value={form.canton} onChange={(e: any) => set('canton', e.target.value)} />
            </div>
            <div className="p-6 border border-stone-200 rounded-xl space-y-6 bg-white shadow-sm">
              <h4 className="text-xs font-bold text-stone-500 mb-2">المرسوم الوزاري</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormInputLight label="رقم المرسوم" type="text" placeholder="مثال: 02.84.321" value={form.decreeNum} onChange={(e: any) => set('decreeNum', e.target.value)} />
                <FormInputLight label="تاريخ المرسوم" type="date" value={form.decreeDate} onChange={(e: any) => set('decreeDate', e.target.value)} />
              </div>
            </div>
            <FormInputLight label="المكان المسمى" type="text" placeholder="مثال: بئر الشيخ" value={form.placeName} onChange={(e: any) => set('placeName', e.target.value)} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 text-right">
                <label className="text-xs font-bold text-stone-600">الجماعة / القيادة</label>
                <select dir="rtl" value={form.commune} onChange={e => set('commune', e.target.value)} className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-stone-800 outline-none appearance-none shadow-sm">
                  <option value="">— اختر الجماعة —</option>
                  {COMMUNES_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-2 text-right">
                <label className="text-xs font-bold text-stone-600">العمالة / الإقليم</label>
                <select dir="rtl" value={form.province} onChange={e => set('province', e.target.value)} className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-stone-800 outline-none appearance-none shadow-sm">
                  {IMAALA_LIST.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4 rounded-xl overflow-hidden h-[300px] border border-stone-200 relative">
              <div className="absolute inset-0 z-10 p-2 flex flex-col items-start justify-between pointer-events-none">
                <span className="text-xs bg-white text-stone-700 px-3 py-1.5 rounded-lg shadow-md font-medium border border-stone-100 mt-2 ml-2 self-end">انقر على الخريطة لتحديد الإحداثيات</span>
                {mapCoords && (
                  <div className="bg-white/90 backdrop-blur border border-stone-200 p-3 rounded-xl shadow-lg mb-2 mr-2 text-xs flex gap-4 pointer-events-auto">
                    <div><span className="text-stone-500 block mb-1">X (Longitude)</span><span className="font-mono text-stone-800">{mapCoords.lng.toFixed(6)}</span></div>
                    <div><span className="text-stone-500 block mb-1">Y (Latitude)</span><span className="font-mono text-stone-800">{mapCoords.lat.toFixed(6)}</span></div>
                  </div>
                )}
              </div>
              <MapContainer center={[35.5785, -5.3684]} zoom={12} className="h-full w-full z-0 cursor-crosshair">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
                <LocationPicker />
              </MapContainer>
            </div>
          </div>
        )}

        {/* STEP 4 */}
        {currentStep === 4 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-lg font-serif italic text-emerald-900 mb-6">الجرائم المعاينة</h3>
            <div className="p-6 bg-stone-50 border border-stone-200 rounded-xl mb-6">
              <h4 className="text-xs font-bold text-stone-500 mb-4">المساحة الإجمالية للقطعة المتضررة</h4>
              <div className="grid grid-cols-3 gap-6">
                <FormInputLight label="هكتار" type="number" placeholder="0" value={form.ha} onChange={(e: any) => set('ha', e.target.value)} />
                <FormInputLight label="آر" type="number" placeholder="0" value={form.are} onChange={(e: any) => set('are', e.target.value)} />
                <FormInputLight label="سنتيار" type="number" placeholder="0" value={form.ca} onChange={(e: any) => set('ca', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {INFRACTION_TYPES.map((crime, idx) => (
                <label key={idx} onClick={() => toggleInfraction(crime)}
                  className={`flex items-center gap-4 p-4 border rounded-xl cursor-pointer transition-colors shadow-sm ${
                    form.infractions.includes(crime)
                      ? 'bg-emerald-50 border-emerald-300'
                      : 'bg-white border-stone-200 hover:bg-stone-50 hover:border-emerald-200'
                  }`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    form.infractions.includes(crime) ? 'bg-emerald-600 border-emerald-600' : 'border-stone-300'
                  }`}>
                    {form.infractions.includes(crime) && <Check className="size-3 text-white" />}
                  </div>
                  <span className="text-sm font-medium text-stone-700">{crime}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* STEP 5 */}
        {currentStep === 5 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-lg font-serif italic text-emerald-900 mb-6">تقدير الأضرار</h3>
            {form.degats.map((d, idx) => (
              <div key={idx} className="p-6 bg-white border border-stone-200 rounded-xl space-y-6 shadow-sm">
                <h4 className="text-sm font-bold text-stone-500">الضرر {idx + 1}</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <FormInputLight label="نوع الضرر" type="text" placeholder="أتربة / أشجار / أعشاب" value={d.type} onChange={(e: any) => setDegat(idx, 'type', e.target.value)} />
                  <FormInputLight label="الكمية" type="text" placeholder="300م³" value={d.quantite} onChange={(e: any) => setDegat(idx, 'quantite', e.target.value)} />
                  <FormInputLight label="المعادل" type="text" placeholder="10 حمولة شاحنة" value={d.equivalent} onChange={(e: any) => setDegat(idx, 'equivalent', e.target.value)} />
                </div>
              </div>
            ))}
            <button type="button" onClick={addDegat} className="w-full py-4 border-2 border-dashed border-stone-200 text-stone-500 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50/50 rounded-xl transition-colors font-bold text-sm bg-stone-50/50">
              + إضافة ضرر آخر
            </button>
          </div>
        )}

        {/* STEP 6 */}
        {currentStep === 6 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-lg font-serif italic text-emerald-900 mb-6">هوية المخالف</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 border border-stone-200 rounded-xl shadow-sm">
              <FormInputLight label="الاسم الشخصي" type="text" placeholder="الاسم الشخصي" value={form.firstName} onChange={(e: any) => set('firstName', e.target.value)} />
              <FormInputLight label="اسم العائلة" type="text" placeholder="حسب البطاقة الوطنية" value={form.lastName} onChange={(e: any) => set('lastName', e.target.value)} />
              <div className="md:col-span-2">
                <FormInputLight label="النسب" type="text" placeholder="بن / بنت ... مع اسم الأب والجد" value={form.filiation} onChange={(e: any) => set('filiation', e.target.value)} />
              </div>
              <FormInputLight label="اسم الأم" type="text" placeholder="اسم الأم الكامل" value={form.motherName} onChange={(e: any) => set('motherName', e.target.value)} />
              <FormInputLight label="مكان الازدياد" type="text" placeholder="المدينة / الإقليم" value={form.birthPlace} onChange={(e: any) => set('birthPlace', e.target.value)} />
              <FormInputLight label="رقم بطاقة التعريف" type="text" placeholder="BX..." value={form.cin} onChange={(e: any) => set('cin', e.target.value)} />
              <FormInputLight label="تاريخ الازدياد" type="date" value={form.dob} onChange={(e: any) => set('dob', e.target.value)} />
              <div className="md:col-span-2">
                <FormInputLight label="المهنة" type="text" placeholder="فلاح / عامل" value={form.profession} onChange={(e: any) => set('profession', e.target.value)} />
              </div>
            </div>
            <div className="p-6 bg-stone-50 border border-stone-200 rounded-xl space-y-6">
              <div className="space-y-2 text-right">
                <label className="text-xs font-bold text-stone-600">الحالة العائلية</label>
                <select dir="rtl" value={form.maritalStatus} onChange={e => set('maritalStatus', e.target.value)} className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-stone-800 outline-none appearance-none shadow-sm">
                  {['أعزب','متزوج','متزوجة','مطلق','مطلقة','أرمل','أرملة'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <FormInputLight label="العنوان الكامل" type="text" placeholder="حي / شارع / رقم / المدينة" value={form.address} onChange={(e: any) => set('address', e.target.value)} />
              <label className="flex items-center gap-3 cursor-pointer p-4 bg-white border border-stone-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-200 transition-colors"
                onClick={() => set('outsideMaroc', !form.outsideMaroc)}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${form.outsideMaroc ? 'bg-emerald-600 border-emerald-600' : 'border-stone-300'}`}>
                  {form.outsideMaroc && <Check className="size-3 text-white" />}
                </div>
                <span className="text-sm font-medium text-stone-700">مقيم خارج التراب الوطني (تطبق إجراءات خاصة)</span>
              </label>
            </div>
          </div>
        )}

        {/* STEP 7 */}
        {currentStep === 7 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-lg font-serif italic text-emerald-900 mb-6">الوصف القانوني والإنهاء</h3>
            <div className="space-y-3 bg-white p-6 border border-stone-200 rounded-xl shadow-sm">
              <label className="text-sm font-bold text-stone-700">وصف الجنحة المثبتة (الصياغة القانونية الرسمية)</label>
              <textarea rows={4} value={form.legalDescription} onChange={e => set('legalDescription', e.target.value)}
                placeholder="الرجاء إدخال الوصف..."
                className="w-full bg-stone-50 border border-stone-200 rounded-xl p-4 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-stone-800 outline-none resize-none placeholder:text-stone-400"
              />
              <div className="flex flex-wrap gap-2 mt-3">
                {LEGAL_SUGGESTIONS.map((s, i) => (
                  <button key={i} type="button"
                    onClick={() => set('legalDescription', s)}
                    className="px-3 py-1.5 bg-stone-100 border border-stone-200 text-stone-600 text-xs rounded-lg hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 cursor-pointer transition-colors shadow-sm"
                  >
                    {s.length > 50 ? s.slice(0, 50) + '...' : s}
                  </button>
                ))}
              </div>
            </div>

            {/* Recap */}
            <div className="p-6 bg-stone-50 border border-stone-200 rounded-xl">
              <h4 className="text-sm font-bold text-stone-700 mb-4">ملخص المحضر</h4>
              <div className="space-y-2 text-sm">
                <SummaryRow label="رقم المحضر" value={pvNum} />
                <SummaryRow label="التاريخ" value={form.date} />
                <SummaryRow label="الوقت" value={form.heure} />
                <SummaryRow label="الغابة / القسم" value={`${form.foret} / ${form.canton}`} />
                <SummaryRow label="المحرر الأول" value={form.agent1.nom} />
                <SummaryRow label="المخالف" value={`${form.firstName} ${form.lastName}`} />
                <SummaryRow label="الجرائم" value={`${form.infractions.length} جريمة`} />
              </div>
            </div>

            {saveError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{saveError}</div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <button type="button" onClick={handleSaveOnly} disabled={saving}
                className="flex-1 py-4 bg-white text-emerald-700 border border-emerald-200 shadow-sm rounded-xl font-bold hover:bg-emerald-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Check className="size-5" /> {saving ? 'جاري الحفظ...' : 'حفظ في النظام'}
              </button>
              <button type="button" onClick={handleSaveAndGenerate} disabled={saving}
                className="flex-1 py-4 bg-emerald-800 text-white rounded-xl font-bold shadow-md shadow-emerald-900/10 hover:bg-emerald-900 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <FileCode2 className="size-5" /> {saving ? 'جاري...' : 'حفظ + تصدير DOCX'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Navigation */}
      <div className="p-6 border-t border-stone-100 bg-stone-50/50 flex flex-wrap items-center justify-between gap-4 rounded-b-2xl">
        <button type="button" onClick={handlePrev} disabled={currentStep === 1}
          className="px-6 py-2.5 border border-stone-200 bg-white text-stone-600 rounded-xl font-bold flex items-center gap-2 hover:bg-stone-50 transition-colors disabled:opacity-50 disabled:pointer-events-none text-sm shadow-sm"
        >
          السابق <ChevronLeft className="size-4" />
        </button>
        <span className="text-stone-500 font-mono font-bold text-sm bg-white px-4 py-1.5 rounded-lg border border-stone-200 shadow-sm">
          {currentStep} / {totalSteps}
        </span>
        {currentStep < totalSteps ? (
          <button type="button" onClick={handleNext}
            className="px-8 py-2.5 bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-800 transition-colors shadow-md shadow-emerald-900/10 text-sm"
          >
            التالي <ChevronLeft className="size-4 rotate-180" />
          </button>
        ) : (
          <div className="hidden sm:block w-[110px]"></div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-stone-100 last:border-0">
      <span className="text-stone-500 font-medium">{label}</span>
      <span className="text-stone-800 font-mono font-medium">{value || '—'}</span>
    </div>
  );
}

function FormInputLight({ label, type, placeholder, disabled, value, onChange }: any) {
  return (
    <div className="space-y-2 text-right w-full">
      <label className="text-xs font-bold text-stone-600">{label}</label>
      <input
        type={type}
        dir="rtl"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-stone-800 outline-none shadow-sm placeholder:text-stone-300 ${type === 'date' || type === 'time' ? 'font-mono text-left block' : ''}`}
      />
    </div>
  );
}

function KPICard({ title, value, trend, type, icon: Icon }: any) {
  const styles: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    orange: 'bg-orange-50 text-orange-700 border-orange-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    stone: 'bg-stone-50 text-stone-700 border-stone-200',
  };
  const s = styles[type] || styles.stone;
  return (
    <div className="bg-white border border-stone-200 p-3 md:p-5 rounded-xl md:rounded-2xl shadow-sm relative overflow-hidden group">
      <div className={`absolute -right-4 -top-4 size-12 md:size-16 rounded-full opacity-20 transition-all group-hover:scale-150 ${s.split(' ')[0]}`}></div>
      <div className="flex items-center justify-between mb-2 md:mb-4 relative z-10">
        <div className={`p-1.5 md:p-2 rounded-lg border ${s}`}><Icon className="size-4 md:size-5" /></div>
        <span className="text-[9px] md:text-[10px] font-bold text-stone-400 uppercase tracking-widest">{trend}</span>
      </div>
      <div className="relative z-10">
        <p className="text-[9px] md:text-[11px] font-bold text-stone-400 uppercase md:tracking-widest mb-0 md:mb-1">{title}</p>
        <p className="text-xl md:text-3xl font-serif text-emerald-900">{value}</p>
      </div>
    </div>
  );
}