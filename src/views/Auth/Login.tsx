import React, { useState } from 'react';
import { Mail, Lock, ArrowRight, TreePine, Map, Compass, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { RegistrationModal } from './components/RegistrationModal';

interface LoginProps {
  onLogin: (user: any) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isRegistrationModalOpen, setIsRegistrationModalOpen] = useState(false);

 const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState('');

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!email || !password) { setError("Veuillez remplir tous les champs"); return; }
  setIsLoading(true); setError('');
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ identifier: email, password }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Identifiant ou mot de passe incorrect"); return; }
    onLogin(data.user);
  } catch {
    setError("Erreur de connexion. Vérifiez votre réseau.");
  } finally {
    setIsLoading(false);
  }
};
  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden font-sans bg-black">
      {/* Majestic Forest Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-[30s] ease-out scale-100 hover:scale-[1.05]"
        style={{
          backgroundImage: 'url("https://images.unsplash.com/photo-1511497584788-876760111969?q=80&w=2532&auto=format&fit=crop")'
        }}
      />
      {/* Elegant Gradient Overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#061a10]/60 via-[#0a2616]/40 to-[#030e09]/90"></div>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"></div>

      <div className="relative z-10 w-full max-w-[1100px] flex flex-col lg:flex-row items-center gap-12 p-6 animate-in fade-in zoom-in-95 duration-1000">
        
        {/* Left Side Showcase (Majestic intro) */}
        <div className="flex-1 text-center lg:text-left text-white hidden lg:block">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 mb-8 shadow-xl">
            <Compass className="size-4 text-emerald-400" />
            <span className="text-xs font-bold tracking-widest uppercase text-white/90">Portail National Forestier</span>
          </div>
          <h1 className="text-5xl lg:text-7xl font-black mb-6 leading-[1.1] font-serif tracking-tight drop-shadow-2xl text-white">
            Préserver. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-green-200">
              Valoriser.
            </span><br />
            Transmettre.
          </h1>
          <p className="text-lg text-emerald-50/90 leading-relaxed max-w-lg font-medium drop-shadow-md mb-8">
            Explorez l'écosystème, gérez les ressources, et protégez l'ensemble des sites naturels forestiers à travers une plateforme unifiée et intelligente.
          </p>
          <button className="group flex items-center gap-3 bg-white/10 hover:bg-white/20 border border-white/30 backdrop-blur-sm px-7 py-4 rounded-2xl text-sm font-semibold transition-all">
             <Map className="size-5 text-emerald-400 group-hover:scale-110 transition-transform" />
             Explorer tous les sites naturels forestiers
             <ArrowRight className="size-4 opacity-70 group-hover:translate-x-1 transition-transform ml-2" />
          </button>
        </div>

        {/* Right Side Glassmorphism Login Card */}
        <div className="w-full max-w-[420px]">
          <div className="bg-white/5 backdrop-blur-3xl rounded-[2.5rem] shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] overflow-hidden border border-white/10 p-10 relative">
            
            {/* Soft decorative glow behind the form */}
            <div className="absolute -top-32 -right-32 w-64 h-64 bg-emerald-500/20 rounded-full blur-[80px] pointer-events-none"></div>

            <div className="mb-10 flex flex-col items-center relative z-10">
              <div className="h-28 w-full flex items-center justify-center mb-4">
                <img 
                  src="/logo.png" 
                  alt="ANEF Logo" 
                  className="h-full w-auto object-contain drop-shadow-2xl"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
                <div className="hidden size-20 bg-gradient-to-b from-white/10 to-transparent border border-white/20 rounded-3xl flex items-center justify-center shadow-inner backdrop-blur-md">
                  <TreePine className="size-10 text-white drop-shadow-lg" />
                </div>
              </div>
              <h2 className="text-3xl font-black text-white text-center tracking-tight drop-shadow-sm font-serif mt-2">
                 Connexion
              </h2>
              <p className="text-white/60 mt-3 text-center text-sm font-medium px-4">
                 Identifiez-vous pour accéder à l'espace de gestion
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
              <div className="space-y-2">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/40 group-focus-within:text-emerald-400 transition-colors">
                    <Mail className="size-5" />
                  </div>
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-black/20 hover:bg-black/30 focus:bg-black/40 border border-white/10 text-white rounded-2xl pl-12 pr-4 py-4 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none transition-all placeholder:text-white/30 font-medium"
                    placeholder="Adresse email"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/40 group-focus-within:text-emerald-400 transition-colors">
                    <Lock className="size-5" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-black/20 hover:bg-black/30 focus:bg-black/40 border border-white/10 text-white rounded-2xl pl-12 pr-12 py-4 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none transition-all placeholder:text-white/30 font-medium tracking-widest"
                    placeholder="••••••••"
                    required
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/40 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </button>
                </div>
                <div className="flex justify-end pt-1">
                  <a href="#" className="text-xs text-white/50 hover:text-emerald-400 transition-colors font-medium">Mot de passe oublié ?</a>
                </div>
              </div>

{error && (
  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
    <AlertCircle className="size-4 shrink-0" />
    {error}
  </div>
)}

              <div className="pt-6">
                <button
  type="submit"
  disabled={isLoading}
  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-2xl py-4 font-bold text-[15px] shadow-[0_0_20px_rgba(5,150,105,0.4)] flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98]"
>
  {isLoading ? (
    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
  ) : (
    <>
      ACCÉDER AU PORTAIL
      <ArrowRight className="size-5" />
    </>
  )}
</button>
              </div>

              <div className="text-center mt-6">
                <p className="text-sm font-medium text-white/50">
                  Pas encore de compte ?{' '}
                  <button
                    type="button"
                    onClick={() => setIsRegistrationModalOpen(true)}
                    className="text-emerald-400 hover:text-emerald-300 font-bold underline underline-offset-4 decoration-emerald-400/30 hover:decoration-emerald-400 transition-colors"
                  >
                    Créer un compte / S'inscrire
                  </button>
                </p>
              </div>
              
            </form>
          </div>
        </div>
      </div>

      <RegistrationModal 
        isOpen={isRegistrationModalOpen} 
        onClose={() => setIsRegistrationModalOpen(false)} 
      />
    </div>
  );
}
