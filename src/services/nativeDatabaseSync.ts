import { centralSync } from './centralSync';
import { 
  Collaborator, 
  ActivityItem, 
  ShiftConfig, 
  ProductionLog, 
  AutoCloseNotification 
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

// Queue for offline changes (when Wi-Fi or connection drops)
const OFFLINE_QUEUE_KEY = 'mca_offline_queue_v1';
const LOCAL_MASTER_KEY = 'mca_local_master_snapshot_v1';

interface OfflineQueueItem {
  id: string;
  type: 'log' | 'delete_log' | 'colab' | 'shift' | 'activity' | 'config' | 'notif';
  payload: any;
  timestamp: number;
}

function getOfflineQueue(): OfflineQueueItem[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue: OfflineQueueItem[]) {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

function addToOfflineQueue(item: Omit<OfflineQueueItem, 'id' | 'timestamp'>) {
  const queue = getOfflineQueue();
  queue.push({
    ...item,
    id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: Date.now(),
  });
  saveOfflineQueue(queue);
}

// Flush offline queue to server as soon as connection is healthy
let isFlushing = false;
export async function flushOfflineQueue(): Promise<void> {
  if (isFlushing || typeof navigator !== 'undefined' && !navigator.onLine) return;
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  isFlushing = true;
  const remaining: OfflineQueueItem[] = [];

  for (const item of queue) {
    try {
      if (item.type === 'log') {
        await centralSync.saveLog(item.payload);
      } else if (item.type === 'delete_log') {
        await centralSync.deleteLog(item.payload);
      } else if (item.type === 'colab') {
        await centralSync.saveCollaborators(item.payload);
      } else if (item.type === 'shift') {
        await centralSync.saveShifts(item.payload);
      } else if (item.type === 'activity') {
        await centralSync.saveActivities(item.payload);
      } else if (item.type === 'config') {
        await centralSync.saveFactoryConfig(item.payload);
      } else if (item.type === 'notif') {
        await centralSync.saveAutoCloseNotif(item.payload);
      }
    } catch {
      remaining.push(item);
    }
  }

  saveOfflineQueue(remaining);
  isFlushing = false;
}

// Monitor browser online events to flush instantly
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushOfflineQueue().catch(() => {});
  });
  // Periodic background check every 15s to flush if connected
  setInterval(() => {
    flushOfflineQueue().catch(() => {});
  }, 15000);
}

// 1. Subscribe to Production Logs
export function subscribeToLogs(
  onUpdate: (logs: ProductionLog[]) => void,
  _onError?: (err: Error) => void
) {
  let cachedLogs: ProductionLog[] = [];

  // Listen to full list updates (e.g. initial or manual restore)
  const unsubList = centralSync.onLogs((logs) => {
    if (Array.isArray(logs)) {
      cachedLogs = logs;
      onUpdate(cachedLogs);
    }
  });

  // Listen to single log changes pushed in real time via SSE
  const unsubSingle = centralSync.onSingleLogChange((change) => {
    if (change.action === 'save' && change.log) {
      const idx = cachedLogs.findIndex((l) => l.id === change.log!.id);
      if (idx >= 0) {
        cachedLogs[idx] = change.log;
      } else {
        cachedLogs = [change.log, ...cachedLogs];
      }
      onUpdate([...cachedLogs]);
    } else if (change.action === 'delete' && change.id) {
      cachedLogs = cachedLogs.filter((l) => l.id !== change.id);
      onUpdate([...cachedLogs]);
    }
  });

  // Initial load
  centralSync.fetchFullSync().then((state) => {
    if (state && Array.isArray(state.logs)) {
      cachedLogs = state.logs;
      onUpdate(cachedLogs);
    }
  }).catch(() => {});

  return () => {
    unsubList();
    unsubSingle();
  };
}

// 2. Subscribe to Collaborators
export function subscribeToCollaborators(
  onUpdate: (colabs: Collaborator[]) => void,
  _onError?: (err: Error) => void
) {
  const unsub = centralSync.onCollaborators((colabs) => {
    if (Array.isArray(colabs) && colabs.length > 0) onUpdate(colabs);
  });

  centralSync.fetchFullSync().then((state) => {
    if (state && Array.isArray(state.collaborators) && state.collaborators.length > 0) {
      onUpdate(state.collaborators);
    }
  }).catch(() => {});

  return unsub;
}

// 3. Subscribe to Activities
export function subscribeToActivities(
  onUpdate: (acts: ActivityItem[]) => void,
  _onError?: (err: Error) => void
) {
  const unsub = centralSync.onActivities((acts) => {
    if (Array.isArray(acts) && acts.length > 0) onUpdate(acts);
  });

  centralSync.fetchFullSync().then((state) => {
    if (state && Array.isArray(state.activities) && state.activities.length > 0) {
      onUpdate(state.activities);
    }
  }).catch(() => {});

  return unsub;
}

// 4. Subscribe to Shifts
export function subscribeToShifts(
  onUpdate: (shifts: ShiftConfig[]) => void,
  _onError?: (err: Error) => void
) {
  const unsub = centralSync.onShifts((shifts) => {
    if (Array.isArray(shifts) && shifts.length > 0) onUpdate(shifts);
  });

  centralSync.fetchFullSync().then((state) => {
    if (state && Array.isArray(state.shifts) && state.shifts.length > 0) {
      onUpdate(state.shifts);
    }
  }).catch(() => {});

  return unsub;
}

// 5. Subscribe to Factory Config
export function subscribeToFactoryConfig(
  onUpdate: (config: any) => void,
  _onError?: (err: Error) => void
) {
  const unsub = centralSync.onConfig((cfg) => {
    if (cfg) onUpdate(cfg);
  });

  centralSync.fetchFullSync().then((state) => {
    if (state && state.factoryConfig) {
      onUpdate(state.factoryConfig);
    }
  }).catch(() => {});

  return unsub;
}

