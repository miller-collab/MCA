/**
 * CAMADA DE DADOS DO APP (VERSÃO FIRESTORE ÚNICO)
 * Todas as funções abaixo mantêm os mesmos nomes de antes, mas agora tudo passa
 * pelo centralSync.ts, que grava e escuta SOMENTE o Firestore.
 * Sem fila offline própria: o Firestore já guarda as gravações feitas sem internet
 * (cache persistente em firebaseClient.ts) e envia quando a rede volta.
 */
import { centralSync } from './centralSync';
import {
  Collaborator,
  ActivityItem,
  ShiftConfig,
  ProductionLog,
  AutoCloseNotification,
} from '../types';

export interface FactoryConfigState {
  toleranceMinutes: number;
  observations: string[];
  customRoleColors: Record<string, string>;
  customRoles?: string[];
  deletedRoles?: string[];
  efficiencyThresholdGreen?: number;
  efficiencyThresholdYellow?: number;
}

const LOCAL_MASTER_KEY = 'mca_local_master_snapshot_v2';

// Mantida só para não quebrar o Header.tsx (não existe mais fila própria).
export async function flushOfflineQueue(): Promise<void> {
  return;
}

// ---------------- LEITURA EM TEMPO REAL ----------------
export function subscribeToLogs(
  onUpdate: (logs: ProductionLog[]) => void,
  _onError?: (err: Error) => void
) {
  return centralSync.onLogs(onUpdate);
}

export function subscribeToMasterJsonSnapshot(onUpdate: (snapshot: any) => void) {
  return centralSync.onMaster((state) => {
    try { localStorage.setItem(LOCAL_MASTER_KEY, JSON.stringify(state)); } catch {}
    onUpdate({ ...state, factoryConfig: state.factoryConfig });
  });
}

export function subscribeToCollaborators(
  onUpdate: (colabs: Collaborator[]) => void,
  _onError?: (err: Error) => void
) {
  return centralSync.onCollaborators(onUpdate);
}

export function subscribeToActivities(
  onUpdate: (acts: ActivityItem[]) => void,
  _onError?: (err: Error) => void
) {
  return centralSync.onActivities(onUpdate);
}

export function subscribeToShifts(
  onUpdate: (shifts: ShiftConfig[]) => void,
  _onError?: (err: Error) => void
) {
  return centralSync.onShifts(onUpdate);
}

export function subscribeToFactoryConfig(
  onUpdate: (config: any) => void,
  _onError?: (err: Error) => void
) {
  return centralSync.onConfig(onUpdate);
}

export const subscribeToAutoCloseNotifs = (_fn?: any) => () => {};

// ---------------- GRAVAÇÃO ----------------
export async function saveLogToDatabase(log: ProductionLog): Promise<void> {
  await centralSync.saveLog(log);
}

export async function deleteLogFromDatabase(id: string): Promise<void> {
  await centralSync.deleteLog(id);
}

export async function saveCollaboratorsToDatabase(collaborators: Collaborator[]): Promise<void> {
  await centralSync.saveCollaborators(collaborators);
}

export async function saveActivitiesToDatabase(activities: ActivityItem[]): Promise<void> {
  await centralSync.saveActivities(activities);
}

export async function saveShiftsToDatabase(shifts: ShiftConfig[]): Promise<void> {
  await centralSync.saveShifts(shifts);
}

export async function saveFactoryConfigToDatabase(config: any): Promise<void> {
  await centralSync.saveFactoryConfig(config);
}

export async function saveAutoCloseNotifToDatabase(notif: AutoCloseNotification): Promise<void> {
  await centralSync.saveAutoCloseNotif(notif);
}

export async function dismissAutoCloseNotifInDatabase(notifId: string): Promise<void> {
  await centralSync.deleteAutoCloseNotif(notifId);
  try {
    const raw = localStorage.getItem('mca_autoclose_notifs_v3');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        localStorage.setItem('mca_autoclose_notifs_v3', JSON.stringify(list.filter((n: any) => n.id !== notifId)));
      }
    }
  } catch {}
}

export async function clearAllNotifsInDatabase(): Promise<void> {
  try { localStorage.setItem('mca_autoclose_notifs_v3', JSON.stringify([])); } catch {}
  await centralSync.clearAutoCloseNotifs();
}

// O "snapshot mestre" não grava mais na nuvem (era o que causava conflito entre tablets).
// Guarda só uma cópia local.
export async function saveMasterJsonSnapshotToDatabase(snapshot: {
  collaborators: Collaborator[];
  shifts: ShiftConfig[];
  activities: ActivityItem[];
  logs: ProductionLog[];
  factoryConfig?: any;
  autocloseNotifs?: AutoCloseNotification[];
  formattedSyncTime?: string;
  lastUpdated?: string;
}): Promise<void> {
  try { localStorage.setItem(LOCAL_MASTER_KEY, JSON.stringify(snapshot)); } catch {}
}

