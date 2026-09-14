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
        items.push({
          id: d.id,
          name: data.name || '',
          code: data.code || 't1',
          entrada: data.entrada || '08:00',
          saidaAlmoco: data.saidaAlmoco || '12:00',
          retornoAlmoco: data.retornoAlmoco || '13:00',
          saida: data.saida || '17:48',
          dias: data.dias || ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
          color: data.color || '#007BFF',
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

// === MUTATION HELPERS (Real-time writes) ===

export async function saveLogToFirestore(log: ProductionLog) {
  try {
    const docRef = doc(db, 'logs', log.id);
    const sanitized = sanitizeForFirestore({
      ...log,
      updatedAt: new Date().toISOString()
    });
    await setDoc(docRef, sanitized, { merge: true });
  } catch (err) {
    console.error('Error saving log to Firestore:', err);
  }
}

export async function deleteLogFromFirestore(logId: string) {
  try {
    const docRef = doc(db, 'logs', logId);
    await deleteDoc(docRef);
  } catch (err) {
    console.error('Error deleting log from Firestore:', err);
  }
}

export async function saveCollaboratorsToFirestore(collaborators: Collaborator[]) {
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
    console.error('Error saving collaborators to Firestore:', err);
  }
}

export async function saveActivitiesToFirestore(activities: ActivityItem[]) {
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
    console.error('Error saving activities to Firestore:', err);
  }
}

export async function saveShiftsToFirestore(shifts: ShiftConfig[]) {
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
    console.error('Error saving shifts to Firestore:', err);
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
      shifts.push({
        id: d.id,
        name: data.name || '',
        code: data.code || 't1',
        entrada: data.entrada || '08:00',
        saidaAlmoco: data.saidaAlmoco || '12:00',
        retornoAlmoco: data.retornoAlmoco || '13:00',
        saida: data.saida || '17:48',
        dias: data.dias || ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
        color: data.color || '#007BFF',
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
  try {
    const docRef = doc(db, 'factory_config', 'main_config');
    await setDoc(docRef, sanitizeForFirestore(config), { merge: true });
  } catch (err) {
    console.error('Error saving factory config to Firestore:', err);
  }
}

export async function saveAutoCloseNotifToFirestore(notif: AutoCloseNotification) {
  try {
    const docRef = doc(db, 'autoclose_notifs', notif.id);
    await setDoc(docRef, sanitizeForFirestore(notif), { merge: true });
  } catch (err) {
    console.error('Error saving auto close notif to Firestore:', err);
  }
}

export async function dismissAutoCloseNotifInFirestore(notifId: string) {
  try {
    const docRef = doc(db, 'autoclose_notifs', notifId);
    await deleteDoc(docRef);
  } catch (err) {
    console.error('Error dismissing auto close notif in Firestore:', err);
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
    console.error('Error clearing notifs in Firestore:', err);
  }
}

/**
 * Reseta exclusivamente os registros de produção (logs e notificações automáticas)
 * mantendo colaboradores, turnos, atividades, regras e configurações intactas.
 */
export async function resetProductionLogsInFirestore(): Promise<boolean> {
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

    // Limpar caches locais de logs também
    try {
      localStorage.setItem('mca_logs_v3', JSON.stringify([]));
      localStorage.setItem('mca_autoclose_notifs_v3', JSON.stringify([]));
    } catch {
      // ignore
    }

    return true;
  } catch (err) {
    console.error('Erro ao resetar registros de produção no Firestore:', err);
    throw err;
  }
}

/**
 * Restaura uma lista de logs de produção para o Firestore em batches seguros
 */
export async function restoreProductionLogsToFirestore(
  logs: ProductionLog[],
  notifs: AutoCloseNotification[] = []
): Promise<boolean> {
  try {
    const chunkSize = 350;
    
    // 1. Gravar Logs
    for (let i = 0; i < logs.length; i += chunkSize) {
      const batch = writeBatch(db);
      const chunk = logs.slice(i, i + chunkSize);
      chunk.forEach((l) => {
        const docRef = doc(db, 'logs', l.id);
        batch.set(docRef, sanitizeForFirestore(l), { merge: true });
      });
      await batch.commit();
    }

    // 2. Gravar Notificações se existirem
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
  } catch (err) {
    console.error('Erro ao restaurar logs para o Firestore:', err);
    throw err;
  }
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
