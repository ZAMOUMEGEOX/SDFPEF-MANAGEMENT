// ════════════════════════════════════════════════════════════════════════════
// forestDocx.ts — Génération de VRAIS fichiers .docx (Word natif)
//
// Pourquoi : l'ancien export "application/msword" = du HTML déguisé → Word casse
// le justifié, la mise en page et surtout le RTL arabe. Ici on produit du vrai
// OOXML avec la lib `docx` : direction RTL explicite (rightToLeft + bidirectional),
// alignement justifié, taille de page A4 et marges réelles.
//
// Dépendances (à installer) :  npm i docx html-docx-js-typescript
// ════════════════════════════════════════════════════════════════════════════

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, PageOrientation, VerticalAlign,
} from 'docx';
import { asBlob } from 'html-docx-js-typescript';

// ── Helpers de téléchargement ────────────────────────────────────────────────
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const GREEN = '166534';
const RED = 'dc2626';
const ORANGE = 'ea580c';

// ── Fabriques de paragraphes ─────────────────────────────────────────────────
const ar = (text: string, opts: { bold?: boolean; size?: number; align?: any; color?: string } = {}) =>
  new Paragraph({
    bidirectional: true,
    alignment: opts.align ?? AlignmentType.RIGHT,
    spacing: { after: 60, line: 320 },
    children: [new TextRun({ text, rightToLeft: true, bold: opts.bold, size: opts.size ?? 20, color: opts.color, font: 'Arial' })],
  });

const fr = (text: string, opts: { bold?: boolean; size?: number; align?: any; color?: string; underline?: boolean } = {}) =>
  new Paragraph({
    alignment: opts.align ?? AlignmentType.LEFT,
    spacing: { after: 50, line: 280 },
    children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 18, color: opts.color, font: 'Times New Roman', underline: opts.underline ? {} : undefined })],
  });

const cell = (children: Paragraph[], opts: { width?: number; shade?: string; vAlign?: any } = {}) =>
  new TableCell({
    children,
    verticalAlign: opts.vAlign ?? VerticalAlign.CENTER,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.shade ? { fill: opts.shade } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
  });

const thinBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
  left: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
  right: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
};

const A4 = { width: 11906, height: 16838 }; // twips

// ════════════════════════════════════════════════════════════════════════════
// 1. ATTESTATION (بطاقة معاينة) — Arabe RTL, A4 portrait
// ════════════════════════════════════════════════════════════════════════════
export interface AttestData {
  nomProprietaire: string; referenceParcel: string; commune: string; qiada: string; omala: string;
  foret: string; foretAr: string; canton: string; cpf: string; superficieM2: string; dateVisite: string;
  limiteNord: string; limiteSud: string; limiteEst: string; limiteOuest: string;
  positionDomaine: 'داخل الملك الغابوي' | 'جزئيا داخل الملك الغابوي' | 'خارج الملك الغابوي';
  rapporteurs: string[]; chefCPF: string;
  coordPoints: Array<{ num: number; x: string; y: string }>;
}

