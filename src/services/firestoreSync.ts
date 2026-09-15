import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  getDocs, 
  writeBatch,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from '../lib/firebase';
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

// 1. Subscribe to Production Logs
export function subscribeToLogs(
  onUpdate: (logs: ProductionLog[]) => void,
  onError?: (err: Error) => void
) {
  try {
    const logsCol = collection(db, 'logs');
    return onSnapshot(
      logsCol,
      (snapshot) => {
        const logs: ProductionLog[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          logs.push({
            id: docSnap.id,
            date: data.date || '',
            collaboratorName: data.collaboratorName || '',
            role: data.role || '',
            shift: data.shift || '',
            activity: data.activity || '',
            category: data.category,
            startTime: data.startTime || '',
            endTime: data.endTime,
            durationMinutes: data.durationMinutes,
            status: data.status || 'Em Execução',
            observation: data.observation,
            notes: data.notes,
            machineId: data.machineId,
            partsProduced: data.partsProduced,
            scrapCount: data.scrapCount,
            autoClosed: data.autoClosed,
            autoClosedAtShiftEnd: data.autoClosedAtShiftEnd,
            pendingNextShiftResume: data.pendingNextShiftResume,
            resumedFromPreviousLogId: data.resumedFromPreviousLogId,
            isMealPause: data.isMealPause,
            mealBreakDeducted: data.mealBreakDeducted,
            mealBreakMinutes: data.mealBreakMinutes,
            mealBreakSource: data.mealBreakSource,
            mealPauseStartTime: data.mealPauseStartTime,
            mealPauseTimestampMs: data.mealPauseTimestampMs,
            mealPauseDurationMinutes: data.mealPauseDurationMinutes,
            totalPausedSeconds: data.totalPausedSeconds,
            mealResumedAt: data.mealResumedAt,
          });
        });
        onUpdate(logs);
      },
      (error) => {
        console.warn('Firestore logs subscription warning:', error);
        if (onError) onError(error);
      }
    );
  } catch (err) {
    console.warn('Failed to attach firestore logs listener:', err);
    return () => {};
  }
}

// 2. Subscribe to Collaborators
export function subscribeToCollaborators(
  onUpdate: (collaborators: Collaborator[]) => void
) {
  try {
    const colabsCol = collection(db, 'collaborators');
    return onSnapshot(colabsCol, (snapshot) => {
      const items: Collaborator[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        items.push({
          id: d.id,
          name: data.name || '',
          role: data.role || '',
          shift: data.shift || 'Turno 1',
          active: data.active !== false,
          avatarColor: data.avatarColor,
          mealStart: data.mealStart,
          mealEnd: data.mealEnd,
          mealDurationMinutes: data.mealDurationMinutes,
        });
      });
      if (items.length > 0 || !snapshot.empty) {
        onUpdate(items);
      }
    });
  } catch (err) {
    console.warn('Failed to subscribe collaborators:', err);
    return () => {};
  }
}

// 3. Subscribe to Activities Catalog
export function subscribeToActivities(
  onUpdate: (activities: ActivityItem[]) => void
) {
  try {
    const activitiesCol = collection(db, 'activities');
    return onSnapshot(activitiesCol, (snapshot) => {
      const items: ActivityItem[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        items.push({
          id: d.id,
          role: data.role || '',
          name: data.name || '',
          priority: Number(data.priority) || 1,
          category: data.category || 'Operação',
          standardMinutes: data.standardMinutes,
        });
      });
      // Sort by role and priority
      items.sort((a, b) => a.role.localeCompare(b.role) || a.priority - b.priority);
      if (items.length > 0 || !snapshot.empty) {
        onUpdate(items);
      }
    });
  } catch (err) {
    console.warn('Failed to subscribe activities:', err);
    return () => {};
  }
}

