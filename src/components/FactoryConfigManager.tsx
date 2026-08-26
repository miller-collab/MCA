import React, { useState } from 'react';
import { 
  Users, Briefcase, ListOrdered, MessageSquare, Clock, 
  Plus, Trash2, Edit2, Check, X, Upload, Download, RotateCcw, 
  Save, AlertCircle, Palette, Sparkles, Filter, Copy, FileSpreadsheet,
  CheckSquare, Square, Layers, Info, HelpCircle
} from 'lucide-react';
import { Collaborator, ActivityItem, ShiftConfig, ActivityCategory } from '../types';
import { INITIAL_COLLABORATORS, INITIAL_ACTIVITIES, INITIAL_SHIFTS, INITIAL_OBSERVATIONS, definirCorFuncao } from '../data/initialData';
import { padronizarNomeTurno } from '../utils/factoryCalculations';

interface FactoryConfigManagerProps {
  collaborators: Collaborator[];
  activities: ActivityItem[];
  shifts: ShiftConfig[];
  observations: string[];
  customRoleColors?: Record<string, string>;
  onUpdateCollaborators: (colabs: Collaborator[]) => void;
  onUpdateActivities: (activities: ActivityItem[]) => void;
  onUpdateShifts: (shifts: ShiftConfig[]) => void;
  onUpdateObservations: (obs: string[]) => void;
  onUpdateRoleColors?: (colors: Record<string, string>) => void;
  onResetToDefaults: () => void;
}

type ConfigSubTab = 'colaboradores' | 'atividades' | 'cargos' | 'observacoes' | 'turnos' | 'importar';

const CATEGORIAS: ActivityCategory[] = [
  'Setup',
  'Operação',
  'Qualidade / Inspeção',
  'Manutenção',
  '5S & Limpeza',
  'Logística / Almoxarifado',
  'Sistema & Processo'
];

const PRESET_CORES = [
  { nome: 'Amarelo Ouro (Líder)', hex: '#FFD700' },
  { nome: 'Roxo (Preparador)', hex: '#8A2BE2' },
  { nome: 'Laranja (Inspetor)', hex: '#FF8C00' },
  { nome: 'Azul (Operador)', hex: '#007BFF' },
  { nome: 'Verde Neon (Auxiliar)', hex: '#00E676' },
  { nome: 'Rosa (Programador)', hex: '#E91E63' },
  { nome: 'Vermelho (Solda)', hex: '#FF3D00' },
  { nome: 'Marrom (Manutenção)', hex: '#795548' },
  { nome: 'Ciano (Estagiário)', hex: '#00BCD4' },
  { nome: 'Cinza Metálico', hex: '#607D8B' },
  { nome: 'Índigo', hex: '#3F51B5' },
  { nome: 'Teal Escuro', hex: '#009688' },
];

