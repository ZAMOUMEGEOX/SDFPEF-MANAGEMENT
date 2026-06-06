// src/views/DomaineForestier/DocumentModals.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Modals de génération de documents — extraits et adaptés de atlas-forest-map.tsx
// UI : Tailwind v4, variables CSS var(--bg-surface) etc.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { X, Printer, FileDown, Copy, FileText, Layers, ChevronDown, ChevronRight } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FicheConfig {
  numero: string; date: string; refEnvoi: string;
  immeubleDit: string; objetRequisition: string;
  bulletinOfficielNum: string; bulletinOfficielDate: string;
  demandeParNom: string; communeRurale: string; cercle: string; caidat: string;
  foret: string; canton: string; lambertX: string; lambertY: string;
  perimetre: string; lieudit: string;
  superficieDeclareHa: string; superficieDeclareAr: string; superficieDeclareCa: string;
  superficieBornee: string; borneNumero: string;
  distanceDescription: string; descriptionVegetation: string;
  reboisement: string; equipement: string; exploitation: string; pvDresses: string;
  actesPropriete: string;
  'empiètement': 'TOTAL' | 'PARTIEL' | 'NÉANT';
  avis: 'FAVORABLE' | 'DÉFAVORABLE';
  conclusion: string; signataire: string; signataireDate: string;
}

const FICHE_DEFAULT: FicheConfig = {
  numero: '', date: new Date().toLocaleDateString('fr-FR'), refEnvoi: '',
  immeubleDit: '', objetRequisition: '', bulletinOfficielNum: '', bulletinOfficielDate: '',
  demandeParNom: '', communeRurale: '', cercle: '', caidat: '',
  foret: '', canton: '', lambertX: '', lambertY: '',
  perimetre: '', lieudit: '',
  superficieDeclareHa: '00', superficieDeclareAr: '00', superficieDeclareCa: '00',
  superficieBornee: '', borneNumero: '',
  distanceDescription: '', descriptionVegetation: 'matorral et chêne liège',
  reboisement: '—', equipement: '—', exploitation: '—', pvDresses: '—',
  actesPropriete: '',
  'empiètement': 'TOTAL', avis: 'FAVORABLE',
  conclusion: '', signataire: '', signataireDate: '',
};

export interface AttestConfig {
  nomProprietaire: string; referenceParcel: string;
  commune: string; qiada: string; omala: string;
  foret: string; canton: string; cpf: string;
  superficieM2: string; dateVisite: string;
  limiteNord: string; limiteSud: string; limiteEst: string; limiteOuest: string;
  positionDomaine: 'داخل الملك الغابوي' | 'جزئيا داخل الملك الغابوي' | 'خارج الملك الغابوي';
  rapporteurNom: string; chefCPF: string;
  coordPoints: Array<{ num: number; x: string; y: string }>;
}