export async function fetchMasterJsonSnapshotFromDatabase(): Promise<any | null> {
  const state = await centralSync.fetchFullSync();
  if (state) {
    try { localStorage.setItem(LOCAL_MASTER_KEY, JSON.stringify(state)); } catch {}
    return state;
  }
  try {
    const raw = localStorage.getItem(LOCAL_MASTER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export async function resetProductionLogsInDatabase(): Promise<boolean> {
  try {
    await centralSync.resetLogs();
    return true;
  } catch {
    return false;
  }
}

export async function restoreProductionLogsToDatabase(
  logs: ProductionLog[],
  _notifs?: AutoCloseNotification[]
): Promise<boolean> {
  try {
    await centralSync.restoreLogs(logs);
    return true;
  } catch {
    return false;
  }
}

// Migra dados antigos (uma vez) e grava os dados iniciais se o banco estiver vazio.
export const seedInitialFirestoreDataIfEmpty = async (
  colabs?: any[],
  acts?: any[],
  shifts?: any[],
  observations?: string[]
) => {
  await centralSync.migrateAndSeed({ colabs, acts, shifts, observations });
  return true;
};

/**
 * 18. Helper to export backup file
 */
export function exportProductionLogsBackupFile(
  logs: ProductionLog[],
  autoCloseNotifsOrColabs?: AutoCloseNotification[] | Collaborator[],
  shifts?: ShiftConfig[],
  activities?: ActivityItem[],
  factoryConfig?: any,
  autocloseNotifs: AutoCloseNotification[] = []
) {
  let finalNotifs: AutoCloseNotification[] = [];
  let colabs: any = [];
  
  if (Array.isArray(autoCloseNotifsOrColabs) && autoCloseNotifsOrColabs.length > 0) {
    if ('role' in autoCloseNotifsOrColabs[0]) {
      colabs = autoCloseNotifsOrColabs;
      finalNotifs = autocloseNotifs;
    } else {
      finalNotifs = autoCloseNotifsOrColabs as AutoCloseNotification[];
    }
  }

  const fullBackup = {
    exportedAt: new Date().toISOString(),
    version: 'MCA-MES-NATIVE-v1',
    collaborators: colabs,
    shifts: shifts || [],
    activities: activities || [],
    factoryConfig: factoryConfig || {},
    logs,
    autocloseNotifs: finalNotifs,
  };

  const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MCA_BACKUP_COMPLETO_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Aliases for compatibility
export const fetchAllDataFromFirestore = fetchMasterJsonSnapshotFromDatabase;
export const saveLogToFirestore = saveLogToDatabase;
export const deleteLogFromFirestore = deleteLogFromDatabase;
export const saveCollaboratorsToFirestore = saveCollaboratorsToDatabase;
export const saveActivitiesToFirestore = saveActivitiesToDatabase;
export const saveShiftsToFirestore = saveShiftsToDatabase;
export const saveFactoryConfigToFirestore = saveFactoryConfigToDatabase;
export const saveAutoCloseNotifToFirestore = saveAutoCloseNotifToDatabase;
export const dismissAutoCloseNotifInFirestore = dismissAutoCloseNotifInDatabase;
export const clearAllNotifsInFirestore = clearAllNotifsInDatabase;
export const saveMasterJsonSnapshotToFirestore = saveMasterJsonSnapshotToDatabase;
export const fetchMasterJsonSnapshotFromFirestore = fetchMasterJsonSnapshotFromDatabase;
export const resetProductionLogsInFirestore = resetProductionLogsInDatabase;
export const restoreProductionLogsToFirestore = restoreProductionLogsToDatabase;

export const saveLogToSupabase = saveLogToDatabase;
export const deleteLogFromSupabase = deleteLogFromDatabase;
export const saveCollaboratorsToSupabase = saveCollaboratorsToDatabase;
export const saveActivitiesToSupabase = saveActivitiesToDatabase;
export const saveShiftsToSupabase = saveShiftsToDatabase;
export const saveFactoryConfigToSupabase = saveFactoryConfigToDatabase;
export const saveAutoCloseNotifToSupabase = saveAutoCloseNotifToDatabase;
export const dismissAutoCloseNotifInSupabase = dismissAutoCloseNotifInDatabase;
export const clearAllNotifsInSupabase = clearAllNotifsInDatabase;
export const resetProductionLogsInSupabase = resetProductionLogsInDatabase;
export const restoreProductionLogsToSupabase = restoreProductionLogsToDatabase;
export const saveMasterJsonSnapshotToSupabase = saveMasterJsonSnapshotToDatabase;
export const fetchMasterJsonSnapshotFromSupabase = fetchMasterJsonSnapshotFromDatabase;

export default {
  subscribeToLogs,
  subscribeToCollaborators,
  subscribeToActivities,
  subscribeToShifts,
  subscribeToFactoryConfig,
  saveLogToDatabase,
  deleteLogFromDatabase,
  saveCollaboratorsToDatabase,
  saveActivitiesToDatabase,
  saveShiftsToDatabase,
  saveFactoryConfigToDatabase,
  saveAutoCloseNotifToDatabase,
  dismissAutoCloseNotifInDatabase,
  clearAllNotifsInDatabase,
  saveMasterJsonSnapshotToDatabase,
  subscribeToMasterJsonSnapshot,
  fetchMasterJsonSnapshotFromDatabase,
  resetProductionLogsInDatabase,
  restoreProductionLogsToDatabase,
  exportProductionLogsBackupFile,
};
