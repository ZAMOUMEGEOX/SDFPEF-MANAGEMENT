import React, { useState, useEffect } from 'react';
import { X, Check, Eye, EyeOff, AlertCircle } from 'lucide-react';
import emailjs from '@emailjs/browser';

interface RegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RegistrationModal({ isOpen, onClose }: RegistrationModalProps) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    prenom: '',
    nom: '',
    email: '',
    grade: '',
    service: '',
    motif: '',
    password: '',
    confirmPassword: ''
  });

  // ✅ تهيئة EmailJS مرة واحدة عند تحميل الكومبوننت
  useEffect(() => {
    emailjs.init(import.meta.env.VITE_EMAILJS_PUBLIC_KEY);
  }, []);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleNext = () => {
    if (step === 2 && formData.password !== formData.confirmPassword) {
      return;
    }
    setStep(s => Math.min(s + 1, 3));
  };
  const handlePrev = () => setStep(s => Math.max(s - 1, 1));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError('');

    try {
      // 1️⃣ إرسال الطلب للـ API
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prenom: formData.prenom,
          nom: formData.nom,
          email: formData.email,
          grade: formData.grade,
          service: formData.service,
          motif: formData.motif,
          password: formData.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error || "Erreur lors de l'envoi");
        return;
      }

      // 2️⃣ إرسال إشعار EmailJS — منفصل لا يوقف التسجيل إذا فشل
      emailjs.send(
        import.meta.env.VITE_EMAILJS_SERVICE_ID,
        import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
        {
          from_name:  `${formData.prenom} ${formData.nom}`,
          from_email: formData.email,
          grade:      formData.grade,
          service:    formData.service,
          motif:      formData.motif || 'Non spécifié',
        }
        // ✅ بدون public key هنا — تم تعيينه في emailjs.init()
      ).then(() => {
        console.log('✅ Email envoyé avec succès');
      }).catch((err) => {
        console.error('❌ EmailJS error (non-blocking):', err);
        // لا يوقف التسجيل — المستخدم يرى خطوة النجاح بكل الأحوال
      });

      // 3️⃣ الانتقال لخطوة النجاح
      setStep(4);

    } catch (err) {
      console.error('Registration error:', err);
      setSubmitError("Erreur de connexion. Réessayez.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#05110a] border border-[#1a3a2a] rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-[#1a3a2a] flex items-start justify-between">
          <div>
            <div className="text-[10px] text-emerald-500 font-bold tracking-[0.2em] uppercase mb-2">
              Demande d'accès • AtlasForest
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Créer un compte agent</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-8 py-6 bg-[#030906] flex items-center justify-between relative">
          <div className="absolute left-10 right-10 top-1/2 h-[2px] bg-[#1a3a2a] -z-0 -translate-y-1/2"></div>
          
          <div className="relative z-10 flex flex-col items-center gap-2">
            <div className={`size-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= 1 ? 'bg-emerald-500 text-white' : 'bg-[#1a3a2a] text-white/50'}`}>
              {step > 1 ? <Check className="size-4" /> : '1'}
            </div>
            <span className={`text-[10px] tracking-widest uppercase font-bold ${step >= 1 ? 'text-emerald-500' : 'text-white/30'}`}>Identité</span>
          </div>

          <div className="relative z-10 flex flex-col items-center gap-2">
            <div className={`size-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= 2 ? 'bg-emerald-500 text-white' : 'bg-[#1a3a2a] text-white/50'}`}>
              {step > 2 ? <Check className="size-4" /> : '2'}
            </div>
            <span className={`text-[10px] tracking-widest uppercase font-bold ${step >= 2 ? 'text-emerald-500' : 'text-white/30'}`}>Accès</span>
          </div>

          <div className="relative z-10 flex flex-col items-center gap-2">
            <div className={`size-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= 3 ? 'bg-emerald-500 text-white' : 'bg-[#1a3a2a] text-white/50'}`}>
              {step > 3 ? <Check className="size-4" /> : '3'}
            </div>
            <span className={`text-[10px] tracking-widest uppercase font-bold ${step >= 3 ? 'text-emerald-500' : 'text-white/30'}`}>Confirmation</span>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-8 overflow-y-auto">
          {step === 1 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Prénom *</label>
                  <input type="text" name="prenom" value={formData.prenom} onChange={handleChange} placeholder="Votre prénom" className="w-full bg-[#0a1f14] border border-[#1a3a2a] text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 font-medium placeholder:text-white/20 transition-colors" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Nom *</label>
                  <input type="text" name="nom" value={formData.nom} onChange={handleChange} placeholder="Votre nom" className="w-full bg-[#0a1f14] border border-[#1a3a2a] text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 font-medium placeholder:text-white/20 transition-colors" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Email Professionnel *</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="prenom.nom@anef.gov.ma" className="w-full bg-[#0a1f14] border border-[#1a3a2a] text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 font-medium placeholder:text-white/20 transition-colors" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Grade / Poste *</label>
                  <input type="text" name="grade" value={formData.grade} onChange={handleChange} placeholder="Ingénieur Forestier" className="w-full bg-[#0a1f14] border border-[#1a3a2a] text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 font-medium placeholder:text-white/20 transition-colors" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Service / مصلحة</label>
                  <input type="text" name="service" value={formData.service} onChange={handleChange} placeholder="ANEF Tétouan" className="w-full bg-[#0a1f14] border border-[#1a3a2a] text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 font-medium placeholder:text-white/20 transition-colors" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Motif de la demande</label>
                <textarea name="motif" value={formData.motif} onChange={handleChange} placeholder="Décrivez brièvement votre rôle..." rows={3} className="w-full bg-[#0a1f14] border border-[#1a3a2a] text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 font-medium placeholder:text-white/20 transition-colors resize-none"></textarea>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
              <div className="bg-[#0a1f14] border border-[#1a3a2a] p-5 rounded-xl">
                <p className="text-sm text-white/80 leading-relaxed">
                  Choisissez un mot de passe sécurisé. Il ne sera jamais visible par l'administrateur.
                </p>
              </div>

              <div className="space-y-4 pt-2">
                <div className="space-y-2 relative">
                  <label className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Mot de passe * (8 caractères min.)</label>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} name="password" value={formData.password} onChange={handleChange} placeholder="••••••••" className="w-full bg-[#0a1f14] border border-[#1a3a2a] text-white rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:border-emerald-500 font-medium placeholder:text-white/20 transition-colors tracking-widest" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/40 hover:text-white">
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2 relative">
                  <label className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Confirmer le mot de passe *</label>
                  <div className="relative">
                    <input type={showConfirmPassword ? "text" : "password"} name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} placeholder="••••••••" className={`w-full bg-[#0a1f14] border text-white rounded-xl pl-4 pr-12 py-3 focus:outline-none font-medium placeholder:text-white/20 transition-colors tracking-widest ${formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword ? 'border-red-500 focus:border-red-500' : 'border-[#1a3a2a] focus:border-emerald-500'}`} />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/40 hover:text-white">
                      {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword && (
                    <div className="flex items-center gap-1.5 text-red-500 text-xs font-medium mt-1">
                      <AlertCircle className="size-3" />
                      Les mots de passe ne correspondent pas
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
              <div className="text-[10px] text-white/50 uppercase tracking-widest font-bold mb-4">Récapitulatif de votre demande</div>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-[#1a3a2a]">
                  <span className="text-xs text-white/50 uppercase tracking-wider font-bold">Nom Complet</span>
                  <span className="text-sm font-medium text-white">{formData.prenom || '-'} {formData.nom || '-'}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-[#1a3a2a]">
                  <span className="text-xs text-white/50 uppercase tracking-wider font-bold">Email</span>
                  <span className="text-sm font-medium text-white">{formData.email || '-'}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-[#1a3a2a]">
                  <span className="text-xs text-white/50 uppercase tracking-wider font-bold">Grade</span>
                  <span className="text-sm font-medium text-white">{formData.grade || '-'}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-[#1a3a2a]">
                  <span className="text-xs text-white/50 uppercase tracking-wider font-bold">Service</span>
                  <span className="text-sm font-medium text-white">{formData.service || '-'}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-[#1a3a2a]">
                  <span className="text-xs text-white/50 uppercase tracking-wider font-bold">Mot de passe</span>
                  <span className="text-sm font-medium tracking-widest text-white">{formData.password ? '••••••••' : '-'}</span>
                </div>
              </div>

              <div className="bg-[#0a1f14] border border-[#1a3a2a]/50 p-4 rounded-xl mt-6">
                <p className="text-xs text-white/60 leading-relaxed text-center">
                  En soumettant, vous acceptez que vos données soient traitées par l'administrateur {formData.service || 'ANEF'} pour la gestion des accès à AtlasForest.
                </p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col items-center justify-center py-8 gap-4 text-center animate-in fade-in duration-300">
              <div className="size-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center">
                <Check className="size-8 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold text-white">Demande envoyée !</h3>
              <p className="text-white/50 text-sm max-w-xs leading-relaxed">
                Votre demande a bien été enregistrée. L'administrateur sera notifié et vous contactera sous 48h.
              </p>
              <button
                onClick={() => {
                  onClose();
                  setStep(1);
                  setFormData({
                    prenom: '', nom: '', email: '', grade: '',
                    service: '', motif: '', password: '', confirmPassword: ''
                  });
                }}
                className="mt-4 bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-xl font-bold text-sm transition-all"
              >
                Fermer
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-[#1a3a2a] flex flex-col gap-3 bg-[#05110a]">
          {submitError && step === 3 && (
            <p className="text-xs text-red-400 text-center w-full">{submitError}</p>
          )}
          <div className="flex justify-between items-center">
            {step > 1 && step < 4 ? (
               <button onClick={handlePrev} className="px-6 py-3 rounded-xl border border-[#1a3a2a] text-white/70 hover:text-white hover:bg-white/5 transition-colors font-medium text-sm flex items-center gap-2">
                 ← Retour
               </button>
            ) : step === 4 ? (
              <div />
            ) : (
               <button onClick={onClose} className="px-6 py-3 rounded-xl border border-[#1a3a2a] text-white/70 hover:text-white hover:bg-white/5 transition-colors font-medium text-sm">
                 Annuler
               </button>
            )}

            {step < 3 ? (
              <button 
                onClick={handleNext} 
                disabled={
                  (step === 1 && (!formData.prenom || !formData.nom || !formData.email || !formData.grade)) ||
                  (step === 2 && (!formData.password || formData.password !== formData.confirmPassword))
                }
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900 disabled:text-white/30 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold text-sm tracking-wide transition-all shadow-[0_0_15px_rgba(5,150,105,0.3)] disabled:shadow-none flex items-center gap-2"
              >
                SUIVANT →
              </button>
            ) : step === 3 ? (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold text-sm tracking-wide transition-all shadow-[0_0_20px_rgba(5,150,105,0.4)] flex items-center gap-2"
              >
                {isSubmitting
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : "ENVOYER LA DEMANDE ✓"
                }
              </button>
            ) : null}
          </div>
        </div>

      </div>
    </div>
  );
}