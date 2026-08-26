import React, { useEffect, useState } from 'react';
import { Clock, ShieldCheck, Volume2, VolumeX, Maximize2, Minimize2, Sparkles, Activity } from 'lucide-react';
import { ShiftConfig } from '../types';
import { formatarDataPtBr, formatarHoraPtBr } from '../utils/factoryCalculations';

interface HeaderProps {
  shifts: ShiftConfig[];
  soundEnabled: boolean;
  onToggleSound: () => void;
  activeCount: number;
  onOpenNewActivity: () => void;
  onQuickShiftAccess: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  shifts,
  soundEnabled,
  onToggleSound,
  activeCount,
  onOpenNewActivity,
  onQuickShiftAccess,
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Determine current active shift respecting days and configured hours
  const DIAS_SIGLAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  const currentDayName = DIAS_SIGLAS[currentTime.getDay()];
  const currentHourMin = `${String(currentTime.getHours()).padStart(2, '0')}:${String(currentTime.getMinutes()).padStart(2, '0')}`;
  
  const activeShift = shifts.find(s => {
    // If shift has no days or today is not an operating day, it is inactive
    if (!s.dias || s.dias.length === 0 || !s.dias.includes(currentDayName)) {
      return false;
    }
    if (s.entrada <= s.saida) {
      return currentHourMin >= s.entrada && currentHourMin <= s.saida;
    } else {
      // Overnight shift
      return currentHourMin >= s.entrada || currentHourMin <= s.saida;
    }
  });

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <header className="bg-[#111111] border-b border-[#333333] text-white sticky top-0 z-40 shadow-md">
      <div className="max-w-[1100px] mx-auto px-3 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#007BFF] flex items-center justify-center shadow-md">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-black text-sm sm:text-base tracking-wider text-white">
                MCA <span className="font-normal text-[#888888]">| CONTROLE DE ATIVIDADES</span>
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 bg-[#00E676]/20 border border-[#00E676]/30 rounded text-[10px] font-bold text-[#00E676]">
                <span className="w-1.5 h-1.5 bg-[#00E676] rounded-full animate-pulse"></span>
                TEMPO REAL
              </span>
            </div>
            <p className="text-[11px] text-[#888888] font-normal hidden sm:block">
              Sistema MES Industrial de Monitoramento de Chão de Fábrica
            </p>
          </div>
        </div>

        {/* Center Live Clock & Shift Badge */}
        <div className="flex items-center gap-3 bg-[#1E1E1E] px-3 py-1.5 rounded-lg border border-[#333333]">
          <Clock className="w-4 h-4 text-[#007BFF] shrink-0" />
          <div className="text-right sm:text-left">
            <div className="font-mono font-black text-sm sm:text-base tracking-widest text-[#00E676] leading-none">
              {formatarHoraPtBr(currentTime)}
            </div>
            <div className="text-[10px] text-[#888888] font-medium font-mono">
              {formatarDataPtBr(currentTime)}
            </div>
          </div>

          <div className="h-5 w-px bg-[#333333] mx-1 hidden sm:block" />

          <button
            onClick={onQuickShiftAccess}
            className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#252525] hover:bg-[#333333] text-[11px] font-bold border border-[#444444] text-[#CCCCCC] transition cursor-pointer"
            title={
              activeShift
                ? `Turno Ativo: ${activeShift.name} (${activeShift.entrada} - ${activeShift.saida}) • Clique para ver/configurar`
                : `Nenhum turno em operação no momento • Clique para ver/configurar horários`
            }
          >
            <span
              className={`w-2 h-2 rounded-full ${
                activeShift ? 'bg-[#00E676] animate-pulse' : 'bg-[#FF8C00]'
              }`}
            />
            <span className="truncate max-w-[140px]">
              {activeShift ? `${activeShift.name} (${activeShift.entrada}-${activeShift.saida})` : 'Fora de Turno'}
            </span>
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleSound}
            className={`p-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition ${
              soundEnabled
                ? 'bg-[#00E676]/10 border-[#00E676]/40 text-[#00E676] hover:bg-[#00E676]/20'
                : 'bg-[#222222] border-[#444444] text-[#888888] hover:bg-[#333333]'
            }`}
            title={soundEnabled ? 'Alertas sonoros ativados' : 'Alertas sonoros desativados'}
            aria-label="Controle de áudio"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden md:inline">{soundEnabled ? 'Som Ativo' : 'Mudo'}</span>
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg border border-[#444444] bg-[#222222] text-[#888888] hover:text-white hover:bg-[#333333] transition hidden sm:flex"
            title="Alternar Tela Cheia"
            aria-label="Tela cheia"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
};
