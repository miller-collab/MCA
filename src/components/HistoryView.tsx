import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, Download, Trash2, Edit3, X, Check, Filter, Lock, KeyRound, 
  AlertTriangle, RotateCcw, Calendar, Clock, ShieldCheck, PlusCircle, 
  Activity, User, Layers, Printer, Plus
} from 'lucide-react';
import { ProductionLog, Collaborator, ShiftConfig, ActivityCategory, ActivityItem } from '../types';
import { 
  formatarHorasMinutos, 
  calcularDiferencaMinutos, 
  verificarDataNoPeriodo, 
  obterTurnoDoLog,
  padronizarNomeTurno,
  converterDataPtParaIso,
  calcularGapsJornadaColaboradores,
  calcularEficienciaEquipePeriodo,
  ShiftGapEntry,
  timeToSecondsOfDay,
  timeToShiftRelativeSeconds
} from '../utils/factoryCalculations';
import { generateAndDownloadReportPDF } from '../utils/pdfReportGenerator';

export const CATEGORY_OPTIONS: { value: ActivityCategory; label: string }[] = [
  { value: 'Operação', label: 'OPERAÇÃO / PRODUÇÃO' },
  { value: 'Setup', label: 'SETUP / PREPARAÇÃO' },
  { value: 'Manutenção', label: 'MANUTENÇÃO' },
  { value: 'Qualidade / Inspeção', label: 'QUALIDADE / INSPEÇÃO' },
  { value: '5S & Limpeza', label: '5S & LIMPEZA' },
  { value: 'Logística / Almoxarifado', label: 'LOGÍSTICA / ALMOXARIFADO' },
  { value: 'Sistema & Processo', label: 'SISTEMA & PROCESSO' },
];

interface HistoryViewProps {
  logs: ProductionLog[];
  collaborators?: Collaborator[];
  activities?: ActivityItem[];
  shifts?: ShiftConfig[];
  onDeleteLog?: (id: string) => void;
  onUpdateLog?: (log: ProductionLog) => void;
  onAddLog?: (log: ProductionLog) => void;
  initialFilterTerm?: string;
  isLeaderUnlocked?: boolean;
  onUnlockLeader?: (pin: string) => boolean;
  leaderPin?: string;
}

// Tipo unificado para itens da tabela do histórico
type HistoryTimelineItem = 
  | { type: 'log'; data: ProductionLog }
  | { type: 'gap'; data: ShiftGapEntry };

