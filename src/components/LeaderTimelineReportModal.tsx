import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  X,
  Calendar,
  Printer,
  Download,
  Users,
  Search,
  Check,
  Clock,
  CheckCircle2,
  BarChart3,
  AlignLeft,
  RotateCcw,
} from 'lucide-react';
import { ProductionLog, Collaborator, ShiftConfig } from '../types';
import {
  formatarHorasMinutos,
  calcularDiferencaMinutos,
  obterDataHojeIsoPtBr,
  formatarDataIsoPtBr,
  verificarDataNoPeriodo,
  obterTurnoDoLog,
  padronizarNomeTurno,
  obterHoraMinutoPtBr,
  timeToMinutesOfDay,
} from '../utils/factoryCalculations';
import {
  TimelineActivityBlock,
  CollaboratorTimelineSummary,
  LeaderActionFormState,
  generateAndSaveLeaderTimelinePdf,
} from '../utils/leaderTimelineReportPdfGenerator';

interface LeaderTimelineReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: ProductionLog[];
  collaborators: Collaborator[];
  shifts: ShiftConfig[];
}

const LEADER_ACTION_OPTIONS = [
  'Alinhamento / OK',
  'Orientação Verbal',
  'Ajuste de Processo',
  'Acompanhamento',
  'Outra Ação',
];

function formatIsoToPtBr(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return iso;
}