export const FactoryConfigManager: React.FC<FactoryConfigManagerProps> = ({
  collaborators,
  activities,
  shifts,
  observations,
  customRoleColors = {},
  onUpdateCollaborators,
  onUpdateActivities,
  onUpdateShifts,
  onUpdateObservations,
  onUpdateRoleColors,
  onResetToDefaults,
}) => {
  const [subTab, setSubTab] = useState<ConfigSubTab>('colaboradores');
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // In-App Confirm Dialog State (avoids window.confirm which is blocked in iframes)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText?: string;
    onConfirm: () => void;
  } | null>(null);

  // Filter state for activities view
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('TODOS');
  const [activitySearch, setActivitySearch] = useState('');

  // Collaborator form state
  const [newColabName, setNewColabName] = useState('');
  const [newColabRole, setNewColabRole] = useState('OPERADOR');
  const [newColabShift, setNewColabShift] = useState('Turno 1');
  const [editingColabId, setEditingColabId] = useState<string | null>(null);
  const [editColabForm, setEditColabForm] = useState<{ name: string; role: string; shift: string; active: boolean }>({
    name: '',
    role: '',
    shift: 'Turno 1',
    active: true
  });

  // Activity form state
  const [newActName, setNewActName] = useState('');
  const [newActRole, setNewActRole] = useState('OPERADOR');
  const [selectedRolesForNewAct, setSelectedRolesForNewAct] = useState<string[]>([]);
  const [isMultiRoleSelectOpen, setIsMultiRoleSelectOpen] = useState(false);
  const [newActPriority, setNewActPriority] = useState<number>(1);
  const [newActCategory, setNewActCategory] = useState<ActivityCategory>('Operação');
  const [newActMinutes, setNewActMinutes] = useState<number>(30);
  const [editingActId, setEditingActId] = useState<string | null>(null);
  const [editActForm, setEditActForm] = useState<Partial<ActivityItem>>({});

  // Multi-Role Deletion Modal State
  const [deleteMultiModal, setDeleteMultiModal] = useState<{
    isOpen: boolean;
    activityName: string;
    clickedActId: string;
    clickedRole: string;
    roles: {
      id: string;
      role: string;
      priority: number;
      category: ActivityCategory;
      standardMinutes?: number;
      checked: boolean;
    }[];
  } | null>(null);

  // Observation form state
  const [newObsText, setNewObsText] = useState('');

  // Role Customization State
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#007BFF');

  // Bulk Import State
  const [importText, setImportText] = useState('');
  const [importType, setImportType] = useState<'colabs' | 'activities' | 'obs'>('colabs');

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  // Distinct roles extracted from collaborators and activities
  const existingRoles = Array.from(
    new Set([
      ...collaborators.map((c) => c.role.toUpperCase().trim()),
      ...activities.map((a) => a.role.toUpperCase().trim()),
      'LÍDER DE PRODUÇÃO',
      'PREPARADOR TORNO AUTOMATICO',
      'INSPETOR TCNC / OPERADOR',
      'INSPETOR / OPERADOR TA',
      'PREPARADOR DE FERRAMENTAS',
      'PREPARADOR PROGAMADOR',
      'AREA DO CAVACO E OLEO',
      'SERVIÇOS GERAIS TORNO AUTOMATICO',
      'SISTEMA / AREA DO CAVACO E OLEO',
      'OPERADOR DE TORNO CNC',
      'OPERADOR DE CENTRO DE USINAGEM',
      'AUXILIAR DE PRODUÇÃO',
      'MANUTENÇÃO MECÂNICA',
      'SOLDADOR TIG/MIG',
    ])
  ).filter(Boolean);

  // Helper for role color
  const getRoleColor = (roleName: string) => {
    const r = roleName.toUpperCase().trim();
    if (customRoleColors[r]) return customRoleColors[r];
    return definirCorFuncao(r);
  };

  // -------------------------------------------------------------
  // 1. COLLABORATORS HANDLERS
  // -------------------------------------------------------------
  const handleAddCollaborator = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColabName.trim()) return;

    const newObj: Collaborator = {
      id: `col-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: newColabName.trim(),
      role: newColabRole.trim().toUpperCase(),
      shift: padronizarNomeTurno(newColabShift),
      active: true,
    };

    onUpdateCollaborators([...collaborators, newObj]);
    setNewColabName('');
    showNotification(`Colaborador "${newObj.name}" adicionado com sucesso!`);
  };

  const handleStartEditColab = (c: Collaborator) => {
    setEditingColabId(c.id);
    setEditColabForm({
      name: c.name,
      role: c.role,
      shift: padronizarNomeTurno(c.shift),
      active: c.active,
    });
  };

  const handleSaveEditColab = (id: string) => {
    if (!editColabForm.name.trim()) return;
    onUpdateCollaborators(
      collaborators.map((c) =>
        c.id === id
          ? {
              ...c,
              name: editColabForm.name.trim(),
              role: editColabForm.role.trim().toUpperCase(),
              shift: padronizarNomeTurno(editColabForm.shift),
              active: editColabForm.active,
            }
          : c
      )
    );
    setEditingColabId(null);
    showNotification('Dados do colaborador atualizados!');
  };

  const handleDeleteColab = (id: string, name: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Remover Colaborador',
      description: `Deseja remover "${name}" da lista de operadores da fábrica?`,
      confirmText: 'Sim, Remover',
      onConfirm: () => {
        onUpdateCollaborators(collaborators.filter((c) => c.id !== id));
        showNotification(`Colaborador "${name}" foi removido com sucesso.`);
        setConfirmModal(null);
      },
    });
  };

  const handleToggleColabActive = (id: string) => {
    onUpdateCollaborators(
      collaborators.map((c) => (c.id === id ? { ...c, active: !c.active } : c))
    );
  };

  // -------------------------------------------------------------
  // 2. ACTIVITIES HANDLERS (P1 a P14)
  // -------------------------------------------------------------
  const handleAddActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActName.trim()) return;

    const trimmedName = newActName.trim().toUpperCase();
    const parsedPriority = Number(newActPriority) || 1;
    const parsedMinutes = Number(newActMinutes) || 30;

    // Determine target roles
    let targetRoles: string[] = [];
    if (newActRole === 'ALL') {
      targetRoles = existingRoles;
    } else if (newActRole === 'MULTI') {
      targetRoles = selectedRolesForNewAct.length > 0 ? selectedRolesForNewAct : existingRoles;
    } else {
      targetRoles = [newActRole.trim().toUpperCase()];
    }

    if (targetRoles.length === 0) {
      showNotification('Selecione pelo menos um cargo para vincular a atividade!', 'error');
      return;
    }

    // Build new activity items for all target roles
    const newItems: ActivityItem[] = targetRoles.map((roleName, idx) => ({
      id: `act-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      role: roleName,
      name: trimmedName,
      priority: parsedPriority,
      category: newActCategory,
      standardMinutes: parsedMinutes,
    }));

    // Remove existing duplicates with identical role and name
    const cleanExisting = activities.filter(
      (a) =>
        !targetRoles.some(
          (tr) => tr.toUpperCase() === a.role.toUpperCase() && a.name.trim().toUpperCase() === trimmedName
        )
    );

    onUpdateActivities([...cleanExisting, ...newItems]);
    setNewActName('');

    if (targetRoles.length > 1) {
      showNotification(
        `Atividade "${trimmedName}" (${parsedMinutes} min) vinculada com sucesso a ${targetRoles.length} cargos!`
      );
    } else {
      showNotification(
        `Atividade P${parsedPriority} - "${trimmedName}" (${parsedMinutes} min) vinculada a ${targetRoles[0]}!`
      );
    }
  };

  const handleStartEditAct = (act: ActivityItem) => {
    setEditingActId(act.id);
    setEditActForm({ ...act });
  };

  const handleSaveEditAct = (id: string) => {
    if (!editActForm.name?.trim()) return;
    onUpdateActivities(
      activities.map((a) =>
        a.id === id
          ? {
              ...a,
              name: editActForm.name?.trim().toUpperCase() || a.name,
              role: editActForm.role?.trim().toUpperCase() || a.role,
              priority: Number(editActForm.priority) || a.priority,
              category: editActForm.category || a.category,
              standardMinutes: Number(editActForm.standardMinutes) || a.standardMinutes || 30,
            }
          : a
      )
    );
    setEditingActId(null);
    showNotification('Atividade e tempo padrão atualizados com sucesso!');
  };

  const handleDeleteActivity = (act: ActivityItem) => {
    const actNameUpper = act.name.trim().toUpperCase();
    const sameNameActs = activities.filter(
      (a) => a.name.trim().toUpperCase() === actNameUpper
    );

    if (sameNameActs.length <= 1) {
      // Exists only in a single role
      setConfirmModal({
        isOpen: true,
        title: 'Excluir Atividade',
        description: `Deseja realmente excluir a atividade "${act.name}" do cargo "${act.role}"?`,
        confirmText: 'Sim, Excluir',
        onConfirm: () => {
          onUpdateActivities(activities.filter((a) => a.id !== act.id));
          showNotification(`Atividade "${act.name}" excluída com sucesso!`);
          setConfirmModal(null);
        },
      });
    } else {
      // Exists in multiple roles: Open multi-role deletion modal where user can check/uncheck
      setDeleteMultiModal({
        isOpen: true,
        activityName: act.name,
        clickedActId: act.id,
        clickedRole: act.role,
        roles: sameNameActs.map((a) => ({
          id: a.id,
          role: a.role,
          priority: a.priority,
          category: a.category,
          standardMinutes: a.standardMinutes,
          checked: true, // Default to all checked, user can uncheck the ones they want to keep
        })),
      });
    }
  };

  const handleConfirmMultiDelete = (selectedIds: string[]) => {
    if (!selectedIds || selectedIds.length === 0) {
      showNotification('Nenhum cargo selecionado para exclusão.', 'error');
      return;
    }
    onUpdateActivities(activities.filter((a) => !selectedIds.includes(a.id)));
    showNotification(`Atividade removida de ${selectedIds.length} cargo(s) com sucesso!`);
    setDeleteMultiModal(null);
  };

  // -------------------------------------------------------------
  // 3. ROLE COLORS HANDLERS
  // -------------------------------------------------------------
  const handleSaveRoleColor = (roleName: string, colorHex: string) => {
    if (onUpdateRoleColors) {
      const updated = { ...customRoleColors, [roleName.toUpperCase().trim()]: colorHex };
      onUpdateRoleColors(updated);
      showNotification(`Cor do cargo "${roleName}" alterada para ${colorHex}!`);
    }
  };

  const handleAddNewRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    const rUpper = newRoleName.trim().toUpperCase();
    if (onUpdateRoleColors) {
      onUpdateRoleColors({ ...customRoleColors, [rUpper]: newRoleColor });
    }
    setNewRoleName('');
    showNotification(`Novo cargo "${rUpper}" registrado com sucesso!`);
  };

  // -------------------------------------------------------------
  // 4. OBSERVATIONS HANDLERS
  // -------------------------------------------------------------
  const handleAddObservation = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = newObsText.trim();
    if (!cleanText) return;
    if (cleanText.toLowerCase().startsWith('sem observ')) {
      showNotification('Esta opção já é o padrão fixo do sistema!', 'error');
      return;
    }
    if (observations.some((o) => o.toLowerCase() === cleanText.toLowerCase())) {
      showNotification('Essa observação já está na lista!', 'error');
      return;
    }
    onUpdateObservations([...observations, cleanText]);
    setNewObsText('');
    showNotification('Nova observação adicionada com sucesso!');
  };

  const handleDeleteObservation = (obsText: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Remover Observação',
      description: `Deseja remover a observação padrão "${obsText}"?`,
      confirmText: 'Sim, Remover',
      onConfirm: () => {
        onUpdateObservations(observations.filter((o) => o !== obsText));
        showNotification('Observação removida com sucesso.');
        setConfirmModal(null);
      },
    });
  };

  // -------------------------------------------------------------
  // 5. BULK IMPORT / PASTE FROM SPREADSHEET
  // -------------------------------------------------------------
  const handleProcessBulkImport = () => {
    if (!importText.trim()) {
      showNotification('Cole o texto da planilha no campo abaixo!', 'error');
      return;
    }

    const lines = importText.split('\n').map((l) => l.trim()).filter(Boolean);
    let countAdded = 0;

    if (importType === 'colabs') {
      // Format expected: Nome [tab or semicolon or comma] Cargo [tab or semicolon or comma] Turno
      const newColabs: Collaborator[] = [];
      lines.forEach((line, idx) => {
        const parts = line.split(/[\t;,|]+/).map((p) => p.trim());
        if (parts.length >= 1 && parts[0]) {
          const name = parts[0];
          const role = parts[1] ? parts[1].toUpperCase() : 'OPERADOR';
          const shift = parts[2] ? parts[2].toUpperCase() : 'TURNO 1';
          newColabs.push({
            id: `col-bulk-${Date.now()}-${idx}`,
            name,
            role,
            shift: padronizarNomeTurno(parts[2]),
            active: true,
          });
          countAdded++;
        }
      });

      if (newColabs.length > 0) {
        onUpdateCollaborators([...collaborators, ...newColabs]);
        setImportText('');
        showNotification(`${countAdded} colaboradores importados com sucesso da planilha!`);
      }
    } else if (importType === 'activities') {
      // Format expected: Cargo [tab/sep] Atividade [tab/sep] Prioridade [tab/sep] Categoria
      const newActs: ActivityItem[] = [];
      lines.forEach((line, idx) => {
        const parts = line.split(/[\t;,|]+/).map((p) => p.trim());
        if (parts.length >= 2 && parts[0] && parts[1]) {
          const role = parts[0].toUpperCase();
          const name = parts[1].toUpperCase();
          const priority = parseInt(parts[2], 10) || (idx + 1);
          const catStr = parts[3] || 'Operação';
          const catValid = CATEGORIAS.find((c) => c.toLowerCase() === catStr.toLowerCase()) || 'Operação';

          newActs.push({
            id: `act-bulk-${Date.now()}-${idx}`,
            role,
            name,
            priority,
            category: catValid,
            standardMinutes: 30,
          });
          countAdded++;
        }
      });

      if (newActs.length > 0) {
        onUpdateActivities([...activities, ...newActs]);
        setImportText('');
        showNotification(`${countAdded} atividades importadas da planilha com prioridades!`);
      }
    } else if (importType === 'obs') {
      const newObs = lines.filter((l) => !observations.includes(l));
      if (newObs.length > 0) {
        onUpdateObservations([...observations, ...newObs]);
        setImportText('');
        showNotification(`${newObs.length} observações adicionadas!`);
      }
    }
  };

  // Filtered activities list
  const filteredActivities = activities
    .filter((a) => {
      const matchRole = selectedRoleFilter === 'TODOS' || a.role.toUpperCase() === selectedRoleFilter.toUpperCase();
      const matchSearch =
        !activitySearch ||
        a.name.toLowerCase().includes(activitySearch.toLowerCase()) ||
        a.role.toLowerCase().includes(activitySearch.toLowerCase()) ||
        a.category.toLowerCase().includes(activitySearch.toLowerCase());
      return matchRole && matchSearch;
    })
    .sort((a, b) => {
      if (a.role !== b.role) return a.role.localeCompare(b.role);
      return a.priority - b.priority;
    });

  return (
    <div className="bg-[#181818] border border-[#333333] rounded-xl overflow-hidden shadow-2xl space-y-4">
      {/* Header do Painel de Configuração */}
      <div className="bg-[#111111] p-4 border-b border-[#333333] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#007BFF] flex items-center justify-center text-white font-bold shadow-md">
            ⚙️
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
              Configuração Total da Fábrica
              <span className="px-2 py-0.5 bg-[#00E676]/20 border border-[#00E676]/40 text-[#00E676] text-[10px] font-mono rounded">
                MODO LÍDER (8619)
              </span>
            </h3>
            <p className="text-xs text-[#888888]">
              Personalize operadores, matriz de atividades P1-P14, cargos, cores e copie direto da sua planilha
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setConfirmModal({
              isOpen: true,
              title: 'Restaurar Padrões de Fábrica',
              description:
                'Deseja restaurar as configurações de fábrica (colaboradores, matriz de atividades P1-P14 e turnos iniciais)? Esta ação substituirá as customizações atuais.',
              confirmText: 'Sim, Restaurar',
              onConfirm: () => {
                onResetToDefaults();
                showNotification('Configurações restauradas para os dados padrão!');
                setConfirmModal(null);
              },
            });
          }}
          className="px-3 py-1.5 bg-[#222222] hover:bg-[#333333] text-[#AAAAAA] hover:text-[#FF3D00] border border-[#444444] rounded text-xs flex items-center gap-1.5 transition cursor-pointer"
          title="Restaurar dados padrão"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restaurar Padrão</span>
        </button>
      </div>

      {/* Feedback Alert Message */}
      {feedbackMsg && (
        <div
          className={`mx-4 p-3 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 animate-in fade-in duration-200 ${
            feedbackMsg.type === 'success'
              ? 'bg-[#00E676]/20 border border-[#00E676] text-[#00E676]'
              : 'bg-[#FF3D00]/20 border border-[#FF3D00] text-[#FF3D00]'
          }`}
        >
          <Check className="w-4 h-4 shrink-0" />
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Sub-navegação do Painel de Configuração */}
      <div className="px-4">
        <div className="flex flex-wrap gap-1.5 p-1.5 bg-[#111111] rounded-lg border border-[#333333]">
          <button
            onClick={() => setSubTab('colaboradores')}
            className={`px-3 py-2 rounded-md text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              subTab === 'colaboradores'
                ? 'bg-[#007BFF] text-white shadow'
                : 'text-[#AAAAAA] hover:text-white hover:bg-[#222222]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Colaboradores ({collaborators.length})</span>
          </button>

          <button
            onClick={() => setSubTab('atividades')}
            className={`px-3 py-2 rounded-md text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              subTab === 'atividades'
                ? 'bg-[#007BFF] text-white shadow'
                : 'text-[#AAAAAA] hover:text-white hover:bg-[#222222]'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5" />
            <span>Matriz de Atividades P1-P14 ({activities.length})</span>
          </button>

          <button
            onClick={() => setSubTab('cargos')}
            className={`px-3 py-2 rounded-md text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              subTab === 'cargos'
                ? 'bg-[#007BFF] text-white shadow'
                : 'text-[#AAAAAA] hover:text-white hover:bg-[#222222]'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Cargos & Cores</span>
          </button>

          <button
            onClick={() => setSubTab('observacoes')}
            className={`px-3 py-2 rounded-md text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              subTab === 'observacoes'
                ? 'bg-[#007BFF] text-white shadow'
                : 'text-[#AAAAAA] hover:text-white hover:bg-[#222222]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Observações de Fechamento ({observations.length})</span>
          </button>

          <button
            onClick={() => setSubTab('importar')}
            className={`px-3 py-2 rounded-md text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              subTab === 'importar'
                ? 'bg-[#00E676] text-black shadow'
                : 'text-[#00E676] hover:bg-[#222222]'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>📥 Colar da Planilha (Em Massa)</span>
          </button>
        </div>
      </div>

      {/* Conteúdo da Sub-Aba Selecionada */}
      <div className="p-4 pt-1">
        {/* ========================================================= */}
        {/* 1. ABA COLABORADORES                                      */}
        {/* ========================================================= */}
        {subTab === 'colaboradores' && (
          <div className="space-y-4">
            {/* Form de Cadastro de Novo Operador */}
            <form
              onSubmit={handleAddCollaborator}
              className="p-4 bg-[#1E1E1E] rounded-lg border border-[#333333] grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
            >
              <div>
                <label className="block text-xs font-bold text-[#CCCCCC] mb-1">
                  Nome do Colaborador:
                </label>
                <input
                  type="text"
                  placeholder="Ex: João da Silva"
                  value={newColabName}
                  onChange={(e) => setNewColabName(e.target.value)}
                  className="w-full p-2.5 bg-[#111111] text-white border border-[#555555] rounded text-xs focus:outline-none focus:border-[#007BFF]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#CCCCCC] mb-1">Cargo / Função:</label>
                <select
                  value={newColabRole}
                  onChange={(e) => setNewColabRole(e.target.value)}
                  className="w-full p-2.5 bg-[#111111] text-white border border-[#555555] rounded text-xs focus:outline-none focus:border-[#007BFF]"
                >
                  {existingRoles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#CCCCCC] mb-1">Turno Alocado:</label>
                <select
                  value={newColabShift}
                  onChange={(e) => setNewColabShift(e.target.value)}
                  className="w-full p-2.5 bg-[#111111] text-white border border-[#555555] rounded text-xs focus:outline-none focus:border-[#007BFF]"
                >
                  {shifts.map((s) => {
                    const isInactive = !s.dias || s.dias.length === 0;
                    const shiftVal = padronizarNomeTurno(s.name);
                    return (
                      <option key={s.id} value={shiftVal}>
                        {shiftVal} ({s.entrada} - {s.saida}{isInactive ? ' • INATIVO' : ''})
                      </option>
                    );
                  })}
                </select>
              </div>

              <button
                type="submit"
                className="py-2.5 px-4 bg-[#0066CC] hover:bg-[#005bb5] text-white font-bold rounded text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Cadastrar Colaborador</span>
              </button>
            </form>

            {/* Lista dos Colaboradores Cadastrados */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {collaborators.map((c) => {
                const isEditing = editingColabId === c.id;
                const corCargo = getRoleColor(c.role);

                if (isEditing) {
                  return (
                    <div
                      key={c.id}
                      className="p-3.5 bg-[#222222] border-2 border-[#007BFF] rounded-lg space-y-2.5 shadow-lg"
                    >
                      <div className="text-xs font-bold text-[#007BFF]">Editando Colaborador</div>
                      <input
                        type="text"
                        value={editColabForm.name}
                        onChange={(e) => setEditColabForm({ ...editColabForm, name: e.target.value })}
                        className="w-full p-2 bg-[#111111] text-white border border-[#555555] rounded text-xs"
                        placeholder="Nome"
                      />
                      <select
                        value={editColabForm.role}
                        onChange={(e) => setEditColabForm({ ...editColabForm, role: e.target.value })}
                        className="w-full p-2 bg-[#111111] text-white border border-[#555555] rounded text-xs"
                      >
                        {existingRoles.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <select
                        value={padronizarNomeTurno(editColabForm.shift)}
                        onChange={(e) => setEditColabForm({ ...editColabForm, shift: e.target.value })}
                        className="w-full p-2 bg-[#111111] text-white border border-[#555555] rounded text-xs"
                      >
                        {shifts.map((s) => {
                          const isInactive = !s.dias || s.dias.length === 0;
                          const shiftVal = padronizarNomeTurno(s.name);
                          return (
                            <option key={s.id} value={shiftVal}>
                              {shiftVal} ({s.entrada} - {s.saida}{isInactive ? ' • INATIVO' : ''})
                            </option>
                          );
                        })}
                      </select>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingColabId(null)}
                          className="px-2.5 py-1 bg-[#333333] hover:bg-[#444444] text-white text-xs rounded"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEditColab(c.id)}
                          className="px-3 py-1 bg-[#00E676] text-black font-bold text-xs rounded flex items-center gap-1"
                        >
                          <Save className="w-3.5 h-3.5" />
                          Salvar
                        </button>
                      </div>
                    </div>
                  );
                }

                const assignedShift = shifts.find(
                  (s) =>
                    s.name.toUpperCase() === c.shift.toUpperCase() ||
                    s.code.toUpperCase() === c.shift.toUpperCase() ||
                    c.shift.toUpperCase().includes(s.name.toUpperCase())
                );
                const isShiftInactive = assignedShift && (!assignedShift.dias || assignedShift.dias.length === 0);

                return (
                  <div
                    key={c.id}
                    className="p-3.5 bg-[#111111] border border-[#333333] rounded-lg flex items-center justify-between gap-3 shadow-md hover:border-[#555555] transition"
                    style={{ borderLeft: `5px solid ${corCargo}` }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm text-white truncate flex items-center gap-2">
                        <span>{c.name}</span>
                        {!c.active && (
                          <span className="text-[10px] px-1.5 py-0.2 bg-[#FF3D00]/20 text-[#FF3D00] rounded">
                            Inativo
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#AAAAAA] truncate font-medium">{c.role}</div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-[#007BFF] font-mono font-bold">
                          {c.shift} {assignedShift ? `(${assignedShift.entrada} - ${assignedShift.saida})` : ''}
                        </span>
                        {isShiftInactive && (
                          <span className="text-[9px] px-1.5 py-0.2 bg-[#FF3D00]/20 border border-[#FF3D00]/40 text-[#FF3D00] rounded font-bold">
                            Turno Inativo
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleToggleColabActive(c.id)}
                        className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition ${
                          c.active
                            ? 'bg-[#00E676]/20 text-[#00E676] border border-[#00E676]/40'
                            : 'bg-[#555555]/20 text-[#888888] border border-[#555555]'
                        }`}
                        title="Ativar/Desativar no chão de fábrica"
                      >
                        {c.active ? 'Ativo' : 'Pausado'}
                      </button>

                      <button
                        onClick={() => handleStartEditColab(c)}
                        className="p-1.5 hover:bg-[#222222] text-[#AAAAAA] hover:text-white rounded transition cursor-pointer"
                        title="Editar Colaborador"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteColab(c.id, c.name)}
                        className="p-1.5 hover:bg-[#222222] text-[#888888] hover:text-[#FF3D00] rounded transition cursor-pointer"
                        title="Remover Colaborador"
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

        {/* ========================================================= */}
        {/* 2. ABA MATRIZ DE ATIVIDADES P1 A P14                       */}
        {/* ========================================================= */}
        {subTab === 'atividades' && (
          <div className="space-y-4">
            {/* Form de Cadastro de Nova Atividade */}
            <div className="p-4 bg-[#1E1E1E] rounded-lg border border-[#333333] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#333333] pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-[#007BFF]/20 text-[#007BFF] rounded-lg">
                    <Layers className="w-4 h-4" />
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Cadastrar Atividade na Matriz
                    </h3>
                    <p className="text-[11px] text-[#888888]">
                      Vincule rotinas operacionais a um cargo específico, a múltiplos cargos ou a <b>TODOS</b> de uma vez.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setNewActRole('ALL');
                      setIsMultiRoleSelectOpen(false);
                    }}
                    className={`px-2.5 py-1 text-xs rounded font-bold cursor-pointer transition flex items-center gap-1 border ${
                      newActRole === 'ALL'
                        ? 'bg-[#FFD700]/20 border-[#FFD700] text-[#FFD700]'
                        : 'bg-[#222222] border-[#444444] text-[#AAAAAA] hover:text-white'
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Vincular a Todos os Cargos</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setNewActRole('MULTI');
                      setIsMultiRoleSelectOpen(!isMultiRoleSelectOpen);
                      if (selectedRolesForNewAct.length === 0) {
                        setSelectedRolesForNewAct(existingRoles);
                      }
                    }}
                    className={`px-2.5 py-1 text-xs rounded font-bold cursor-pointer transition flex items-center gap-1 border ${
                      newActRole === 'MULTI'
                        ? 'bg-[#007BFF]/20 border-[#007BFF] text-[#007BFF]'
                        : 'bg-[#222222] border-[#444444] text-[#AAAAAA] hover:text-white'
                    }`}
                  >
                    <CheckSquare className="w-3 h-3" />
                    <span>Selecionar Múltiplos ({selectedRolesForNewAct.length})</span>
                  </button>
                </div>
              </div>

              {/* Multi-role selection panel when MULTI is chosen */}
              {newActRole === 'MULTI' && (
                <div className="p-3 bg-[#161616] border border-[#007BFF]/40 rounded-lg space-y-2.5 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                    <span className="text-white font-bold flex items-center gap-1.5">
                      <CheckSquare className="w-3.5 h-3.5 text-[#007BFF]" />
                      Selecione os cargos que terão esta atividade:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedRolesForNewAct(existingRoles)}
                        className="px-2 py-0.5 bg-[#2A2A2A] hover:bg-[#333333] text-[#00E676] rounded text-[11px] font-semibold cursor-pointer"
                      >
                        Marcar Todos ({existingRoles.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedRolesForNewAct([])}
                        className="px-2 py-0.5 bg-[#2A2A2A] hover:bg-[#333333] text-[#888888] rounded text-[11px] cursor-pointer"
                      >
                        Desmarcar Todos
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-36 overflow-y-auto p-1 bg-[#111111] rounded border border-[#333333]">
                    {existingRoles.map((role) => {
                      const isSelected = selectedRolesForNewAct.includes(role);
                      const cor = getRoleColor(role);
                      return (
                        <label
                          key={role}
                          className={`flex items-center gap-2 p-1.5 rounded text-[11px] cursor-pointer transition select-none ${
                            isSelected ? 'bg-[#222222] text-white font-bold' : 'text-[#888888] hover:bg-[#1A1A1A]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRolesForNewAct([...selectedRolesForNewAct, role]);
                              } else {
                                setSelectedRolesForNewAct(selectedRolesForNewAct.filter((r) => r !== role));
                              }
                            }}
                            className="w-3.5 h-3.5 accent-[#007BFF] rounded cursor-pointer shrink-0"
                          />
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cor }} />
                          <span className="truncate">{role}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <form
                onSubmit={handleAddActivity}
                className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end"
              >
                <div className="sm:col-span-1">
                  <label className="block text-xs font-bold text-[#CCCCCC] mb-1">Cargo Vinculado:</label>
                  <select
                    value={newActRole}
                    onChange={(e) => {
                      setNewActRole(e.target.value);
                      if (e.target.value === 'MULTI') {
                        if (selectedRolesForNewAct.length === 0) setSelectedRolesForNewAct(existingRoles);
                      }
                    }}
                    className="w-full p-2 bg-[#111111] text-white border border-[#555555] rounded text-xs focus:outline-none focus:border-[#007BFF]"
                  >
                    <option value="ALL">⭐ [TODOS OS CARGOS] ({existingRoles.length})</option>
                    <option value="MULTI">☑️ [MÚLTIPLOS CARGOS ({selectedRolesForNewAct.length})]...</option>
                    <optgroup label="── Cargos Individuais ──">
                      {existingRoles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[#CCCCCC] mb-1">Nome da Atividade:</label>
                  <input
                    type="text"
                    placeholder="Ex: SETUP DE MÁQUINA"
                    value={newActName}
                    onChange={(e) => setNewActName(e.target.value)}
                    className="w-full p-2 bg-[#111111] text-white border border-[#555555] rounded text-xs focus:outline-none focus:border-[#007BFF]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#CCCCCC] mb-1">Prioridade (P1..P14):</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={newActPriority}
                    onChange={(e) => setNewActPriority(parseInt(e.target.value, 10) || 1)}
                    className="w-full p-2 bg-[#111111] text-white border border-[#555555] rounded text-xs font-mono focus:outline-none focus:border-[#007BFF]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#CCCCCC] mb-1 flex items-center justify-between">
                    <span>Tempo Padrão:</span>
                    <span className="text-[10px] text-[#00E676] font-normal font-mono">Minutos</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      max="999"
                      placeholder="Ex: 45"
                      value={newActMinutes}
                      onChange={(e) => setNewActMinutes(parseInt(e.target.value, 10) || 30)}
                      className="w-full p-2 bg-[#111111] text-white border border-[#555555] rounded text-xs font-mono focus:outline-none focus:border-[#007BFF] pl-7"
                      required
                    />
                    <Clock className="w-3.5 h-3.5 text-[#00E676] absolute left-2 top-2.5 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#CCCCCC] mb-1">Categoria:</label>
                  <select
                    value={newActCategory}
                    onChange={(e) => setNewActCategory(e.target.value as ActivityCategory)}
                    className="w-full p-2 bg-[#111111] text-white border border-[#555555] rounded text-xs focus:outline-none focus:border-[#007BFF]"
                  >
                    {CATEGORIAS.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-6 flex justify-end pt-1">
                  <button
                    type="submit"
                    className="py-2.5 px-5 bg-[#0066CC] hover:bg-[#005bb5] text-white font-bold rounded text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md"
                  >
                    <Plus className="w-4 h-4" />
                    <span>
                      {newActRole === 'ALL'
                        ? `Vincular a TODOS os ${existingRoles.length} Cargos`
                        : newActRole === 'MULTI'
                        ? `Vincular a ${selectedRolesForNewAct.length} Cargos Selecionados`
                        : 'Adicionar Atividade'}
                    </span>
                  </button>
                </div>
              </form>
            </div>

            {/* Barra de Filtro de Atividades por Cargo e Busca */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111111] p-3 rounded-lg border border-[#333333]">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs font-bold text-[#CCCCCC] flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-[#007BFF]" />
                  Filtrar Cargo:
                </label>
                <select
                  value={selectedRoleFilter}
                  onChange={(e) => setSelectedRoleFilter(e.target.value)}
                  className="py-1.5 px-2.5 bg-[#222222] text-white border border-[#555555] rounded text-xs"
                >
                  <option value="TODOS">TODOS OS CARGOS ({activities.length} total)</option>
                  {existingRoles.map((r) => {
                    const count = activities.filter((a) => a.role === r).length;
                    return (
                      <option key={r} value={r}>
                        {r} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="w-full sm:w-64">
                <input
                  type="text"
                  placeholder="🔍 Buscar atividade..."
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                  className="w-full py-1.5 px-3 bg-[#222222] text-white border border-[#555555] rounded text-xs"
                />
              </div>
            </div>

            {/* Tabela de Atividades com Prioridades */}
            <div className="overflow-x-auto bg-[#111111] rounded-lg border border-[#333333]">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="bg-[#222222] text-[#007BFF] font-bold uppercase tracking-wider text-xs border-b border-[#333333]">
                    <th className="p-3 w-16 text-center">Prioridade</th>
                    <th className="p-3">Cargo / Função</th>
                    <th className="p-3">Nome da Atividade</th>
                    <th className="p-3">Categoria</th>
                    <th className="p-3 w-32 text-center">Tempo Padrão</th>
                    <th className="p-3 w-28 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#222222]">
                  {filteredActivities.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-[#888888]">
                        Nenhuma atividade cadastrada para este filtro.
                      </td>
                    </tr>
                  ) : (
                    filteredActivities.map((act) => {
                      const isEditing = editingActId === act.id;
                      const corCargo = getRoleColor(act.role);

                      if (isEditing) {
                        return (
                          <tr key={act.id} className="bg-[#1A1A2E]">
                            <td className="p-2 text-center">
                              <input
                                type="number"
                                min="1"
                                max="50"
                                value={editActForm.priority}
                                onChange={(e) =>
                                  setEditActForm({
                                    ...editActForm,
                                    priority: parseInt(e.target.value, 10) || 1,
                                  })
                                }
                                className="w-14 p-1 bg-[#111111] text-white text-center font-mono rounded border border-[#555555]"
                              />
                            </td>
                            <td className="p-2">
                              <select
                                value={editActForm.role}
                                onChange={(e) => setEditActForm({ ...editActForm, role: e.target.value })}
                                className="p-1 bg-[#111111] text-white text-xs rounded border border-[#555555]"
                              >
                                {existingRoles.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={editActForm.name}
                                onChange={(e) => setEditActForm({ ...editActForm, name: e.target.value })}
                                className="w-full p-1 bg-[#111111] text-white text-xs rounded border border-[#555555]"
                              />
                            </td>
                            <td className="p-2">
                              <select
                                value={editActForm.category}
                                onChange={(e) =>
                                  setEditActForm({
                                    ...editActForm,
                                    category: e.target.value as ActivityCategory,
                                  })
                                }
                                className="p-1 bg-[#111111] text-white text-xs rounded border border-[#555555]"
                              >
                                {CATEGORIAS.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="number"
                                  min="1"
                                  max="999"
                                  value={editActForm.standardMinutes || 30}
                                  onChange={(e) =>
                                    setEditActForm({
                                      ...editActForm,
                                      standardMinutes: parseInt(e.target.value, 10) || 30,
                                    })
                                  }
                                  className="w-16 p-1 bg-[#111111] text-white text-center font-mono text-xs rounded border border-[#00E676]/50 text-[#00E676] font-bold"
                                />
                                <span className="text-[10px] text-[#888888]">min</span>
                              </div>
                            </td>
                            <td className="p-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => setEditingActId(null)}
                                  className="p-1 text-[#888888] hover:text-white cursor-pointer"
                                  title="Cancelar"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleSaveEditAct(act.id)}
                                  className="p-1 text-[#00E676] hover:text-white font-bold cursor-pointer"
                                  title="Salvar"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={act.id} className="hover:bg-[#1A1A1A] transition">
                          <td className="p-3 text-center">
                            <span className="px-2 py-0.5 bg-[#222222] border border-[#444444] rounded text-xs font-mono font-black text-[#00E676]">
                              P{act.priority}
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-xs">
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-full mr-2"
                              style={{ backgroundColor: corCargo }}
                            />
                            <span className="text-[#DDDDDD]">{act.role}</span>
                          </td>
                          <td className="p-3 font-bold text-white text-xs sm:text-sm">{act.name}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 bg-[#252525] text-[#AAAAAA] rounded text-[11px]">
                              {act.category}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className="px-2 py-0.5 bg-[#00E676]/10 border border-[#00E676]/30 text-[#00E676] rounded text-xs font-mono font-bold whitespace-nowrap">
                              ⏱️ {act.standardMinutes ? `${act.standardMinutes} min` : '30 min'}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleStartEditAct(act)}
                                className="p-1 text-[#AAAAAA] hover:text-white transition cursor-pointer"
                                title="Editar Atividade e Tempo Padrão"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteActivity(act)}
                                className="p-1 text-[#888888] hover:text-[#FF3D00] transition cursor-pointer"
                                title="Excluir Atividade"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* 3. ABA CARGOS & CORES                                      */}
        {/* ========================================================= */}
        {subTab === 'cargos' && (
          <div className="space-y-4">
            {/* Form para Adicionar Novo Cargo */}
            <form
              onSubmit={handleAddNewRole}
              className="p-4 bg-[#1E1E1E] rounded-lg border border-[#333333] grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
            >
              <div>
                <label className="block text-xs font-bold text-[#CCCCCC] mb-1">
                  Nome do Novo Cargo / Setor:
                </label>
                <input
                  type="text"
                  placeholder="Ex: OPERADOR DE RETÍFICA"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  className="w-full p-2.5 bg-[#111111] text-white border border-[#555555] rounded text-xs focus:outline-none focus:border-[#007BFF]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#CCCCCC] mb-1">
                  Cor do Cabeçalho do Cartão:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newRoleColor}
                    onChange={(e) => setNewRoleColor(e.target.value)}
                    className="w-10 h-9 p-0.5 bg-[#111111] border border-[#555555] rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={newRoleColor}
                    onChange={(e) => setNewRoleColor(e.target.value)}
                    className="flex-1 p-2 bg-[#111111] text-white border border-[#555555] rounded text-xs font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="py-2.5 px-4 bg-[#0066CC] hover:bg-[#005bb5] text-white font-bold rounded text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Salvar Cargo & Cor</span>
              </button>
            </form>

            {/* Grid dos Cargos Atuais com Seletor de Cores */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {existingRoles.map((role) => {
                const corAtual = getRoleColor(role);
                const colabsCount = collaborators.filter((c) => c.role === role).length;
                const actsCount = activities.filter((a) => a.role === role).length;

                return (
                  <div
                    key={role}
                    className="p-3.5 bg-[#111111] border border-[#333333] rounded-lg space-y-2.5 shadow-md"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-xs sm:text-sm text-white truncate max-w-[70%]">
                        {role}
                      </div>
                      <span
                        className="w-5 h-5 rounded-full border border-[#555555] shrink-0"
                        style={{ backgroundColor: corAtual }}
                        title={`Cor atual: ${corAtual}`}
                      />
                    </div>

                    <div className="text-[11px] text-[#888888] flex items-center gap-3">
                      <span>👥 {colabsCount} operadores</span>
                      <span>📋 {actsCount} atividades Pn</span>
                    </div>

                    <div className="pt-2 border-t border-[#222222] flex items-center justify-between gap-2">
                      <span className="text-[10px] text-[#AAAAAA] font-bold">Alterar Cor:</span>
                      <div className="flex items-center gap-1.5">
                        {PRESET_CORES.slice(0, 5).map((preset) => (
                          <button
                            key={preset.hex}
                            type="button"
                            onClick={() => handleSaveRoleColor(role, preset.hex)}
                            className="w-4 h-4 rounded-full border border-black/50 hover:scale-125 transition cursor-pointer"
                            style={{ backgroundColor: preset.hex }}
                            title={preset.nome}
                          />
                        ))}
                        <input
                          type="color"
                          value={corAtual}
                          onChange={(e) => handleSaveRoleColor(role, e.target.value)}
                          className="w-6 h-6 p-0 border border-[#555555] rounded cursor-pointer"
                          title="Escolher cor personalizada"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* 4. ABA OBSERVAÇÕES PADRÃO DE FECHAMENTO                    */}
        {/* ========================================================= */}
        {subTab === 'observacoes' && (
          <div className="space-y-4">
            {/* Form de Adicionar Observação */}
            <form
              onSubmit={handleAddObservation}
              className="p-4 bg-[#1E1E1E] rounded-lg border border-[#333333] flex flex-wrap sm:flex-nowrap gap-3 items-end"
            >
              <div className="flex-1">
                <label className="block text-xs font-bold text-[#CCCCCC] mb-1">
                  Nova Opção de Observação / Motivo de Parada / Status:
                </label>
                <input
                  type="text"
                  placeholder="Ex: Falta de Ferramental na Ferramentaria"
                  value={newObsText}
                  onChange={(e) => setNewObsText(e.target.value)}
                  className="w-full p-2.5 bg-[#111111] text-white border border-[#555555] rounded text-xs focus:outline-none focus:border-[#007BFF]"
                  required
                />
              </div>

              <button
                type="submit"
                className="py-2.5 px-4 bg-[#0066CC] hover:bg-[#005bb5] text-white font-bold rounded text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar ao Menu Suspenso</span>
              </button>
            </form>

            {/* Lista das Observações */}
            <div className="bg-[#111111] rounded-lg border border-[#333333] divide-y divide-[#222222]">
              {observations.map((obs, idx) => (
                <div
                  key={idx}
                  className="p-3 flex items-center justify-between gap-3 hover:bg-[#1A1A1A] transition text-xs sm:text-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-[#222222] text-[#888888] text-[10px] font-mono flex items-center justify-center font-bold">
                      {idx + 1}
                    </span>
                    <span className="text-white font-medium">{obs}</span>
                  </div>

                  <button
                    onClick={() => handleDeleteObservation(obs)}
                    className="p-1.5 text-[#888888] hover:text-[#FF3D00] transition"
                    title="Excluir Observação"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* 5. ABA COLAR DA PLANILHA (EM MASSA)                        */}
        {/* ========================================================= */}
        {subTab === 'importar' && (
          <div className="p-4 bg-[#1E1E1E] rounded-lg border border-[#333333] space-y-4">
            <div>
              <h4 className="text-sm font-bold text-[#00E676] flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                Importar e Cadastrar Direto da sua Planilha do Excel / Google Sheets
              </h4>
              <p className="text-xs text-[#888888] mt-1">
                Copie as colunas da sua planilha e cole aqui no campo abaixo para cadastrar tudo de uma vez sem precisar digitar um por um.
              </p>
            </div>

            {/* Seletor do Tipo de Importação */}
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-xs font-bold text-white cursor-pointer">
                <input
                  type="radio"
                  name="importType"
                  checked={importType === 'colabs'}
                  onChange={() => setImportType('colabs')}
                  className="accent-[#007BFF]"
                />
                <span>Colaboradores (Nome | Cargo | Turno)</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-bold text-white cursor-pointer">
                <input
                  type="radio"
                  name="importType"
                  checked={importType === 'activities'}
                  onChange={() => setImportType('activities')}
                  className="accent-[#007BFF]"
                />
                <span>Atividades (Cargo | Atividade | Prioridade)</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-bold text-white cursor-pointer">
                <input
                  type="radio"
                  name="importType"
                  checked={importType === 'obs'}
                  onChange={() => setImportType('obs')}
                  className="accent-[#007BFF]"
                />
                <span>Observações (Uma por linha)</span>
              </label>
            </div>

            {/* Formato de Exemplo */}
            <div className="p-3 bg-[#111111] rounded border border-[#333333] text-[11px] font-mono text-[#AAAAAA]">
              {importType === 'colabs' && (
                <>
                  <span className="text-[#00E676] font-bold">Exemplo de Formato Aceito:</span>
                  <br />
                  Carlos Silva	PREPARADOR TORNO AUTOMATICO	TURNO 1<br />
                  Marcos Oliveira	INSPETOR TCNC / OPERADOR	TURNO 1<br />
                  Robson Santos	PREPARADOR DE FERRAMENTAS	TURNO 2
                </>
              )}
              {importType === 'activities' && (
                <>
                  <span className="text-[#00E676] font-bold">Exemplo de Formato Aceito:</span>
                  <br />
                  PREPARADOR TORNO AUTOMATICO	SETUP DE MAQUINA	1	Setup<br />
                  PREPARADOR TORNO AUTOMATICO	AFIAR FERRAMENTAS	2	Setup<br />
                  INSPETOR TCNC / OPERADOR	MEDIR PEÇAS	1	Qualidade
                </>
              )}
              {importType === 'obs' && (
                <>
                  <span className="text-[#00E676] font-bold">Exemplo de Formato Aceito:</span>
                  <br />
                  Falta de Material / Barra<br />
                  Manutenção Mecânica do Torno<br />
                  Aguardando Inspeção da Qualidade
                </>
              )}
            </div>

            {/* Campo de Texto para Colar */}
            <textarea
              rows={8}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Cole aqui as linhas da sua planilha (Ctrl+V)..."
              className="w-full p-3 bg-[#111111] text-white border border-[#555555] rounded-lg text-xs font-mono focus:outline-none focus:border-[#00E676]"
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImportText('')}
                className="px-4 py-2 bg-[#222222] hover:bg-[#333333] text-[#AAAAAA] rounded text-xs"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={handleProcessBulkImport}
                className="px-5 py-2.5 bg-[#00E676] hover:bg-[#00c853] text-black font-black text-xs sm:text-sm rounded-lg flex items-center gap-2 cursor-pointer shadow-lg transition"
              >
                <Upload className="w-4 h-4" />
                <span>Processar e Importar Dados</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Confirmação In-App (substitui window.confirm que é bloqueado em iframes) */}
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

      {/* Modal de Exclusão Granular de Atividade com Múltiplos Vínculos */}
      {deleteMultiModal && deleteMultiModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#1C1C1C] border border-[#FF3D00]/50 rounded-xl p-5 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-start gap-3 shrink-0">
              <div className="p-2.5 bg-[#FF3D00]/20 border border-[#FF3D00]/40 text-[#FF3D00] rounded-lg shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Excluir Vínculos da Atividade</span>
                </h4>
                <p className="text-xs text-[#AAAAAA] mt-1">
                  A atividade <b className="text-white">"{deleteMultiModal.activityName}"</b> está vinculada a{' '}
                  <span className="text-[#FF8C00] font-bold">{deleteMultiModal.roles.length} cargos</span>.
                </p>
                <p className="text-xs text-[#888888] mt-0.5">
                  Marque abaixo os cargos de onde deseja remover esta atividade:
                </p>
              </div>
            </div>

            {/* Ações de Seleção Rápida */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#333333] shrink-0 text-xs flex-wrap">
              <span className="text-[#AAAAAA]">
                Selecionados para exclusão:{' '}
                <b className="text-white font-mono">
                  {deleteMultiModal.roles.filter((r) => r.checked).length} de {deleteMultiModal.roles.length}
                </b>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteMultiModal({
                      ...deleteMultiModal,
                      roles: deleteMultiModal.roles.map((r) => ({ ...r, checked: true })),
                    });
                  }}
                  className="px-2 py-1 bg-[#2A2A2A] hover:bg-[#333333] text-[#007BFF] hover:text-white rounded text-[11px] font-semibold transition cursor-pointer"
                >
                  Marcar Todos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteMultiModal({
                      ...deleteMultiModal,
                      roles: deleteMultiModal.roles.map((r) => ({
                        ...r,
                        checked: r.id === deleteMultiModal.clickedActId,
                      })),
                    });
                  }}
                  className="px-2 py-1 bg-[#2A2A2A] hover:bg-[#333333] text-[#FF8C00] hover:text-white rounded text-[11px] font-semibold transition cursor-pointer"
                >
                  Apenas este cargo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteMultiModal({
                      ...deleteMultiModal,
                      roles: deleteMultiModal.roles.map((r) => ({ ...r, checked: false })),
                    });
                  }}
                  className="px-2 py-1 bg-[#2A2A2A] hover:bg-[#333333] text-[#888888] hover:text-white rounded text-[11px] transition cursor-pointer"
                >
                  Desmarcar Todos
                </button>
              </div>
            </div>

            {/* Checklist dos Cargos Vinculados */}
            <div className="overflow-y-auto max-h-60 space-y-1.5 pr-1 border border-[#333333] rounded-lg p-2 bg-[#141414]">
              {deleteMultiModal.roles.map((item) => {
                const cor = getRoleColor(item.role);
                const isCurrent = item.id === deleteMultiModal.clickedActId;
                return (
                  <label
                    key={item.id}
                    className={`flex items-center justify-between p-2 rounded cursor-pointer transition select-none ${
                      item.checked
                        ? 'bg-[#2A1515] border border-[#FF3D00]/40'
                        : 'bg-[#1C1C1C] border border-transparent hover:bg-[#222222] opacity-75'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setDeleteMultiModal({
                            ...deleteMultiModal,
                            roles: deleteMultiModal.roles.map((r) =>
                              r.id === item.id ? { ...r, checked } : r
                            ),
                          });
                        }}
                        className="w-4 h-4 accent-[#FF3D00] rounded cursor-pointer shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: cor }}
                          />
                          <span className="truncate">{item.role}</span>
                          {isCurrent && (
                            <span className="text-[10px] px-1.5 py-0.2 bg-[#007BFF]/20 text-[#007BFF] border border-[#007BFF]/40 rounded font-normal">
                              Cargo clicado
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#888888] flex items-center gap-2 mt-0.5">
                          <span className="text-[#00E676] font-mono font-bold">P{item.priority}</span>
                          <span>• {item.category}</span>
                          {item.standardMinutes && <span>• ⏱️ {item.standardMinutes} min</span>}
                        </div>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Botões de Ação */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#333333] shrink-0">
              <button
                type="button"
                onClick={() => setDeleteMultiModal(null)}
                className="px-3.5 py-2 bg-[#2A2A2A] hover:bg-[#333333] text-[#CCCCCC] hover:text-white rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                Cancelar
              </button>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleConfirmMultiDelete([deleteMultiModal.clickedActId])}
                  className="px-3 py-2 bg-[#333333] hover:bg-[#444444] text-[#DDDDDD] hover:text-white rounded-lg text-xs font-medium transition cursor-pointer"
                  title={`Excluir apenas do cargo ${deleteMultiModal.clickedRole}`}
                >
                  Excluir Apenas de "{deleteMultiModal.clickedRole}"
                </button>

                <button
                  type="button"
                  disabled={deleteMultiModal.roles.filter((r) => r.checked).length === 0}
                  onClick={() => {
                    const idsToDelete = deleteMultiModal.roles
                      .filter((r) => r.checked)
                      .map((r) => r.id);
                    handleConfirmMultiDelete(idsToDelete);
                  }}
                  className="px-4 py-2 bg-[#FF3D00] hover:bg-[#D50000] disabled:bg-[#444444] disabled:text-[#888888] disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-lg active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    Excluir ({deleteMultiModal.roles.filter((r) => r.checked).length} Selecionados)
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