// 4. Subscribe to Shifts
export function subscribeToShifts(
  onUpdate: (shifts: ShiftConfig[]) => void
) {
  try {
    const shiftsCol = collection(db, 'shifts');
    return onSnapshot(shiftsCol, (snapshot) => {
      const items: ShiftConfig[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        const code = (data.code || (data.name?.toLowerCase().includes('2') ? 't2' : data.name?.toLowerCase().includes('3') ? 't3' : 't1')).toLowerCase();
        
        let defaultEntrada = '07:00';
        let defaultSaidaAlmoco = '12:00';
        let defaultRetornoAlmoco = '13:30';
        let defaultSaida = '17:30';
        let defaultColor = '#007BFF';

        if (code === 't2' || data.name?.toLowerCase().includes('2')) {
          defaultEntrada = '15:30';
          defaultSaidaAlmoco = '20:00';
          defaultRetornoAlmoco = '21:00';
          defaultSaida = '01:30';
          defaultColor = '#FF8C00';
        } else if (code === 't3' || data.name?.toLowerCase().includes('3')) {
          defaultEntrada = '20:00';
          defaultSaidaAlmoco = '02:00';
          defaultRetornoAlmoco = '03:00';
          defaultSaida = '06:00';
          defaultColor = '#9C27B0';
        }

        items.push({
          id: d.id,
          name: data.name || (code === 't2' ? 'Turno 2' : code === 't3' ? 'Turno 3' : 'Turno 1'),
          code: data.code || code,
          entrada: data.entrada || defaultEntrada,
          saidaAlmoco: data.saidaAlmoco || defaultSaidaAlmoco,
          retornoAlmoco: data.retornoAlmoco || defaultRetornoAlmoco,
          saida: data.saida || defaultSaida,
          dias: data.dias || ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
          color: data.color || defaultColor,
        });
      });
      if (items.length > 0 || !snapshot.empty) {
        onUpdate(items);
      }
    });
  } catch (err) {
    console.warn('Failed to subscribe shifts:', err);
    return () => {};
  }
}

// 5. Subscribe to General Factory Config
export function subscribeToFactoryConfig(
  onUpdate: (config: FactoryConfigState) => void
) {
  try {
    const configDocRef = doc(db, 'factory_config', 'main_config');
    return onSnapshot(configDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        onUpdate({
          toleranceMinutes: Number(data.toleranceMinutes) || 60,
          observations: Array.isArray(data.observations) ? data.observations : [],
          customRoleColors: data.customRoleColors || {},
          customRoles: Array.isArray(data.customRoles) ? data.customRoles : undefined,
          deletedRoles: Array.isArray(data.deletedRoles) ? data.deletedRoles : undefined,
          efficiencyThresholdGreen: data.efficiencyThresholdGreen !== undefined ? Number(data.efficiencyThresholdGreen) : 85,
          efficiencyThresholdYellow: data.efficiencyThresholdYellow !== undefined ? Number(data.efficiencyThresholdYellow) : 70,
        });
      }
    });
  } catch (err) {
    console.warn('Failed to subscribe factory config:', err);
    return () => {};
  }
}

// 6. Subscribe to Auto-Close Notifications (with strict deduplication)
export function subscribeToAutoCloseNotifs(
  onUpdate: (notifs: AutoCloseNotification[]) => void
) {
  try {
    const notifsCol = collection(db, 'autoclose_notifs');
    return onSnapshot(notifsCol, (snapshot) => {
      const mapByLog = new Map<string, AutoCloseNotification>();
      const duplicateDocIdsToDelete: string[] = [];

      snapshot.forEach((d) => {
        const data = d.data();
        const logId = data.logId || d.id;
        const notifItem: AutoCloseNotification = {
          id: d.id,
          logId: data.logId || d.id,
          collaboratorName: data.collaboratorName || '',
          role: data.role || '',
          activity: data.activity || '',
          shiftName: data.shiftName || '',
          shiftEnd: data.shiftEnd || '',
          date: data.date || '',
          timestamp: Number(data.timestamp) || Date.now(),
          readByOperator: !!data.readByOperator,
          readByLeader: !!data.readByLeader,
        };

        const dedupeKey = `${notifItem.collaboratorName.trim().toLowerCase()}_${notifItem.date}_${notifItem.shiftEnd}_${notifItem.logId}`;

        if (!mapByLog.has(dedupeKey)) {
          mapByLog.set(dedupeKey, notifItem);
        } else {
          // Already have a notification for this exact event; mark older/redundant doc for batch deletion
          duplicateDocIdsToDelete.push(d.id);
        }
      });

      // Silently clean up redundant duplicate documents in Firestore if found
      if (duplicateDocIdsToDelete.length > 0) {
        const batch = writeBatch(db);
        duplicateDocIdsToDelete.forEach((dupId) => {
          batch.delete(doc(db, 'autoclose_notifs', dupId));
        });
        batch.commit().catch(() => {});
      }

      const items = Array.from(mapByLog.values());
      items.sort((a, b) => b.timestamp - a.timestamp);
      onUpdate(items);
    });
  } catch (err) {
    console.warn('Failed to subscribe auto-close notifs:', err);
    return () => {};
  }
}

