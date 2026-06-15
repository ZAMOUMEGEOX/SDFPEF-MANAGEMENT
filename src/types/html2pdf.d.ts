// تعريف أنواع مبسّط لمكتبة html2pdf.js (لا تتوفر لها تعريفات رسمية على npm).
// ضع هذا الملف داخل مجلد المشروع (مثلاً: src/types/html2pdf.d.ts) ليتعرف
// عليه TypeScript تلقائياً (المجلد src مُدرج عادة في tsconfig.json).
//
// الاستخدام في الكود (انظر Contentieux.tsx → htmlToPDF):
//   const mod: any = await import('html2pdf.js');
//   const html2pdf = mod.default || mod;
//   await html2pdf().set({ ... }).from(element).save();

declare module 'html2pdf.js' {
  interface Html2PdfImageOptions {
    type?: 'jpeg' | 'png' | 'webp';
    quality?: number;
  }

  interface Html2PdfHtml2CanvasOptions {
    scale?: number;
    useCORS?: boolean;
    backgroundColor?: string;
    [key: string]: any;
  }

  interface Html2PdfJsPdfOptions {
    unit?: 'pt' | 'mm' | 'cm' | 'in';
    format?: string | number[];
    orientation?: 'portrait' | 'landscape';
    [key: string]: any;
  }

  interface Html2PdfPageBreakOptions {
    mode?: Array<'avoid-all' | 'css' | 'legacy'>;
    before?: string | string[];
    after?: string | string[];
    avoid?: string | string[];
  }

  interface Html2PdfOptions {
    margin?: number | [number, number] | [number, number, number, number];
    filename?: string;
    image?: Html2PdfImageOptions;
    html2canvas?: Html2PdfHtml2CanvasOptions;
    jsPDF?: Html2PdfJsPdfOptions;
    pagebreak?: Html2PdfPageBreakOptions;
    [key: string]: any;
  }

  interface Html2PdfWorker {
    set(options: Html2PdfOptions): Html2PdfWorker;
    from(element: HTMLElement | string): Html2PdfWorker;
    save(filename?: string): Promise<void>;
    output(type?: string, options?: any): Promise<any>;
    toPdf(): Html2PdfWorker;
    then(onFulfilled: (value: any) => any, onRejected?: (reason: any) => any): Html2PdfWorker;
    catch(onRejected: (reason: any) => any): Html2PdfWorker;
  }

  type Html2Pdf = (element?: HTMLElement, options?: Html2PdfOptions) => Html2PdfWorker;

  const html2pdf: Html2Pdf;
  export default html2pdf;
}
