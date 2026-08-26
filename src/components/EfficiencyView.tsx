import React, { useState, useMemo } from 'react';
import { 
  BarChart2, 
  Lock, 
  Unlock, 
  Calendar, 
  Clock, 
  User, 
  AlertTriangle, 
  CheckCircle, 
  ChevronRight, 
  KeyRound, 
  X,
  Filter,
  Users
} from 'lucide-react';
import { ProductionLog, Collaborator, ShiftConfig } from '../types';
import { 
  calcularEficienciaEquipe, 
  formatarDataPtBr, 
  formatarHorasMinutos,
  padronizarNomeTurno
} from '../utils/factoryCalculations';

interface EfficiencyViewProps {
  logs: ProductionLog[];
  collaborators: Collaborator[];
  shifts: ShiftConfig[];
  toleranceMinutes: number;
  onUpdateToleranceMinutes: (newMinutes: number) => void;
  isLeaderUnlocked: boolean;
  onUnlockLeader: (pin: string) => boolean;
  onDrilldownClick?: (operatorName: string) => void;
  onNavigateToHistory?: (operatorName?: string) => void;
}

export const EfficiencyView: React.FC<EfficiencyViewProps> = ({
  logs,
  collaborators,
  shifts,
  toleranceMinutes,
  onUpdateToleranceMinutes,
  isLeaderUnlocked,
  onUnlockLeader,
  onDrilldownClick,
  onNavigateToHistory,
}) => {
  // Date filter (defaults to today)
  const [filterDate, setFilterDate] = useState(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10);
  });

  // Shift filter
  const [selectedShift, setSelectedShift] = useState('TODOS');
  const [searchName, setSearchName] = useState('');

  // PIN protection modal state for "Max. Sem Apontar (min)"
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [tempTolerance, setTempTolerance] = useState(toleranceMinutes);

  // Formatted date string DD/MM/YYYY for data calculation
  const formattedFilterDate = useMemo(() => {
    if (!filterDate) return formatarDataPtBr(new Date());
    const parts = filterDate.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }, [filterDate]);

  // Compute team efficiency data
  const rawEfficiencyData = useMemo(() => {
    return calcularEficienciaEquipe(
      logs, 
      collaborators, 
      shifts, 
      formattedFilterDate, 
      toleranceMinutes
    );
  }, [logs, collaborators, shifts, formattedFilterDate, toleranceMinutes]);

  // Filter efficiency data by shift and search term
  const efficiencyData = useMemo(() => {
    return rawEfficiencyData.filter((item) => {
      const matchShift =
        selectedShift === 'TODOS' ||
        padronizarNomeTurno(item.turno) === padronizarNomeTurno(selectedShift);
      const matchName =
        !searchName || item.nome.toLowerCase().includes(searchName.toLowerCase());
      return matchShift && matchName;
    });
  }, [rawEfficiencyData, selectedShift, searchName]);

  // Quick summary stats for the day
  const summaryStats = useMemo(() => {
    if (efficiencyData.length === 0) {
      return { avgEfficiency: 0, totalOccupiedMin: 0, totalSemApontarMin: 0, alertCount: 0 };
    }
    const totalOccupied = efficiencyData.reduce((acc, cur) => acc + cur.trabalhadoMinutos, 0);
    const totalSemApontar = efficiencyData.reduce((acc, cur) => acc + cur.semApontarMinutos, 0);
    const avgEff =
      efficiencyData.reduce((acc, cur) => acc + cur.eficienciaRaw, 0) / efficiencyData.length;
    const alerts = efficiencyData.filter((e) => e.isAlertaSemApontar).length;

    return {
      avgEfficiency: parseFloat(avgEff.toFixed(1)),
      totalOccupiedMin: totalOccupied,
      totalSemApontarMin: totalSemApontar,
      alertCount: alerts,
    };
  }, [efficiencyData]);

  // Handle PIN verification
  const handlePinSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const success = onUnlockLeader(pinInput);
    if (success) {
      setPinError(false);
      setIsPinModalOpen(false);
      setPinInput('');
    } else {
      setPinError(true);
    }
  };

  const handleToleranceClick = () => {
    if (!isLeaderUnlocked) {
      setIsPinModalOpen(true);
      setPinInput('');
      setPinError(false);
    }
  };

  const handleToleranceChange = (newVal: number) => {
    if (!isLeaderUnlocked) {
      setIsPinModalOpen(true);
      return;
    }
    const clamped = Math.max(0, Math.min(600, newVal));
    onUpdateToleranceMinutes(clamped);
  };

  return (
    <div className="max-w-[1100px] mx-auto px-3 sm:px-4 py-5 space-y-5">
      {/* Header Section */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#333333] pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
            <span className="text-[#00E676]">📊</span>
            <span>Dashboard de Eficiência da Equipe</span>
          </h2>
          <p className="text-xs sm:text-sm text-[#888888] mt-0.5">
            Rendimento dos operadores, tempo trabalhado vs tempo sem apontar e operações em tempo real
          </p>
        </div>

        {/* Quick Shift Filter Pills */}
        <div className="flex items-center gap-1.5 bg-[#111111] p-1 rounded-lg border border-[#333333]">
          {['TODOS', 'Turno 1', 'Turno 2', 'Turno 3'].map((shiftOpt) => {
            const isActive = selectedShift === shiftOpt;
            return (
              <button
                key={shiftOpt}
                onClick={() => setSelectedShift(shiftOpt)}
                className={`px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
                  isActive
                    ? 'bg-[#007BFF] text-white shadow-sm'
                    : 'text-[#888888] hover:text-white hover:bg-[#222222]'
                }`}
              >
                {shiftOpt === 'TODOS' ? 'Todos os Turnos' : shiftOpt}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Control / Filter Bar */}
      <div className="bg-[#181818] border border-[#333333] rounded-xl p-3 sm:p-4 space-y-3 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Data de Análise */}
          <div className="flex items-center gap-2">
            <label htmlFor="filtro-data-eficiencia-tab" className="text-xs font-bold text-[#CCCCCC] flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#007BFF]" />
              <span>Data de Análise:</span>
            </label>
            <input
              type="date"
              id="filtro-data-eficiencia-tab"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="py-1.5 px-2.5 bg-[#111111] text-white border border-[#555555] rounded-lg text-xs font-mono focus:outline-none focus:border-[#007BFF]"
            />
          </div>

          {/* Campo Protegido: Max. Sem Apontar (min) */}
          <div 
            className={`flex items-center rounded-lg border px-3 py-1.5 transition-all ${
              isLeaderUnlocked 
                ? 'bg-[#1C2518] border-[#00E676]/40' 
                : 'bg-[#221A15] border-[#FF9800]/40 hover:border-[#FF9800]'
            }`}
          >
            <label
              htmlFor="tolerancia-sem-apontar-eficiencia-tab"
              className="text-[#FF8C00] text-xs font-bold mr-2 flex items-center gap-1.5 cursor-pointer"
              onClick={handleToleranceClick}
            >
              <span>Max. Sem Apontar (min):</span>
            </label>

            {isLeaderUnlocked ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  id="tolerancia-sem-apontar-eficiencia-tab"
                  value={toleranceMinutes}
                  min="0"
                  max="600"
                  step="5"
                  onChange={(e) => handleToleranceChange(parseFloat(e.target.value) || 0)}
                  className="w-14 p-1 bg-[#111111] text-white font-mono text-xs text-center rounded border border-[#00E676]/50 focus:outline-none focus:border-[#00E676]"
                />
                <span 
                  className="text-[10px] px-1.5 py-0.5 bg-[#00E676]/20 text-[#00E676] font-bold rounded flex items-center gap-1 cursor-default"
                  title="Alteração autorizada pelo Líder"
                >
                  <Unlock className="w-3 h-3 text-[#00E676]" />
                  <span className="hidden sm:inline">Líder</span>
                </span>
              </div>
            ) : (
              <div 
                onClick={handleToleranceClick}
                className="flex items-center gap-1.5 cursor-pointer group"
                title="Clique para desbloquear e alterar com a senha do líder"
              >
                <div className="w-12 py-1 bg-[#111111] text-white font-mono text-xs text-center rounded border border-[#555555] group-hover:border-[#FF9800]">
                  {toleranceMinutes}
                </div>
                <div className="p-1 bg-[#FF9800]/20 text-[#FF9800] rounded group-hover:bg-[#FF9800] group-hover:text-black transition">
                  <Lock className="w-3.5 h-3.5" />
                </div>
              </div>
            )}
          </div>

          {/* Quick Collaborator Search Filter */}
          <div className="flex items-center gap-2 flex-1 sm:max-w-[220px]">
            <input
              type="text"
              placeholder="Buscar colaborador..."
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              className="w-full py-1.5 px-2.5 bg-[#111111] text-white border border-[#444444] rounded-lg text-xs focus:outline-none focus:border-[#007BFF]"
            />
          </div>
        </div>

        <div className="text-[11px] text-[#777777] flex items-center justify-between border-t border-[#2A2A2A] pt-2">
          <span>(Calculado vs Horas Úteis do Turno • Clique no cartão para filtrar histórico do operador)</span>
          <span>{efficiencyData.length} colaboradores listados</span>
        </div>
      </div>

      {/* Daily Team Metric Summary Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-[#141414] border border-[#2A2A2A] p-3 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-[#888888]">Média de Eficiência</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span 
              className="text-xl sm:text-2xl font-black font-mono"
              style={{
                color: summaryStats.avgEfficiency >= 80 ? '#00E676' : summaryStats.avgEfficiency >= 50 ? '#FFD700' : '#E91E63'
              }}
            >
              {summaryStats.avgEfficiency}%
            </span>
          </div>
        </div>

        <div className="bg-[#141414] border border-[#2A2A2A] p-3 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-[#888888]">Tempo Ocupado</span>
          <div className="text-xl sm:text-2xl font-black text-[#00E676] font-mono mt-1">
            {formatarHorasMinutos(summaryStats.totalOccupiedMin)}
          </div>
        </div>

        <div className="bg-[#141414] border border-[#2A2A2A] p-3 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-[#888888]">Sem Apontamento</span>
          <div className="text-xl sm:text-2xl font-black text-[#E91E63] font-mono mt-1">
            {formatarHorasMinutos(summaryStats.totalSemApontarMin)}
          </div>
        </div>

        <div className="bg-[#141414] border border-[#2A2A2A] p-3 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-[#888888]">Alertas Ociosidade</span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-xl sm:text-2xl font-black font-mono ${summaryStats.alertCount > 0 ? 'text-[#FF3D00] animate-pulse' : 'text-[#888888]'}`}>
              {summaryStats.alertCount}
            </span>
            {summaryStats.alertCount > 0 && (
              <span className="text-[10px] text-[#FF9800] bg-[#FF9800]/10 px-1 rounded">Acima {toleranceMinutes}m</span>
            )}
          </div>
        </div>
      </div>

      {/* Grid of Efficiency Cards (Foto 2) */}
      {efficiencyData.length === 0 ? (
        <div className="p-12 text-center bg-[#141414] border border-[#2A2A2A] rounded-xl space-y-2">
          <Users className="w-10 h-10 text-[#555555] mx-auto" />
          <p className="text-base font-bold text-[#AAAAAA]">Nenhuma operação apontada nesta data.</p>
          <p className="text-xs text-[#666666]">
            Selecione outro dia ou certifique-se de que há colaboradores ativos apontando tarefas.
          </p>
        </div>
      ) : (
        <div id="grid-eficiencia-equipe" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {efficiencyData.map((d) => {
            const corBarra =
              d.eficienciaRaw >= 80 ? '#00E676' : d.eficienciaRaw >= 50 ? '#FFD700' : '#E91E63';

            const classePiscar = d.isAlertaSemApontar ? 'card-piscar' : '';
            const hasAutoClosed = logs.some(
              (l) => l.collaboratorName === d.nome && l.date === formattedFilterDate && (l.autoClosed || l.autoClosedAtShiftEnd)
            );

            return (
              <div
                key={d.nome}
                id={`card-eficiencia-${d.nome.replace(/\s+/g, '-').toLowerCase()}`}
                onClick={() => {
                  if (onNavigateToHistory) {
                    onNavigateToHistory(d.nome);
                  } else if (onDrilldownClick) {
                    onDrilldownClick(d.nome);
                  }
                }}
                className={`card bg-[#111111] border rounded-xl overflow-hidden cursor-pointer hover:border-[#666666] transition-all hover:scale-[1.01] shadow-lg flex flex-col justify-between ${
                  hasAutoClosed ? 'border-[#FF9800]' : 'border-[#2A2A2A]'
                } ${classePiscar}`}
                title="Clique para visualizar o histórico de apontamentos deste operador"
              >
                {/* Card Header */}
                <div className="card-header bg-[#1E1E1E] text-white p-3.5 flex justify-between items-center border-b border-[#2A2A2A]">
                  <div className="flex items-center gap-2 truncate max-w-[65%]">
                    <span className="font-black text-sm text-white truncate tracking-wide">
                      {d.nome}
                    </span>
                    {hasAutoClosed && (
                      <span className="bg-[#FF9800] text-black text-[9px] font-black px-1.5 py-0.5 rounded shrink-0" title="Teve operação auto-encerrada no turno">
                        Auto-fechado
                      </span>
                    )}
                  </div>
                  <span className="text-[#007BFF] text-xs font-bold font-mono shrink-0">
                    {d.turno} {d.esperadoMinutos > 0 ? `(${d.turnoEntrada}-${d.turnoSaida})` : '(Inativo)'}
                  </span>
                </div>

                {/* Card Body */}
                <div className="card-body p-4 text-left space-y-3.5">
                  {/* Eficiência Atual Bar */}
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="font-bold text-[#CCCCCC]">Eficiência Atual</span>
                      <span className="font-bold font-mono text-sm" style={{ color: corBarra }}>
                        {d.eficienciaPct}%
                      </span>
                    </div>
                    <div className="w-full bg-[#252525] rounded-full h-2.5 overflow-hidden">
                      <div
                        className="h-full transition-all duration-500 rounded-full"
                        style={{
                          width: `${Math.min(d.eficienciaRaw, 100)}%`,
                          backgroundColor: corBarra,
                        }}
                      />
                    </div>
                  </div>

                  {/* 3 Métricas: Ocupado, Sem Apontar, Meta Turno */}
                  <div className="grid grid-cols-3 gap-1.5 text-center bg-[#181818] p-2.5 rounded-lg border border-[#2D2D2D]">
                    <div>
                      <div className="text-[10px] text-[#888888] font-semibold mb-0.5">Ocupado</div>
                      <div className="text-[#00E676] font-bold text-xs font-mono">
                        {formatarHorasMinutos(d.trabalhadoMinutos)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#888888] font-semibold mb-0.5">Sem Apontar</div>
                      <div className="text-[#E91E63] font-bold text-xs font-mono">
                        {formatarHorasMinutos(d.semApontarMinutos)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#888888] font-semibold mb-0.5">Meta Turno</div>
                      <div className="text-[#2979FF] font-bold text-xs font-mono">
                        {formatarHorasMinutos(d.esperadoMinutos)}
                      </div>
                    </div>
                  </div>

                  {/* Detalhamento das Operações */}
                  <div>
                    <div className="text-[11px] font-bold text-[#888888] mb-1.5 flex items-center justify-between">
                      <span>Detalhamento das Operações:</span>
                      <span className="text-[10px] text-[#555555]">{d.operacoes.length} ativ.</span>
                    </div>
                    <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                      {d.operacoes.length === 0 ? (
                        <div className="text-[11px] text-[#666666] italic py-1">
                          Nenhuma tarefa registrada
                        </div>
                      ) : (
                        d.operacoes.map((op, idx) => (
                          <div
                            key={idx}
                            className="flex justify-between items-center text-xs border-b border-[#222222] py-1 gap-2"
                          >
                            <span className="text-[#DDDDDD] truncate max-w-[70%]" title={op.nome}>
                              {op.nome}
                            </span>
                            <span className="text-white font-bold font-mono text-[11px] shrink-0">
                              {formatarHorasMinutos(op.tempoMinutos)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Footer Action */}
                <div className="px-4 py-2 bg-[#161616] border-t border-[#222222] flex items-center justify-between text-[11px] text-[#888888] hover:text-[#007BFF]">
                  <span>Ver histórico detalhado</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Senha do Líder para Proteção do Max. Sem Apontar */}
      {isPinModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-[#FF9800]/50 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-[#333333] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#FF9800]/20 flex items-center justify-center text-[#FF9800]">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white">Alteração Restrita ao Líder</h3>
                  <p className="text-[11px] text-[#888888]">Tolerância Max. Sem Apontar</p>
                </div>
              </div>
              <button
                onClick={() => setIsPinModalOpen(false)}
                className="text-[#888888] hover:text-white p-1 rounded-lg hover:bg-[#2A2A2A] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#CCCCCC] leading-relaxed">
              O ajuste do limite de minutos sem apontamento afeta o cálculo de eficiência de toda a fábrica e requer a senha do líder.
            </p>

            <form onSubmit={handlePinSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#AAAAAA] mb-1">
                  Digite a Senha do Líder:
                </label>
                <input
                  type="password"
                  autoFocus
                  maxLength={10}
                  value={pinInput}
                  onChange={(e) => {
                    setPinInput(e.target.value);
                    setPinError(false);
                  }}
                  placeholder="Digite a Senha do Líder"
                  className={`w-full p-3 bg-[#111111] text-white text-center tracking-widest text-lg font-mono rounded-xl border focus:outline-none ${
                    pinError ? 'border-[#FF3D00] bg-[#FF3D00]/10' : 'border-[#444444] focus:border-[#007BFF]'
                  }`}
                />
                {pinError && (
                  <p className="text-xs text-[#FF3D00] font-bold mt-1.5 flex items-center gap-1 justify-center">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Senha incorreta. Tente novamente.</span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(false)}
                  className="py-2.5 px-4 bg-[#252525] hover:bg-[#333333] text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-4 bg-[#007BFF] hover:bg-[#0069D9] text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Desbloquear</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
