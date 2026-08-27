import React, { useState, useEffect } from 'react';
import { Clock, Save, UserPlus, Users, Check, AlertCircle, Trash2, Plus, Download, Upload, Moon, Sun, AlertTriangle, Lock, Unlock, KeyRound } from 'lucide-react';
import { ShiftConfig, Collaborator } from '../types';
import { calcularDiferencaMinutos, formatarHorasMinutos } from '../utils/factoryCalculations';
import { definirCorFuncao } from '../data/initialData';

interface ShiftAndFactoryConfigViewProps {
  shifts: ShiftConfig[];
  collaborators: Collaborator[];
  onSaveShifts: (shifts: ShiftConfig[]) => void;
  onAddCollaborator?: (collaborator: Omit<Collaborator, 'id'>) => void;
  onDeleteCollaborator?: (id: string) => void;
  onToggleCollaboratorActive?: (id: string) => void;
  onExportBackup?: () => void;
  onImportBackup?: (jsonStr: string) => void;
  isUnlocked?: boolean;
  onUnlock?: (pin: string) => boolean;
  leaderPin?: string;
}

const DIAS_SEMANA = [
  { id: 'Seg', label: 'Seg' },
  { id: 'Ter', label: 'Ter' },
  { id: 'Qua', label: 'Qua' },
  { id: 'Qui', label: 'Qui' },
  { id: 'Sex', label: 'Sex' },
  { id: 'Sab', label: 'Sáb' },
  { id: 'Dom', label: 'Dom' },
];