// Helper to recursively remove undefined values before sending to Firestore
function sanitizeForFirestore<T>(data: T): any {
  if (data === null || data === undefined) return null;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForFirestore(item));
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    if (value !== undefined) {
      clean[key] = sanitizeForFirestore(value);
    }
  }
  return clean;
}

// === MUTATION HELPERS (Real-time writes to Cloud Run and Firestore) ===

export async function saveLogToFirestore(log: ProductionLog) {
  // 1. Instantly persist to Cloud Run central database & broadcast to all tablets via SSE
  centralSync.saveLog(log);

  // 2. Mirror to Firestore in background
  try {
    const docRef = doc(db, 'logs', log.id);
    const sanitized = sanitizeForFirestore({
      ...log,
      updatedAt: new Date().toISOString()
    });
    await setDoc(docRef, sanitized, { merge: true });
  } catch (err) {
    console.warn('Firestore mirror log notice (Cloud Run persistent sync is active):', err);
  }
}

export async function deleteLogFromFirestore(logId: string) {
  // 1. Instantly delete from Cloud Run central database & broadcast to all tablets via SSE
  centralSync.deleteLog(logId);

  // 2. Mirror to Firestore in background
  try {
    const docRef = doc(db, 'logs', logId);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Firestore mirror delete log notice:', err);
  }
}

export async function saveCollaboratorsToFirestore(collaborators: Collaborator[]) {
  // 1. Instantly persist to Cloud Run central database & broadcast to all tablets via SSE
  centralSync.saveCollaborators(collaborators);

  // 2. Mirror to Firestore in background
  try {
    const colabsCol = collection(db, 'collaborators');
    const existingSnap = await getDocs(colabsCol);
    const batch = writeBatch(db);
    
    const newIds = new Set(collaborators.map((c) => c.id));
    existingSnap.forEach((docSnap) => {
      if (!newIds.has(docSnap.id)) {
        batch.delete(docSnap.ref);
      }
    });

    collaborators.forEach((c) => {
      const docRef = doc(db, 'collaborators', c.id);
      batch.set(docRef, sanitizeForFirestore(c), { merge: true });
    });
    await batch.commit();
  } catch (err) {
    console.warn('Firestore mirror collaborators notice:', err);
  }
}

export async function saveActivitiesToFirestore(activities: ActivityItem[]) {
  // 1. Instantly persist to Cloud Run central database & broadcast to all tablets via SSE
  centralSync.saveActivities(activities);

  // 2. Mirror to Firestore in background
  try {
    const actCol = collection(db, 'activities');
    const existingSnap = await getDocs(actCol);
    const batch = writeBatch(db);
    
    const newIds = new Set(activities.map((a) => a.id));
    existingSnap.forEach((docSnap) => {
      if (!newIds.has(docSnap.id)) {
        batch.delete(docSnap.ref);
      }
    });

    activities.forEach((a) => {
      const docRef = doc(db, 'activities', a.id);
      batch.set(docRef, sanitizeForFirestore(a), { merge: true });
    });
    await batch.commit();
  } catch (err) {
    console.warn('Firestore mirror activities notice:', err);
  }
}

