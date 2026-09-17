import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  getDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit,
  getDocs
} from 'firebase/firestore';
import { db } from './firebaseClient';
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

const OFFLINE_QUEUE_KEY = 'mca_offline_queue_v2';
const LOCAL_MASTER_KEY = 'mca_local_master_snapshot_v2';
const LOCAL_LOGS_KEY = 'mca_logs_v3';

interface OfflineQueueItem {
  id: string;
  type: 'log' | 'delete_log' | 'colab' | 'shift' | 'activity' | 'config' | 'notif' | 'master_snap';
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

let isFlushing = false;
export async function flushOfflineQueue(): Promise<void> {
  if (isFlushing || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  isFlushing = true;
  const remaining: OfflineQueueItem[] = [];

  for (const item of queue) {
    try {
      if (item.type === 'log') {
        const log = item.payload;
        await setDoc(doc(db, 'logs', log.id), log, { merge: true });
        await centralSync.saveLog(log);
      } else if (item.type === 'delete_log') {
        await deleteDoc(doc(db, 'logs', item.payload));
        await centralSync.deleteLog(item.payload);
      } else if (item.type === 'colab') {
        await setDoc(doc(db, 'master_snapshot', 'collaborators'), { list: item.payload }, { merge: true });
        await centralSync.saveCollaborators(item.payload);
      } else if (item.type === 'shift') {
        await setDoc(doc(db, 'master_snapshot', 'shifts'), { list: item.payload }, { merge: true });
        await centralSync.saveShifts(item.payload);
      } else if (item.type === 'activity') {
        await setDoc(doc(db, 'master_snapshot', 'activities'), { list: item.payload }, { merge: true });
        await centralSync.saveActivities(item.payload);
      } else if (item.type === 'config') {
        await setDoc(doc(db, 'master_snapshot', 'config'), item.payload, { merge: true });
        await centralSync.saveFactoryConfig(item.payload);
      } else if (item.type === 'notif') {
        await setDoc(doc(db, 'autoclose_notifs', item.payload.id), item.payload, { merge: true });
        await centralSync.saveAutoCloseNotif(item.payload);
      } else if (item.type === 'master_snap') {
        await setDoc(doc(db, 'master_snapshot', 'current'), item.payload, { merge: true });
        await centralSync.saveMasterSnapshot(item.payload);
      }
    } catch {
      remaining.push(item);
    }
  }

  saveOfflineQueue(remaining);
  isFlushing = false;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushOfflineQueue().catch(() => {});
  });
  setInterval(() => {
    flushOfflineQueue().catch(() => {});
  }, 15000);
}

// ============================================================================
// REAL-TIME FIRESTORE + NATIVE UNIVERSAL SUBSCRIPTIONS
// ============================================================================

/**
 * 1. Subscribe to Production Logs
 * Real-time onSnapshot directly from Firestore + SSE secondary channel
 */