export async function exportAttestationDocx(c: AttestData) {
  const date = new Date(c.dateVisite || Date.now());
  const box = (on: boolean) => (on ? '☑' : '☐');
  const field = (label: string, value: string) =>
    new Paragraph({
      bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { after: 70 },
      children: [
        new TextRun({ text: label, rightToLeft: true, bold: true, font: 'Arial', size: 20 }),
        new TextRun({ text: value || '....................', rightToLeft: true, font: 'Arial', size: 20 }),
      ],
    });

  // tableau des coordonnées Lambert
  const coordRows = [
    new TableRow({ tableHeader: true, children: [
      cell([ar('النقطة', { bold: true, align: AlignmentType.CENTER })], { shade: 'E8F5E9' }),
      cell([ar('X', { bold: true, align: AlignmentType.CENTER })], { shade: 'E8F5E9' }),
      cell([ar('Y', { bold: true, align: AlignmentType.CENTER })], { shade: 'E8F5E9' }),
    ] }),
    ...c.coordPoints.filter(p => p.x || p.y).map(p => new TableRow({ children: [
      cell([new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(p.num), font: 'Arial', size: 18 })] })]),
      cell([new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: p.x || '—', font: 'Arial', size: 18 })] })]),
      cell([new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: p.y || '—', font: 'Arial', size: 18 })] })]),
    ] })),
  ];

  // signatures
  const sigRow = new TableRow({ children: [
    cell([ar('رئيس مركز حماية الغابات المضيق - الفنيدق', { bold: true, align: AlignmentType.CENTER, size: 16 })], { shade: 'F4F7F4' }),
    cell([ar('عناصر الفرقة المتنقلة المضيق-الفنيدق', { bold: true, align: AlignmentType.CENTER, size: 16 })], { shade: 'F4F7F4' }),
  ] });
  const sigNames = new TableRow({ children: [
    cell([ar(c.chefCPF || ' ', { align: AlignmentType.CENTER })], { vAlign: VerticalAlign.TOP }),
    cell([ar(c.rapporteurs.filter(Boolean).join('  /  ') || ' ', { align: AlignmentType.CENTER })], { vAlign: VerticalAlign.TOP }),
  ] });

  const doc = new Document({
    sections: [{
      properties: { page: { size: { width: A4.width, height: A4.height, orientation: PageOrientation.PORTRAIT }, margin: { top: 720, right: 900, bottom: 720, left: 900 } } },
      children: [
        ar('المملكة المغربية — الوكالة الوطنية للمياه والغابات (ANEF)', { bold: true, align: AlignmentType.CENTER, size: 18, color: GREEN }),
        ar('بطاقة معاينة حول إنتفاء الصبغة الغابوية', { bold: true, align: AlignmentType.CENTER, size: 28 }),
        new Paragraph({ text: '', spacing: { after: 120 } }),
        field('اسم العقار: ', c.foret),
        field('المرجع: ', c.referenceParcel || '...... م ح غ / م ف'),
        field('الجماعة: ', c.commune),
        field('قيادة: ', c.qiada),
        field('اسم صاحب العقار: ', c.nomProprietaire),
        field('بتاريخ: ', `يوم ${date.getDate()} شهر ${date.toLocaleDateString('ar-MA', { month: 'long' })} سنة ${date.getFullYear()}`),
        field('عمالة: ', c.omala || 'تطوان'),
        field('مساحة الأرض: ', `${c.superficieM2 || '—'} متر مربع`),
        ar('الإحداثيات (لامبير):', { bold: true, align: AlignmentType.CENTER }),
        new Table({ visuallyRightToLeft: true, width: { size: 100, type: WidthType.PERCENTAGE }, borders: thinBorders, rows: coordRows }),
        new Paragraph({ text: '', spacing: { after: 80 } }),
        ar('حدود العقار كما يلي:', { bold: true }),
        field('الشمال: ', c.limiteNord), field('الجنوب: ', c.limiteSud),
        field('الغرب: ', c.limiteOuest), field('الشرق: ', c.limiteEst),
        ar('وضعية العقار بالنسبة للملك الغابوي :', { bold: true }),
        ar(`${box(c.positionDomaine === 'خارج الملك الغابوي')} خارج الملك الغابوي    ${box(c.positionDomaine === 'جزئيا داخل الملك الغابوي')} جزئيا داخل الملك الغابوي    ${box(c.positionDomaine === 'داخل الملك الغابوي')} داخل الملك الغابوي`),
        new Paragraph({ text: '', spacing: { after: 80 } }),
        ar('المحدد بموجب مرسوم رقم 2.84321 صادر في 13 محرم 1405 الموافق ل 9 أكتوبر 1984. ويبقى للإدارة حق الرجوع إذا ظهرت قوانين جديدة كما أن هذه الإفادة لا يمكن الاستشهاد بها خارج الإدارة ولا تكسب طالبها حق الملكية لهذا العقار.', { align: AlignmentType.JUSTIFIED, size: 16, color: '555555' }),
        new Paragraph({ text: '', spacing: { after: 80 } }),
        ar('إمضاء اللجنة التي عاينت العقار:', { bold: true }),
        new Table({ visuallyRightToLeft: true, width: { size: 100, type: WidthType.PERCENTAGE }, borders: thinBorders, rows: [sigRow, sigNames] }),
      ],
    }],
  });
  saveBlob(await Packer.toBlob(doc), `بطاقة-${c.nomProprietaire || 'عقار'}.docx`);
}