export async function saveShiftsToFirestore(shifts: ShiftConfig[]) {
  // 1. Instantly persist to Cloud Run central database & broadcast to all tablets via SSE
  centralSync.saveShifts(shifts);

  // 2. Mirror to Firestore in background
  try {
    const shiftsCol = collection(db, 'shifts');
    const existingSnap = await getDocs(shiftsCol);
    const batch = writeBatch(db);
    
    const newIds = new Set(shifts.map((s) => s.id));
    existingSnap.forEach((docSnap) => {
      if (!newIds.has(docSnap.id)) {
        batch.delete(docSnap.ref);
      }
    });

    shifts.forEach((s) => {
      const docRef = doc(db, 'shifts', s.id);
      batch.set(docRef, sanitizeForFirestore(s), { merge: true });
    });
    await batch.commit();
  } catch (err) {
    console.warn('Firestore mirror shifts notice:', err);
  }
}

export async function fetchAllDataFromFirestore(): Promise<{
  logs?: ProductionLog[];
  collaborators?: Collaborator[];
  activities?: ActivityItem[];
  shifts?: ShiftConfig[];
  config?: FactoryConfigState;
} | null> {
  try {
    const [logsSnap, colabsSnap, actSnap, shiftsSnap] = await Promise.all([
      getDocs(collection(db, 'logs')),
      getDocs(collection(db, 'collaborators')),
      getDocs(collection(db, 'activities')),
      getDocs(collection(db, 'shifts')),
    ]);

    const logs: ProductionLog[] = [];
    logsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      logs.push({
        id: docSnap.id,
        date: data.date || '',
        collaboratorName: data.collaboratorName || '',
        role: data.role || '',
        shift: data.shift || '',
        activity: data.activity || '',
        category: data.category,
        startTime: data.startTime || '',
        endTime: data.endTime,
        durationMinutes: data.durationMinutes,
        status: data.status || 'Em Execução',
        observation: data.observation,
        notes: data.notes,
        machineId: data.machineId,
        partsProduced: data.partsProduced,
        scrapCount: data.scrapCount,
        autoClosed: data.autoClosed,
        autoClosedAtShiftEnd: data.autoClosedAtShiftEnd,
        pendingNextShiftResume: data.pendingNextShiftResume,
        resumedFromPreviousLogId: data.resumedFromPreviousLogId,
        isMealPause: data.isMealPause,
        mealBreakDeducted: data.mealBreakDeducted,
        mealBreakMinutes: data.mealBreakMinutes,
        mealBreakSource: data.mealBreakSource,
        mealPauseStartTime: data.mealPauseStartTime,
        mealPauseTimestampMs: data.mealPauseTimestampMs,
        mealPauseDurationMinutes: data.mealPauseDurationMinutes,
        totalPausedSeconds: data.totalPausedSeconds,
        mealResumedAt: data.mealResumedAt,
      });
    });

    const collaborators: Collaborator[] = [];
    colabsSnap.forEach((d) => {
      const data = d.data();
      collaborators.push({
        id: d.id,
        name: data.name || '',
        role: data.role || '',
        shift: data.shift || 'Turno 1',
        active: data.active !== false,
        avatarColor: data.avatarColor,
        mealStart: data.mealStart,
        mealEnd: data.mealEnd,
        mealDurationMinutes: data.mealDurationMinutes,
      });
    });

    const activities: ActivityItem[] = [];
    actSnap.forEach((d) => {
      const data = d.data();
      activities.push({
        id: d.id,
        role: data.role || '',
        name: data.name || '',
        priority: Number(data.priority) || 1,
        category: data.category || 'Operação',
        standardMinutes: data.standardMinutes,
      });
    });
    activities.sort((a, b) => a.role.localeCompare(b.role) || a.priority - b.priority);

    const shifts: ShiftConfig[] = [];
    shiftsSnap.forEach((d) => {
      const data = d.data();
      const code = (data.code || (data.name?.toLowerCase().includes('2') ? 't2' : data.name?.toLowerCase().includes('3') ? 't3' : 't1')).toLowerCase();
      
      let defaultEntrada = '07:00';
      let defaultSaidaAlmoco = '12:00';
      let defaultRetornoAlmoco = '13:30';
      let defaultSaida = '17:30';
      let defaultColor = '#007BFF';

      if (code === 't2' || data.name?.toLowerCase().includes('2')) {
        defaultEntrada = '15:30';
        defaultSaidaAlmoco = '20:00';
        defaultRetornoAlmoco = '21:00';
        defaultSaida = '01:30';
        defaultColor = '#FF8C00';
      } else if (code === 't3' || data.name?.toLowerCase().includes('3')) {
        defaultEntrada = '20:00';
        defaultSaidaAlmoco = '02:00';
        defaultRetornoAlmoco = '03:00';
        defaultSaida = '06:00';
        defaultColor = '#9C27B0';
      }

      shifts.push({
        id: d.id,
        name: data.name || (code === 't2' ? 'Turno 2' : code === 't3' ? 'Turno 3' : 'Turno 1'),
        code: data.code || code,
        entrada: data.entrada || defaultEntrada,
        saidaAlmoco: data.saidaAlmoco || defaultSaidaAlmoco,
        retornoAlmoco: data.retornoAlmoco || defaultRetornoAlmoco,
        saida: data.saida || defaultSaida,
        dias: data.dias || ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
        color: data.color || defaultColor,
      });
    });

    return {
      logs: logs.length > 0 ? logs : undefined,
      collaborators: collaborators.length > 0 ? collaborators : undefined,
      activities: activities.length > 0 ? activities : undefined,
      shifts: shifts.length > 0 ? shifts : undefined,
    };
  } catch (err) {
    console.warn('Firestore poll sync warning:', err);
    return null;
  }
}