export function subscribeToLogs(
  onUpdate: (logs: ProductionLog[]) => void,
  onError?: (err: Error) => void
) {
  let cachedLogsMap = new Map<string, ProductionLog>();

  // Pre-fill with local cache
  try {
    const raw = localStorage.getItem(LOCAL_LOGS_KEY);
    if (raw) {
      const parsed: ProductionLog[] = JSON.parse(raw);
      for (const l of parsed) {
        if (l && l.id) cachedLogsMap.set(l.id, l);
      }
      if (cachedLogsMap.size > 0) {
        onUpdate(Array.from(cachedLogsMap.values()));
      }
    }
  } catch {}

  // A. Primary: Firestore Real-Time Collection Listener
  let unsubFirestore = () => {};
  try {
    const logsCol = collection(db, 'logs');
    unsubFirestore = onSnapshot(
      logsCol,
      (snapshot) => {
        if (!snapshot.empty) {
          snapshot.docChanges().forEach((change) => {
            const data = change.doc.data() as ProductionLog;
            if (change.type === 'removed') {
              cachedLogsMap.delete(change.doc.id);
            } else if (data && data.id) {
              cachedLogsMap.set(data.id, data);
            }
          });
          const all = Array.from(cachedLogsMap.values());
          try {
            localStorage.setItem(LOCAL_LOGS_KEY, JSON.stringify(all));
          } catch {}
          onUpdate(all);
        }
      },
      (err) => {
        console.warn('Firestore logs subscription notice:', err.message);
        if (onError) onError(err);
      }
    );
  } catch (err: any) {
    console.warn('Failed to init Firestore logs snapshot:', err.message);
  }

  // B. Secondary: Central Cloud Run SSE Stream
  const unsubCentralSingle = centralSync.onSingleLogChange((change) => {
    if (change.action === 'save' && change.log) {
      cachedLogsMap.set(change.log.id, change.log);
      const all = Array.from(cachedLogsMap.values());
      try {
        localStorage.setItem(LOCAL_LOGS_KEY, JSON.stringify(all));
      } catch {}
      onUpdate(all);
    } else if (change.action === 'delete' && change.id) {
      cachedLogsMap.delete(change.id);
      const all = Array.from(cachedLogsMap.values());
      try {
        localStorage.setItem(LOCAL_LOGS_KEY, JSON.stringify(all));
      } catch {}
      onUpdate(all);
    }
  });

  const unsubCentralLogs = centralSync.onLogs((logs) => {
    if (Array.isArray(logs) && logs.length > 0) {
      for (const l of logs) {
        if (l && l.id) cachedLogsMap.set(l.id, l);
      }
      const all = Array.from(cachedLogsMap.values());
      onUpdate(all);
    }
  });

  // Initial fetch from server
  centralSync.fetchFullSync().then((state) => {
    if (state && Array.isArray(state.logs) && state.logs.length > 0) {
      for (const l of state.logs) {
        if (l && l.id) cachedLogsMap.set(l.id, l);
      }
      onUpdate(Array.from(cachedLogsMap.values()));
    }
  }).catch(() => {});

  return () => {
    try {
      unsubFirestore();
    } catch {}
    unsubCentralSingle();
    unsubCentralLogs();
  };
}

/**
 * 2. Subscribe to Master JSON Snapshot (Instant Universal Sync across all devices)
 */
export function subscribeToMasterJsonSnapshot(onUpdate: (snapshot: any) => void) {
  let unsubFirestore = () => {};
  try {
    const snapRef = doc(db, 'master_snapshot', 'current');
    unsubFirestore = onSnapshot(
      snapRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data && (data.logs || data.collaborators)) {
            try {
              localStorage.setItem(LOCAL_MASTER_KEY, JSON.stringify(data));
            } catch {}
            onUpdate(data);
          }
        }
      },
      (err) => {
        console.warn('Firestore master_snapshot subscription notice:', err.message);
      }
    );
  } catch (err: any) {
    console.warn('Failed to init master_snapshot onSnapshot:', err.message);
  }

  // Secondary SSE logs restored listener
  const unsubCentral = centralSync.onLogs((logs) => {
    centralSync.fetchFullSync().then((state) => {
      if (state) onUpdate(state);
    }).catch(() => {});
  });

  return () => {
    try {
      unsubFirestore();
    } catch {}
    unsubCentral();
  };
}

/**
 * 3. Subscribe to Collaborators
 */
export function subscribeToCollaborators(
  onUpdate: (colabs: Collaborator[]) => void,
  _onError?: (err: Error) => void
) {
  const unsubCentral = centralSync.onCollaborators((colabs) => {
    if (Array.isArray(colabs) && colabs.length > 0) onUpdate(colabs);
  });

  centralSync.fetchFullSync().then((state) => {
    if (state && Array.isArray(state.collaborators) && state.collaborators.length > 0) {
      onUpdate(state.collaborators);
    }
  }).catch(() => {});

  return unsubCentral;
}

