import React from 'react';
import { X, Bell, ShieldAlert, Scale, CheckCircle2, AlertTriangle, AlertCircle, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';

export function NotificationPanel({ isOpen, onClose, onNavigate }: { isOpen: boolean, onClose: () => void, onNavigate: (route: string) => void }) {
  
  const notifications = [
    {
      id: 1,
      type: 'alert',
      title: 'تنبيه: حريق محتمل',
      message: 'تم رصد نقطة حرارة عالية في قطاع غابة المعمورة (المنطقة 4) عبر الأقمار الصناعية.',
      time: 'منذ 5 دقائق',
      icon: AlertTriangle,
      color: 'text-orange-500',
      bg: 'bg-orange-50 dark:bg-orange-500/10',
      route: 'teledetection',
      unread: true
    },
    {
      id: 2,
      type: 'police',
      title: 'مخالفة جديدة',
      message: 'تحرير محضر رقم PF-2024-001: قطع أشجار غير مرخص في إقليم إفران.',
      time: 'منذ ساعة',
      icon: ShieldAlert,
      color: 'text-red-500',
      bg: 'bg-red-50 dark:bg-red-500/10',
      route: 'police',
      itemId: 'PF-2024-001', // Using this to trigger search
      itemType: 'police',
      unread: true
    },
    {
      id: 3,
      type: 'contentieux',
      title: 'تحديث قضية',
      message: 'تم النطق بالحكم في الملف CTX-2024-001 (الترامي على الملك الغابوي).',
      time: 'منذ ساعتين',
      icon: Scale,
      color: 'text-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-500/10',
      route: 'contentieux',
      itemId: 'CTX-2024-001',
      itemType: 'case',
      unread: false
    },
    {
      id: 4,
      type: 'success',
      title: 'تحديث النظام',
      message: 'اكتملت المزامنة مع بيانات "محاكم" بنجاح.',
      time: 'أمس',
      icon: CheckCircle2,
      color: 'text-emerald-500',
      bg: 'bg-emerald-50 dark:bg-emerald-500/10',
      route: 'dashboard',
      unread: false
    }
  ];

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose}></div>
      <div 
        className="fixed top-16 right-4 sm:right-6 w-[90vw] max-w-[340px] z-[100] max-h-[85vh] bg-[var(--bg-surface)] shadow-lg border border-[var(--border-color)] rounded-xl animate-in slide-in-from-top-2 fade-in duration-200 flex flex-col overflow-hidden"
        dir="rtl"
      >
        <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center justify-between shrink-0 bg-[var(--bg-surface)]">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-[var(--text-main)] text-sm tracking-wide">الإشعارات</h2>
            <span className="bg-[var(--brand)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">2 جديدة</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-main)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto w-full no-scrollbar">
          <div className="flex flex-col">
            {notifications.map((notif) => {
              const Icon = notif.icon;
              return (
                <button 
                  key={notif.id}
                  onClick={() => {
                     onNavigate(notif.route);
                     if (notif.itemId && notif.itemType) {
                       setTimeout(() => {
                         window.dispatchEvent(new CustomEvent('searchItemSelected', { detail: { id: notif.itemId, type: notif.itemType } }));
                       }, 100);
                     }
                     onClose();
                  }}
                  className={cn(
                     "w-full text-right p-4 transition-all flex gap-3 group relative border-b border-[var(--border-color)] last:border-0",
                     notif.unread ? "bg-[var(--bg-surface)] hover:bg-[var(--bg-main)]" : "bg-[var(--bg-main)] opacity-70 hover:opacity-100"
                  )}
                >
                  {notif.unread && <div className="absolute right-0 top-0 bottom-0 w-[3px] bg-[var(--brand)] rounded-l-full"></div>}
                  <div className={cn("mt-0.5 p-2 rounded-lg shrink-0 transition-colors shadow-sm border border-[var(--border-color)]", notif.color, notif.bg)}>
                     <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 pr-1">
                     <div className="flex justify-between items-center mb-1 gap-2">
                        <h4 className={cn("text-xs font-bold leading-tight", notif.unread ? "text-[var(--text-main)]" : "text-[var(--text-muted)]")}>
                          {notif.title}
                        </h4>
                        <span className="text-[10px] text-[var(--text-muted)] font-mono whitespace-nowrap shrink-0">
                          {notif.time}
                        </span>
                     </div>
                     <p className={cn("text-[11px] leading-relaxed mt-1 tracking-wide", notif.unread ? "text-[var(--text-main)] opacity-80" : "text-[var(--text-muted)] line-clamp-2")}>
                        {notif.message}
                     </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        
        <div className="p-2 border-t border-[var(--border-color)] shrink-0 bg-[var(--bg-surface)]">
           <button className="w-full py-2 bg-transparent hover:bg-[var(--bg-main)] rounded-lg text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
             تحديد الكل كمقروء
           </button>
        </div>
      </div>
    </>
  );
}