export const ShiftAndFactoryConfigView: React.FC<ShiftAndFactoryConfigViewProps> = ({
  shifts,
  collaborators,
  onSaveShifts,
  onAddCollaborator,
  onDeleteCollaborator,
  onToggleCollaboratorActive,
  onExportBackup,
  onImportBackup,
  isUnlocked = true,
  onUnlock,
  leaderPin = '8619',
}) => {
  const [localShifts, setLocalShifts] = useState<ShiftConfig[]>(shifts);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText?: string;
    onConfirm: () => void;
  } | null>(null);

  // Synchronize localShifts if shifts prop updates from parent
  useEffect(() => {
    setLocalShifts(shifts);
  }, [shifts]);

  // Handle PIN Unlock
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const correctPin = leaderPin || '8619';
    if (pinInput.trim() === correctPin || (onUnlock && onUnlock(pinInput.trim()))) {
      setPinError(false);
      setPinInput('');
    } else {
      setPinError(true);
    }
  };

  // If locked, show PIN lock screen
  if (!isUnlocked) {
    return (
      <div className="max-w-md mx-auto p-6 mt-8 bg-[#1E1E1E] border border-[#333333] rounded-xl text-center space-y-4 shadow-2xl animate-in fade-in">
        <div className="w-14 h-14 bg-[#222222] border border-[#444444] rounded-full flex items-center justify-center mx-auto text-[#007BFF]">
          <Lock className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Acesso Restrito do Líder</h2>
          <p className="text-xs text-[#888888] mt-1">
            Digite a senha PIN para configurar horários de turnos e colaboradores da fábrica.
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
            DESBLOQUEAR CONFIGURAÇÃO DE TURNOS
          </button>
        </form>
      </div>
    );
  }

  // New collaborator form state
  const [newColabName, setNewColabName] = useState('');
  const [newColabRole, setNewColabRole] = useState('OPERADOR');
  const [newColabShift, setNewColabShift] = useState(shifts[0]?.name.toUpperCase() || 'TURNO 1');
  const [colabSuccess, setColabSuccess] = useState(false);

  const handleShiftChange = (shiftId: string, field: keyof ShiftConfig, value: any) => {
    setLocalShifts((prev) =>
      prev.map((s) => (s.id === shiftId ? { ...s, [field]: value } : s))
    );
    setSavedSuccess(false);
  };

  const handleToggleDia = (shiftId: string, dia: string) => {
    setLocalShifts((prev) =>
      prev.map((s) => {
        if (s.id === shiftId) {
          const exists = s.dias.includes(dia);
          const newDias = exists ? s.dias.filter((d) => d !== dia) : [...s.dias, dia];
          return { ...s, dias: newDias };
        }
        return s;
      })
    );
    setSavedSuccess(false);
  };

  const handleSaveAll = () => {
    onSaveShifts(localShifts);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleCreateColab = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColabName.trim() || !onAddCollaborator) return;
    onAddCollaborator({
      name: newColabName.trim(),
      role: newColabRole.trim().toUpperCase(),
      shift: newColabShift.toUpperCase(),
      active: true,
    });
    setNewColabName('');
    setColabSuccess(true);
    setTimeout(() => setColabSuccess(false), 3000);
  };

  return (
    <div className="max-w-[1100px] mx-auto p-3 sm:p-4 space-y-6 animate-in fade-in duration-200">
      <div className="border-b border-[#333333] pb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Configuração de Horários da Fábrica</h2>
          <p className="text-xs text-[#888888]">
            Defina as janelas de expediente, intervalos de refeição e dias de trabalho de cada turno
          </p>
        </div>
        <div className="text-xs font-mono text-[#00E676] bg-[#00E676]/10 px-3 py-1 rounded border border-[#00E676]/30">
          ● Turnos vinculados dinamicamente ao sistema
        </div>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-[#00E676]/20 border border-[#00E676] rounded-lg text-[#00E676] text-xs sm:text-sm font-bold flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4" />
          <span>Configurações dos Turnos salvas e atualizadas em todo o sistema com sucesso!</span>
        </div>
      )}

      {/* Grid dos 3 Turnos (TURNO 1, TURNO 2, TURNO 3) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {localShifts.map((shift, idx) => {
          const shiftColors = ['#007BFF', '#FF8C00', '#9C27B0'];
          const corTurno = shift.color || shiftColors[idx % 3];
          const isInactive = !shift.dias || shift.dias.length === 0;

          // Cálculo da carga horária líquida
          const min1 = calcularDiferencaMinutos(shift.entrada, shift.saidaAlmoco || shift.saida);
          const min2 = shift.saidaAlmoco && shift.retornoAlmoco && shift.saida
            ? calcularDiferencaMinutos(shift.retornoAlmoco, shift.saida)
            : 0;
          const totalLiquido = min1 + min2;

          return (
            <div
              key={shift.id}
              className={`card bg-[#111111] rounded-lg overflow-hidden flex flex-col justify-between shadow-md transition-all ${
                isInactive ? 'border-2 border-[#FF3D00]/50 opacity-90' : 'border border-[#333333]'
              }`}
            >
              <div
                className="card-header p-3 font-black text-center text-sm text-white uppercase tracking-wider flex items-center justify-center gap-2"
                style={{ backgroundColor: isInactive ? '#2A2A2A' : corTurno }}
              >
                <span>{shift.name} ({shift.code.toUpperCase()})</span>
                {isInactive && (
                  <span className="px-2 py-0.5 bg-[#FF3D00] text-white text-[10px] rounded-full font-black flex items-center gap-1">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    INATIVO
                  </span>
                )}
              </div>

              <div className="card-body p-4 text-left space-y-3">
                {isInactive && (
                  <div className="p-2 bg-[#FF3D00]/10 border border-[#FF3D00]/30 rounded text-[11px] text-[#FF6E40] font-bold text-center">
                    ⚠️ Turno desativado (Nenhum dia de trabalho selecionado)
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-[#CCCCCC] mb-1">
                    Horário de Entrada:
                  </label>
                  <input
                    type="time"
                    value={shift.entrada}
                    onChange={(e) => handleShiftChange(shift.id, 'entrada', e.target.value)}
                    className="w-full p-2 bg-[#222222] text-white border border-[#555555] rounded text-sm font-mono focus:outline-none focus:border-[#007BFF]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#CCCCCC] mb-1">
                    Saída para Almoço / Janta:
                  </label>
                  <input
                    type="time"
                    value={shift.saidaAlmoco}
                    onChange={(e) => handleShiftChange(shift.id, 'saidaAlmoco', e.target.value)}
                    className="w-full p-2 bg-[#222222] text-white border border-[#555555] rounded text-sm font-mono focus:outline-none focus:border-[#007BFF]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#CCCCCC] mb-1">
                    Retorno do Almoço / Janta:
                  </label>
                  <input
                    type="time"
                    value={shift.retornoAlmoco}
                    onChange={(e) => handleShiftChange(shift.id, 'retornoAlmoco', e.target.value)}
                    className="w-full p-2 bg-[#222222] text-white border border-[#555555] rounded text-sm font-mono focus:outline-none focus:border-[#007BFF]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#CCCCCC] mb-1">
                    Horário de Saída:
                  </label>
                  <input
                    type="time"
                    value={shift.saida}
                    onChange={(e) => handleShiftChange(shift.id, 'saida', e.target.value)}
                    className="w-full p-2 bg-[#222222] text-white border border-[#555555] rounded text-sm font-mono focus:outline-none focus:border-[#007BFF]"
                  />
                </div>

                {/* Dias de Trabalho */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-[#CCCCCC]">
                      Dias de Trabalho ({shift.code.toUpperCase()}):
                    </label>
                    <span className="text-[10px] font-mono text-[#888888]">
                      {shift.dias.length} {shift.dias.length === 1 ? 'dia' : 'dias'}
                    </span>
                  </div>
                  <div className={`dias-semana-container flex flex-wrap gap-2.5 p-2.5 rounded border transition-colors ${
                    isInactive ? 'bg-[#1E1414] border-[#FF3D00]/40' : 'bg-[#222222] border-[#555555]'
                  }`}>
                    {DIAS_SEMANA.map((dia) => {
                      const isChecked = shift.dias.includes(dia.id);
                      return (
                        <label
                          key={dia.id}
                          className="flex items-center gap-1 text-xs text-white cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleDia(shift.id, dia.id)}
                            className="rounded accent-[#007BFF]"
                          />
                          <span className={isChecked ? 'font-bold text-[#00E676]' : 'text-[#888888]'}>{dia.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Resumo da Carga Horária Líquida */}
                <div className="bg-[#1A1A1A] p-2.5 rounded border border-[#333333] text-center">
                  <div className="text-[10px] text-[#888888] font-bold">Meta Útil de Trabalho</div>
                  <div className={`text-sm font-black font-mono ${isInactive ? 'text-[#888888]' : 'text-[#00E676]'}`}>
                    {isInactive ? '0h 00m (Turno Desativado)' : `${formatarHorasMinutos(totalLiquido)} (${totalLiquido} min)`}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Botão de Salvar Turnos */}
      <div className="max-w-md mx-auto pt-2">
        <button
          onClick={handleSaveAll}
          className="btn w-full py-4 bg-[#00E676] hover:bg-[#00c853] text-black font-black text-base sm:text-lg rounded-lg border border-[#00c853] shadow-lg transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
        >
          <Save className="w-5 h-5" />
          <span>💾 SALVAR CONFIGURAÇÕES DE TURNOS</span>
        </button>
      </div>

      {/* Seção Adicional: Cadastro e Gestão de Colaboradores */}
      <div className="pt-6 border-t border-[#333333] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-[#007BFF]" />
            <span>Gestão de Colaboradores da Fábrica</span>
          </h3>
          <span className="text-xs text-[#888888] font-mono">
            {collaborators.filter((c) => c.active).length} ativos / {collaborators.length} total
          </span>
        </div>

        {/* Formulário para Adicionar Colaborador */}
        {onAddCollaborator && (
          <form
            onSubmit={handleCreateColab}
            className="p-4 bg-[#1E1E1E] rounded-lg border border-[#333333] grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
          >
            <div>
              <label className="block text-xs font-bold text-[#CCCCCC] mb-1">Nome Completo:</label>
              <input
                type="text"
                placeholder="Ex: João Silva"
                value={newColabName}
                onChange={(e) => setNewColabName(e.target.value)}
                className="w-full p-2 bg-[#222222] text-white border border-[#555555] rounded text-xs focus:outline-none focus:border-[#007BFF]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#CCCCCC] mb-1">Cargo / Função:</label>
              <select
                value={newColabRole}
                onChange={(e) => setNewColabRole(e.target.value)}
                className="w-full p-2 bg-[#222222] text-white border border-[#555555] rounded text-xs focus:outline-none focus:border-[#007BFF]"
              >
                <option value="PREPARADOR TORNO AUTOMATICO">PREPARADOR TORNO AUTOMATICO</option>
                <option value="INSPETOR TCNC / OPERADOR">INSPETOR TCNC / OPERADOR</option>
                <option value="INSPETOR / OPERADOR TA">INSPETOR / OPERADOR TA</option>
                <option value="PREPARADOR DE FERRAMENTAS">PREPARADOR DE FERRAMENTAS</option>
                <option value="PREPARADOR PROGAMADOR">PREPARADOR PROGAMADOR</option>
                <option value="AREA DO CAVACO E OLEO">AREA DO CAVACO E OLEO</option>
                <option value="SERVIÇOS GERAIS TORNO AUTOMATICO">SERVIÇOS GERAIS TORNO AUTOMATICO</option>
                <option value="SISTEMA / AREA DO CAVACO E OLEO">SISTEMA / AREA DO CAVACO E OLEO</option>
                <option value="LÍDER DE PRODUÇÃO">LÍDER DE PRODUÇÃO</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#CCCCCC] mb-1">Turno Alocado:</label>
              <select
                value={newColabShift}
                onChange={(e) => setNewColabShift(e.target.value)}
                className="w-full p-2 bg-[#222222] text-white border border-[#555555] rounded text-xs focus:outline-none focus:border-[#007BFF]"
              >
                {localShifts.map((s) => {
                  const isInactive = !s.dias || s.dias.length === 0;
                  return (
                    <option key={s.id} value={s.name.toUpperCase()}>
                      {s.name.toUpperCase()} ({s.entrada} - {s.saida}{isInactive ? ' • INATIVO' : ''})
                    </option>
                  );
                })}
              </select>
            </div>

            <button
              type="submit"
              className="py-2.5 px-4 bg-[#0066CC] hover:bg-[#005bb5] text-white font-bold rounded text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Cadastrar</span>
            </button>
          </form>
        )}

        {/* Lista de Colaboradores */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {collaborators.map((c) => {
            const cor = definirCorFuncao(c.role);
            const assignedShift = localShifts.find(
              (s) =>
                s.name.toUpperCase() === c.shift.toUpperCase() ||
                s.code.toUpperCase() === c.shift.toUpperCase() ||
                c.shift.toUpperCase().includes(s.name.toUpperCase())
            );
            const isShiftInactive = assignedShift && (!assignedShift.dias || assignedShift.dias.length === 0);

            return (
              <div
                key={c.id}
                className="p-3 bg-[#111111] border border-[#333333] rounded-lg flex items-center justify-between gap-2"
                style={{ borderLeft: `4px solid ${cor}` }}
              >
                <div className="min-w-0">
                  <div className="font-bold text-sm text-white truncate">{c.name}</div>
                  <div className="text-[11px] text-[#AAAAAA] truncate">{c.role}</div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-[#007BFF] font-mono font-bold">
                      {c.shift} {assignedShift ? `(${assignedShift.entrada} - ${assignedShift.saida})` : ''}
                    </span>
                    {isShiftInactive && (
                      <span className="text-[9px] px-1 py-0.2 bg-[#FF3D00]/20 border border-[#FF3D00]/40 text-[#FF3D00] rounded font-bold">
                        Turno Inativo
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {onToggleCollaboratorActive && (
                    <button
                      onClick={() => onToggleCollaboratorActive(c.id)}
                      className={`px-2 py-1 rounded text-[10px] font-bold ${
                        c.active
                          ? 'bg-[#00E676]/20 text-[#00E676] border border-[#00E676]/40'
                          : 'bg-[#555555]/20 text-[#888888] border border-[#555555]'
                      }`}
                    >
                      {c.active ? 'Ativo' : 'Inativo'}
                    </button>
                  )}
                  {onDeleteCollaborator && (
                    <button
                      onClick={() => {
                        setConfirmModal({
                          isOpen: true,
                          title: 'Remover Colaborador',
                          description: `Deseja realmente remover o colaborador "${c.name}" da base de dados da fábrica?`,
                          confirmText: 'Sim, Remover',
                          onConfirm: () => {
                            onDeleteCollaborator(c.id);
                            setConfirmModal(null);
                          },
                        });
                      }}
                      className="p-1 hover:bg-[#333333] text-[#888888] hover:text-[#FF3D00] rounded transition cursor-pointer"
                      title="Excluir Colaborador"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
                <span>{confirmModal.confirmText || 'Confirmar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