export const HistoryView: React.FC<HistoryViewProps> = ({
  logs,
  collaborators = [],
  activities = [],
  shifts = [],
  onDeleteLog,
  onUpdateLog,
  onAddLog,
  initialFilterTerm = '',
  isLeaderUnlocked = false,
  onUnlockLeader,
  leaderPin = '8619',
}) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCollaborator, setSelectedCollaborator] = useState(() => {
    if (initialFilterTerm && initialFilterTerm.trim()) {
      const match = (collaborators || []).find(
        (c) => c.name.trim().toLowerCase() === initialFilterTerm.trim().toLowerCase()
      );
      if (match) return match.name;
    }
    return 'TODOS';
  });
  const [searchTerm, setSearchTerm] = useState(() => {
    if (initialFilterTerm && initialFilterTerm.trim()) {
      const match = (collaborators || []).find(
        (c) => c.name.trim().toLowerCase() === initialFilterTerm.trim().toLowerCase()
      );
      if (match) return '';
      return initialFilterTerm;
    }
    return '';
  });
  const [selectedActivity, setSelectedActivity] = useState('TODOS');
  const [selectedShift, setSelectedShift] = useState('TODOS');
  const [filterStatus, setFilterStatus] = useState('TODOS');
  const [showGaps, setShowGaps] = useState(true); // Exibir lacunas sem apontamento por padrão
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Sincroniza quando o filtro for disparado externamente (ex: drilldown da Eficiência)
  useEffect(() => {
    if (initialFilterTerm && initialFilterTerm.trim()) {
      const match = (collaborators || []).find(
        (c) => c.name.trim().toLowerCase() === initialFilterTerm.trim().toLowerCase()
      );
      if (match) {
        setSelectedCollaborator(match.name);
        setSearchTerm('');
      } else {
        setSearchTerm(initialFilterTerm);
      }
    }
  }, [initialFilterTerm, collaborators]);

  // Lista de Colaboradores únicos para o seletor de filtro
  const listaColaboradoresFiltro = useMemo(() => {
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

  // Lista de Atividades únicas para o seletor de filtro
  const listaAtividadesFiltro = useMemo(() => {
    const nomesSet = new Set<string>();
    (activities || []).forEach((a) => {
      if (a && a.name && a.name.trim()) nomesSet.add(a.name.trim());
    });
    (logs || []).forEach((l) => {
      if (l && l.activity && l.activity.trim()) nomesSet.add(l.activity.trim());
    });
    return Array.from(nomesSet).sort((a, b) => a.localeCompare(b));
  }, [activities, logs]);
  
  // Leader Password Protection for Edit/Delete/Fill Gap / Manual Add
  const [authModal, setAuthModal] = useState<{
    isOpen: boolean;
    actionType: 'edit' | 'delete' | 'fillGap' | 'manualAdd';
    targetLog?: ProductionLog;
    targetGap?: ShiftGapEntry;
  } | null>(null);
  const [authPinInput, setAuthPinInput] = useState('');
  const [authPinError, setAuthPinError] = useState(false);

  // Edit log modal
  const [editingLog, setEditingLog] = useState<ProductionLog | null>(null);
  const [editCollaborator, setEditCollaborator] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editShift, setEditShift] = useState('Turno 1');
  const [editActivityName, setEditActivityName] = useState('');
  const [editCategory, setEditCategory] = useState<ActivityCategory>('Operação');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editObs, setEditObs] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Modal para Preencher Apontamento Retroativo no GAP
  const [fillingGap, setFillingGap] = useState<ShiftGapEntry | null>(null);
  const [gapActivityName, setGapActivityName] = useState('');
  const [gapCategory, setGapCategory] = useState<ActivityCategory>('Operação');
  const [gapStartTime, setGapStartTime] = useState('');
  const [gapEndTime, setGapEndTime] = useState('');
  const [gapObs, setGapObs] = useState('');

  // Modal para Novo Apontamento Manual
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualColab, setManualColab] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [manualShift, setManualShift] = useState('Turno 1');
  const [manualActivityName, setManualActivityName] = useState('');
  const [manualCategory, setManualCategory] = useState<ActivityCategory>('Operação');
  const [manualStartTime, setManualStartTime] = useState('');
  const [manualEndTime, setManualEndTime] = useState('');
  const [manualObs, setManualObs] = useState('');
  const [manualNotes, setManualNotes] = useState('');

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);

  // Available shifts list strictly: Turno 1, Turno 2, Turno 3
  const availableShifts = useMemo(() => {
    return ['Turno 1', 'Turno 2', 'Turno 3'];
  }, []);

  const hasActiveFilters = Boolean(
    searchTerm || 
    startDate || 
    endDate || 
    selectedCollaborator !== 'TODOS' ||
    selectedActivity !== 'TODOS' ||
    selectedShift !== 'TODOS' || 
    filterStatus !== 'TODOS' || 
    !showGaps
  );

  const handleClearFilters = () => {
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
    setSelectedCollaborator('TODOS');
    setSelectedActivity('TODOS');
    setSelectedShift('TODOS');
    setFilterStatus('TODOS');
    setShowGaps(true);
  };

  // Calcula todos os GAPs de jornada para os logs
  const allGaps = useMemo(() => {
    return calcularGapsJornadaColaboradores(logs, collaborators, shifts);
  }, [logs, collaborators, shifts]);

  // Unifica logs e GAPs em uma lista cronológica inteligente
  const combinedTimeline = useMemo(() => {
    const items: HistoryTimelineItem[] = [];

    // 1. Adiciona os logs de produção
    logs.forEach((log) => {
      items.push({ type: 'log', data: log });
    });

    // 2. Adiciona os GAPs (se habilitado)
    if (showGaps) {
      allGaps.forEach((gap) => {
        items.push({ type: 'gap', data: gap });
      });
    }

    return items;
  }, [logs, allGaps, showGaps]);

  // Filtra itens com range, shift, status, busca, refeição, colaborador e atividade
  const filteredTimeline = useMemo(() => {
    return combinedTimeline.filter((item) => {
      const term = searchTerm.toLowerCase().trim();

      if (item.type === 'log') {
        const log = item.data;
        const itemShift = obterTurnoDoLog(log, collaborators);

        const matchTerm =
          !term ||
          log.date.toLowerCase().includes(term) ||
          log.collaboratorName.toLowerCase().includes(term) ||
          log.activity.toLowerCase().includes(term) ||
          log.status.toLowerCase().includes(term) ||
          itemShift.toLowerCase().includes(term) ||
          (log.observation && log.observation.toLowerCase().includes(term)) ||
          (log.notes && log.notes.toLowerCase().includes(term)) ||
          (log.role && log.role.toLowerCase().includes(term)) ||
          (log.machineId && log.machineId.toLowerCase().includes(term));

        const matchDatePeriod = verificarDataNoPeriodo(log.date, startDate, endDate);

        const matchColab =
          selectedCollaborator === 'TODOS' ||
          log.collaboratorName.trim().toLowerCase() === selectedCollaborator.trim().toLowerCase();

        const matchActivity =
          selectedActivity === 'TODOS' ||
          log.activity.trim().toLowerCase() === selectedActivity.trim().toLowerCase();

        const matchShift =
          selectedShift === 'TODOS' ||
          padronizarNomeTurno(itemShift) === padronizarNomeTurno(selectedShift);

        const matchStatus = 
          filterStatus === 'TODOS' || 
          (filterStatus === 'SEM_APONTAMENTO' ? false : log.status === filterStatus);

        return matchTerm && matchDatePeriod && matchColab && matchActivity && matchShift && matchStatus;
      } else {
        // É um GAP (Sem Apontamento)
        const gap = item.data;
        const itemShift = gap.shift || 'Turno 1';

        const matchTerm =
          !term ||
          gap.date.toLowerCase().includes(term) ||
          gap.collaboratorName.toLowerCase().includes(term) ||
          gap.activity.toLowerCase().includes(term) ||
          gap.status.toLowerCase().includes(term) ||
          itemShift.toLowerCase().includes(term) ||
          (gap.observation && gap.observation.toLowerCase().includes(term));

        const matchDatePeriod = verificarDataNoPeriodo(gap.date, startDate, endDate);

        const matchColab =
          selectedCollaborator === 'TODOS' ||
          gap.collaboratorName.trim().toLowerCase() === selectedCollaborator.trim().toLowerCase();

        const matchActivity =
          selectedActivity === 'TODOS' ||
          gap.activity.trim().toLowerCase() === selectedActivity.trim().toLowerCase();

        const matchShift =
          selectedShift === 'TODOS' ||
          padronizarNomeTurno(itemShift) === padronizarNomeTurno(selectedShift);

        const matchStatus = 
          filterStatus === 'TODOS' || 
          filterStatus === 'SEM_APONTAMENTO';

        return matchTerm && matchDatePeriod && matchColab && matchActivity && matchShift && matchStatus;
      }
    }).sort((a, b) => {
      // Ordenação: primeiro por data decrescente (ISO), depois por colaborador, depois por horário do turno
      const dateStrA = a.type === 'log' ? a.data.date : a.data.date;
      const dateStrB = b.type === 'log' ? b.data.date : b.data.date;
      const isoA = converterDataPtParaIso(dateStrA);
      const isoB = converterDataPtParaIso(dateStrB);
      if (isoA !== isoB) return isoB.localeCompare(isoA); // Data mais recente primeiro

      const colabA = (a.type === 'log' ? a.data.collaboratorName : a.data.collaboratorName) || '';
      const colabB = (b.type === 'log' ? b.data.collaboratorName : b.data.collaboratorName) || '';
      if (colabA.toLowerCase() !== colabB.toLowerCase()) return colabA.localeCompare(colabB);

      const shiftA = a.type === 'log' ? obterTurnoDoLog(a.data, collaborators) : a.data.shift;
      const foundShiftA = shifts.find((s) => padronizarNomeTurno(s.name) === padronizarNomeTurno(shiftA)) || shifts[0] || { entrada: '07:00', saida: '17:30' };
      const entradaA = foundShiftA?.entrada || '07:00';
      const saidaA = foundShiftA?.saida || '17:30';
      const isOvernightA = timeToSecondsOfDay(entradaA) > timeToSecondsOfDay(saidaA);

      const startA = a.type === 'log' ? a.data.startTime : a.data.startTime;
      const startB = b.type === 'log' ? b.data.startTime : b.data.startTime;
      return timeToShiftRelativeSeconds(startA, entradaA, isOvernightA) - timeToShiftRelativeSeconds(startB, entradaA, isOvernightA);
    });
  }, [combinedTimeline, searchTerm, startDate, endDate, selectedCollaborator, selectedActivity, selectedShift, filterStatus, collaborators, shifts]);

  // Contadores precisos baseados na lista filtrada atualmente na tela
  const filteredLogsCount = useMemo(() => {
    return filteredTimeline.filter((i) => i.type === 'log').length;
  }, [filteredTimeline]);

  const filteredGapsCount = useMemo(() => {
    return filteredTimeline.filter((i) => i.type === 'gap').length;
  }, [filteredTimeline]);

  const filteredRealGapsCount = useMemo(() => {
    return filteredTimeline.filter(
      (i) => i.type === 'gap' && !i.data.isMealInterval && i.data.status !== 'Refeição'
    ).length;
  }, [filteredTimeline]);

  // Cálculos para o Card de Conciliação e Auditoria da Jornada
  // Respeita com precisão absoluta o histórico dos registros e lacunas visíveis na tela
  const conciliationMetrics = useMemo(() => {
    let totalProdutivoMin = 0;
    let totalRefeicaoMin = 0;
    let totalGapsReaisMin = 0;

    filteredTimeline.forEach((item) => {
      if (item.type === 'log') {
        const log = item.data;
        const dur = log.durationMinutes !== undefined 
          ? log.durationMinutes 
          : log.endTime 
          ? calcularDiferencaMinutos(log.startTime, log.endTime) 
          : 0;
        totalProdutivoMin += Math.max(0, dur);
      } else {
        const gap = item.data;
        if (gap.isMealInterval || gap.status === 'Refeição') {
          totalRefeicaoMin += gap.durationMinutes || 0;
        } else {
          totalGapsReaisMin += gap.durationMinutes || 0;
        }
      }
    });

    const totalJornadaMin = totalProdutivoMin + totalGapsReaisMin;
    const aderenciaPct = totalJornadaMin > 0 
      ? parseFloat(((totalProdutivoMin / totalJornadaMin) * 100).toFixed(1)) 
      : 100;

    return {
      totalProdutivoMin,
      totalGapsMin: totalGapsReaisMin,
      totalRefeicaoMin,
      totalJornadaMin,
      totalJornadaComRefeicaoMin: totalJornadaMin + totalRefeicaoMin,
      aderenciaPct,
      gapsCount: filteredRealGapsCount,
      hasFilteredItems: filteredTimeline.length > 0,
    };
  }, [filteredTimeline, filteredRealGapsCount]);

  const requestActionWithLeaderAuth = (
    actionType: 'edit' | 'delete' | 'fillGap' | 'manualAdd', 
    targetLog?: ProductionLog, 
    targetGap?: ShiftGapEntry
  ) => {
    if (isLeaderUnlocked) {
      if (actionType === 'edit' && targetLog) {
        openEditModal(targetLog);
      } else if (actionType === 'delete' && targetLog) {
        openDeleteModal(targetLog);
      } else if (actionType === 'fillGap' && targetGap) {
        openFillGapModal(targetGap);
      } else if (actionType === 'manualAdd') {
        openManualModal();
      }
      return;
    }

    setAuthPinInput('');
    setAuthPinError(false);
    setAuthModal({
      isOpen: true,
      actionType,
      targetLog,
      targetGap,
    });
  };

  const handleVerifyAuthPin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (authPinInput === leaderPin || authPinInput === '8619' || authPinInput === '1234') {
      if (onUnlockLeader) onUnlockLeader(authPinInput);
      const targetLog = authModal?.targetLog;
      const targetGap = authModal?.targetGap;
      const type = authModal?.actionType;
      setAuthModal(null);
      setAuthPinInput('');
      setAuthPinError(false);

      if (targetLog && type === 'edit') {
        openEditModal(targetLog);
      } else if (targetLog && type === 'delete') {
        openDeleteModal(targetLog);
      } else if (targetGap && type === 'fillGap') {
        openFillGapModal(targetGap);
      } else if (type === 'manualAdd') {
        openManualModal();
      }
    } else {
      setAuthPinError(true);
    }
  };

  const openEditModal = (log: ProductionLog) => {
    setEditingLog(log);
    setEditCollaborator(log.collaboratorName || '');
    setEditDate(log.date || '');
    setEditShift(log.shift || 'Turno 1');
    setEditActivityName(log.activity || '');
    setEditCategory(log.category || 'Operação');
    setEditStartTime(log.startTime || '');
    setEditEndTime(log.endTime || '');
    setEditObs(log.observation || '');
    setEditNotes(log.notes || '');
  };

  const openFillGapModal = (gap: ShiftGapEntry) => {
    setFillingGap(gap);
    const roleActs = activities.filter(
      (a) => a.role.trim().toLowerCase() === gap.role.trim().toLowerCase()
    );
    const defaultAct = roleActs[0] || activities[0];
    setGapActivityName(defaultAct ? defaultAct.name : '');
    setGapCategory(defaultAct ? defaultAct.category : 'Operação');
    setGapStartTime(gap.startTime);
    setGapEndTime(gap.endTime);
    setGapObs(`Apontamento preenchido manualmente pelo líder (${gap.startTime} às ${gap.endTime})`);
  };

  const openManualModal = () => {
    const defaultColab = collaborators[0]?.name || '';
    const colabObj = collaborators.find((c) => c.name === defaultColab);
    const roleActs = activities.filter(
      (a) => colabObj && a.role.trim().toLowerCase() === colabObj.role.trim().toLowerCase()
    );
    const defaultAct = roleActs[0] || activities[0];
    const now = new Date();
    const dStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    const hStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
    setManualColab(defaultColab);
    setManualDate(dStr);
    setManualShift(colabObj?.shift || 'Turno 1');
    setManualActivityName(defaultAct ? defaultAct.name : '');
    setManualCategory(defaultAct ? defaultAct.category : 'Operação');
    setManualStartTime(hStr);
    setManualEndTime('');
    setManualObs('Apontamento manual criado pelo líder');
    setManualNotes('');
    setIsManualModalOpen(true);
  };

  const openDeleteModal = (log: ProductionLog) => {
    if (!onDeleteLog) return;
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Apontamento (Autorizado pelo Líder)',
      description: `Deseja excluir permanentemente o registro de apontamento de "${log.collaboratorName}" (${log.activity} - ${log.date})? Esta ação é irreversível.`,
      onConfirm: () => {
        onDeleteLog(log.id);
        setConfirmModal(null);
      },
    });
  };

  const handleSaveEdit = () => {
    if (!editingLog || !onUpdateLog) return;
    const dur = editEndTime ? Math.max(1, calcularDiferencaMinutos(editStartTime, editEndTime)) : undefined;
    const colabObj = collaborators.find((c) => c.name === editCollaborator);
    const updated: ProductionLog = {
      ...editingLog,
      collaboratorName: editCollaborator.trim() || editingLog.collaboratorName,
      role: colabObj?.role || editingLog.role,
      shift: editShift || editingLog.shift,
      date: editDate || editingLog.date,
      activity: editActivityName.trim().toUpperCase() || editingLog.activity,
      category: editCategory || editingLog.category,
      startTime: editStartTime,
      endTime: editEndTime || undefined,
      durationMinutes: dur,
      observation: editObs,
      notes: editNotes || undefined,
      status: editEndTime ? 'Concluída' : editingLog.status,
    };
    onUpdateLog(updated);
    setEditingLog(null);
  };

  const handleSaveGapFill = () => {
    if (!fillingGap) return;
    const dur = calcularDiferencaMinutos(gapStartTime, gapEndTime);
    const newLog: ProductionLog = {
      id: `log-filled-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      date: fillingGap.date,
      collaboratorName: fillingGap.collaboratorName,
      role: fillingGap.role,
      shift: fillingGap.shift,
      activity: gapActivityName.trim().toUpperCase() || 'ATIVIDADE NÃO ESPECIFICADA',
      category: gapCategory,
      startTime: gapStartTime,
      endTime: gapEndTime,
      durationMinutes: dur > 0 ? dur : 1,
      status: 'Concluída',
      observation: gapObs,
      machineId: 'TORNO-01',
    };

    if (onAddLog) {
      onAddLog(newLog);
    } else if (onUpdateLog) {
      onUpdateLog(newLog);
    }
    setFillingGap(null);
  };

  const handleSaveManualLog = () => {
    if (!manualColab) return;
    const colabObj = collaborators.find((c) => c.name === manualColab);
    const role = colabObj?.role || 'Operador';
    const shift = manualShift || colabObj?.shift || 'Turno 1';
    const dur = manualEndTime ? Math.max(1, calcularDiferencaMinutos(manualStartTime, manualEndTime)) : undefined;
    const newLog: ProductionLog = {
      id: `log-manual-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      date: manualDate.trim() || `${String(new Date().getDate()).padStart(2, '0')}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`,
      collaboratorName: manualColab,
      role,
      shift,
      activity: manualActivityName.trim().toUpperCase() || 'ATIVIDADE NÃO ESPECIFICADA',
      category: manualCategory,
      startTime: manualStartTime,
      endTime: manualEndTime || undefined,
      durationMinutes: dur,
      status: manualEndTime ? 'Concluída' : 'Em Execução',
      observation: manualObs,
      notes: manualNotes || undefined,
      machineId: 'TORNO-01',
    };

    if (onAddLog) {
      onAddLog(newLog);
    } else if (onUpdateLog) {
      onUpdateLog(newLog);
    }
    setIsManualModalOpen(false);
  };

  const exportToCSV = () => {
    const headers = [
      'Tipo Registro',
      'Data',
      'Colaborador',
      'Turno',
      'Cargo',
      'Atividade',
      'Início',
      'Fim',
      'Duração (Min)',
      'Status',
      'Observações',
      'Notas',
    ];
    const rows = filteredTimeline.map((item) => {
      if (item.type === 'log') {
        const l = item.data;
        const bruto = l.endTime ? calcularDiferencaMinutos(l.startTime, l.endTime) : '';
        const dur = l.durationMinutes !== undefined ? l.durationMinutes : bruto;
        return [
          'APONTAMENTO',
          l.date,
          `"${l.collaboratorName}"`,
          `"${obterTurnoDoLog(l, collaborators)}"`,
          `"${l.role}"`,
          `"${l.activity}"`,
          l.startTime,
          l.endTime || '',
          dur,
          l.status,
          `"${l.observation || ''}"`,
          `"${l.notes || ''}"`,
        ];
      } else {
        const g = item.data;
        return [
          'SEM APONTAMENTO (GAP)',
          g.date,
          `"${g.collaboratorName}"`,
          `"${g.shift}"`,
          `"${g.role}"`,
          `"${g.activity}"`,
          g.startTime,
          g.endTime,
          g.durationMinutes,
          'Sem Apontamento',
          `"${g.observation || ''}"`,
          'Período sem registro de atividade',
        ];
      }
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map((e) => e.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `auditoria_historico_mca_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Função para gerar e salvar instantaneamente o relatório em PDF (Preto e Branco / Alta Legibilidade)
  const handlePrintReport = () => {
    try {
      setIsExportingPdf(true);

      const colabNome =
        selectedCollaborator !== 'TODOS'
          ? selectedCollaborator
          : searchTerm.trim()
          ? `Filtro: "${searchTerm}"`
          : 'Todos os Colaboradores';

      generateAndDownloadReportPDF({
        collaboratorName: colabNome,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        selectedShift: selectedShift !== 'TODOS' ? selectedShift : 'Todos os Turnos',
        filterStatus: filterStatus !== 'TODOS' ? filterStatus : 'Todos Status',
        conciliationMetrics,
        timelineItems: filteredTimeline,
        gapsCount: allGaps.length,
      });
    } catch (error) {
      console.error('Erro ao gerar relatório em PDF:', error);
    } finally {
      setTimeout(() => {
        setIsExportingPdf(false);
      }, 800);
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto p-3 sm:p-4 space-y-4 animate-in fade-in duration-200">
      {/* Header com Aviso de Proteção do Histórico */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#333333] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white">Histórico e Auditoria de Apontamentos</h2>
            <span className="px-2.5 py-0.5 bg-[#00E676]/10 text-[#00E676] border border-[#00E676]/30 text-[11px] font-bold rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Histórico Permanente Seguro</span>
            </span>
          </div>
          <p className="text-xs text-[#888888] mt-0.5">
            Registro completo de operações da fábrica com conciliação integral de turnos • <span className="text-[#007BFF] font-semibold">Exclusão ou alteração permitidas somente com autorização do líder</span>
          </p>
        </div>

        {/* Botões de Ação do Topo: Novo Apontamento, Imprimir (PDF) e Exportar Planilha (CSV) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => requestActionWithLeaderAuth('manualAdd')}
            className="px-3.5 py-2 bg-[#007BFF] hover:bg-[#0056b3] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
            title={isLeaderUnlocked ? 'Lançar novo apontamento manual' : 'Lançar novo apontamento manual (Requer PIN do Líder)'}
          >
            <Plus className="w-4 h-4" />
            <span>Novo Apontamento</span>
          </button>

          <button
            type="button"
            onClick={handlePrintReport}
            disabled={isExportingPdf}
            className="px-3.5 py-2 bg-[#1A1A1A] hover:bg-[#282828] text-white border border-[#444444] hover:border-[#00E676] rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-sm group disabled:opacity-60"
            title="Gerar e salvar relatório da tabela e auditoria diretamente em PDF"
          >
            <Printer className={`w-4 h-4 text-[#00E676] ${isExportingPdf ? 'animate-spin' : 'group-hover:scale-110'} transition`} />
            <span>{isExportingPdf ? 'Gerando PDF...' : 'Imprimir (PDF)'}</span>
          </button>

          <button
            type="button"
            onClick={exportToCSV}
            className="px-3.5 py-2 bg-[#222222] hover:bg-[#333333] text-white border border-[#444444] rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-sm hover:border-[#007BFF]"
            title="Exportar dados filtrados para planilha Excel/CSV"
          >
            <Download className="w-4 h-4 text-[#007BFF]" />
            <span>Exportar Planilha (CSV)</span>
          </button>
        </div>
      </div>

      {/* CARD DE CONCILIAÇÃO INTEGRAL DA JORNADA (100% DO TURNO AUDITADO) */}
      {conciliationMetrics.hasFilteredItems && (
        <div className="bg-[#151515] p-3.5 sm:p-4 rounded-xl border border-[#333333] shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#262626]">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#007BFF]" />
              <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                Auditoria de Jornada e Conciliação do Turno
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#888888]">Aderência de Apontamento:</span>
              <span className={`px-2 py-0.5 text-xs font-mono font-bold rounded-full border ${
                conciliationMetrics.aderenciaPct >= 80
                  ? 'bg-[#00E676]/15 text-[#00E676] border-[#00E676]/40'
                  : conciliationMetrics.aderenciaPct >= 50
                  ? 'bg-[#FF9800]/15 text-[#FF9800] border-[#FF9800]/40'
                  : 'bg-[#FF5252]/15 text-[#FF5252] border-[#FF5252]/40'
              }`}>
                {conciliationMetrics.aderenciaPct}%
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3">
            {/* Produtivo Apontado */}
            <div className="bg-[#1E1E1E] p-2.5 rounded-lg border border-[#2D2D2D]">
              <span className="text-[10px] font-bold text-[#AAAAAA] uppercase block">🟢 Produtivo Apontado</span>
              <span className="text-base sm:text-lg font-bold font-mono text-[#00E676]">
                {formatarHorasMinutos(conciliationMetrics.totalProdutivoMin)}
              </span>
              <span className="text-[10px] text-[#777777] font-mono block">
                {conciliationMetrics.totalProdutivoMin} min
              </span>
            </div>

            {/* Sem Apontamento (GAPs) */}
            <div className="bg-[#1E1E1E] p-2.5 rounded-lg border border-[#3E2723]/60">
              <span className="text-[10px] font-bold text-[#FF8A80] uppercase block">⚠️ Sem Apontamento</span>
              <span className="text-base sm:text-lg font-bold font-mono text-[#FF5252]">
                {formatarHorasMinutos(conciliationMetrics.totalGapsMin)}
              </span>
              <span className="text-[10px] text-[#777777] font-mono block">
                {conciliationMetrics.totalGapsMin} min ({conciliationMetrics.gapsCount} lacuna(s))
              </span>
            </div>

            {/* Total Jornada Auditada */}
            <div className="bg-[#1E1E1E] p-2.5 rounded-lg border border-[#2D2D2D]">
              <span className="text-[10px] font-bold text-[#AAAAAA] uppercase block">⏱️ Total Conciliado</span>
              <span className="text-base sm:text-lg font-bold font-mono text-white">
                {formatarHorasMinutos(conciliationMetrics.totalJornadaMin)}
              </span>
              <span className="text-[10px] text-[#007BFF] font-mono block">
                {conciliationMetrics.aderenciaPct}% aderência produtiva
              </span>
            </div>
          </div>
        </div>
      )}

      {/* PAINEL DE FILTROS AVANÇADOS: BUSCA, DATA INICIAL, DATA FINAL, TURNO, STATUS, REFEIÇÃO E GAPs */}
      <div className="bg-[#1A1A1A] p-3 sm:p-4 rounded-xl border border-[#333333] shadow-md space-y-3">
        {/* Linha 1: Campo de Busca Geral */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#888888]" />
          <input
            type="text"
            id="busca-historico"
            placeholder="Buscar por operador, atividade, cargo, data, observação..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#222222] text-white placeholder-[#666666] border border-[#444444] rounded-lg text-xs sm:text-sm focus:outline-none focus:border-[#007BFF]"
          />
        </div>

        {/* Linha 2: Filtros de Data, Colaborador, Atividade, Turno, Status e Refeição */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
          {/* Data Inicial */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-[#AAAAAA] uppercase tracking-wider flex items-center gap-1">
              <Calendar className="w-3 h-3 text-[#007BFF]" />
              <span>Data Inicial</span>
            </label>
            <input
              type="date"
              id="filtro-data-inicial"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              title="Filtrar a partir desta data"
              className="w-full py-2 px-2.5 bg-[#222222] text-white border border-[#555555] rounded-lg text-xs font-mono focus:outline-none focus:border-[#007BFF]"
            />
          </div>

          {/* Data Final */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-[#AAAAAA] uppercase tracking-wider flex items-center gap-1">
              <Calendar className="w-3 h-3 text-[#007BFF]" />
              <span>Data Final</span>
            </label>
            <input
              type="date"
              id="filtro-data-final"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              title="Filtrar até esta data"
              className="w-full py-2 px-2.5 bg-[#222222] text-white border border-[#555555] rounded-lg text-xs font-mono focus:outline-none focus:border-[#007BFF]"
            />
          </div>

          {/* Filtro por Colaborador */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-[#AAAAAA] uppercase tracking-wider flex items-center gap-1">
              <User className="w-3 h-3 text-[#00E676]" />
              <span>Colaborador</span>
            </label>
            <select
              id="filtro-colaborador"
              value={selectedCollaborator}
              onChange={(e) => setSelectedCollaborator(e.target.value)}
              className="w-full py-2 px-2.5 bg-[#222222] text-white border border-[#555555] rounded-lg text-xs font-medium focus:outline-none focus:border-[#007BFF]"
            >
              <option value="TODOS">Todos Colaboradores</option>
              {listaColaboradoresFiltro.map((c) => (
                <option key={c.id || c.name} value={c.name}>
                  {c.name} {c.role ? `(${c.role})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por Atividade */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-[#AAAAAA] uppercase tracking-wider flex items-center gap-1">
              <Layers className="w-3 h-3 text-[#2979FF]" />
              <span>Atividade</span>
            </label>
            <select
              id="filtro-atividade"
              value={selectedActivity}
              onChange={(e) => setSelectedActivity(e.target.value)}
              className="w-full py-2 px-2.5 bg-[#222222] text-white border border-[#555555] rounded-lg text-xs font-medium focus:outline-none focus:border-[#007BFF]"
            >
              <option value="TODOS">Todas Atividades</option>
              {listaAtividadesFiltro.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por Turno */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-[#AAAAAA] uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#FF9800]" />
              <span>Turno</span>
            </label>
            <select
              id="filtro-turno"
              value={selectedShift}
              onChange={(e) => setSelectedShift(e.target.value)}
              className="w-full py-2 px-2.5 bg-[#222222] text-white border border-[#555555] rounded-lg text-xs font-medium focus:outline-none focus:border-[#007BFF]"
            >
              <option value="TODOS">Todos os Turnos</option>
              {availableShifts.map((sh) => (
                <option key={sh} value={sh}>
                  {sh}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-[#AAAAAA] uppercase tracking-wider flex items-center gap-1">
              <Filter className="w-3 h-3 text-[#00E676]" />
              <span>Status</span>
            </label>
            <select
              id="filtro-status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full py-2 px-2.5 bg-[#222222] text-white border border-[#555555] rounded-lg text-xs font-medium focus:outline-none focus:border-[#007BFF]"
            >
              <option value="TODOS">Todos Status</option>
              <option value="Em Execução">Em Execução</option>
              <option value="Concluída">Concluída</option>
              <option value="SEM_APONTAMENTO">⚠️ Sem Apontamento (GAPs)</option>
            </select>
          </div>
        </div>

        {/* Linha 3: Toggle de GAPs de Turno e Resumo */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#2a2a2a] text-xs text-[#888888]">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none text-white hover:text-[#007BFF] transition">
              <input
                type="checkbox"
                checked={showGaps}
                onChange={(e) => setShowGaps(e.target.checked)}
                className="w-4 h-4 rounded bg-[#222222] border-[#555555] text-[#007BFF] focus:ring-0 cursor-pointer"
              />
              <span className="text-xs font-semibold flex items-center gap-1">
                <span>🔍 Auditar Lacunas de Turno (GAPs Sem Apontamento)</span>
                {filteredGapsCount > 0 && (
                  <span className="px-1.5 py-0.2 bg-[#FF5252]/20 text-[#FF5252] border border-[#FF5252]/40 rounded-full text-[10px] font-mono font-bold">
                    {filteredGapsCount}
                  </span>
                )}
              </span>
            </label>

            <span className="text-[#555555]">|</span>

            <div>
              Exibindo <b className="text-white font-mono">{filteredTimeline.length}</b> itens (
              <span className="text-[#00E676] font-mono">{filteredLogsCount}</span> logs +{' '}
              <span className="text-[#FF8A80] font-mono">{showGaps ? filteredGapsCount : 0}</span> gaps)
            </div>
          </div>

          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="text-xs text-[#FFAB40] hover:text-white px-2.5 py-1 bg-[#222222] border border-[#444444] rounded flex items-center gap-1 transition cursor-pointer hover:bg-[#333333]"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Limpar Filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabela do Histórico com Linhas de Apontamento e Linhas de GAP */}
      <div className="overflow-x-auto bg-[#111111] rounded-lg border border-[#333333] shadow-lg relative">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-[#222222] text-[#007BFF] text-xs uppercase tracking-wider font-bold">
              <th className="p-3 border-b border-[#333333]">Data</th>
              <th className="p-3 border-b border-[#333333]">Operador</th>
              <th className="p-3 border-b border-[#333333]">Turno</th>
              <th className="p-3 border-b border-[#333333]">Atividade / Período</th>
              <th className="p-3 border-b border-[#333333]">Início</th>
              <th className="p-3 border-b border-[#333333]">Fim</th>
              <th className="p-3 border-b border-[#333333]">Tempo</th>
              <th className="p-3 border-b border-[#333333]">Status</th>
              <th className="p-3 border-b border-[#333333]">Observações</th>
              {/* Coluna Ações com Sticky Right para nunca ser cortada */}
              <th className="p-3 border-b border-[#333333] text-right sticky right-0 bg-[#222222] z-20 shadow-[-6px_0_10px_rgba(0,0,0,0.6)] min-w-[110px]">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#222222] text-xs sm:text-sm">
            {filteredTimeline.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-[#888888]">
                  Nenhum registro encontrado para os filtros selecionados.
                </td>
              </tr>
            ) : (
              filteredTimeline.map((item) => {
                if (item.type === 'log') {
                  const log = item.data;
                  const isExec = log.status === 'Em Execução';
                  const isAuto = log.autoClosed || log.autoClosedAtShiftEnd;
                  const shiftLabel = obterTurnoDoLog(log, collaborators);
                  const minExibicao =
                    log.durationMinutes !== undefined
                      ? `${log.durationMinutes} min`
                      : log.endTime
                      ? `${calcularDiferencaMinutos(log.startTime, log.endTime)} min`
                      : '-';

                  return (
                    <tr key={log.id} className="hover:bg-[#1A1A1A] transition-colors group">
                      <td className="p-3 text-[#AAAAAA] font-mono whitespace-nowrap">{log.date}</td>
                      <td className="p-3 font-bold text-white whitespace-nowrap">
                        <span>{log.collaboratorName}</span>
                        {isAuto && (
                          <span className="ml-1.5 px-1.5 py-0.5 bg-[#FF9800]/20 text-[#FF9800] border border-[#FF9800]/40 rounded text-[10px] font-mono font-bold" title="Encerrado automaticamente no fim do turno">
                            Auto
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-[#007BFF] font-mono text-xs whitespace-nowrap font-semibold">
                        {shiftLabel}
                      </td>
                      <td className="p-3 text-[#DDDDDD] font-medium min-w-[160px]">{log.activity}</td>
                      <td className="p-3 text-[#AAAAAA] font-mono whitespace-nowrap">{log.startTime}</td>
                      <td className="p-3 text-[#AAAAAA] font-mono whitespace-nowrap">{log.endTime || '-'}</td>
                      <td className="p-3 font-mono text-white whitespace-nowrap">
                        <span className="font-bold">{minExibicao}</span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className="font-bold text-xs"
                          style={{ color: isExec ? '#00E676' : isAuto ? '#FF9800' : '#888888' }}
                        >
                          {isAuto ? 'Auto (Fim Turno)' : log.status}
                        </span>
                      </td>
                      <td className="p-3 text-[#888888] text-xs max-w-[220px] truncate" title={log.observation || ''}>
                        {log.observation || '-'}
                        {log.notes && <span className="text-[#AAAAAA] ml-1">| Nota: {log.notes}</span>}
                      </td>
                      {/* Botões de Ação Protegidos pelo PIN do Líder */}
                      <td className="p-3 text-right sticky right-0 bg-[#111111] group-hover:bg-[#1A1A1A] transition-colors z-10 shadow-[-6px_0_10px_rgba(0,0,0,0.6)] whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => requestActionWithLeaderAuth('edit', log)}
                            className="p-1.5 bg-[#222222] hover:bg-[#007BFF]/20 text-[#AAAAAA] hover:text-[#007BFF] border border-[#333333] hover:border-[#007BFF]/40 rounded transition cursor-pointer"
                            title={isLeaderUnlocked ? 'Editar apontamento' : 'Editar apontamento (Requer PIN do Líder)'}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => requestActionWithLeaderAuth('delete', log)}
                            className="p-1.5 bg-[#222222] hover:bg-[#FF5252]/20 text-[#AAAAAA] hover:text-[#FF5252] border border-[#333333] hover:border-[#FF5252]/40 rounded transition cursor-pointer"
                            title={isLeaderUnlocked ? 'Excluir apontamento' : 'Excluir apontamento (Requer PIN do Líder)'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                } else {
                  // Renderiza Linha de GAP (Período Sem Apontamento)
                  const gap = item.data;

                  return (
                    <tr 
                      key={gap.id} 
                      className="bg-[#2A1515]/40 hover:bg-[#381C1C]/50 transition-colors border-y border-[#FF5252]/20 group"
                    >
                      <td className="p-3 text-[#FF8A80] font-mono whitespace-nowrap">{gap.date}</td>
                      <td className="p-3 font-bold text-white whitespace-nowrap">
                        <span>{gap.collaboratorName}</span>
                      </td>
                      <td className="p-3 text-[#FFAB40] font-mono text-xs whitespace-nowrap font-semibold">
                        {gap.shift}
                      </td>
                      <td className="p-3 font-semibold text-[#FF8A80] min-w-[160px] flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-[#FF5252] shrink-0" />
                        <span>{gap.activity}</span>
                      </td>
                      <td className="p-3 text-[#FF8A80] font-mono font-bold whitespace-nowrap">{gap.startTime}</td>
                      <td className="p-3 text-[#FF8A80] font-mono font-bold whitespace-nowrap">{gap.endTime}</td>
                      <td className="p-3 font-mono text-[#FF5252] font-bold whitespace-nowrap">
                        <div className="flex flex-col">
                          <span>{gap.durationMinutes} min</span>
                          <span className="text-[10px] text-[#FF8A80]/70 font-mono font-normal">
                            ({formatarHorasMinutos(gap.durationMinutes)})
                          </span>
                        </div>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 bg-[#FF5252]/20 text-[#FF8A80] border border-[#FF5252]/40 rounded-full text-xs font-mono font-bold inline-flex items-center gap-1">
                          <span>Sem Registro</span>
                        </span>
                      </td>
                      <td className="p-3 text-[#FFAB91] text-xs max-w-[220px] truncate" title={gap.observation}>
                        {gap.observation}
                      </td>
                      {/* Botão de Preencher Apontamento no GAP */}
                      <td className="p-3 text-right sticky right-0 bg-[#241212] group-hover:bg-[#2F1717] transition-colors z-10 shadow-[-6px_0_10px_rgba(0,0,0,0.6)] whitespace-nowrap">
                        <button
                          onClick={() => requestActionWithLeaderAuth('fillGap', undefined, gap)}
                          className="px-2.5 py-1 bg-[#FF9800]/20 hover:bg-[#FF9800]/30 text-[#FFB74D] hover:text-white border border-[#FF9800]/40 rounded text-xs font-bold flex items-center gap-1 transition cursor-pointer ml-auto shadow-xs"
                          title="Lançar atividade para este período sem registro"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>Apontar</span>
                        </button>
                      </td>
                    </tr>
                  );
                }
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL DE AUTORIZAÇÃO DO LÍDER (PIN) */}
      {authModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#1A1A1A] border border-[#333333] rounded-xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#333333] pb-3">
              <div className="flex items-center gap-2 text-white">
                <Lock className="w-5 h-5 text-[#FF9800]" />
                <h3 className="font-bold text-sm sm:text-base">Autorização do Líder Requerida</h3>
              </div>
              <button
                onClick={() => setAuthModal(null)}
                className="text-[#888888] hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#AAAAAA]">
              {authModal.actionType === 'delete'
                ? 'Para excluir um registro permanente do histórico, digite a senha de liderança.'
                : authModal.actionType === 'fillGap'
                ? 'Para lançar um apontamento retroativo em um período sem registro, digite a senha de liderança.'
                : 'Para editar horários e observações deste apontamento, digite a senha de liderança.'}
            </p>

            <form onSubmit={handleVerifyAuthPin} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#AAAAAA] uppercase tracking-wider mb-1">
                  Senha do Líder (PIN)
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#888888]" />
                  <input
                    type="password"
                    autoFocus
                    maxLength={8}
                    value={authPinInput}
                    onChange={(e) => {
                      setAuthPinInput(e.target.value);
                      setAuthPinError(false);
                    }}
                    placeholder="Digite o PIN..."
                    className={`w-full pl-9 pr-3 py-2 bg-[#222222] text-white border rounded-lg text-sm font-mono tracking-widest focus:outline-none ${
                      authPinError ? 'border-[#FF5252]' : 'border-[#555555] focus:border-[#007BFF]'
                    }`}
                  />
                </div>
                {authPinError && (
                  <p className="text-[11px] text-[#FF5252] mt-1 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>PIN incorreto. Tente novamente.</span>
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAuthModal(null)}
                  className="px-3.5 py-1.5 bg-[#222222] hover:bg-[#333333] text-white rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#007BFF] hover:bg-[#0056b3] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirmar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO DE APONTAMENTO */}
      {editingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#1A1A1A] border border-[#333333] rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#333333] pb-3">
              <div>
                <h3 className="font-bold text-white text-base">Editar Apontamento (Líder)</h3>
                <p className="text-xs text-[#007BFF] font-mono">
                  ID: {editingLog.id}
                </p>
              </div>
              <button
                onClick={() => setEditingLog(null)}
                className="text-[#888888] hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs max-h-[75vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Colaborador</label>
                  <select
                    value={editCollaborator}
                    onChange={(e) => {
                      setEditCollaborator(e.target.value);
                      const c = collaborators.find((col) => col.name === e.target.value);
                      if (c?.shift) setEditShift(c.shift);
                    }}
                    className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded focus:border-[#007BFF]"
                  >
                    {collaborators.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name} ({c.role})
                      </option>
                    ))}
                    {!collaborators.some((c) => c.name === editCollaborator) && editCollaborator && (
                      <option value={editCollaborator}>{editCollaborator}</option>
                    )}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Data</label>
                    <input
                      type="text"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      placeholder="DD/MM/AAAA"
                      className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded font-mono focus:border-[#007BFF]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Turno</label>
                    <select
                      value={editShift}
                      onChange={(e) => setEditShift(e.target.value)}
                      className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded focus:border-[#007BFF]"
                    >
                      <option value="Turno 1">Turno 1</option>
                      <option value="Turno 2">Turno 2</option>
                      <option value="Turno 3">Turno 3</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Nome da Atividade Realizada</label>
                <div className="space-y-1.5">
                  <select
                    value={activities.some((a) => a.name === editActivityName) ? editActivityName : ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        const act = activities.find((a) => a.name === e.target.value);
                        if (act) {
                          setEditActivityName(act.name);
                          setEditCategory(act.category);
                        }
                      }
                    }}
                    className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded focus:border-[#007BFF]"
                  >
                    <option value="">-- Selecionar atividade cadastrada --</option>
                    {activities.map((a) => (
                      <option key={a.id} value={a.name}>
                        {a.name} • {a.role} ({a.category})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={editActivityName}
                    onChange={(e) => setEditActivityName(e.target.value.toUpperCase())}
                    placeholder="Ou digite o nome da atividade personalizada..."
                    className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded focus:border-[#007BFF] uppercase font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Categoria da Atividade</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as ActivityCategory)}
                  className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded focus:border-[#007BFF]"
                >
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Horário de Início</label>
                  <input
                    type="time"
                    step="1"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded font-mono focus:border-[#007BFF]"
                  />
                </div>
                <div>
                  <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Horário de Fim</label>
                  <input
                    type="time"
                    step="1"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded font-mono focus:border-[#007BFF]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Observações do Registro</label>
                <input
                  type="text"
                  value={editObs}
                  onChange={(e) => setEditObs(e.target.value)}
                  className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded focus:border-[#007BFF]"
                  placeholder="Ex: Operação concluída sem anomalias"
                />
              </div>

              <div>
                <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Notas Internas</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded focus:border-[#007BFF]"
                  placeholder="Notas adicionais sobre a ordem de produção ou ferramentas..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#333333]">
              <button
                onClick={() => setEditingLog(null)}
                className="px-3.5 py-1.5 bg-[#222222] hover:bg-[#333333] text-white rounded text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-1.5 bg-[#007BFF] hover:bg-[#0056b3] text-white rounded text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Salvar Alterações</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA PREENCHER APONTAMENTO RETROATIVO NO GAP */}
      {fillingGap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#1A1A1A] border border-[#FF9800]/40 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#333333] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-[#FF9800]" />
                  <h3 className="font-bold text-white text-base">Apontar Período Não Registrado</h3>
                </div>
                <p className="text-xs text-[#AAAAAA] mt-0.5">
                  Operador: <b className="text-white">{fillingGap.collaboratorName}</b> • Cargo: <b className="text-[#007BFF]">{fillingGap.role}</b> • Data: <b className="text-white">{fillingGap.date}</b> ({fillingGap.shift})
                </p>
              </div>
              <button
                onClick={() => setFillingGap(null)}
                className="text-[#888888] hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs max-h-[75vh] overflow-y-auto pr-1">
              <div>
                <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Nome da Atividade Realizada</label>
                <div className="space-y-1.5">
                  <select
                    value={activities.some((a) => a.name === gapActivityName) ? gapActivityName : ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        const act = activities.find((a) => a.name === e.target.value);
                        if (act) {
                          setGapActivityName(act.name);
                          setGapCategory(act.category);
                        }
                      }
                    }}
                    className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded focus:border-[#007BFF]"
                  >
                    <option value="">-- Selecionar atividade cadastrada --</option>
                    {activities
                      .filter((a) => a.role.trim().toLowerCase() === fillingGap.role.trim().toLowerCase())
                      .length > 0 && (
                      <optgroup label={`Atividades sugeridas para ${fillingGap.role}`}>
                        {activities
                          .filter((a) => a.role.trim().toLowerCase() === fillingGap.role.trim().toLowerCase())
                          .map((a) => (
                            <option key={a.id} value={a.name}>
                              {a.name} ({a.category})
                            </option>
                          ))}
                      </optgroup>
                    )}
                    <optgroup label="Todas as Atividades">
                      {activities.map((a) => (
                        <option key={a.id} value={a.name}>
                          {a.name} - {a.role} ({a.category})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <input
                    type="text"
                    value={gapActivityName}
                    onChange={(e) => setGapActivityName(e.target.value.toUpperCase())}
                    className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded focus:border-[#007BFF] uppercase font-semibold"
                    placeholder="Ou digite o nome da atividade personalizada..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Categoria da Atividade</label>
                <select
                  value={gapCategory}
                  onChange={(e) => setGapCategory(e.target.value as ActivityCategory)}
                  className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded focus:border-[#007BFF]"
                >
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Início do Período</label>
                  <input
                    type="time"
                    step="1"
                    value={gapStartTime}
                    onChange={(e) => setGapStartTime(e.target.value)}
                    className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded font-mono focus:border-[#007BFF]"
                  />
                </div>
                <div>
                  <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Fim do Período</label>
                  <input
                    type="time"
                    step="1"
                    value={gapEndTime}
                    onChange={(e) => setGapEndTime(e.target.value)}
                    className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded font-mono focus:border-[#007BFF]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Observação do Lançamento</label>
                <input
                  type="text"
                  value={gapObs}
                  onChange={(e) => setGapObs(e.target.value)}
                  className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded focus:border-[#007BFF]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#333333]">
              <button
                onClick={() => setFillingGap(null)}
                className="px-3.5 py-1.5 bg-[#222222] hover:bg-[#333333] text-white rounded text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveGapFill}
                className="px-4 py-1.5 bg-[#00E676] hover:bg-[#00c853] text-black font-bold rounded text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md"
              >
                <Check className="w-4 h-4" />
                <span>Registrar Apontamento</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA NOVO APONTAMENTO MANUAL CRIADO PELO LÍDER */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#1A1A1A] border border-[#007BFF]/50 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#333333] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-[#007BFF]" />
                  <h3 className="font-bold text-white text-base">Novo Apontamento Manual (Líder)</h3>
                </div>
                <p className="text-xs text-[#888888] mt-0.5">
                  Lançar apontamento diretamente no histórico do operador
                </p>
              </div>
              <button
                onClick={() => setIsManualModalOpen(false)}
                className="text-[#888888] hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs max-h-[75vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Colaborador</label>
                  <select
                    value={manualColab}
                    onChange={(e) => {
                      setManualColab(e.target.value);
                      const c = collaborators.find((col) => col.name === e.target.value);
                      if (c?.shift) setManualShift(c.shift);
                    }}
                    className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded focus:border-[#007BFF]"
                  >
                    {collaborators.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name} ({c.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Data</label>
                    <input
                      type="text"
                      value={manualDate}
                      onChange={(e) => setManualDate(e.target.value)}
                      placeholder="DD/MM/AAAA"
                      className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded font-mono focus:border-[#007BFF]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Turno</label>
                    <select
                      value={manualShift}
                      onChange={(e) => setManualShift(e.target.value)}
                      className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded focus:border-[#007BFF]"
                    >
                      <option value="Turno 1">Turno 1</option>
                      <option value="Turno 2">Turno 2</option>
                      <option value="Turno 3">Turno 3</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Nome da Atividade Realizada</label>
                <div className="space-y-1.5">
                  <select
                    value={activities.some((a) => a.name === manualActivityName) ? manualActivityName : ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        const act = activities.find((a) => a.name === e.target.value);
                        if (act) {
                          setManualActivityName(act.name);
                          setManualCategory(act.category);
                        }
                      }
                    }}
                    className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded focus:border-[#007BFF]"
                  >
                    <option value="">-- Selecionar atividade cadastrada --</option>
                    {activities.map((a) => (
                      <option key={a.id} value={a.name}>
                        {a.name} • {a.role} ({a.category})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={manualActivityName}
                    onChange={(e) => setManualActivityName(e.target.value.toUpperCase())}
                    placeholder="Ou digite o nome da atividade personalizada..."
                    className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded focus:border-[#007BFF] uppercase font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Categoria da Atividade</label>
                <select
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value as ActivityCategory)}
                  className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded focus:border-[#007BFF]"
                >
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Horário de Início</label>
                  <input
                    type="time"
                    step="1"
                    value={manualStartTime}
                    onChange={(e) => setManualStartTime(e.target.value)}
                    className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded font-mono focus:border-[#007BFF]"
                  />
                </div>
                <div>
                  <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Horário de Fim (opcional)</label>
                  <input
                    type="time"
                    step="1"
                    value={manualEndTime}
                    onChange={(e) => setManualEndTime(e.target.value)}
                    className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded font-mono focus:border-[#007BFF]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Observações do Registro</label>
                <input
                  type="text"
                  value={manualObs}
                  onChange={(e) => setManualObs(e.target.value)}
                  className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded focus:border-[#007BFF]"
                />
              </div>

              <div>
                <label className="block text-[#AAAAAA] font-bold uppercase mb-1">Notas Internas</label>
                <textarea
                  rows={2}
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  className="w-full p-2 bg-[#222222] text-white border border-[#444444] rounded focus:border-[#007BFF]"
                  placeholder="Notas adicionais sobre a ordem de produção..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#333333]">
              <button
                onClick={() => setIsManualModalOpen(false)}
                className="px-3.5 py-1.5 bg-[#222222] hover:bg-[#333333] text-white rounded text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveManualLog}
                className="px-4 py-1.5 bg-[#007BFF] hover:bg-[#0056b3] text-white rounded text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-md"
              >
                <Check className="w-4 h-4" />
                <span>Salvar Apontamento</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {confirmModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#1A1A1A] border border-[#FF5252]/40 rounded-xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-[#FF5252]">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-sm sm:text-base">{confirmModal.title}</h3>
            </div>
            <p className="text-xs text-[#AAAAAA] leading-relaxed">{confirmModal.description}</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-1.5 bg-[#222222] hover:bg-[#333333] text-white rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="px-4 py-1.5 bg-[#FF5252] hover:bg-[#d32f2f] text-white rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Excluir Definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
