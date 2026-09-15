import { Collaborator, ActivityItem, ShiftConfig, ProductionLog } from '../types';

const COLLABORATOR_STORAGE_KEYS = [
  'mca_collaborators_permanent_backup',
  'mca_collaborators_backup',
  'mca_collaborators_v3',
  'mca_collaborators_v2',
  'mca_collaborators_v1',
  'mca_collaborators',
  'mca_operadores',
  'mca_operators',
  'mca_colabs',
  'mca_users',
  'colaboradores',
  'operadores',
  'production_collaborators',
  'mca_factory_collaborators',
];

/**
 * Scans historical localStorage keys to find previously configured collaborators.
 * Filters out obsolete dummy datasets (like 'Valter Ribeiro (Líder)').
 */
export function findSavedCollaboratorsInBrowser(): {
  found: boolean;
  sourceKey: string | null;
  collaborators: Collaborator[];
} {
  for (const key of COLLABORATOR_STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Check if it's the obsolete mock list
          const hasLegacyDummy = parsed.some(
            (item: any) =>
              item?.name === 'Valter Ribeiro (Líder)' ||
              item?.name === 'Carlos Silva' ||
              item?.name === 'Marcos Oliveira' ||
              item?.name === 'Lucas Mendes'
          );

          if (hasLegacyDummy) {
            // Clear obsolete key so it doesn't pollute
            try {
              localStorage.removeItem(key);
            } catch {
              // Ignore
            }
            continue;
          }

          // Check if it has collaborator structure
          const valid = parsed.every((item: any) => item && (item.name || item.nome));
          if (valid) {
            const formatted: Collaborator[] = parsed.map((c: any, index: number) => ({
              id: c.id || `col-recovered-${index}`,
              name: c.name || c.nome || `Colaborador ${index + 1}`,
              role: (c.role || c.cargo || c.funcao || 'OPERADOR').toUpperCase(),
              shift: c.shift || c.turno || 'Turno 1',
              active: c.active !== false,
              avatarColor: c.avatarColor,
              mealStart: c.mealStart || c.almocoInicio || c.saidaAlmoco,
              mealEnd: c.mealEnd || c.almocoFim || c.retornoAlmoco,
              mealDurationMinutes: c.mealDurationMinutes,
            }));
            return {
              found: true,
              sourceKey: key,
              collaborators: formatted,
            };
          }
        }
      }
    } catch {
      // Continue searching
    }
  }

  return {
    found: false,
    sourceKey: null,
    collaborators: [],
  };
}

/**
 * Saves a permanent, multi-keyed backup in localStorage so it can never be lost
 */
export function savePermanentLocalBackup(
  collaborators: Collaborator[],
  activities?: ActivityItem[],
  shifts?: ShiftConfig[],
  logs?: ProductionLog[]
) {
  try {
    if (collaborators && collaborators.length > 0) {
      localStorage.setItem('mca_collaborators_v3', JSON.stringify(collaborators));
      localStorage.setItem('mca_collaborators_permanent_backup', JSON.stringify(collaborators));
      localStorage.setItem('mca_collaborators_backup', JSON.stringify(collaborators));
    }
    if (activities && activities.length > 0) {
      localStorage.setItem('mca_activities_v3', JSON.stringify(activities));
      localStorage.setItem('mca_activities_permanent_backup', JSON.stringify(activities));
    }
    if (shifts && shifts.length > 0) {
      localStorage.setItem('mca_shifts_v3', JSON.stringify(shifts));
      localStorage.setItem('mca_shifts_permanent_backup', JSON.stringify(shifts));
    }
    if (logs !== undefined) {
      const cleanLogs = logs.filter((l) => l && l.id);
      localStorage.setItem('mca_logs_v3', JSON.stringify(cleanLogs));
      localStorage.setItem('mca_logs_backup_permanent', JSON.stringify(cleanLogs));
    }

    // Full bundle backup
    const cleanLogs = (logs || []).filter((l) => l && l.id);
    const fullBackup = {
      version: '3.0',
      timestamp: new Date().toISOString(),
      collaborators,
      activities,
      shifts,
      logsCount: cleanLogs.length,
    };
    localStorage.setItem('mca_full_factory_backup', JSON.stringify(fullBackup));
  } catch (e) {
    console.warn('LocalStorage permanent backup error:', e);
  }
}

/**
 * Downloads a complete factory backup JSON file
 */
export function downloadCompleteFactoryBackup(
  collaborators: Collaborator[],
  activities: ActivityItem[],
  shifts: ShiftConfig[],
  logs: ProductionLog[],
  factoryConfig?: any,
  autocloseNotifs?: any[]
) {
  const payload = {
    app: 'MCA - Controle de Atividades e MES Industrial',
    backupDate: new Date().toISOString(),
    collaborators,
    activities,
    shifts,
    factoryConfig: factoryConfig || {
      toleranceMinutes: 60,
      efficiencyThresholdGreen: 85,
      efficiencyThresholdYellow: 70,
    },
    logs,
    autocloseNotifs: autocloseNotifs || [],
  };

  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  const dateStr = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  downloadAnchor.setAttribute('download', `mca_backup_completo_${dateStr}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
