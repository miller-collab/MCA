import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, CheckCircle2, Play, AlertTriangle, Search, Filter, 
  Clock, User, Wrench, ChevronRight, X, ArrowRight, RotateCcw,
  Zap, BellRing, Check, ShieldAlert, Tablet, Users, Settings, UserPlus, Sparkles,
  Utensils, Pause, Coffee
} from 'lucide-react';
import { ActivityItem, Collaborator, ProductionLog, ShiftConfig, ActivityCategory, AutoCloseNotification } from '../types';
import { 
  definirCorFuncao, 
  definirCorTextoHeader, 
  INITIAL_OBSERVATIONS 
} from '../data/initialData';
import { 
  formatarTempoSegundos, 
  verificarTurnoEncerrado, 
  calcularDiferencaMinutos, 
  formatarHoraPtBr,
  formatarDataPtBr,
  playFactoryChime,
  padronizarNomeTurno,
  obterTurnoAtual,
  obterNomeTurnoAtual,
  obterTurnosAtivosNoMomento,
  obterConfigTurno,
  isTurnoAtivoNoMomento,
  isColaboradorEmTurnoAtivo,
  obterConfiguracaoRefeicao,
  colaboradorJaUsouRefeicaoHoje,
  calcularEstadoTempoRefeicao
} from '../utils/factoryCalculations';
import { QuickCollaboratorModal } from './QuickCollaboratorModal';
import { findSavedCollaboratorsInBrowser } from '../utils/recoveryUtils';

interface ProductionFloorViewProps {
  logs: ProductionLog[];
  collaborators: Collaborator[];
  activities: ActivityItem[];
  shifts: ShiftConfig[];
  observations: string[];
  customRoleColors?: Record<string, string>;
  soundEnabled: boolean;
  autoCloseNotifs?: AutoCloseNotification[];
  onDismissOperatorNotif?: (id: string) => void;
  onStartActivity: (collaboratorName: string, role: string, activityName: string, category: ActivityCategory, machineId?: string, initialDescription?: string) => void;
  onFinishActivity: (logId: string, observation: string, notes: string, partsProduced?: number, scrapCount?: number, customEndTime?: string) => void;
  onPauseMeal?: (logId: string) => void;
  onResumeActivity?: (logId: string) => void;
  onQuickChangeover?: (finishLogId: string, observation: string, newActivityName: string, newCategory: ActivityCategory, machineId?: string, newInitialDescription?: string, customEndTime?: string) => void;
  onSaveCollaborators?: (colabs: Collaborator[]) => void;
  isLeaderUnlocked?: boolean;
  onUnlockLeader?: (pin: string) => boolean;
  leaderPin?: string;
  onLockLeader?: () => void;
}

