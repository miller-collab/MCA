import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  BarChart3, RefreshCw, Sparkles, TrendingUp, AlertTriangle, 
  CheckCircle2, Clock, Lock, KeyRound, ArrowDown, UserCheck, 
  HelpCircle, ChevronRight, Zap, Settings, Activity, BellRing,
  Check, Trash2, ExternalLink, ShieldAlert, Search, Calendar,
  RotateCcw, Filter, Upload, Download, Database, Tablet, Share2, Copy, X, AlertCircle
} from 'lucide-react';
import { 
  ProductionLog, 
  Collaborator, 
  ShiftConfig, 
  OperatorEfficiency,
  AIAnalysisResponse,
  ActivityItem,
  AutoCloseNotification
} from '../types';
import { 
  calcularEficienciaEquipe, 
  calcularMetricasKPI, 
  formatarHorasMinutos, 
  calcularDiferencaMinutos,
  formatarDataPtBr,
  verificarDataNoPeriodo,
  obterTurnoDoLog,
  padronizarNomeTurno,
  obterDataHojeIsoPtBr
} from '../utils/factoryCalculations';
import { FactoryConfigManager } from './FactoryConfigManager';

interface LeaderDashboardViewProps {
  logs: ProductionLog[];
  collaborators: Collaborator[];
  activities: ActivityItem[];
  shifts: ShiftConfig[];
  observations: string[];
  customRoleColors?: Record<string, string>;
  customRoles?: string[];
  deletedRoles?: string[];
  isUnlocked: boolean;
  toleranceMinutes?: number;
  onUpdateToleranceMinutes?: (newMin: number) => void;
  efficiencyThresholdGreen?: number;
  efficiencyThresholdYellow?: number;
  onUpdateEfficiencyThresholds?: (green: number, yellow: number) => void;
  autoCloseNotifs?: AutoCloseNotification[];
  onDismissLeaderNotif?: (notifId: string) => void;
  onClearAllNotifs?: () => void;
  onNavigateToHistory?: (filterName?: string) => void;
  onUnlock: (pin: string) => boolean;
  onLock: () => void;
  onSimulateShiftAutoClose?: () => void;
  onDrilldownClick?: (operatorName: string) => void;
  onResetProductionLogs?: () => Promise<void> | void;
  onRestoreProductionLogs?: (logs: ProductionLog[], notifs?: AutoCloseNotification[]) => Promise<void> | void;
  onExportBackup?: () => void;
  onExportFullBackup?: () => void;
  onRestoreFullBackup?: (payload: any) => Promise<boolean>;
  onForceSync?: () => void;
  onUpdateCollaborators: (colabs: Collaborator[]) => void;
  onUpdateActivities: (activities: ActivityItem[]) => void;
  onUpdateShifts: (shifts: ShiftConfig[]) => void;
  onUpdateObservations: (obs: string[]) => void;
  onUpdateRoleColors?: (colors: Record<string, string>) => void;
  onUpdateRoles?: (roles: string[], deletedRoles?: string[]) => void;
  onResetToDefaults: () => void;
}