/**
 * 4. Subscribe to Activities
 */
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

/**
 * 5. Subscribe to Shifts
 */
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

/**
 * 6. Subscribe to Factory Config
 */
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

// ============================================================================
// MUTATION METHODS (Saves to Firestore + Central Server + Local Storage)
// ============================================================================

/**
 * 7. Save or update a single production log
 */
export async function saveLogToDatabase(log: ProductionLog): Promise<void> {
  // A. LocalStorage cache for instant offline responsiveness
  try {
    const raw = localStorage.getItem(LOCAL_LOGS_KEY);
    let list: ProductionLog[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((l) => l.id === log.id);
    if (idx >= 0) {
      list[idx] = log;
    } else {
      list = [log, ...list];
    }
    localStorage.setItem(LOCAL_LOGS_KEY, JSON.stringify(list));
  } catch {}

  // B. Write to Firestore in real time
  try {
    const logRef = doc(db, 'logs', log.id);
    await setDoc(logRef, {
      ...log,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore saveLog notice (queued):', err);
    addToOfflineQueue({ type: 'log', payload: log });
  }

  // C. Mirror to Express Central Server
  try {
    await centralSync.saveLog(log);
  } catch {
    // Already handled locally and in queue if offline
  }
}

/**
 * 8. Delete a production log
 */
export async function deleteLogFromDatabase(id: string): Promise<void> {
  try {
    const raw = localStorage.getItem(LOCAL_LOGS_KEY);
    if (raw) {
      const list: ProductionLog[] = JSON.parse(raw);
      const filtered = list.filter((l) => l.id !== id);
      localStorage.setItem(LOCAL_LOGS_KEY, JSON.stringify(filtered));
    }
  } catch {}

  try {
    const logRef = doc(db, 'logs', id);
    await deleteDoc(logRef);
  } catch {
    addToOfflineQueue({ type: 'delete_log', payload: id });
  }

  try {
    await centralSync.deleteLog(id);
  } catch {}
}

/**
 * 9. Save Collaborators
 */
export async function saveCollaboratorsToDatabase(collaborators: Collaborator[]): Promise<void> {
  try {
    localStorage.setItem('mca_collaborators_v3', JSON.stringify(collaborators));
  } catch {}

  try {
    await setDoc(doc(db, 'master_snapshot', 'collaborators'), {
      list: collaborators,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch {
    addToOfflineQueue({ type: 'colab', payload: collaborators });
  }

  try {
    await centralSync.saveCollaborators(collaborators);
  } catch {}
}

/**
 * 10. Save Activities
 */
export async function saveActivitiesToDatabase(activities: ActivityItem[]): Promise<void> {
  try {
    localStorage.setItem('mca_activities_v3', JSON.stringify(activities));
  } catch {}

  try {
    await setDoc(doc(db, 'master_snapshot', 'activities'), {
      list: activities,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch {
    addToOfflineQueue({ type: 'activity', payload: activities });
  }

  try {
    await centralSync.saveActivities(activities);
  } catch {}
}

/**
 * 11. Save Shifts
 */
export async function saveShiftsToDatabase(shifts: ShiftConfig[]): Promise<void> {
  try {
    localStorage.setItem('mca_shifts_v3', JSON.stringify(shifts));
  } catch {}

  try {
    await setDoc(doc(db, 'master_snapshot', 'shifts'), {
      list: shifts,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch {
    addToOfflineQueue({ type: 'shift', payload: shifts });
  }

  try {
    await centralSync.saveShifts(shifts);
  } catch {}
}

/**
 * 12. Save Factory Config
 */
export async function saveFactoryConfigToDatabase(config: any): Promise<void> {
  try {
    await setDoc(doc(db, 'master_snapshot', 'config'), {
      ...config,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch {
    addToOfflineQueue({ type: 'config', payload: config });
  }

  try {
    await centralSync.saveFactoryConfig(config);
  } catch {}
}

/**
 * 13. Save AutoClose Notification
 */
export async function saveAutoCloseNotifToDatabase(notif: AutoCloseNotification): Promise<void> {
  try {
    if (notif && notif.id) {
      await setDoc(doc(db, 'autoclose_notifs', notif.id), notif, { merge: true });
    }
  } catch {
    addToOfflineQueue({ type: 'notif', payload: notif });
  }

  try {
    await centralSync.saveAutoCloseNotif(notif);
  } catch {}
}

export async function dismissAutoCloseNotifInDatabase(notifId: string): Promise<void> {
  try {
    await saveAutoCloseNotifToDatabase({ id: notifId, dismissed: true, read: true } as any);
  } catch {}
}

export async function clearAllNotifsInDatabase(): Promise<void> {
  try {
    await centralSync.saveAutoCloseNotif({ id: 'all_cleared', clearAll: true });
  } catch {}
}

/**
 * 14. Master JSON Snapshot Save
 * Writes unified state to Firestore master_snapshot/current and Central Server /api/master-snapshot
 */
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
    if (Array.isArray(snapshot.logs)) {
      localStorage.setItem(LOCAL_LOGS_KEY, JSON.stringify(snapshot.logs));
    }
  } catch {}

  // A. Save to Firestore (Primary universal state for all tablets)
  try {
    const snapRef = doc(db, 'master_snapshot', 'current');
    await setDoc(snapRef, {
      ...snapshot,
      lastUpdated: new Date().toISOString(),
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore master_snapshot save notice:', err);
    addToOfflineQueue({ type: 'master_snap', payload: snapshot });
  }

  // B. Save to Central Express Server
  try {
    await centralSync.saveMasterSnapshot(snapshot);
  } catch {}
}

/**
 * 15. Fetch Master JSON Snapshot
 * Reads latest state from Firestore, falls back to Server, then LocalStorage
 */
export async function fetchMasterJsonSnapshotFromDatabase(): Promise<any | null> {
  // 1. Try Firestore first
  try {
    const snapRef = doc(db, 'master_snapshot', 'current');
    const docSnap = await getDoc(snapRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data && Array.isArray(data.collaborators) && data.collaborators.length > 0) {
        try {
          localStorage.setItem(LOCAL_MASTER_KEY, JSON.stringify(data));
        } catch {}
        return data;
      }
    }
  } catch (err) {
    console.warn('Firestore master_snapshot fetch notice:', err);
  }

  // 2. Try Central Server
  try {
    const full = await centralSync.fetchFullSync();
    if (full && Array.isArray(full.collaborators) && full.collaborators.length > 0) {
      try {
        localStorage.setItem(LOCAL_MASTER_KEY, JSON.stringify(full));
      } catch {}
      return full;
    }
  } catch {}

  // 3. Fallback to LocalStorage
  try {
    const raw = localStorage.getItem(LOCAL_MASTER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}

  return null;
}

/**
 * 16. Reset logs
 */
export async function resetProductionLogsInDatabase(): Promise<boolean> {
  try {
    // Clear in Firestore
    const logsCol = collection(db, 'logs');
    const snap = await getDocs(logsCol);
    for (const d of snap.docs) {
      deleteDoc(d.ref).catch(() => {});
    }
  } catch {}

  try {
    await centralSync.resetLogs();
    return true;
  } catch {
    return false;
  }
}

/**
 * 17. Restore logs from backup
 */
export async function restoreProductionLogsToDatabase(
  logs: ProductionLog[],
  _notifs?: AutoCloseNotification[]
): Promise<boolean> {
  try {
    for (const log of logs) {
      if (log && log.id) {
        setDoc(doc(db, 'logs', log.id), log, { merge: true }).catch(() => {});
      }
    }
  } catch {}

  try {
    await centralSync.restoreLogs(logs);
    return true;
  } catch {
    return false;
  }
}

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

// Supabase legacy name aliases
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