// 6. Save or update a single log
export async function saveLogToDatabase(log: ProductionLog): Promise<void> {
  // Always update local cache first
  try {
    const raw = localStorage.getItem('mca_logs_v3');
    let list: ProductionLog[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((l) => l.id === log.id);
    if (idx >= 0) {
      list[idx] = log;
    } else {
      list.push(log);
    }
    localStorage.setItem('mca_logs_v3', JSON.stringify(list));
  } catch {}

  try {
    await centralSync.saveLog(log);
  } catch {
    // If request fails (offline or poor signal), queue for retry
    addToOfflineQueue({ type: 'log', payload: log });
  }
}

// 7. Delete a log
export async function deleteLogFromDatabase(id: string): Promise<void> {
  try {
    const raw = localStorage.getItem('mca_logs_v3');
    if (raw) {
      const list: ProductionLog[] = JSON.parse(raw);
      const filtered = list.filter((l) => l.id !== id);
      localStorage.setItem('mca_logs_v3', JSON.stringify(filtered));
    }
  } catch {}

  try {
    await centralSync.deleteLog(id);
  } catch {
    addToOfflineQueue({ type: 'delete_log', payload: id });
  }
}

// 8. Save Collaborators
export async function saveCollaboratorsToDatabase(collaborators: Collaborator[]): Promise<void> {
  try {
    localStorage.setItem('mca_collaborators_v3', JSON.stringify(collaborators));
  } catch {}

  try {
    await centralSync.saveCollaborators(collaborators);
  } catch {
    addToOfflineQueue({ type: 'colab', payload: collaborators });
  }
}

// 9. Save Activities
export async function saveActivitiesToDatabase(activities: ActivityItem[]): Promise<void> {
  try {
    localStorage.setItem('mca_activities_v3', JSON.stringify(activities));
  } catch {}

  try {
    await centralSync.saveActivities(activities);
  } catch {
    addToOfflineQueue({ type: 'activity', payload: activities });
  }
}

// 10. Save Shifts
export async function saveShiftsToDatabase(shifts: ShiftConfig[]): Promise<void> {
  try {
    localStorage.setItem('mca_shifts_v3', JSON.stringify(shifts));
  } catch {}

  try {
    await centralSync.saveShifts(shifts);
  } catch {
    addToOfflineQueue({ type: 'shift', payload: shifts });
  }
}

// 11. Save Factory Config
export async function saveFactoryConfigToDatabase(config: any): Promise<void> {
  try {
    await centralSync.saveFactoryConfig(config);
  } catch {
    addToOfflineQueue({ type: 'config', payload: config });
  }
}

// 12. Save AutoClose Notification
export async function saveAutoCloseNotifToDatabase(notif: AutoCloseNotification): Promise<void> {
  try {
    await centralSync.saveAutoCloseNotif(notif);
  } catch {
    addToOfflineQueue({ type: 'notif', payload: notif });
  }
}

// 13. Dismiss AutoClose Notification
export async function dismissAutoCloseNotifInDatabase(notifId: string): Promise<void> {
  try {
    await centralSync.saveAutoCloseNotif({ id: notifId, dismissed: true, read: true });
  } catch {
    addToOfflineQueue({ type: 'notif', payload: { id: notifId, dismissed: true, read: true } });
  }
}

// 14. Clear all notifications
export async function clearAllNotifsInDatabase(): Promise<void> {
  try {
    await centralSync.saveAutoCloseNotif({ id: 'all_cleared', clearAll: true });
  } catch {}
}

// 15. Master JSON Snapshot Save
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
  // Store locally for instant offline availability
  try {
    localStorage.setItem(LOCAL_MASTER_KEY, JSON.stringify(snapshot));
  } catch {}

  // Push to central server smoothly without triggering full-restore broadcast storms
  try {
    await centralSync.saveMasterSnapshot(snapshot);
  } catch (err) {
    console.warn('Master JSON save buffered locally (server unreachable):', err);
  }
}

// 16. Fetch Master JSON Snapshot
export async function fetchMasterJsonSnapshotFromDatabase(): Promise<any | null> {
  // Try server first
  try {
    const full = await centralSync.fetchFullSync();
    if (full && Array.isArray(full.collaborators) && full.collaborators.length > 0) {
      try {
        localStorage.setItem(LOCAL_MASTER_KEY, JSON.stringify(full));
      } catch {}
      return full;
    }
  } catch {
    // Network failure
  }

  // Fallback to local snapshot when offline
  try {
    const raw = localStorage.getItem(LOCAL_MASTER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}

  return null;
}

// 17. Subscribe to Master JSON Snapshot
export function subscribeToMasterJsonSnapshot(onUpdate: (snapshot: any) => void) {
  // Hook to central SSE logs_restored & full sync
  const unsub = centralSync.onLogs((logs) => {
    centralSync.fetchFullSync().then((state) => {
      if (state) onUpdate(state);
    }).catch(() => {});
  });

  return unsub;
}

// 18. Reset logs
export async function resetProductionLogsInDatabase(): Promise<boolean> {
  try {
    await centralSync.resetLogs();
    return true;
  } catch {
    return false;
  }
}

// 19. Restore logs from backup
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

// 20. Helper to export backup file
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
export const seedInitialFirestoreDataIfEmpty = async (..._args: any[]) => true;
export const fetchAllDataFromFirestore = fetchMasterJsonSnapshotFromDatabase;
export const subscribeToAutoCloseNotifs = () => () => {};

// Supabase legacy name aliases (pointing to 100% native server DB)
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
