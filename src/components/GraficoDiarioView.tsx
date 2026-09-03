import React, { useState, useMemo, useEffect, Component, ReactNode } from 'react';
import {
  Calendar,
  User,
  Clock,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Activity,
  Layers,
  BarChart2,
  RefreshCw,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from 'recharts';
import { ProductionLog, Collaborator, ShiftConfig } from '../types';
import {
  formatarDataPtBr,
  formatarHorasMinutos,
  calcularEficienciaIndividualDiaria,
} from '../utils/factoryCalculations';

const toIsoDate = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class GraficoErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('GraficoDiarioView render error caught:', error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="p-8 bg-[#161616] border border-[#333333] rounded-xl text-center space-y-4 m-4">
          <AlertTriangle className="w-10 h-10 text-[#FFD700] mx-auto" />
          <h2 className="text-lg font-bold text-white">Falha ao Renderizar o Gráfico</h2>
          <p className="text-xs text-[#999999] max-w-md mx-auto">
            Ocorreu uma inconsistência temporária ao processar os dados deste operador.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="px-4 py-2 bg-[#007BFF] hover:bg-[#0069D9] text-white rounded-lg text-xs font-bold transition inline-flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Tentar Novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface GraficoDiarioViewProps {
  logs: ProductionLog[];
  collaborators: Collaborator[];
  shifts: ShiftConfig[];
  initialCollaborator?: string | null;
  onNavigateToHistory?: (collaboratorName: string) => void;
}

const GraficoDiarioContent: React.FC<GraficoDiarioViewProps> = ({
  logs = [],
  collaborators = [],
  shifts = [],
  initialCollaborator = null,
  onNavigateToHistory,
}) => {
  // Lista de operadores para o seletor com segurança de campos nulos
  const listaColaboradores = useMemo(() => {
    const rawList = Array.isArray(collaborators) && collaborators.length > 0
      ? collaborators.filter((c) => c && c.name && typeof c.name === 'string')
      : [];

    if (rawList.length === 0) {
      const nomes = Array.from(
        new Set(
          (logs || [])
            .map((l) => l?.collaboratorName)
            .filter((n): n is string => Boolean(n && typeof n === 'string' && n.trim()))
        )
      );
      return nomes.map((n) => ({ id: n, name: n, role: 'OPERADOR', shift: 'Turno 1' }));
    }

    return [...rawList].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [collaborators, logs]);

  // Colaborador selecionado com inicialização defensiva
  const [selectedColabName, setSelectedColabName] = useState<string>(() => {
    if (initialCollaborator && typeof initialCollaborator === 'string' && initialCollaborator.trim()) {
      return initialCollaborator.trim();
    }
    if (listaColaboradores.length > 0 && listaColaboradores[0].name) {
      return listaColaboradores[0].name;
    }
    return '';
  });

  // Sincroniza o operador selecionado quando a lista carregar ou initialCollaborator mudar
  useEffect(() => {
    if (initialCollaborator && typeof initialCollaborator === 'string' && initialCollaborator.trim()) {
      setSelectedColabName(initialCollaborator.trim());
    } else if (!selectedColabName && listaColaboradores.length > 0 && listaColaboradores[0].name) {
      setSelectedColabName(listaColaboradores[0].name);
    }
  }, [initialCollaborator, listaColaboradores, selectedColabName]);

  // Período de datas (padrão: últimos 7 dias até hoje)
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toIsoDate(d);
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return toIsoDate(new Date());
  });

  // Metas de Eficiência
  const targetGreen = 85;
  const targetYellow = 70;

  // Nome seguro do colaborador
  const safeSelectedName = selectedColabName || (listaColaboradores[0]?.name ?? '');

  // Colaborador ativo objeto
  const currentCollaborator = useMemo(() => {
    if (!safeSelectedName) return null;
    const target = safeSelectedName.trim().toLowerCase();
    return listaColaboradores.find((c) => (c.name || '').trim().toLowerCase() === target) || null;
  }, [listaColaboradores, safeSelectedName]);

  // Dados diários calculados para o gráfico com tratamento de erro
  const dailyData = useMemo(() => {
    if (!safeSelectedName) return [];
    try {
      return calcularEficienciaIndividualDiaria(
        logs || [],
        safeSelectedName,
        collaborators || [],
        shifts || [],
        startDate,
        endDate,
        60
      );
    } catch (err) {
      console.error('Erro ao calcular dados diários do colaborador:', err);
      return [];
    }
  }, [logs, safeSelectedName, collaborators, shifts, startDate, endDate]);

  // Totais consolidados do colaborador no período
  const totaisPeriodo = useMemo(() => {
    let totalOcupadoMin = 0;
    let totalSemApontarMin = 0;
    let totalEsperadoMin = 0;
    let diasTrabalhados = 0;
    let totalAtividades = 0;

    (dailyData || []).forEach((d) => {
      if (!d) return;
      totalOcupadoMin += d.trabalhadoMinutos || 0;
      totalSemApontarMin += d.semApontarMinutos || 0;
      totalEsperadoMin += d.esperadoMinutos || 0;
      if ((d.trabalhadoMinutos || 0) > 0) diasTrabalhados++;
      if (Array.isArray(d.operacoes)) totalAtividades += d.operacoes.length;
    });

    const divisor = totalEsperadoMin > 0 ? totalEsperadoMin : (totalOcupadoMin + totalSemApontarMin);
    const efMedia = divisor > 0 ? Math.min(100, Math.round((totalOcupadoMin / divisor) * 1000) / 10) : 0;

    return {
      totalOcupadoMin,
      totalSemApontarMin,
      totalEsperadoMin,
      diasTrabalhados,
      totalDias: (dailyData || []).length,
      totalAtividades,
      efMedia,
    };
  }, [dailyData]);

  // Dados formatados para o BarChart
  const chartData = useMemo(() => {
    if (!dailyData || dailyData.length === 0) return [];
    return dailyData.map((d) => {
      let barColor = '#00E676';
      const pct = typeof d.eficienciaPct === 'number' && !isNaN(d.eficienciaPct) ? d.eficienciaPct : 0;
      if (d.statusDia === 'FOLGA' || d.statusDia === 'NAO_INICIADO') {
        barColor = (d.trabalhadoMinutos || 0) > 0 ? '#00E676' : '#444444';
      } else if (pct < targetYellow) {
        barColor = '#E91E63';
      } else if (pct < targetGreen) {
        barColor = '#FFD700';
      }

      return {
        label: d.dayLabel || d.datePtBr || '',
        fullName: `${d.datePtBr || ''} (${d.dayOfWeekFull || d.dayOfWeek || ''})`,
        datePtBr: d.datePtBr || '',
        dayOfWeek: d.dayOfWeek || '',
        eficienciaPct: pct,
        trabalhadoHoras: formatarHorasMinutos(d.trabalhadoMinutos || 0),
        semApontarHoras: formatarHorasMinutos(d.semApontarMinutos || 0),
        esperadoHoras: formatarHorasMinutos(d.esperadoMinutos || 0),
        trabalhadoMin: d.trabalhadoMinutos || 0,
        semApontarMin: d.semApontarMinutos || 0,
        statusDia: d.statusDia || 'ENCERRADO',
        statusLabel: d.statusLabel || 'Turno Concluído',
        isAlerta: Boolean(d.isAlerta),
        motivoAlerta: d.motivoAlerta,
        operacoes: d.operacoes || [],
        barColor,
      };
    });
  }, [dailyData, targetGreen, targetYellow]);

  // Presets de Data
  const setQuickRange = (tipo: 'hoje' | 'ontem' | '7dias' | '15dias' | 'mes') => {
    const hoje = new Date();
    const isoHoje = toIsoDate(hoje);

    if (tipo === 'hoje') {
      setStartDate(isoHoje);
      setEndDate(isoHoje);
    } else if (tipo === 'ontem') {
      const ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);
      const isoOntem = toIsoDate(ontem);
      setStartDate(isoOntem);
      setEndDate(isoOntem);
    } else if (tipo === '7dias') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      setStartDate(toIsoDate(d));
      setEndDate(isoHoje);
    } else if (tipo === '15dias') {
      const d = new Date();
      d.setDate(d.getDate() - 14);
      setStartDate(toIsoDate(d));
      setEndDate(isoHoje);
    } else if (tipo === 'mes') {
      const d = new Date();
      d.setDate(1);
      setStartDate(toIsoDate(d));
      setEndDate(isoHoje);
    }
  };

  return (
    <div className="p-3 sm:p-6 space-y-5 bg-[#0F0F0F] min-h-screen text-white">
      {/* Cabeçalho do Gráfico Diário */}
      <div className="bg-[#181818] border border-[#2D2D2D] rounded-xl p-4 sm:p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#007BFF]/20 text-[#007BFF]">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-white tracking-wide flex items-center gap-2">
                📈 Gráfico Diário de Desempenho
              </h1>
              <p className="text-xs text-[#999999] mt-0.5">
                Evolução cronológica por colaborador dia a dia no período selecionado
              </p>
            </div>
          </div>
        </div>

        {/* Indicadores de Meta */}
        <div className="flex items-center gap-2 sm:gap-4 bg-[#121212] px-3.5 py-2 rounded-lg border border-[#262626] text-[11px] self-start md:self-auto">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00E676]" />
            <span className="text-[#AAAAAA]">Meta Alta (≥{targetGreen}%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFD700]" />
            <span className="text-[#AAAAAA]">Atenção ({targetYellow}%-{targetGreen - 1}%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E91E63]" />
            <span className="text-[#AAAAAA]">Baixa (&lt;{targetYellow}%)</span>
          </div>
        </div>
      </div>

      {/* Barra de Filtros: Colaborador e Período */}
      <div className="bg-[#161616] border border-[#2D2D2D] rounded-xl p-4 sm:p-5 shadow-md space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          {/* Seletor de Colaborador */}
          <div className="md:col-span-5 space-y-1.5">
            <label className="text-xs font-bold text-[#AAAAAA] flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#007BFF]" />
              <span>Colaborador:</span>
            </label>
            <div className="relative">
              <select
                value={safeSelectedName}
                onChange={(e) => setSelectedColabName(e.target.value)}
                className="w-full bg-[#202020] border border-[#3E3E3E] hover:border-[#007BFF] focus:border-[#007BFF] rounded-lg px-3.5 py-2.5 text-sm font-bold text-white outline-none transition cursor-pointer appearance-none"
              >
                {listaColaboradores.length === 0 && (
                  <option value="">Nenhum colaborador cadastrado</option>
                )}
                {listaColaboradores.map((c) => (
                  <option key={c.id || c.name} value={c.name} className="bg-[#1C1C1C] text-white">
                    {c.name} {c.role ? `• ${c.role}` : ''} ({c.shift || 'Turno 1'})
                  </option>
                ))}
              </select>
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#888888] text-xs">
                ▼
              </div>
            </div>
          </div>

          {/* Seletores de Data: De e Até */}
          <div className="md:col-span-4 space-y-1.5">
            <label className="text-xs font-bold text-[#AAAAAA] flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#00E676]" />
              <span>Intervalo de Datas:</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center bg-[#202020] border border-[#3E3E3E] rounded-lg px-2.5 py-2">
                <span className="text-[10px] text-[#777777] mr-1.5 font-bold">De:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent text-white text-xs font-bold w-full outline-none cursor-pointer [color-scheme:dark]"
                />
              </div>
              <div className="flex items-center bg-[#202020] border border-[#3E3E3E] rounded-lg px-2.5 py-2">
                <span className="text-[10px] text-[#777777] mr-1.5 font-bold">Até:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent text-white text-xs font-bold w-full outline-none cursor-pointer [color-scheme:dark]"
                />
              </div>
            </div>
          </div>

          {/* Atalhos Rápidos de Período */}
          <div className="md:col-span-3 space-y-1.5">
            <label className="text-xs font-bold text-[#AAAAAA] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#FF9800]" />
              <span>Atalhos Rápidos:</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setQuickRange('hoje')}
                className="px-2.5 py-1.5 bg-[#252525] hover:bg-[#333333] active:bg-[#007BFF] text-white text-xs font-bold rounded transition cursor-pointer"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => setQuickRange('ontem')}
                className="px-2.5 py-1.5 bg-[#252525] hover:bg-[#333333] active:bg-[#007BFF] text-white text-xs font-bold rounded transition cursor-pointer"
              >
                Ontem
              </button>
              <button
                type="button"
                onClick={() => setQuickRange('7dias')}
                className="px-2.5 py-1.5 bg-[#252525] hover:bg-[#333333] active:bg-[#007BFF] text-white text-xs font-bold rounded transition cursor-pointer"
              >
                7 Dias
              </button>
              <button
                type="button"
                onClick={() => setQuickRange('15dias')}
                className="px-2.5 py-1.5 bg-[#252525] hover:bg-[#333333] active:bg-[#007BFF] text-white text-xs font-bold rounded transition cursor-pointer"
              >
                15 Dias
              </button>
              <button
                type="button"
                onClick={() => setQuickRange('mes')}
                className="px-2.5 py-1.5 bg-[#252525] hover:bg-[#333333] active:bg-[#007BFF] text-white text-xs font-bold rounded transition cursor-pointer"
              >
                Mês
              </button>
            </div>
          </div>
        </div>

        {/* Informações do Colaborador Selecionado */}
        {currentCollaborator && (
          <div className="pt-3 border-t border-[#252525] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-black text-white text-sm tracking-wide">
                👤 {currentCollaborator.name}
              </span>
              <span className="px-2 py-0.5 rounded bg-[#007BFF]/20 text-[#64B5F6] font-bold text-[11px]">
                {currentCollaborator.role || 'OPERADOR'}
              </span>
              <span className="px-2 py-0.5 rounded bg-[#333333] text-[#CCCCCC] font-bold text-[11px]">
                {currentCollaborator.shift || 'Turno 1'}
              </span>
            </div>

            <div className="text-[#888888] text-[11px]">
              Período: <strong className="text-white">{formatarDataPtBr(new Date(startDate + 'T12:00:00'))}</strong> até{' '}
              <strong className="text-white">{formatarDataPtBr(new Date(endDate + 'T12:00:00'))}</strong> ({dailyData.length} dias)
            </div>
          </div>
        )}
      </div>

      {/* Cards de Métricas do Período */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-[#161616] border border-[#2A2A2A] p-4 rounded-xl shadow-sm">
          <div className="text-xs text-[#888888] font-bold mb-1 flex items-center justify-between">
            <span>Média de Eficiência</span>
            <Activity className="w-3.5 h-3.5 text-[#00E676]" />
          </div>
          <div
            className="text-2xl font-black font-mono"
            style={{
              color:
                totaisPeriodo.efMedia >= targetGreen
                  ? '#00E676'
                  : totaisPeriodo.efMedia >= targetYellow
                  ? '#FFD700'
                  : '#E91E63',
            }}
          >
            {totaisPeriodo.efMedia}%
          </div>
          <div className="text-[10px] text-[#666666] mt-1">Ocupado / Meta Útil Total</div>
        </div>

        <div className="bg-[#161616] border border-[#2A2A2A] p-4 rounded-xl shadow-sm">
          <div className="text-xs text-[#888888] font-bold mb-1 flex items-center justify-between">
            <span>Tempo Ocupado</span>
            <Clock className="w-3.5 h-3.5 text-[#00E676]" />
          </div>
          <div className="text-2xl font-black font-mono text-[#00E676]">
            {formatarHorasMinutos(totaisPeriodo.totalOcupadoMin)}
          </div>
          <div className="text-[10px] text-[#666666] mt-1">
            {totaisPeriodo.totalAtividades} atividades em {totaisPeriodo.diasTrabalhados} dias
          </div>
        </div>

        <div className="bg-[#161616] border border-[#2A2A2A] p-4 rounded-xl shadow-sm">
          <div className="text-xs text-[#888888] font-bold mb-1 flex items-center justify-between">
            <span>Sem Apontar</span>
            <AlertTriangle className="w-3.5 h-3.5 text-[#E91E63]" />
          </div>
          <div className="text-2xl font-black font-mono text-[#E91E63]">
            {formatarHorasMinutos(totaisPeriodo.totalSemApontarMin)}
          </div>
          <div className="text-[10px] text-[#666666] mt-1">Ociosidade / Esperas no turno</div>
        </div>

        <div className="bg-[#161616] border border-[#2A2A2A] p-4 rounded-xl shadow-sm">
          <div className="text-xs text-[#888888] font-bold mb-1 flex items-center justify-between">
            <span>Meta Útil do Período</span>
            <Layers className="w-3.5 h-3.5 text-[#2979FF]" />
          </div>
          <div className="text-2xl font-black font-mono text-[#2979FF]">
            {formatarHorasMinutos(totaisPeriodo.totalEsperadoMin)}
          </div>
          <div className="text-[10px] text-[#666666] mt-1">Definida na configuração de turnos</div>
        </div>
      </div>

      {/* Gráfico de Colunas da Evolução Diária */}
      <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 sm:p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#222222] pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#00E676]/20 text-[#00E676]">
              <BarChart2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-white">
                Evolução Diária de Eficiência: {safeSelectedName.toUpperCase()}
              </h2>
              <p className="text-xs text-[#888888]">
                Cada coluna representa a eficiência (%) e o apontamento do operador em cada dia do período
              </p>
            </div>
          </div>

          <div className="text-xs text-[#888888]">
            Total de dias exibidos: <strong className="text-white">{chartData.length}</strong>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="py-16 text-center text-[#777777] text-xs">
            Nenhum dado encontrado para o colaborador e período selecionados.
          </div>
        ) : (
          <div className="h-[320px] sm:h-[380px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
              <BarChart
                data={chartData}
                margin={{ top: 20, right: 15, left: -15, bottom: 30 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#222222" vertical={false} />
                <XAxis
                  dataKey="label"
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
                  ticks={[0, 25, 50, targetYellow, targetGreen, 100]}
                />
                <ReferenceLine y={targetGreen} stroke="#00E676" strokeDasharray="3 3" opacity={0.6} />
                <ReferenceLine y={targetYellow} stroke="#FFD700" strokeDasharray="3 3" opacity={0.6} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0]?.payload;
                      if (!data) return null;

                      return (
                        <div className="bg-[#1C1C1C] border border-[#444444] p-3.5 rounded-xl shadow-2xl text-xs space-y-2.5 z-50 min-w-[250px] max-w-[320px]">
                          <div className="font-black text-white text-sm border-b border-[#333333] pb-1.5 flex items-center justify-between gap-3">
                            <span>📅 {data.fullName}</span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                data.statusDia === 'FOLGA' || data.statusDia === 'NAO_INICIADO'
                                  ? 'bg-[#333333] text-[#AAAAAA]'
                                  : data.statusDia === 'EM_ANDAMENTO'
                                  ? 'bg-[#00E676]/20 text-[#00E676]'
                                  : 'bg-[#2979FF]/20 text-[#2979FF]'
                              }`}
                            >
                              {data.statusLabel}
                            </span>
                          </div>

                          {data.isAlerta && data.motivoAlerta && (
                            <div className="p-1.5 rounded bg-[#FF3D00]/20 border border-[#FF3D00]/40 text-[#FF9E80] text-[10px] font-bold">
                              🚨 {data.motivoAlerta}
                            </div>
                          )}

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-[#AAAAAA]">Eficiência do Dia:</span>
                              <span
                                className="font-black text-sm font-mono"
                                style={{ color: data.barColor }}
                              >
                                {data.eficienciaPct}%
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-[#00E676]">Tempo Ocupado:</span>
                              <span className="font-bold text-white font-mono">
                                {data.trabalhadoHoras}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-[#E91E63]">Sem Apontar:</span>
                              <span className="font-bold text-white font-mono">
                                {data.semApontarHoras}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4 border-t border-[#333333] pt-1">
                              <span className="text-[#2979FF]">Meta Carga Diária:</span>
                              <span className="font-bold text-[#2979FF] font-mono">
                                {data.esperadoHoras}
                              </span>
                            </div>
                          </div>

                          {/* Operações realizadas */}
                          {data.operacoes && data.operacoes.length > 0 && (
                            <div className="border-t border-[#333333] pt-2 space-y-1">
                              <span className="text-[10px] font-bold text-[#888888] uppercase block">
                                Atividades do Dia ({data.operacoes.length}):
                              </span>
                              <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                                {data.operacoes.map(
                                  (
                                    op: { nome: string; tempoMinutos: number },
                                    opIdx: number
                                  ) => (
                                    <div
                                      key={opIdx}
                                      className="flex items-center justify-between text-[10px] text-[#CCCCCC]"
                                    >
                                      <span className="truncate max-w-[170px]" title={op.nome}>
                                        • {op.nome}
                                      </span>
                                      <span className="font-mono text-white font-bold shrink-0">
                                        {formatarHorasMinutos(op.tempoMinutos)}
                                      </span>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="eficienciaPct" radius={[6, 6, 0, 0]} maxBarSize={45}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.barColor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Tabela de Detalhamento Dia a Dia */}
      <div className="bg-[#161616] border border-[#2A2A2A] rounded-xl p-4 sm:p-5 shadow-md space-y-3">
        <div className="flex items-center justify-between border-b border-[#252525] pb-2.5">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span>📋 Detalhamento Dia a Dia de {safeSelectedName}</span>
          </h3>
          <span className="text-xs text-[#888888]">{dailyData.length} dias no intervalo</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#202020] text-[#AAAAAA] font-bold border-b border-[#333333]">
                <th className="p-2.5">Data / Dia</th>
                <th className="p-2.5">Status</th>
                <th className="p-2.5 text-right">Tempo Ocupado</th>
                <th className="p-2.5 text-right">Sem Apontar</th>
                <th className="p-2.5 text-right">Meta Diária</th>
                <th className="p-2.5 text-right">Eficiência</th>
                <th className="p-2.5">Atividades Realizadas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#252525]">
              {dailyData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-[#777777]">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                dailyData.map((dia, idx) => {
                  let badgeColor = 'text-[#00E676] bg-[#00E676]/10';
                  if (dia.statusDia === 'FOLGA') {
                    badgeColor = 'text-[#888888] bg-[#333333]';
                  } else if (dia.eficienciaPct < targetYellow) {
                    badgeColor = 'text-[#E91E63] bg-[#E91E63]/10';
                  } else if (dia.eficienciaPct < targetGreen) {
                    badgeColor = 'text-[#FFD700] bg-[#FFD700]/10';
                  }

                  return (
                    <tr key={idx} className="hover:bg-[#1C1C1C] transition">
                      <td className="p-2.5 font-bold text-white whitespace-nowrap">
                        {dia.datePtBr}{' '}
                        <span className="text-[11px] text-[#888888] font-normal">
                          ({dia.dayOfWeekFull || dia.dayOfWeek})
                        </span>
                      </td>
                      <td className="p-2.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badgeColor}`}>
                          {dia.statusLabel}
                        </span>
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-[#00E676]">
                        {formatarHorasMinutos(dia.trabalhadoMinutos)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-[#E91E63]">
                        {formatarHorasMinutos(dia.semApontarMinutos)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-[#2979FF]">
                        {formatarHorasMinutos(dia.esperadoMinutos)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-black text-sm">
                        <span
                          style={{
                            color:
                              dia.statusDia === 'FOLGA'
                                ? '#888888'
                                : dia.eficienciaPct >= targetGreen
                                ? '#00E676'
                                : dia.eficienciaPct >= targetYellow
                                ? '#FFD700'
                                : '#E91E63',
                          }}
                        >
                          {dia.eficienciaPct}%
                        </span>
                      </td>
                      <td className="p-2.5">
                        {dia.operacoes && dia.operacoes.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-md">
                            {dia.operacoes.map((op, oIdx) => (
                              <span
                                key={oIdx}
                                className="bg-[#242424] text-[#CCCCCC] px-1.5 py-0.5 rounded text-[10px] font-medium border border-[#333333]"
                                title={`${op.nome}: ${formatarHorasMinutos(op.tempoMinutos)}`}
                              >
                                {op.nome}{' '}
                                <strong className="text-white">
                                  ({formatarHorasMinutos(op.tempoMinutos)})
                                </strong>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[#555555] italic text-[11px]">Sem apontamento</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const GraficoDiarioView: React.FC<GraficoDiarioViewProps> = (props) => {
  return (
    <GraficoErrorBoundary>
      <GraficoDiarioContent {...props} />
    </GraficoErrorBoundary>
  );
};