function formatMinTick(min: number): string {
  const normalized = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  const nextDay = min >= 1440 ? '+1d' : '';
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}${nextDay}`;
}

export const LeaderTimelineReportModal: React.FC<LeaderTimelineReportModalProps> = ({
  isOpen,
  onClose,
  logs,
  collaborators,
}) => {
  // 1. Filtros de Data / Período
  const [periodMode, setPeriodMode] = useState<'DATA' | 'PERIODO'>('DATA');
  const [singleDate, setSingleDate] = useState<string>(() => obterDataHojeIsoPtBr());
  const [startDate, setStartDate] = useState<string>(() => obterDataHojeIsoPtBr());
  const [endDate, setEndDate] = useState<string>(() => obterDataHojeIsoPtBr());

  // 2. Filtro de Turno & Ordenação
  const [shiftFilter, setShiftFilter] = useState<string>('TODOS');
  const [sortBy, setSortBy] = useState<'INICIO' | 'TEMPO' | 'NOME'>('INICIO');
  const [chartView, setChartView] = useState<'AUTO' | 'TIMELINE' | 'BARRAS' | 'AMBOS'>('AUTO');

  // 3. Seletor de Colaboradores ("todos ou de quem eu escolher")
  // Vazio = Todos que iniciaram atividades. Preenchido = apenas os nomes selecionados.
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [colabDropdownOpen, setColabDropdownOpen] = useState(false);
  const [colabSearch, setColabSearch] = useState('');
  const colabDropdownRef = useRef<HTMLDivElement>(null);

  // 4. Formulário: Campo para Ação do Líder (persistido por chave de data/período)
  const effectiveStart = periodMode === 'DATA' ? singleDate : (startDate || singleDate);
  const effectiveEnd = periodMode === 'DATA' ? singleDate : (endDate || startDate || singleDate);
  const draftStorageKey = `mca_leader_action_draft_${effectiveStart}_${effectiveEnd}`;

  const [leaderAction, setLeaderAction] = useState<LeaderActionFormState>({
    classifications: [],
    actionText: '',
    responsible: '',
    deadline: '',
  });

  // Carrega rascunho da ação do líder quando muda a data/período
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        setLeaderAction({
          classifications: Array.isArray(parsed.classifications) ? parsed.classifications : [],
          actionText: typeof parsed.actionText === 'string' ? parsed.actionText : '',
          responsible: typeof parsed.responsible === 'string' ? parsed.responsible : '',
          deadline: typeof parsed.deadline === 'string' ? parsed.deadline : '',
        });
      } else {
        setLeaderAction({
          classifications: [],
          actionText: '',
          responsible: '',
          deadline: '',
        });
      }
    } catch {
      // ignore storage errors
    }
  }, [draftStorageKey]);

  // Salva rascunho automaticamente
  useEffect(() => {
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify(leaderAction));
    } catch {
      // ignore storage errors
    }
  }, [draftStorageKey, leaderAction]);

  // Estados de exportação PDF / Impressão
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfFeedback, setPdfFeedback] = useState<string | null>(null);

  // Fechar popover ao clicar fora
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (colabDropdownRef.current && !colabDropdownRef.current.contains(e.target as Node)) {
        setColabDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Atalhos rápidos de data/período
  const applyPreset = (preset: 'HOJE' | 'ONTEM' | '7DIAS' | 'MES') => {
    const today = new Date();
    const todayIso = obterDataHojeIsoPtBr();
    if (preset === 'HOJE') {
      setPeriodMode('DATA');
      setSingleDate(todayIso);
    } else if (preset === 'ONTEM') {
      const yest = new Date(today);
      yest.setDate(yest.getDate() - 1);
      const yIso = formatarDataIsoPtBr(yest);
      setPeriodMode('DATA');
      setSingleDate(yIso);
    } else if (preset === '7DIAS') {
      const d7 = new Date(today);
      d7.setDate(d7.getDate() - 6);
      setPeriodMode('PERIODO');
      setStartDate(formatarDataIsoPtBr(d7));
      setEndDate(todayIso);
    } else if (preset === 'MES') {
      const mStart = new Date(today.getFullYear(), today.getMonth(), 1);
      setPeriodMode('PERIODO');
      setStartDate(formatarDataIsoPtBr(mStart));
      setEndDate(todayIso);
    }
  };

  // Logs base filtrados por data/período e turno (antes do filtro de colaborador individual, para popular lista)
  const periodAndShiftLogs = useMemo(() => {
    const nowTime = obterHoraMinutoPtBr(new Date());
    const todayIso = obterDataHojeIsoPtBr();

    return (logs || [])
      .filter((log) => {
        if (!log || !log.date || !log.collaboratorName || !log.startTime) return false;
        const inRange = verificarDataNoPeriodo(log.date, effectiveStart, effectiveEnd);
        if (!inRange) return false;

        if (shiftFilter !== 'TODOS') {
          const itemShift = obterTurnoDoLog(log, collaborators);
          if (padronizarNomeTurno(itemShift) !== padronizarNomeTurno(shiftFilter)) {
            return false;
          }
        }
        return true;
      })
      .map((log) => {
        const isOngoing = log.status === 'Em Execução' || log.status === 'Pausada';
        const isAutoClosed = Boolean(log.autoClosed || log.autoClosedAtShiftEnd);
        const startMin = timeToMinutesOfDay(log.startTime);

        let endStr = log.endTime || '';
        let endMin = startMin;
        let durMin = typeof log.durationMinutes === 'number' && log.durationMinutes > 0 ? log.durationMinutes : 0;

        if (log.endTime) {
          endMin = timeToMinutesOfDay(log.endTime);
          if (endMin < startMin) endMin += 1440; // Cruza meia-noite (ex: Turno 2 até 01:30)
          if (durMin <= 0) {
            durMin = Math.max(1, calcularDiferencaMinutos(log.startTime, log.endTime));
          }
        } else if (isOngoing) {
          // Para barra visual na linha do tempo: usa hora atual se for hoje, senão start + 30m
          const parts = log.date.split('/');
          const logIso = parts.length === 3 ? `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}` : log.date;
          const refEndTime = logIso === todayIso ? nowTime : log.startTime;
          endMin = timeToMinutesOfDay(refEndTime);
          if (endMin < startMin) endMin += 1440;
          if (endMin <= startMin) endMin = startMin + 15;
          durMin = durMin > 0 ? durMin : Math.max(1, endMin - startMin);
          endStr = 'Em andamento';
        } else {
          endMin = startMin + Math.max(5, durMin);
          endStr = '-';
        }

        const colabObj = (collaborators || []).find(
          (c) => c.name.trim().toLowerCase() === log.collaboratorName.trim().toLowerCase()
        );

        const block: TimelineActivityBlock = {
          id: log.id,
          date: log.date,
          collaboratorName: log.collaboratorName.trim(),
          role: log.role || colabObj?.role || 'Operador',
          shift: obterTurnoDoLog(log, collaborators),
          activity: log.activity || 'Sem Atividade',
          startTime: log.startTime,
          endTime: endStr,
          startMinOfDay: startMin,
          endMinOfDay: endMin,
          durationMinutes: durMin,
          status: log.status,
          isOngoing,
          isAutoClosed,
          observation: log.observation || log.notes || log.initialDescription,
        };
        return block;
      });
  }, [logs, collaborators, effectiveStart, effectiveEnd, shiftFilter]);

  // Lista de colaboradores disponíveis para seleção no popover
  // Mostra primeiro todos que INICIARAM atividades no período, depois os demais cadastrados
  const availableColabOptions = useMemo(() => {
    const countMap = new Map<string, { name: string; role: string; shift: string; count: number; firstStart: string; lastEnd: string }>();

    periodAndShiftLogs.forEach((b) => {
      const key = b.collaboratorName.toLowerCase();
      const prev = countMap.get(key);
      if (!prev) {
        countMap.set(key, {
          name: b.collaboratorName,
          role: b.role,
          shift: b.shift,
          count: 1,
          firstStart: b.startTime,
          lastEnd: b.endTime,
        });
      } else {
        prev.count += 1;
        if (b.startTime < prev.firstStart) prev.firstStart = b.startTime;
        if (b.endTime === 'Em andamento' || (prev.lastEnd !== 'Em andamento' && b.endTime > prev.lastEnd)) {
          prev.lastEnd = b.endTime;
        }
      }
    });

    (collaborators || []).forEach((c) => {
      if (!c?.name) return;
      const key = c.name.trim().toLowerCase();
      if (!countMap.has(key)) {
        countMap.set(key, {
          name: c.name.trim(),
          role: c.role || 'Operador',
          shift: c.shift || 'Turno 1',
          count: 0,
          firstStart: '-',
          lastEnd: '-',
        });
      }
    });

    return Array.from(countMap.values()).sort((a, b) => {
      if (a.count > 0 && b.count === 0) return -1;
      if (a.count === 0 && b.count > 0) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [periodAndShiftLogs, collaborators]);

  const filteredColabOptions = useMemo(() => {
    const q = colabSearch.trim().toLowerCase();
    if (!q) return availableColabOptions;
    return availableColabOptions.filter(
      (c) => c.name.toLowerCase().includes(q) || c.role.toLowerCase().includes(q)
    );
  }, [availableColabOptions, colabSearch]);

  // Agrupamento final por colaborador que iniciou atividades (respeitando seleção do usuário)
  const summaries = useMemo<CollaboratorTimelineSummary[]>(() => {
    const selectedSet = new Set(selectedNames.map((n) => n.trim().toLowerCase()));
    const filteredBlocks =
      selectedSet.size === 0
        ? periodAndShiftLogs
        : periodAndShiftLogs.filter((b) => selectedSet.has(b.collaboratorName.toLowerCase()));

    const map = new Map<string, CollaboratorTimelineSummary>();
    filteredBlocks.forEach((b) => {
      const key = b.collaboratorName.toLowerCase();
      let entry = map.get(key);
      if (!entry) {
        entry = {
          collaboratorName: b.collaboratorName,
          role: b.role,
          shift: b.shift,
          firstStartTime: b.startTime,
          lastEndTime: b.endTime,
          activitiesCount: 0,
          totalMinutes: 0,
          blocks: [],
        };
        map.set(key, entry);
      }
      entry.activitiesCount += 1;
      entry.totalMinutes += b.durationMinutes;
      entry.blocks.push(b);
    });

    // Ordenar blocos de cada colaborador cronologicamente
    const list = Array.from(map.values()).map((col) => {
      col.blocks.sort((a, b) => {
        const dc = a.date.localeCompare(b.date);
        if (dc !== 0) return dc;
        return a.startTime.localeCompare(b.startTime);
      });
      const firstBlock = col.blocks[0];
      const lastBlock = col.blocks[col.blocks.length - 1];
      col.firstStartTime = firstBlock?.startTime || '-';
      col.lastEndTime = lastBlock?.endTime || '-';
      return col;
    });

    if (sortBy === 'INICIO') {
      list.sort((a, b) => a.firstStartTime.localeCompare(b.firstStartTime));
    } else if (sortBy === 'TEMPO') {
      list.sort((a, b) => b.totalMinutes - a.totalMinutes);
    } else {
      list.sort((a, b) => a.collaboratorName.localeCompare(b.collaboratorName));
    }

    return list;
  }, [periodAndShiftLogs, selectedNames, sortBy]);

  // Faixa de horário dinâmica para o gráfico de Linha do Tempo (Início -> Fim)
  const timelineRange = useMemo(() => {
    const allBlocks = summaries.flatMap((s) => s.blocks);
    if (allBlocks.length === 0) {
      return { minMinute: 7 * 60, maxMinute: 18 * 60 };
    }
    const rawMin = Math.min(...allBlocks.map((b) => b.startMinOfDay));
    const rawMax = Math.max(...allBlocks.map((b) => b.endMinOfDay));

    const minFloorHour = Math.max(0, Math.floor(rawMin / 60)) * 60;
    const maxCeilHour = Math.max(minFloorHour + 120, Math.ceil(rawMax / 60) * 60);
    return { minMinute: minFloorHour, maxMinute: maxCeilHour };
  }, [summaries]);

  const timelineTicks = useMemo(() => {
    const span = timelineRange.maxMinute - timelineRange.minMinute;
    const step = span <= 480 ? 60 : 120;
    const ticks: number[] = [];
    for (let m = timelineRange.minMinute; m <= timelineRange.maxMinute; m += step) {
      ticks.push(m);
    }
    return ticks;
  }, [timelineRange]);

  // Totais gerais do relatório
  const totals = useMemo(() => {
    const totalActivities = summaries.reduce((acc, s) => acc + s.activitiesCount, 0);
    const totalMinutes = summaries.reduce((acc, s) => acc + s.totalMinutes, 0);
    const maxColabMin = Math.max(1, ...summaries.map((s) => s.totalMinutes));

    let overallFirstStart = '-';
    let overallLastEnd = '-';
    if (summaries.length > 0) {
      const starts = summaries.map((s) => s.firstStartTime).filter((t) => t && t !== '-').sort();
      overallFirstStart = starts[0] ? starts[0].slice(0, 5) : '-';

      const hasOngoing = summaries.some((s) => s.lastEndTime === 'Em andamento');
      if (hasOngoing) {
        overallLastEnd = 'Em andamento';
      } else {
        const ends = summaries.map((s) => s.lastEndTime).filter((t) => t && t !== '-').sort();
        overallLastEnd = ends.length > 0 ? ends[ends.length - 1].slice(0, 5) : '-';
      }
    }

    return { totalActivities, totalMinutes, maxColabMin, overallFirstStart, overallLastEnd };
  }, [summaries]);

  const periodLabel = useMemo(() => {
    if (periodMode === 'DATA') {
      return formatIsoToPtBr(effectiveStart);
    }
    return `${formatIsoToPtBr(effectiveStart)} a ${formatIsoToPtBr(effectiveEnd)}`;
  }, [periodMode, effectiveStart, effectiveEnd]);

  const selectedCollaboratorsLabel = useMemo(() => {
    if (selectedNames.length === 0) return 'Todos que iniciaram';
    if (selectedNames.length === 1) return selectedNames[0];
    return `${selectedNames.length} colaboradores selecionados`;
  }, [selectedNames]);

  const showTimelineGraph =
    chartView === 'TIMELINE' ||
    chartView === 'AMBOS' ||
    (chartView === 'AUTO' && periodMode === 'DATA');

  const showBarsGraph =
    chartView === 'BARRAS' ||
    chartView === 'AMBOS' ||
    (chartView === 'AUTO' && periodMode === 'PERIODO');

  // Handlers de seleção de colaboradores
  const toggleColabName = (name: string) => {
    setSelectedNames((prev) => {
      const exists = prev.some((n) => n.toLowerCase() === name.toLowerCase());
      if (exists) {
        return prev.filter((n) => n.toLowerCase() !== name.toLowerCase());
      }
      return [...prev, name];
    });
  };

  // Handlers do formulário Ação do Líder
  const toggleActionClassification = (opt: string) => {
    setLeaderAction((prev) => {
      const exists = prev.classifications.includes(opt);
      return {
        ...prev,
        classifications: exists
          ? prev.classifications.filter((c) => c !== opt)
          : [...prev.classifications, opt],
      };
    });
  };

  const handlePrintSheet = () => {
    document.body.setAttribute('data-print-target', 'timeline-report');
    const cleanup = () => {
      document.body.removeAttribute('data-print-target');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => {
      window.print();
      setTimeout(cleanup, 1500);
    }, 50);
  };

  const handleDownloadPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      setPdfFeedback(null);
      const res = await generateAndSaveLeaderTimelinePdf({
        periodMode,
        periodLabel,
        selectedCollaboratorsLabel,
        shiftFilterLabel: shiftFilter === 'TODOS' ? 'Todos os Turnos' : shiftFilter,
        summaries,
        timelineRange,
        totalActivities: totals.totalActivities,
        totalMinutes: totals.totalMinutes,
        overallFirstStart: totals.overallFirstStart,
        overallLastEnd: totals.overallLastEnd,
        leaderAction,
      });
      if (res.success) {
        setPdfFeedback(
          res.method === 'picker'
            ? `PDF salvo com sucesso (${res.fileName})`
            : `PDF gerado e baixado (${res.fileName})`
        );
        setTimeout(() => setPdfFeedback(null), 5000);
      }
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (!isOpen) return null;

  const grayShadesBg = ['#18181B', '#3F3F46', '#71717A', '#A1A1AA'];

  return (
    <>
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-2 sm:p-4 print-hide-non-report">
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl max-w-6xl w-full max-h-[94vh] flex flex-col shadow-2xl">
          {/* ================================================================ */}
          {/* CABEÇALHO DO MODAL E CONTROLES DE FILTRO                         */}
          {/* ================================================================ */}
          <div className="p-3.5 sm:p-4 border-b border-zinc-800 bg-zinc-900/90 rounded-t-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-lg bg-zinc-800 text-zinc-200 border border-zinc-700 shrink-0">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-bold text-zinc-100 truncate">
                    Relatório de Gestão · Início e Fim de Atividades
                  </h2>
                  <p className="text-xs text-zinc-400 truncate">
                    Formulário clean em tons de cinza para impressão · Gráfico, horários e ação do líder
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isGeneratingPdf}
                  className="px-3.5 py-1.5 bg-zinc-100 hover:bg-white text-zinc-900 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isGeneratingPdf ? 'Gerando...' : 'Salvar PDF'}</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintSheet}
                  className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition cursor-pointer"
                  title="Fechar relatório"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* BARRA DE FILTROS COMPACTA */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end pt-1">
              {/* Modo: Data ou Período + Presets */}
              <div className="md:col-span-5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setPeriodMode('DATA')}
                      className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer whitespace-nowrap ${
                        periodMode === 'DATA'
                          ? 'bg-zinc-200 text-zinc-900'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Data Única
                    </button>
                    <button
                      type="button"
                      onClick={() => setPeriodMode('PERIODO')}
                      className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer whitespace-nowrap ${
                        periodMode === 'PERIODO'
                          ? 'bg-zinc-200 text-zinc-900'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Período
                    </button>
                  </div>

                  <div className="flex items-center gap-1 text-[11px]">
                    {(['HOJE', 'ONTEM', '7DIAS', 'MES'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => applyPreset(p)}
                        className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition cursor-pointer whitespace-nowrap"
                      >
                        {p === 'HOJE' ? 'Hoje' : p === 'ONTEM' ? 'Ontem' : p === '7DIAS' ? '7 Dias' : 'Mês'}
                      </button>
                    ))}
                  </div>
                </div>

                {periodMode === 'DATA' ? (
                  <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5">
                    <Calendar className="w-3.5 h-3.5 text-zinc-400 mr-2 shrink-0" />
                    <input
                      type="date"
                      value={singleDate}
                      onChange={(e) => setSingleDate(e.target.value)}
                      className="bg-transparent text-zinc-100 text-xs font-mono tabular-nums w-full outline-none cursor-pointer [color-scheme:dark]"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5">
                      <span className="text-[10px] text-zinc-500 mr-1.5 font-semibold">De</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="bg-transparent text-zinc-100 text-xs font-mono tabular-nums w-full outline-none cursor-pointer [color-scheme:dark]"
                      />
                    </div>
                    <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5">
                      <span className="text-[10px] text-zinc-500 mr-1.5 font-semibold">Até</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="bg-transparent text-zinc-100 text-xs font-mono tabular-nums w-full outline-none cursor-pointer [color-scheme:dark]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Seletor de Colaboradores (Todos ou quem eu escolher) */}
              <div className="md:col-span-4 relative" ref={colabDropdownRef}>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Colaboradores (Todos ou Específicos)
                </label>
                <button
                  type="button"
                  onClick={() => setColabDropdownOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between gap-2 bg-zinc-950 border border-zinc-800 hover:border-zinc-600 rounded-lg px-3 py-1.5 text-xs text-zinc-100 transition cursor-pointer"
                >
                  <span className="flex items-center gap-2 truncate">
                    <Users className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="truncate font-medium">
                      {selectedNames.length === 0
                        ? `Todos que iniciaram (${summaries.length})`
                        : selectedNames.length === 1
                        ? selectedNames[0]
                        : `${selectedNames.length} escolhido(s)`}
                    </span>
                  </span>
                  <span className="text-[10px] text-zinc-400 shrink-0">▼</span>
                </button>

                {colabDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-1.5 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-30 p-2 space-y-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={colabSearch}
                        onChange={(e) => setColabSearch(e.target.value)}
                        placeholder="Filtrar colaborador..."
                        className="w-full pl-8 pr-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 px-1 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setSelectedNames([])}
                        className={`font-semibold cursor-pointer hover:underline ${
                          selectedNames.length === 0 ? 'text-white' : 'text-zinc-400'
                        }`}
                      >
                        Todos que iniciaram
                      </button>
                      {selectedNames.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedNames([])}
                          className="text-zinc-400 hover:text-zinc-200 cursor-pointer flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Limpar</span>
                        </button>
                      )}
                    </div>

                    <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1 custom-scrollbar">
                      {filteredColabOptions.map((opt) => {
                        const isChecked = selectedNames.some(
                          (n) => n.toLowerCase() === opt.name.toLowerCase()
                        );
                        return (
                          <button
                            key={opt.name}
                            type="button"
                            onClick={() => toggleColabName(opt.name)}
                            className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition cursor-pointer ${
                              isChecked
                                ? 'bg-zinc-800 text-white font-semibold'
                                : 'text-zinc-300 hover:bg-zinc-800/60'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                  isChecked
                                    ? 'bg-zinc-200 border-zinc-200 text-zinc-900'
                                    : 'border-zinc-600'
                                }`}
                              >
                                {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                              </span>
                              <span className="truncate">{opt.name}</span>
                            </div>
                            <span className="text-[10px] font-mono tabular-nums text-zinc-400 shrink-0">
                              {opt.count > 0 ? `${opt.count}x` : '0x'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Turno e Visualização de Gráfico */}
              <div className="md:col-span-3 grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Turno</label>
                  <select
                    value={shiftFilter}
                    onChange={(e) => setShiftFilter(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-100 outline-none cursor-pointer"
                  >
                    <option value="TODOS">Todos</option>
                    <option value="Turno 1">Turno 1</option>
                    <option value="Turno 2">Turno 2</option>
                    <option value="Turno 3">Turno 3</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Ordenar</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'INICIO' | 'TEMPO' | 'NOME')}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-100 outline-none cursor-pointer"
                  >
                    <option value="INICIO">1º Início</option>
                    <option value="TEMPO">Maior Tempo</option>
                    <option value="NOME">Nome A–Z</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Sub-barra: Tipo de Gráfico + Feedback de PDF */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-zinc-400">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-medium text-zinc-500">Gráfico na folha:</span>
                {(['AUTO', 'TIMELINE', 'BARRAS', 'AMBOS'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setChartView(mode)}
                    className={`px-2 py-0.5 rounded font-medium transition cursor-pointer whitespace-nowrap ${
                      chartView === mode
                        ? 'bg-zinc-700 text-white'
                        : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                    }`}
                  >
                    {mode === 'AUTO'
                      ? 'Automático'
                      : mode === 'TIMELINE'
                      ? 'Linha do Tempo'
                      : mode === 'BARRAS'
                      ? 'Barras Comparativas'
                      : 'Ambos'}
                  </button>
                ))}
              </div>

              {pdfFeedback && (
                <span className="text-zinc-100 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-zinc-300" />
                  <span>{pdfFeedback}</span>
                </span>
              )}
            </div>
          </div>

          {/* ================================================================ */}
          {/* FOLHA CLEAN EM TONS DE CINZA (VISUALIZAÇÃO + FORMULÁRIO)          */}
          {/* ================================================================ */}
          <div className="p-3 sm:p-6 overflow-y-auto flex-1 bg-zinc-900/70 custom-scrollbar">
            <div className="max-w-4xl mx-auto bg-white text-zinc-900 p-6 sm:p-8 rounded-lg shadow-xl border border-zinc-300 space-y-6 font-sans">
              {/* 1. CABEÇALHO CORPORATIVO EM TONS DE CINZA */}
              <div className="border-b border-zinc-400 pb-4 flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    MCA Controle de Atividades · Gestão Operacional
                  </div>
                  <h1 className="text-lg sm:text-xl font-bold text-zinc-900 tracking-tight">
                    Relatório de Início e Fim de Atividades
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                    <span>
                      Período: <strong className="text-zinc-900 font-mono tabular-nums">{periodLabel}</strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Filtro: <strong className="text-zinc-900">{selectedCollaboratorsLabel}</strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Turno: <strong className="text-zinc-900">{shiftFilter === 'TODOS' ? 'Todos' : shiftFilter}</strong>
                    </span>
                  </div>
                </div>

                <div className="text-right text-xs border border-zinc-300 bg-zinc-50 px-3 py-2 rounded">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Emissão do Formulário
                  </div>
                  <div className="font-mono tabular-nums font-semibold text-zinc-900 mt-0.5">
                    {new Date().toLocaleDateString('pt-BR')} ·{' '}
                    {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>

              {/* 2. INDICADORES RESUMO (CINZA CLEAN, SEM PILLS) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 border border-zinc-300 divide-y sm:divide-y-0 sm:divide-x divide-zinc-300 bg-zinc-50">
                <div className="p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Iniciaram Atividades
                  </div>
                  <div className="text-lg font-bold text-zinc-900 font-mono tabular-nums mt-0.5">
                    {summaries.length}
                  </div>
                  <div className="text-[11px] text-zinc-600">colaborador(es)</div>
                </div>

                <div className="p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Total de Registros
                  </div>
                  <div className="text-lg font-bold text-zinc-900 font-mono tabular-nums mt-0.5">
                    {totals.totalActivities}
                  </div>
                  <div className="text-[11px] text-zinc-600">apontamento(s)</div>
                </div>

                <div className="p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Janela (Início → Fim)
                  </div>
                  <div className="text-base sm:text-lg font-bold text-zinc-900 font-mono tabular-nums mt-0.5">
                    {totals.overallFirstStart} – {totals.overallLastEnd === 'Em andamento' ? 'Ativo' : totals.overallLastEnd}
                  </div>
                  <div className="text-[11px] text-zinc-600">1º início ao último fim</div>
                </div>

                <div className="p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Carga Total Apontada
                  </div>
                  <div className="text-lg font-bold text-zinc-900 font-mono tabular-nums mt-0.5">
                    {formatarHorasMinutos(totals.totalMinutes)}
                  </div>
                  <div className="text-[11px] text-zinc-600 font-mono tabular-nums">
                    {totals.totalMinutes} min totais
                  </div>
                </div>
              </div>

              {/* 3. GRÁFICO EM TONS DE CINZA */}
              {summaries.length === 0 ? (
                <div className="border border-zinc-300 bg-zinc-50 p-8 text-center space-y-1.5">
                  <Clock className="w-6 h-6 text-zinc-400 mx-auto" />
                  <p className="text-sm font-semibold text-zinc-800">
                    Nenhuma atividade iniciada encontrada para este filtro.
                  </p>
                  <p className="text-xs text-zinc-500">
                    Ajuste a data, o período ou a seleção de colaboradores no topo para visualizar o gráfico e a tabela.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* 3A. GRÁFICO LINHA DO TEMPO HORÁRIA (INÍCIO → FIM) */}
                  {showTimelineGraph && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                          Gráfico Linha do Tempo (Início → Fim por Colaborador)
                        </h3>
                        <div className="flex items-center gap-3 text-[11px] text-zinc-600">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-3 h-2.5 inline-block bg-zinc-800 border border-zinc-900" />
                            <span>Concluída</span>
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-3 h-2.5 inline-block bg-zinc-300 border border-dashed border-zinc-800" />
                            <span>Em andamento</span>
                          </span>
                        </div>
                      </div>

                      <div className="border border-zinc-300 bg-white overflow-x-auto">
                        <div className="min-w-[600px]">
                          {/* Eixo de Horas */}
                          <div className="grid grid-cols-[150px_1fr_115px] border-b border-zinc-300 bg-zinc-100 text-[10px] font-mono tabular-nums text-zinc-600">
                            <div className="px-2.5 py-1.5 font-bold text-zinc-700 border-r border-zinc-300">
                              Colaborador
                            </div>
                            <div className="relative h-6">
                              {timelineTicks.map((tick) => {
                                const span = Math.max(60, timelineRange.maxMinute - timelineRange.minMinute);
                                const pct = ((tick - timelineRange.minMinute) / span) * 100;
                                return (
                                  <span
                                    key={tick}
                                    style={{ left: `${pct}%` }}
                                    className="absolute top-1 -translate-x-1/2 whitespace-nowrap"
                                  >
                                    {formatMinTick(tick)}
                                  </span>
                                );
                              })}
                            </div>
                            <div className="px-2.5 py-1.5 font-bold text-zinc-700 text-right border-l border-zinc-300">
                              Início–Fim · Total
                            </div>
                          </div>

                          {/* Linhas por Colaborador */}
                          <div className="divide-y divide-zinc-200">
                            {summaries.map((col, idx) => {
                              const span = Math.max(60, timelineRange.maxMinute - timelineRange.minMinute);
                              return (
                                <div
                                  key={col.collaboratorName}
                                  className={`grid grid-cols-[150px_1fr_115px] items-center ${
                                    idx % 2 === 1 ? 'bg-zinc-50/80' : 'bg-white'
                                  }`}
                                >
                                  <div className="px-2.5 py-2 border-r border-zinc-200 min-w-0">
                                    <div className="text-xs font-bold text-zinc-900 truncate" title={col.collaboratorName}>
                                      {col.collaboratorName}
                                    </div>
                                    <div className="text-[10px] text-zinc-500 truncate">
                                      {col.role} · {col.activitiesCount}x
                                    </div>
                                  </div>

                                  <div className="relative h-9 mx-1">
                                    {/* Linhas de grade verticais */}
                                    {timelineTicks.map((tick) => {
                                      const pct = ((tick - timelineRange.minMinute) / span) * 100;
                                      return (
                                        <div
                                          key={tick}
                                          style={{ left: `${pct}%` }}
                                          className="absolute top-0 bottom-0 border-l border-zinc-200 pointer-events-none"
                                        />
                                      );
                                    })}

                                    {/* Trilho base */}
                                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-4 bg-zinc-100 border border-zinc-200" />

                                    {/* Blocos de atividades (Início -> Fim) */}
                                    {col.blocks.map((blk, bIdx) => {
                                      const leftPct = Math.max(
                                        0,
                                        ((blk.startMinOfDay - timelineRange.minMinute) / span) * 100
                                      );
                                      const rightPct = Math.min(
                                        100,
                                        ((Math.max(blk.startMinOfDay + 5, blk.endMinOfDay) - timelineRange.minMinute) / span) * 100
                                      );
                                      const widthPct = Math.max(1.2, rightPct - leftPct);
                                      const bgTone = grayShadesBg[bIdx % grayShadesBg.length];

                                      return (
                                        <div
                                          key={blk.id}
                                          style={{
                                            left: `${leftPct}%`,
                                            width: `${widthPct}%`,
                                            backgroundColor: blk.isOngoing ? '#D4D4D8' : bgTone,
                                          }}
                                          title={`${blk.activity} | Início: ${blk.startTime} | Fim: ${blk.endTime} (${blk.durationMinutes} min)`}
                                          className={`absolute top-1/2 -translate-y-1/2 h-4 border ${
                                            blk.isOngoing
                                              ? 'border-dashed border-zinc-900 text-zinc-900'
                                              : 'border-zinc-900 text-white'
                                          } flex items-center justify-center overflow-hidden`}
                                        >
                                          {widthPct > 8 && (
                                            <span className="text-[9px] font-mono font-semibold px-1 truncate">
                                              {blk.startTime.slice(0, 5)}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>

                                  <div className="px-2.5 py-2 border-l border-zinc-200 text-right font-mono tabular-nums">
                                    <div className="text-[11px] font-bold text-zinc-900">
                                      {col.firstStartTime.slice(0, 5)}–{col.lastEndTime === 'Em andamento' ? 'Ativo' : col.lastEndTime.slice(0, 5)}
                                    </div>
                                    <div className="text-[10px] text-zinc-600">
                                      {formatarHorasMinutos(col.totalMinutes)}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3B. GRÁFICO DE BARRAS HORIZONTAIS EM TONS DE CINZA */}
                  {showBarsGraph && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                        Gráfico Comparativo de Tempo Apontado (Tons de Cinza)
                      </h3>

                      <div className="border border-zinc-300 bg-white divide-y divide-zinc-200">
                        {summaries.map((col, idx) => {
                          const pct = Math.max(2, Math.round((col.totalMinutes / totals.maxColabMin) * 100));
                          const shadeClass = idx % 2 === 0 ? 'bg-zinc-800' : 'bg-zinc-600';
                          return (
                            <div
                              key={col.collaboratorName}
                              className="grid grid-cols-1 sm:grid-cols-[160px_1fr_185px] items-center gap-2 px-3 py-2"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-zinc-900 truncate">{col.collaboratorName}</div>
                                <div className="text-[10px] text-zinc-500 truncate">{col.role}</div>
                              </div>

                              <div className="w-full h-4 bg-zinc-100 border border-zinc-200 overflow-hidden">
                                <div
                                  style={{ width: `${pct}%` }}
                                  className={`h-full ${shadeClass}`}
                                />
                              </div>

                              <div className="text-right text-[11px] font-mono tabular-nums text-zinc-800">
                                <strong className="text-zinc-900">{formatarHorasMinutos(col.totalMinutes)}</strong>
                                {' · '}
                                <span>{col.activitiesCount}x</span>
                                {' · '}
                                <span className="text-zinc-600">
                                  {col.firstStartTime.slice(0, 5)}–{col.lastEndTime === 'Em andamento' ? 'Ativo' : col.lastEndTime.slice(0, 5)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 4. TABELA DETALHADA DE INÍCIO E FIM DAS ATIVIDADES */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                        Registros de Atividades Iniciadas (Início e Fim)
                      </h3>
                      <span className="text-[11px] font-mono tabular-nums text-zinc-500">
                        {totals.totalActivities} registro(s)
                      </span>
                    </div>

                    <div className="overflow-x-auto border border-zinc-300">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-zinc-200 border-b border-zinc-400 text-zinc-900 font-bold">
                            <th className="py-2 px-2.5 border-r border-zinc-300">Colaborador</th>
                            <th className="py-2 px-2 border-r border-zinc-300 text-center">Data</th>
                            <th className="py-2 px-2.5 border-r border-zinc-300">Atividade</th>
                            <th className="py-2 px-2 border-r border-zinc-300 text-center">Início</th>
                            <th className="py-2 px-2 border-r border-zinc-300 text-center">Fim</th>
                            <th className="py-2 px-2 border-r border-zinc-300 text-right">Duração</th>
                            <th className="py-2 px-2 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200">
                          {summaries.flatMap((col) =>
                            col.blocks.map((blk, bIdx) => (
                              <tr key={blk.id} className={bIdx % 2 === 1 ? 'bg-zinc-50' : 'bg-white'}>
                                <td className="py-1.5 px-2.5 border-r border-zinc-200 font-semibold text-zinc-900 whitespace-nowrap">
                                  {col.collaboratorName}
                                </td>
                                <td className="py-1.5 px-2 border-r border-zinc-200 text-center font-mono tabular-nums text-zinc-700 whitespace-nowrap">
                                  {blk.date}
                                </td>
                                <td className="py-1.5 px-2.5 border-r border-zinc-200 text-zinc-900">
                                  <div className="font-medium">{blk.activity}</div>
                                  {blk.observation && (
                                    <div className="text-[10px] text-zinc-500 truncate max-w-[260px]">
                                      Obs: {blk.observation}
                                    </div>
                                  )}
                                </td>
                                <td className="py-1.5 px-2 border-r border-zinc-200 text-center font-mono tabular-nums font-semibold text-zinc-900 whitespace-nowrap">
                                  {blk.startTime.slice(0, 8)}
                                </td>
                                <td className="py-1.5 px-2 border-r border-zinc-200 text-center font-mono tabular-nums text-zinc-800 whitespace-nowrap">
                                  {blk.endTime === 'Em andamento' ? 'Em andamento' : blk.endTime.slice(0, 8)}
                                </td>
                                <td className="py-1.5 px-2 border-r border-zinc-200 text-right font-mono tabular-nums font-bold text-zinc-900 whitespace-nowrap">
                                  {blk.durationMinutes > 0 ? `${blk.durationMinutes} min` : blk.isOngoing ? 'Ativo' : '-'}
                                </td>
                                <td className="py-1.5 px-2 text-center text-[11px] text-zinc-700 whitespace-nowrap">
                                  {blk.isAutoClosed ? 'Auto-Fim' : blk.status}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* 5. CAMPO PARA AÇÃO DO LÍDER (FORMULÁRIO CLEAN DE GESTÃO) */}
              <div className="border border-zinc-400 bg-zinc-50 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-300 pb-2">
                  <div className="flex items-center gap-2">
                    <AlignLeft className="w-4 h-4 text-zinc-700" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
                      Ação do Líder / Encaminhamento de Gestão
                    </h3>
                  </div>
                  <span className="text-[10px] text-zinc-500">
                    Preencha aqui antes de gerar o PDF ou imprima em branco para anotação manual
                  </span>
                </div>

                {/* Checkboxes discretas de classificação */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-800">
                  {LEADER_ACTION_OPTIONS.map((opt) => {
                    const checked = leaderAction.classifications.includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => toggleActionClassification(opt)}
                        className="inline-flex items-center gap-1.5 cursor-pointer hover:text-black transition"
                      >
                        <span
                          className={`w-3.5 h-3.5 border flex items-center justify-center text-[9px] font-bold ${
                            checked
                              ? 'bg-zinc-900 border-zinc-900 text-white'
                              : 'bg-white border-zinc-500 text-transparent'
                          }`}
                        >
                          ✓
                        </span>
                        <span className={checked ? 'font-bold text-zinc-900' : 'text-zinc-700'}>{opt}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Campo de texto editável para a ação do líder */}
                <div>
                  <textarea
                    rows={3}
                    value={leaderAction.actionText}
                    onChange={(e) => setLeaderAction((prev) => ({ ...prev, actionText: e.target.value }))}
                    placeholder="Descreva a ação do líder, tratativa, alinhamento com o colaborador ou plano de ação (se deixar em branco, o relatório impresso/PDF gera linhas pautadas para escrita manual)..."
                    className="w-full bg-white border border-zinc-300 focus:border-zinc-700 rounded p-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 outline-none resize-y leading-relaxed"
                  />
                </div>

                {/* Campos compactos de Responsável, Prazo e Assinatura */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 items-end">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-zinc-600 mb-1">
                      Responsável
                    </label>
                    <input
                      type="text"
                      value={leaderAction.responsible}
                      onChange={(e) => setLeaderAction((prev) => ({ ...prev, responsible: e.target.value }))}
                      placeholder="Nome do líder / responsável"
                      className="w-full bg-white border border-zinc-300 focus:border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-900 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-zinc-600 mb-1">
                      Prazo / Revisão
                    </label>
                    <input
                      type="text"
                      value={leaderAction.deadline}
                      onChange={(e) => setLeaderAction((prev) => ({ ...prev, deadline: e.target.value }))}
                      placeholder="Ex: ____/____/______"
                      className="w-full bg-white border border-zinc-300 focus:border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-900 font-mono outline-none"
                    />
                  </div>

                  <div className="text-center pt-2">
                    <div className="border-b border-zinc-700 pb-1 mb-1">&nbsp;</div>
                    <div className="text-[10px] font-bold uppercase text-zinc-800">
                      Visto / Assinatura do Líder
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* ÁREA DEDICADA EXCLUSIVAMENTE À IMPRESSÃO NATIVA (window.print())     */}
      {/* ==================================================================== */}
      <div id="mca-timeline-printable-report" className="hidden bg-white text-zinc-900 p-6 font-sans text-xs">
        <div className="border-b border-zinc-800 pb-3 mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-600 font-semibold">
              MCA Controle de Atividades · Gestão Operacional
            </div>
            <h1 className="text-lg font-bold text-zinc-900 mt-0.5">
              Relatório de Início e Fim de Atividades
            </h1>
            <div className="text-[11px] text-zinc-700 mt-0.5">
              Período: <strong>{periodLabel}</strong> · Filtro: <strong>{selectedCollaboratorsLabel}</strong> · Turno:{' '}
              <strong>{shiftFilter === 'TODOS' ? 'Todos' : shiftFilter}</strong>
            </div>
          </div>
          <div className="text-right border border-zinc-400 px-2.5 py-1.5 bg-zinc-100">
            <div className="text-[9px] font-bold uppercase text-zinc-600">Emissão</div>
            <div className="font-mono tabular-nums text-[10px] text-zinc-900">
              {new Date().toLocaleDateString('pt-BR')} ·{' '}
              {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>

        {/* Faixa de Resumo */}
        <div className="grid grid-cols-4 border border-zinc-400 divide-x divide-zinc-400 bg-zinc-50 mb-4">
          <div className="p-2">
            <div className="text-[9px] font-bold uppercase text-zinc-600">Iniciaram Atividades</div>
            <div className="text-sm font-bold font-mono tabular-nums text-zinc-900">{summaries.length} colab.</div>
          </div>
          <div className="p-2">
            <div className="text-[9px] font-bold uppercase text-zinc-600">Registros</div>
            <div className="text-sm font-bold font-mono tabular-nums text-zinc-900">{totals.totalActivities} apont.</div>
          </div>
          <div className="p-2">
            <div className="text-[9px] font-bold uppercase text-zinc-600">Janela Início → Fim</div>
            <div className="text-sm font-bold font-mono tabular-nums text-zinc-900">
              {totals.overallFirstStart} – {totals.overallLastEnd === 'Em andamento' ? 'Ativo' : totals.overallLastEnd}
            </div>
          </div>
          <div className="p-2">
            <div className="text-[9px] font-bold uppercase text-zinc-600">Tempo Total</div>
            <div className="text-sm font-bold font-mono tabular-nums text-zinc-900">
              {formatarHorasMinutos(totals.totalMinutes)}
            </div>
          </div>
        </div>

        {/* Gráfico Linha do Tempo na Impressão */}
        {summaries.length > 0 && showTimelineGraph && (
          <div className="mb-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-800 mb-1">
              Gráfico Linha do Tempo (Início → Fim por Colaborador)
            </div>
            <div className="border border-zinc-400">
              <div className="grid grid-cols-[135px_1fr_105px] border-b border-zinc-400 bg-zinc-100 text-[9px] font-mono tabular-nums text-zinc-700">
                <div className="px-2 py-1 font-bold border-r border-zinc-300">Colaborador</div>
                <div className="relative h-5">
                  {timelineTicks.map((tick) => {
                    const span = Math.max(60, timelineRange.maxMinute - timelineRange.minMinute);
                    const pct = ((tick - timelineRange.minMinute) / span) * 100;
                    return (
                      <span key={tick} style={{ left: `${pct}%` }} className="absolute top-1 -translate-x-1/2">
                        {formatMinTick(tick)}
                      </span>
                    );
                  })}
                </div>
                <div className="px-2 py-1 font-bold text-right border-l border-zinc-300">Início–Fim</div>
              </div>
              <div className="divide-y divide-zinc-200">
                {summaries.map((col, idx) => {
                  const span = Math.max(60, timelineRange.maxMinute - timelineRange.minMinute);
                  return (
                    <div
                      key={col.collaboratorName}
                      className={`grid grid-cols-[135px_1fr_105px] items-center ${idx % 2 === 1 ? 'bg-zinc-50' : 'bg-white'}`}
                    >
                      <div className="px-2 py-1.5 border-r border-zinc-200 text-[10px] font-bold truncate">
                        {col.collaboratorName}
                      </div>
                      <div className="relative h-6 mx-1">
                        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-3 bg-zinc-100 border border-zinc-200" />
                        {col.blocks.map((blk, bIdx) => {
                          const leftPct = Math.max(0, ((blk.startMinOfDay - timelineRange.minMinute) / span) * 100);
                          const rightPct = Math.min(
                            100,
                            ((Math.max(blk.startMinOfDay + 5, blk.endMinOfDay) - timelineRange.minMinute) / span) * 100
                          );
                          const widthPct = Math.max(1.2, rightPct - leftPct);
                          return (
                            <div
                              key={blk.id}
                              style={{
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                                backgroundColor: blk.isOngoing ? '#D4D4D8' : grayShadesBg[bIdx % grayShadesBg.length],
                              }}
                              className="absolute top-1/2 -translate-y-1/2 h-3 border border-zinc-900"
                            />
                          );
                        })}
                      </div>
                      <div className="px-2 py-1.5 border-l border-zinc-200 text-right font-mono tabular-nums text-[9.5px]">
                        {col.firstStartTime.slice(0, 5)}–{col.lastEndTime === 'Em andamento' ? 'Ativo' : col.lastEndTime.slice(0, 5)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Gráfico Barras na Impressão */}
        {summaries.length > 0 && showBarsGraph && (
          <div className="mb-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-800 mb-1">
              Gráfico Comparativo de Tempo Apontado (Tons de Cinza)
            </div>
            <div className="border border-zinc-400 divide-y divide-zinc-200">
              {summaries.map((col, idx) => {
                const pct = Math.max(2, Math.round((col.totalMinutes / totals.maxColabMin) * 100));
                return (
                  <div key={col.collaboratorName} className="grid grid-cols-[140px_1fr_160px] items-center gap-2 px-2.5 py-1.5">
                    <div className="text-[10px] font-bold truncate">{col.collaboratorName}</div>
                    <div className="w-full h-3 bg-zinc-100 border border-zinc-300">
                      <div style={{ width: `${pct}%` }} className={`h-full ${idx % 2 === 0 ? 'bg-zinc-800' : 'bg-zinc-600'}`} />
                    </div>
                    <div className="text-right text-[10px] font-mono tabular-nums">
                      {formatarHorasMinutos(col.totalMinutes)} ({col.activitiesCount}x) · {col.firstStartTime.slice(0, 5)}–
                      {col.lastEndTime === 'Em andamento' ? 'Ativo' : col.lastEndTime.slice(0, 5)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tabela Detalhada na Impressão */}
        {summaries.length > 0 && (
          <div className="mb-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-800 mb-1">
              Detalhamento de Início e Fim
            </div>
            <table className="w-full text-[10px] border border-zinc-400 border-collapse">
              <thead>
                <tr className="bg-zinc-200 border-b border-zinc-400 font-bold text-left">
                  <th className="p-1.5 border-r border-zinc-300">Colaborador</th>
                  <th className="p-1.5 border-r border-zinc-300 text-center">Data</th>
                  <th className="p-1.5 border-r border-zinc-300">Atividade</th>
                  <th className="p-1.5 border-r border-zinc-300 text-center">Início</th>
                  <th className="p-1.5 border-r border-zinc-300 text-center">Fim</th>
                  <th className="p-1.5 border-r border-zinc-300 text-right">Duração</th>
                  <th className="p-1.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {summaries.flatMap((col) =>
                  col.blocks.map((blk, bIdx) => (
                    <tr key={blk.id} className={`border-b border-zinc-200 ${bIdx % 2 === 1 ? 'bg-zinc-50' : 'bg-white'}`}>
                      <td className="p-1.5 border-r border-zinc-200 font-bold">{col.collaboratorName}</td>
                      <td className="p-1.5 border-r border-zinc-200 text-center font-mono tabular-nums">{blk.date}</td>
                      <td className="p-1.5 border-r border-zinc-200">{blk.activity}</td>
                      <td className="p-1.5 border-r border-zinc-200 text-center font-mono tabular-nums font-bold">
                        {blk.startTime.slice(0, 8)}
                      </td>
                      <td className="p-1.5 border-r border-zinc-200 text-center font-mono tabular-nums">
                        {blk.endTime === 'Em andamento' ? 'Em andamento' : blk.endTime.slice(0, 8)}
                      </td>
                      <td className="p-1.5 border-r border-zinc-200 text-right font-mono tabular-nums font-bold">
                        {blk.durationMinutes > 0 ? `${blk.durationMinutes} min` : blk.isOngoing ? 'Ativo' : '-'}
                      </td>
                      <td className="p-1.5 text-center">{blk.isAutoClosed ? 'Auto-Fim' : blk.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Campo para Ação do Líder na Impressão */}
        <div className="border border-zinc-700 bg-zinc-50 p-3 space-y-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-900 border-b border-zinc-300 pb-1">
            Ação do Líder / Encaminhamento de Gestão
          </div>
          <div className="flex flex-wrap gap-3 text-[10px] text-zinc-800">
            {LEADER_ACTION_OPTIONS.map((opt) => (
              <span key={opt} className="font-medium">
                {leaderAction.classifications.includes(opt) ? '[ X ]' : '[   ]'} {opt}
              </span>
            ))}
          </div>
          {leaderAction.actionText.trim() ? (
            <div className="bg-white border border-zinc-300 p-2 text-[11px] text-zinc-900 whitespace-pre-wrap leading-relaxed min-h-[54px]">
              {leaderAction.actionText}
            </div>
          ) : (
            <div className="space-y-4 pt-2 pb-1">
              <div className="border-b border-zinc-400" />
              <div className="border-b border-zinc-400" />
              <div className="border-b border-zinc-400" />
              <div className="border-b border-zinc-400" />
            </div>
          )}
          <div className="grid grid-cols-3 gap-4 pt-2 items-end text-[10px]">
            <div>
              <strong>Responsável:</strong> {leaderAction.responsible || '_____________________'}
            </div>
            <div>
              <strong>Prazo:</strong> {leaderAction.deadline || '____/____/______'}
            </div>
            <div className="text-center">
              <div className="border-b border-zinc-700 mb-0.5">&nbsp;</div>
              <div className="font-bold uppercase text-[9px]">Visto / Assinatura do Líder</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default LeaderTimelineReportModal;
