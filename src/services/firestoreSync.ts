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
      if (!snapshot.empty) {
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
          });
        });
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
      if (!snapshot.empty) {
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
      if (!snapshot.empty) {
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
        });
      }
    });
  } catch (err) {
    console.warn('Failed to subscribe factory config:', err);
    return () => {};
  }
}

// 6. Subscribe to Auto-Close Notifications
export function subscribeToAutoCloseNotifs(
  onUpdate: (notifs: AutoCloseNotification[]) => void
) {
  try {
    const notifsCol = collection(db, 'autoclose_notifs');
    return onSnapshot(notifsCol, (snapshot) => {
      const items: AutoCloseNotification[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        items.push({
          id: d.id,
          logId: data.logId || '',
          collaboratorName: data.collaboratorName || '',
          role: data.role || '',
          activity: data.activity || '',
          shiftName: data.shiftName || '',
          shiftEnd: data.shiftEnd || '',
          date: data.date || '',
          timestamp: Number(data.timestamp) || Date.now(),
          readByOperator: data.readByOperator,
          readByLeader: data.readByLeader,
        });
      });
      items.sort((a, b) => b.timestamp - a.timestamp);
      onUpdate(items);
    });
  } catch (err) {
    console.warn('Failed to subscribe auto-close notifs:', err);
    return () => {};
  }
}

// === MUTATION HELPERS (Real-time writes) ===

export async function saveLogToFirestore(log: ProductionLog) {
  try {
    const docRef = doc(db, 'logs', log.id);
    await setDoc(docRef, {
      ...log,
      updatedAt: new Date().toISOString()
    }, { merge: true });
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
      batch.set(docRef, c, { merge: true });
    });
    await batch.commit();
  } catch (err) {
    console.error('Error saving collaborators to Firestore:', err);
  }
}

export async function saveActivitiesToFirestore(activities: ActivityItem[]) {
  try {
    const batch = writeBatch(db);
    activities.forEach((a) => {
      const docRef = doc(db, 'activities', a.id);
      batch.set(docRef, a, { merge: true });
    });
    await batch.commit();
  } catch (err) {
    console.error('Error saving activities to Firestore:', err);
  }
}

export async function saveShiftsToFirestore(shifts: ShiftConfig[]) {
  try {
    const batch = writeBatch(db);
    shifts.forEach((s) => {
      const docRef = doc(db, 'shifts', s.id);
      batch.set(docRef, s, { merge: true });
    });
    await batch.commit();
  } catch (err) {
    console.error('Error saving shifts to Firestore:', err);
  }
}

export async function saveFactoryConfigToFirestore(config: Partial<FactoryConfigState>) {
  try {
    const docRef = doc(db, 'factory_config', 'main_config');
    await setDoc(docRef, config, { merge: true });
  } catch (err) {
    console.error('Error saving factory config to Firestore:', err);
  }
}

export async function saveAutoCloseNotifToFirestore(notif: AutoCloseNotification) {
  try {
    const docRef = doc(db, 'autoclose_notifs', notif.id);
    await setDoc(docRef, notif, { merge: true });
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
 * Seed initial dataset to Firestore if collections are empty.
 */
export async function seedInitialFirestoreDataIfEmpty(
  initialCollaborators: Collaborator[],
  initialActivities: ActivityItem[],
  initialShifts: ShiftConfig[],
  initialObservations: string[]
) {
  try {
    const colabsCol = collection(db, 'collaborators');
    const snap = await getDocs(query(colabsCol, limit(1)));
    if (snap.empty) {
      console.log('Seeding initial manufacturing floor data to Firestore...');
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
    console.warn('Could not seed initial Firestore data (using local cache):', err);
  }
}
