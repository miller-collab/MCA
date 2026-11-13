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
  calcularGapsJornadaColaboradores,
  converterDataPtParaIso,
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

/**
 * Combina initialDescription, observation e notes sem duplicar textos repetidos,
 * garantindo que todas as observações apareçam na tela, impressão e PDF.
 */
function buildCombinedObservation(log: ProductionLog): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  [log.initialDescription, log.observation, log.notes].forEach((val) => {
    const clean = (val || '').trim();
    if (!clean) return;
    const norm = clean.toLowerCase();
    if (!seen.has(norm)) {
      seen.add(norm);
      parts.push(clean);
    }
  });
  return parts.join(' · ');
}

function resolveShiftWindowForColab(
  shiftName: string,
  shifts: ShiftConfig[]
): { entrada: string; saida: string; isOvernight: boolean } {
  const foundShift =
    (shifts || []).find(
      (s) =>
        padronizarNomeTurno(s.name) === padronizarNomeTurno(shiftName) ||
        padronizarNomeTurno(s.code) === padronizarNomeTurno(shiftName) ||
        s.name.toUpperCase().includes(shiftName.toUpperCase())
    ) ||
    shifts?.[0] || { entrada: '07:00', saida: '17:30' };

  const entrada = foundShift.entrada || '07:00';
  const saida = foundShift.saida || '17:30';
  const isOvernight = timeToMinutesOfDay(entrada) > timeToMinutesOfDay(saida);
  return { entrada, saida, isOvernight };
}

function toShiftAwareMinute(
  timeStr: string,
  shiftEntrada: string,
  isOvernight: boolean
): number {
  const raw = timeToMinutesOfDay(timeStr);
  const entMin = timeToMinutesOfDay(shiftEntrada);
  if (isOvernight && raw < entMin) {
    return raw + 1440;
  }
  return raw;
}

