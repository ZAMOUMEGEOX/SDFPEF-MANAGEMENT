import React from 'react';
import { Briefcase, CreditCard, ShoppingBag, ShieldAlert, Scale, Flame, MoreHorizontal, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useTheme } from '../../../contexts/ThemeContext';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const pieData = [
  { name: 'Résolu', value: 70, color: '#097561' },
  { name: 'En cours', value: 30, color: '#e5e7eb' },
];

export function DashboardFramedStyle() {
  const { transparency, theme } = useTheme();

  return (
    <div className="flex flex-col h-full overflow-hidden w-full bg-[#f4f7f6]">
      
      {/* Top Navigation internal to dashboard (matches the template) */}
      <div className="flex justify-between items-center bg-white p-6 md:px-10 border-b border-gray-100 shrink-0">
         <h1 className="text-xl text-gray-400 font-light hidden md:block">Tableau de bord <span className="font-bold text-[#097561] ml-2">Administration</span></h1>
         <div className="flex items-center gap-4 ml-auto">
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded-full bg-cover bg-center bg-[#097561]" style={{ backgroundImage: "url('https://i.pravatar.cc/150?img=11')" }}></div>
               <div className="text-sm">
                  <p className="text-gray-800 font-medium">Ahmed Z.</p>
                  <p className="text-gray-400 text-xs">Directeur</p>
               </div>
               <MoreHorizontal className="text-gray-400 w-5 h-5 ml-4 cursor-pointer" />
            </div>
         </div>
      </div>

      <div className="flex-1 p-6 md:p-10 no-scrollbar overflow-y-auto bg-white rounded-b-[40px]">
         
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col justify-between">
               <div className="flex justify-between items-start mb-4">
                  <p className="text-gray-400 text-sm font-medium">Alertes Actives</p>
                  <div className="p-2 bg-emerald-50 rounded-lg"><ShieldAlert className="w-5 h-5 text-emerald-600" /></div>
               </div>
               <h2 className="text-4xl font-bold text-gray-800 font-serif mb-2">4,243</h2>
               <p className="text-xs text-gray-400 flex items-center font-medium"><ArrowUpRight className="text-emerald-500 w-3 h-3 mr-1" /> <span className="text-emerald-500 mr-1">+5.62%</span> Depuis le mois dernier</p>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col justify-between">
               <div className="flex justify-between items-start mb-4">
                  <p className="text-gray-400 text-sm font-medium">Infractions</p>
                  <div className="p-2 bg-blue-50 rounded-lg"><Scale className="w-5 h-5 text-blue-600" /></div>
               </div>
               <h2 className="text-4xl font-bold text-gray-800 font-serif mb-2">1,343</h2>
               <p className="text-xs text-gray-400 flex items-center font-medium"><ArrowDownRight className="text-red-500 w-3 h-3 mr-1" /> <span className="text-red-500 mr-1">-2.14%</span> Depuis le mois dernier</p>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col justify-between">
               <div className="flex justify-between items-start mb-4">
                  <p className="text-gray-400 text-sm font-medium">Secteurs Sécurisés</p>
                  <div className="p-2 bg-emerald-50 rounded-lg"><Briefcase className="w-5 h-5 text-emerald-600" /></div>
               </div>
               <h2 className="text-4xl font-bold text-gray-800 font-serif mb-2">85,343</h2>
               <p className="text-xs text-gray-400 flex items-center font-medium"><ArrowUpRight className="text-emerald-500 w-3 h-3 mr-1" /> <span className="text-emerald-500 mr-1">+12.5%</span> Depuis le mois dernier</p>
            </div>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <div className="bg-white p-6 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.04)] border border-gray-100">
               <h3 className="text-gray-400 text-sm font-medium mb-6">Aperçu Récent</h3>
               <div className="space-y-4">
                  <div className="flex justify-between items-center bg-[#097561] text-white p-4 rounded-xl shadow-md">
                     <div>
                        <p className="font-bold text-sm">Zone Rif Central</p>
                        <p className="text-xs opacity-70">Sécurisé</p>
                     </div>
                     <span className="font-medium">+2343 ha</span>
                  </div>
                  <div className="flex justify-between items-center p-4">
                     <div>
                        <p className="font-bold text-gray-800 text-sm">Zone Moyen Atlas</p>
                        <p className="text-xs text-gray-400">En cours</p>
                     </div>
                     <span className="font-medium text-gray-500">+1245 ha</span>
                  </div>
                  <div className="flex justify-between items-center p-4">
                     <div>
                        <p className="font-bold text-gray-800 text-sm">Zone Gharb</p>
                        <p className="text-xs text-gray-400">Risque modéré</p>
                     </div>
                     <span className="font-medium text-gray-500">-245 ha</span>
                  </div>
               </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col">
               <div className="flex justify-between items-center mb-6">
                  <h3 className="text-gray-400 text-sm font-medium">Taux de Résolution</h3>
                  <button className="px-3 py-1 bg-[#097561] text-white text-[10px] font-bold rounded-full">Voir Tout</button>
               </div>
               <div className="flex-1 flex justify-center items-center relative">
                  <ResponsiveContainer width={180} height={180}>
                     <PieChart>
                        <Pie
                           data={pieData}
                           cx="50%"
                           cy="50%"
                           innerRadius={60}
                           outerRadius={80}
                           startAngle={90}
                           endAngle={-270}
                           dataKey="value"
                           stroke="none"
                        >
                           {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                           ))}
                        </Pie>
                     </PieChart>
                  </ResponsiveContainer>
                  <span className="absolute text-3xl font-light text-gray-800 font-serif">70%</span>
               </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.04)] border border-gray-100">
               <div className="flex justify-between items-center mb-6">
                  <h3 className="text-gray-400 text-sm font-medium">Activité Récente</h3>
                  <button className="px-3 py-1 bg-[#097561] text-white text-[10px] font-bold rounded-full">Voir Tout</button>
               </div>
               <div className="space-y-6 relative before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-[2px] before:bg-gray-100">
                  <div className="pl-6 relative">
                     <div className="w-3 h-3 rounded-full bg-amber-500 absolute left-0 top-1 ring-4 ring-white"></div>
                     <p className="text-xs text-gray-400">Intervention rapide sur feu signalée à Chefchaouen.</p>
                  </div>
                  <div className="pl-6 relative">
                     <div className="w-3 h-3 rounded-full bg-red-500 absolute left-0 top-1 ring-4 ring-white"></div>
                     <p className="text-xs text-gray-400">Nouvelle infraction ajoutée au contentieux (Zone 3).</p>
                  </div>
                  <div className="pl-6 relative">
                     <div className="w-3 h-3 rounded-full bg-[#097561] absolute left-0 top-1 ring-4 ring-white"></div>
                     <p className="text-xs text-gray-400">Mission d'investigation terminée avec succès (Oued Laou).</p>
                  </div>
                  <div className="pl-6 relative">
                     <div className="w-3 h-3 rounded-full bg-amber-500 absolute left-0 top-1 ring-4 ring-white"></div>
                     <p className="text-xs text-gray-400">Modification du statut d'une ressource forestière.</p>
                  </div>
               </div>
            </div>

         </div>
      </div>
    </div>
  );
}
