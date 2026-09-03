import React from 'react';
import { Play, BarChart2, History, BarChart3, Clock, Lock, Unlock, TrendingUp } from 'lucide-react';

export type TabKey = 'painel' | 'eficiencia' | 'grafico-diario' | 'historico' | 'indicadores' | 'turnos';

interface NavigationTabsProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  activeCount: number;
  isLeaderUnlocked?: boolean;
  leaderAlertCount?: number;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  activeTab,
  onTabChange,
  activeCount,
  isLeaderUnlocked = false,
  leaderAlertCount = 0,
}) => {
  const tabs = [
    { id: 'painel' as TabKey, label: 'PRODUÇÃO', icon: Play, count: activeCount },
    { id: 'eficiencia' as TabKey, label: 'EFICIÊNCIA', icon: BarChart2 },
    { id: 'grafico-diario' as TabKey, label: 'GRÁFICO DIÁRIO', icon: TrendingUp },
    { id: 'historico' as TabKey, label: 'HISTÓRICO', icon: History },
    { id: 'indicadores' as TabKey, label: 'INDICADORES LÍDER', icon: BarChart3, isProtected: true, alertCount: leaderAlertCount },
    { id: 'turnos' as TabKey, label: 'TURNOS', icon: Clock, isProtected: true },
  ];

  return (
    <div className="flex bg-[#111111] border-b-2 border-[#333333] select-none sticky top-0 z-30 shadow-md">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            id={`aba-${tab.id.charAt(0)}`}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 py-3.5 sm:py-4 px-2 sm:px-4 text-center font-bold text-xs sm:text-sm tracking-wider cursor-pointer border-r border-[#222222] transition-colors flex items-center justify-center gap-2 ${
              isActive
                ? 'bg-[#1E1E1E] text-[#007BFF] border-b-[3px] border-b-[#007BFF]'
                : 'text-[#888888] hover:bg-[#222222] hover:text-[#FFFFFF]'
            }`}
          >
            <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#007BFF]' : 'text-[#666666]'}`} />
            <span className="truncate">{tab.label}</span>
            {tab.isProtected && (
              <span
                className={`text-[11px] p-1 rounded-full flex items-center justify-center ${
                  isLeaderUnlocked
                    ? 'text-[#00E676] bg-[#00E676]/10'
                    : 'text-[#888888] bg-[#222222]'
                }`}
                title={isLeaderUnlocked ? 'Acesso Liberado' : 'Acesso Restrito do Líder'}
              >
                {isLeaderUnlocked ? (
                  <Unlock className="w-3 h-3 text-[#00E676]" />
                ) : (
                  <Lock className="w-3 h-3 text-[#888888]" />
                )}
              </span>
            )}
            {typeof tab.count === 'number' && tab.count > 0 && (
              <span className="bg-[#00E676] text-black text-[10px] font-black px-1.5 py-0.5 rounded-full" title="Operações em Execução">
                {tab.count}
              </span>
            )}
            {tab.alertCount !== undefined && tab.alertCount > 0 && (
              <span className="bg-[#FF3D00] text-white text-[10px] font-black px-1.5 py-0.5 rounded-full animate-pulse flex items-center gap-0.5" title={`${tab.alertCount} encerramentos automáticos não revisados`}>
                <span>⚠️</span>
                <span>{tab.alertCount}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