export const ProductionFloorView: React.FC<ProductionFloorViewProps> = ({
  logs,
  collaborators,
  activities,
  shifts,
  observations,
  customRoleColors = {},
  soundEnabled,
  autoCloseNotifs = [],
  onDismissOperatorNotif,
  onStartActivity,
  onFinishActivity,
  onPauseMeal,
  onResumeActivity,
  onQuickChangeover,
  onSaveCollaborators,
  isLeaderUnlocked = false,
  onUnlockLeader,
  leaderPin = '8619',
  onLockLeader,
}) => {
  // Screen state: 'painel' | 'colab' | 'ativ' | 'pergunta_inicio' | 'fechamento' | 'changeover' | 'pergunta_changeover'
  const [currentScreen, setCurrentScreen] = useState<
    'painel' | 'colab' | 'ativ' | 'pergunta_inicio' | 'fechamento' | 'changeover' | 'pergunta_changeover'
  >('painel');
  const [isQuickManageOpen, setIsQuickManageOpen] = useState(false);
  const [restoreFeedback, setRestoreFeedback] = useState<string | null>(null);
  const [busyColabAction, setBusyColabAction] = useState<{ colab: Collaborator; log: ProductionLog } | null>(null);
  
  // Selection state
  const [selectedColab, setSelectedColab] = useState<Collaborator | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null);
  const [startDescription, setStartDescription] = useState('');
  const [startDescError, setStartDescError] = useState(false);
  const [changeoverActivity, setChangeoverActivity] = useState<ActivityItem | null>(null);
  const [changeoverDescription, setChangeoverDescription] = useState('');
  const [changeoverDescError, setChangeoverDescError] = useState(false);
  const [changeoverInitiatedTime, setChangeoverInitiatedTime] = useState<string>('');

  const [activitySearch, setActivitySearch] = useState('');
  const [colabSearch, setColabSearch] = useState('');
  const [selectedShiftFilter, setSelectedShiftFilter] = useState('TODOS');
  const [colabShiftFilter, setColabShiftFilter] = useState('TODOS');
  const [allowOffShiftStart, setAllowOffShiftStart] = useState(false);

  // Finish state
  const [logToFinish, setLogToFinish] = useState<ProductionLog | null>(null);
  const [finishObs, setFinishObs] = useState('');
  const [finishNotes, setFinishNotes] = useState('');
  const [partsProduced, setPartsProduced] = useState<string>('');
  const [scrapCount, setScrapCount] = useState<string>('');

  // Real-time ticking state (updates every second)
  const [secondsTick, setSecondsTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsTick(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter active logs (Em Execução e Pausada) - Garante ESTRITAMENTE 1 cartão ativo por colaborador e apenas do dia atual
  const allActiveLogs = useMemo(() => {
    const hoje = formatarDataPtBr(new Date());
    const activeMap = new Map<string, ProductionLog>();
    const rawActive = logs.filter(
      (l) =>
        (l.status === 'Em Execução' || l.status === 'Pausada') &&
        (!l.date || l.date === hoje) &&
        !l.id.startsWith('log-resume-') &&
        !l.resumedFromPreviousLogId
    );
    for (const log of rawActive) {
      const key = log.collaboratorName.trim().toLowerCase();
      if (!activeMap.has(key)) {
        activeMap.set(key, log);
      }
    }
    return Array.from(activeMap.values());
  }, [logs]);

  // Filter active logs by selected shift if desired (for multi-tablet stationing)
  const activeLogs = useMemo(() => {
    if (selectedShiftFilter === 'TODOS') return allActiveLogs;
    return allActiveLogs.filter((log) => {
      const colab = collaborators.find((c) => c.name.trim().toLowerCase() === log.collaboratorName.trim().toLowerCase());
      const shiftName = colab?.shift || log.shift || '';
      return padronizarNomeTurno(shiftName) === padronizarNomeTurno(selectedShiftFilter);
    });
  }, [allActiveLogs, selectedShiftFilter, collaborators]);

  // Active shifts for the current time (supports overlapping shifts - Foto 3)
  const currentActiveShifts = useMemo(() => obterTurnosAtivosNoMomento(shifts, new Date()), [shifts, secondsTick]);
  const currentActiveShiftNames = useMemo(
    () => currentActiveShifts.map((s) => padronizarNomeTurno(s.name)),
    [currentActiveShifts]
  );
  const currentActiveShiftName = currentActiveShiftNames[0] || 'Turno 1';

  // Set of busy collaborators (1 collaborator = 1 task at a time)
  const busyCollaborators = useMemo(() => {
    return new Set(allActiveLogs.map(l => l.collaboratorName.trim().toLowerCase()));
  }, [allActiveLogs]);

  // Todos os colaboradores ativos cadastrados sem tarefa aberta
  const allFreeCollaborators = useMemo(() => {
    return collaborators.filter(
      c => c.active && !busyCollaborators.has(c.name.trim().toLowerCase())
    );
  }, [collaborators, busyCollaborators]);

  // Colaboradores livres cujo TURNO ESTÁ ATIVO AGORA NO MOMENTO
  const availableActiveShiftCollaborators = useMemo(() => {
    return allFreeCollaborators.filter(c => {
      const colabShiftNorm = padronizarNomeTurno(c.shift);
      return currentActiveShiftNames.includes(colabShiftNorm);
    });
  }, [allFreeCollaborators, currentActiveShiftNames]);

  // Contagem de livres para exibir no botão principal do Painel
  const activeShiftFreeCount = useMemo(() => {
    if (selectedShiftFilter === 'TODOS') {
      return availableActiveShiftCollaborators.length;
    }
    const filterNorm = padronizarNomeTurno(selectedShiftFilter);
    // Se o turno filtrado não está ativo agora, o total de livres é 0
    if (!currentActiveShiftNames.includes(filterNorm)) {
      return 0;
    }
    return availableActiveShiftCollaborators.filter(
      c => padronizarNomeTurno(c.shift) === filterNorm
    ).length;
  }, [selectedShiftFilter, availableActiveShiftCollaborators, currentActiveShiftNames]);

  // Configuração do turno selecionado na aba de seleção
  const selectedTabShiftConfig = useMemo(() => {
    if (colabShiftFilter === 'TURNO_ATUAL' || colabShiftFilter === 'TODOS') return undefined;
    return obterConfigTurno(colabShiftFilter, shifts);
  }, [colabShiftFilter, shifts]);

  const isSelectedTabShiftActive = useMemo(() => {
    if (colabShiftFilter === 'TURNO_ATUAL') return true;
    if (colabShiftFilter === 'TODOS') return true;
    return isTurnoAtivoNoMomento(colabShiftFilter, shifts, new Date());
  }, [colabShiftFilter, shifts, secondsTick]);

  // Filtered available collaborators by search, active shift hours and shift tabs (includes active task status)
  const filteredAvailableColabs = useMemo(() => {
    return collaborators
      .filter((c) => c.active)
      .map((c) => {
        const activeLog = allActiveLogs.find(
          (l) => l.collaboratorName.trim().toLowerCase() === c.name.trim().toLowerCase()
        );
        return {
          ...c,
          activeLog,
        };
      })
      .filter((c) => {
        const matchSearch =
          c.name.toLowerCase().includes(colabSearch.toLowerCase()) ||
          c.role.toLowerCase().includes(colabSearch.toLowerCase());
        if (!matchSearch) return false;

        const colabShiftNorm = padronizarNomeTurno(c.shift);
        const isColabInActiveShift = currentActiveShiftNames.includes(colabShiftNorm);

        if (colabShiftFilter === 'TURNO_ATUAL') {
          return isColabInActiveShift;
        }

        if (colabShiftFilter !== 'TODOS') {
          const matchesShift = colabShiftNorm === padronizarNomeTurno(colabShiftFilter);
          if (!matchesShift) return false;
          if (!isSelectedTabShiftActive && !allowOffShiftStart) {
            return false;
          }
          return true;
        }

        if (!allowOffShiftStart) {
          return isColabInActiveShift;
        }
        return true;
      });
  }, [collaborators, allActiveLogs, colabSearch, colabShiftFilter, currentActiveShiftNames, isSelectedTabShiftActive, allowOffShiftStart]);

  // Unread operator notifications (strictly deduplicated by logId to prevent duplicate cards)
  const unreadOperatorNotifs = useMemo(() => {
    const map = new Map<string, AutoCloseNotification>();
    autoCloseNotifs
      .filter((n) => !n.readByOperator)
      .forEach((n) => {
        const key = `${n.collaboratorName.trim().toLowerCase()}_${n.date}_${n.shiftEnd}_${n.logId || n.id}`;
        if (!map.has(key)) {
          map.set(key, n);
        }
      });
    return Array.from(map.values());
  }, [autoCloseNotifs]);

  // Filtered activities for selected collaborator's role
  const roleActivities = selectedColab
    ? activities.filter(a => a.role.trim().toUpperCase() === selectedColab.role.trim().toUpperCase())
    : [];

  const filteredRoleActivities = roleActivities.filter(a =>
    a.name.toLowerCase().includes(activitySearch.toLowerCase())
  ).sort((a, b) => a.priority - b.priority);

  // Filtered and deduplicated observations for finish modal
  const sanitizedObservations = useMemo(() => {
    return Array.from(
      new Set(
        observations
          .map((o) => o.trim())
          .filter((o) => o && !o.toLowerCase().startsWith('sem observ'))
      )
    );
  }, [observations]);

  // Helper to calculate elapsed seconds for an active log
  const getElapsedSeconds = (startTime: string) => {
    if (!startTime) return 0;
    try {
      const parts = startTime.split(':');
      const now = new Date();
      const start = new Date();
      start.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2] || '0', 10), 0);
      const diff = Math.floor((now.getTime() - start.getTime()) / 1000);
      return diff > 0 ? diff : 0;
    } catch {
      return 0;
    }
  };

  // Helper to check if collaborator's shift has ended according to official shift hours
  const isShiftEndedForLog = (log: ProductionLog) => {
    const colab = collaborators.find(c => c.name.trim().toLowerCase() === log.collaboratorName.trim().toLowerCase());
    const shiftName = colab?.shift || log.shift || 'Turno 1';
    const shift = shifts.find(s => s.name.toUpperCase() === shiftName.toUpperCase() || s.code.toUpperCase() === shiftName.toUpperCase());
    
    if (shift && verificarTurnoEncerrado(shift.saida, shift.entrada, shift.dias, new Date())) {
      return true;
    }
    return false;
  };

  // Helper to check if card should flash red
  const isCardFlashing = (log: ProductionLog) => {
    return isShiftEndedForLog(log);
  };

  // Helper for role color
  const getRoleColor = (roleName: string) => {
    const r = (roleName || '').toUpperCase().trim();
    if (customRoleColors[r]) return customRoleColors[r];
    return definirCorFuncao(r);
  };

  // Handlers
  const handleOpenStartModal = () => {
    setSelectedColab(null);
    setColabSearch('');
    setActivitySearch('');
    setAllowOffShiftStart(false);
    // Default strictly to the current active shift according to current time (Foto 5)
    setColabShiftFilter('TURNO_ATUAL');
    setCurrentScreen('colab');
    if (soundEnabled) playFactoryChime('beep');
  };

  const handleSelectColab = (colab: Collaborator) => {
    setSelectedColab(colab);
    setActivitySearch('');
    setSelectedActivity(null);
    setStartDescription('');
    setStartDescError(false);
    setCurrentScreen('ativ');
  };

  const isStartingRef = useRef(false);

  // Ao clicar na atividade, abre a pergunta obrigatória: "DESCREVA EM POUCAS PALAVRAS O QUE VAI EXECUTAR AGORA ?"
  const handleSelectActivityToStart = (activity: ActivityItem) => {
    setSelectedActivity(activity);
    setStartDescription('');
    setStartDescError(false);
    setCurrentScreen('pergunta_inicio');
  };

  // Confirmação final após preencher a descrição: Inicia a contagem!
  const handleConfirmStartWithDescription = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedColab || !selectedActivity || isStartingRef.current) return;
    
    if (!startDescription.trim()) {
      setStartDescError(true);
      return;
    }

    isStartingRef.current = true;
    setTimeout(() => {
      isStartingRef.current = false;
    }, 1000);

    onStartActivity(
      selectedColab.name,
      selectedColab.role,
      selectedActivity.name,
      selectedActivity.category,
      undefined,
      startDescription.trim()
    );
    setCurrentScreen('painel');
  };

  const handleInitiateChangeoverDirectly = (log: ProductionLog) => {
    const initTime = formatarHoraPtBr(new Date());
    setLogToFinish(log);
    setFinishObs(log.observation || '');
    setFinishNotes(log.notes || log.initialDescription || '');
    setPartsProduced('');
    setScrapCount('');
    setChangeoverInitiatedTime(initTime);
    const colab = collaborators.find(
      c => c.name.trim().toLowerCase() === log.collaboratorName.trim().toLowerCase()
    );
    if (colab) {
      setSelectedColab(colab);
      setChangeoverActivity(null);
      setChangeoverDescription('');
      setChangeoverDescError(false);
      setCurrentScreen('changeover');
    }
  };

  const handleCardClick = (log: ProductionLog) => {
    const initTime = formatarHoraPtBr(new Date());
    setLogToFinish(log);
    setFinishObs(log.observation || '');
    // Preenche as notas livres com o que foi digitado no início ou salvo no log
    setFinishNotes(log.notes || log.initialDescription || '');
    setPartsProduced('');
    setScrapCount('');
    setChangeoverInitiatedTime(initTime);
    setCurrentScreen('fechamento');
  };

  const handleConfirmFinish = () => {
    if (!logToFinish) return;
    const targetId = logToFinish.id;
    const noteText = finishNotes.trim();
    const finishEndTime = changeoverInitiatedTime || undefined;
    setLogToFinish(null);
    setChangeoverInitiatedTime('');
    onFinishActivity(
      targetId,
      noteText || 'Operação Concluída com Sucesso',
      noteText,
      undefined,
      undefined,
      finishEndTime
    );
    setCurrentScreen('painel');
  };

  const handleOpenChangeover = () => {
    if (!logToFinish) return;
    const colab = collaborators.find(
      c => c.name.trim().toLowerCase() === logToFinish.collaboratorName.trim().toLowerCase()
    );
    if (colab) {
      if (!changeoverInitiatedTime) {
        setChangeoverInitiatedTime(formatarHoraPtBr(new Date()));
      }
      setSelectedColab(colab);
      setChangeoverActivity(null);
      setChangeoverDescription('');
      setChangeoverDescError(false);
      setCurrentScreen('changeover');
    }
  };

  const handleSelectChangeoverActivity = (newActivity: ActivityItem) => {
    setChangeoverActivity(newActivity);
    setChangeoverDescription('');
    setChangeoverDescError(false);
    setCurrentScreen('pergunta_changeover');
  };

  const handleConfirmChangeoverWithDescription = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!logToFinish || !changeoverActivity || !onQuickChangeover) return;

    if (!changeoverDescription.trim()) {
      setChangeoverDescError(true);
      return;
    }

    onQuickChangeover(
      logToFinish.id,
      finishNotes.trim() || 'Troca Rápida de Setup / Nova Atividade',
      changeoverActivity.name,
      changeoverActivity.category,
      undefined,
      changeoverDescription.trim(),
      changeoverInitiatedTime || undefined
    );
    setChangeoverInitiatedTime('');
    setCurrentScreen('painel');
  };

  return (
    <div className="max-w-[1200px] mx-auto p-3 sm:p-4 space-y-4">
      {/* TELA 1: PAINEL PRINCIPAL DE PRODUÇÃO */}
      {currentScreen === 'painel' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Barra de Ações Rápidas de Chão de Fábrica & Filtro de Turno do Tablet */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-[#161616] border border-[#2D2D2D] p-3 rounded-xl shadow-md">
            {/* Botão Principal de Iniciar Atividade (Grande para Touch em Tablets) */}
            <button
              id="btn-iniciar-atividade"
              onClick={handleOpenStartModal}
              className="flex-1 py-3.5 sm:py-4 px-5 sm:px-6 bg-[#0066CC] hover:bg-[#005bb5] active:bg-[#004c99] text-white font-black text-base sm:text-lg rounded-xl border border-[#005bb5] shadow-lg transition-transform transform active:scale-[0.99] flex items-center justify-center gap-2.5 cursor-pointer min-h-[54px]"
            >
              <span className="tracking-wide">➕ INICIAR NOVA ATIVIDADE</span>
              {activeShiftFreeCount > 0 && (
                <span className="bg-black/35 text-[#00E676] text-xs px-2.5 py-1 rounded-full font-mono font-bold border border-black/20">
                  {activeShiftFreeCount} livres
                </span>
              )}
            </button>

            {/* Quick Shift Filter Pills para Tablets de cada Posto/Turno */}
            <div className="flex items-center gap-1 bg-[#0F0F0F] p-1 rounded-xl border border-[#333333] shrink-0 overflow-x-auto">
              {['TODOS', 'Turno 1', 'Turno 2', 'Turno 3'].map((shiftOpt) => {
                const isActive = selectedShiftFilter === shiftOpt;
                return (
                  <button
                    key={shiftOpt}
                    onClick={() => setSelectedShiftFilter(shiftOpt)}
                    className={`px-3 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer min-h-[40px] flex items-center justify-center ${
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

          {/* Grid de Cards de Tarefas em Andamento (Otimizado para Tablets 7"-12") */}
          {activeLogs.length === 0 ? (
            <div className="p-12 text-center bg-[#181818] border border-[#2D2D2D] rounded-2xl space-y-2">
              <Users className="w-10 h-10 text-[#555555] mx-auto" />
              <p className="text-[#AAAAAA] text-base sm:text-lg font-bold">
                {selectedShiftFilter === 'TODOS'
                  ? 'Nenhuma atividade rodando no momento.'
                  : `Nenhuma atividade rodando no ${selectedShiftFilter}.`}
              </p>
              <p className="text-[#666666] text-xs sm:text-sm">
                Toque no botão azul acima para iniciar um apontamento de trabalho neste tablet.
              </p>
            </div>
          ) : (
            <div
              id="grid-ativas"
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4"
            >
              {activeLogs.map((tarefa) => {
                const corBase = getRoleColor(tarefa.role);
                const corTextoHead = definirCorTextoHeader(corBase);
                const flashing = isCardFlashing(tarefa);
                const mealState = calcularEstadoTempoRefeicao(tarefa, new Date(), shifts);
                const isPausedMeal = mealState.emPausaRefeicao;

                return (
                  <div
                    key={tarefa.id}
                    onClick={() => handleCardClick(tarefa)}
                    className={`card bg-[#141414] border rounded-xl overflow-hidden cursor-pointer flex flex-col transition-all hover:scale-[1.02] hover:border-[#666666] active:scale-[0.98] shadow-lg select-none min-h-[160px] ${
                      isPausedMeal
                        ? 'border-[#FF9800] bg-[#1A1200] ring-1 ring-[#FF9800]/50'
                        : flashing
                        ? 'card-piscar border-[#FF3D00]'
                        : 'border-[#2D2D2D]'
                    }`}
                  >
                    {/* Header com a cor do cargo ou indicação de refeição */}
                    <div
                      className="card-header p-2.5 sm:p-3 font-black text-center text-xs sm:text-sm uppercase tracking-wide truncate flex items-center justify-center gap-1.5"
                      style={{
                        backgroundColor: isPausedMeal ? '#FF8C00' : corBase,
                        color: isPausedMeal ? '#000000' : corTextoHead,
                      }}
                      title={tarefa.collaboratorName}
                    >
                      {isPausedMeal && <Utensils className="w-3.5 h-3.5 text-black shrink-0" />}
                      <span className="truncate">{tarefa.collaboratorName}</span>
                    </div>

                    {/* Body do Card */}
                    <div className="card-body p-2.5 sm:p-3 text-center flex-grow flex flex-col justify-between">
                      <div>
                        <div
                          className="card-atividade text-xs sm:text-[13px] text-[#FFFFFF] font-bold mb-1.5 min-h-[32px] line-clamp-2 leading-tight flex items-center justify-center"
                          title={tarefa.activity}
                        >
                          {tarefa.activity}
                        </div>

                        {/* Descrição informada pelo operador ao iniciar (Foto 1: O que vai executar agora) */}
                        {(tarefa.initialDescription || tarefa.notes) && (
                          <div
                            className="mb-2 px-2 py-1.5 bg-[#1C1C1C] border border-[#FFD700]/35 rounded-lg text-[11px] sm:text-xs text-[#FFE082] leading-tight line-clamp-2 text-center shadow-inner"
                            title={tarefa.initialDescription || tarefa.notes}
                          >
                            <span className="text-[#888888] text-[9px] uppercase tracking-wider font-mono font-bold block">
                              Executando:
                            </span>
                            <span className="italic font-medium">
                              "{tarefa.initialDescription || tarefa.notes}"
                            </span>
                          </div>
                        )}
                      </div>

                      {isPausedMeal ? (
                        <div className="space-y-2">
                          <div className="text-[11px] font-mono font-bold text-[#FFB74D] bg-[#2D1B00] p-1.5 rounded-lg border border-[#FF9800]/40">
                            <div className="flex items-center justify-center gap-1">
                              <Utensils className="w-3.5 h-3.5 text-[#FF9800]" />
                              <span>EM REFEIÇÃO ({mealState.duracaoPausaMinutos} MIN)</span>
                            </div>
                            <div className="text-sm font-black text-[#00E676] mt-0.5 tabular-nums">
                              {formatarTempoSegundos(mealState.tempoRestantePausaSegundos)} restantes
                            </div>
                            <div className="text-[9px] text-[#AAAAAA] mt-0.5">
                              Trabalho: {formatarTempoSegundos(mealState.tempoTrabalhadoSegundos)}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="timer text-xl sm:text-2xl font-black text-[#00E676] font-mono tracking-wider tabular-nums">
                            {formatarTempoSegundos(mealState.tempoTrabalhadoSegundos)}
                          </div>
                          <div className="text-[10px] text-[#777777] font-mono mt-0.5 flex items-center justify-center gap-1">
                            <Clock className="w-3 h-3 text-[#555555]" />
                            <span>Início: {tarefa.startTime}</span>
                          </div>
                          {mealState.pausaVenceuRetomou && (
                            <div className="mt-1 text-[9px] font-bold text-[#FFB74D] flex items-center justify-center gap-1 bg-[#2B1B00] px-1.5 py-0.5 rounded border border-[#FF9800]/30">
                              <Utensils className="w-2.5 h-2.5" />
                              <span>Refeição debitada ({mealState.duracaoPausaMinutos}m)</span>
                            </div>
                          )}
                          {flashing && (
                            <div className="mt-1 text-[10px] font-bold text-[#FF3D00] flex items-center justify-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Fim de Turno!</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TELA 2: SELEÇÃO DE COLABORADOR (Touch-Friendly para Tablet) */}
      {currentScreen === 'colab' && (
        <div className="space-y-4 max-w-3xl mx-auto animate-in fade-in duration-150">
          <div className="flex flex-wrap items-center justify-between border-b border-[#333333] pb-3 gap-2">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">Selecione seu Nome</h2>
              <p className="text-xs text-[#888888]">Toque no seu cartão para iniciar sua atividade</p>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsQuickManageOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-[#007BFF]/20 hover:bg-[#007BFF]/30 border border-[#007BFF]/50 text-[#007BFF] text-xs font-bold transition flex items-center gap-1.5 cursor-pointer min-h-[40px]"
                title="Cadastrar, editar ou restaurar lista de colaboradores (Requer Senha do Líder)"
              >
                <Users className="w-4 h-4" />
                <span>🔒 Gestão da Equipe (Líder)</span>
              </button>

              <button
                onClick={() => setCurrentScreen('painel')}
                className="text-[#888888] hover:text-white text-xs px-3.5 py-2 rounded-xl bg-[#222222] border border-[#444444] cursor-pointer min-h-[40px] flex items-center"
              >
                Voltar ao Painel
              </button>
            </div>
          </div>

          {/* Quick Notice with 1-Click Restore / Add if needed */}
          {restoreFeedback && (
            <div className="p-3 bg-[#00E676]/20 border border-[#00E676] text-[#00E676] rounded-xl text-xs font-bold flex items-center justify-between animate-in fade-in">
              <span>{restoreFeedback}</span>
              <button onClick={() => setRestoreFeedback(null)} className="text-[#00E676] hover:text-white text-xs font-bold">
                OK
              </button>
            </div>
          )}

          {/* Banner de Aviso quando o Turno selecionado ainda não iniciou no relógio */}
          {colabShiftFilter !== 'TURNO_ATUAL' && colabShiftFilter !== 'TODOS' && !isSelectedTabShiftActive && selectedTabShiftConfig && (
            <div className="p-3.5 bg-[#FF8C00]/15 border border-[#FF8C00]/40 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm animate-in fade-in">
              <div className="flex items-center gap-2.5 text-[#FFB74D]">
                <Clock className="w-5 h-5 shrink-0 text-[#FF8C00]" />
                <div>
                  <span className="font-bold">{colabShiftFilter} ({selectedTabShiftConfig.entrada} às {selectedTabShiftConfig.saida})</span>: Expediente ainda não iniciado. Os colaboradores deste turno estarão disponíveis a partir das {selectedTabShiftConfig.entrada}.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAllowOffShiftStart(!allowOffShiftStart)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer shrink-0 ${
                  allowOffShiftStart
                    ? 'bg-[#FF8C00] text-black shadow'
                    : 'bg-[#2A2A2A] text-white hover:bg-[#333333] border border-[#555555]'
                }`}
              >
                {allowOffShiftStart ? '✓ Exibindo Fora de Turno' : 'Liberar Início Excepcional'}
              </button>
            </div>
          )}

          {/* Quick Shift Filter for Operator List on Tablet (Foto 5: Filtrar por Turno Atual) */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-[#161616] p-1 rounded-xl border border-[#333333] overflow-x-auto">
              <button
                type="button"
                onClick={() => {
                  setColabShiftFilter('TURNO_ATUAL');
                  setAllowOffShiftStart(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer min-h-[36px] flex items-center gap-1.5 ${
                  colabShiftFilter === 'TURNO_ATUAL'
                    ? 'bg-[#00E676] text-black shadow-md'
                    : 'text-[#00E676] hover:bg-[#00E676]/10'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
                <span>Turno Atual ({currentActiveShiftName})</span>
              </button>

              {['Turno 1', 'Turno 2', 'Turno 3', 'TODOS'].map((shiftOpt) => {
                const isActive = colabShiftFilter === shiftOpt;
                return (
                  <button
                    key={shiftOpt}
                    type="button"
                    onClick={() => {
                      setColabShiftFilter(shiftOpt);
                      setAllowOffShiftStart(false);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer min-h-[36px] ${
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

            {/* Campo de Busca de Colaborador */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-[#777777] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filtrar por nome ou cargo..."
                value={colabSearch}
                onChange={(e) => setColabSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-[#222222] text-white border border-[#555555] rounded-xl text-sm focus:outline-none focus:border-[#007BFF] min-h-[42px]"
                autoFocus
              />
            </div>
          </div>

          {/* Grid de Colaboradores (Cards Grandes para Tablet) */}
          {filteredAvailableColabs.length === 0 ? (
            <div className="p-8 text-center bg-[#181818] border border-[#2D2D2D] rounded-2xl space-y-3">
              <p className="text-white font-bold text-base">
                {colabSearch
                  ? 'Nenhum colaborador encontrado com este filtro.'
                  : !isSelectedTabShiftActive && selectedTabShiftConfig
                  ? `O ${colabShiftFilter} (${selectedTabShiftConfig.entrada} - ${selectedTabShiftConfig.saida}) ainda não iniciou. Colaboradores estarão disponíveis a partir das ${selectedTabShiftConfig.entrada}.`
                  : `Nenhum colaborador disponível neste filtro.`}
              </p>
              {!isSelectedTabShiftActive && selectedTabShiftConfig && !allowOffShiftStart && (
                <div>
                  <button
                    type="button"
                    onClick={() => setAllowOffShiftStart(true)}
                    className="px-4 py-2 bg-[#2A2000] hover:bg-[#3A2D00] text-[#FFB74D] font-bold text-xs rounded-xl border border-[#FF8C00]/40 cursor-pointer inline-flex items-center gap-2"
                  >
                    <Clock className="w-4 h-4 text-[#FF8C00]" />
                    <span>Liberar operador fora de turno (Exceção / Hora Extra)</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredAvailableColabs.map((colab) => {
                const corFuncao = getRoleColor(colab.role);
                const assignedShift = shifts.find(
                  (s) =>
                    s.name.toUpperCase() === colab.shift.toUpperCase() ||
                    s.code.toUpperCase() === colab.shift.toUpperCase() ||
                    colab.shift.toUpperCase().includes(s.name.toUpperCase())
                );
                const isShiftInactive = assignedShift && (!assignedShift.dias || assignedShift.dias.length === 0);
                const isOutOfCurrentShift = !currentActiveShiftNames.includes(padronizarNomeTurno(colab.shift));
                const hasRecentAutoClose = autoCloseNotifs.some(n => n.collaboratorName === colab.name && !n.readByOperator);
                const isBusy = !!colab.activeLog;

                return (
                  <button
                    key={colab.id}
                    onClick={() => {
                      if (colab.activeLog) {
                        setBusyColabAction({ colab, log: colab.activeLog });
                      } else {
                        handleSelectColab(colab);
                      }
                    }}
                    className={`p-3.5 sm:p-4 bg-[#1C1C1C] hover:bg-[#282828] active:bg-[#333333] text-white rounded-xl text-left transition-all border cursor-pointer flex flex-col justify-between relative shadow-md hover:scale-[1.01] active:scale-[0.98] min-h-[110px] ${
                      isBusy
                        ? 'border-[#00E676]/60 bg-[#16221A]'
                        : hasRecentAutoClose
                        ? 'border-[#FF9800] bg-[#2A2000]'
                        : isOutOfCurrentShift
                        ? 'border-[#FF8C00]/40 bg-[#1F1A12]'
                        : 'border-[#333333]'
                    }`}
                    style={{ borderTop: `5px solid ${corFuncao}` }}
                  >
                    {isBusy ? (
                      <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-[#00E676] text-black text-[9px] font-black rounded flex items-center gap-1 shadow-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                        Em Atividade
                      </span>
                    ) : hasRecentAutoClose ? (
                      <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-[#FF9800] text-black text-[9px] font-black rounded" title="Possui aviso de encerramento automático">
                        Aviso
                      </span>
                    ) : (
                      <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-[#2A2A2A] text-[#888888] text-[9px] font-bold rounded">
                        Livre
                      </span>
                    )}
                    <div>
                      <div className="font-black text-sm sm:text-base text-white truncate w-full pr-16" title={colab.name}>
                        {colab.name}
                      </div>
                      <div className="text-xs text-[#AAAAAA] truncate mt-0.5 font-medium" title={colab.role}>
                        {colab.role}
                      </div>
                      {isBusy && colab.activeLog && (
                        <div className="text-[11px] text-[#00E676] truncate font-bold mt-1.5 flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded">
                          <Play className="w-3 h-3 text-[#00E676] shrink-0" />
                          <span className="truncate">{colab.activeLog.activity}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono mt-2 w-full gap-1 pt-1 border-t border-[#262626]">
                      <span className="text-[#007BFF] font-bold truncate">
                        {padronizarNomeTurno(colab.shift)} {assignedShift ? `(${assignedShift.entrada}-${assignedShift.saida})` : ''}
                      </span>
                      {isOutOfCurrentShift ? (
                        <span className="text-[#FF8C00] font-bold text-[9px] px-1 bg-[#FF8C00]/20 rounded shrink-0" title="Fora do horário do turno atual">
                          Inicia {assignedShift?.entrada || 'depois'}
                        </span>
                      ) : isShiftInactive ? (
                        <span className="text-[#FF3D00] font-bold text-[9px] px-1 bg-[#FF3D00]/20 rounded shrink-0">
                          Inativo
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Modal de Ação quando Operador Já Possui Atividade Ativa */}
          {busyColabAction && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4 animate-in fade-in duration-150">
              <div className="bg-[#181818] border border-[#333333] rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-3">
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#00E676] animate-pulse" />
                      {busyColabAction.colab.name} Já Está em Atividade
                    </h3>
                    <p className="text-xs text-[#888888] mt-0.5">
                      {busyColabAction.colab.role} • {padronizarNomeTurno(busyColabAction.colab.shift)}
                    </p>
                  </div>
                  <button
                    onClick={() => setBusyColabAction(null)}
                    className="p-1 rounded-lg text-[#888888] hover:text-white hover:bg-[#252525] transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-3 bg-[#111111] border border-[#2D2D2D] rounded-xl space-y-1">
                  <div className="text-[11px] text-[#888888] uppercase tracking-wider font-bold">
                    Operação em Execução Agora:
                  </div>
                  <div className="text-sm font-black text-[#00E676] flex items-center gap-1.5">
                    <Play className="w-4 h-4 text-[#00E676] shrink-0" />
                    <span>{busyColabAction.log.activity}</span>
                  </div>
                  <div className="text-xs text-[#CCCCCC] font-mono">
                    Iniciado às: <strong>{busyColabAction.log.startTime}</strong>
                  </div>
                </div>

                <p className="text-xs text-[#AAAAAA] leading-relaxed">
                  O que você deseja fazer para <strong>{busyColabAction.colab.name}</strong>?
                </p>

                <div className="space-y-2 pt-1">
                  {/* Opção 1: Trocar Atividade (Changeover) */}
                  <button
                    onClick={() => {
                      const log = busyColabAction.log;
                      setBusyColabAction(null);
                      handleInitiateChangeoverDirectly(log);
                    }}
                    className="w-full py-3 px-4 bg-[#007BFF] hover:bg-[#0069D9] active:bg-[#0056B3] text-white font-black text-sm rounded-xl transition flex items-center justify-between cursor-pointer shadow-md"
                  >
                    <div className="flex items-center gap-2">
                      <RotateCcw className="w-4 h-4" />
                      <span>Trocar Atividade (Changeover Rápido)</span>
                    </div>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  {/* Opção 2: Finalizar Atividade Atual */}
                  <button
                    onClick={() => {
                      const log = busyColabAction.log;
                      setBusyColabAction(null);
                      handleCardClick(log);
                    }}
                    className="w-full py-3 px-4 bg-[#222222] hover:bg-[#2D2D2D] active:bg-[#333333] text-[#00E676] border border-[#00E676]/40 font-bold text-sm rounded-xl transition flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#00E676]" />
                      <span>Finalizar Atividade Atual</span>
                    </div>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  {/* Opção 3: Ver Cartão no Painel */}
                  <button
                    onClick={() => {
                      setBusyColabAction(null);
                      setCurrentScreen('painel');
                    }}
                    className="w-full py-2.5 px-4 bg-[#1E1E1E] hover:bg-[#282828] text-[#CCCCCC] text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    Ver Cartão no Painel Principal
                  </button>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => setCurrentScreen('painel')}
            className="w-full py-3.5 bg-[#2A2A2A] hover:bg-[#333333] text-white font-bold rounded-xl border border-[#444444] transition cursor-pointer min-h-[48px]"
          >
            Voltar ao Painel
          </button>
        </div>
      )}

      {/* TELA 3: SELEÇÃO DE ATIVIDADE */}
      {currentScreen === 'ativ' && selectedColab && (
        <div className="max-w-xl mx-auto space-y-4 animate-in fade-in duration-150">
          <div className="border-b border-[#333333] pb-3">
            <h2 className="text-xl sm:text-2xl font-bold text-white">Selecione a Operação</h2>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-sm font-bold text-white">
                Colaborador: <span className="text-[#007BFF]">{selectedColab.name}</span>
              </span>
              <span
                className="text-[10px] font-black px-2 py-0.5 rounded"
                style={{
                  backgroundColor: getRoleColor(selectedColab.role),
                  color: definirCorTextoHeader(getRoleColor(selectedColab.role)),
                }}
              >
                {selectedColab.role}
              </span>
            </div>
          </div>

          {/* Aviso se o colaborador tiver ocorrência recente de auto-fechamento */}
          {autoCloseNotifs.some(n => n.collaboratorName === selectedColab.name && !n.readByOperator) && (
            <div className="bg-[#2A1D00] border border-[#FF9800] p-3 rounded-xl text-xs text-[#FFE082] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[#FF9800] shrink-0 mt-0.5" />
              <div>
                <b className="text-white">Atenção {selectedColab.name}:</b> Sua última atividade foi encerrada automaticamente pelo sistema no fim do turno anterior porque você não a finalizou manualmente.
              </div>
            </div>
          )}

          {/* Campo de Busca de Atividade */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#777777] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filtrar rotinas e operações..."
              value={activitySearch}
              onChange={(e) => setActivitySearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-[#222222] text-white border border-[#555555] rounded-xl text-sm focus:outline-none focus:border-[#007BFF] min-h-[48px]"
              autoFocus
            />
          </div>

          {/* Lista de Atividades filtradas para a função */}
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {filteredRoleActivities.length === 0 ? (
              <div className="p-6 text-center bg-[#181818] border border-[#2D2D2D] rounded-xl text-sm text-[#888888]">
                Nenhuma atividade encontrada para o cargo <b>{selectedColab.role}</b>.
              </div>
            ) : (
              filteredRoleActivities.map((act) => (
                <button
                  key={act.id}
                  onClick={() => handleSelectActivityToStart(act)}
                  className="w-full p-4 bg-[#1C1C1C] hover:bg-[#282828] active:bg-[#333333] text-left text-white rounded-xl border border-[#333333] hover:border-[#007BFF] transition-all flex items-center justify-between gap-3 group cursor-pointer shadow-sm min-h-[56px]"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-sm sm:text-base text-white group-hover:text-[#007BFF] transition-colors truncate">
                      {act.name}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-bold text-[#FF8C00] font-mono bg-black/40 px-1.5 py-0.5 rounded">
                        P{act.priority}
                      </span>
                      <span className="text-xs text-[#888888]">{act.category}</span>
                      {act.standardMinutes && (
                        <span className="text-xs text-[#00E676] font-mono">
                          • {act.standardMinutes} min padrão
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#555555] group-hover:text-white shrink-0" />
                </button>
              ))
            )}
          </div>

          <button
            onClick={() => setCurrentScreen('colab')}
            className="w-full py-3.5 bg-[#2A2A2A] hover:bg-[#333333] text-white font-bold rounded-xl border border-[#444444] transition cursor-pointer min-h-[48px]"
          >
            Voltar
          </button>
        </div>
      )}

      {/* TELA 3.5: PERGUNTA OBRIGATÓRIA AO INICIAR (FOTO 1: FRASE SOMENTE DENTRO DA CAIXA COM MAIS ESPAÇO) */}
      {currentScreen === 'pergunta_inicio' && selectedColab && selectedActivity && (
        <div className="max-w-xl mx-auto space-y-4 animate-in fade-in duration-150">
          <div className="p-3.5 bg-[#181818] border border-[#2D2D2D] rounded-xl flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-[#888888]">Colaborador:</div>
              <div className="text-sm sm:text-base font-bold text-white">{selectedColab.name}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#888888]">Operação Selecionada:</div>
              <div className="text-sm sm:text-base font-bold text-[#007BFF] truncate max-w-[240px]">
                {selectedActivity.name}
              </div>
            </div>
          </div>

          <form onSubmit={handleConfirmStartWithDescription} className="space-y-4">
            <div>
              <textarea
                id="input-descricao-inicio"
                rows={5}
                required
                autoFocus
                placeholder="DESCREVA EM POUCAS PALAVRAS O QUE VAI FAZER EXECUTAR AGORA DENTRO DA OPERAÇÃO SELECIONADA..."
                value={startDescription}
                onChange={(e) => {
                  setStartDescription(e.target.value);
                  if (startDescError && e.target.value.trim()) {
                    setStartDescError(false);
                  }
                }}
                className={`w-full p-4 bg-[#1F1F1F] text-white border rounded-xl text-sm sm:text-base focus:outline-none transition resize-none min-h-[140px] placeholder:text-[#888888] ${
                  startDescError
                    ? 'border-[#FF3D00] ring-1 ring-[#FF3D00] bg-[#2A1515]'
                    : 'border-[#555555] focus:border-[#007BFF] focus:ring-1 focus:ring-[#007BFF]'
                }`}
              />
              {startDescError && (
                <p className="text-xs text-[#FF5252] font-bold mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Por favor, descreva em poucas palavras o que vai fazer executar agora.</span>
                </p>
              )}
              <p className="text-xs text-[#888888] mt-1.5">
                ⏱️ A contagem do tempo de trabalho iniciará imediatamente após a confirmação.
              </p>
            </div>

            <button
              type="submit"
              id="btn-iniciar-contagem"
              disabled={!startDescription.trim()}
              className={`w-full py-4 sm:py-5 font-black text-base sm:text-lg rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[58px] ${
                startDescription.trim()
                  ? 'bg-[#00E676] hover:bg-[#00c853] active:bg-[#00b248] text-black border border-[#00c853] active:scale-[0.99]'
                  : 'bg-[#2A2A2A] text-[#777777] border border-[#3A3A3A] cursor-not-allowed opacity-75'
              }`}
            >
              <Play className="w-6 h-6 fill-current" />
              <span>INICIAR ATIVIDADE & CONTAGEM</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentScreen('ativ')}
              className="w-full py-3.5 bg-[#2A2A2A] hover:bg-[#333333] text-white font-bold rounded-xl border border-[#444444] transition cursor-pointer min-h-[48px]"
            >
              Voltar e Escolher Outra Operação
            </button>
          </form>
        </div>
      )}

      {/* TELA 4: FECHAMENTO / CONCLUIR ATIVIDADE (FOTO 2 SIMPLIFICADA) */}
      {currentScreen === 'fechamento' && logToFinish && (() => {
        const colab = collaborators.find(
          (c) => c.name.trim().toLowerCase() === logToFinish.collaboratorName.trim().toLowerCase()
        );
        const mealConfig = obterConfiguracaoRefeicao(colab?.shift || logToFinish.shift || 'Turno 1', shifts);
        const jaUsouRefeicaoHoje = colaboradorJaUsouRefeicaoHoje(logToFinish.collaboratorName, logToFinish.date, logs);
        const isPausedMeal = logToFinish.status === 'Pausada' || !!logToFinish.isMealPause;

        return (
          <div className="max-w-xl mx-auto space-y-4 animate-in fade-in duration-150">
            <div className="border-b border-[#333333] pb-3">
              <h2 className="text-xl sm:text-2xl font-bold text-white">
                {isPausedMeal ? 'Atividade em Pausa de Refeição' : 'Concluir Atividade'}
              </h2>

              {/* Box de Informações da Atividade */}
              <div className="p-3.5 bg-[#181818] border border-[#2D2D2D] rounded-xl mt-2 flex items-center justify-between gap-3">
                <div className="text-xs sm:text-sm space-y-1.5 flex-1 min-w-0">
                  <p className="text-[#BBB] truncate">
                    Colaborador: <b className="text-white text-base">{logToFinish.collaboratorName}</b>
                  </p>
                  <p className="text-[#BBB] truncate">
                    Operação: <b className="text-[#007BFF]">{logToFinish.activity}</b>
                  </p>
                  <p className="text-[#BBB] truncate">
                    Hora Início: <b className="text-white font-mono">{logToFinish.startTime}</b> • Tempo Total:{' '}
                    <b className="text-[#00E676] font-mono text-base">
                      {formatarTempoSegundos(getElapsedSeconds(logToFinish.startTime))}
                    </b>
                  </p>
                </div>

                {/* Badge visual de identificação do colaborador / cargo */}
                <div className="hidden sm:flex flex-col items-center justify-center p-3 rounded-xl border border-[#333333] bg-[#141414] min-w-[130px] max-w-[170px] text-center shrink-0">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm text-black shadow-md mb-1.5"
                    style={{ backgroundColor: getRoleColor(colab?.role || logToFinish.role || '') }}
                  >
                    {(logToFinish.collaboratorName || 'C').slice(0, 2).toUpperCase()}
                  </div>
                  <span
                    className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded tracking-wide truncate max-w-full"
                    style={{
                      backgroundColor: `${getRoleColor(colab?.role || logToFinish.role || '')}22`,
                      color: getRoleColor(colab?.role || logToFinish.role || ''),
                    }}
                    title={colab?.role || logToFinish.role || 'Operador'}
                  >
                    {colab?.role || logToFinish.role || 'Operador'}
                  </span>
                  <span className="text-[10px] text-[#888888] font-mono mt-0.5">
                    {colab?.shift || logToFinish.shift || 'Turno 1'}
                  </span>
                </div>
              </div>
            </div>

            {/* Notas Adicionais Livres (Foto 2: Campo preservado para anotações do fechamento) */}
            <div>
              <label className="block text-xs font-bold text-white mb-1.5">
                Notas Adicionais Livres:
              </label>
              <textarea
                id="texto-notas"
                rows={3}
                placeholder="Digite uma anotação extra se necessário..."
                value={finishNotes}
                onChange={(e) => setFinishNotes(e.target.value)}
                className="w-full p-3 bg-[#222222] text-white border border-[#555555] rounded-xl text-sm focus:outline-none focus:border-[#007BFF] resize-none"
              />
            </div>

            {/* Botão de Troca Rápida de Setup */}
            {onQuickChangeover && (
              <button
                onClick={handleOpenChangeover}
                className="w-full py-3 bg-[#4A148C] hover:bg-[#6A1B9A] text-white font-bold rounded-xl border border-[#7B1FA2] text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition min-h-[46px]"
              >
                <Zap className="w-4 h-4 text-[#FFD700]" />
                <span>TROCA RÁPIDA (ENCERRAR E INICIAR PRÓXIMA)</span>
              </button>
            )}

            {/* Botões de Ação */}
            <button
              onClick={handleConfirmFinish}
              className="w-full py-4 bg-[#00E676] hover:bg-[#00c853] active:bg-[#00b248] text-black font-black text-base sm:text-lg rounded-xl border border-[#00c853] shadow-lg transition-transform active:scale-[0.99] cursor-pointer min-h-[54px]"
            >
              CONFIRMAR ENCERRAMENTO
            </button>

            <button
              onClick={() => setCurrentScreen('painel')}
              className="w-full py-3 bg-[#333333] hover:bg-[#444444] text-white font-bold rounded-xl border border-[#555555] transition cursor-pointer min-h-[46px]"
            >
              Cancelar
            </button>
          </div>
        );
      })()}

      {/* TELA 5: TROCA RÁPIDA (CHANGEOVER) */}
      {currentScreen === 'changeover' && logToFinish && selectedColab && (
        <div className="max-w-xl mx-auto space-y-4 animate-in fade-in duration-150">
          <div className="border-b border-[#333333] pb-3">
            <h2 className="text-xl font-bold text-[#FFD700] flex items-center gap-2">
              <Zap className="w-5 h-5" />
              <span>Troca Rápida de Operação</span>
            </h2>
            <p className="text-xs text-[#CCCCCC] mt-1">
              Encerrando tarefa atual de <b>{selectedColab.name}</b> e iniciando a próxima imediatamente.
            </p>
          </div>

          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {filteredRoleActivities.map((act) => (
              <button
                key={act.id}
                onClick={() => handleSelectChangeoverActivity(act)}
                className="w-full p-4 bg-[#1C1C1C] hover:bg-[#282828] text-left text-white rounded-xl border border-[#333333] hover:border-[#00E676] transition flex items-center justify-between gap-3 group cursor-pointer min-h-[54px]"
              >
                <div className="min-w-0">
                  <div className="font-bold text-sm sm:text-base text-white group-hover:text-[#00E676] transition-colors truncate">
                    {act.name}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold text-[#FF8C00] font-mono bg-black/40 px-1.5 py-0.5 rounded">
                      P{act.priority}
                    </span>
                    <span className="text-xs text-[#888888]">{act.category}</span>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-[#555555] group-hover:text-[#00E676] shrink-0" />
              </button>
            ))}
          </div>

          <button
            onClick={() => setCurrentScreen('fechamento')}
            className="w-full py-3 bg-[#333333] hover:bg-[#444444] text-white font-bold rounded-xl border border-[#555555] cursor-pointer min-h-[46px]"
          >
            Voltar ao Fechamento Normal
          </button>
        </div>
      )}

      {/* TELA 5.5: PERGUNTA PARA TROCA RÁPIDA (FRASE SOMENTE DENTRO DA CAIXA COM MAIS ESPAÇO) */}
      {currentScreen === 'pergunta_changeover' && logToFinish && selectedColab && changeoverActivity && (
        <div className="max-w-xl mx-auto space-y-4 animate-in fade-in duration-150">
          <div className="p-3.5 bg-[#181818] border border-[#2D2D2D] rounded-xl flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-[#888888]">Colaborador:</div>
              <div className="text-sm sm:text-base font-bold text-white">{selectedColab.name}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#888888]">Nova Operação:</div>
              <div className="text-sm sm:text-base font-bold text-[#FFD700] truncate max-w-[240px]">
                {changeoverActivity.name}
              </div>
            </div>
          </div>

          {changeoverInitiatedTime && (
            <div className="px-3.5 py-2.5 bg-[#141414] border border-[#2E2E2E] rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 text-[#AAAAAA]">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[#FFD700]" />
                <span>Tarefa anterior encerrada às: <b className="text-[#00E676] font-mono font-bold text-sm">{changeoverInitiatedTime}</b></span>
              </div>
              <span className="text-[11px] text-[#FFB74D] font-mono bg-black/40 px-2 py-0.5 rounded border border-[#333333]">
                ⏳ Nova contagem inicia ao confirmar
              </span>
            </div>
          )}

          <form onSubmit={handleConfirmChangeoverWithDescription} className="space-y-4">
            <div>
              <textarea
                id="input-descricao-changeover"
                rows={5}
                required
                autoFocus
                placeholder="DESCREVA EM POUCAS PALAVRAS O QUE VAI FAZER EXECUTAR AGORA DENTRO DA OPERAÇÃO SELECIONADA..."
                value={changeoverDescription}
                onChange={(e) => {
                  setChangeoverDescription(e.target.value);
                  if (changeoverDescError && e.target.value.trim()) {
                    setChangeoverDescError(false);
                  }
                }}
                className={`w-full p-4 bg-[#1F1F1F] text-white border rounded-xl text-sm sm:text-base focus:outline-none transition resize-none min-h-[140px] placeholder:text-[#888888] ${
                  changeoverDescError
                    ? 'border-[#FF3D00] ring-1 ring-[#FF3D00] bg-[#2A1515]'
                    : 'border-[#555555] focus:border-[#00E676] focus:ring-1 focus:ring-[#00E676]'
                }`}
              />
              {changeoverDescError && (
                <p className="text-xs text-[#FF5252] font-bold mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Por favor, descreva em poucas palavras o que vai fazer executar agora.</span>
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={!changeoverDescription.trim()}
              className={`w-full py-4 sm:py-5 font-black text-base sm:text-lg rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[58px] ${
                changeoverDescription.trim()
                  ? 'bg-[#00E676] hover:bg-[#00c853] active:bg-[#00b248] text-black border border-[#00c853] active:scale-[0.99]'
                  : 'bg-[#2A2A2A] text-[#777777] border border-[#3A3A3A] cursor-not-allowed opacity-75'
              }`}
            >
              <Zap className="w-5 h-5 text-black" />
              <span>FINALIZAR ANTERIOR & INICIAR NOVA CONTAGEM</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentScreen('changeover')}
              className="w-full py-3.5 bg-[#2A2A2A] hover:bg-[#333333] text-white font-bold rounded-xl border border-[#444444] transition cursor-pointer min-h-[48px]"
            >
              Voltar
            </button>
          </form>
        </div>
      )}

      {/* MODAL DE GESTÃO RÁPIDA DE COLABORADORES */}
      <QuickCollaboratorModal
        isOpen={isQuickManageOpen}
        onClose={() => setIsQuickManageOpen(false)}
        collaborators={collaborators}
        shifts={shifts}
        customRoleColors={customRoleColors}
        isLeaderUnlocked={isLeaderUnlocked}
        onUnlockLeader={onUnlockLeader}
        leaderPin={leaderPin}
        onLockLeader={onLockLeader}
        onSaveCollaborators={(newColabs) => {
          if (onSaveCollaborators) {
            onSaveCollaborators(newColabs);
          }
        }}
        onRestoreFromBackup={() => {
          const rec = findSavedCollaboratorsInBrowser();
          if (rec.found && onSaveCollaborators) {
            onSaveCollaborators(rec.collaborators);
            setRestoreFeedback(`Restaurados ${rec.collaborators.length} operadores do backup (${rec.sourceKey}) com sucesso!`);
            return true;
          }
          return false;
        }}
      />
    </div>
  );
};