export const LeaderDashboardView: React.FC<LeaderDashboardViewProps> = ({
  logs,
  collaborators,
  activities,
  shifts,
  observations,
  customRoleColors,
  customRoles,
  deletedRoles,
  isUnlocked,
  toleranceMinutes: propToleranceMinutes = 60,
  onUpdateToleranceMinutes,
  efficiencyThresholdGreen: propGreen = 85,
  efficiencyThresholdYellow: propYellow = 70,
  onUpdateEfficiencyThresholds,
  autoCloseNotifs = [],
  onDismissLeaderNotif,
  onClearAllNotifs,
  onNavigateToHistory,
  onUnlock,
  onLock,
  onSimulateShiftAutoClose,
  onDrilldownClick,
  onResetProductionLogs,
  onRestoreProductionLogs,
  onExportBackup,
  onExportFullBackup,
  onRestoreFullBackup,
  onForceSync,
  onUpdateCollaborators,
  onUpdateActivities,
  onUpdateShifts,
  onUpdateObservations,
  onUpdateRoleColors,
  onUpdateRoles,
  onResetToDefaults,
}) => {
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // Leader Top Section Switch: 'indicadores' | 'configuracao'
  const [leaderSection, setLeaderSection] = useState<'indicadores' | 'configuracao'>('indicadores');

  // Modal e Estados para Reset e Restauração de Produção
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Estados de Backups Diários e Link para Tablets & PC
  const [showDailyBackupsModal, setShowDailyBackupsModal] = useState(false);
  const [dailyBackups, setDailyBackups] = useState<Array<{
    filename: string;
    backupDate: string;
    generatedAt: string;
    logsCount: number;
    collaboratorsCount: number;
    sizeBytes?: number;
  }>>([]);
  const [loadingDailyBackups, setLoadingDailyBackups] = useState(false);
  const [restoringDailyFilename, setRestoringDailyFilename] = useState<string | null>(null);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [copiedLeaderLink, setCopiedLeaderLink] = useState(false);

  // Computação da URL oficial para tablets e PCs
  const tabletShareUrl = typeof window !== 'undefined'
    ? (window.location.origin.includes('ais-dev-')
        ? window.location.origin.replace('ais-dev-', 'ais-pre-')
        : window.location.origin)
    : 'https://ais-pre-gwrra2voihf2jayigewyrm-795025193395.us-east1.run.app';

  const fetchDailyBackups = async () => {
    try {
      setLoadingDailyBackups(true);
      const res = await fetch('/api/daily-backups');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.backups)) {
          setDailyBackups(json.backups);
        }
      }
    } catch {
      // Ignore network error
    } finally {
      setLoadingDailyBackups(false);
    }
  };

  const handleRestoreDailyBackup = async (filename: string, dateLabel: string) => {
    if (!window.confirm(`Deseja realmente restaurar os dados do dia ${dateLabel}? O estado atual da fábrica será substituído por este backup.`)) {
      return;
    }
    try {
      setRestoringDailyFilename(filename);
      const res = await fetch('/api/daily-backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResetFeedback({
          type: 'success',
          message: `Sucesso! Backup do dia ${dateLabel} restaurado e sincronizado com todos os tablets da fábrica.`,
        });
        if (onForceSync) onForceSync();
        setShowDailyBackupsModal(false);
      } else {
        throw new Error(data.error || 'Erro ao restaurar backup diário');
      }
    } catch (err: any) {
      setResetFeedback({
        type: 'error',
        message: `Falha ao restaurar dia ${dateLabel}: ${err.message}`,
      });
    } finally {
      setRestoringDailyFilename(null);
    }
  };

  const handleCreateInstantDailyBackup = async () => {
    try {
      setCreatingBackup(true);
      const res = await fetch('/api/daily-backups/create', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setResetFeedback({
          type: 'success',
          message: 'Ponto de restauração diário criado e salvo com sucesso no servidor!',
        });
        fetchDailyBackups();
      }
    } catch (err: any) {
      setResetFeedback({
        type: 'error',
        message: `Erro ao criar ponto de restauração: ${err.message}`,
      });
    } finally {
      setCreatingBackup(false);
    }
  };

  useEffect(() => {
    fetchDailyBackups();
  }, []);

  // Efficiency thresholds state in Leader view
  const [editGreen, setEditGreen] = useState<number>(propGreen);
  const [editYellow, setEditYellow] = useState<number>(propYellow);
  const [thresholdSavedMsg, setThresholdSavedMsg] = useState(false);

  // Sync with prop changes
  React.useEffect(() => {
    setEditGreen(propGreen);
  }, [propGreen]);
  React.useEffect(() => {
    setEditYellow(propYellow);
  }, [propYellow]);

  // Handler para confirmação de reset de produção
  const handleConfirmReset = async () => {
    if (!onResetProductionLogs) return;
    try {
      setIsResetting(true);
      await onResetProductionLogs();
      setIsResetting(false);
      setShowResetModal(false);
      setResetFeedback({
        type: 'success',
        message: 'Base de produção resetada com sucesso! O backup em JSON foi baixado automaticamente para seu computador.',
      });
      setTimeout(() => setResetFeedback(null), 7000);
    } catch (err: any) {
      setIsResetting(false);
      setResetFeedback({
        type: 'error',
        message: `Erro ao resetar base: ${err?.message || 'Falha na operação'}`,
      });
      setTimeout(() => setResetFeedback(null), 7000);
    }
  };

  // Handler para upload e restauração do arquivo de backup JSON
  const handleRestoreFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);

        let logsToRestore: ProductionLog[] = [];
        let notifsToRestore: AutoCloseNotification[] = [];

        if (Array.isArray(parsed)) {
          logsToRestore = parsed;
        } else if (parsed && Array.isArray(parsed.logs)) {
          logsToRestore = parsed.logs;
          if (Array.isArray(parsed.autoCloseNotifs)) {
            notifsToRestore = parsed.autoCloseNotifs;
          }
        } else {
          throw new Error('Arquivo JSON inválido ou não reconhecido como backup do MCA.');
        }

        if (onRestoreProductionLogs) {
          await onRestoreProductionLogs(logsToRestore, notifsToRestore);
          setResetFeedback({
            type: 'success',
            message: `Sucesso! ${logsToRestore.length} registros de produção restaurados na nuvem e sincronizados.`,
          });
          setTimeout(() => setResetFeedback(null), 7000);
        }
      } catch (err: any) {
        setResetFeedback({
          type: 'error',
          message: `Falha ao carregar backup: ${err?.message || 'Formato JSON incorreto'}`,
        });
        setTimeout(() => setResetFeedback(null), 7000);
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  const handleSaveThresholds = () => {
    const validGreen = Math.max(1, Math.min(100, Number(editGreen) || 85));
    const validYellow = Math.max(0, Math.min(validGreen - 1, Number(editYellow) || 70));
    setEditGreen(validGreen);
    setEditYellow(validYellow);
    if (onUpdateEfficiencyThresholds) {
      onUpdateEfficiencyThresholds(validGreen, validYellow);
    }
    setThresholdSavedMsg(true);
    setTimeout(() => setThresholdSavedMsg(false), 3500);
  };

  const handleResetThresholds = () => {
    setEditGreen(85);
    setEditYellow(70);
    if (onUpdateEfficiencyThresholds) {
      onUpdateEfficiencyThresholds(85, 70);
    }
    setThresholdSavedMsg(true);
    setTimeout(() => setThresholdSavedMsg(false), 3500);
  };

  // Filters state
  const [filterDate, setFilterDate] = useState(() => obterDataHojeIsoPtBr());
  const [localToleranceMinutes, setLocalToleranceMinutes] = useState(propToleranceMinutes);
  const toleranceMinutes = onUpdateToleranceMinutes ? propToleranceMinutes : localToleranceMinutes;
  const handleSetToleranceMinutes = (val: number) => {
    if (onUpdateToleranceMinutes) {
      onUpdateToleranceMinutes(val);
    } else {
      setLocalToleranceMinutes(val);
    }
  };
  const [tableSearch, setTableSearch] = useState('');
  const [tableStartDate, setTableStartDate] = useState('');
  const [tableEndDate, setTableEndDate] = useState('');
  const [tableShiftFilter, setTableShiftFilter] = useState('TODOS');

  // Available shifts list strictly: Turno 1, Turno 2, Turno 3
  const availableShifts = useMemo(() => {
    return ['Turno 1', 'Turno 2', 'Turno 3'];
  }, []);

  // AI State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const tableRef = useRef<HTMLDivElement>(null);

  // Date format DD/MM/YYYY for data processing
  const formattedFilterDate = useMemo(() => {
    if (!filterDate) return formatarDataPtBr(new Date());
    const parts = filterDate.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }, [filterDate]);

  // Overall KPIs
  const kpis = useMemo(() => {
    return calcularMetricasKPI(logs);
  }, [logs]);

  // Count auto-closed logs (shift auto close)
  const autoClosedCount = useMemo(() => {
    return logs.filter(l => l.autoClosed || l.autoClosedAtShiftEnd).length;
  }, [logs]);

  const unreadLeaderNotifs = useMemo(() => {
    return autoCloseNotifs.filter(n => !n.readByLeader);
  }, [autoCloseNotifs]);

  // Team Efficiency Calculation (mirroring original Google Apps Script logic)
  const efficiencyData = useMemo(() => {
    return calcularEficienciaEquipe(logs, collaborators, shifts, formattedFilterDate, toleranceMinutes);
  }, [logs, collaborators, shifts, formattedFilterDate, toleranceMinutes]);

  // Table Logs Filter with Data Inicial, Data Final and Turnos
  const tableLogs = useMemo(() => {
    return logs.filter((log) => {
      const term = tableSearch.toLowerCase().trim();
      const itemShift = obterTurnoDoLog(log, collaborators);

      const matchTerm =
        !term ||
        log.collaboratorName.toLowerCase().includes(term) ||
        log.activity.toLowerCase().includes(term) ||
        log.status.toLowerCase().includes(term) ||
        itemShift.toLowerCase().includes(term) ||
        (log.observation && log.observation.toLowerCase().includes(term)) ||
        (log.notes && log.notes.toLowerCase().includes(term));

      const matchDatePeriod = verificarDataNoPeriodo(log.date, tableStartDate, tableEndDate);

      const matchShift =
        tableShiftFilter === 'TODOS' ||
        padronizarNomeTurno(itemShift) === padronizarNomeTurno(tableShiftFilter);

      return matchTerm && matchDatePeriod && matchShift;
    });
  }, [logs, tableSearch, tableStartDate, tableEndDate, tableShiftFilter, collaborators]);

  // Handle PIN Unlock
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUnlock(pinInput)) {
      setPinError(false);
      setPinInput('');
    } else {
      setPinError(true);
    }
  };

  // Handle Click on Operator Card (Scroll and Filter Table)
  const handleOperatorCardClick = (operatorName: string) => {
    setTableSearch(operatorName);
    if (onDrilldownClick) onDrilldownClick(operatorName);
    if (tableRef.current) {
      tableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Generate Gemini AI Diagnostic
  const handleGenerateAiDiagnostic = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const response = await fetch('/api/ai/shift-diagnostic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: formattedFilterDate,
          kpis,
          efficiency: efficiencyData,
          totalOperators: collaborators.length,
          autoClosedCount,
        }),
      });

      if (!response.ok) {
        throw new Error('Falha ao obter diagnóstico inteligente.');
      }

      const result = await response.json();
      setAiAnalysis(result);
    } catch (err: any) {
      setAiError(err.message || 'Erro ao conectar com a IA');
    } finally {
      setAiLoading(false);
    }
  };

  // If locked, show PIN lock screen
  if (!isUnlocked) {
    return (
      <div className="max-w-md mx-auto p-6 mt-8 bg-[#1E1E1E] border border-[#333333] rounded-xl text-center space-y-4 shadow-2xl">
        <div className="w-14 h-14 bg-[#222222] border border-[#444444] rounded-full flex items-center justify-center mx-auto text-[#007BFF]">
          <Lock className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Acesso Restrito do Líder</h2>
          <p className="text-xs text-[#888888] mt-1">
            Digite a senha PIN de acesso para visualizar os indicadores e a configuração da fábrica.
          </p>
        </div>

        <form onSubmit={handlePinSubmit} className="space-y-3">
          <input
            type="password"
            maxLength={10}
            placeholder="Digite a Senha PIN"
            value={pinInput}
            onChange={(e) => {
              setPinInput(e.target.value);
              setPinError(false);
            }}
            className="w-full p-3.5 bg-[#111111] text-white border border-[#555555] rounded-lg text-center text-lg font-mono tracking-widest focus:outline-none focus:border-[#007BFF]"
            autoFocus
          />

          {pinError && (
            <p className="text-[#FF3D00] text-xs font-bold animate-shake">
              🚨 Senha incorreta! Tente novamente.
            </p>
          )}

          <button
            type="submit"
            className="w-full py-3.5 bg-[#0066CC] hover:bg-[#005bb5] text-white font-bold rounded-lg transition cursor-pointer"
          >
            DESBLOQUEAR PAINEL
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto p-3 sm:p-4 space-y-6 animate-in fade-in duration-200">
      {/* Header com título, alternador de abas e bloqueio */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#333333] pb-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>PAINEL DO LÍDER DE PRODUÇÃO</span>
          </h2>
          <p className="text-xs text-[#888888]">
            Gestão operacional, auditoria de eficiência e configuração completa da fábrica
          </p>
        </div>

        {/* Abas de Navegação Interna do Líder */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-[#111111] p-1 rounded-lg border border-[#333333]">
            <button
              onClick={() => setLeaderSection('indicadores')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                leaderSection === 'indicadores'
                  ? 'bg-[#007BFF] text-white shadow'
                  : 'text-[#AAAAAA] hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Indicadores & Eficiência</span>
              {unreadLeaderNotifs.length > 0 && (
                <span className="bg-[#FF9800] text-black text-[10px] px-1.5 py-0.2 rounded-full font-black">
                  {unreadLeaderNotifs.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setLeaderSection('configuracao')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                leaderSection === 'configuracao'
                  ? 'bg-[#00E676] text-black shadow'
                  : 'text-[#00E676] hover:bg-[#222222]'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>⚙️ Configurar Fábrica</span>
            </button>
          </div>

          {/* Grupo de Ferramentas: Backups Diários, Download e Conexão de Tablets */}
          <div className="flex items-center gap-1.5 border-l border-[#333333] pl-2.5 flex-wrap">
            {/* Input File Oculto para Restaurar Backup JSON */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".json,application/json"
              onChange={handleRestoreFileUpload}
              className="hidden"
            />

            {/* 1. Botão: Backups Diários & Restaurar Dias Passados */}
            <button
              onClick={() => {
                setShowDailyBackupsModal(true);
                fetchDailyBackups();
              }}
              className="px-2.5 py-1.5 bg-[#1E293B] hover:bg-[#0284C7] text-[#38BDF8] hover:text-white border border-[#38BDF8]/40 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              title="Gerenciar e restaurar dias passados da fábrica salvos automaticamente no servidor"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Backups Diários (Restaurar Dias)</span>
              {dailyBackups.length > 0 && (
                <span className="bg-[#0284C7] text-white text-[9.5px] px-1.5 py-0.2 rounded-full font-mono">
                  {dailyBackups.length}
                </span>
              )}
            </button>

            {/* 2. Botão: Salvar Tudo (Download JSON) */}
            <button
              onClick={() => {
                if (onExportFullBackup) {
                  onExportFullBackup();
                } else if (onExportBackup) {
                  onExportBackup();
                }
              }}
              className="px-2.5 py-1.5 bg-[#161616] hover:bg-[#1E293B] text-[#94A3B8] hover:text-[#00E676] border border-[#2D2D2D] hover:border-[#00E676]/40 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Baixar arquivo de segurança JSON completo com registros, colaboradores e configurações no seu computador"
            >
              <Download className="w-3.5 h-3.5 text-[#00E676]" />
              <span className="hidden sm:inline">Salvar Tudo (Download JSON)</span>
              <span className="sm:hidden">Salvar Tudo</span>
            </button>

            {/* 3. Botão: Link Tablets & PC */}
            <button
              onClick={() => {
                const el = document.getElementById('tablet-connection-card');
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                navigator.clipboard.writeText(tabletShareUrl);
                setCopiedLeaderLink(true);
                setTimeout(() => setCopiedLeaderLink(false), 3000);
              }}
              className="px-2.5 py-1.5 bg-[#121E28] hover:bg-[#1A2E3B] text-[#38BDF8] border border-[#38BDF8]/30 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Copiar e visualizar o Link Oficial para Tablets e Computadores"
            >
              <Share2 className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>{copiedLeaderLink ? 'Link Copiado!' : 'Link Tablets & PC'}</span>
            </button>

            {/* 4. Botão: Resetar Registros (Limpar Testes) */}
            {onResetProductionLogs && (
              <button
                onClick={() => setShowResetModal(true)}
                className="px-2.5 py-1.5 bg-[#2A0808] hover:bg-[#3D0C0C] text-[#FF8A80] hover:text-[#FF5252] border border-[#FF5252]/40 hover:border-[#FF5252] rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm shadow-[#FF5252]/10"
                title="Resetar registros de produção de teste mantendo colaboradores, turnos e configurações intactos. O backup será salvo automaticamente."
              >
                <Trash2 className="w-3.5 h-3.5 text-[#FF5252]" />
                <span>Resetar Registros (Limpar Testes)</span>
              </button>
            )}
          </div>

          {/* Botão de Simulação Discreto Apenas no Painel do Líder */}
          {onSimulateShiftAutoClose && (
            <button
              onClick={onSimulateShiftAutoClose}
              className="px-2.5 py-1.5 bg-[#161616] hover:bg-[#222222] text-[#888888] hover:text-[#FFB300] border border-[#2D2D2D] hover:border-[#FF9800]/40 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition cursor-pointer"
              title="Ferramenta do Líder: Simular encerramento de turno para fechar automaticamente tarefas ativas esquecidas"
            >
              <Clock className="w-3.5 h-3.5 text-[#FF9800]/60" />
              <span>Simular Fim de Turno</span>
            </button>
          )}

          <button
            onClick={onLock}
            className="px-3 py-1.5 bg-[#222222] hover:bg-[#333333] text-[#888888] hover:text-white border border-[#444444] rounded-lg text-xs font-bold transition cursor-pointer"
            title="Bloquear painel"
          >
            <Lock className="w-3.5 h-3.5 inline mr-1" />
            Bloquear
          </button>
        </div>
      </div>

      {/* Alerta / Feedback de Operações de Reset / Restauração */}
      {resetFeedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs font-bold transition ${
            resetFeedback.type === 'success'
              ? 'bg-[#00E676]/10 border-[#00E676]/40 text-[#00E676]'
              : 'bg-[#FF5252]/10 border-[#FF5252]/40 text-[#FF5252]'
          }`}
        >
          <div className="flex items-center gap-2">
            {resetFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{resetFeedback.message}</span>
          </div>
          <button
            onClick={() => setResetFeedback(null)}
            className="text-xs underline hover:opacity-80 cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DO RESET DE REGISTROS DE PRODUÇÃO */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-[#FF5252]/50 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-3 border-b border-[#333333] pb-3">
              <div className="p-2.5 rounded-xl bg-[#FF5252]/20 text-[#FF5252] shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                  <span>Resetar Registros de Produção</span>
                  <span className="text-[10px] bg-[#FF5252] text-black font-black px-1.5 py-0.5 rounded uppercase">
                    Limpar Testes
                  </span>
                </h3>
                <p className="text-xs text-[#AAAAAA] mt-0.5">
                  Prepare a base para início operacional oficial zerando os logs de teste
                </p>
              </div>
            </div>

            <div className="bg-[#241212] border border-[#FF5252]/30 rounded-xl p-3.5 text-xs text-[#FFCDD2] space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-[#FF5252]">
                <ShieldAlert className="w-4 h-4" />
                <span>O que vai acontecer:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[#E0E0E0] pl-1">
                <li>
                  <strong className="text-white">Backup Automático:</strong> Um arquivo JSON com todos os{' '}
                  <strong className="text-[#00E676]">{logs.length} registros atuais</strong> será salvo e baixado no seu computador imediatamente antes da exclusão.
                </li>
                <li>
                  <strong className="text-white">Apenas Registros:</strong> Somente os apontamentos de produção e alertas de fim de turno serão apagados.
                </li>
                <li>
                  <strong className="text-[#00E676]">Configurações Preservadas:</strong> Colaboradores, Turnos, Horários, Atividades, Cores e Regras permanecerão <strong>100% intactos</strong>.
                </li>
                <li>
                  <strong className="text-white">Restauração a Qualquer Momento:</strong> Você poderá restaurar os registros quando quiser usando o botão "Restaurar Registros (JSON)".
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#2A2A2A]">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                disabled={isResetting}
                className="px-4 py-2 bg-[#262626] hover:bg-[#333333] text-[#CCCCCC] hover:text-white rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                disabled={isResetting}
                className="px-4 py-2 bg-[#D32F2F] hover:bg-[#F44336] text-white rounded-lg text-xs font-black flex items-center gap-2 transition cursor-pointer shadow-lg shadow-[#D32F2F]/30"
              >
                {isResetting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Salvando Backup e Resetando...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar Backup e Resetar Agora</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE GERENCIAMENTO DE BACKUPS DIÁRIOS & RESTAURAÇÃO HISTÓRICA */}
      {showDailyBackupsModal && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#181818] border border-[#38BDF8]/50 rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-[#2A2A2A] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-[#38BDF8]/20 text-[#38BDF8] shrink-0 border border-[#38BDF8]/30">
                  <Calendar className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    <span>Backups Diários & Restauração Histórica</span>
                  </h3>
                  <p className="text-xs text-[#AAAAAA] mt-0.5">
                    Histórico gravado no servidor central. Restaure qualquer dia anterior com 1 clique.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDailyBackupsModal(false)}
                className="p-1 rounded-md text-[#888888] hover:text-white hover:bg-[#252525] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ações Rápidas do Modal */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-[#111111] rounded-xl border border-[#252525]">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreateInstantDailyBackup}
                  disabled={creatingBackup}
                  className="px-3 py-1.5 bg-[#00E676]/15 hover:bg-[#00E676]/30 text-[#00E676] border border-[#00E676]/40 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{creatingBackup ? 'Salvando...' : 'Salvar Ponto Hoje'}</span>
                </button>
                <button
                  onClick={fetchDailyBackups}
                  disabled={loadingDailyBackups}
                  className="px-2.5 py-1.5 bg-[#222222] hover:bg-[#333333] text-[#CCCCCC] hover:text-white border border-[#3A3A3A] rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                  title="Recarregar lista de backups do servidor"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingDailyBackups ? 'animate-spin' : ''}`} />
                  <span>Atualizar</span>
                </button>
              </div>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1.5 bg-[#1E293B] hover:bg-[#334155] text-[#38BDF8] border border-[#38BDF8]/40 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                title="Carregar arquivo de backup manual JSON do seu computador"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Carregar Arquivo JSON</span>
              </button>
            </div>

            {/* Lista dos Dias Salvos no Servidor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-[#888888]">
                <span>Pontos Diários Gravados no Servidor</span>
                <span className="text-[#38BDF8] font-mono">{dailyBackups.length} dia(s) disponível(is)</span>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {loadingDailyBackups ? (
                  <div className="p-6 text-center text-xs text-[#888888]">
                    Carregando histórico do servidor...
                  </div>
                ) : dailyBackups.length === 0 ? (
                  <div className="p-6 bg-[#111111] rounded-xl border border-[#222222] text-center text-xs text-[#777777] space-y-1">
                    <p className="font-bold text-[#AAAAAA]">Nenhum ponto diário anterior encontrado.</p>
                    <p>Clique no botão verde acima "Salvar Ponto Hoje" para registrar o primeiro dia de produção.</p>
                  </div>
                ) : (
                  dailyBackups.map((b) => (
                    <div
                      key={b.filename}
                      className="p-3 bg-[#131313] hover:bg-[#1A1A1A] border border-[#282828] hover:border-[#38BDF8]/40 rounded-xl flex items-center justify-between gap-3 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-black text-white font-mono">{b.backupDate}</span>
                          <span className="text-[10px] text-[#00E676] bg-[#00E676]/10 border border-[#00E676]/30 px-2 py-0.5 rounded font-mono font-bold">
                            {b.logsCount} registros
                          </span>
                          <span className="text-[10px] text-[#38BDF8] bg-[#38BDF8]/10 border border-[#38BDF8]/30 px-2 py-0.5 rounded font-mono">
                            {b.collaboratorsCount} colaboradores
                          </span>
                        </div>
                        <p className="text-[11px] text-[#888888] truncate mt-1">
                          Arquivo: <span className="font-mono text-[#666666]">{b.filename}</span> • Gravado às{' '}
                          {new Date(b.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>

                      <button
                        disabled={restoringDailyFilename === b.filename}
                        onClick={() => handleRestoreDailyBackup(b.filename, b.backupDate)}
                        className="shrink-0 px-3 py-2 bg-[#0284C7] hover:bg-[#0369A1] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50 shadow-md"
                        title="Restaurar toda a fábrica para como estava neste dia"
                      >
                        <RotateCcw className={`w-3.5 h-3.5 ${restoringDailyFilename === b.filename ? 'animate-spin' : ''}`} />
                        <span>{restoringDailyFilename === b.filename ? 'Restaurando...' : 'Restaurar Dia'}</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-[#262626] flex items-center justify-between text-xs text-[#777777]">
              <span>Ao restaurar um dia, os dados são transmitidos automaticamente a todos os tablets.</span>
              <button
                onClick={() => setShowDailyBackupsModal(false)}
                className="font-bold text-white hover:underline cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENDERIZAÇÃO: SEÇÃO 1 - CONFIGURAÇÃO DA FÁBRICA */}
      {leaderSection === 'configuracao' && (
        <FactoryConfigManager
          collaborators={collaborators}
          activities={activities}
          shifts={shifts}
          observations={observations}
          customRoleColors={customRoleColors}
          customRoles={customRoles}
          deletedRoles={deletedRoles}
          efficiencyThresholdGreen={propGreen}
          efficiencyThresholdYellow={propYellow}
          onUpdateEfficiencyThresholds={onUpdateEfficiencyThresholds}
          onUpdateCollaborators={onUpdateCollaborators}
          onUpdateActivities={onUpdateActivities}
          onUpdateShifts={onUpdateShifts}
          onUpdateObservations={onUpdateObservations}
          onUpdateRoleColors={onUpdateRoleColors}
          onUpdateRoles={onUpdateRoles}
          onResetToDefaults={onResetToDefaults}
        />
      )}

      {/* RENDERIZAÇÃO: SEÇÃO 2 - INDICADORES OPERACIONAIS */}
      {leaderSection === 'indicadores' && (
        <div className="space-y-6">
          {/* CARTÃO EM DESTAQUE: LINK OFICIAL DE ACESSO PARA TABLETS E COMPUTADORES (FOTO 1) */}
          <div
            id="tablet-connection-card"
            className="p-4 sm:p-5 rounded-2xl bg-[#0F172A] border-2 border-[#38BDF8]/50 shadow-2xl space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#334155]/60 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/40">
                  <Tablet className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-black text-white tracking-wide">
                      LINK DE ACESSO PARA OS TABLETS E COMPUTADORES DA FÁBRICA
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-[#00E676]/20 border border-[#00E676]/40 text-[#00E676] text-[10px] font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00E676] animate-pulse"></span>
                      Sincronização Ativa em Tempo Real
                    </span>
                  </div>
                  <p className="text-xs text-[#94A3B8] mt-0.5">
                    Abra este endereço no Google Chrome de qualquer tablet nos postos e no computador dos líderes. Não necessita de login ou senha!
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowDailyBackupsModal(true);
                    fetchDailyBackups();
                  }}
                  className="px-3 py-1.5 bg-[#1E293B] hover:bg-[#334155] text-[#38BDF8] border border-[#38BDF8]/40 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Pontos Diários ({dailyBackups.length})</span>
                </button>
                <button
                  onClick={handleCreateInstantDailyBackup}
                  disabled={creatingBackup}
                  className="px-3 py-1.5 bg-[#00E676]/20 hover:bg-[#00E676]/30 text-[#00E676] border border-[#00E676]/40 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
                  title="Salvar ponto de restauração diário agora no servidor"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{creatingBackup ? 'Salvando...' : 'Salvar Ponto Hoje'}</span>
                </button>
              </div>
            </div>

            {/* Input com o Link Oficial Copiável */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
              <div className="flex-1 bg-[#090D16] border border-[#334155] rounded-xl px-3.5 py-2.5 flex items-center gap-2 min-w-0">
                <span className="text-xs text-[#64748B] font-mono select-none">LINK:</span>
                <input
                  type="text"
                  readOnly
                  value={tabletShareUrl}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="w-full bg-transparent text-[#38BDF8] font-mono text-xs sm:text-sm font-bold tracking-wide focus:outline-none select-all truncate"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(tabletShareUrl);
                    setCopiedLeaderLink(true);
                    setTimeout(() => setCopiedLeaderLink(false), 3000);
                  }}
                  className={`px-4 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md ${
                    copiedLeaderLink
                      ? 'bg-[#00E676] text-black ring-2 ring-[#00E676]/50'
                      : 'bg-[#0284C7] hover:bg-[#0369A1] text-white'
                  }`}
                >
                  {copiedLeaderLink ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedLeaderLink ? 'LINK COPIADO!' : 'COPIAR LINK'}</span>
                </button>

                <a
                  href={tabletShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2.5 bg-[#1E293B] hover:bg-[#334155] text-[#CBD5E1] hover:text-white border border-[#475569] rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  title="Abrir o link do sistema em uma nova aba do navegador"
                >
                  <ExternalLink className="w-4 h-4 text-[#38BDF8]" />
                  <span className="hidden sm:inline">Abrir em Nova Aba</span>
                </a>
              </div>
            </div>
          </div>
          {/* PAINEL DE AUDITORIA DE ENCERRAMENTO AUTOMÁTICO DE TURNO PARA O LÍDER */}
          {autoCloseNotifs.length > 0 && (
            <div className="bg-[#1C1400] border border-[#FF9800] rounded-xl p-4 sm:p-5 shadow-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#FF9800]/40 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-[#FF9800]/20 rounded-lg text-[#FFB300]">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                      <span>Auditoria do Líder: Operações Encerradas no Fim de Turno</span>
                      {unreadLeaderNotifs.length > 0 && (
                        <span className="px-2 py-0.5 bg-[#FF3D00] text-white text-xs font-black rounded-full animate-pulse">
                          {unreadLeaderNotifs.length} pendente(s) de revisão
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-[#FFCC80]">
                      Colaboradores que esqueceram de fechar a atividade antes do término do turno foram finalizados automaticamente.
                    </p>
                  </div>
                </div>

                {onClearAllNotifs && (
                  <button
                    onClick={onClearAllNotifs}
                    className="text-xs text-[#FFAB40] hover:text-white px-2.5 py-1 bg-[#2A1E00] border border-[#FF9800]/50 rounded flex items-center gap-1 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpar Histórico de Alertas</span>
                  </button>
                )}
              </div>

              {/* Lista de Notificações */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                {autoCloseNotifs.map((notif) => (
                  <div
                    key={notif.id}
                    className={`p-3 rounded-lg border flex flex-col justify-between gap-2 text-xs transition ${
                      !notif.readByLeader
                        ? 'bg-[#2A1E00] border-[#FF9800] shadow-sm'
                        : 'bg-[#151000] border-[#443300] opacity-80'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-sm">{notif.collaboratorName}</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-[#FF9800]/20 text-[#FFE082] rounded font-mono">
                          {notif.shiftName} ({notif.shiftEnd})
                        </span>
                      </div>
                      <div className="text-[#FFE082] font-medium">
                        Atividade: <span className="text-white font-bold">{notif.activity}</span>
                      </div>
                      <div className="text-[11px] text-[#FFB74D]">
                        Data: {notif.date} • Auto-fechada às {notif.shiftEnd}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-[#FF9800]/20 gap-2">
                      <span className="text-[10px] text-[#AAAAAA]">
                        {!notif.readByLeader ? '⚠️ Não revisado' : '✅ Revisado pelo líder'}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {onNavigateToHistory && (
                          <button
                            onClick={() => onNavigateToHistory(notif.collaboratorName)}
                            className="px-2 py-1 bg-[#222222] hover:bg-[#333333] text-[#007BFF] rounded text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                            title="Ver e ajustar histórico deste operador"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Histórico</span>
                          </button>
                        )}

                        {!notif.readByLeader && onDismissLeaderNotif && (
                          <button
                            onClick={() => onDismissLeaderNotif(notif.id)}
                            className="px-2.5 py-1 bg-[#FF9800] hover:bg-[#FFA726] text-black font-bold rounded text-[11px] flex items-center gap-1 transition cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            <span>Revisado</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Botão Diagnóstico IA */}
          <div className="flex justify-end">
            <button
              onClick={handleGenerateAiDiagnostic}
              disabled={aiLoading}
              className="px-4 py-2 bg-[#6A1B9A] hover:bg-[#7B1FA2] text-white rounded-lg text-xs font-bold flex items-center gap-2 transition disabled:opacity-50 cursor-pointer shadow-md"
            >
              <Sparkles className="w-4 h-4 text-[#FFD700]" />
              <span>{aiLoading ? 'Analisando Turno...' : 'Gerar Diagnóstico IA (Gemini)'}</span>
            </button>
          </div>

          {/* Caixa de Diagnóstico IA (se gerado) */}
          {aiAnalysis && (
            <div className="bg-[#1A1A2E] border border-[#303F9F] rounded-xl p-4 sm:p-5 space-y-3 shadow-xl animate-in slide-in-from-top-4 duration-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#FFD700]" />
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    Diagnóstico Inteligente do Turno (Gemini AI)
                  </h3>
                </div>
                <span className="px-2.5 py-0.5 bg-[#00E676]/20 text-[#00E676] text-xs font-bold rounded-full font-mono">
                  Nota: {aiAnalysis.overallScore}/100 • {aiAnalysis.efficiencyRating}
                </span>
              </div>

              <p className="text-xs sm:text-sm text-[#CCCCCC] leading-relaxed">
                {aiAnalysis.summary}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="p-3 bg-[#111122] rounded-lg border border-[#283593]">
                  <h4 className="text-xs font-bold text-[#FF8C00] uppercase mb-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Gargalos & Desvios Identificados
                  </h4>
                  <ul className="text-xs text-[#AAAAAA] space-y-1 list-disc list-inside">
                    {aiAnalysis.bottlenecks.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-3 bg-[#111122] rounded-lg border border-[#283593]">
                  <h4 className="text-xs font-bold text-[#00E676] uppercase mb-1.5 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Plano de Ação Recomendado
                  </h4>
                  <ul className="text-xs text-[#AAAAAA] space-y-1 list-disc list-inside">
                    {aiAnalysis.actionPlan.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 4 Blocos de KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="kpi-box bg-[#1E1E1E] border border-[#333333] p-4 sm:p-5 rounded-xl text-center shadow-md">
              <div className="kpi-valor text-3xl font-black text-[#00E676] font-mono">
                {kpis.executando}
              </div>
              <div className="mt-1 text-xs sm:text-sm font-bold text-[#CCCCCC]">
                Tarefas em Andamento
              </div>
            </div>

            <div className="kpi-box bg-[#1E1E1E] border border-[#333333] p-4 sm:p-5 rounded-xl text-center shadow-md">
              <div className="kpi-valor text-3xl font-black text-[#2979FF] font-mono">
                {kpis.concluidas}
              </div>
              <div className="mt-1 text-xs sm:text-sm font-bold text-[#CCCCCC]">
                Tarefas Concluídas
              </div>
            </div>

            <div className="kpi-box bg-[#1E1E1E] border border-[#333333] p-4 sm:p-5 rounded-xl text-center shadow-md">
              <div className="kpi-valor text-3xl font-black text-[#FF9800] font-mono">
                {autoClosedCount}
              </div>
              <div className="mt-1 text-xs sm:text-sm font-bold text-[#CCCCCC]">
                Auto-Encerradas no Turno
              </div>
            </div>

            <div className="kpi-box bg-[#1E1E1E] border border-[#333333] p-4 sm:p-5 rounded-xl text-center shadow-md">
              <div className="kpi-valor text-3xl font-black text-[#FFD700] font-mono">
                {kpis.minutosTrabalhados} min
              </div>
              <div className="mt-1 text-xs sm:text-sm font-bold text-[#CCCCCC]">
                Total Minutos Apontados
              </div>
            </div>
          </div>

          {/* Seção do Dashboard de Eficiência da Equipe */}
          <div className="space-y-4 pt-4 border-t border-[#333333]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-[#00E676] flex items-center gap-2">
                <span>📊 Dashboard de Eficiência da Equipe</span>
              </h3>
            </div>

            {/* Barra de Filtros de Data e Tolerância */}
            <div className="flex items-center gap-3 flex-wrap bg-[#1E1E1E] p-3 rounded-lg border border-[#333333]">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-[#CCCCCC]">Data de Análise:</label>
                <input
                  type="date"
                  id="filtro-data-eficiencia"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="py-1.5 px-2.5 bg-[#111111] text-white border border-[#555555] rounded text-xs font-mono focus:outline-none focus:border-[#007BFF]"
                />
              </div>

              <div className="flex items-center bg-[#222222] border border-[#444444] rounded px-3 py-1.5">
                <label
                  htmlFor="tolerancia-sem-apontar"
                  className="text-[#FF8C00] text-xs font-bold mr-2"
                >
                  Max. Sem Apontar (min):
                </label>
                <input
                  type="number"
                  id="tolerancia-sem-apontar"
                  value={toleranceMinutes}
                  min="0"
                  max="600"
                  step="5"
                  onChange={(e) => handleSetToleranceMinutes(parseFloat(e.target.value) || 0)}
                  className="w-14 p-1 bg-[#111111] text-white text-xs text-center rounded border border-[#555555]"
                />
              </div>

              <span className="text-[#888888] text-xs">
                (Calculado vs Horas Úteis do Turno • Clique no cartão para filtrar histórico)
              </span>
            </div>

            {/* Painel de Configuração Manual de Metas & Faixas de Cores */}
            <div className="bg-[#141414] border border-[#2D2D2D] rounded-xl p-4 space-y-3 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#252525] pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">🎯</span>
                  <div>
                    <h4 className="text-xs sm:text-sm font-black text-white">
                      Configuração Manual das Faixas e Percentuais de Cores (Eficiência)
                    </h4>
                    <p className="text-[11px] text-[#888888]">
                      Defina os percentuais mínimos para coloração dos gráficos, cartões e metas de produção
                    </p>
                  </div>
                </div>

                {thresholdSavedMsg && (
                  <span className="px-2.5 py-1 bg-[#00E676]/20 border border-[#00E676]/50 text-[#00E676] text-xs font-bold rounded-lg flex items-center gap-1 animate-in fade-in">
                    <Check className="w-3.5 h-3.5" />
                    <span>Metas Salvas no Sistema!</span>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Faixa Verde */}
                <div className="p-3 bg-[#00E676]/10 border border-[#00E676]/40 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-[#00E676] flex items-center gap-1.5">
                      <span>🟢</span> Meta Excelente (Verde)
                    </span>
                    <span className="text-[10px] text-[#00E676] font-mono font-bold">
                      ≥ {editGreen}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-[#AAAAAA] font-bold shrink-0">
                      Mínimo (%):
                    </label>
                    <input
                      type="number"
                      min={editYellow + 1}
                      max={100}
                      value={editGreen}
                      onChange={(e) => setEditGreen(Math.max(editYellow + 1, Math.min(100, parseInt(e.target.value, 10) || 0)))}
                      className="w-full py-1.5 px-2 bg-[#111111] text-white border border-[#00E676]/50 rounded-lg text-xs font-bold font-mono text-center focus:outline-none focus:border-[#00E676]"
                    />
                  </div>
                </div>

                {/* Faixa Amarela */}
                <div className="p-3 bg-[#FFD700]/10 border border-[#FFD700]/40 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-[#FFD700] flex items-center gap-1.5">
                      <span>🟡</span> Faixa Atenção (Amarelo)
                    </span>
                    <span className="text-[10px] text-[#FFD700] font-mono font-bold">
                      {editYellow}% a {editGreen - 1}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-[#AAAAAA] font-bold shrink-0">
                      Mínimo (%):
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={editGreen - 1}
                      value={editYellow}
                      onChange={(e) => setEditYellow(Math.max(1, Math.min(editGreen - 1, parseInt(e.target.value, 10) || 0)))}
                      className="w-full py-1.5 px-2 bg-[#111111] text-white border border-[#FFD700]/50 rounded-lg text-xs font-bold font-mono text-center focus:outline-none focus:border-[#FFD700]"
                    />
                  </div>
                </div>

                {/* Faixa Vermelha */}
                <div className="p-3 bg-[#E91E63]/10 border border-[#E91E63]/40 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-[#E91E63] flex items-center gap-1.5">
                      <span>🔴</span> Faixa Crítica (Vermelho)
                    </span>
                    <span className="text-[10px] text-[#E91E63] font-mono font-bold">
                      &lt; {editYellow}%
                    </span>
                  </div>
                  <p className="text-[11px] text-[#888888] pt-1.5">
                    Calculado automaticamente para qualquer colaborador com rendimento abaixo de {editYellow}%.
                  </p>
                </div>
              </div>

              {/* Botões de Ação para Salvar ou Resetar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#252525]">
                <button
                  type="button"
                  onClick={handleResetThresholds}
                  className="px-3 py-1.5 bg-[#222222] hover:bg-[#333333] text-[#AAAAAA] hover:text-white border border-[#444444] rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  title="Restaurar padrão (85% verde / 70% amarelo)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restaurar Padrão (85% / 70%)</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveThresholds}
                  className="px-4 py-1.5 bg-[#00E676] hover:bg-[#00C853] text-black font-black rounded-lg text-xs transition flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Salvar Metas de Cores</span>
                </button>
              </div>
            </div>

            {/* Grid de Cartões de Eficiência */}
            {efficiencyData.length === 0 ? (
              <div className="p-8 text-center bg-[#1E1E1E] border border-[#333333] rounded-lg">
                <p className="text-[#888888]">Nenhuma operação apontada nesta data.</p>
              </div>
            ) : (
              <div
                id="grid-eficiencia"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5"
              >
                {efficiencyData.map((d) => {
                  const corBarra =
                    d.eficienciaRaw >= propGreen ? '#00E676' : d.eficienciaRaw >= propYellow ? '#FFD700' : '#E91E63';

                  const classePiscar = d.isAlertaSemApontar ? 'card-piscar' : '';
                  const hasAutoClosed = logs.some(
                    (l) => l.collaboratorName === d.nome && l.date === formattedFilterDate && (l.autoClosed || l.autoClosedAtShiftEnd)
                  );

                  return (
                    <div
                      key={d.nome}
                      onClick={() => handleOperatorCardClick(d.nome)}
                      className={`card bg-[#111111] border rounded-lg overflow-hidden cursor-pointer hover:border-[#666666] transition-transform hover:scale-[1.01] shadow-md flex flex-col justify-between ${
                        hasAutoClosed ? 'border-[#FF9800]' : 'border-[#333333]'
                      } ${classePiscar}`}
                      title="Clique para filtrar o histórico deste operador abaixo"
                    >
                      <div className="card-header bg-[#222222] text-white p-3 flex justify-between items-center border-b border-[#333333]">
                        <div className="flex items-center gap-1.5 truncate max-w-[65%]">
                          <span className="font-bold text-sm text-white truncate">
                            {d.nome}
                          </span>
                          {hasAutoClosed && (
                            <span className="bg-[#FF9800] text-black text-[9px] font-black px-1.5 py-0.2 rounded shrink-0" title="Teve operação auto-encerrada no turno">
                              Auto-fechado
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            d.statusTurno === 'NAO_INICIADO'
                              ? 'bg-[#333333] text-[#AAAAAA]'
                              : d.statusTurno === 'EM_ANDAMENTO'
                              ? 'bg-[#00E676]/20 text-[#00E676]'
                              : 'bg-[#2979FF]/20 text-[#2979FF]'
                          }`}>
                            {d.statusTurno === 'NAO_INICIADO' ? '⏳ Aguarda' : d.statusTurno === 'EM_ANDAMENTO' ? '🟢 No Turno' : '🏁 Fim Turno'}
                          </span>
                          <span className="text-[#007BFF] text-xs font-bold font-mono">
                            {d.turno} {d.esperadoMinutos > 0 ? `(${d.turnoEntrada}-${d.turnoSaida})` : '(Inativo)'}
                          </span>
                        </div>
                      </div>

                      <div className="card-body p-3.5 text-left space-y-3">
                        {/* Alerta de Ócio se presente */}
                        {d.isAlertaSemApontar && d.motivoAlerta && (
                          <div className="p-2 rounded-lg bg-[#FF3D00]/15 border border-[#FF3D00]/40 text-[#FF9E80] text-xs font-bold">
                            🚨 {d.motivoAlerta}
                          </div>
                        )}

                        {/* Barra de Progresso de Eficiência */}
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-bold text-white">Eficiência Atual</span>
                            <span className="font-bold font-mono" style={{ color: corBarra }}>
                              {d.eficienciaPct}%
                            </span>
                          </div>
                          <div className="w-full bg-[#333333] rounded h-3 overflow-hidden">
                            <div
                              className="h-full transition-all duration-500 rounded"
                              style={{
                                width: `${Math.min(d.eficienciaRaw, 100)}%`,
                                backgroundColor: corBarra,
                              }}
                            />
                          </div>
                        </div>

                        {/* 3 Métricas: Ocupado, Sem Apontar, Meta Turno */}
                        <div className="grid grid-cols-3 gap-1.5 text-center bg-[#1A1A1A] p-2.5 rounded border border-[#333333]">
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
                          <div className="text-[11px] font-bold text-[#888888] mb-1.5">
                            Detalhamento das Operações:
                          </div>
                          <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                            {d.operacoes.map((op, idx) => (
                              <div
                                key={idx}
                                className="flex justify-between items-center text-xs border-b border-[#222222] py-1"
                              >
                                <span className="text-[#CCCCCC] truncate max-w-[70%]" title={op.nome}>
                                  {op.nome}
                                </span>
                                <span className="text-white font-bold font-mono text-[11px]">
                                  {formatarHorasMinutos(op.tempoMinutos)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Seção de Acompanhamento Operacional (Tabela do Líder) */}
          <div ref={tableRef} className="space-y-3 pt-6 border-t border-[#333333]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white">Acompanhamento Operacional</h3>
                <p className="text-xs text-[#888888]">
                  Consulta dinâmica por período e turnos da fábrica
                </p>
              </div>
              
              {(tableSearch || tableStartDate || tableEndDate || tableShiftFilter !== 'TODOS') && (
                <button
                  onClick={() => {
                    setTableSearch('');
                    setTableStartDate('');
                    setTableEndDate('');
                    setTableShiftFilter('TODOS');
                  }}
                  className="text-xs text-[#FFAB40] hover:text-white px-2.5 py-1 bg-[#222222] border border-[#444444] rounded flex items-center gap-1 transition cursor-pointer hover:bg-[#333333]"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Limpar Filtros</span>
                </button>
              )}
            </div>

            {/* BARRA DE FILTROS: BUSCA, DATA INICIAL, DATA FINAL, TURNO */}
            <div className="bg-[#1A1A1A] p-3 rounded-xl border border-[#333333] space-y-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-[#777777] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  id="filtro-gestao-lider"
                  placeholder="🔍 Buscar por colaborador, atividade ou status..."
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#222222] text-white border border-[#555555] rounded-lg text-sm focus:outline-none focus:border-[#007BFF]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Data Inicial */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-[#AAAAAA] uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-[#007BFF]" />
                    <span>Data Inicial</span>
                  </label>
                  <input
                    type="date"
                    id="filtro-data-inicial-lider"
                    value={tableStartDate}
                    onChange={(e) => setTableStartDate(e.target.value)}
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
                    id="filtro-data-final-lider"
                    value={tableEndDate}
                    onChange={(e) => setTableEndDate(e.target.value)}
                    title="Filtrar até esta data"
                    className="w-full py-2 px-2.5 bg-[#222222] text-white border border-[#555555] rounded-lg text-xs font-mono focus:outline-none focus:border-[#007BFF]"
                  />
                </div>

                {/* Filtro por Turno */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-[#AAAAAA] uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#FF9800]" />
                    <span>Turno</span>
                  </label>
                  <select
                    id="filtro-turno-lider"
                    value={tableShiftFilter}
                    onChange={(e) => setTableShiftFilter(e.target.value)}
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
              </div>
            </div>

            <div className="overflow-x-auto bg-[#111111] rounded-lg border border-[#333333] shadow-md">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-[#222222] text-[#007BFF] text-xs uppercase tracking-wider font-bold">
                    <th className="p-3 border-b border-[#333333]">Data</th>
                    <th className="p-3 border-b border-[#333333]">Operador</th>
                    <th className="p-3 border-b border-[#333333]">Turno</th>
                    <th className="p-3 border-b border-[#333333]">Atividade</th>
                    <th className="p-3 border-b border-[#333333]">Início</th>
                    <th className="p-3 border-b border-[#333333]">Fim</th>
                    <th className="p-3 border-b border-[#333333]">Tempo</th>
                    <th className="p-3 border-b border-[#333333]">Status</th>
                    <th className="p-3 border-b border-[#333333]">Observações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#222222] text-xs sm:text-sm">
                  {tableLogs.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-[#888888]">
                        Nenhum registro correspondente aos filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    tableLogs.map((log) => {
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
                        <tr key={log.id} className="hover:bg-[#1A1A1A] transition-colors">
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
                          <td className="p-3 text-[#DDDDDD] font-medium">{log.activity}</td>
                          <td className="p-3 text-[#AAAAAA] font-mono whitespace-nowrap">{log.startTime}</td>
                          <td className="p-3 text-[#AAAAAA] font-mono whitespace-nowrap">{log.endTime || '-'}</td>
                          <td className="p-3 font-mono font-bold text-white whitespace-nowrap">{minExibicao}</td>
                          <td className="p-3 whitespace-nowrap">
                            <span
                              className="font-bold text-xs"
                              style={{ color: isExec ? '#00E676' : isAuto ? '#FF9800' : '#AAAAAA' }}
                            >
                              {isAuto ? 'Auto (Fim Turno)' : log.status}
                            </span>
                          </td>
                          <td className="p-3 text-[#888888] max-w-xs truncate text-xs">
                            {log.observation || '-'}
                            {log.notes && <span className="text-[#AAAAAA] ml-1">| {log.notes}</span>}
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
    </div>
  );
};