// ════════════════════════════════════════════════════════════════════════════
// 2. FICHE DE RECONNAISSANCE — Français, A4 paysage, 2 colonnes
// ════════════════════════════════════════════════════════════════════════════
export interface FicheData {
  numero: string; date: string; refEnvoi: string; immeubleDit: string; objetRequisition: string;
  bulletinOfficielNum: string; bulletinOfficielDate: string; demandeParNom: string;
  communeRurale: string; cercle: string; caidat: string; foret: string; canton: string;
  lambertX: string; lambertY: string; perimetre: string; lieudit: string;
  superficieDeclareHa: string; superficieDeclareAr: string; superficieDeclareCa: string;
  superficieBornee: string; borneNumero: string; distanceDescription: string; descriptionVegetation: string;
  reboisement: string; equipement: string; exploitation: string; pvDresses: string; actesPropriete: string;
  'empiètement': 'TOTAL' | 'PARTIEL' | 'NÉANT'; avis: 'FAVORABLE' | 'DÉFAVORABLE';
  conclusion: string; signataire: string; signataireDate: string;
}

export async function exportFicheDocx(c: FicheData) {
  const empColor = c['empiètement'] === 'TOTAL' ? RED : c['empiètement'] === 'PARTIEL' ? ORANGE : GREEN;
  const avisColor = c.avis === 'DÉFAVORABLE' ? RED : GREEN;
  const secTitle = (t: string) => fr(t, { bold: true, underline: true, size: 18 });

  const leftCol: Paragraph[] = [
    fr('ROYAUME DU MAROC — ANEF', { bold: true, align: AlignmentType.CENTER, color: GREEN, size: 18 }),
    fr(`N° ${c.numero || '___'}   |   Le, ${c.date || ''}        Réf : Envoi CPF n° ${c.refEnvoi || '___'}`, { size: 16 }),
    fr('RÉQUISITION DE LA DÉLIMITATION OU D\'IMMATRICULATION — FICHE DE RECONNAISSANCE', { bold: true, align: AlignmentType.CENTER, underline: true, size: 18 }),
    fr(`L'immeuble foncier dit : ${c.immeubleDit || ''}`, { bold: true }),
    fr(`Objet de la réquisition N° : ${c.objetRequisition || ''}`),
    fr(`Bulletin officiel N° ${c.bulletinOfficielNum || ''} du ${c.bulletinOfficielDate || ''}`),
    fr(`A la demande de : ${c.demandeParNom || ''}`),
    secTitle('2°) SITUATION ADMINISTRATIVE ET FORESTIÈRE :'),
    fr(`- Commune Rurale : ${c.communeRurale || ''}   Cercle : ${c.cercle || ''}   Caïdat : ${c.caidat || ''}`),
    fr(`- Forêt : ${c.foret || ''}, Canton : ${c.canton || ''}`),
    fr(`- Périmètre : ${c.perimetre || ''} m   Lieudit : ${c.lieudit || ''}`),
    fr(`- Coord. Lambert  X : ${c.lambertX || ''}   Y : ${c.lambertY || ''}`),
    fr(`- Superficie déclarée : ${c.superficieDeclareHa || '00'} HA ${c.superficieDeclareAr || '00'} A ${c.superficieDeclareCa || '00'} CA   Bornée : ${c.superficieBornee || ''}`),
    fr(`- N° borne la plus proche : ${c.borneNumero || ''}`),
    secTitle('3°) DESCRIPTION DE L\'IMMEUBLE :'),
    fr(`- Distance / forêt : ${c.distanceDescription || ''}`, { color: empColor }),
    fr(`- ${c.descriptionVegetation || 'matorral et chêne liège'}`),
    secTitle('4°) INTERVENTIONS FORESTIÈRES :'),
    fr(`Reboisement : ${c.reboisement || '—'}   Équipement : ${c.equipement || '—'}   Exploitation : ${c.exploitation || '—'}   P.V. : ${c.pvDresses || '—'}`),
    secTitle('5°) ACTES DE PROPRIÉTÉ :'),
    fr(c.actesPropriete || 'Présenté par le requérant'),
    secTitle('6°) EMPIÈTEMENT :'),
    fr(`EMPIÈTEMENT ${c['empiètement']}`, { bold: true, color: empColor, size: 22 }),
    secTitle('7°) CONCLUSION :'),
    fr(c.conclusion || ''),
    fr(`En date du : ${c.signataireDate || ''}`, { align: AlignmentType.RIGHT }),
  ];

  const rightCol: Paragraph[] = [
    fr('Croquis de situation :', { bold: true, align: AlignmentType.CENTER, underline: true }),
    fr('[ Insérer le croquis / plan ici ]', { align: AlignmentType.CENTER, color: '999999' }),
    fr('', {}),
    fr(`N°  /CPF/M'diq-Fnideq      M'diq, Le ${c.signataireDate || ''}`, { size: 15 }),
    fr('Copie conforme transmise à Mr le Directeur Provincial de l\'ANEF de TETOUAN', { align: AlignmentType.CENTER, size: 15 }),
    fr(`« Avis ${c.avis} »`, { bold: true, color: avisColor }),
    fr(`Le Chef de CPF de M'diq - Fnideq : ${c.signataire || ''}`, { align: AlignmentType.RIGHT, size: 15 }),
  ];

  const twoCols = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.SINGLE, size: 6, color: '555555' } },
    rows: [new TableRow({ children: [
      cell(leftCol, { width: 56, vAlign: VerticalAlign.TOP }),
      cell(rightCol, { width: 44, vAlign: VerticalAlign.TOP }),
    ] })],
  });

  const doc = new Document({
    sections: [{
      properties: { page: { size: { width: A4.height, height: A4.width, orientation: PageOrientation.LANDSCAPE }, margin: { top: 567, right: 680, bottom: 567, left: 680 } } },
      children: [twoCols],
    }],
  });
  saveBlob(await Packer.toBlob(doc), `fiche-${c.immeubleDit || 'requisition'}.docx`);
}

