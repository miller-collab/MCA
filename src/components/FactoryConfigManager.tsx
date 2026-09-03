import React, { useState } from 'react';
import { 
  Users, Briefcase, ListOrdered, MessageSquare, Clock, 
  Plus, Trash2, Edit2, Check, X, Upload, Download, RotateCcw, 
  Save, AlertCircle, Palette, Sparkles, Filter, Copy, FileSpreadsheet,
  CheckSquare, Square, Layers, Info, HelpCircle, TrendingUp
} from 'lucide-react';
import { Collaborator, ActivityItem, ShiftConfig, ActivityCategory } from '../types';
import { INITIAL_COLLABORATORS, INITIAL_ACTIVITIES, INITIAL_SHIFTS, INITIAL_OBSERVATIONS, INITIAL_ROLES, definirCorFuncao } from '../data/initialData';
import { padronizarNomeTurno } from '../utils/factoryCalculations';

interface FactoryConfigManagerProps {
  collaborators: Collaborator[];
  activities: ActivityItem[];
  shifts: ShiftConfig[];
  observations: string[];
  customRoleColors?: Record<string, string>;
  customRoles?: string[];
  deletedRoles?: string[];
  efficiencyThresholdGreen?: number;
  efficiencyThresholdYellow?: number;
  onUpdateCollaborators: (colabs: Collaborator[]) => void;
  onUpdateActivities: (activities: ActivityItem[]) => void;
  onUpdateShifts: (shifts: ShiftConfig[]) => void;
  onUpdateObservations: (obs: string[]) => void;
  onUpdateRoleColors?: (colors: Record<string, string>) => void;
  onUpdateRoles?: (roles: string[], deletedRoles?: string[]) => void;
  onUpdateEfficiencyThresholds?: (green: number, yellow: number) => void;
  onResetToDefaults: () => void;
}

