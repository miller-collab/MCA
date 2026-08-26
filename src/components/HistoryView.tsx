import React, { useState, useMemo } from 'react';
import { Search, Download, Trash2, Edit3, X, Check, Filter, Lock, KeyRound, AlertTriangle, RotateCcw, Calendar, Clock, ShieldCheck } from 'lucide-react';
import { ProductionLog, Collaborator, ShiftConfig } from '../types';
import { 
  formatarHorasMinutos, 
  calcularDiferencaMinutos, 
  verificarDataNoPeriodo, 
  obterTurnoDoLog,
  padronizarNomeTurno
} from '../utils/factoryCalculations';

interface HistoryViewProps {
  logs: ProductionLog[];
  collaborators?: Collaborator[];
  shifts?: ShiftConfig[];
  onDeleteLog?: (id: string) => void;
  onUpdateLog?: (log: ProductionLog) => void;
  initialFilterTerm?: string;
  isLeaderUnlocked?: boolean;
  leaderPin?: string;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  logs,
  collaborators = [],
  shifts = [],
  onDeleteLog,
  onUpdateLog,
  initialFilterTerm = '',
  isLeaderUnlocked = false,
  leaderPin = '8619',
}) => {
  const [searchTerm, setSearchTerm] = useState(initialFilterTerm);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedShift, setSelectedShift] = useState('TODOS');
  const [filterStatus, setFilterStatus] = useState('TODOS');
  
  // Leader Password Protection for Edit/Delete
  const [authModal, setAuthModal] = useState<{
    isOpen: boolean;
    actionType: 'edit' | 'delete';
    targetLog: ProductionLog;
  } | null>(null);
  const [authPinInput, setAuthPinInput] = useState('');
  const [authPinError, setAuthPinError] = useState(false);

  // Edit log modal
  const [editingLog, setEditingLog] = useState<ProductionLog | null>(null);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editObs, setEditObs] = useState('');
  const [editNotes, setEditNotes] = useState('');
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

  const hasActiveFilters = Boolean(searchTerm || startDate || endDate || selectedShift !== 'TODOS' || filterStatus !== 'TODOS');

  const handleClearFilters = () => {
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
    setSelectedShift('TODOS');
    setFilterStatus('TODOS');
  };

  // Filter logs with range and shift support
  const filteredLogs = useMemo(() => {
    return logs.filter((item) => {
      const term = searchTerm.toLowerCase().trim();
      const itemShift = obterTurnoDoLog(item, collaborators);

      const matchTerm =
        !term ||
        item.date.toLowerCase().includes(term) ||
        item.collaboratorName.toLowerCase().includes(term) ||
        item.activity.toLowerCase().includes(term) ||
        item.status.toLowerCase().includes(term) ||
        itemShift.toLowerCase().includes(term) ||
        (item.observation && item.observation.toLowerCase().includes(term)) ||
        (item.notes && item.notes.toLowerCase().includes(term)) ||
        (item.role && item.role.toLowerCase().includes(term)) ||
        (item.machineId && item.machineId.toLowerCase().includes(term));

      const matchDatePeriod = verificarDataNoPeriodo(item.date, startDate, endDate);

      const matchShift =
        selectedShift === 'TODOS' ||
        padronizarNomeTurno(itemShift) === padronizarNomeTurno(selectedShift);

      const matchStatus = filterStatus === 'TODOS' || item.status === filterStatus;

      return matchTerm && matchDatePeriod && matchShift && matchStatus;
    });
  }, [logs, searchTerm, startDate, endDate, selectedShift, filterStatus, collaborators]);

  const requestActionWithLeaderAuth = (actionType: 'edit' | 'delete', log: ProductionLog) => {
    if (isLeaderUnlocked) {
      if (actionType === 'edit') {
        openEditModal(log);
      } else {
        openDeleteModal(log);
      }
      return;
    }

    setAuthPinInput('');
    setAuthPinError(false);
    setAuthModal({
      isOpen: true,
      actionType,
      targetLog: log,
    });
  };

  const handleVerifyAuthPin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (authPinInput === leaderPin || authPinInput === '8619' || authPinInput === '1234') {
      const target = authModal?.targetLog;
      const type = authModal?.actionType;
      setAuthModal(null);
      setAuthPinInput('');
      setAuthPinError(false);

      if (target && type === 'edit') {
        openEditModal(target);
      } else if (target && type === 'delete') {
        openDeleteModal(target);
      }
    } else {
      setAuthPinError(true);
    }
  };

  const openEditModal = (log: ProductionLog) => {
    setEditingLog(log);
    setEditStartTime(log.startTime || '');
    setEditEndTime(log.endTime || '');
    setEditObs(log.observation || '');
    setEditNotes(log.notes || '');
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
    const dur = editEndTime ? calcularDiferencaMinutos(editStartTime, editEndTime) : undefined;
    const updated: ProductionLog = {
      ...editingLog,
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

  const exportToCSV = () => {
    const headers = ['Data', 'Colaborador', 'Turno', 'Cargo', 'Atividade', 'Início', 'Fim', 'Duração (Min)', 'Status', 'Observações', 'Notas'];
    const rows = filteredLogs.map((l) => [
      l.date,
      `"${l.collaboratorName}"`,
      `"${obterTurnoDoLog(l, collaborators)}"`,
      `"${l.role}"`,
      `"${l.activity}"`,
      l.startTime,
      l.endTime || '',
      l.durationMinutes || '',
      l.status,
      `"${l.observation || ''}"`,
      `"${l.notes || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map((e) => e.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `historico_apontamentos_mca_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-[1200px] mx-auto p-3 sm:p-4 space-y-4 animate-in fade-in duration-200">
      {/* Header com Aviso de Proteção do Histórico */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#333333] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white">Histórico de Apontamentos</h2>
            <span className="px-2.5 py-0.5 bg-[#00E676]/10 text-[#00E676] border border-[#00E676]/30 text-[11px] font-bold rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Histórico Permanente Seguro</span>
            </span>
          </div>
          <p className="text-xs text-[#888888] mt-0.5">
            Registro completo de operações da fábrica • <span className="text-[#007BFF] font-semibold">Exclusão ou alteração permitidas somente com autorização do líder</span>
          </p>
        </div>
        <button
          onClick={exportToCSV}
          className="px-3.5 py-2 bg-[#1E1E1E] hover:bg-[#2A2A2A] text-white border border-[#444444] rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer"
          title="Exportar dados filtrados para Excel / CSV"
        >
          <Download className="w-4 h-4 text-[#00E676]" />
          <span>Exportar Planilha (CSV)</span>
        </button>
      </div>

      {/* PAINEL DE FILTROS AVANÇADOS: BUSCA, DATA INICIAL, DATA FINAL, TURNO E STATUS */}
      <div className="bg-[#1A1A1A] p-3 sm:p-4 rounded-xl border border-[#333333] shadow-md space-y-3">
        {/* Linha 1: Campo de Busca Geral */}
        <div className="relative">
          <Search className="w-4 h-4 text-[#777777] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            id="filtro-geral"
            placeholder="🔍 Digite para pesquisar por operador, atividade, observações, máquina..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#222222] text-white border border-[#555555] rounded-lg text-sm focus:outline-none focus:border-[#007BFF]"
          />
        </div>

        {/* Linha 2: Filtros de Data Inicial, Data Final, Turnos e Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
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

          {/* Filtro por Turno (com opção Todos os Turnos) */}
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
            </select>
          </div>
        </div>

        {/* Resumo e Botão de Limpar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#2a2a2a] text-xs text-[#888888]">
          <div>
            Exibindo <b className="text-white font-mono">{filteredLogs.length}</b> de{' '}
            <span className="text-[#AAAAAA] font-mono">{logs.length}</span> registros totais
            {hasActiveFilters && (
              <span className="ml-2 text-[#007BFF] font-medium">
                (Filtros ativos: {startDate && `a partir de ${startDate} `} {endDate && `até ${endDate} `} {selectedShift !== 'TODOS' && `• ${selectedShift} `} {filterStatus !== 'TODOS' && `• ${filterStatus}`})
              </span>
            )}
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

      {/* Tabela do Histórico com Ações Fixas e Visíveis */}
      <div className="overflow-x-auto bg-[#111111] rounded-lg border border-[#333333] shadow-lg relative">
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
              {/* Coluna Ações com Sticky Right para nunca ser cortada */}
              <th className="p-3 border-b border-[#333333] text-right sticky right-0 bg-[#222222] z-20 shadow-[-6px_0_10px_rgba(0,0,0,0.6)] min-w-[100px]">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#222222] text-xs sm:text-sm">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-[#888888]">
                  Nenhum registro encontrado para os filtros selecionados.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => {
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
                      {log.notes && <span className="text-[#AAAAAA] ml-1">| Nota: {log.notes}</span>}
                    </td>
                    {/* Ações com Botões Grandes, Visíveis e Protegidos por Senha do Líder */}
                    <td className="p-3 text-right whitespace-nowrap sticky right-0 bg-[#111111] group-hover:bg-[#1A1A1A] z-10 border-l border-[#2a2a2a] shadow-[-6px_0_10px_rgba(0,0,0,0.6)] min-w-[100px]">
                      <div className="flex items-center justify-end gap-2">
                        {onUpdateLog && (
                          <button
                            onClick={() => requestActionWithLeaderAuth('edit', log)}
                            className="p-2 bg-[#222222] hover:bg-[#007BFF] text-[#AAAAAA] hover:text-white border border-[#444444] hover:border-[#007BFF] rounded-md transition shadow-xs cursor-pointer"
                            title="Editar Apontamento (Requer Senha do Líder)"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        {onDeleteLog && (
                          <button
                            onClick={() => requestActionWithLeaderAuth('delete', log)}
                            className="p-2 bg-[#222222] hover:bg-[#FF3D00] text-[#FF5252] hover:text-white border border-[#552222] hover:border-[#FF3D00] rounded-md transition shadow-xs cursor-pointer"
                            title="Excluir Registro (Requer Senha do Líder)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Autenticação do Líder (Senha 8619 / 1234) */}
      {authModal && authModal.isOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#1C1C1C] border-2 border-[#007BFF] rounded-xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#333333] pb-3">
              <div className="flex items-center gap-2 text-white">
                <div className="p-2 bg-[#007BFF]/20 text-[#007BFF] rounded-lg">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Autorização do Líder</h3>
                  <p className="text-[11px] text-[#888888]">
                    {authModal.actionType === 'edit' ? 'Editar apontamento' : 'Excluir registro'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAuthModal(null)}
                className="text-[#888888] hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#262626] p-3 rounded-lg text-xs space-y-1 border border-[#333333]">
              <p className="text-[#AAAAAA]">Operador: <b className="text-white">{authModal.targetLog.collaboratorName}</b></p>
              <p className="text-[#AAAAAA]">Atividade: <b className="text-[#007BFF]">{authModal.targetLog.activity}</b> ({authModal.targetLog.date})</p>
            </div>

            <form onSubmit={handleVerifyAuthPin} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#CCCCCC] mb-1.5">
                  Digite a Senha do Líder (PIN):
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-[#777777] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    autoFocus
                    value={authPinInput}
                    onChange={(e) => {
                      setAuthPinInput(e.target.value);
                      setAuthPinError(false);
                    }}
                    placeholder="Senha do líder..."
                    className={`w-full pl-9 pr-3 py-2.5 bg-[#111111] text-white border rounded-lg text-center font-mono text-base tracking-widest focus:outline-none ${
                      authPinError ? 'border-[#FF3D00] text-[#FF5252]' : 'border-[#555555] focus:border-[#007BFF]'
                    }`}
                  />
                </div>
                {authPinError && (
                  <p className="text-[11px] text-[#FF5252] font-semibold mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Senha incorreta! Apenas líderes autorizados podem alterar ou excluir.</span>
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[#007BFF] hover:bg-[#005bb5] text-white font-bold rounded-lg text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Validar e Continuar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAuthModal(null)}
                  className="px-3.5 py-2.5 bg-[#2A2A2A] hover:bg-[#333333] text-[#CCCCCC] rounded-lg text-xs font-semibold"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Edição de Apontamento */}
      {editingLog && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1E1E1E] border border-[#444444] rounded-lg max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#333333] pb-3">
              <h3 className="font-bold text-white text-base">Editar Apontamento</h3>
              <button
                onClick={() => setEditingLog(null)}
                className="text-[#888888] hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-1 text-[#CCCCCC]">
              <p>Operador: <b className="text-white">{editingLog.collaboratorName}</b></p>
              <p>Atividade: <b className="text-[#007BFF]">{editingLog.activity}</b></p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-white mb-1">Hora Início:</label>
                <input
                  type="text"
                  value={editStartTime}
                  onChange={(e) => setEditStartTime(e.target.value)}
                  placeholder="HH:mm:ss"
                  className="w-full p-2 bg-[#222222] border border-[#555555] rounded text-white font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-white mb-1">Hora Fim:</label>
                <input
                  type="text"
                  value={editEndTime}
                  onChange={(e) => setEditEndTime(e.target.value)}
                  placeholder="HH:mm:ss"
                  className="w-full p-2 bg-[#222222] border border-[#555555] rounded text-white font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-white mb-1">Observação:</label>
              <input
                type="text"
                value={editObs}
                onChange={(e) => setEditObs(e.target.value)}
                className="w-full p-2 bg-[#222222] border border-[#555555] rounded text-white text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-white mb-1">Notas:</label>
              <textarea
                rows={2}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="w-full p-2 bg-[#222222] border border-[#555555] rounded text-white text-xs"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSaveEdit}
                className="flex-1 py-2.5 bg-[#00E676] hover:bg-[#00c853] text-black font-bold rounded text-xs cursor-pointer"
              >
                Salvar Alterações
              </button>
              <button
                onClick={() => setEditingLog(null)}
                className="px-4 py-2.5 bg-[#333333] hover:bg-[#444444] text-white rounded text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação In-App */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#1C1C1C] border border-[#444444] rounded-xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-[#FF3D00]/20 border border-[#FF3D00]/40 text-[#FF3D00] rounded-lg shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-base font-bold text-white">{confirmModal.title}</h4>
                <p className="text-xs text-[#AAAAAA] mt-1.5 leading-relaxed">{confirmModal.description}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#333333]">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 bg-[#2A2A2A] hover:bg-[#333333] text-[#CCCCCC] hover:text-white rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className="px-4 py-2 bg-[#FF3D00] hover:bg-[#D50000] text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-lg active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir Definitivamente</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

