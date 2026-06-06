import React, { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Sparkles, AlertCircle, ChevronRight } from 'lucide-react';
import { ViewState } from '../../types';

interface AIAssistantProps {
  currentView?: ViewState;
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

export function AIAssistant({ currentView, setCurrentView }: AIAssistantProps) {
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragInfo = useRef({ startX: 0, startY: 0, currentX: 0, currentY: 0, isDragging: false });
  const [isDragging, setIsDragging] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, isOpen]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragInfo.current = {
      startX: e.clientX,
      startY: e.clientY,
      currentX: position.x,
      currentY: position.y,
      isDragging: true
    };
    setIsDragging(false);
    setHasMoved(false);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragInfo.current.isDragging) return;
    const dx = e.clientX - dragInfo.current.startX;
    const dy = e.clientY - dragInfo.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      setIsDragging(true);
      setHasMoved(true);
    }
    if ((isDragging || hasMoved) && buttonRef.current) {
       setPosition({ 
         x: dragInfo.current.currentX + dx, 
         y: dragInfo.current.currentY + dy 
       });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragInfo.current.isDragging = false;
    setTimeout(() => {
       setIsDragging(false);
       setHasMoved(false);
    }, 50);
  };


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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userText = inputValue;
    setInputValue('');
    setMessages(prev => [...prev, { id: Date.now().toString(), type: 'user', text: userText }]);
    setIsTyping(true);

    // Call real AI backend API
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText })
      });
      
      const data = await response.json();
      
      const newMessage: Message = {
        id: Date.now().toString(),
        type: 'agent',
        text: data.reply || "Désolé, je n'ai pas compris.",
        action: data.actionView ? { label: data.actionLabel || 'Ouvrir', view: data.actionView } : undefined
      };

      setMessages(prev => [...prev, newMessage]);
    } catch (e) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        type: 'agent',
        text: "Désolé, impossible de contacter le serveur IA."
      }]);
    } finally {
      setIsTyping(false);
      scrollToBottom();
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        ref={buttonRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={(e) => {
          if (hasMoved) { e.preventDefault(); e.stopPropagation(); return; }
          setIsOpen(true);
        }}
        style={{ 
          transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
          touchAction: 'none'
        }}
        className={`fixed z-[9999] w-14 h-14 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-full shadow-[0_8px_32px_rgba(16,185,129,0.5)] border-2 border-emerald-400 backdrop-blur-md flex items-center justify-center gap-1 cursor-grab active:cursor-grabbing hover:scale-105 active:scale-95 group bottom-8 right-8 ${isOpen ? 'scale-0 opacity-0 pointer-events-none' : 'scale-100 opacity-100'}`}
        aria-label="Ouvrir l'assistant IA"
      >
        <div className="absolute inset-0 rounded-full animate-pulse opacity-40 bg-emerald-300 pointer-events-none"></div>
        <Bot className="size-5 relative z-10 group-hover:rotate-12 transition-transform duration-300 drop-shadow-md" />
        <span className="font-bold tracking-widest text-xs relative z-10 drop-shadow-md">IA</span>
      </button>

      {/* Chat Panel */}
      <div 
        className={`fixed md:bottom-6 bottom-0 z-[10000] w-full md:w-[380px] h-[85dvh] md:h-[600px] max-h-[85dvh] md:max-h-[calc(100vh-120px)] bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-t-3xl md:rounded-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.2)] md:shadow-2xl flex flex-col overflow-hidden transition-all duration-300 origin-bottom md:origin-bottom-right ${isOpen ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 md:scale-95 opacity-0 pointer-events-none translate-y-20 md:translate-y-0'} right-0 md:right-6`}
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