type ConfigSubTab = 'colaboradores' | 'atividades' | 'cargos' | 'observacoes' | 'metas' | 'turnos' | 'importar';

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
  customRoles,
  deletedRoles = [],
  efficiencyThresholdGreen: propGreen = 85,
  efficiencyThresholdYellow: propYellow = 70,
  onUpdateCollaborators,
  onUpdateActivities,
  onUpdateShifts,
  onUpdateObservations,
  onUpdateRoleColors,
  onUpdateRoles,
  onUpdateEfficiencyThresholds,
  onResetToDefaults,
}) => {
  const [subTab, setSubTab] = useState<ConfigSubTab>('colaboradores');
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Efficiency thresholds state
  const [localGreen, setLocalGreen] = useState<number>(propGreen);
  const [localYellow, setLocalYellow] = useState<number>(propYellow);

  React.useEffect(() => {
    setLocalGreen(propGreen);
  }, [propGreen]);

  React.useEffect(() => {
    setLocalYellow(propYellow);
  }, [propYellow]);

  const handleSaveThresholds = () => {
    const validGreen = Math.max(1, Math.min(100, Number(localGreen) || 85));
    const validYellow = Math.max(0, Math.min(validGreen - 1, Number(localYellow) || 70));
    setLocalGreen(validGreen);
    setLocalYellow(validYellow);
    if (onUpdateEfficiencyThresholds) {
      onUpdateEfficiencyThresholds(validGreen, validYellow);
    }
    showNotification('Metas e percentuais de cores salvos com sucesso!');
  };

  const handleResetThresholds = () => {
    setLocalGreen(85);
    setLocalYellow(70);
    if (onUpdateEfficiencyThresholds) {
      onUpdateEfficiencyThresholds(85, 70);
    }
    showNotification('Metas restauradas para o padrão de fábrica (85% Verde / 70% Amarelo)!');
  };

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
  const [newActPriority, setNewActPriority] = useState<number | string>(1);
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

  // Role Customization & Editing State
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#007BFF');
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editRoleName, setEditRoleName] = useState('');
  const [editRoleColor, setEditRoleColor] = useState('#007BFF');

  // Bulk Import State
  const [importText, setImportText] = useState('');
  const [importType, setImportType] = useState<'colabs' | 'activities' | 'obs'>('colabs');

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  // Distinct roles extracted dynamically from customRoles, collaborators and activities
  const existingRoles = React.useMemo(() => {
    const rawList = [
      ...(customRoles && customRoles.length > 0 ? customRoles : INITIAL_ROLES),
      ...collaborators.map((c) => c.role.toUpperCase().trim()),
      ...activities.map((a) => a.role.toUpperCase().trim()),
    ];
    const delSet = new Set((deletedRoles || []).map((r) => r.toUpperCase().trim()));
    const unique = Array.from(new Set(rawList.map((r) => r.toUpperCase().trim()))).filter(
      (r) => r && !delSet.has(r)
    );
    return unique;
  }, [customRoles, deletedRoles, collaborators, activities]);

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
  // 2. ACTIVITIES HANDLERS (P1, P2, P3.12, etc.)
  // -------------------------------------------------------------
  const handleAddActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActName.trim()) return;

    const trimmedName = newActName.trim().toUpperCase();
    const rawPriorityStr = typeof newActPriority === 'string' ? newActPriority.replace(',', '.') : String(newActPriority);
    const parsedPriority = isNaN(parseFloat(rawPriorityStr)) ? 1 : parseFloat(rawPriorityStr);
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
      activities.map((a) => {
        if (a.id === id) {
          const rawPriorityStr = editActForm.priority !== undefined 
            ? (typeof editActForm.priority === 'string' ? String(editActForm.priority).replace(',', '.') : String(editActForm.priority))
            : String(a.priority);
          const parsedPriority = isNaN(parseFloat(rawPriorityStr)) ? a.priority : parseFloat(rawPriorityStr);

          return {
            ...a,
            name: editActForm.name?.trim().toUpperCase() || a.name,
            role: editActForm.role?.trim().toUpperCase() || a.role,
            priority: parsedPriority,
            category: editActForm.category || a.category,
            standardMinutes: Number(editActForm.standardMinutes) || a.standardMinutes || 30,
          };
        }
        return a;
      })
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
  // 3. ROLE (CARGOS) HANDLERS - CRIAR, EDITAR (RENOMEAR / COR) E EXCLUIR
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

    if (existingRoles.some((r) => r.toUpperCase().trim() === rUpper)) {
      showNotification(`O cargo "${rUpper}" já está cadastrado na fábrica!`, 'error');
      return;
    }

    const newDeleted = (deletedRoles || []).filter((r) => r.toUpperCase().trim() !== rUpper);
    const currentRoles = customRoles && customRoles.length > 0 ? customRoles : existingRoles;
    const newRolesList = Array.from(new Set([...currentRoles, rUpper]));

    if (onUpdateRoles) {
      onUpdateRoles(newRolesList, newDeleted);
    }
    if (onUpdateRoleColors) {
      onUpdateRoleColors({ ...customRoleColors, [rUpper]: newRoleColor });
    }

    setNewRoleName('');
    showNotification(`Novo cargo "${rUpper}" registrado e salvo com sucesso!`);
  };

  const handleStartEditRole = (role: string) => {
    setEditingRole(role);
    setEditRoleName(role);
    setEditRoleColor(getRoleColor(role));
  };

  const handleSaveEditedRole = (originalRole: string) => {
    const trimmedNewName = editRoleName.trim().toUpperCase();
    if (!trimmedNewName) {
      showNotification('O nome do cargo não pode ficar em branco.', 'error');
      return;
    }

    const origUpper = originalRole.toUpperCase().trim();
    const isRenaming = trimmedNewName !== origUpper;

    if (isRenaming && existingRoles.some((r) => r.toUpperCase().trim() === trimmedNewName)) {
      showNotification(`Já existe um cargo cadastrado com o nome "${trimmedNewName}".`, 'error');
      return;
    }

    // 1. Atualizar paleta de cores
    const updatedColors = { ...customRoleColors };
    if (isRenaming) {
      delete updatedColors[origUpper];
    }
    updatedColors[trimmedNewName] = editRoleColor;
    if (onUpdateRoleColors) {
      onUpdateRoleColors(updatedColors);
    }

    // 2. Atualizar lista de cargos
    const currentRolesList = customRoles && customRoles.length > 0 ? customRoles : existingRoles;
    const updatedRolesList = currentRolesList.map((r) =>
      r.toUpperCase().trim() === origUpper ? trimmedNewName : r
    );
    if (!updatedRolesList.includes(trimmedNewName)) {
      updatedRolesList.push(trimmedNewName);
    }
    if (onUpdateRoles) {
      onUpdateRoles(updatedRolesList, deletedRoles);
    }

    // 3. Se renomeou, atualizar todos os colaboradores vinculados a este cargo
    if (isRenaming) {
      const updatedColabs = collaborators.map((c) =>
        c.role.toUpperCase().trim() === origUpper
          ? { ...c, role: trimmedNewName }
          : c
      );
      onUpdateCollaborators(updatedColabs);

      // 4. Se renomeou, atualizar todas as atividades vinculadas a este cargo
      const updatedActs = activities.map((a) =>
        a.role.toUpperCase().trim() === origUpper
          ? { ...a, role: trimmedNewName }
          : a
      );
      onUpdateActivities(updatedActs);

      showNotification(`Cargo renomeado de "${originalRole}" para "${trimmedNewName}" com sucesso!`);
    } else {
      showNotification(`Cor do cargo "${trimmedNewName}" atualizada com sucesso!`);
    }

    setEditingRole(null);
  };

  const handleDeleteRole = (role: string) => {
    const roleUpper = role.toUpperCase().trim();
    const colabsWithRole = collaborators.filter((c) => c.role.toUpperCase().trim() === roleUpper);
    const actsWithRole = activities.filter((a) => a.role.toUpperCase().trim() === roleUpper);

    let desc = `Deseja realmente excluir o cargo "${roleUpper}" da fábrica?`;
    if (colabsWithRole.length > 0 && actsWithRole.length > 0) {
      desc = `Deseja realmente excluir o cargo "${roleUpper}"? Há ${colabsWithRole.length} colaborador(es) e ${actsWithRole.length} atividade(s) vinculadas. Ao excluir, o cargo e as atividades serão removidos e os colaboradores receberão outro cargo.`;
    } else if (colabsWithRole.length > 0) {
      desc = `Deseja realmente excluir o cargo "${roleUpper}"? Há ${colabsWithRole.length} colaborador(es) vinculados. Ao confirmar, o cargo será excluído e os colaboradores serão reatribuídos.`;
    } else if (actsWithRole.length > 0) {
      desc = `Deseja realmente excluir o cargo "${roleUpper}"? Há ${actsWithRole.length} atividade(s) cadastradas que também serão removidas da matriz.`;
    }

    setConfirmModal({
      isOpen: true,
      title: `Excluir Cargo "${roleUpper}"`,
      description: desc,
      confirmText: 'Sim, Excluir Cargo',
      onConfirm: () => {
        // 1. Adiciona a deletedRoles e remove de customRoles
        const currentRoles = customRoles && customRoles.length > 0 ? customRoles : existingRoles;
        const newRoles = currentRoles.filter((r) => r.toUpperCase().trim() !== roleUpper);
        const newDeletedRoles = Array.from(new Set([...(deletedRoles || []), roleUpper]));

        if (onUpdateRoles) {
          onUpdateRoles(newRoles, newDeletedRoles);
        }

        // 2. Remove cor do customRoleColors
        if (onUpdateRoleColors && customRoleColors) {
          const newColors = { ...customRoleColors };
          delete newColors[roleUpper];
          onUpdateRoleColors(newColors);
        }

        // 3. Remove atividades vinculadas exclusivamente a este cargo
        if (actsWithRole.length > 0) {
          const filteredActs = activities.filter((a) => a.role.toUpperCase().trim() !== roleUpper);
          onUpdateActivities(filteredActs);
        }

        // 4. Se houver colaboradores com este cargo, reatribui para o primeiro cargo ativo
        if (colabsWithRole.length > 0) {
          const fallbackRole = newRoles[0] || 'SERVIÇOS GERAIS TORNO AUTOMATICO';
          const updatedColabs = collaborators.map((c) =>
            c.role.toUpperCase().trim() === roleUpper ? { ...c, role: fallbackRole } : c
          );
          onUpdateCollaborators(updatedColabs);
        }

        if (editingRole === role) {
          setEditingRole(null);
        }

        showNotification(`Cargo "${roleUpper}" foi excluído com sucesso.`);
        setConfirmModal(null);
      },
    });
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
          const rawP = parts[2] ? parts[2].replace(',', '.') : '';
          const priority = !isNaN(parseFloat(rawP)) ? parseFloat(rawP) : (idx + 1);
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
      return Number(a.priority) - Number(b.priority);
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
            onClick={() => setSubTab('metas')}
            className={`px-3 py-2 rounded-md text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              subTab === 'metas'
                ? 'bg-[#007BFF] text-white shadow'
                : 'text-[#AAAAAA] hover:text-white hover:bg-[#222222]'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-[#00E676]" />
            <span>🎯 Metas & Cores de Eficiência</span>
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
            {/* Quick Status / Force Sync Bar */}
            <div className="p-3 bg-[#111111] border border-[#333333] rounded-lg flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#00E676] animate-pulse"></span>
                <span className="text-xs font-bold text-white">
                  {collaborators.length} Colaboradores Ativos no Sistema
                </span>
                <span className="text-[11px] text-[#888888]">
                  (Sincronização Nuvem Firestore Ativa)
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onResetToDefaults();
                  showNotification('Colaboradores e turnos sincronizados com a matriz oficial!');
                }}
                className="px-2.5 py-1 bg-[#222222] hover:bg-[#333333] text-[#00E676] border border-[#00E676]/30 hover:border-[#00E676] rounded text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                title="Sincronizar a lista com os 14 colaboradores oficiais da matriz"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restaurar 14 Colaboradores Oficiais</span>
              </button>
            </div>

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
            {/* Form de Cadastro / Edição Direta de Atividade (Foto 4) */}
            <div className={`p-4 rounded-lg border transition-all space-y-3 ${
              editingActId 
                ? 'bg-[#1C1A2E] border-[#007BFF] shadow-lg ring-1 ring-[#007BFF]/50' 
                : 'bg-[#1E1E1E] border-[#333333]'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#333333] pb-2.5">
                <div className="flex items-center gap-2">
                  <span className={`p-1.5 rounded-lg ${editingActId ? 'bg-[#007BFF] text-white' : 'bg-[#007BFF]/20 text-[#007BFF]'}`}>
                    {editingActId ? <Edit2 className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      {editingActId ? (
                        <>
                          <span className="text-[#00E676]">MODO EDIÇÃO DE ATIVIDADE:</span>
                          <span>{editActForm.name || 'Atividade Selecionada'}</span>
                          <span className="px-1.5 py-0.2 bg-[#007BFF]/30 text-[#007BFF] rounded text-[10px]">
                            P{editActForm.priority}
                          </span>
                        </>
                      ) : (
                        'Cadastrar Atividade na Matriz'
                      )}
                    </h3>
                    <p className="text-[11px] text-[#888888]">
                      {editingActId
                        ? 'Altere os parâmetros desta atividade abaixo ou clique em Excluir para removê-la da matriz.'
                        : 'Vincule rotinas operacionais a um cargo específico, a múltiplos cargos ou a TODOS de uma vez.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Seletor rápido de atividade para editar */}
                  {!editingActId && activities.length > 0 && (
                    <div className="flex items-center gap-1">
                      <select
                        aria-label="Selecionar atividade existente para editar ou excluir"
                        onChange={(e) => {
                          const act = activities.find((a) => a.id === e.target.value);
                          if (act) handleStartEditAct(act);
                          e.target.value = '';
                        }}
                        defaultValue=""
                        className="py-1 px-2 bg-[#161616] hover:bg-[#222222] text-[#007BFF] border border-[#007BFF]/40 rounded text-xs font-bold cursor-pointer focus:outline-none"
                      >
                        <option value="" disabled>
                          ✏️ Selecionar Atividade para Editar/Excluir...
                        </option>
                        {activities.map((a) => (
                          <option key={a.id} value={a.id}>
                            [{a.role}] P{a.priority} - {a.name} ({a.standardMinutes || 30}m)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {!editingActId && (
                    <>
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
                    </>
                  )}

                  {editingActId && (
                    <button
                      type="button"
                      onClick={() => setEditingActId(null)}
                      className="px-3 py-1 bg-[#333333] hover:bg-[#444444] text-white rounded text-xs font-bold flex items-center gap-1 cursor-pointer transition"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Cancelar Edição</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Multi-role selection panel when MULTI is chosen */}
              {!editingActId && newActRole === 'MULTI' && (
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

              {/* FORMULÁRIO DE CADASTRO OU EDIÇÃO */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editingActId) {
                    handleSaveEditAct(editingActId);
                  } else {
                    handleAddActivity(e);
                  }
                }}
                className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end"
              >
                <div className="sm:col-span-1">
                  <label className="block text-xs font-bold text-[#CCCCCC] mb-1">Cargo Vinculado:</label>
                  {editingActId ? (
                    <select
                      value={editActForm.role || ''}
                      onChange={(e) => setEditActForm({ ...editActForm, role: e.target.value })}
                      className="w-full p-2 bg-[#111111] text-white border border-[#007BFF] rounded text-xs font-bold focus:outline-none"
                    >
                      {existingRoles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
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
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[#CCCCCC] mb-1">Nome da Atividade:</label>
                  <input
                    type="text"
                    placeholder="Ex: SETUP DE MÁQUINA"
                    value={editingActId ? editActForm.name || '' : newActName}
                    onChange={(e) => {
                      if (editingActId) {
                        setEditActForm({ ...editActForm, name: e.target.value });
                      } else {
                        setNewActName(e.target.value);
                      }
                    }}
                    className={`w-full p-2 bg-[#111111] text-white rounded text-xs focus:outline-none ${
                      editingActId ? 'border border-[#007BFF] font-bold' : 'border border-[#555555] focus:border-[#007BFF]'
                    }`}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#CCCCCC] mb-1">Prioridade (P1, P2, P3.12...):</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="999"
                    placeholder="Ex: 3.12"
                    value={editingActId ? (editActForm.priority !== undefined ? editActForm.priority : '') : newActPriority}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (editingActId) {
                        setEditActForm({
                          ...editActForm,
                          priority: val === '' ? 0 : parseFloat(val) || 0,
                        });
                      } else {
                        setNewActPriority(val);
                      }
                    }}
                    className={`w-full p-2 bg-[#111111] text-white rounded text-xs font-mono focus:outline-none ${
                      editingActId ? 'border border-[#007BFF] text-[#00E676] font-bold' : 'border border-[#555555] focus:border-[#007BFF]'
                    }`}
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
                      value={editingActId ? editActForm.standardMinutes || 30 : newActMinutes}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 30;
                        if (editingActId) {
                          setEditActForm({ ...editActForm, standardMinutes: val });
                        } else {
                          setNewActMinutes(val);
                        }
                      }}
                      className={`w-full p-2 bg-[#111111] text-white rounded text-xs font-mono pl-7 focus:outline-none ${
                        editingActId ? 'border border-[#007BFF] text-[#00E676] font-bold' : 'border border-[#555555] focus:border-[#007BFF]'
                      }`}
                      required
                    />
                    <Clock className="w-3.5 h-3.5 text-[#00E676] absolute left-2 top-2.5 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#CCCCCC] mb-1">Categoria:</label>
                  <select
                    value={editingActId ? editActForm.category || 'Operação' : newActCategory}
                    onChange={(e) => {
                      const val = e.target.value as ActivityCategory;
                      if (editingActId) {
                        setEditActForm({ ...editActForm, category: val });
                      } else {
                        setNewActCategory(val);
                      }
                    }}
                    className={`w-full p-2 bg-[#111111] text-white rounded text-xs focus:outline-none ${
                      editingActId ? 'border border-[#007BFF]' : 'border border-[#555555] focus:border-[#007BFF]'
                    }`}
                  >
                    {CATEGORIAS.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-6 flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-[#333333]">
                  {editingActId ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const curAct = activities.find((a) => a.id === editingActId);
                          if (curAct) handleDeleteActivity(curAct);
                        }}
                        className="py-2.5 px-4 bg-[#FF3D00]/20 hover:bg-[#FF3D00] text-[#FF5252] hover:text-white border border-[#FF3D00]/50 font-bold rounded text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Excluir Atividade da Matriz</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingActId(null)}
                          className="py-2.5 px-4 bg-[#2A2A2A] hover:bg-[#333333] text-[#AAAAAA] hover:text-white font-bold rounded text-xs transition cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="py-2.5 px-6 bg-[#00E676] hover:bg-[#00c853] text-black font-extrabold rounded text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md"
                        >
                          <Save className="w-4 h-4" />
                          <span>Salvar Alterações na Atividade</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="w-full flex justify-end">
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
                  )}
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
                                step="0.01"
                                min="0.01"
                                max="999"
                                value={editActForm.priority !== undefined ? editActForm.priority : ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setEditActForm({
                                    ...editActForm,
                                    priority: val === '' ? 0 : parseFloat(val) || 0,
                                  });
                                }}
                                className="w-16 p-1 bg-[#111111] text-white text-center font-mono rounded border border-[#555555] focus:border-[#007BFF] focus:outline-none"
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
          <div className="space-y-5">
            {/* Header explicativo com contadores */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111111] p-3.5 rounded-xl border border-[#333333]">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Palette className="w-4 h-4 text-[#007BFF]" />
                  <span>Gestão de Cargos e Identidade Visual</span>
                </h3>
                <p className="text-xs text-[#888888]">
                  Crie, renomeie, personalize cores ou exclua cargos. As alterações refletem automaticamente em todos os operadores e atividades.
                </p>
              </div>
              <div className="text-xs font-mono font-bold text-[#00E676] bg-[#00E676]/10 px-3 py-1.5 rounded-lg border border-[#00E676]/30">
                {existingRoles.length} Cargos Ativos
              </div>
            </div>

            {/* Form para Adicionar Novo Cargo */}
            <form
              onSubmit={handleAddNewRole}
              className="p-4 bg-[#1E1E1E] rounded-xl border border-[#333333] grid grid-cols-1 sm:grid-cols-3 gap-3 items-end shadow-md"
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
                  className="w-full p-2.5 bg-[#111111] text-white border border-[#555555] rounded-lg text-xs focus:outline-none focus:border-[#007BFF]"
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
                    className="w-10 h-9 p-0.5 bg-[#111111] border border-[#555555] rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={newRoleColor}
                    onChange={(e) => setNewRoleColor(e.target.value)}
                    className="flex-1 p-2 bg-[#111111] text-white border border-[#555555] rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="py-2.5 px-4 bg-[#0066CC] hover:bg-[#005bb5] text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>Salvar Cargo & Cor</span>
              </button>
            </form>

            {/* Grid dos Cargos Atuais com Edição, Exclusão e Seletor de Cores */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {existingRoles.map((role) => {
                const isEditing = editingRole === role;
                const corAtual = getRoleColor(role);
                const colabsCount = collaborators.filter(
                  (c) => c.role.toUpperCase().trim() === role.toUpperCase().trim()
                ).length;
                const actsCount = activities.filter(
                  (a) => a.role.toUpperCase().trim() === role.toUpperCase().trim()
                ).length;

                if (isEditing) {
                  return (
                    <div
                      key={role}
                      className="p-4 bg-[#141A28] border-2 border-[#007BFF] rounded-xl space-y-3 shadow-xl animate-in fade-in"
                    >
                      <div className="flex items-center justify-between border-b border-[#007BFF]/30 pb-2">
                        <span className="text-xs font-black text-[#007BFF] uppercase tracking-wider flex items-center gap-1.5">
                          <Edit2 className="w-3.5 h-3.5" />
                          Editando Cargo
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditingRole(null)}
                          className="text-[#888888] hover:text-white text-xs cursor-pointer p-1"
                          title="Cancelar edição"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#CCCCCC] mb-1">
                          Nome do Cargo / Setor:
                        </label>
                        <input
                          type="text"
                          value={editRoleName}
                          onChange={(e) => setEditRoleName(e.target.value)}
                          className="w-full p-2 bg-[#111111] text-white border border-[#007BFF] rounded text-xs font-bold focus:outline-none"
                          placeholder="Ex: OPERADOR DE TORNO CNC"
                          autoFocus
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#CCCCCC] mb-1">
                          Cor de Destaque:
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={editRoleColor}
                            onChange={(e) => setEditRoleColor(e.target.value)}
                            className="w-9 h-8 p-0.5 bg-[#111111] border border-[#555555] rounded cursor-pointer shrink-0"
                          />
                          <input
                            type="text"
                            value={editRoleColor}
                            onChange={(e) => setEditRoleColor(e.target.value)}
                            className="flex-1 p-1.5 bg-[#111111] text-white border border-[#555555] rounded text-xs font-mono"
                          />
                          <div className="flex items-center gap-1">
                            {PRESET_CORES.slice(0, 4).map((preset) => (
                              <button
                                key={preset.hex}
                                type="button"
                                onClick={() => setEditRoleColor(preset.hex)}
                                className="w-5 h-5 rounded-full border border-black/50 hover:scale-125 transition cursor-pointer"
                                style={{ backgroundColor: preset.hex }}
                                title={preset.nome}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="text-[10px] text-[#00E676] bg-[#00E676]/10 p-2 rounded border border-[#00E676]/20 leading-tight">
                        💡 Ao renomear, os {colabsCount} operadores e {actsCount} atividades vinculadas serão automaticamente atualizados.
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingRole(null)}
                          className="py-1.5 px-3 bg-[#2A2A2A] hover:bg-[#333333] text-[#AAAAAA] hover:text-white rounded text-xs font-bold transition cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEditedRole(role)}
                          className="py-1.5 px-4 bg-[#00E676] hover:bg-[#00c853] text-black rounded text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-md"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Salvar Cargo</span>
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={role}
                    className="p-3.5 bg-[#111111] border border-[#333333] hover:border-[#555555] rounded-xl space-y-3 shadow-md transition group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-[#555555] shrink-0 mt-0.5"
                          style={{ backgroundColor: corAtual }}
                          title={`Cor: ${corAtual}`}
                        />
                        <div className="font-bold text-xs sm:text-sm text-white truncate" title={role}>
                          {role}
                        </div>
                      </div>

                      {/* Botões de Ação: Editar e Excluir */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEditRole(role)}
                          className="p-1.5 bg-[#1E1E1E] hover:bg-[#007BFF] text-[#AAAAAA] hover:text-white border border-[#333333] hover:border-[#007BFF] rounded-md transition cursor-pointer"
                          title={`Editar ou Renomear "${role}"`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRole(role)}
                          className="p-1.5 bg-[#1E1E1E] hover:bg-[#FF3D00] text-[#888888] hover:text-white border border-[#333333] hover:border-[#FF3D00] rounded-md transition cursor-pointer"
                          title={`Excluir cargo "${role}"`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="text-[11px] text-[#888888] flex items-center gap-3 bg-[#181818] p-2 rounded-lg">
                      <span className="flex items-center gap-1">
                        👥 <strong className="text-white font-mono">{colabsCount}</strong> operadores
                      </span>
                      <span className="flex items-center gap-1">
                        📋 <strong className="text-[#00E676] font-mono">{actsCount}</strong> atividades Pn
                      </span>
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
        {/* 5. ABA METAS & CORES DE EFICIÊNCIA                         */}
        {/* ========================================================= */}
        {subTab === 'metas' && (
          <div className="p-4 bg-[#1E1E1E] rounded-lg border border-[#333333] space-y-6 animate-in fade-in duration-200">
            <div>
              <h4 className="text-sm font-bold text-[#00E676] flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Configuração Manual de Metas e Percentuais de Cores (Eficiência)
              </h4>
              <p className="text-xs text-[#888888] mt-1">
                Ajuste os valores percentuais mínimos para definir a coloração dos gráficos de colunas, cartões operacionais e indicadores da liderança.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card Meta Verde */}
              <div className="p-4 bg-[#111111] border border-[#00E676]/40 rounded-xl space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full bg-[#00E676]"></span>
                    <span className="font-bold text-white text-sm">Meta Verde (Excelente)</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 bg-[#00E676]/20 text-[#00E676] font-mono font-bold rounded">
                    ≥ {localGreen}%
                  </span>
                </div>

                <p className="text-xs text-[#AAAAAA]">
                  Operadores ou turnos com eficiência igual ou superior a este percentual serão exibidos em verde neon.
                </p>

                <div className="pt-2 border-t border-[#222222]">
                  <label className="block text-xs font-bold text-[#CCCCCC] mb-1">
                    Percentual Mínimo (%):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={localYellow + 1}
                      max={100}
                      value={localGreen}
                      onChange={(e) => setLocalGreen(Math.max(localYellow + 1, Math.min(100, parseInt(e.target.value, 10) || 0)))}
                      className="w-full p-2 bg-[#181818] text-white border border-[#00E676]/50 rounded text-center text-sm font-mono font-bold focus:outline-none focus:border-[#00E676]"
                    />
                    <span className="text-sm font-bold text-white">%</span>
                  </div>
                </div>
              </div>

              {/* Card Meta Amarela */}
              <div className="p-4 bg-[#111111] border border-[#FFD700]/40 rounded-xl space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full bg-[#FFD700]"></span>
                    <span className="font-bold text-white text-sm">Meta Amarela (Atenção)</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 bg-[#FFD700]/20 text-[#FFD700] font-mono font-bold rounded">
                    {localYellow}% a {localGreen - 1}%
                  </span>
                </div>

                <p className="text-xs text-[#AAAAAA]">
                  Operadores ou turnos nesta faixa de rendimento serão exibidos em amarelo ouro, indicando atenção intermediária.
                </p>

                <div className="pt-2 border-t border-[#222222]">
                  <label className="block text-xs font-bold text-[#CCCCCC] mb-1">
                    Percentual Mínimo (%):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={localGreen - 1}
                      value={localYellow}
                      onChange={(e) => setLocalYellow(Math.max(1, Math.min(localGreen - 1, parseInt(e.target.value, 10) || 0)))}
                      className="w-full p-2 bg-[#181818] text-white border border-[#FFD700]/50 rounded text-center text-sm font-mono font-bold focus:outline-none focus:border-[#FFD700]"
                    />
                    <span className="text-sm font-bold text-white">%</span>
                  </div>
                </div>
              </div>

              {/* Card Meta Vermelha */}
              <div className="p-4 bg-[#111111] border border-[#E91E63]/40 rounded-xl space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full bg-[#E91E63]"></span>
                    <span className="font-bold text-white text-sm">Meta Vermelha (Crítica)</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 bg-[#E91E63]/20 text-[#E91E63] font-mono font-bold rounded">
                    &lt; {localYellow}%
                  </span>
                </div>

                <p className="text-xs text-[#AAAAAA]">
                  Qualquer rendimento abaixo do limite amarelo é automaticamente enquadrado como crítico em vermelho / rosa forte.
                </p>

                <div className="pt-2 border-t border-[#222222]">
                  <label className="block text-xs font-bold text-[#888888] mb-1">
                    Cálculo Automático:
                  </label>
                  <div className="p-2 bg-[#181818] text-[#888888] rounded text-center text-xs font-mono font-bold border border-[#333333]">
                    Menor que {localYellow}%
                  </div>
                </div>
              </div>
            </div>

            {/* Barra de Amostra Visual / Preview */}
            <div className="p-4 bg-[#111111] rounded-xl border border-[#333333] space-y-2">
              <span className="text-xs font-bold text-[#AAAAAA] uppercase tracking-wider">
                Pré-visualização da Régua de Eficiência:
              </span>
              <div className="h-6 w-full rounded-lg overflow-hidden flex font-mono text-[11px] font-bold text-black text-center leading-6">
                <div
                  style={{ width: `${localYellow}%` }}
                  className="bg-[#E91E63] text-white flex items-center justify-center truncate px-1"
                >
                  Crítico (&lt;{localYellow}%)
                </div>
                <div
                  style={{ width: `${localGreen - localYellow}%` }}
                  className="bg-[#FFD700] text-black flex items-center justify-center truncate px-1"
                >
                  Atenção ({localYellow}%-{localGreen - 1}%)
                </div>
                <div
                  style={{ width: `${100 - localGreen}%` }}
                  className="bg-[#00E676] text-black flex items-center justify-center truncate px-1"
                >
                  Excelente (≥{localGreen}%)
                </div>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#333333]">
              <button
                type="button"
                onClick={handleResetThresholds}
                className="py-2.5 px-4 bg-[#222222] hover:bg-[#333333] text-[#AAAAAA] hover:text-white rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Restaurar Padrão de Fábrica (85% e 70%)</span>
              </button>

              <button
                type="button"
                onClick={handleSaveThresholds}
                className="py-2.5 px-6 bg-[#00E676] hover:bg-[#00C853] text-black font-black rounded-lg text-xs transition flex items-center gap-2 shadow-lg cursor-pointer active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>Salvar Metas de Eficiência</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* 6. ABA COLAR DA PLANILHA (EM MASSA)                        */}
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
