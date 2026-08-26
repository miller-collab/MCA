import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, CheckCircle2, Play, AlertTriangle, Search, Filter, 
  Clock, User, Wrench, ChevronRight, X, ArrowRight, RotateCcw,
  Zap, BellRing, Check, ShieldAlert
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
  playFactoryChime,
  padronizarNomeTurno
} from '../utils/factoryCalculations';

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
  onStartActivity: (collaboratorName: string, role: string, activityName: string, category: ActivityCategory, machineId?: string) => void;
  onFinishActivity: (logId: string, observation: string, notes: string, partsProduced?: number, scrapCount?: number) => void;
  onQuickChangeover?: (finishLogId: string, observation: string, newActivityName: string, newCategory: ActivityCategory, machineId?: string) => void;
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
  onQuickChangeover,
}) => {
  // Screen state: 'painel' | 'colab' | 'ativ' | 'fechamento' | 'changeover'
  const [currentScreen, setCurrentScreen] = useState<'painel' | 'colab' | 'ativ' | 'fechamento' | 'changeover'>('painel');
  
  // Selection state
  const [selectedColab, setSelectedColab] = useState<Collaborator | null>(null);
  const [activitySearch, setActivitySearch] = useState('');
  const [colabSearch, setColabSearch] = useState('');

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

  // Filter active logs (Em Execução)
  const activeLogs = logs.filter(l => l.status === 'Em Execução');

  // Set of busy collaborators
  const busyCollaborators = new Set(activeLogs.map(l => l.collaboratorName));

  // Available collaborators
  const availableCollaborators = collaborators.filter(
    c => c.active && !busyCollaborators.has(c.name)
  );

  // Filtered available collaborators by search
  const filteredAvailableColabs = availableCollaborators.filter(c => 
    c.name.toLowerCase().includes(colabSearch.toLowerCase()) ||
    c.role.toLowerCase().includes(colabSearch.toLowerCase())
  );

  // Unread operator notifications
  const unreadOperatorNotifs = autoCloseNotifs.filter(n => !n.readByOperator);

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

  // Helper to check if card should flash red (end of shift with open task or excessive duration)
  const isCardFlashing = (log: ProductionLog) => {
    const colab = collaborators.find(c => c.name === log.collaboratorName);
    const shiftName = colab?.shift || 'Turno 1';
    const shift = shifts.find(s => s.name.toUpperCase() === shiftName.toUpperCase() || s.code.toUpperCase() === shiftName.toUpperCase());
    
    if (shift && verificarTurnoEncerrado(shift.saida, shift.entrada)) {
      return true;
    }
    // Also flash if duration exceeds 6 hours without update
    const elapsedMinutes = getElapsedSeconds(log.startTime) / 60;
    if (elapsedMinutes > 360) {
      return true;
    }
    return false;
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
    setCurrentScreen('colab');
    if (soundEnabled) playFactoryChime('beep');
  };

  const handleSelectColab = (colab: Collaborator) => {
    setSelectedColab(colab);
    setActivitySearch('');
    setCurrentScreen('ativ');
  };

  const handleConfirmStart = (activity: ActivityItem) => {
    if (!selectedColab) return;
    onStartActivity(
      selectedColab.name,
      selectedColab.role,
      activity.name,
      activity.category
    );
    setCurrentScreen('painel');
  };

  const handleCardClick = (log: ProductionLog) => {
    setLogToFinish(log);
    setFinishObs('');
    setFinishNotes('');
    setPartsProduced('');
    setScrapCount('');
    setCurrentScreen('fechamento');
  };

  const handleConfirmFinish = () => {
    if (!logToFinish) return;
    onFinishActivity(
      logToFinish.id,
      finishObs,
      finishNotes,
      partsProduced ? parseInt(partsProduced, 10) : undefined,
      scrapCount ? parseInt(scrapCount, 10) : undefined
    );
    setCurrentScreen('painel');
  };

  const handleOpenChangeover = () => {
    if (!logToFinish) return;
    const colab = collaborators.find(c => c.name === logToFinish.collaboratorName);
    if (colab) {
      setSelectedColab(colab);
      setCurrentScreen('changeover');
    }
  };

  const handleConfirmChangeover = (newActivity: ActivityItem) => {
    if (!logToFinish || !onQuickChangeover) return;
    onQuickChangeover(
      logToFinish.id,
      finishObs || 'Troca Rápida de Setup / Nova Atividade',
      newActivity.name,
      newActivity.category
    );
    setCurrentScreen('painel');
  };

  return (
    <div className="max-w-[1100px] mx-auto p-3 sm:p-4 space-y-4">
      {/* ALERTA DE FECHAMENTO AUTOMÁTICO DE TURNO PARA OPERADORES */}
      {unreadOperatorNotifs.length > 0 && currentScreen === 'painel' && (
        <div className="bg-[#1C1400] border-2 border-[#FF9800] rounded-xl p-4 shadow-xl animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between border-b border-[#FF9800]/40 pb-2.5 mb-3">
            <div className="flex items-center gap-2.5 text-[#FFB300]">
              <div className="p-2 bg-[#FF9800]/20 rounded-lg animate-pulse">
                <BellRing className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">
                  Notificação ao Operador: Encerramento Automático no Fim do Turno
                </h3>
                <p className="text-xs text-[#FFCC80]">
                  O sistema identificou operações que não foram fechadas antes da saída do turno e as finalizou automaticamente.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {unreadOperatorNotifs.map((notif) => (
              <div
                key={notif.id}
                className="bg-[#2A1E00] border border-[#FF9800]/50 rounded-lg p-3 flex items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white text-sm">{notif.collaboratorName}</span>
                    <span className="text-[10px] px-1.5 py-0.2 bg-[#FF9800]/30 text-[#FFE082] rounded font-mono">
                      {notif.shiftName} ({notif.shiftEnd})
                    </span>
                  </div>
                  <p className="text-[#FFE082] truncate font-medium">
                    Atividade: <span className="text-white font-bold">{notif.activity}</span>
                  </p>
                  <p className="text-[11px] text-[#FFB74D]">
                    Data: {notif.date} • Encerrada automaticamente às {notif.shiftEnd}
                  </p>
                </div>

                {onDismissOperatorNotif && (
                  <button
                    onClick={() => onDismissOperatorNotif(notif.id)}
                    className="px-3 py-2 bg-[#FF9800] hover:bg-[#FFA726] text-black font-bold rounded-md shrink-0 flex items-center gap-1 transition cursor-pointer shadow-sm text-xs"
                    title="Confirmar ciência da notificação"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Ciente</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TELA 1: PAINEL PRINCIPAL DE PRODUÇÃO */}
      {currentScreen === 'painel' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Barra de Ações Rápidas de Chão de Fábrica */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch">
            {/* Botão Principal de Iniciar Atividade */}
            <button
              id="btn-iniciar-atividade"
              onClick={handleOpenStartModal}
              className="flex-1 py-4 px-6 bg-[#0066CC] hover:bg-[#005bb5] active:bg-[#004c99] text-white font-black text-base sm:text-lg rounded-lg border border-[#005bb5] shadow-lg transition-transform transform active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>➕ INICIAR NOVA ATIVIDADE</span>
              {availableCollaborators.length > 0 && (
                <span className="bg-black/30 text-white text-xs px-2.5 py-1 rounded-full font-mono">
                  {availableCollaborators.length} disponíveis
                </span>
              )}
            </button>
          </div>

          {/* Grid de Cards de Tarefas em Andamento */}
          {activeLogs.length === 0 ? (
            <div className="p-12 text-center bg-[#1E1E1E] border border-[#333333] rounded-lg">
              <p className="text-[#888888] text-base sm:text-lg font-bold">
                Nenhuma atividade rodando no momento.
              </p>
              <p className="text-[#666666] text-xs sm:text-sm mt-1">
                Clique no botão azul acima para alocar um colaborador em uma atividade.
              </p>
            </div>
          ) : (
            <div
              id="grid-ativas"
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-3.5"
            >
              {activeLogs.map((tarefa) => {
                const corBase = getRoleColor(tarefa.role);
                const corTextoHead = definirCorTextoHeader(corBase);
                const elapsedSec = getElapsedSeconds(tarefa.startTime);
                const flashing = isCardFlashing(tarefa);

                return (
                  <div
                    key={tarefa.id}
                    onClick={() => handleCardClick(tarefa)}
                    className={`card bg-[#1E1E1E] border border-[#333333] rounded-lg overflow-hidden cursor-pointer flex flex-col transition-transform hover:scale-[1.02] hover:border-[#666666] shadow-md select-none ${
                      flashing ? 'card-piscar border-[#FF3D00]' : ''
                    }`}
                  >
                    {/* Header com a cor do cargo */}
                    <div
                      className="card-header p-2.5 font-black text-center text-xs sm:text-sm uppercase tracking-wide truncate"
                      style={{ backgroundColor: corBase, color: corTextoHead }}
                      title={tarefa.collaboratorName}
                    >
                      {tarefa.collaboratorName}
                    </div>

                    {/* Body do Card */}
                    <div className="card-body p-3 text-center flex-grow flex flex-col justify-between">
                      <div
                        className="card-atividade text-xs text-[#CCCCCC] mb-2 min-h-[36px] line-clamp-2 leading-tight flex items-center justify-center font-medium"
                        title={tarefa.activity}
                      >
                        {tarefa.activity}
                      </div>

                      <div>
                        <div className="timer text-xl sm:text-2xl font-black text-[#00E676] font-mono tracking-wider tabular-nums">
                          {formatarTempoSegundos(elapsedSec)}
                        </div>
                        <div className="text-[10px] text-[#777777] font-mono mt-0.5 flex items-center justify-center gap-1">
                          <Clock className="w-3 h-3 text-[#555555]" />
                          <span>Início: {tarefa.startTime}</span>
                        </div>
                        {flashing && (
                          <div className="mt-1 text-[10px] font-bold text-[#FF3D00] flex items-center justify-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Fim de Turno!</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TELA 2: SELEÇÃO DE COLABORADOR */}
      {currentScreen === 'colab' && (
        <div className="space-y-4 max-w-2xl mx-auto animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-[#333333] pb-3">
            <div>
              <h2 className="text-xl font-bold text-white">Selecione o Colaborador</h2>
              <p className="text-xs text-[#888888]">Apenas colaboradores sem atividade aberta são listados</p>
            </div>
            <button
              onClick={() => setCurrentScreen('painel')}
              className="text-[#888888] hover:text-white text-xs px-3 py-1.5 rounded bg-[#222222] border border-[#444444] cursor-pointer"
            >
              Voltar ao Painel
            </button>
          </div>

          {/* Campo de Busca de Colaborador */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#777777] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="🔍 Digite para filtrar colaborador ou cargo..."
              value={colabSearch}
              onChange={(e) => setColabSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-[#222222] text-white border border-[#555555] rounded-lg text-sm focus:outline-none focus:border-[#007BFF]"
              autoFocus
            />
          </div>

          {/* Grid Compacta de Colaboradores */}
          {filteredAvailableColabs.length === 0 ? (
            <div className="p-8 text-center bg-[#1E1E1E] border border-[#333333] rounded-lg">
              <p className="text-white font-bold">
                {colabSearch
                  ? 'Nenhum colaborador encontrado com este filtro.'
                  : 'Todos os colaboradores já estão ocupados com atividades em andamento.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {filteredAvailableColabs.map((colab) => {
                const corFuncao = getRoleColor(colab.role);
                const assignedShift = shifts.find(
                  (s) =>
                    s.name.toUpperCase() === colab.shift.toUpperCase() ||
                    s.code.toUpperCase() === colab.shift.toUpperCase() ||
                    colab.shift.toUpperCase().includes(s.name.toUpperCase())
                );
                const isShiftInactive = assignedShift && (!assignedShift.dias || assignedShift.dias.length === 0);
                const hasRecentAutoClose = autoCloseNotifs.some(n => n.collaboratorName === colab.name && !n.readByOperator);

                return (
                  <button
                    key={colab.id}
                    onClick={() => handleSelectColab(colab)}
                    className={`p-3 bg-[#252525] hover:bg-[#333333] text-white rounded-lg text-left transition border cursor-pointer flex flex-col justify-between relative ${
                      hasRecentAutoClose ? 'border-[#FF9800] bg-[#2A2000]' : 'border-[#444444]'
                    }`}
                    style={{ borderTop: `4px solid ${corFuncao}` }}
                  >
                    {hasRecentAutoClose && (
                      <span className="absolute top-1.5 right-1.5 px-1 py-0.5 bg-[#FF9800] text-black text-[9px] font-black rounded" title="Possui aviso de encerramento automático">
                        Aviso
                      </span>
                    )}
                    <div className="font-bold text-sm text-white truncate w-full" title={colab.name}>
                      {colab.name}
                    </div>
                    <div className="text-[11px] text-[#AAAAAA] truncate mt-1" title={colab.role}>
                      {colab.role}
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono mt-1 w-full gap-1">
                      <span className="text-[#007BFF] font-semibold truncate">
                        {padronizarNomeTurno(colab.shift)} {assignedShift ? `(${assignedShift.entrada}-${assignedShift.saida})` : ''}
                      </span>
                      {isShiftInactive && (
                        <span className="text-[#FF3D00] font-bold text-[9px] px-1 bg-[#FF3D00]/20 rounded shrink-0">
                          Inativo
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={() => setCurrentScreen('painel')}
            className="btn w-full py-3.5 bg-[#333333] hover:bg-[#444444] text-white font-bold rounded-lg border border-[#555555] transition cursor-pointer"
          >
            Voltar ao Painel
          </button>
        </div>
      )}

      {/* TELA 3: SELEÇÃO DE ATIVIDADE */}
      {currentScreen === 'ativ' && selectedColab && (
        <div className="max-w-[550px] mx-auto space-y-4 animate-in fade-in duration-150">
          <div className="border-b border-[#333333] pb-3">
            <h2 className="text-xl font-bold text-white">Selecione a Atividade</h2>
            <h3 className="text-sm font-bold text-[#007BFF] mt-1">
              Colaborador: {selectedColab.name}
            </h3>
            <span
              className="inline-block text-[11px] font-bold px-2 py-0.5 rounded mt-1"
              style={{
                backgroundColor: getRoleColor(selectedColab.role),
                color: definirCorTextoHeader(getRoleColor(selectedColab.role)),
              }}
            >
              {selectedColab.role}
            </span>
          </div>

          {/* Aviso se o colaborador tiver ocorrência recente de auto-fechamento */}
          {autoCloseNotifs.some(n => n.collaboratorName === selectedColab.name && !n.readByOperator) && (
            <div className="bg-[#2A1D00] border border-[#FF9800] p-3 rounded-lg text-xs text-[#FFE082] flex items-start gap-2">
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
              placeholder="🔍 Filtrar rotinas e operações..."
              value={activitySearch}
              onChange={(e) => setActivitySearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[#222222] text-white border border-[#555555] rounded-lg text-sm focus:outline-none focus:border-[#007BFF]"
              autoFocus
            />
          </div>

          {/* Lista de Atividades filtradas para a função */}
          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {filteredRoleActivities.length === 0 ? (
              <div className="p-6 text-center bg-[#1E1E1E] border border-[#333333] rounded-lg text-sm text-[#888888]">
                Nenhuma atividade encontrada para o cargo <b>{selectedColab.role}</b>.
              </div>
            ) : (
              filteredRoleActivities.map((act) => (
                <button
                  key={act.id}
                  onClick={() => handleConfirmStart(act)}
                  className="w-full p-3.5 bg-[#252525] hover:bg-[#333333] text-left text-white rounded-lg border border-[#444444] transition flex items-center justify-between gap-3 group cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-white group-hover:text-[#007BFF] transition-colors truncate">
                      {act.name}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-bold text-[#FF8C00] font-mono bg-black/40 px-1.5 py-0.5 rounded">
                        P{act.priority}
                      </span>
                      <span className="text-[10px] text-[#888888]">{act.category}</span>
                      {act.standardMinutes && (
                        <span className="text-[10px] text-[#00E676] font-mono">
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
            className="btn w-full py-3 bg-[#333333] hover:bg-[#444444] text-white font-bold rounded-lg border border-[#555555] transition cursor-pointer"
          >
            Voltar
          </button>
        </div>
      )}

      {/* TELA 4: FECHAMENTO / CONCLUIR ATIVIDADE */}
      {currentScreen === 'fechamento' && logToFinish && (
        <div className="max-w-[500px] mx-auto space-y-4 animate-in fade-in duration-150">
          <div className="border-b border-[#333333] pb-3">
            <h2 className="text-xl font-bold text-white">Concluir Atividade</h2>
            <div className="p-3 bg-[#1E1E1E] border border-[#333333] rounded-lg mt-2 text-xs sm:text-sm space-y-1">
              <p className="text-[#BBB]">
                Trabalhador: <b className="text-white">{logToFinish.collaboratorName}</b>
              </p>
              <p className="text-[#BBB]">
                Atividade Alvo: <b className="text-[#007BFF]">{logToFinish.activity}</b>
              </p>
              <p className="text-[#BBB]">
                Hora Início: <b className="text-white font-mono">{logToFinish.startTime}</b> • Tempo Atual:{' '}
                <b className="text-[#00E676] font-mono">
                  {formatarTempoSegundos(getElapsedSeconds(logToFinish.startTime))}
                </b>
              </p>
            </div>
          </div>

          {/* Observação Padrão */}
          <div>
            <label className="block text-xs font-bold text-white mb-1.5">
              Observação de Produção (Opcional):
            </label>
            <select
              id="select-obs"
              value={finishObs}
              onChange={(e) => setFinishObs(e.target.value)}
              className="w-full p-3 bg-[#222222] text-white border border-[#555555] rounded-lg text-sm focus:outline-none focus:border-[#007BFF]"
            >
              <option value="">Sem observação padrão</option>
              {sanitizedObservations.map((obs, idx) => (
                <option key={idx} value={obs}>
                  {obs}
                </option>
              ))}
            </select>
          </div>

          {/* Quantidade de Peças e Refugo (Campos adicionais avançados) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#CCCCCC] mb-1">
                Peças Boas Produzidas:
              </label>
              <input
                type="number"
                min="0"
                placeholder="Ex: 50"
                value={partsProduced}
                onChange={(e) => setPartsProduced(e.target.value)}
                className="w-full p-2.5 bg-[#222222] text-white border border-[#555555] rounded-lg text-sm font-mono focus:outline-none focus:border-[#007BFF]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#CCCCCC] mb-1">
                Peças Refugo / NC:
              </label>
              <input
                type="number"
                min="0"
                placeholder="Ex: 0"
                value={scrapCount}
                onChange={(e) => setScrapCount(e.target.value)}
                className="w-full p-2.5 bg-[#222222] text-white border border-[#555555] rounded-lg text-sm font-mono focus:outline-none focus:border-[#007BFF]"
              />
            </div>
          </div>

          {/* Notas Adicionais Livres */}
          <div>
            <label className="block text-xs font-bold text-white mb-1.5">
              Notas Adicionais Livres:
            </label>
            <textarea
              id="texto-notas"
              rows={3}
              placeholder="Digite uma anotação extra sobre esta atividade se necessário..."
              value={finishNotes}
              onChange={(e) => setFinishNotes(e.target.value)}
              className="w-full p-3 bg-[#222222] text-white border border-[#555555] rounded-lg text-sm focus:outline-none focus:border-[#007BFF] resize-none"
            />
          </div>

          {/* Botão de Troca Rápida de Setup */}
          {onQuickChangeover && (
            <button
              onClick={handleOpenChangeover}
              className="w-full py-2.5 bg-[#4A148C] hover:bg-[#6A1B9A] text-white font-bold rounded-lg border border-[#7B1FA2] text-xs flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Zap className="w-4 h-4 text-[#FFD700]" />
              <span>TROCA RÁPIDA (ENCERRAR E INICIAR PRÓXIMA)</span>
            </button>
          )}

          {/* Botões de Ação */}
          <button
            onClick={handleConfirmFinish}
            className="w-full py-4 bg-[#00E676] hover:bg-[#00c853] text-black font-black text-base sm:text-lg rounded-lg border border-[#00c853] shadow-lg transition-transform active:scale-[0.99] cursor-pointer"
          >
            CONFIRMAR ENCERRAMENTO
          </button>

          <button
            onClick={() => setCurrentScreen('painel')}
            className="btn w-full py-3 bg-[#555555] hover:bg-[#666666] text-white font-bold rounded-lg border border-[#777777] transition cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* TELA 5: TROCA RÁPIDA (CHANGEOVER) */}
      {currentScreen === 'changeover' && logToFinish && selectedColab && (
        <div className="max-w-[500px] mx-auto space-y-4 animate-in fade-in duration-150">
          <div className="border-b border-[#333333] pb-3">
            <h2 className="text-xl font-bold text-[#FFD700] flex items-center gap-2">
              <Zap className="w-5 h-5" />
              <span>Troca Rápida de Operação</span>
            </h2>
            <p className="text-xs text-[#CCCCCC] mt-1">
              Encerrando tarefa atual de <b>{selectedColab.name}</b> e iniciando a próxima imediatamente.
            </p>
          </div>

          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {filteredRoleActivities.map((act) => (
              <button
                key={act.id}
                onClick={() => handleConfirmChangeover(act)}
                className="w-full p-3.5 bg-[#252525] hover:bg-[#333333] text-left text-white rounded-lg border border-[#444444] transition flex items-center justify-between gap-3 group cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="font-bold text-sm text-white group-hover:text-[#00E676] transition-colors truncate">
                    {act.name}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold text-[#FF8C00] font-mono bg-black/40 px-1.5 py-0.5 rounded">
                      P{act.priority}
                    </span>
                    <span className="text-[10px] text-[#888888]">{act.category}</span>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-[#555555] group-hover:text-[#00E676] shrink-0" />
              </button>
            ))}
          </div>

          <button
            onClick={() => setCurrentScreen('fechamento')}
            className="btn w-full py-3 bg-[#333333] hover:bg-[#444444] text-white font-bold rounded-lg border border-[#555555] cursor-pointer"
          >
            Voltar ao Fechamento Normal
          </button>
        </div>
      )}
    </div>
  );
};

