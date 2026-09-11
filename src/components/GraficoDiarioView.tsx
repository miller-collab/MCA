import React, { useState, useMemo, useEffect, ReactNode } from 'react';
import {
  Calendar,
  User,
  Clock,
  AlertTriangle,
  TrendingUp,
  Activity,
  Layers,
  BarChart2,
  BarChart3,
  RefreshCw,
  Users,
  Award,
  ArrowUpRight,
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
  calcularDiferencaMinutos,
  verificarDataNoPeriodo,
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
            className="px-4 py-2 bg-[#007BFF] hover:bg-[#0069D9] text-white rounded-lg text-xs font-bold transition inline-flex items-center gap-2 cursor-pointer"
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

type TabGraficoMode = 'evolucao_diaria' | 'top10_atividades';

// Paleta de cores industriais para as Top 10 atividades
const TOP10_COLORS = [
  '#00E676', // #1 Verde
  '#00B0FF', // #2 Azul claro
  '#7C4DFF', // #3 Roxo
  '#FF9100', // #4 Laranja
  '#FFD600', // #5 Amarelo
  '#FF4081', // #6 Rosa
  '#1DE9B6', // #7 Turquesa
  '#FF6E40', // #8 Coral
  '#3D5AFE', // #9 Índigo
  '#00E5FF', // #10 Ciano
];

const GraficoDiarioContent: React.FC<GraficoDiarioViewProps> = ({
  logs = [],
  collaborators = [],
  shifts = [],
  initialCollaborator = null,
  onNavigateToHistory,
}) => {
  // Aba ativa de visualização
  const [activeTabMode, setActiveTabMode] = useState<TabGraficoMode>('evolucao_diaria');

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

  // Colaborador selecionado (Pode ser o nome de um ou 'TODOS')
  const [selectedColabName, setSelectedColabName] = useState<string>(() => {
    if (initialCollaborator && typeof initialCollaborator === 'string' && initialCollaborator.trim()) {
      return initialCollaborator.trim();
    }
    if (listaColaboradores.length > 0 && listaColaboradores[0].name) {
      return listaColaboradores[0].name;
    }
    return 'TODOS';
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
  const isTodos = selectedColabName === 'TODOS';
  const safeSelectedName = isTodos ? 'TODOS' : (selectedColabName || (listaColaboradores[0]?.name ?? ''));

  // Colaborador ativo objeto (quando não é TODOS)
  const currentCollaborator = useMemo(() => {
    if (isTodos || !safeSelectedName) return null;
    const target = safeSelectedName.trim().toLowerCase();
    return listaColaboradores.find((c) => (c.name || '').trim().toLowerCase() === target) || null;
  }, [listaColaboradores, safeSelectedName, isTodos]);

  // Dados diários calculados para o colaborador individual selecionado
  const dailyData = useMemo(() => {
    if (isTodos || !safeSelectedName) return [];
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
  }, [logs, safeSelectedName, collaborators, shifts, startDate, endDate, isTodos]);

  // Totais consolidados do colaborador individual no período
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

  // Dados formatados para o BarChart Individual
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

  // Dados para a visualização de TODOS os colaboradores (Rolar para ver todos)
  const todosColaboradoresData = useMemo(() => {
    if (!isTodos) return [];
    return listaColaboradores.map((colab) => {
      const colabDaily = calcularEficienciaIndividualDiaria(
        logs || [],
        colab.name,
        collaborators || [],
        shifts || [],
        startDate,
        endDate,
        60
      );

      let totalOcupadoMin = 0;
      let totalSemApontarMin = 0;
      let totalEsperadoMin = 0;
      let totalAtividades = 0;

      colabDaily.forEach((d) => {
        totalOcupadoMin += d.trabalhadoMinutos || 0;
        totalSemApontarMin += d.semApontarMinutos || 0;
        totalEsperadoMin += d.esperadoMinutos || 0;
        if (Array.isArray(d.operacoes)) totalAtividades += d.operacoes.length;
      });

      const divisor = totalEsperadoMin > 0 ? totalEsperadoMin : (totalOcupadoMin + totalSemApontarMin);
      const efMedia = divisor > 0 ? Math.min(100, Math.round((totalOcupadoMin / divisor) * 1000) / 10) : 0;

      const barItems = colabDaily.map((d) => {
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
          statusDia: d.statusDia || 'ENCERRADO',
          statusLabel: d.statusLabel || 'Turno Concluído',
          isAlerta: Boolean(d.isAlerta),
          motivoAlerta: d.motivoAlerta,
          operacoes: d.operacoes || [],
          barColor,
        };
      });

      return {
        collaborator: colab,
        daily: colabDaily,
        barItems,
        totalOcupadoMin,
        totalSemApontarMin,
        totalEsperadoMin,
        totalAtividades,
        efMedia,
      };
    });
  }, [isTodos, listaColaboradores, logs, collaborators, shifts, startDate, endDate, targetGreen, targetYellow]);

  // ==========================================
  // CÁLCULO DAS TOP 10 ATIVIDADES MAIS EXECUTADAS
  // ==========================================
  const top10AtividadesData = useMemo(() => {
    // 1. Filtrar logs no período selecionado
    const logsFiltrados = (logs || []).filter((log) => {
      if (!log || !log.date || !log.activity) return false;
      return verificarDataNoPeriodo(log.date, startDate, endDate);
    });

    // 2. Agrupar por atividade
    const mapAtividades: Record<
      string,
      {
        activityName: string;
        category?: string;
        totalMinutos: number;
        totalExecucoes: number;
        colaboradores: Record<
          string,
          {
            nome: string;
            minutos: number;
            vezes: number;
            role?: string;
            shift?: string;
          }
        >;
      }
    > = {};

    let totalGeralMinutosPeriodo = 0;

    logsFiltrados.forEach((log) => {
      const actName = (log.activity || 'Atividade Diversa').trim();
      const colabName = (log.collaboratorName || 'Operador').trim();
      const minutos =
        typeof log.durationMinutes === 'number' && log.durationMinutes > 0
          ? log.durationMinutes
          : calcularDiferencaMinutos(log.startTime, log.endTime);

      if (minutos <= 0) return;

      totalGeralMinutosPeriodo += minutos;

      if (!mapAtividades[actName]) {
        mapAtividades[actName] = {
          activityName: actName,
          category: log.category || 'PRODUÇÃO',
          totalMinutos: 0,
          totalExecucoes: 0,
          colaboradores: {},
        };
      }

      mapAtividades[actName].totalMinutos += minutos;
      mapAtividades[actName].totalExecucoes += 1;

      if (!mapAtividades[actName].colaboradores[colabName]) {
        const cObj = (collaborators || []).find(
          (c) => (c.name || '').trim().toLowerCase() === colabName.toLowerCase()
        );
        mapAtividades[actName].colaboradores[colabName] = {
          nome: colabName,
          minutos: 0,
          vezes: 0,
          role: cObj?.role || log.role || 'OPERADOR',
          shift: cObj?.shift || log.shift || 'Turno 1',
        };
      }

      mapAtividades[actName].colaboradores[colabName].minutos += minutos;
      mapAtividades[actName].colaboradores[colabName].vezes += 1;
    });

    // 3. Converter para array e ordenar pelo maior tempo total
    const listaOrdenada = Object.values(mapAtividades).sort(
      (a, b) => b.totalMinutos - a.totalMinutos
    );

    // 4. Pegar o Top 10
    const top10 = listaOrdenada.slice(0, 10).map((item, index) => {
      const colabsArray = Object.values(item.colaboradores).sort(
        (a, b) => b.minutos - a.minutos
      );

      const horasDecimais = Math.round((item.totalMinutos / 60) * 10) / 10;
      const pctDoTotal =
        totalGeralMinutosPeriodo > 0
          ? Math.round((item.totalMinutos / totalGeralMinutosPeriodo) * 1000) / 10
          : 0;

      // Nome encurtado para o eixo X do gráfico
      const labelCurto =
        item.activityName.length > 18
          ? item.activityName.slice(0, 16) + '…'
          : item.activityName;

      return {
        ranking: index + 1,
        activityName: item.activityName,
        labelCurto,
        category: item.category,
        totalMinutos: item.totalMinutos,
        horasFormatadas: formatarHorasMinutos(item.totalMinutos),
        horasDecimais,
        totalExecucoes: item.totalExecucoes,
        pctDoTotal,
        cor: TOP10_COLORS[index % TOP10_COLORS.length],
        colaboradores: colabsArray,
        totalColaboradoresEnvolvidos: colabsArray.length,
      };
    });

    return {
      top10,
      totalAtividadesDistintas: listaOrdenada.length,
      totalGeralMinutosPeriodo,
      totalGeralHoras: formatarHorasMinutos(totalGeralMinutosPeriodo),
      totalLogsFiltrados: logsFiltrados.length,
    };
  }, [logs, startDate, endDate, collaborators]);

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
      {/* Cabeçalho do Gráfico Diário com Switch de Visualização */}
      <div className="bg-[#181818] border border-[#2D2D2D] rounded-xl p-4 sm:p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#007BFF]/20 text-[#007BFF]">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-white tracking-wide flex items-center gap-2">
                📈 Central de Análise Gráfica & Desempenho
              </h1>
              <p className="text-xs text-[#999999] mt-0.5">
                Evolução cronológica por colaborador e ranking de tempo por atividades
              </p>
            </div>
          </div>
        </div>

        {/* Seletor de Modo: Evolução Diária vs TOP 10 Atividades */}
        <div className="flex items-center bg-[#121212] p-1 rounded-xl border border-[#262626]">
          <button
            onClick={() => setActiveTabMode('evolucao_diaria')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTabMode === 'evolucao_diaria'
                ? 'bg-[#007BFF] text-white shadow-md'
                : 'text-[#AAAAAA] hover:text-white hover:bg-[#1E1E1E]'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>Evolução Diária</span>
          </button>

          <button
            onClick={() => setActiveTabMode('top10_atividades')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTabMode === 'top10_atividades'
                ? 'bg-[#00E676] text-black shadow-md'
                : 'text-[#AAAAAA] hover:text-white hover:bg-[#1E1E1E]'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>TOP 10 Atividades (Tempo & Operadores)</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtros: Colaborador e Período */}
      <div className="bg-[#161616] border border-[#2D2D2D] rounded-xl p-4 sm:p-5 shadow-md space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          {/* Seletor de Colaborador (Apenas relevante quando em Evolução Diária) */}
          {activeTabMode === 'evolucao_diaria' ? (
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
                  <option value="TODOS" className="bg-[#1C1C1C] text-[#00E676] font-black">
                    👥 TODOS OS COLABORADORES (Rolar para ver toda a equipe)
                  </option>
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
          ) : (
            <div className="md:col-span-5 space-y-1.5">
              <label className="text-xs font-bold text-[#AAAAAA] flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-[#00E676]" />
                <span>Modo de Análise:</span>
              </label>
              <div className="bg-[#202020] border border-[#3E3E3E] rounded-lg px-3.5 py-2.5 text-xs font-bold text-[#00E676] flex items-center gap-2">
                <BarChart3 className="w-4 h-4 shrink-0" />
                <span>Ranking Top 10 Atividades mais tempo executadas em toda a fábrica</span>
              </div>
            </div>
          )}

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

        {/* Informações de Período e Colaborador */}
        <div className="pt-3 border-t border-[#252525] flex flex-wrap items-center justify-between gap-3 text-xs">
          {activeTabMode === 'evolucao_diaria' ? (
            isTodos ? (
              <div className="flex items-center gap-2">
                <span className="font-black text-[#00E676] text-sm tracking-wide flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  Visão Geral de Todos os Colaboradores ({listaColaboradores.length} operadores)
                </span>
                <span className="px-2 py-0.5 rounded bg-[#00E676]/20 text-[#00E676] font-bold text-[11px]">
                  Rolar para ver cada operador
                </span>
              </div>
            ) : currentCollaborator ? (
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
            ) : null
          ) : (
            <div className="flex items-center gap-2 text-white">
              <span className="font-black text-[#00E676] text-sm flex items-center gap-1.5">
                <Award className="w-4 h-4" />
                Ranking de Atividades por Carga Horária Total
              </span>
              <span className="px-2 py-0.5 rounded bg-[#202020] text-[#AAAAAA] font-bold text-[11px]">
                {top10AtividadesData.top10.length} de {top10AtividadesData.totalAtividadesDistintas} atividades
              </span>
            </div>
          )}

          <div className="text-[#888888] text-[11px]">
            Período:{' '}
            <strong className="text-white">
              {formatarDataPtBr(new Date(startDate + 'T12:00:00'))}
            </strong>{' '}
            até{' '}
            <strong className="text-white">
              {formatarDataPtBr(new Date(endDate + 'T12:00:00'))}
            </strong>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RENDERIZAÇÃO ABA 1: EVOLUÇÃO DIÁRIA (INDIVIDUAL OU VISÃO DE TODOS) */}
      {/* ========================================================================= */}
      {activeTabMode === 'evolucao_diaria' && !isTodos && (
        <div className="space-y-5">
          {/* Cards de Métricas do Período Individual */}
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
      )}

      {/* ========================================================================= */}
      {/* RENDERIZAÇÃO ABA 1: VISÃO DE TODOS OS COLABORADORES (SCROLL CONTÍNUO) */}
      {/* ========================================================================= */}
      {activeTabMode === 'evolucao_diaria' && isTodos && (
        <div className="space-y-6">
          <div className="bg-[#181818] border border-[#2D2D2D] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                <span>👥 Lista Completa da Equipe: Rolar para acompanhar todos</span>
              </h2>
              <p className="text-xs text-[#888888]">
                Exibindo {listaColaboradores.length} colaboradores cadastrados no período selecionado
              </p>
            </div>
            <span className="text-xs text-[#00E676] bg-[#00E676]/10 px-3 py-1 rounded-full font-bold border border-[#00E676]/30">
              Visualização Contínua
            </span>
          </div>

          <div className="space-y-6">
            {todosColaboradoresData.map((item, cIdx) => (
              <div
                key={item.collaborator.id || item.collaborator.name || cIdx}
                className="bg-[#141414] border border-[#262626] rounded-xl p-4 sm:p-5 shadow-lg space-y-4 hover:border-[#383838] transition"
              >
                {/* Header do Operador */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#222222] pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#007BFF]/20 text-[#007BFF] font-black text-base flex items-center justify-center border border-[#007BFF]/30">
                      {item.collaborator.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-base font-black text-white flex items-center gap-2">
                        <span>{item.collaborator.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#2A2A2A] text-[#BBBBBB] font-bold">
                          {item.collaborator.role || 'OPERADOR'}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#1E293B] text-[#38BDF8] font-bold">
                          {item.collaborator.shift || 'Turno 1'}
                        </span>
                      </h3>
                      <p className="text-xs text-[#777777]">
                        {item.totalAtividades} atividades apontadas no período
                      </p>
                    </div>
                  </div>

                  {/* Eficiência e Ações */}
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-[10px] text-[#888888] font-bold uppercase">Média do Período</div>
                      <div
                        className="text-xl font-black font-mono"
                        style={{
                          color:
                            item.efMedia >= targetGreen
                              ? '#00E676'
                              : item.efMedia >= targetYellow
                              ? '#FFD700'
                              : '#E91E63',
                        }}
                      >
                        {item.efMedia}%
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setSelectedColabName(item.collaborator.name);
                      }}
                      className="px-2.5 py-1.5 bg-[#202020] hover:bg-[#007BFF] hover:text-white text-[#AAAAAA] rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                      title="Focar individualmente neste operador"
                    >
                      <span>Focar</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Métricas Resumidas em Linha */}
                <div className="grid grid-cols-3 gap-2 text-center text-xs bg-[#1A1A1A] p-2.5 rounded-lg border border-[#252525]">
                  <div>
                    <span className="text-[10px] text-[#888888] block">Tempo Ocupado</span>
                    <strong className="text-[#00E676] font-mono text-sm">
                      {formatarHorasMinutos(item.totalOcupadoMin)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#888888] block">Sem Apontar</span>
                    <strong className="text-[#E91E63] font-mono text-sm">
                      {formatarHorasMinutos(item.totalSemApontarMin)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#888888] block">Meta Útil Carga</span>
                    <strong className="text-[#2979FF] font-mono text-sm">
                      {formatarHorasMinutos(item.totalEsperadoMin)}
                    </strong>
                  </div>
                </div>

                {/* Mini Gráfico Diário de Barras deste Operador */}
                <div className="h-[180px] w-full min-w-0 pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={item.barItems} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="2 2" stroke="#222222" vertical={false} />
                      <XAxis
                        dataKey="label"
                        stroke="#666666"
                        fontSize={10}
                        tickLine={false}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                      />
                      <YAxis
                        stroke="#666666"
                        fontSize={10}
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                        ticks={[0, 50, 100]}
                      />
                      <ReferenceLine y={targetGreen} stroke="#00E676" strokeDasharray="2 2" opacity={0.4} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0]?.payload;
                            if (!d) return null;

                            return (
                              <div className="bg-[#1C1C1C] border border-[#444444] p-3 rounded-xl shadow-2xl text-xs space-y-2 z-50 min-w-[240px] max-w-[300px]">
                                <div className="font-bold text-white text-xs border-b border-[#333333] pb-1 flex items-center justify-between gap-2">
                                  <span>📅 {d.fullName || d.label}</span>
                                  <span
                                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                      d.statusDia === 'FOLGA' || d.statusDia === 'NAO_INICIADO'
                                        ? 'bg-[#333333] text-[#AAAAAA]'
                                        : d.statusDia === 'EM_ANDAMENTO'
                                        ? 'bg-[#00E676]/20 text-[#00E676]'
                                        : 'bg-[#2979FF]/20 text-[#2979FF]'
                                    }`}
                                  >
                                    {d.statusLabel}
                                  </span>
                                </div>

                                <div className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[#AAAAAA]">Eficiência:</span>
                                    <span
                                      className="font-black font-mono"
                                      style={{ color: d.barColor }}
                                    >
                                      {d.eficienciaPct}%
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[#00E676]">Tempo Ocupado:</span>
                                    <span className="font-bold text-white font-mono">
                                      {d.trabalhadoHoras}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[#E91E63]">Sem Apontar:</span>
                                    <span className="font-bold text-white font-mono">
                                      {d.semApontarHoras}
                                    </span>
                                  </div>
                                </div>

                                {/* Lista de Atividades em que esteve ocupado */}
                                {d.operacoes && d.operacoes.length > 0 ? (
                                  <div className="border-t border-[#333333] pt-1.5 space-y-1">
                                    <span className="text-[10px] font-bold text-[#888888] uppercase block">
                                      Atividades ({d.operacoes.length}):
                                    </span>
                                    <div className="max-h-24 overflow-y-auto space-y-1 pr-0.5">
                                      {d.operacoes.map(
                                        (
                                          op: { nome: string; tempoMinutos: number },
                                          opIdx: number
                                        ) => (
                                          <div
                                            key={opIdx}
                                            className="flex items-center justify-between text-[10px] bg-[#252525] px-1.5 py-0.5 rounded text-[#DDDDDD]"
                                          >
                                            <span className="truncate max-w-[150px]" title={op.nome}>
                                              • {op.nome}
                                            </span>
                                            <span className="font-mono text-[#00E676] font-bold shrink-0 ml-1">
                                              {formatarHorasMinutos(op.tempoMinutos)}
                                            </span>
                                          </div>
                                        )
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="border-t border-[#333333] pt-1 text-[10px] text-[#777777] italic">
                                    Sem apontamento neste dia
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="eficienciaPct" radius={[4, 4, 0, 0]} maxBarSize={32}>
                        {item.barItems.map((entry, bIdx) => (
                          <Cell key={`cell-bar-${bIdx}`} fill={entry.barColor} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* RENDERIZAÇÃO ABA 2: TOP 10 ATIVIDADES MAIS TEMPO EXECUTADAS (COLUNAS) */}
      {/* ========================================================================= */}
      {activeTabMode === 'top10_atividades' && (
        <div className="space-y-6">
          {/* Cards de Métricas Gerais do Top 10 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-[#161616] border border-[#2A2A2A] p-4 rounded-xl shadow-sm">
              <div className="text-xs text-[#888888] font-bold mb-1 flex items-center justify-between">
                <span>Tempo Total Produção</span>
                <Clock className="w-3.5 h-3.5 text-[#00E676]" />
              </div>
              <div className="text-2xl font-black font-mono text-[#00E676]">
                {top10AtividadesData.totalGeralHoras}
              </div>
              <div className="text-[10px] text-[#666666] mt-1">Soma de todas as atividades no período</div>
            </div>

            <div className="bg-[#161616] border border-[#2A2A2A] p-4 rounded-xl shadow-sm">
              <div className="text-xs text-[#888888] font-bold mb-1 flex items-center justify-between">
                <span>Atividade #1 Líder</span>
                <Award className="w-3.5 h-3.5 text-[#FFD700]" />
              </div>
              <div className="text-base font-black text-[#FFD700] truncate" title={top10AtividadesData.top10[0]?.activityName || '-'}>
                {top10AtividadesData.top10[0]?.activityName || 'Nenhuma'}
              </div>
              <div className="text-[10px] text-[#888888] mt-1 font-mono">
                {top10AtividadesData.top10[0]?.horasFormatadas || '0h'} ({top10AtividadesData.top10[0]?.pctDoTotal || 0}% da fábrica)
              </div>
            </div>

            <div className="bg-[#161616] border border-[#2A2A2A] p-4 rounded-xl shadow-sm">
              <div className="text-xs text-[#888888] font-bold mb-1 flex items-center justify-between">
                <span>Total de Execuções</span>
                <Activity className="w-3.5 h-3.5 text-[#00B0FF]" />
              </div>
              <div className="text-2xl font-black font-mono text-[#00B0FF]">
                {top10AtividadesData.totalLogsFiltrados}
              </div>
              <div className="text-[10px] text-[#666666] mt-1">Apontamentos registrados no período</div>
            </div>

            <div className="bg-[#161616] border border-[#2A2A2A] p-4 rounded-xl shadow-sm">
              <div className="text-xs text-[#888888] font-bold mb-1 flex items-center justify-between">
                <span>Variedade de Tarefas</span>
                <Layers className="w-3.5 h-3.5 text-[#7C4DFF]" />
              </div>
              <div className="text-2xl font-black font-mono text-[#7C4DFF]">
                {top10AtividadesData.totalAtividadesDistintas}
              </div>
              <div className="text-[10px] text-[#666666] mt-1">Tipos distintos de operações executadas</div>
            </div>
          </div>

          {/* Gráfico de Colunas Vertical: TOP 10 Atividades */}
          <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 sm:p-5 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#222222] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[#00E676]/20 text-[#00E676]">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-white">
                    📊 Gráfico de Colunas: TOP 10 Atividades com Maior Tempo de Execução
                  </h2>
                  <p className="text-xs text-[#888888]">
                    Classificação das operações por horas totais acumuladas e identificação dos colaboradores envolvidos
                  </p>
                </div>
              </div>

              <div className="text-xs text-[#888888] bg-[#1F1F1F] px-3 py-1.5 rounded-lg border border-[#333333]">
                Top <strong className="text-[#00E676]">{top10AtividadesData.top10.length}</strong> atividades exibidas
              </div>
            </div>

            {top10AtividadesData.top10.length === 0 ? (
              <div className="py-20 text-center text-[#777777] text-xs">
                Nenhuma atividade executada encontrada no período selecionado.
              </div>
            ) : (
              <div className="h-[360px] sm:h-[420px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
                  <BarChart
                    data={top10AtividadesData.top10}
                    margin={{ top: 20, right: 15, left: 10, bottom: 65 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#222222" vertical={false} />
                    <XAxis
                      dataKey="labelCurto"
                      stroke="#AAAAAA"
                      fontSize={11}
                      tickLine={false}
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                    />
                    <YAxis
                      stroke="#AAAAAA"
                      fontSize={11}
                      tickFormatter={(v) => `${v}h`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const item = payload[0]?.payload;
                          if (!item) return null;

                          return (
                            <div className="bg-[#1C1C1C] border border-[#444444] p-4 rounded-xl shadow-2xl text-xs space-y-3 z-50 min-w-[280px] max-w-[360px]">
                              <div className="border-b border-[#333333] pb-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span
                                    className="font-black text-xs px-2 py-0.5 rounded text-black"
                                    style={{ backgroundColor: item.cor }}
                                  >
                                    TOP #{item.ranking}
                                  </span>
                                  <span className="text-[10px] text-[#AAAAAA] font-bold">
                                    {item.totalExecucoes} apontamentos
                                  </span>
                                </div>
                                <h4 className="font-black text-white text-sm mt-1">
                                  {item.activityName}
                                </h4>
                                <span className="text-[10px] text-[#888888]">{item.category}</span>
                              </div>

                              <div className="space-y-1 text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="text-[#AAAAAA]">Tempo Total Acumulado:</span>
                                  <strong className="text-white font-mono text-sm">
                                    {item.horasFormatadas} ({item.horasDecimais}h)
                                  </strong>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-[#AAAAAA]">Participação na Fábrica:</span>
                                  <strong className="text-[#00E676] font-mono">
                                    {item.pctDoTotal}%
                                  </strong>
                                </div>
                              </div>

                              {/* Colaboradores que executaram */}
                              <div className="border-t border-[#333333] pt-2 space-y-1.5">
                                <div className="text-[10px] font-bold text-[#888888] uppercase flex items-center justify-between">
                                  <span>Colaboradores Envolvidos ({item.colaboradores.length}):</span>
                                  <span>Horas</span>
                                </div>
                                <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                                  {item.colaboradores.map(
                                    (
                                      colab: {
                                        nome: string;
                                        minutos: number;
                                        vezes: number;
                                        role?: string;
                                      },
                                      cIdx: number
                                    ) => (
                                      <div
                                        key={cIdx}
                                        className="flex items-center justify-between text-[11px] bg-[#252525] px-2 py-1 rounded"
                                      >
                                        <div className="truncate max-w-[170px]">
                                          <strong className="text-white">{colab.nome}</strong>
                                          <span className="text-[9px] text-[#888888] block truncate">
                                            {colab.role} ({colab.vezes}x)
                                          </span>
                                        </div>
                                        <span className="font-mono text-[#00E676] font-bold shrink-0 ml-2">
                                          {formatarHorasMinutos(colab.minutos)}
                                        </span>
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="horasDecimais" radius={[6, 6, 0, 0]} maxBarSize={50}>
                      {top10AtividadesData.top10.map((entry, index) => (
                        <Cell key={`cell-top-${index}`} fill={entry.cor} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Cards Detalhados de Cada Atividade do TOP 10 com a Lista dos Colaboradores */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-2">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-[#00E676]" />
                <span>Detalhamento dos Colaboradores por Atividade (TOP 10)</span>
              </h3>
              <span className="text-xs text-[#888888]">
                Nomes, cargos, horas e quantidade de execuções
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {top10AtividadesData.top10.map((item) => (
                <div
                  key={item.ranking}
                  className="bg-[#161616] border border-[#2D2D2D] hover:border-[#444444] rounded-xl p-4 sm:p-5 shadow-md space-y-3.5 transition"
                >
                  {/* Cabeçalho do Card */}
                  <div className="flex items-start justify-between gap-3 border-b border-[#252525] pb-2.5">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-lg text-black font-black text-sm flex items-center justify-center shrink-0 shadow"
                        style={{ backgroundColor: item.cor }}
                      >
                        #{item.ranking}
                      </div>
                      <div>
                        <h4 className="font-black text-white text-sm leading-tight">
                          {item.activityName}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#252525] text-[#AAAAAA] font-bold">
                            {item.category}
                          </span>
                          <span className="text-[10px] text-[#777777]">
                            {item.totalExecucoes} execuções totais
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-base font-black font-mono text-[#00E676]">
                        {item.horasFormatadas}
                      </div>
                      <span className="text-[10px] text-[#888888] block font-mono">
                        {item.pctDoTotal}% da fábrica
                      </span>
                    </div>
                  </div>

                  {/* Lista de Colaboradores desta Atividade */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-[#AAAAAA] flex items-center justify-between">
                      <span>Colaboradores que Executaram:</span>
                      <span>{item.colaboradores.length} pessoa(s)</span>
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {item.colaboradores.map((colab, cIdx) => {
                        const pctDesteColab =
                          item.totalMinutos > 0
                            ? Math.round((colab.minutos / item.totalMinutos) * 100)
                            : 0;

                        return (
                          <div
                            key={cIdx}
                            className="bg-[#1E1E1E] hover:bg-[#252525] border border-[#2D2D2D] p-2.5 rounded-lg flex items-center justify-between gap-3 text-xs transition"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-[#007BFF]/20 text-[#007BFF] font-bold text-xs flex items-center justify-center shrink-0">
                                {colab.nome.slice(0, 1).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-white truncate flex items-center gap-1.5">
                                  <span>{colab.nome}</span>
                                  {onNavigateToHistory && (
                                    <button
                                      onClick={() => onNavigateToHistory(colab.nome)}
                                      className="text-[#666666] hover:text-[#007BFF] transition cursor-pointer"
                                      title={`Ver histórico de ${colab.nome}`}
                                    >
                                      <ArrowUpRight className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                                <div className="text-[10px] text-[#888888] truncate">
                                  {colab.role} • {colab.shift} ({colab.vezes}x)
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="font-mono text-[#00E676] font-bold text-xs block">
                                {formatarHorasMinutos(colab.minutos)}
                              </span>
                              <span className="text-[9px] text-[#888888] font-mono">
                                {pctDesteColab}% da tarefa
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
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