// ════════════════════════════════════════════════════════════════════════════
// 3. RAPPORT DE CHEVAUCHEMENT — Arabe RTL
// ════════════════════════════════════════════════════════════════════════════
export async function exportChevauchementDocx(res: any) {
  const isInside = res.globalPosition === 'داخل الملك الغابوي';
  const isPartial = res.globalPosition === 'جزئيا داخل الملك الغابوي';
  const posColor = isInside ? RED : isPartial ? ORANGE : GREEN;

  const infoRow = (label: string, value: string, color?: string) => new TableRow({ children: [
    cell([ar(label, { bold: true, size: 18 })], { width: 45, shade: 'FAFAFA' }),
    cell([ar(value, { size: 18, color })]),
  ] });

  const hitsHeader = new TableRow({ tableHeader: true, children: [
    cell([ar('الغابة', { bold: true, align: AlignmentType.CENTER })], { shade: 'E8F5E9' }),
    cell([ar('Canton', { bold: true, align: AlignmentType.CENTER })], { shade: 'E8F5E9' }),
    cell([ar('مساحة التقاطع', { bold: true, align: AlignmentType.CENTER })], { shade: 'E8F5E9' }),
    cell([ar('النسبة', { bold: true, align: AlignmentType.CENTER })], { shade: 'E8F5E9' }),
  ] });
  const hitsRows = (res.hits || []).map((h: any) => {
    const hc = h.percentage >= 95 ? RED : h.percentage >= 1 ? ORANGE : GREEN;
    return new TableRow({ children: [
      cell([ar(`${h.foretAr || ''} ${h.foret ? '(' + h.foret + ')' : ''}`.trim(), { align: AlignmentType.CENTER, size: 16 })]),
      cell([ar(h.canton || '—', { align: AlignmentType.CENTER, size: 16 })]),
      cell([ar(`${(h.intersectionArea / 10000).toFixed(4)} ha`, { align: AlignmentType.CENTER, size: 16 })]),
      cell([ar(`${h.percentage.toFixed(1)}%`, { align: AlignmentType.CENTER, bold: true, color: hc, size: 16 })]),
    ] });
  });

  const children: any[] = [
    ar('الوكالة الوطنية للمياه والغابات — ANEF', { bold: true, align: AlignmentType.CENTER, color: GREEN, size: 18 }),
    ar('تقرير تحليل التداخل مع الملك الغابوي', { bold: true, align: AlignmentType.CENTER, size: 28 }),
    ar(res.globalPosition, { bold: true, align: AlignmentType.CENTER, size: 24, color: posColor }),
    new Paragraph({ text: '', spacing: { after: 100 } }),
    new Table({ visuallyRightToLeft: true, width: { size: 100, type: WidthType.PERCENTAGE }, borders: thinBorders, rows: [
      infoRow('اسم الطبقة', String(res.layerName || '')),
      infoRow('المساحة الإجمالية', `${(res.importedArea / 10000).toFixed(4)} ha`),
      infoRow('مساحة التداخل (داخل الملك)', `${((res.insideArea ?? res.totalIntersectionArea) / 10000).toFixed(4)} ha`),
      infoRow('المساحة خارج الملك', `${((res.outsideArea ?? Math.max(0, res.importedArea - (res.insideArea ?? res.totalIntersectionArea))) / 10000).toFixed(4)} ha`),
      infoRow('نسبة التداخل', `${res.totalPercentage.toFixed(1)}%`, posColor),
    ] }),
  ];
  if ((res.hits || []).length) {
    children.push(new Paragraph({ text: '', spacing: { after: 100 } }));
    children.push(ar('تفاصيل التقاطع :', { bold: true }));
    children.push(new Table({ visuallyRightToLeft: true, width: { size: 100, type: WidthType.PERCENTAGE }, borders: thinBorders, rows: [hitsHeader, ...hitsRows] }));
  }

  const doc = new Document({
    sections: [{ properties: { page: { size: { width: A4.width, height: A4.height, orientation: PageOrientation.PORTRAIT }, margin: { top: 850, right: 1100, bottom: 850, left: 1100 } } }, children }],
  });
  saveBlob(await Packer.toBlob(doc), `تقرير-التداخل-${res.layerName || ''}.docx`);
}

// ════════════════════════════════════════════════════════════════════════════
// 4. GÉNÉRIQUE — convertit n'importe quel HTML existant en VRAI .docx
//    (utilisé pour l'Expertise, document légal complexe déjà en HTML).
// ════════════════════════════════════════════════════════════════════════════
export async function htmlToDocx(html: string, filename: string) {
  const landscape = /size:\s*A4\s+landscape/i.test(html);
  const out = await asBlob(html, { orientation: landscape ? 'landscape' : 'portrait', margins: { top: 720, right: 720, bottom: 720, left: 720 } });
  const blob = out instanceof Blob ? out : new Blob([out as any], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  saveBlob(blob, filename.replace(/\.docx?$/i, '') + '.docx');
}
