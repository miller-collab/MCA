import React, { useState, useEffect } from 'react';
import { 
  Users, UserPlus, Trash2, Edit2, Check, X, RotateCcw, 
  Upload, Download, FileText, AlertCircle, Save, Sparkles, Plus, ClipboardCheck,
  Lock, Unlock, KeyRound, AlertTriangle, ShieldCheck
} from 'lucide-react';
import { Collaborator, ShiftConfig } from '../types';
import { definirCorFuncao } from '../data/initialData';
import { padronizarNomeTurno } from '../utils/factoryCalculations';

interface QuickCollaboratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  collaborators: Collaborator[];
  shifts: ShiftConfig[];
  customRoleColors?: Record<string, string>;
  onSaveCollaborators: (colabs: Collaborator[]) => void;
  onRestoreFromBackup?: () => boolean;
  isLeaderUnlocked?: boolean;
  onUnlockLeader?: (pin: string) => boolean;
  leaderPin?: string;
  onLockLeader?: () => void;
}

const CARGOS_PADRAO = [
  'PREPARADOR TORNO AUTOMATICO',
  'INSPETOR TCNC / OPERADOR',
  'INSPETOR / OPERADOR TA',
  'PREPARADOR DE FERRAMENTAS',
  'PREPARADOR PROGAMADOR',
  'AREA DO CAVACO E OLEO',
  'SERVIÇOS GERAIS TORNO AUTOMATICO',
  'SISTEMA / AREA DO CAVACO E OLEO',
  'LÍDER DE PRODUÇÃO',
  'OPERADOR DE TORNO CNC',
  'OPERADOR DE CENTRO DE USINAGEM',
  'AUXILIAR DE PRODUÇÃO',
  'MANUTENÇÃO MECÂNICA',
];