export const LeaderTimelineReportModal: React.FC<LeaderTimelineReportModalProps> = ({
  isOpen,
  onClose,
  logs,
  collaborators,
  shifts,
}) => {
  // 1. Filtros de Data / Período
  const [periodMode, setPeriodMode] = useState<'DATA' | 'PERIODO'>('DATA');
  const [singleDate, setSingleDate] = useState<string>(() => obterDataHojeIsoPtBr());
  const [startDate, setStartDate] = useState<string>(() => obterDataHojeIsoPtBr());
  const [endDate, setEndDate] = useState<string>(() => obterDataHojeIsoPtBr());

  // 2. Filtro de Turno, Ordenação & Auditoria de Turno Inteiro
  const [shiftFilter, setShiftFilter] = useState<string>('TODOS');
  const [sortBy, setSortBy] = useState<'INICIO' | 'TEMPO' | 'SEM_APONTAR' | 'NOME'>('INICIO');
  const [chartView, setChartView] = useState<'AUTO' | 'TIMELINE' | 'BARRAS' | 'AMBOS'>('AUTO');
  const [includeShiftGaps, setIncludeShiftGaps] = useState<boolean>(true);

  // 3. Seletor de Colaboradores ("todos ou de quem eu escolher")
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [colabDropdownOpen, setColabDropdownOpen] = useState(false);
  const [colabSearch, setColabSearch] = useState('');
  const colabDropdownRef = useRef<HTMLDivElement>(null);

  // 4. Formulário: Campo para Ação do Líder (persistido por chave de data/período)
  const effectiveStart = periodMode === 'DATA' ? singleDate : startDate || singleDate;
  const effectiveEnd = periodMode === 'DATA' ? singleDate : endDate || startDate || singleDate;
  const draftStorageKey = `mca_leader_action_draft_${effectiveStart}_${effectiveEnd}`;

  const [leaderAction, setLeaderAction] = useState<LeaderActionFormState>({
    classifications: [],
    actionText: '',
    responsible: '',
    deadline: '',
  });

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

  useEffect(() => {
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify(leaderAction));
    } catch {
      // ignore storage errors
    }
  }, [draftStorageKey, leaderAction]);

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfFeedback, setPdfFeedback] = useState<string | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (colabDropdownRef.current && !colabDropdownRef.current.contains(e.target as Node)) {
        setColabDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

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

  // Logs brutos no intervalo e turno selecionados
  const rawPeriodAndShiftLogs = useMemo(() => {
    return (logs || []).filter((log) => {
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
    });
  }, [logs, collaborators, effectiveStart, effectiveEnd, shiftFilter]);

  // Converte logs de atividades e lacunas ("Sem Apontamento" do turno inteiro) em blocos unificados
  const periodAndShiftBlocks = useMemo<TimelineActivityBlock[]>(() => {
    const nowTime = obterHoraMinutoPtBr(new Date());
    const todayIso = obterDataHojeIsoPtBr();
    const result: TimelineActivityBlock[] = [];

    // 1. Blocos de atividades reais apontadas
    rawPeriodAndShiftLogs.forEach((log) => {
      const isOngoing = log.status === 'Em Execução' || log.status === 'Pausada';
      const isAutoClosed = Boolean(log.autoClosed || log.autoClosedAtShiftEnd);
      const shiftName = obterTurnoDoLog(log, collaborators);
      const { entrada, isOvernight } = resolveShiftWindowForColab(shiftName, shifts);

      const startMin = toShiftAwareMinute(log.startTime, entrada, isOvernight);
      let endStr = log.endTime || '';
      let endMin = startMin;
      let durMin =
        typeof log.durationMinutes === 'number' && log.durationMinutes > 0
          ? log.durationMinutes
          : 0;

      if (log.endTime) {
        endMin = toShiftAwareMinute(log.endTime, entrada, isOvernight);
        if (endMin < startMin) endMin += 1440;
        if (durMin <= 0) {
          durMin = Math.max(1, calcularDiferencaMinutos(log.startTime, log.endTime));
        }
      } else if (isOngoing) {
        const logIso = converterDataPtParaIso(log.date);
        const refEndTime = logIso === todayIso ? nowTime : log.startTime;
        endMin = toShiftAwareMinute(refEndTime, entrada, isOvernight);
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

      result.push({
        id: log.id,
        date: log.date,
        collaboratorName: log.collaboratorName.trim(),
        role: log.role || colabObj?.role || 'Operador',
        shift: shiftName,
        activity: log.activity || 'Sem Atividade',
        startTime: log.startTime,
        endTime: endStr,
        startMinOfDay: startMin,
        endMinOfDay: endMin,
        durationMinutes: durMin,
        status: log.status,
        isOngoing,
        isAutoClosed,
        isGap: false,
        observation: buildCombinedObservation(log),
      });
    });

    // 2. Regra de Turno Inteiro: Se o colaborador abriu ao menos 1 atividade naquela data,
    // contabiliza TODO o turno e lista qualquer período em que ele deixou de apontar (>= 1 min).
    if (includeShiftGaps && rawPeriodAndShiftLogs.length > 0) {
      const shiftGaps = calcularGapsJornadaColaboradores(
        rawPeriodAndShiftLogs,
        collaborators,
        shifts,
        undefined,
        new Date()
      );

      shiftGaps.forEach((gap) => {
        if (!verificarDataNoPeriodo(gap.date, effectiveStart, effectiveEnd)) return;
        const { entrada, isOvernight } = resolveShiftWindowForColab(gap.shift, shifts);
        const startMin = toShiftAwareMinute(gap.startTime, entrada, isOvernight);
        let endMin = toShiftAwareMinute(gap.endTime, entrada, isOvernight);
        if (endMin < startMin) endMin += 1440;

        result.push({
          id: gap.id,
          date: gap.date,
          collaboratorName: gap.collaboratorName.trim(),
          role: gap.role || 'Operador',
          shift: padronizarNomeTurno(gap.shift),
          activity: gap.activity.replace(/^⚠️\s*/, '').trim(),
          startTime: gap.startTime,
          endTime: gap.endTime,
          startMinOfDay: startMin,
          endMinOfDay: endMin,
          durationMinutes: gap.durationMinutes,
          status: 'Sem Apontamento',
          isOngoing: false,
          isAutoClosed: false,
          isGap: true,
          observation: gap.observation,
        });
      });
    }

    return result;
  }, [
    rawPeriodAndShiftLogs,
    collaborators,
    shifts,
    includeShiftGaps,
    effectiveStart,
    effectiveEnd,
  ]);

  // Lista de colaboradores para o popover seletor
  const availableColabOptions = useMemo(() => {
    const countMap = new Map<
      string,
      { name: string; role: string; shift: string; count: number; gapMins: number }
    >();

    periodAndShiftBlocks.forEach((b) => {
      const key = b.collaboratorName.toLowerCase();
      const prev = countMap.get(key) || {
        name: b.collaboratorName,
        role: b.role,
        shift: b.shift,
        count: 0,
        gapMins: 0,
      };
      if (b.isGap) {
        prev.gapMins += b.durationMinutes;
      } else {
        prev.count += 1;
      }
      countMap.set(key, prev);
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
          gapMins: 0,
        });
      }
    });

    return Array.from(countMap.values()).sort((a, b) => {
      if (a.count > 0 && b.count === 0) return -1;
      if (a.count === 0 && b.count > 0) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [periodAndShiftBlocks, collaborators]);

  const filteredColabOptions = useMemo(() => {
    const q = colabSearch.trim().toLowerCase();
    if (!q) return availableColabOptions;
    return availableColabOptions.filter(
      (c) => c.name.toLowerCase().includes(q) || c.role.toLowerCase().includes(q)
    );
  }, [availableColabOptions, colabSearch]);

  // Agrupamento final por colaborador que iniciou atividades
  const summaries = useMemo<CollaboratorTimelineSummary[]>(() => {
    const selectedSet = new Set(selectedNames.map((n) => n.trim().toLowerCase()));
    const filteredBlocks =
      selectedSet.size === 0
        ? periodAndShiftBlocks
        : periodAndShiftBlocks.filter((b) => selectedSet.has(b.collaboratorName.toLowerCase()));

    const map = new Map<string, CollaboratorTimelineSummary>();
    filteredBlocks.forEach((b) => {
      const key = b.collaboratorName.toLowerCase();
      let entry = map.get(key);
      if (!entry) {
        const { entrada, saida } = resolveShiftWindowForColab(b.shift, shifts);
        entry = {
          collaboratorName: b.collaboratorName,
          role: b.role,
          shift: b.shift,
          shiftWindow: `${entrada}–${saida}`,
          firstStartTime: b.startTime,
          lastEndTime: b.endTime,
          activitiesCount: 0,
          gapsCount: 0,
          totalMinutes: 0,
          totalGapMinutes: 0,
          blocks: [],
        };
        map.set(key, entry);
      }
      if (b.isGap) {
        entry.gapsCount += 1;
        entry.totalGapMinutes += b.durationMinutes;
      } else {
        entry.activitiesCount += 1;
        entry.totalMinutes += b.durationMinutes;
      }
      entry.blocks.push(b);
    });

    const list = Array.from(map.values())
      .filter((col) => col.activitiesCount > 0) // Só traz quem de fato iniciou atividade
      .map((col) => {
        col.blocks.sort((a, b) => {
          const isoA = converterDataPtParaIso(a.date);
          const isoB = converterDataPtParaIso(b.date);
          if (isoA !== isoB) return isoA.localeCompare(isoB);
          return a.startMinOfDay - b.startMinOfDay;
        });

        const realActs = col.blocks.filter((b) => !b.isGap);
        const firstReal = realActs[0];
        const lastReal = realActs[realActs.length - 1];
        col.firstStartTime = firstReal?.startTime || '-';
        col.lastEndTime = lastReal?.endTime || '-';
        return col;
      });

    if (sortBy === 'INICIO') {
      list.sort((a, b) => a.firstStartTime.localeCompare(b.firstStartTime));
    } else if (sortBy === 'TEMPO') {
      list.sort((a, b) => b.totalMinutes - a.totalMinutes);
    } else if (sortBy === 'SEM_APONTAR') {
      list.sort((a, b) => b.totalGapMinutes - a.totalGapMinutes);
    } else {
      list.sort((a, b) => a.collaboratorName.localeCompare(b.collaboratorName));
    }

    return list;
  }, [periodAndShiftBlocks, selectedNames, sortBy, shifts]);

  // Faixa de horário dinâmica para o gráfico de Linha do Tempo (cobrindo turno inteiro)
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

  const totals = useMemo(() => {
    const totalActivities = summaries.reduce((acc, s) => acc + s.activitiesCount, 0);
    const totalGapsCount = summaries.reduce((acc, s) => acc + s.gapsCount, 0);
    const totalMinutes = summaries.reduce((acc, s) => acc + s.totalMinutes, 0);
    const totalGapMinutes = summaries.reduce((acc, s) => acc + s.totalGapMinutes, 0);
    const maxColabTotalSpan = Math.max(
      1,
      ...summaries.map((s) => s.totalMinutes + (includeShiftGaps ? s.totalGapMinutes : 0))
    );

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

    return {
      totalActivities,
      totalGapsCount,
      totalMinutes,
      totalGapMinutes,
      maxColabTotalSpan,
      overallFirstStart,
      overallLastEnd,
    };
  }, [summaries, includeShiftGaps]);

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

  const toggleColabName = (name: string) => {
    setSelectedNames((prev) => {
      const exists = prev.some((n) => n.toLowerCase() === name.toLowerCase());
      if (exists) {
        return prev.filter((n) => n.toLowerCase() !== name.toLowerCase());
      }
      return [...prev, name];
    });
  };

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
        includeShiftGaps,
        summaries,
        timelineRange,
        totalActivities: totals.totalActivities,
        totalGapsCount: totals.totalGapsCount,
        totalMinutes: totals.totalMinutes,
        totalGapMinutes: totals.totalGapMinutes,
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

  const grayShadesBg = ['#18181B', '#3F3F46', '#52525B', '#71717A'];
  const hatchedGapStyle: React.CSSProperties = {
    backgroundImage:
      'repeating-linear-gradient(-45deg, #F4F4F5, #F4F4F5 3px, #D4D4D8 3px, #D4D4D8 6px)',
  };

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
                    Relatório de Gestão · Início, Fim e Auditoria de Turno
                  </h2>
                  <p className="text-xs text-zinc-400 truncate">
                    Formulário clean em tons de cinza · Observações completas, lacunas sem apontar e ação do líder
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
                              {opt.gapMins > 0 ? ` · ${formatarHorasMinutos(opt.gapMins)} s/ap` : ''}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

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
                    onChange={(e) => setSortBy(e.target.value as 'INICIO' | 'TEMPO' | 'SEM_APONTAR' | 'NOME')}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-100 outline-none cursor-pointer"
                  >
                    <option value="INICIO">1º Início</option>
                    <option value="SEM_APONTAR">Mais Sem Apontar</option>
                    <option value="TEMPO">Maior Tempo</option>
                    <option value="NOME">Nome A–Z</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Sub-barra: Tipo de Gráfico + Contar Turno Inteiro + Feedback */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-zinc-400">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-zinc-500">Gráfico:</span>
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

                <button
                  type="button"
                  onClick={() => setIncludeShiftGaps((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded border text-[11px] font-medium transition cursor-pointer whitespace-nowrap ${
                    includeShiftGaps
                      ? 'bg-zinc-800 border-zinc-600 text-zinc-100'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                  title="Quando ativado, conta o turno inteiro de quem iniciou alguma atividade e destaca períodos sem apontar"
                >
                  <span
                    className={`w-3 h-3 rounded-sm border flex items-center justify-center text-[9px] ${
                      includeShiftGaps
                        ? 'bg-zinc-200 border-zinc-200 text-zinc-900 font-bold'
                        : 'border-zinc-600 text-transparent'
                    }`}
                  >
                    ✓
                  </span>
                  <span>Auditar Turno Inteiro (Mostrar Sem Apontar)</span>
                </button>
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
                    Relatório de Início, Fim e Auditoria de Turno
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

              {/* 2. INDICADORES RESUMO (CINZA CLEAN) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 border border-zinc-300 divide-y sm:divide-y-0 sm:divide-x divide-zinc-300 bg-zinc-50">
                <div className="p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Iniciaram Atividades
                  </div>
                  <div className="text-lg font-bold text-zinc-900 font-mono tabular-nums mt-0.5">
                    {summaries.length}
                  </div>
                  <div className="text-[11px] text-zinc-600">colaborador(es) no turno</div>
                </div>

                <div className="p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Registros / Lacunas
                  </div>
                  <div className="text-lg font-bold text-zinc-900 font-mono tabular-nums mt-0.5">
                    {totals.totalActivities}
                    {includeShiftGaps && (
                      <span className="text-xs font-medium text-zinc-500 ml-1">
                        · {totals.totalGapsCount} lac.
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-600">atividades · períodos sem apontar</div>
                </div>

                <div className="p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Tempo Apontado
                  </div>
                  <div className="text-lg font-bold text-zinc-900 font-mono tabular-nums mt-0.5">
                    {formatarHorasMinutos(totals.totalMinutes)}
                  </div>
                  <div className="text-[11px] text-zinc-600 font-mono tabular-nums">
                    {totals.overallFirstStart} –{' '}
                    {totals.overallLastEnd === 'Em andamento' ? 'Ativo' : totals.overallLastEnd}
                  </div>
                </div>

                <div className="p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Sem Apontamento (Turno)
                  </div>
                  <div className="text-lg font-bold text-zinc-900 font-mono tabular-nums mt-0.5">
                    {formatarHorasMinutos(totals.totalGapMinutes)}
                  </div>
                  <div className="text-[11px] text-zinc-600 font-mono tabular-nums">
                    {totals.totalGapMinutes > 0
                      ? `${totals.totalGapMinutes} min descobertos`
                      : 'Turno 100% apontado'}
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
                  {/* 3A. GRÁFICO LINHA DO TEMPO HORÁRIA (TURNO INTEIRO: APONTADO + SEM APONTAR) */}
                  {showTimelineGraph && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                          Gráfico Linha do Tempo do Turno Inteiro (Início → Fim)
                        </h3>
                        <div className="flex items-center gap-3 text-[11px] text-zinc-600">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-3 h-2.5 inline-block bg-zinc-800 border border-zinc-900" />
                            <span>Apontado</span>
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-3 h-2.5 inline-block bg-zinc-300 border border-dashed border-zinc-800" />
                            <span>Ativo</span>
                          </span>
                          {includeShiftGaps && (
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                style={hatchedGapStyle}
                                className="w-3 h-2.5 inline-block border border-zinc-500"
                              />
                              <span>Sem Apontamento</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="border border-zinc-300 bg-white overflow-x-auto">
                        <div className="min-w-[620px]">
                          <div className="grid grid-cols-[150px_1fr_135px] border-b border-zinc-300 bg-zinc-100 text-[10px] font-mono tabular-nums text-zinc-600">
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
                              Apont. / S/ Apontar
                            </div>
                          </div>

                          <div className="divide-y divide-zinc-200">
                            {summaries.map((col, idx) => {
                              const span = Math.max(60, timelineRange.maxMinute - timelineRange.minMinute);
                              let actColorCounter = 0;
                              return (
                                <div
                                  key={col.collaboratorName}
                                  className={`grid grid-cols-[150px_1fr_135px] items-center ${
                                    idx % 2 === 1 ? 'bg-zinc-50/80' : 'bg-white'
                                  }`}
                                >
                                  <div className="px-2.5 py-2 border-r border-zinc-200 min-w-0">
                                    <div className="text-xs font-bold text-zinc-900 truncate" title={col.collaboratorName}>
                                      {col.collaboratorName}
                                    </div>
                                    <div className="text-[10px] text-zinc-500 truncate">
                                      {col.shift} ({col.shiftWindow})
                                    </div>
                                  </div>

                                  <div className="relative h-9 mx-1">
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

                                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-4 bg-zinc-50 border border-zinc-200" />

                                    {col.blocks.map((blk) => {
                                      const leftPct = Math.max(
                                        0,
                                        ((blk.startMinOfDay - timelineRange.minMinute) / span) * 100
                                      );
                                      const rightPct = Math.min(
                                        100,
                                        ((Math.max(blk.startMinOfDay + 5, blk.endMinOfDay) - timelineRange.minMinute) / span) * 100
                                      );
                                      const widthPct = Math.max(1.2, rightPct - leftPct);

                                      if (blk.isGap) {
                                        return (
                                          <div
                                            key={blk.id}
                                            style={{
                                              left: `${leftPct}%`,
                                              width: `${widthPct}%`,
                                              ...hatchedGapStyle,
                                            }}
                                            title={`${blk.activity} | ${blk.startTime.slice(0, 5)} às ${blk.endTime.slice(0, 5)} (${blk.durationMinutes} min) - ${blk.observation || ''}`}
                                            className="absolute top-1/2 -translate-y-1/2 h-4 border border-zinc-500 flex items-center justify-center overflow-hidden"
                                          >
                                            {widthPct > 9 && (
                                              <span className="text-[8.5px] font-mono font-bold text-zinc-700 px-1 truncate bg-white/75">
                                                S/Ap {blk.durationMinutes}m
                                              </span>
                                            )}
                                          </div>
                                        );
                                      }

                                      const bgTone = grayShadesBg[actColorCounter % grayShadesBg.length];
                                      actColorCounter++;

                                      return (
                                        <div
                                          key={blk.id}
                                          style={{
                                            left: `${leftPct}%`,
                                            width: `${widthPct}%`,
                                            backgroundColor: blk.isOngoing ? '#D4D4D8' : bgTone,
                                          }}
                                          title={`${blk.activity}${blk.observation ? ` (${blk.observation})` : ''} | Início: ${blk.startTime} | Fim: ${blk.endTime} (${blk.durationMinutes} min)`}
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
                                      {formatarHorasMinutos(col.totalMinutes)}
                                    </div>
                                    <div className="text-[10px] text-zinc-600">
                                      {col.totalGapMinutes > 0
                                        ? `S/Ap: ${formatarHorasMinutos(col.totalGapMinutes)}`
                                        : `${col.firstStartTime.slice(0, 5)}–${
                                            col.lastEndTime === 'Em andamento' ? 'Ativo' : col.lastEndTime.slice(0, 5)
                                          }`}
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

                  {/* 3B. GRÁFICO DE BARRAS HORIZONTAIS (APONTADO vs SEM APONTAR) */}
                  {showBarsGraph && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                        Gráfico Comparativo: Tempo Apontado vs. Sem Apontamento (Tons de Cinza)
                      </h3>

                      <div className="border border-zinc-300 bg-white divide-y divide-zinc-200">
                        {summaries.map((col) => {
                          const workPct = Math.max(1, Math.round((col.totalMinutes / totals.maxColabTotalSpan) * 100));
                          const gapPct = includeShiftGaps
                            ? Math.min(100 - workPct, Math.round((col.totalGapMinutes / totals.maxColabTotalSpan) * 100))
                            : 0;
                          return (
                            <div
                              key={col.collaboratorName}
                              className="grid grid-cols-1 sm:grid-cols-[155px_1fr_220px] items-center gap-2 px-3 py-2"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-zinc-900 truncate">{col.collaboratorName}</div>
                                <div className="text-[10px] text-zinc-500 truncate">
                                  {col.shift} ({col.shiftWindow})
                                </div>
                              </div>

                              <div className="w-full h-4 bg-zinc-100 border border-zinc-200 overflow-hidden flex">
                                <div style={{ width: `${workPct}%` }} className="h-full bg-zinc-800" />
                                {gapPct > 0 && (
                                  <div
                                    style={{ width: `${gapPct}%`, ...hatchedGapStyle }}
                                    className="h-full border-l border-zinc-500"
                                  />
                                )}
                              </div>

                              <div className="text-right text-[11px] font-mono tabular-nums text-zinc-800">
                                <strong className="text-zinc-900">{formatarHorasMinutos(col.totalMinutes)}</strong>
                                <span> ({col.activitiesCount}x)</span>
                                {col.totalGapMinutes > 0 && (
                                  <span className="text-zinc-600 font-semibold">
                                    {' · S/Ap: '}
                                    {formatarHorasMinutos(col.totalGapMinutes)}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 4. TABELA DETALHADA DE INÍCIO, FIM, OBSERVAÇÕES E PERÍODOS SEM APONTAR */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                        Detalhamento do Turno (Atividades, Observações e Períodos Sem Apontar)
                      </h3>
                      <span className="text-[11px] font-mono tabular-nums text-zinc-500">
                        {totals.totalActivities} atividade(s)
                        {includeShiftGaps && totals.totalGapsCount > 0 ? ` · ${totals.totalGapsCount} período(s) sem apontar` : ''}
                      </span>
                    </div>

                    <div className="overflow-x-auto border border-zinc-300">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-zinc-200 border-b border-zinc-400 text-zinc-900 font-bold">
                            <th className="py-2 px-2.5 border-r border-zinc-300">Colaborador</th>
                            <th className="py-2 px-2 border-r border-zinc-300 text-center">Data</th>
                            <th className="py-2 px-2.5 border-r border-zinc-300">Atividade / Observação</th>
                            <th className="py-2 px-2 border-r border-zinc-300 text-center">Início</th>
                            <th className="py-2 px-2 border-r border-zinc-300 text-center">Fim</th>
                            <th className="py-2 px-2 border-r border-zinc-300 text-right">Duração</th>
                            <th className="py-2 px-2 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200">
                          {summaries.flatMap((col) =>
                            col.blocks.map((blk, bIdx) => (
                              <tr
                                key={blk.id}
                                className={
                                  blk.isGap
                                    ? 'bg-zinc-100 text-zinc-800'
                                    : bIdx % 2 === 1
                                    ? 'bg-zinc-50/60'
                                    : 'bg-white'
                                }
                              >
                                <td className="py-1.5 px-2.5 border-r border-zinc-200 font-semibold text-zinc-900 whitespace-nowrap align-top">
                                  {col.collaboratorName}
                                </td>
                                <td className="py-1.5 px-2 border-r border-zinc-200 text-center font-mono tabular-nums text-zinc-700 whitespace-nowrap align-top">
                                  {blk.date}
                                </td>
                                <td className="py-1.5 px-2.5 border-r border-zinc-200 text-zinc-900 align-top">
                                  <div className={blk.isGap ? 'font-bold text-zinc-800' : 'font-semibold text-zinc-900'}>
                                    {blk.activity}
                                  </div>
                                  {blk.observation && (
                                    <div className="text-[11px] text-zinc-600 mt-0.5 whitespace-normal break-words leading-snug">
                                      <span className="font-semibold text-zinc-700">Obs:</span> {blk.observation}
                                    </div>
                                  )}
                                </td>
                                <td className="py-1.5 px-2 border-r border-zinc-200 text-center font-mono tabular-nums font-semibold text-zinc-900 whitespace-nowrap align-top">
                                  {blk.startTime.slice(0, 8)}
                                </td>
                                <td className="py-1.5 px-2 border-r border-zinc-200 text-center font-mono tabular-nums text-zinc-800 whitespace-nowrap align-top">
                                  {blk.endTime === 'Em andamento' ? 'Em andamento' : blk.endTime.slice(0, 8)}
                                </td>
                                <td className="py-1.5 px-2 border-r border-zinc-200 text-right font-mono tabular-nums font-bold text-zinc-900 whitespace-nowrap align-top">
                                  {blk.durationMinutes > 0 ? `${blk.durationMinutes} min` : blk.isOngoing ? 'Ativo' : '-'}
                                </td>
                                <td className="py-1.5 px-2 text-center text-[11px] whitespace-nowrap align-top">
                                  <span className={blk.isGap ? 'font-bold text-zinc-800' : 'text-zinc-700'}>
                                    {blk.isGap ? 'Sem Apontar' : blk.isAutoClosed ? 'Auto-Fim' : blk.status}
                                  </span>
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

                <div>
                  <textarea
                    rows={3}
                    value={leaderAction.actionText}
                    onChange={(e) => setLeaderAction((prev) => ({ ...prev, actionText: e.target.value }))}
                    placeholder="Descreva a ação do líder, tratativa, alinhamento com o colaborador ou plano de ação (se deixar em branco, o relatório impresso/PDF gera linhas pautadas para escrita manual)..."
                    className="w-full bg-white border border-zinc-300 focus:border-zinc-700 rounded p-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 outline-none resize-y leading-relaxed"
                  />
                </div>

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
              Relatório de Início, Fim e Auditoria de Turno
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

        <div className="grid grid-cols-4 border border-zinc-400 divide-x divide-zinc-400 bg-zinc-50 mb-4">
          <div className="p-2">
            <div className="text-[9px] font-bold uppercase text-zinc-600">Iniciaram Atividades</div>
            <div className="text-sm font-bold font-mono tabular-nums text-zinc-900">{summaries.length} colab.</div>
          </div>
          <div className="p-2">
            <div className="text-[9px] font-bold uppercase text-zinc-600">Registros / Lacunas</div>
            <div className="text-sm font-bold font-mono tabular-nums text-zinc-900">
              {totals.totalActivities} apont.
              {includeShiftGaps ? ` · ${totals.totalGapsCount} lac.` : ''}
            </div>
          </div>
          <div className="p-2">
            <div className="text-[9px] font-bold uppercase text-zinc-600">Tempo Apontado</div>
            <div className="text-sm font-bold font-mono tabular-nums text-zinc-900">
              {formatarHorasMinutos(totals.totalMinutes)}
            </div>
          </div>
          <div className="p-2">
            <div className="text-[9px] font-bold uppercase text-zinc-600">Sem Apontamento</div>
            <div className="text-sm font-bold font-mono tabular-nums text-zinc-900">
              {formatarHorasMinutos(totals.totalGapMinutes)}
            </div>
          </div>
        </div>

        {summaries.length > 0 && showTimelineGraph && (
          <div className="mb-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-800 mb-1">
              Gráfico Linha do Tempo do Turno Inteiro (Início → Fim)
            </div>
            <div className="border border-zinc-400">
              <div className="grid grid-cols-[135px_1fr_115px] border-b border-zinc-400 bg-zinc-100 text-[9px] font-mono tabular-nums text-zinc-700">
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
                <div className="px-2 py-1 font-bold text-right border-l border-zinc-300">Apont. / S/Ap</div>
              </div>
              <div className="divide-y divide-zinc-200">
                {summaries.map((col, idx) => {
                  const span = Math.max(60, timelineRange.maxMinute - timelineRange.minMinute);
                  let actColorCounter = 0;
                  return (
                    <div
                      key={col.collaboratorName}
                      className={`grid grid-cols-[135px_1fr_115px] items-center ${idx % 2 === 1 ? 'bg-zinc-50' : 'bg-white'}`}
                    >
                      <div className="px-2 py-1.5 border-r border-zinc-200 text-[10px] font-bold truncate">
                        {col.collaboratorName}
                      </div>
                      <div className="relative h-6 mx-1">
                        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-3 bg-zinc-50 border border-zinc-200" />
                        {col.blocks.map((blk) => {
                          const leftPct = Math.max(0, ((blk.startMinOfDay - timelineRange.minMinute) / span) * 100);
                          const rightPct = Math.min(
                            100,
                            ((Math.max(blk.startMinOfDay + 5, blk.endMinOfDay) - timelineRange.minMinute) / span) * 100
                          );
                          const widthPct = Math.max(1.2, rightPct - leftPct);
                          if (blk.isGap) {
                            return (
                              <div
                                key={blk.id}
                                style={{
                                  left: `${leftPct}%`,
                                  width: `${widthPct}%`,
                                  ...hatchedGapStyle,
                                }}
                                className="absolute top-1/2 -translate-y-1/2 h-3 border border-zinc-500"
                              />
                            );
                          }
                          const bgTone = grayShadesBg[actColorCounter % grayShadesBg.length];
                          actColorCounter++;
                          return (
                            <div
                              key={blk.id}
                              style={{
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                                backgroundColor: blk.isOngoing ? '#D4D4D8' : bgTone,
                              }}
                              className="absolute top-1/2 -translate-y-1/2 h-3 border border-zinc-900"
                            />
                          );
                        })}
                      </div>
                      <div className="px-2 py-1.5 border-l border-zinc-200 text-right font-mono tabular-nums text-[9px]">
                        {formatarHorasMinutos(col.totalMinutes)}
                        {col.totalGapMinutes > 0 ? ` · ${formatarHorasMinutos(col.totalGapMinutes)}` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {summaries.length > 0 && showBarsGraph && (
          <div className="mb-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-800 mb-1">
              Gráfico Comparativo: Apontado vs. Sem Apontamento (Tons de Cinza)
            </div>
            <div className="border border-zinc-400 divide-y divide-zinc-200">
              {summaries.map((col) => {
                const workPct = Math.max(1, Math.round((col.totalMinutes / totals.maxColabTotalSpan) * 100));
                const gapPct = includeShiftGaps
                  ? Math.min(100 - workPct, Math.round((col.totalGapMinutes / totals.maxColabTotalSpan) * 100))
                  : 0;
                return (
                  <div key={col.collaboratorName} className="grid grid-cols-[135px_1fr_180px] items-center gap-2 px-2.5 py-1.5">
                    <div className="text-[10px] font-bold truncate">{col.collaboratorName}</div>
                    <div className="w-full h-3 bg-zinc-100 border border-zinc-300 flex overflow-hidden">
                      <div style={{ width: `${workPct}%` }} className="h-full bg-zinc-800" />
                      {gapPct > 0 && (
                        <div style={{ width: `${gapPct}%`, ...hatchedGapStyle }} className="h-full border-l border-zinc-500" />
                      )}
                    </div>
                    <div className="text-right text-[9.5px] font-mono tabular-nums">
                      {formatarHorasMinutos(col.totalMinutes)} ({col.activitiesCount}x)
                      {col.totalGapMinutes > 0 ? ` · S/Ap: ${formatarHorasMinutos(col.totalGapMinutes)}` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {summaries.length > 0 && (
          <div className="mb-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-800 mb-1">
              Detalhamento do Turno (Atividades, Observações e Períodos Sem Apontar)
            </div>
            <table className="w-full text-[10px] border border-zinc-400 border-collapse">
              <thead>
                <tr className="bg-zinc-200 border-b border-zinc-400 font-bold text-left">
                  <th className="p-1.5 border-r border-zinc-300">Colaborador</th>
                  <th className="p-1.5 border-r border-zinc-300 text-center">Data</th>
                  <th className="p-1.5 border-r border-zinc-300">Atividade / Observação</th>
                  <th className="p-1.5 border-r border-zinc-300 text-center">Início</th>
                  <th className="p-1.5 border-r border-zinc-300 text-center">Fim</th>
                  <th className="p-1.5 border-r border-zinc-300 text-right">Duração</th>
                  <th className="p-1.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {summaries.flatMap((col) =>
                  col.blocks.map((blk, bIdx) => (
                    <tr
                      key={blk.id}
                      className={`border-b border-zinc-200 ${
                        blk.isGap ? 'bg-zinc-100' : bIdx % 2 === 1 ? 'bg-zinc-50' : 'bg-white'
                      }`}
                    >
                      <td className="p-1.5 border-r border-zinc-200 font-bold align-top">{col.collaboratorName}</td>
                      <td className="p-1.5 border-r border-zinc-200 text-center font-mono tabular-nums align-top">{blk.date}</td>
                      <td className="p-1.5 border-r border-zinc-200 align-top">
                        <div className={blk.isGap ? 'font-bold text-zinc-900' : 'font-semibold text-zinc-900'}>
                          {blk.activity}
                        </div>
                        {blk.observation && (
                          <div className="text-[9.5px] text-zinc-600 mt-0.5 whitespace-normal break-words">
                            <strong>Obs:</strong> {blk.observation}
                          </div>
                        )}
                      </td>
                      <td className="p-1.5 border-r border-zinc-200 text-center font-mono tabular-nums font-bold align-top">
                        {blk.startTime.slice(0, 8)}
                      </td>
                      <td className="p-1.5 border-r border-zinc-200 text-center font-mono tabular-nums align-top">
                        {blk.endTime === 'Em andamento' ? 'Em andamento' : blk.endTime.slice(0, 8)}
                      </td>
                      <td className="p-1.5 border-r border-zinc-200 text-right font-mono tabular-nums font-bold align-top">
                        {blk.durationMinutes > 0 ? `${blk.durationMinutes} min` : blk.isOngoing ? 'Ativo' : '-'}
                      </td>
                      <td className="p-1.5 text-center align-top">
                        {blk.isGap ? 'Sem Apontar' : blk.isAutoClosed ? 'Auto-Fim' : blk.status}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

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