export async function saveFactoryConfigToFirestore(config: Partial<FactoryConfigState>) {
  centralSync.saveFactoryConfig(config);
  try {
    const docRef = doc(db, 'factory_config', 'main_config');
    await setDoc(docRef, sanitizeForFirestore(config), { merge: true });
  } catch (err) {
    console.warn('Firestore mirror config notice:', err);
  }
}

export async function saveAutoCloseNotifToFirestore(notif: AutoCloseNotification) {
  centralSync.saveAutoCloseNotif(notif);
  try {
    const docRef = doc(db, 'autoclose_notifs', notif.id);
    await setDoc(docRef, sanitizeForFirestore(notif), { merge: true });
  } catch (err) {
    console.warn('Firestore mirror auto close notif notice:', err);
  }
}

export async function dismissAutoCloseNotifInFirestore(notifId: string) {
  try {
    const docRef = doc(db, 'autoclose_notifs', notifId);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Firestore mirror dismiss notif notice:', err);
  }
}

export async function clearAllNotifsInFirestore() {
  try {
    const notifsCol = collection(db, 'autoclose_notifs');
    const snapshot = await getDocs(notifsCol);
    const batch = writeBatch(db);
    snapshot.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (err) {
    console.warn('Firestore mirror clear notifs notice:', err);
  }
}

/**
 * Reseta exclusivamente os registros de produção (logs e notificações automáticas)
 * mantendo colaboradores, turnos, atividades, regras e configurações intactas.
 */
export async function resetProductionLogsInFirestore(): Promise<boolean> {
  // 1. Reset on Cloud Run central server (creates server-side backup)
  await centralSync.resetLogs();

  // 2. Mirror to Firestore if available
  try {
    const logsCol = collection(db, 'logs');
    const notifsCol = collection(db, 'autoclose_notifs');

    const [logsSnap, notifsSnap] = await Promise.all([
      getDocs(logsCol),
      getDocs(notifsCol),
    ]);

    // Firestore batch supports up to 500 operations per batch
    const allDocRefs = [
      ...logsSnap.docs.map((d) => d.ref),
      ...notifsSnap.docs.map((d) => d.ref),
    ];

    const chunkSize = 400;
    for (let i = 0; i < allDocRefs.length; i += chunkSize) {
      const batch = writeBatch(db);
      const chunk = allDocRefs.slice(i, i + chunkSize);
      chunk.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  } catch (err) {
    console.warn('Firestore mirror reset logs notice (Cloud Run backup was saved):', err);
  }

  // Limpar caches locais de logs também
  try {
    localStorage.setItem('mca_logs_v3', JSON.stringify([]));
    localStorage.setItem('mca_autoclose_notifs_v3', JSON.stringify([]));
  } catch {
    // ignore
  }

  return true;
}

/**
 * Restaura uma lista de logs de produção para o Firestore em batches seguros
 */
export async function restoreProductionLogsToFirestore(
  logs: ProductionLog[],
  notifs: AutoCloseNotification[] = []
): Promise<boolean> {
  // 1. Restore on Cloud Run central database
  await centralSync.restoreLogs(logs);

  // 2. Mirror to Firestore if available
  try {
    const chunkSize = 350;
    for (let i = 0; i < logs.length; i += chunkSize) {
      const batch = writeBatch(db);
      const chunk = logs.slice(i, i + chunkSize);
      chunk.forEach((l) => {
        const docRef = doc(db, 'logs', l.id);
        batch.set(docRef, sanitizeForFirestore(l), { merge: true });
      });
      await batch.commit();
    }

    // Gravar Notificações se existirem
    if (notifs.length > 0) {
      for (let i = 0; i < notifs.length; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = notifs.slice(i, i + chunkSize);
        chunk.forEach((n) => {
          const docRef = doc(db, 'autoclose_notifs', n.id);
          batch.set(docRef, sanitizeForFirestore(n), { merge: true });
        });
        await batch.commit();
      }
    }
  } catch (err) {
    console.warn('Firestore mirror restore logs notice:', err);
  }

  // Atualizar LocalStorage
  try {
    localStorage.setItem('mca_logs_v3', JSON.stringify(logs));
    if (notifs.length > 0) {
      localStorage.setItem('mca_autoclose_notifs_v3', JSON.stringify(notifs));
    }
  } catch {
    // ignore
  }

  return true;
}

/**
 * Gera e baixa o arquivo de backup de registros em formato JSON
 */
export function exportProductionLogsBackupFile(
  logs: ProductionLog[],
  notifs: AutoCloseNotification[] = []
): { fileName: string; totalLogs: number } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  const secs = String(now.getSeconds()).padStart(2, '0');

  const fileName = `backup_mca_registros_producao_${year}-${month}-${day}_${hours}${mins}${secs}.json`;

  const backupData = {
    backupType: 'MCA_PRODUCTION_LOGS_BACKUP',
    version: '1.0',
    exportedAt: now.toISOString(),
    exportedAtFormatted: `${day}/${month}/${year} ${hours}:${mins}:${secs}`,
    totalLogs: logs.length,
    totalNotifs: notifs.length,
    logs,
    autoCloseNotifs: notifs,
  };

  const jsonStr = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  // Também guarda histórico de backup no LocalStorage por segurança adicional
  try {
    const backupKey = `mca_backup_${year}${month}${day}_${hours}${mins}${secs}`;
    localStorage.setItem(backupKey, jsonStr);
  } catch {
    // quota may be exceeded
  }

  return { fileName, totalLogs: logs.length };
}

/**
 * Seed initial dataset to Firestore or upgrade legacy mock records with the real 14 operators
 */
export async function seedInitialFirestoreDataIfEmpty(
  initialCollaborators: Collaborator[],
  initialActivities: ActivityItem[],
  initialShifts: ShiftConfig[],
  initialObservations: string[]
) {
  try {
    const colabsCol = collection(db, 'collaborators');
    const snap = await getDocs(colabsCol);
    
    // Check if empty OR contains legacy dummy records (e.g. "Valter Ribeiro (Líder)" or "Carlos Silva" with 10 items)
    let hasLegacyData = false;
    if (snap.empty) {
      hasLegacyData = true;
    } else {
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (
          data.name === 'Valter Ribeiro (Líder)' ||
          data.name === 'Marcos Oliveira' ||
          data.name === 'Lucas Mendes' ||
          data.name === 'Robson Santos' ||
          data.name === 'Danilo Costa'
        ) {
          hasLegacyData = true;
        }
      });
    }

    if (hasLegacyData) {
      console.log('Synchronizing official 14 factory collaborators and shift configuration to Firestore...');
      await saveCollaboratorsToFirestore(initialCollaborators);
      await saveActivitiesToFirestore(initialActivities);
      await saveShiftsToFirestore(initialShifts);
      await saveFactoryConfigToFirestore({
        toleranceMinutes: 60,
        observations: initialObservations,
        customRoleColors: {}
      });
    }
  } catch (err) {
    console.warn('Could not sync initial Firestore data (using local cache):', err);
  }
}