export const QuickCollaboratorModal: React.FC<QuickCollaboratorModalProps> = ({
  isOpen,
  onClose,
  collaborators,
  shifts,
  customRoleColors = {},
  onSaveCollaborators,
  onRestoreFromBackup,
  isLeaderUnlocked = false,
  onUnlockLeader,
  leaderPin = '8619',
  onLockLeader,
}) => {
  const [localColabs, setLocalColabs] = useState<Collaborator[]>(collaborators);
  const [activeTab, setActiveTab] = useState<'lista' | 'adicionar' | 'massa' | 'backup'>('lista');

  // PIN Unlock State for Leader Security
  const [isUnlocked, setIsUnlocked] = useState<boolean>(isLeaderUnlocked);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // Single add form
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('PREPARADOR TORNO AUTOMATICO');
  const [newShift, setNewShift] = useState(shifts[0]?.name || 'Turno 1');

  // Edit item form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editShift, setEditShift] = useState('');

  // Bulk paste form
  const [bulkText, setBulkText] = useState('');
  const [bulkRole, setBulkRole] = useState('OPERADOR');
  const [bulkShift, setBulkShift] = useState(shifts[0]?.name || 'Turno 1');
  const [bulkReplace, setBulkReplace] = useState(false);

  // Status message
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    setLocalColabs(collaborators);
  }, [collaborators]);

  useEffect(() => {
    if (isLeaderUnlocked) {
      setIsUnlocked(true);
    }
  }, [isLeaderUnlocked]);

  if (!isOpen) return null;

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3000);
  };

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    const correctPin = leaderPin || '8619';
    if (pinInput.trim() === correctPin || (onUnlockLeader && onUnlockLeader(pinInput.trim()))) {
      setIsUnlocked(true);
      setPinError(false);
      setPinInput('');
    } else {
      setPinError(true);
    }
  };

  const handleLock = () => {
    setIsUnlocked(false);
    if (onLockLeader) {
      onLockLeader();
    }
  };

  const handleAddSingle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const newObj: Collaborator = {
      id: `col-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: newName.trim(),
      role: newRole.trim().toUpperCase(),
      shift: padronizarNomeTurno(newShift),
      active: true,
    };

    const updated = [...localColabs, newObj];
    setLocalColabs(updated);
    onSaveCollaborators(updated);
    setNewName('');
    showMsg(`"${newObj.name}" adicionado com sucesso!`);
    setActiveTab('lista');
  };

  const handleStartEdit = (colab: Collaborator) => {
    setEditingId(colab.id);
    setEditName(colab.name);
    setEditRole(colab.role);
    setEditShift(colab.shift);
  };

  const handleSaveEdit = () => {
    if (!editName.trim() || !editingId) return;

    const updated = localColabs.map((c) =>
      c.id === editingId
        ? {
            ...c,
            name: editName.trim(),
            role: editRole.trim().toUpperCase(),
            shift: padronizarNomeTurno(editShift),
          }
        : c
      );

    setLocalColabs(updated);
    onSaveCollaborators(updated);
    setEditingId(null);
    showMsg('Colaborador atualizado com sucesso!');
  };

  const handleDelete = (id: string, name: string) => {
    const updated = localColabs.filter((c) => c.id !== id);
    setLocalColabs(updated);
    onSaveCollaborators(updated);
    showMsg(`"${name}" removido da equipe.`);
  };

  const handleToggleActive = (id: string) => {
    const updated = localColabs.map((c) =>
      c.id === id ? { ...c, active: !c.active } : c
    );
    setLocalColabs(updated);
    onSaveCollaborators(updated);
  };

  const handleBulkImport = () => {
    if (!bulkText.trim()) {
      showMsg('Insira ao menos um nome para importar.', 'error');
      return;
    }

    // Split by new line or comma or semicolon
    const rawLines = bulkText
      .split(/[\r\n]+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const parsedColabs: Collaborator[] = [];

    rawLines.forEach((line, index) => {
      // Check if line contains separators like "Nome - Cargo - Turno" or "Nome;Cargo;Turno"
      const parts = line.split(/[;\t|\-]+/).map((p) => p.trim());
      if (parts.length >= 3) {
        parsedColabs.push({
          id: `col-bulk-${Date.now()}-${index}`,
          name: parts[0],
          role: parts[1].toUpperCase(),
          shift: padronizarNomeTurno(parts[2]),
          active: true,
        });
      } else if (parts.length === 2) {
        parsedColabs.push({
          id: `col-bulk-${Date.now()}-${index}`,
          name: parts[0],
          role: parts[1].toUpperCase(),
          shift: padronizarNomeTurno(bulkShift),
          active: true,
        });
      } else {
        parsedColabs.push({
          id: `col-bulk-${Date.now()}-${index}`,
          name: parts[0],
          role: bulkRole.toUpperCase(),
          shift: padronizarNomeTurno(bulkShift),
          active: true,
        });
      }
    });

    if (parsedColabs.length === 0) {
      showMsg('Nenhum nome válido encontrado.', 'error');
      return;
    }

    const updated = bulkReplace ? parsedColabs : [...localColabs, ...parsedColabs];
    setLocalColabs(updated);
    onSaveCollaborators(updated);
    setBulkText('');
    showMsg(`${parsedColabs.length} colaboradores importados com sucesso!`);
    setActiveTab('lista');
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(localColabs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `equipe_colaboradores_mca_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showMsg('Backup da equipe baixado com sucesso!');
  };

  const handleRestoreClick = () => {
    if (onRestoreFromBackup) {
      const success = onRestoreFromBackup();
      if (success) {
        showMsg('Nomes e configurações anteriores restaurados do navegador!');
        return;
      }
    }
    showMsg('Nenhum backup adicional detectado no armazenamento local.', 'error');
  };

  // Se não estiver desbloqueado, exibir a tela de Senha / PIN do Líder
  if (!isUnlocked) {
    return (
      <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
        <div className="bg-[#161616] border border-[#3A3A3A] rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in zoom-in-95">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-[#2A2A2A] flex items-center justify-between bg-[#1E1E1E]">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-[#FF3D00]/20 border border-[#FF3D00]/40 text-[#FF3D00] rounded-xl">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Acesso Restrito do Líder</h3>
                <p className="text-[11px] text-[#888888]">
                  Proteção de Edição, Exclusão e Restauração
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-[#2E2E2E] text-[#888888] hover:text-white rounded-lg transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4 text-center">
            <div className="w-14 h-14 bg-[#202020] border border-[#3A3A3A] rounded-full flex items-center justify-center mx-auto text-[#007BFF] shadow-inner">
              <KeyRound className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-[#CCCCCC] leading-relaxed">
                As ações de <b>Restaurar</b>, <b>Editar</b>, <b>Excluir</b> ou <b>Cadastrar</b> operadores são restritas ao <b>Líder de Produção</b>.
              </p>
              <p className="text-[11px] text-[#888888]">
                Digite a senha PIN para desbloquear o gerenciamento da equipe.
              </p>
            </div>

            <form onSubmit={handleVerifyPin} className="space-y-3 pt-2">
              <div className="relative">
                <input
                  type="password"
                  maxLength={10}
                  placeholder="Digite a Senha PIN"
                  value={pinInput}
                  onChange={(e) => {
                    setPinInput(e.target.value);
                    setPinError(false);
                  }}
                  className={`w-full p-3.5 bg-[#111111] text-white border rounded-xl text-center text-lg font-mono tracking-widest focus:outline-none ${
                    pinError
                      ? 'border-[#FF3D00] focus:border-[#FF3D00]'
                      : 'border-[#555555] focus:border-[#007BFF]'
                  }`}
                  autoFocus
                />
              </div>

              {pinError && (
                <div className="p-2 bg-[#FF3D00]/15 border border-[#FF3D00]/40 rounded-lg text-[#FF5252] text-xs font-bold flex items-center justify-center gap-1.5 animate-bounce">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Senha incorreta! Apenas o líder pode gerenciar a equipe.</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 bg-[#2A2A2A] hover:bg-[#333333] text-[#AAAAAA] hover:text-white font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-[#007BFF] hover:bg-[#0066CC] text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg shadow-[#007BFF]/20"
                >
                  <Unlock className="w-4 h-4" />
                  <span>Desbloquear</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-[#161616] border border-[#3A3A3A] rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-[#2A2A2A] flex items-center justify-between bg-[#1E1E1E]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#007BFF]/20 border border-[#007BFF]/40 text-[#007BFF] rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-white">Gestão da Equipe & Operadores</h3>
                <span className="px-2 py-0.5 bg-[#00E676]/15 border border-[#00E676]/30 text-[#00E676] text-[10px] font-black rounded-md flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Líder Autenticado
                </span>
              </div>
              <p className="text-xs text-[#888888]">
                Adicione, renomeie ou cole sua lista de colaboradores para nunca perder nada
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleLock}
              className="p-2 hover:bg-[#2E2E2E] text-[#888888] hover:text-[#FF9800] rounded-lg transition cursor-pointer"
              title="Bloquear Acesso do Líder"
            >
              <Lock className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-[#2E2E2E] text-[#888888] hover:text-white rounded-lg transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div className="flex items-center gap-1.5 p-2 bg-[#121212] border-b border-[#262626] overflow-x-auto">
          <button
            onClick={() => setActiveTab('lista')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'lista'
                ? 'bg-[#007BFF] text-white shadow-sm'
                : 'text-[#888888] hover:text-white hover:bg-[#222222]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Lista Atual ({localColabs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('adicionar')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'adicionar'
                ? 'bg-[#007BFF] text-white shadow-sm'
                : 'text-[#888888] hover:text-white hover:bg-[#222222]'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Adicionar Um</span>
          </button>

          <button
            onClick={() => setActiveTab('massa')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'massa'
                ? 'bg-[#00E676] text-black shadow-sm'
                : 'text-[#00E676] hover:bg-[#00E676]/10'
            }`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>Colar Lista em Massa (Rápido)</span>
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'backup'
                ? 'bg-[#FF9800] text-black shadow-sm'
                : 'text-[#FF9800] hover:bg-[#FF9800]/10'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restaurar / Backup</span>
          </button>
        </div>

        {/* Feedback Alert */}
        {msg && (
          <div
            className={`mx-4 mt-3 p-3 rounded-lg text-xs font-bold flex items-center gap-2 animate-in fade-in ${
              msg.type === 'success'
                ? 'bg-[#00E676]/20 border border-[#00E676]/50 text-[#00E676]'
                : 'bg-[#FF3D00]/20 border border-[#FF3D00]/50 text-[#FF3D00]'
            }`}
          >
            <Check className="w-4 h-4 shrink-0" />
            <span>{msg.text}</span>
          </div>
        )}

        {/* Tab Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: LISTA DE COLABORADORES */}
          {activeTab === 'lista' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-[#888888] pb-1 border-b border-[#262626]">
                <span>Toque no botão de lápis para editar o nome, cargo ou turno de qualquer operador</span>
                <span className="font-mono text-[#00E676] font-bold">
                  {localColabs.filter((c) => c.active).length} ativos
                </span>
              </div>

              <div className="space-y-2">
                {localColabs.map((c) => {
                  const isEditing = editingId === c.id;
                  const cor = customRoleColors[c.role.toUpperCase()] || definirCorFuncao(c.role);

                  if (isEditing) {
                    return (
                      <div
                        key={c.id}
                        className="p-3 bg-[#242424] border-2 border-[#007BFF] rounded-xl space-y-2.5 animate-in fade-in"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Nome Completo"
                            className="p-2 bg-[#1A1A1A] border border-[#555555] rounded text-xs text-white focus:outline-none focus:border-[#007BFF]"
                          />
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value)}
                            className="p-2 bg-[#1A1A1A] border border-[#555555] rounded text-xs text-white focus:outline-none focus:border-[#007BFF]"
                          >
                            {CARGOS_PADRAO.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                          <select
                            value={editShift}
                            onChange={(e) => setEditShift(e.target.value)}
                            className="p-2 bg-[#1A1A1A] border border-[#555555] rounded text-xs text-white focus:outline-none focus:border-[#007BFF]"
                          >
                            {shifts.map((s) => (
                              <option key={s.id} value={s.name}>
                                {s.name} ({s.entrada}-{s.saida})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 bg-[#333333] hover:bg-[#444444] text-white rounded text-xs font-bold cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            className="px-4 py-1.5 bg-[#00E676] hover:bg-[#00c853] text-black font-bold rounded text-xs flex items-center gap-1 cursor-pointer"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>Salvar Alteração</span>
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={c.id}
                      className="p-3 bg-[#1C1C1C] border border-[#2D2D2D] rounded-xl flex items-center justify-between gap-3 hover:border-[#444444] transition"
                      style={{ borderLeft: `4px solid ${cor}` }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm text-white truncate flex items-center gap-2">
                          <span>{c.name}</span>
                          {!c.active && (
                            <span className="text-[10px] px-1.5 py-0.2 bg-[#FF3D00]/20 text-[#FF3D00] rounded font-bold">
                              Inativo
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#AAAAAA] truncate">{c.role}</div>
                        <div className="text-[11px] text-[#007BFF] font-mono font-bold mt-0.5">
                          {c.shift}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleToggleActive(c.id)}
                          className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition ${
                            c.active
                              ? 'bg-[#00E676]/20 text-[#00E676] border border-[#00E676]/40'
                              : 'bg-[#555555]/20 text-[#888888] border border-[#555555]'
                          }`}
                        >
                          {c.active ? 'Ativo' : 'Inativo'}
                        </button>
                        <button
                          onClick={() => handleStartEdit(c)}
                          className="p-1.5 bg-[#282828] hover:bg-[#383838] text-[#007BFF] rounded-lg transition cursor-pointer"
                          title="Editar Colaborador"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id, c.name)}
                          className="p-1.5 bg-[#282828] hover:bg-[#FF3D00]/20 text-[#888888] hover:text-[#FF3D00] rounded-lg transition cursor-pointer"
                          title="Remover"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: ADICIONAR UM COLABORADOR */}
          {activeTab === 'adicionar' && (
            <form onSubmit={handleAddSingle} className="space-y-4 bg-[#1E1E1E] p-4 rounded-xl border border-[#333333]">
              <h4 className="font-bold text-sm text-white">Cadastrar Novo Colaborador</h4>

              <div>
                <label className="block text-xs font-bold text-[#CCCCCC] mb-1">Nome Completo:</label>
                <input
                  type="text"
                  placeholder="Ex: Caio Oliveira"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full p-2.5 bg-[#141414] text-white border border-[#444444] rounded-lg text-sm focus:outline-none focus:border-[#007BFF]"
                  autoFocus
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#CCCCCC] mb-1">Cargo / Função:</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full p-2.5 bg-[#141414] text-white border border-[#444444] rounded-lg text-xs focus:outline-none focus:border-[#007BFF]"
                  >
                    {CARGOS_PADRAO.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#CCCCCC] mb-1">Turno Alocado:</label>
                  <select
                    value={newShift}
                    onChange={(e) => setNewShift(e.target.value)}
                    className="w-full p-2.5 bg-[#141414] text-white border border-[#444444] rounded-lg text-xs focus:outline-none focus:border-[#007BFF]"
                  >
                    {shifts.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name} ({s.entrada}-{s.saida})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-[#0066CC] hover:bg-[#005bb5] text-white font-bold rounded-lg text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-[0.99]"
              >
                <UserPlus className="w-4 h-4" />
                <span>Salvar Colaborador</span>
              </button>
            </form>
          )}

          {/* TAB 3: IMPORTAÇÃO / COLAGEM EM MASSA */}
          {activeTab === 'massa' && (
            <div className="space-y-4 bg-[#1E1E1E] p-4 rounded-xl border border-[#333333]">
              <div className="flex items-center gap-2 text-[#00E676]">
                <Sparkles className="w-4 h-4" />
                <h4 className="font-bold text-sm text-white">Colar Lista de Nomes da Fábrica</h4>
              </div>
              <p className="text-xs text-[#AAAAAA] leading-relaxed">
                Copie e cole a lista de colaboradores da sua planilha ou documento. Basta colar um nome por linha (ou no formato: <code>Nome - Cargo - Turno</code>).
              </p>

              <div>
                <label className="block text-xs font-bold text-[#CCCCCC] mb-1">Lista de Nomes:</label>
                <textarea
                  rows={6}
                  placeholder={`Exemplo:\nCaio Henrique\nDanilo Costa\nValter Ribeiro\nMarcos Oliveira\nAnderson Souza\nRobson Santos\nFelipe Almeida\nLucas Mendes\nThiago Ferreira`}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  className="w-full p-3 bg-[#141414] text-white border border-[#444444] rounded-lg font-mono text-xs focus:outline-none focus:border-[#00E676]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#CCCCCC] mb-1">Cargo Padrão para os nomes:</label>
                  <select
                    value={bulkRole}
                    onChange={(e) => setBulkRole(e.target.value)}
                    className="w-full p-2 bg-[#141414] text-white border border-[#444444] rounded text-xs"
                  >
                    {CARGOS_PADRAO.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#CCCCCC] mb-1">Turno Padrão:</label>
                  <select
                    value={bulkShift}
                    onChange={(e) => setBulkShift(e.target.value)}
                    className="w-full p-2 bg-[#141414] text-white border border-[#444444] rounded text-xs"
                  >
                    {shifts.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name} ({s.entrada}-{s.saida})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chk-replace"
                  checked={bulkReplace}
                  onChange={(e) => setBulkReplace(e.target.checked)}
                  className="w-4 h-4 rounded text-[#00E676] focus:ring-0 cursor-pointer"
                />
                <label htmlFor="chk-replace" className="text-xs text-[#CCCCCC] cursor-pointer">
                  Substituir toda a lista atual (se desmarcado, apenas adiciona à lista existente)
                </label>
              </div>

              <button
                type="button"
                onClick={handleBulkImport}
                className="w-full py-3 bg-[#00E676] hover:bg-[#00c853] text-black font-black rounded-lg text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-[0.99]"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>Salvar Todos os Nomes na Equipe</span>
              </button>
            </div>
          )}

          {/* TAB 4: RESTAURAÇÃO & BACKUP */}
          {activeTab === 'backup' && (
            <div className="space-y-4">
              <div className="p-4 bg-[#1E1E1E] rounded-xl border border-[#333333] space-y-3">
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-[#FF9800]" />
                  <span>Restauração Automática da Memória Local</span>
                </h4>
                <p className="text-xs text-[#AAAAAA] leading-relaxed">
                  Se você configurou nomes anteriormente neste navegador, o sistema verifica automaticamente o cache do computador para restaurar sua lista personalizada de operadores.
                </p>
                <button
                  type="button"
                  onClick={handleRestoreClick}
                  className="px-4 py-2.5 bg-[#FF9800] hover:bg-[#FFA726] text-black font-bold rounded-lg text-xs flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>🔄 Buscar e Restaurar Dados Anteriores do Navegador</span>
                </button>
              </div>

              <div className="p-4 bg-[#1E1E1E] rounded-xl border border-[#333333] space-y-3">
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <Download className="w-4 h-4 text-[#007BFF]" />
                  <span>Download de Arquivo de Backup</span>
                </h4>
                <p className="text-xs text-[#AAAAAA]">
                  Baixe um arquivo JSON com a lista completa dos seus colaboradores cadastrados para manter uma cópia física de segurança.
                </p>
                <button
                  type="button"
                  onClick={handleExportJSON}
                  className="px-4 py-2.5 bg-[#007BFF] hover:bg-[#0066CC] text-white font-bold rounded-lg text-xs flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <Download className="w-4 h-4" />
                  <span>💾 Baixar Backup da Equipe (JSON)</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 bg-[#181818] border-t border-[#262626] flex items-center justify-between">
          <span className="text-xs text-[#888888]">
            {localColabs.length} operadores cadastrados
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-[#007BFF] hover:bg-[#0066CC] text-white font-bold rounded-lg text-xs cursor-pointer shadow-sm"
          >
            Concluir e Voltar
          </button>
        </div>
      </div>
    </div>
  );
};
