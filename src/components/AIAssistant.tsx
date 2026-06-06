import React, { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Sparkles, AlertCircle, ChevronRight } from 'lucide-react';
import { ViewState } from '../types';

interface AIAssistantProps {
  setCurrentView?: (view: ViewState) => void;
}

interface Message {
  id: string;
  type: 'user' | 'agent';
  text: string;
  action?: {
    label: string;
    view?: ViewState;
  };
}

export function AIAssistant({ setCurrentView }: AIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'agent',
      text: 'Bonjour ! Je suis AtlasAI, votre assistant intelligent ANEF. Je peux répondre à vos questions, analyser des données ou naviguer dans le système à votre place. Comment puis-je vous aider ?',
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, isOpen]);

  const handleAction = (view: ViewState, text: string) => {
    if (setCurrentView) {
      setMessages(prev => [...prev, { id: Date.now().toString(), type: 'user', text }]);
      setIsTyping(true);
      
      setTimeout(() => {
        setCurrentView(view);
        setMessages(prev => [...prev, { 
          id: Date.now().toString(), 
          type: 'agent', 
          text: `Je vous ai redirigé vers l'espace ${text}. Que souhaitez-vous faire ensuite ?` 
        }]);
        setIsTyping(false);
      }, 1000);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userText = inputValue;
    setInputValue('');
    setMessages(prev => [...prev, { id: Date.now().toString(), type: 'user', text: userText }]);
    setIsTyping(true);

    // Simulate AI response based on keywords and intents
    setTimeout(() => {
      const lowerTxt = userText.toLowerCase();
      // Normalize text for better matching (remove accents, to lower)
      const normalizedTxt = userText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      
      let reply = "Je suis désolé, je n'ai pas bien compris votre demande. Pouvez-vous reformuler ? / عذراً، لم أفهم طلبك جيداً. هل يمكنك إعادة الصياغة؟";
      let actionView: ViewState | undefined;
      let actionLabel = "";
      
      // Intent rules
      const isArabic = /[\u0600-\u06FF]/.test(lowerTxt);

      // 1. Regex for file numbers or years (e.g. 221/1101/2024, 221-110, 1234)
      const fileMatch = userText.match(/(?:(?:dossier|file|ملف|رقم)?\s*)([0-9/A-Z-]{3,15})/i) || userText.match(/([0-9/A-Z-]{4,15})/i);
      const extractedNumber = fileMatch ? fileMatch[1].replace(/^[/-]+|[/-]+$/g, '') : null;

      if (extractedNumber && /\d/.test(extractedNumber)) {
        reply = isArabic 
          ? `لقد وجدت معلومات حول الملف رقم "${extractedNumber}". إنها قضية (قطع أشجار غير مرخص / ترامي) في منطقة شفشاون. الحالة الحالية: قيد المعالجة. هل تريد الذهاب لقسم المنازعات لرؤية التفاصيل الكاملة؟`
          : `J'ai trouvé des informations pour le dossier n° "${extractedNumber}". Il s'agit d'une affaire (Coupe illicite / Occupation) dans la zone de Chefchaouen. Statut : En cours. Voulez-vous ouvrir la section contentieux pour tous les détails ?`;
        actionView = 'contentieux';
        actionLabel = isArabic ? "التفاصيل في المنازعات" : "Détails Contentieux";

      } else if (normalizedTxt.match(/content|prob|^inf|delit|juge|tribun|مخالف|محكم|نزاع|جنح|ملف|شكاي|قضي/)) {
        if (normalizedTxt.match(/combien|nombre|stat|كم |عدد|احصاء/)) {
           reply = isArabic 
            ? "يوجد حالياً أكثر من 142 ملف نزاع نشط، منها مسألة مؤخرا في شفشاون. هل تريد الذهاب لقسم المنازعات لرؤية التفاصيل؟"
            : "Il y a actuellement plus de 142 dossiers de contentieux actifs. Voulez-vous aller à la section des contentieux pour voir les détails ?";
        } else {
           reply = isArabic 
            ? "اليك قسم المنازعات حيث يمكنك إدارة المخالفات والملفات القانونية."
            : "Voici la section des contentieux où vous pouvez gérer les infractions et dossiers.";
        }
        actionView = 'contentieux';
        actionLabel = isArabic ? "الذهاب للمنازعات" : "Aller aux Contentieux";
        
      } else if (normalizedTxt.match(/cart|domain|^map|fore|sig|gis|geoportail|مجال|خريط|غاب|تحديد|اراض/)) {
         reply = isArabic 
            ? "المجال الغابوي شاسع. هل ترغب في فتح الخريطة التفاعلية ونظام المعلومات الجغرافية لاستكشافه؟"
            : "Le domaine forestier est vaste. Voulez-vous ouvrir la carte interactive (SIG) pour l'explorer ?";
        actionView = 'domaine';
        actionLabel = isArabic ? "فتح الخريطة" : "Ouvrir la Carte";

      } else if (normalizedTxt.match(/polic|patrou|agent|secur|شرط|دوري|امن|حراس/)) {
        reply = isArabic 
            ? "قسم شرطة الغابات يتيح لك تتبع الدوريات والتدخلات الميدانية. هل ننتقل إليه؟"
            : "La section de la police forestière vous permet de suivre les patrouilles sur le terrain. On y va ?";
        actionView = 'police';
        actionLabel = isArabic ? "شرطة الغابات" : "Police Forestière";

      } else if (normalizedTxt.match(/bio|faun|flor|anim|plant|sing|بيئ|تنوع|حيوان|نبات|قرد|وحش/)) {
         reply = isArabic 
            ? "سجلنا مشاهدات لأنواع نادرة في منتزه تلاسمطان مؤخرا. هل تريد الاطلاع على التنوع البيولوجي؟"
            : "Nous avons enregistré des observations d'espèces rares à Talassemtane. Voulez-vous consulter la biodiversité ?";
        actionView = 'biodiversite';
        actionLabel = isArabic ? "التنوع البيولوجي" : "Biodiversité";

      } else if (normalizedTxt.match(/tele|sat|dron|feu|incen|استشعار|قمر|درون|حريق|نار|صور/)) {
        reply = isArabic 
            ? "أقوم بتحليل صور الأقمار الصناعية باستمرار للكشف عن الحرائق والتغيرات. تفضل لقسم الاستشعار عن بعد."
            : "J'analyse les images satellites pour détecter les incendies et changements. Voici la télédétection.";
        actionView = 'teledetection';
        actionLabel = isArabic ? "الاستشعار عن بعد" : "Télédétection";

      } else if (normalizedTxt.match(/dash|acc|home|رئيس|لوح/)) {
        reply = isArabic 
            ? "حسناً، سأنقلك إلى لوحة القيادة الرئيسية حيث يمكنك رؤية نظرة عامة."
            : "D'accord, je vous emmène au tableau de bord principal pour la vue d'ensemble.";
        actionView = 'dashboard';
        actionLabel = isArabic ? "لوحة القيادة" : "Tableau de Bord";
        
      } else if (normalizedTxt.match(/bonjour|salut|hello|مرحبا|سلام|صباح|مساء/)) {
        reply = isArabic 
            ? "مرحباً! أنا AtlasIA، مساعدك الذكي في الوكالة الوطنية للمياه والغابات. كيف يمكنني مساعدتك؟ يمكنك إعطائي رقم ملف أو سؤالي عن قسم معين."
            : "Bonjour ! Je suis AtlasIA, votre assistant intelligent ANEF. Comment puis-je vous aider ? Vous pouvez me donner un numéro de dossier ou demander une section.";
      } else if (normalizedTxt.match(/merci|شكرا|يعط/)) {
         reply = isArabic ? "على الرحب والسعة! أنا هنا في أي وقت للمساعدة." : "Je vous en prie ! Je suis là à tout moment pour vous aider.";
      }

      const newMessage: Message = {
        id: Date.now().toString(),
        type: 'agent',
        text: reply,
        action: actionView ? { label: actionLabel, view: actionView } : undefined
      };

      setMessages(prev => [...prev, newMessage]);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-50 p-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-[0_8px_30px_rgb(5,150,105,0.4)] transition-transform hover:scale-110 active:scale-95 group ${isOpen ? 'scale-0 opacity-0 pointer-events-none' : 'scale-100 opacity-100'}`}
        aria-label="Ouvrir l'assistant IA"
      >
        <div className="absolute inset-0 rounded-full animate-ping opacity-20 bg-emerald-400"></div>
        <Bot className="size-6 relative z-10 group-hover:rotate-12 transition-transform duration-300" />
      </button>

      {/* Chat Panel */}
      <div 
        className={`fixed bottom-6 right-6 z-50 w-full max-w-[380px] sm:w-[380px] h-[600px] max-h-[calc(100vh-120px)] bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 origin-bottom-right ${isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none'}`}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-800 p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="size-10 bg-white/20 rounded-xl flex items-center justify-center shadow-inner backdrop-blur-sm">
              <Bot className="size-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-white leading-tight flex items-center gap-2">
                AtlasIA <Sparkles className="size-3 text-emerald-300" />
              </h3>
              <p className="text-xs text-white/70 font-medium">Assistant Automatisé ANEF</p>
            </div>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black/5">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex flex-col ${msg.type === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 fade-in duration-300`}
            >
              <div 
                className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-sm ${
                  msg.type === 'user' 
                    ? 'bg-emerald-600 text-white rounded-tr-sm' 
                    : 'bg-white border border-[var(--border-color)] text-[var(--text-main)] rounded-tl-sm dark:bg-[#11261f]'
                }`}
              >
                {msg.text}
              </div>
              
              {/* Agent Suggestion Actions */}
              {msg.type === 'agent' && msg.action && msg.action.view && (
                <button 
                  onClick={() => handleAction(msg.action!.view!, msg.action!.label)}
                  className="mt-2 ml-2 flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 px-3 py-1.5 rounded-full border border-emerald-200 dark:border-emerald-500/30 transition-colors animate-in fade-in delay-150 fill-mode-both"
                >
                  {msg.action.label} <ChevronRight className="size-3" />
                </button>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex items-start">
              <div className="bg-white border border-[var(--border-color)] dark:bg-[#11261f] rounded-2xl rounded-tl-sm p-4 shadow-sm flex gap-1">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-[var(--bg-surface)] border-t border-[var(--border-color)] shrink-0">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input 
              type="text" 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Posez votre question ou demandez une tâche..."
              className="flex-1 bg-black/5 dark:bg-black/20 border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all font-medium placeholder:text-[var(--text-muted)] text-[var(--text-main)]"
            />
            <button 
              type="submit"
              disabled={!inputValue.trim() || isTyping}
              className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="size-5" />
            </button>
          </form>
          <div className="mt-2 text-center flex items-center justify-center gap-1 text-[10px] text-[var(--text-muted)] font-medium">
            <AlertCircle className="size-3" /> AtlasIA peut se tromper. Vérifiez les informations importantes.
          </div>
        </div>
      </div>
    </>
  );
}
