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
  Users,
  LayoutGrid,
  BarChart as BarChartIcon,
  TrendingUp,
  Award
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ReferenceLine, 
  Cell, 
  CartesianGrid 
} from 'recharts';
import { ProductionLog, Collaborator, ShiftConfig, OperatorEfficiency } from '../types';
import { 
  calcularEficienciaEquipePeriodo, 
  formatarDataPtBr, 
  formatarHorasMinutos,
  padronizarNomeTurno,
  padronizarDataIso,
  padronizarDataPtBr,
  gerarDatasNoIntervalo
} from '../utils/factoryCalculations';

interface EfficiencyViewProps {
  logs: ProductionLog[];
  collaborators: Collaborator[];
  shifts: ShiftConfig[];
  toleranceMinutes: number;
  onUpdateToleranceMinutes: (newMinutes: number) => void;
  efficiencyThresholdGreen?: number;
  efficiencyThresholdYellow?: number;
  onUpdateEfficiencyThresholds?: (green: number, yellow: number) => void;
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
  efficiencyThresholdGreen = 85,
  efficiencyThresholdYellow = 70,
  onUpdateEfficiencyThresholds,
  isLeaderUnlocked,
  onUnlockLeader,
  onDrilldownClick,
  onNavigateToHistory,
}) => {
  // Date Range filter (defaults to today)
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10);
  });
  
  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10);
  });

  // Active view tab: "grafico_cards" | "apenas_grafico" | "apenas_cards"
  const [viewMode, setViewMode] = useState<'grafico_cards' | 'apenas_grafico' | 'apenas_cards'>('grafico_cards');

  // Shift filter
  const [selectedShift, setSelectedShift] = useState('TODOS');
  const [searchName, setSearchName] = useState('');

  // PIN protection modal state for "Max. Sem Apontar (min)"
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // Quick Date Range Presets
  const handleApplyPreset = (preset: 'hoje' | 'ontem' | 'ultimos7' | 'esteMes' | 'dia28') => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const todayIso = `${y}-${m}-${d}`;

    if (preset === 'hoje') {
      setStartDate(todayIso);
      setEndDate(todayIso);
    } else if (preset === 'ontem') {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const yIso = yesterday.toISOString().slice(0, 10);
      setStartDate(yIso);
      setEndDate(yIso);
    } else if (preset === 'ultimos7') {
      const d7 = new Date(now);
      d7.setDate(now.getDate() - 6);
      setStartDate(d7.toISOString().slice(0, 10));
      setEndDate(todayIso);
    } else if (preset === 'esteMes') {
      const firstDay = `${y}-${m}-01`;
      setStartDate(firstDay);
      setEndDate(todayIso);
    } else if (preset === 'dia28') {
      setStartDate('2026-08-28');
      setEndDate('2026-08-28');
    }
  };

  // Compute team efficiency data for the entire date range
  const rawEfficiencyData = useMemo(() => {
    return calcularEficienciaEquipePeriodo(
      logs, 
      collaborators, 
      shifts, 
      startDate, 
      endDate, 
      toleranceMinutes
    );
  }, [logs, collaborators, shifts, startDate, endDate, toleranceMinutes]);

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

  // Quick summary stats for the period (strictly mathematical and consistent)
  const summaryStats = useMemo(() => {
    if (efficiencyData.length === 0) {
      return { 
        avgEfficiency: 0, 
        totalOccupiedMin: 0, 
        totalSemApontarMin: 0, 
        totalEsperadoMin: 0, 
        alertCount: 0,
        topOperator: null as OperatorEfficiency | null
      };
    }
    const totalOccupied = efficiencyData.reduce((acc, cur) => acc + cur.trabalhadoMinutos, 0);
    const totalSemApontar = efficiencyData.reduce((acc, cur) => acc + cur.semApontarMinutos, 0);
    const totalEsperado = efficiencyData.reduce((acc, cur) => acc + cur.esperadoMinutos, 0);
    
    // Exact team efficiency: Total Occupied / Total Expected (never exceeding 100% when there is unassigned time)
    const baseDivisor = totalEsperado > 0 ? totalEsperado : (totalOccupied + totalSemApontar);
    const exactAvgEff = baseDivisor > 0 ? (totalOccupied / baseDivisor) * 100 : 0;
    const alerts = efficiencyData.filter((e) => e.isAlertaSemApontar).length;

    const sortedByEff = [...efficiencyData].sort((a, b) => b.eficienciaPct - a.eficienciaPct);
    const topOp = sortedByEff.length > 0 && sortedByEff[0].trabalhadoMinutos > 0 ? sortedByEff[0] : null;

    return {
      avgEfficiency: parseFloat(Math.min(100, exactAvgEff).toFixed(1)),
      totalOccupiedMin: totalOccupied,
      totalSemApontarMin: totalSemApontar,
      totalEsperadoMin: totalEsperado,
      alertCount: alerts,
      topOperator: topOp,
    };
  }, [efficiencyData]);

  // Data formatted for Column Bar Chart
  const chartData = useMemo(() => {
    return efficiencyData.map((op) => {
      let shiftColor = '#007BFF'; // Turno 1
      const normTurno = op.turno.toUpperCase();
      if (normTurno.includes('2')) shiftColor = '#FF9800'; // Turno 2
      if (normTurno.includes('3')) shiftColor = '#9C27B0'; // Turno 3

      let effColor = '#00E676';
      if (op.eficienciaPct < efficiencyThresholdYellow) effColor = '#E91E63';
      else if (op.eficienciaPct < efficiencyThresholdGreen) effColor = '#FFD700';

      return {
        name: op.nome.split(' ')[0], // Primeiro nome para legibilidade no eixo X
        fullName: op.nome,
        role: op.role,
        turno: op.turno,
        eficienciaPct: op.eficienciaPct,
        trabalhadoHoras: formatarHorasMinutos(op.trabalhadoMinutos),
        semApontarHoras: formatarHorasMinutos(op.semApontarMinutos),
        esperadoHoras: formatarHorasMinutos(op.esperadoMinutos),
        trabalhadoMin: op.trabalhadoMinutos,
        semApontarMin: op.semApontarMinutos,
        effColor,
        shiftColor,
      };
    });
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

  const diasNoIntervalo = useMemo(() => {
    return gerarDatasNoIntervalo(startDate, endDate);
  }, [startDate, endDate]);

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
            Análise de rendimento por operador, gráfico de colunas por turno e comparativo de ocupação vs ociosidade
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

      {/* Main Control / Filter Bar with Date Range Selector */}
      <div className="bg-[#181818] border border-[#333333] rounded-xl p-3 sm:p-4 space-y-3.5 shadow-md">
        {/* Row 1: Date Range Pickers and Presets */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Seletor de Intervalo de Datas */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-[#111111] px-2.5 py-1.5 rounded-lg border border-[#444444]">
              <Calendar className="w-3.5 h-3.5 text-[#007BFF]" />
              <span className="text-xs font-bold text-[#AAAAAA]">De:</span>
              <input
                type="date"
                id="filtro-data-inicio-eficiencia"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-white text-xs font-mono focus:outline-none cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-[#111111] px-2.5 py-1.5 rounded-lg border border-[#444444]">
              <Calendar className="w-3.5 h-3.5 text-[#00E676]" />
              <span className="text-xs font-bold text-[#AAAAAA]">Até:</span>
              <input
                type="date"
                id="filtro-data-fim-eficiencia"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-white text-xs font-mono focus:outline-none cursor-pointer"
              />
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleApplyPreset('hoje')}
                className={`px-2 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                  startDate === endDate && startDate === new Date().toISOString().slice(0, 10)
                    ? 'bg-[#007BFF] text-white'
                    : 'bg-[#222222] text-[#AAAAAA] hover:text-white'
                }`}
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('ontem')}
                className="px-2 py-1 rounded text-[11px] font-bold bg-[#222222] text-[#AAAAAA] hover:text-white transition cursor-pointer"
              >
                Ontem
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('ultimos7')}
                className="px-2 py-1 rounded text-[11px] font-bold bg-[#222222] text-[#AAAAAA] hover:text-white transition cursor-pointer"
              >
                7 Dias
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('esteMes')}
                className="px-2 py-1 rounded text-[11px] font-bold bg-[#222222] text-[#AAAAAA] hover:text-white transition cursor-pointer"
              >
                Mês
              </button>
            </div>
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
        </div>

        {/* Row 2: Search and View Mode Selectors */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#2A2A2A] pt-3">
          {/* Collaborator Search Input */}
          <div className="flex items-center gap-2 flex-1 sm:max-w-[280px]">
            <input
              type="text"
              placeholder="Buscar colaborador ou cargo..."
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              className="w-full py-1.5 px-2.5 bg-[#111111] text-white border border-[#444444] rounded-lg text-xs focus:outline-none focus:border-[#007BFF]"
            />
          </div>

          {/* View Mode Toggle Buttons */}
          <div className="flex items-center gap-1 bg-[#111111] p-1 rounded-lg border border-[#333333]">
            <button
              onClick={() => setViewMode('grafico_cards')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
                viewMode === 'grafico_cards' ? 'bg-[#007BFF] text-white' : 'text-[#888888] hover:text-white'
              }`}
              title="Exibir gráfico e cartões lado a lado"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Gráfico + Cards</span>
            </button>
            <button
              onClick={() => setViewMode('apenas_grafico')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
                viewMode === 'apenas_grafico' ? 'bg-[#007BFF] text-white' : 'text-[#888888] hover:text-white'
              }`}
              title="Expandir apenas o gráfico de colunas"
            >
              <BarChartIcon className="w-3.5 h-3.5" />
              <span>Gráfico</span>
            </button>
            <button
              onClick={() => setViewMode('apenas_cards')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
                viewMode === 'apenas_cards' ? 'bg-[#007BFF] text-white' : 'text-[#888888] hover:text-white'
              }`}
              title="Exibir apenas os cartões individuais"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
          </div>
        </div>

        {/* Informative Sub-bar */}
        <div className="text-[11px] text-[#777777] flex flex-wrap items-center justify-between border-t border-[#222222] pt-2 gap-2">
          <span>
            📅 Intervalo: <strong>{padronizarDataPtBr(startDate)}</strong> até <strong>{padronizarDataPtBr(endDate)}</strong> ({diasNoIntervalo.length} {diasNoIntervalo.length === 1 ? 'dia analisado' : 'dias analisados'})
          </span>
          <span>{efficiencyData.length} colaboradores listados • Eficiência calculada sobre as Horas Úteis do Turno</span>
        </div>
      </div>

      {/* Daily/Period Team Metric Summary Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-[#141414] border border-[#2A2A2A] p-3 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-[#888888]">Média de Eficiência</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span 
              className="text-xl sm:text-2xl font-black font-mono"
              style={{
                color: summaryStats.avgEfficiency >= efficiencyThresholdGreen ? '#00E676' : summaryStats.avgEfficiency >= efficiencyThresholdYellow ? '#FFD700' : '#E91E63'
              }}
            >
              {summaryStats.avgEfficiency}%
            </span>
          </div>
          <span className="text-[10px] text-[#666666] mt-0.5">Ocupado / Tempo Total</span>
        </div>

        <div className="bg-[#141414] border border-[#2A2A2A] p-3 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-[#888888]">Tempo Ocupado</span>
          <div className="text-xl sm:text-2xl font-black text-[#00E676] font-mono mt-1">
            {formatarHorasMinutos(summaryStats.totalOccupiedMin)}
          </div>
          <span className="text-[10px] text-[#666666] mt-0.5">Horas de atividade útil</span>
        </div>

        <div className="bg-[#141414] border border-[#2A2A2A] p-3 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-[#888888]">Sem Apontamento</span>
          <div className="text-xl sm:text-2xl font-black text-[#E91E63] font-mono mt-1">
            {formatarHorasMinutos(summaryStats.totalSemApontarMin)}
          </div>
          <span className="text-[10px] text-[#666666] mt-0.5">Ociosidade / Esperas</span>
        </div>

        <div className="bg-[#141414] border border-[#2A2A2A] p-3 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-[#888888]">Alertas Ociosidade</span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-xl sm:text-2xl font-black font-mono ${summaryStats.alertCount > 0 ? 'text-[#FF3D00] animate-pulse' : 'text-[#888888]'}`}>
              {summaryStats.alertCount}
            </span>
            {summaryStats.alertCount > 0 && (
              <span className="text-[10px] text-[#FF9800] bg-[#FF9800]/10 px-1 rounded font-bold">
                &gt; {toleranceMinutes}m
              </span>
            )}
          </div>
          <span className="text-[10px] text-[#666666] mt-0.5">Colaboradores c/ desvio</span>
        </div>
      </div>

      {/* GRÁFICO DE COLUNAS POR COLABORADOR SEPARADO POR TURNO */}
      {(viewMode === 'grafico_cards' || viewMode === 'apenas_grafico') && (
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 sm:p-5 space-y-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#222222] pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-[#007BFF]/20 text-[#007BFF]">
                <BarChartIcon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black text-white">
                  Comparativo de Eficiência por Colaborador ({selectedShift === 'TODOS' ? 'Todos os Turnos' : selectedShift})
                </h3>
                <p className="text-[11px] text-[#888888]">
                  Barras coloridas por faixa de rendimento: 🟢 ≥{efficiencyThresholdGreen}% • 🟡 {efficiencyThresholdYellow}%-{efficiencyThresholdGreen - 1}% • 🔴 &lt;{efficiencyThresholdYellow}%
                </p>
              </div>
            </div>

            {/* Shift Indicators Legend */}
            <div className="flex items-center gap-3 text-[11px]">
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#007BFF]" />
                <span className="text-[#AAAAAA]">Turno 1</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FF9800]" />
                <span className="text-[#AAAAAA]">Turno 2</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#9C27B0]" />
                <span className="text-[#AAAAAA]">Turno 3</span>
              </div>
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="py-12 text-center text-[#777777] text-xs">
              Nenhum dado de apontamento encontrado para o intervalo e turno selecionados.
            </div>
          ) : (
            <div className="h-[280px] sm:h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 20, right: 15, left: -20, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#252525" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    stroke="#888888" 
                    fontSize={11} 
                    tickLine={false}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                  />
                  <YAxis 
                    stroke="#888888" 
                    fontSize={11} 
                    domain={[0, 100]} 
                    tickFormatter={(v) => `${v}%`}
                    ticks={[0, 25, 50, efficiencyThresholdYellow, efficiencyThresholdGreen, 100]}
                  />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-[#1C1C1C] border border-[#444444] p-3 rounded-xl shadow-2xl text-xs space-y-1.5 z-50">
                            <div className="font-black text-white text-sm border-b border-[#333333] pb-1 flex items-center justify-between gap-3">
                              <span>{data.fullName}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: `${data.shiftColor}25`, color: data.shiftColor }}>
                                {data.turno}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#AAAAAA]">{data.role}</div>
                            <div className="flex items-center justify-between gap-4 pt-1">
                              <span className="text-[#AAAAAA]">Eficiência:</span>
                              <span className="font-black text-sm font-mono" style={{ color: data.effColor }}>
                                {data.eficienciaPct}%
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-[#00E676]">Tempo Ocupado:</span>
                              <span className="font-bold text-white font-mono">{data.trabalhadoHoras}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-[#E91E63]">Sem Apontar:</span>
                              <span className="font-bold text-white font-mono">{data.semApontarHoras}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4 border-t border-[#333333] pt-1">
                              <span className="text-[#2979FF]">Meta Período:</span>
                              <span className="font-bold text-[#2979FF] font-mono">{data.esperadoHoras}</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  {/* Linhas de Referência: Meta Padrão (Verde) e Mínimo (Amarelo) */}
                  <ReferenceLine 
                    y={efficiencyThresholdGreen} 
                    stroke="#00E676" 
                    strokeDasharray="3 3" 
                    label={{ value: `Meta (${efficiencyThresholdGreen}%)`, fill: '#00E676', fontSize: 10, position: 'right' }} 
                  />
                  <ReferenceLine 
                    y={efficiencyThresholdYellow} 
                    stroke="#FFD700" 
                    strokeDasharray="3 3" 
                    label={{ value: `Mínimo (${efficiencyThresholdYellow}%)`, fill: '#FFD700', fontSize: 10, position: 'right' }} 
                  />
                  <Bar 
                    dataKey="eficienciaPct" 
                    radius={[6, 6, 0, 0]}
                    maxBarSize={45}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.effColor} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Grid of Efficiency Cards */}
      {(viewMode === 'grafico_cards' || viewMode === 'apenas_cards') && (
        <>
          <div className="flex items-center justify-between pt-1">
            <h3 className="text-sm font-bold text-[#AAAAAA] uppercase tracking-wider">
              Detalhamento Individual por Colaborador
            </h3>
            <span className="text-xs text-[#666666]">
              Clique no cartão para abrir o histórico do operador
            </span>
          </div>

          {efficiencyData.length === 0 ? (
            <div className="p-12 text-center bg-[#141414] border border-[#2A2A2A] rounded-xl space-y-2">
              <Users className="w-10 h-10 text-[#555555] mx-auto" />
              <p className="text-base font-bold text-[#AAAAAA]">Nenhuma operação apontada neste período.</p>
              <p className="text-xs text-[#666666]">
                Selecione outro intervalo ou certifique-se de que há colaboradores ativos apontando tarefas.
              </p>
            </div>
          ) : (
            <div id="grid-eficiencia-equipe" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {efficiencyData.map((d) => {
                const corBarra =
                  d.eficienciaPct >= efficiencyThresholdGreen ? '#00E676' : d.eficienciaPct >= efficiencyThresholdYellow ? '#FFD700' : '#E91E63';

                const classePiscar = d.isAlertaSemApontar ? 'card-piscar' : '';
                const hasAutoClosed = logs.some(
                  (l) => l.collaboratorName.trim().toLowerCase() === d.nome.trim().toLowerCase() && (l.autoClosed || l.autoClosedAtShiftEnd)
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
                          <span className="font-bold text-[#CCCCCC]">Eficiência no Período</span>
                          <span className="font-bold font-mono text-sm" style={{ color: corBarra }}>
                            {d.eficienciaPct}%
                          </span>
                        </div>
                        <div className="w-full bg-[#252525] rounded-full h-2.5 overflow-hidden">
                          <div
                            className="h-full transition-all duration-500 rounded-full"
                            style={{
                              width: `${Math.min(d.eficienciaPct, 100)}%`,
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
                          <div className="text-[10px] text-[#888888] font-semibold mb-0.5">Meta Período</div>
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
                              Nenhuma tarefa registrada no período
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
        </>
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