const ATTEST_DEFAULT: AttestConfig = {
  nomProprietaire: '', referenceParcel: '', commune: '', qiada: '', omala: '',
  foret: '', canton: '', cpf: "M'diq-Fnideq",
  superficieM2: '', dateVisite: new Date().toISOString().split('T')[0],
  limiteNord: '', limiteSud: '', limiteEst: '', limiteOuest: '',
  positionDomaine: 'خارج الملك الغابوي',
  rapporteurNom: '', chefCPF: '',
  coordPoints: Array.from({ length: 6 }, (_, i) => ({ num: i + 1, x: '', y: '' })),
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function downloadWord(html: string, filename: string) {
  const wordHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>${html}</html>`;
  const blob = new Blob(['\ufeff', wordHtml], { type: 'application/msword' });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

function printHtml(html: string) {
  const w = window.open('', '_blank', 'width=960,height=750');
  if (w) { w.document.write(html); w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 400); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal Wrapper
// ─────────────────────────────────────────────────────────────────────────────

function ModalWrap({ title, onClose, wide = false, children }: {
  title: string; onClose: () => void; wide?: boolean; children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-2xl w-full overflow-hidden flex flex-col ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
           style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-[var(--border-color)] bg-[var(--bg-main)] shrink-0">
          <h3 className="text-[var(--text-main)] font-semibold text-sm tracking-wide">{title}</h3>
          <button onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors bg-[var(--bg-surface)] hover:bg-[var(--bg-main)] p-1.5 rounded-lg border border-[var(--border-color)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Scrollable body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Input helpers
// ─────────────────────────────────────────────────────────────────────────────

const inp = "w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg p-2 text-sm text-[var(--text-main)] focus:outline-none focus:border-[var(--brand)] transition-colors";
const lbl = "block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1";

function Field({ label, value, onChange, type = 'text', placeholder = '' }: any) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input type={type} value={value} onChange={(e: any) => onChange(e.target.value)}
        placeholder={placeholder} className={inp} />
    </div>
  );
}

function Section({ title, children, defaultOpen = false }: any) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[var(--border-color)] rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[var(--bg-main)] text-[11px] font-bold text-[var(--text-main)] uppercase tracking-wider hover:bg-[var(--bg-surface)] transition-colors">
        {title}
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && <div className="p-3 space-y-3 bg-[var(--bg-surface)]">{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Document generation — Fiche Technique
// ─────────────────────────────────────────────────────────────────────────────

function buildFicheHTML(c: FicheConfig): string {
  const empColor = c['empiètement'] === 'TOTAL' ? '#dc2626' : c['empiètement'] === 'PARTIEL' ? '#d97706' : '#166534';
  const empBg    = c['empiètement'] === 'TOTAL' ? 'rgba(220,38,38,0.08)' : c['empiètement'] === 'PARTIEL' ? 'rgba(217,119,6,0.08)' : 'rgba(22,101,52,0.08)';
  const avisColor = c.avis === 'DÉFAVORABLE' ? '#dc2626' : '#166534';

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Fiche Technique de Réquisition</title>
  <style>
    @page{size:A4 landscape;margin:1.2cm 1.5cm}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:"Times New Roman",serif;font-size:9.5pt;color:#111;line-height:1.5;height:100vh}
    .page{display:flex;height:100%;gap:0}
    .col-left{width:55%;padding-right:14px;border-right:1.5px solid #555;display:flex;flex-direction:column;gap:6px;overflow:hidden}
    .col-right{width:45%;padding-left:14px;display:flex;flex-direction:column;gap:10px}
    .header-row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px}
    h2{text-align:center;font-size:11pt;text-decoration:underline;margin:4px 0 6px;line-height:1.4}
    .sec{margin-bottom:4px}.sec-title{font-weight:bold;text-decoration:underline;font-size:9.5pt;margin-bottom:2px}
    .sec p{margin:1px 0;font-size:8.8pt}
    .sup-grid{display:flex;gap:6px;align-items:center;margin:1px 0}
    .sup-cell{border:1px solid #999;padding:1px 6px;font-weight:bold;font-size:9pt;background:#fafafa}
    .sup-unit{font-weight:bold;font-size:8pt;color:#555}
    .badge{display:inline-block;border:2px solid ${empColor};color:${empColor};background:${empBg};padding:1px 12px;font-weight:bold;font-size:11pt;letter-spacing:2px}
    .croquis-box{flex:1;min-height:0}.croquis-title{font-size:9.5pt;font-weight:bold;text-align:center;margin-bottom:6px;text-decoration:underline}
    .correspondence{border-top:1.5px solid #555;padding-top:8px;margin-top:auto;font-size:8.5pt}
    .corr-avis{font-size:9pt;margin:4px 0}.avis-word{font-size:12pt;font-weight:bold;color:${avisColor}}
    p{margin:1px 0}strong{font-weight:bold}u{text-decoration:underline}
  </style></head><body>
  <div class="page">
    <div class="col-left">
      <div class="header-row">
        <div style="font-size:9pt;line-height:1.7"><strong>DRANEF : TTH</strong><br><strong>DPANEF : Tétouan</strong><br><strong>CPF : M'diq-Fnideq</strong><br><strong>BM : M'diq-Fnideq</strong></div>
        <div style="font-size:9pt;text-align:right;line-height:1.7">N° <strong>${c.numero||'___'}</strong><br>Le, <strong>${c.date||''}</strong><br>Réf : Envoi CPF n°<strong>${c.refEnvoi||'___'}</strong></div>
      </div>
      <h2>- RÉQUISITION DE LA DÉLIMITATION OU D'IMMATRICULATION -<br><span style="font-size:10pt">- FICHE DE RECONNAISSANCE -</span></h2>
      <div class="sec">
        <p><u>L'immeuble foncier dit :</u> <strong>${c.immeubleDit||'xxxxx'}</strong></p>
        <p>Objet de la réquisition N° : <strong>${c.objetRequisition||'xxxx/xx'}</strong></p>
        <p>Bulletin officiel N° <strong>${c.bulletinOfficielNum||'xxxx'}</strong> du <strong>${c.bulletinOfficielDate||''}</strong></p>
        <p>A la demande de : <strong>${c.demandeParNom||'xxxxxxxxxx'}</strong></p>
        <p>Visité par la commission de bornage :</p>
      </div>
      <div class="sec">
        <div class="sec-title">2°) SITUATION ADMINISTRATIVE ET FORESTIÈRE :</div>
        <p>- Commune Rurale de : <strong>${c.communeRurale||'xxxxxxx'}</strong> &nbsp; Cercle de : <strong>${c.cercle||'xxxxxx'}</strong> &nbsp; Caïdat de : <strong>${c.caidat||'xxxxxx'}</strong></p>
        <p>- Forêt : <strong>${c.foret||'xxxxxxxx'}</strong>, BM : M'diq-Fnideq, Canton de <strong>${c.canton||'xxxxxx'}</strong></p>
        <p>- Périmètre de <strong>${c.perimetre||'…'}</strong>, &nbsp; Lieudit : <strong>${c.lieudit||'xxxxxxxxxx'}</strong></p>
        <p>- Coordonnées Lambert &nbsp; X : <strong>${c.lambertX||'xxxxx'}</strong> &nbsp; ; &nbsp; Y : <strong>${c.lambertY||'xxxxxx'}</strong></p>
        <p>- Superficie déclarée :
          <span class="sup-grid">
            <span class="sup-cell">${c.superficieDeclareHa||'00'}</span><span class="sup-unit">HA</span>
            <span class="sup-cell">${c.superficieDeclareAr||'00'}</span><span class="sup-unit">A</span>
            <span class="sup-cell">${c.superficieDeclareCa||'00'}</span><span class="sup-unit">CA</span>
          </span>
          &nbsp; Superficie bornée : <strong>${c.superficieBornee||'…'}</strong>
        </p>
        <p>- N° de la borne la plus proche : <strong>${c.borneNumero||'xxxx'}</strong></p>
      </div>
      <div class="sec">
        <div class="sec-title">3°) DESCRIPTION DE L'IMMEUBLE :</div>
        <p>- Distance par rapport à la forêt : <strong style="color:${empColor}">${c.distanceDescription||'…'}</strong></p>
        <p>- Description : ${c.descriptionVegetation||'matorral et chêne liège'}</p>
      </div>
      <div class="sec">
        <div class="sec-title">4°) INTERVENTIONS FORESTIÈRES :</div>
        <p>- Reboisement : ${c.reboisement||'—'} &nbsp; - Équipement : ${c.equipement||'—'}</p>
        <p>- Exploitation : ${c.exploitation||'—'} &nbsp; - P.V. dressés : ${c.pvDresses||'—'}</p>
      </div>
      <div class="sec">
        <div class="sec-title">5°) ACTES DE PROPRIÉTÉ EN PRÉSENCE :</div>
        <p>${c.actesPropriete||'Présenté par le requérant : ………'}</p>
      </div>
      <div class="sec">
        <div class="sec-title">6°) EMPIÈTEMENT DE LA RÉQUISITION :</div>
        <p style="margin-top:3px"><span class="badge">EMPIÈTEMENT ${c['empiètement']||'TOTAL'}</span></p>
      </div>
      <div class="sec">
        <div class="sec-title">7°) CONCLUSION ET ÉLÉMENTS DIVERS :</div>
        <p>${c.conclusion||'……………………………………………………………………………'}</p>
        <p style="text-align:right;margin-top:2px">En date du : <strong>${c.signataireDate||''}</strong></p>
      </div>
    </div>
    <div class="col-right">
      <div class="croquis-title">Croquis de situation à valider :</div>
      <div class="croquis-box"><div style="width:100%;height:280px;border:1px dashed #bbb;display:flex;align-items:center;justify-content:center;color:#bbb;font-style:italic;font-size:10px;background:#f9f9f9;border-radius:4px">[Croquis — à compléter]</div></div>
      <div class="correspondence">
        <div>N° &nbsp;&nbsp;&nbsp;&nbsp; /CPF/M'diq-Fnideq &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; M'diq, Le ${c.signataireDate||''}</div>
        <div style="text-align:center;font-style:italic;margin:6px 0">Copie conforme transmise à<br><strong>Mr le Directeur Provincial de l'ANEF de TETOUAN</strong></div>
        <div class="corr-avis">« Pour information, en ayant l'honneur de vous informer que cette Zone émet un avis&nbsp;<span class="avis-word">${c.avis||'FAVORABLE'}</span>&nbsp;».</div>
        <div style="text-align:right;margin-top:8px"><strong>Le Chef de CPF de M'diq - Fnideq</strong><br>${c.signataire||''}</div>
      </div>
    </div>
  </div>
  </body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Document generation — Attestation (بطاقة معاينة)
// ─────────────────────────────────────────────────────────────────────────────

function buildAttestationHTML(cfg: AttestConfig): string {
  const date    = new Date(cfg.dateVisite || Date.now());
  const dayAr   = date.getDate();
  const monthAr = date.toLocaleDateString('ar-MA', { month: 'long' });
  const yearAr  = date.getFullYear();

  const chk = (val: string, opt: string) =>
    `<span style="display:inline-block;width:13px;height:13px;border:1.5px solid #333;border-radius:2px;background:${val===opt?'#166534':'white'};margin-left:4px;vertical-align:middle"></span>`;

  const pointsRows = cfg.coordPoints
    .filter(p => p.x || p.y)
    .map(p => `<tr>
      <td style="border:1px solid #999;padding:3px 8px;text-align:center;font-size:9pt">${p.num}</td>
      <td style="border:1px solid #999;padding:3px 8px;text-align:center;font-size:9pt;direction:ltr">${p.x||'—'}</td>
      <td style="border:1px solid #999;padding:3px 8px;text-align:center;font-size:9pt;direction:ltr">${p.y||'—'}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="UTF-8"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Arial',sans-serif;font-size:10pt;color:#111;direction:rtl}
  .page{width:210mm;min-height:297mm;padding:12mm 15mm 10mm;margin:auto;background:#fff}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;font-size:7.5pt;line-height:1.7}
  .title{text-align:center;font-size:14pt;font-weight:bold;text-decoration:underline;margin:14px 0 16px}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px}
  .field{margin-bottom:6px;font-size:9.5pt}
  .field-label{font-weight:bold}
  .dots{border-bottom:1px dotted #666;display:inline-block;min-width:120px}
  .section-title{font-weight:bold;font-size:10pt;margin:10px 0 6px}
  .coords-table{width:100%;border-collapse:collapse;margin:8px 0}
  .coords-table th{background:#e8f5e9;border:1px solid #999;padding:4px 8px;font-size:9pt;text-align:center}
  .checkbox-row{display:flex;gap:24px;margin:8px 0;font-size:9.5pt;align-items:center}
  .sig-table{width:100%;border-collapse:collapse;margin-top:8px}
  .sig-table td{border:1px solid #555;padding:6px 8px;text-align:center;font-size:8.5pt;vertical-align:top;height:70px}
  .sig-table .sig-head{font-weight:bold;height:auto;background:#f4f7f4}
  .legal{font-size:7.5pt;color:#555;margin-top:10px;padding-top:8px;border-top:1px solid #ddd;line-height:1.6}
  .ref-box{border:1px solid #888;padding:4px 10px;display:inline-block;margin-bottom:8px;font-size:9pt}
  @media print{@page{size:A4;margin:0}body{margin:0}}
</style>
</head><body><div class="page">
  <div class="header">
    <div style="flex:1">المملكة المغربية<br/>الوكالة الوطنية للمياه والغابات<br/>المديرية الجهوية لتطوان<br/>المديرية الإقليمية لتطوان<br/>مركز حماية الغابات المضيق-الفنيدق</div>
    <div style="text-align:center;padding:0 12px;flex-shrink:0">
      <div style="width:60px;height:60px;border:2px solid #166534;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 4px;font-size:7pt;font-weight:bold;color:#166534;text-align:center">ANEF</div>
      <div style="font-size:7pt;color:#555;line-height:1.4">الوكالة الوطنية للمياه والغابات<br/>Agence Nationale des Eaux et Forêts</div>
    </div>
    <div style="text-align:left;direction:ltr;font-size:7.5pt;flex:1">Royaume du Maroc<br/>Agence Nationale des Eaux et Forêts<br/>Direction Régionale de Tétouan<br/>Direction Provinciale de Tétouan<br/>Centre de Protection des Forêts: ${cfg.cpf||"M'diq-Fnideq"}</div>
  </div>
  <div class="title">بطاقة معاينة حول إنتفاء الصبغة الغابوية</div>
  <div class="two-col">
    <div>
      <div class="field"><span class="field-label">اسم العقار: </span><span class="dots">${cfg.foret||'........'}</span></div>
      <div class="field"><span class="field-label">المرجع: </span><span class="ref-box">${cfg.referenceParcel||'...... م ح غ / م ف'}</span></div>
      <div class="field"><span class="field-label">الجماعة القروية أو الحضارية: </span><span class="dots">${cfg.commune||'............'}</span></div>
      <div class="field"><span class="field-label">قيادة: </span><span class="dots">${cfg.qiada||'............'}</span></div>
      <div class="field"><span class="field-label">اسم صاحب العقار: </span><span class="dots">${cfg.nomProprietaire||'..........'}</span></div>
      <div class="field"><span class="field-label">بتاريخ: </span> يوم <span class="dots">${dayAr}</span> شهر <span class="dots">${monthAr}</span> سنة <span class="dots">${yearAr}</span></div>
      <div class="field"><span class="field-label">عمالة: </span><span class="dots">${cfg.omala||'............'}</span></div>
      <div class="field"><span class="field-label">مساحة الأرض: </span><span class="dots">${cfg.superficieM2||'........'}</span> متر مربع</div>
    </div>
    <div>
      <div class="section-title" style="text-align:center">الإحداثيات :</div>
      <table class="coords-table">
        <thead><tr><th>النقطة</th><th>X</th><th>Y</th></tr></thead>
        <tbody>${pointsRows||'<tr><td colspan="3" style="text-align:center;padding:6px;color:#999;font-size:8pt">—</td></tr>'}</tbody>
      </table>
    </div>
  </div>
  <div class="section-title">حدود العقار كما يلي:</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9.5pt;margin-bottom:10px">
    <div><strong>الشمال:</strong> <span class="dots">${cfg.limiteNord||'.....'}</span></div>
    <div><strong>الجنوب:</strong> <span class="dots">${cfg.limiteSud||'.....'}</span></div>
    <div><strong>الغرب:</strong> <span class="dots">${cfg.limiteOuest||'.....'}</span></div>
    <div><strong>الشرق:</strong> <span class="dots">${cfg.limiteEst||'.....'}</span></div>
  </div>
  <div class="section-title">وضعية العقار بالنسبة للملك الغابوي :</div>
  <div class="checkbox-row">
    ${chk(cfg.positionDomaine,'خارج الملك الغابوي')} خارج الملك الغابوي &nbsp;&nbsp;
    ${chk(cfg.positionDomaine,'جزئيا داخل الملك الغابوي')} جزئيا داخل الملك الغابوي &nbsp;&nbsp;
    ${chk(cfg.positionDomaine,'داخل الملك الغابوي')} داخل الملك الغابوي
  </div>
  <div class="legal">
    المحدد بموجب مرسوم رقم 2.84321 صادر في 13 محرم 1405 الموافق ل 9 اکتوبر 1984.
    ويبقى للإدارة حق الرجوع إذا ظهرت قوانين جديدة كما أن هذه الإفادة لا يمكن الاستشهاد بها خارج الإدارة
    ولا تكسب طالبها حق الملكية لهذا العقار.
  </div>
  <div class="section-title" style="margin-top:14px">إمضاء اللجنة التي عاينت العقار:</div>
  <table class="sig-table">
    <tr>
      <td class="sig-head">رئيس مركز حماية الغابات المضيق- الفنيدق</td>
      <td class="sig-head">عناصر الفرقة المتنقلة المضيق-الفنيدق</td>
    </tr>
    <tr>
      <td><strong>${cfg.chefCPF||''}</strong></td>
      <td><strong>${cfg.rapporteurNom||''}</strong></td>
    </tr>
  </table>
  <div style="margin-top:12px;font-size:8pt;color:#555;text-align:center">
    المرفقات: تصميم توضيحي لموقع العقار بالنسبة لأقرب غابة مخزنية.
  </div>
</div></body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// FicheModal — Fiche Technique de Réquisition
// ─────────────────────────────────────────────────────────────────────────────

export function FicheModal({ onClose }: { onClose: () => void }) {
  const [c, setC] = useState<FicheConfig>(FICHE_DEFAULT);
  const set = (k: keyof FicheConfig) => (v: string) => setC(prev => ({ ...prev, [k]: v }));

  const printFiche = () => printHtml(buildFicheHTML(c));

  const downloadFiche = () => {
    const html = buildFicheHTML(c);
    downloadWord(html, `fiche-technique-${c.immeubleDit||'requisition'}.doc`);
  };

  const copyText = () => {
    const text = `FICHE DE RECONNAISSANCE\nN° ${c.numero} — ${c.date}\nImmeuble: ${c.immeubleDit}\nForêt: ${c.foret} | Canton: ${c.canton}\nSuperficie: ${c.superficieDeclareHa} HA ${c.superficieDeclareAr} A ${c.superficieDeclareCa} CA\nLambert: X ${c.lambertX} / Y ${c.lambertY}\nEMPIÈTEMENT: ${c['empiètement']}\nAvis: ${c.avis}`;
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <ModalWrap title="Fiche Technique de Réquisition" onClose={onClose} wide>
      {/* En-tête */}
      <Section title="En-tête" defaultOpen>
        <div className="grid grid-cols-3 gap-2">
          <Field label="N°" value={c.numero} onChange={set('numero')} />
          <Field label="Date" value={c.date} onChange={set('date')} />
          <Field label="Réf Envoi CPF" value={c.refEnvoi} onChange={set('refEnvoi')} />
        </div>
      </Section>

      {/* Identification */}
      <Section title="1. Identification" defaultOpen>
        <Field label="Immeuble dit" value={c.immeubleDit} onChange={set('immeubleDit')} placeholder="Nom de l'immeuble foncier" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="N° Réquisition" value={c.objetRequisition} onChange={set('objetRequisition')} />
          <Field label="Demandé par" value={c.demandeParNom} onChange={set('demandeParNom')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Bulletin Officiel N°" value={c.bulletinOfficielNum} onChange={set('bulletinOfficielNum')} />
          <Field label="Date BO" value={c.bulletinOfficielDate} onChange={set('bulletinOfficielDate')} />
        </div>
      </Section>

      {/* Situation */}
      <Section title="2. Situation Administrative & Forestière">
        <div className="grid grid-cols-3 gap-2">
          <Field label="Commune" value={c.communeRurale} onChange={set('communeRurale')} />
          <Field label="Cercle" value={c.cercle} onChange={set('cercle')} />
          <Field label="Caïdat" value={c.caidat} onChange={set('caidat')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Forêt" value={c.foret} onChange={set('foret')} />
          <Field label="Canton" value={c.canton} onChange={set('canton')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Lieu-dit" value={c.lieudit} onChange={set('lieudit')} />
          <Field label="Périmètre (m)" value={c.perimetre} onChange={set('perimetre')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Lambert X" value={c.lambertX} onChange={set('lambertX')} />
          <Field label="Lambert Y" value={c.lambertY} onChange={set('lambertY')} />
        </div>
        <div>
          <label className={lbl}>Superficie Déclarée (HA / A / CA)</label>
          <div className="grid grid-cols-3 gap-2">
            <input value={c.superficieDeclareHa} onChange={(e) => set('superficieDeclareHa')(e.target.value)} className={inp} placeholder="HA" />
            <input value={c.superficieDeclareAr} onChange={(e) => set('superficieDeclareAr')(e.target.value)} className={inp} placeholder="A" />
            <input value={c.superficieDeclareCa} onChange={(e) => set('superficieDeclareCa')(e.target.value)} className={inp} placeholder="CA" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Superficie bornée" value={c.superficieBornee} onChange={set('superficieBornee')} />
          <Field label="N° Borne la plus proche" value={c.borneNumero} onChange={set('borneNumero')} />
        </div>
      </Section>

      {/* Description */}
      <Section title="3–5. Description & Interventions">
        <Field label="Distance / Position par rapport à la forêt" value={c.distanceDescription} onChange={set('distanceDescription')} />
        <Field label="Description végétation" value={c.descriptionVegetation} onChange={set('descriptionVegetation')} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Reboisement" value={c.reboisement} onChange={set('reboisement')} />
          <Field label="Équipement" value={c.equipement} onChange={set('equipement')} />
          <Field label="Exploitation" value={c.exploitation} onChange={set('exploitation')} />
          <Field label="P.V. dressés" value={c.pvDresses} onChange={set('pvDresses')} />
        </div>
        <Field label="Actes de propriété" value={c.actesPropriete} onChange={set('actesPropriete')} />
      </Section>

      {/* Empiètement & Avis */}
      <Section title="6–7. Empiètement, Avis & Conclusion" defaultOpen>
        <div>
          <label className={lbl}>Empiètement</label>
          <div className="flex gap-2">
            {(['TOTAL','PARTIEL','NÉANT'] as const).map(v => (
              <button key={v} onClick={() => setC(p => ({...p, 'empiètement': v}))}
                className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${c['empiètement']===v ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--brand)]'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={lbl}>Avis</label>
          <div className="flex gap-2">
            {(['FAVORABLE','DÉFAVORABLE'] as const).map(v => (
              <button key={v} onClick={() => setC(p => ({...p, avis: v}))}
                className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${c.avis===v ? (v==='FAVORABLE'?'bg-emerald-600 text-white border-emerald-600':'bg-red-600 text-white border-red-600') : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--brand)]'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={lbl}>Conclusion</label>
          <textarea value={c.conclusion} onChange={(e) => set('conclusion')(e.target.value)} rows={3}
            className={`${inp} resize-none`} placeholder="Éléments divers et conclusion..." />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Signataire (Chef CPF)" value={c.signataire} onChange={set('signataire')} />
          <Field label="Date signature" value={c.signataireDate} onChange={set('signataireDate')} />
        </div>
      </Section>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button onClick={printFiche}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[var(--brand)] hover:opacity-90 text-white font-semibold rounded-lg text-sm transition-opacity">
          <Printer className="w-4 h-4" /> Imprimer PDF
        </button>
        <button onClick={downloadFiche}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[var(--bg-main)] border border-[var(--border-color)] hover:border-[var(--brand)] text-[var(--text-main)] font-semibold rounded-lg text-sm transition-colors">
          <FileDown className="w-4 h-4" /> Word (.doc)
        </button>
        <button onClick={copyText} title="Copier texte"
          className="px-3 py-2.5 bg-[var(--bg-main)] border border-[var(--border-color)] hover:border-[var(--brand)] text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg text-sm transition-colors">
          <Copy className="w-4 h-4" />
        </button>
      </div>
    </ModalWrap>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AttestationModal — بطاقة معاينة حول إنتفاء الصبغة الغابوية
// ─────────────────────────────────────────────────────────────────────────────

export function AttestationModal({ onClose }: { onClose: () => void }) {
  const [c, setC] = useState<AttestConfig>(ATTEST_DEFAULT);
  const set = (k: keyof AttestConfig) => (v: any) => setC(prev => ({ ...prev, [k]: v }));

  const printAttest = () => printHtml(buildAttestationHTML(c));

  const downloadAttest = () => {
    const html = buildAttestationHTML(c);
    const body = html.replace(/<!DOCTYPE[^>]*>/, '').replace(/<html[^>]*>/, '').replace('</html>', '');
    const wordHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>${body}</html>`;
    const blob = new Blob(['\ufeff', wordHtml], { type: 'application/msword' });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: url, download: `بطاقة-معاينة-${c.nomProprietaire||c.referenceParcel||'عقار'}.doc`
    }).click();
    URL.revokeObjectURL(url);
  };

  const updatePoint = (i: number, field: 'x'|'y', value: string) => {
    setC(prev => {
      const pts = [...prev.coordPoints];
      pts[i] = { ...pts[i], [field]: value };
      return { ...prev, coordPoints: pts };
    });
  };

  const addPoint = () => {
    setC(prev => ({
      ...prev,
      coordPoints: [...prev.coordPoints, { num: prev.coordPoints.length + 1, x: '', y: '' }]
    }));
  };

  return (
    <ModalWrap title="بطاقة معاينة — Attestation Administrative" onClose={onClose} wide>
      {/* Info propriétaire */}
      <Section title="معلومات العقار / Identification" defaultOpen>
        <div className="grid grid-cols-2 gap-2">
          <Field label="اسم صاحب العقار / Propriétaire" value={c.nomProprietaire} onChange={set('nomProprietaire')} />
          <Field label="المرجع / Référence" value={c.referenceParcel} onChange={set('referenceParcel')} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="الجماعة / Commune" value={c.commune} onChange={set('commune')} />
          <Field label="القيادة / Qiada" value={c.qiada} onChange={set('qiada')} />
          <Field label="العمالة / Omala" value={c.omala} onChange={set('omala')} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="الغابة / Forêt" value={c.foret} onChange={set('foret')} />
          <Field label="القسم / Canton" value={c.canton} onChange={set('canton')} />
          <Field label="CPF" value={c.cpf} onChange={set('cpf')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="المساحة (م²) / Surface m²" value={c.superficieM2} onChange={set('superficieM2')} />
          <Field label="تاريخ المعاينة / Date Visite" value={c.dateVisite} onChange={set('dateVisite')} type="date" />
        </div>
      </Section>

      {/* Limites */}
      <Section title="الحدود / Limites">
        <div className="grid grid-cols-2 gap-2">
          <Field label="الشمال / Nord" value={c.limiteNord} onChange={set('limiteNord')} />
          <Field label="الجنوب / Sud" value={c.limiteSud} onChange={set('limiteSud')} />
          <Field label="الغرب / Ouest" value={c.limiteOuest} onChange={set('limiteOuest')} />
          <Field label="الشرق / Est" value={c.limiteEst} onChange={set('limiteEst')} />
        </div>
      </Section>

      {/* Coordonnées Lambert */}
      <Section title="الإحداثيات / Coordonnées Lambert">
        <div className="space-y-2">
          {c.coordPoints.map((pt, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="text-[10px] text-[var(--text-muted)] w-4 shrink-0 text-center font-mono">{pt.num}</span>
              <input value={pt.x} onChange={e => updatePoint(i, 'x', e.target.value)} placeholder="X Lambert" className={`${inp} flex-1`} />
              <input value={pt.y} onChange={e => updatePoint(i, 'y', e.target.value)} placeholder="Y Lambert" className={`${inp} flex-1`} />
            </div>
          ))}
          <button onClick={addPoint}
            className="w-full py-1.5 border border-dashed border-[var(--border-color)] hover:border-[var(--brand)] text-[var(--text-muted)] hover:text-[var(--brand)] rounded-lg text-xs font-medium transition-colors">
            + نقطة جديدة
          </button>
        </div>
      </Section>

      {/* Position Domaine */}
      <Section title="وضعية العقار / Position Domaine" defaultOpen>
        <div className="space-y-2">
          {(['خارج الملك الغابوي','جزئيا داخل الملك الغابوي','داخل الملك الغابوي'] as const).map(opt => (
            <button key={opt} onClick={() => set('positionDomaine')(opt)}
              className={`w-full py-2 rounded-lg text-xs font-bold border transition-all text-right px-3 ${c.positionDomaine===opt ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--brand)]'}`}
              style={{ direction: 'rtl' }}>
              {opt}
            </button>
          ))}
        </div>
      </Section>

      {/* Signatures */}
      <Section title="التوقيعات / Signatures" defaultOpen>
        <Field label="رئيس مركز حماية الغابات / Chef CPF" value={c.chefCPF} onChange={set('chefCPF')} />
        <div>
          <label className={lbl}>عناصر الفرقة المتنقلة / Rapporteurs (séparés par , )</label>
          <input value={c.rapporteurNom} onChange={(e) => set('rapporteurNom')(e.target.value)}
            className={inp} placeholder="الزاموم أحمد، تجريبات موسى" />
        </div>
      </Section>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button onClick={printAttest}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[var(--brand)] hover:opacity-90 text-white font-semibold rounded-lg text-sm transition-opacity">
          <Printer className="w-4 h-4" /> طباعة / Imprimer
        </button>
        <button onClick={downloadAttest}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[var(--bg-main)] border border-[var(--border-color)] hover:border-[var(--brand)] text-[var(--text-main)] font-semibold rounded-lg text-sm transition-colors">
          <FileDown className="w-4 h-4" /> Word (.doc)
        </button>
      </div>
    </ModalWrap>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ExpertiseModal — Rapport d'Expertise (Woqof / PV)
// ─────────────────────────────────────────────────────────────────────────────

export function ExpertiseModal({ onClose }: { onClose: () => void }) {
  const [dossier, setDossier]     = useState('');
  const [tribunal, setTribunal]   = useState('Tétouan');
  const [date, setDate]           = useState(new Date().toISOString().split('T')[0]);
  const [foret, setForet]         = useState('');
  const [canton, setCanton]       = useState('');
  const [superficie, setSuperficie] = useState('');
  const [position, setPosition]   = useState<'كلياً'|'جزئياً'|'خارج'>('كلياً');
  const [rapporteur1, setR1]      = useState('');
  const [rapporteur2, setR2]      = useState('');
  const [description, setDesc]    = useState('');

  const generate = () => {
    const content = `المملكة المغربية
الوكالة الوطنية للمياه والغابات
المديرية الإقليمية لتطوان
مركز حماية وتنمية الغابات للمضيق-الفنيدق

─────────────────────────────────────────
محضر التصريحات
ملف عقاري عدد: ${dossier}
المحكمة الابتدائية ب${tribunal}
─────────────────────────────────────────

بناءا على الأمر التمهيدي والقاضي باجراء الوقوف بعين المكان للتحقق من وضعية العقار موضوع الدعوى، نحن الموقعون اسفله ممثلوا المديرية الإقليمية للوكالة الوطنية للمياه والغابات بتطوان:

1- ${rapporteur1} : رئيس مركز حماية الغابات للمضيق-الفنيدق بالنيابة
2- ${rapporteur2} : عضو بالفرقة المتنقلة للمضيق-الفنيدق

نصرح بما يلي:

إن القطعة الأرضية موضوع النزاع تدخل ${position} ضمن الملك الغابوي بالغابة المخزنية لـ "${foret}" قسم "${canton}".

المساحة المحسوبة تقنياً: ${superficie} هكتار.

${description}

حرر بتطوان في: ${date}

توقيع المصرح 1: .......................     توقيع المصرح 2: .......................
${rapporteur1}                               ${rapporteur2}`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>محضر التصريحات</title>
<style>body{font-family:'Arial',sans-serif;direction:rtl;padding:2cm;font-size:11pt;line-height:1.8;color:#111}pre{white-space:pre-wrap;font-family:inherit}</style>
</head><body><pre>${content}</pre></body></html>`;
    printHtml(html);
  };

  return (
    <ModalWrap title="Rapport d'Expertise — محضر التصريحات" onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>ملف رقم / Dossier</label>
          <input value={dossier} onChange={e => setDossier(e.target.value)} className={inp} placeholder="2024/001" /></div>
        <div><label className={lbl}>المحكمة / Tribunal</label>
          <input value={tribunal} onChange={e => setTribunal(e.target.value)} className={inp} /></div>
        <div><label className={lbl}>Forêt</label>
          <input value={foret} onChange={e => setForet(e.target.value)} className={inp} /></div>
        <div><label className={lbl}>Canton</label>
          <input value={canton} onChange={e => setCanton(e.target.value)} className={inp} /></div>
        <div><label className={lbl}>Superficie (Ha)</label>
          <input value={superficie} onChange={e => setSuperficie(e.target.value)} className={inp} /></div>
        <div><label className={lbl}>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} /></div>
      </div>
      <div>
        <label className={lbl}>Rapporteur 1</label>
        <input value={rapporteur1} onChange={e => setR1(e.target.value)} className={inp} />
      </div>
      <div>
        <label className={lbl}>Rapporteur 2</label>
        <input value={rapporteur2} onChange={e => setR2(e.target.value)} className={inp} />
      </div>
      <div>
        <label className={lbl}>وضعية العقار</label>
        <div className="flex gap-2">
          {(['كلياً','جزئياً','خارج'] as const).map(v => (
            <button key={v} onClick={() => setPosition(v)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${position===v?'bg-[var(--brand)] text-white border-[var(--brand)]':'border-[var(--border-color)] text-[var(--text-muted)]'}`}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className={lbl}>ملاحظات / Observations</label>
        <textarea value={description} onChange={e => setDesc(e.target.value)} rows={4}
          className={`${inp} resize-none`} placeholder="تفاصيل إضافية حول العقار..." />
      </div>
      <button onClick={generate}
        className="w-full py-2.5 bg-[var(--brand)] hover:opacity-90 text-white font-semibold rounded-lg text-sm flex items-center justify-center gap-2">
        <FileText className="w-4 h-4" /> توليد وطباعة المحضر
      </button>
    </ModalWrap>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChevauchementModal — instructions analyse intersection
// ─────────────────────────────────────────────────────────────────────────────

export function ChevauchementModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalWrap title="Analyse Chevauchement — Domaine Forestier" onClose={onClose}>
      <div className="space-y-3">
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          <p className="text-amber-600 text-xs font-bold uppercase tracking-wider mb-1">Utilisation</p>
          <p className="text-[var(--text-main)] text-sm">L'analyse de chevauchement compare une couche importée avec le domaine forestier officiel.</p>
        </div>
        <div className="space-y-2">
          {[
            { n: '1', text: "Allez dans l'onglet Couches" },
            { n: '2', text: "Importez un fichier SHP, GeoJSON ou KML" },
            { n: '3', text: "Revenez ici et lancez l'analyse" },
            { n: '4', text: "Le résultat affiche le % d'intersection et les parcelles concernées" },
          ].map(s => (
            <div key={s.n} className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-full bg-[var(--brand)] text-white text-xs font-bold flex items-center justify-center shrink-0">{s.n}</span>
              <p className="text-[var(--text-main)] text-sm pt-0.5">{s.text}</p>
            </div>
          ))}
        </div>
        <button onClick={() => { onClose(); }}
          className="w-full py-2.5 bg-[var(--bg-main)] border border-[var(--border-color)] hover:border-[var(--brand)] text-[var(--text-main)] font-semibold rounded-lg text-sm flex items-center justify-center gap-2 transition-colors">
          <Layers className="w-4 h-4" /> Aller aux Couches
        </button>
      </div>
    </ModalWrap>
  );
}
