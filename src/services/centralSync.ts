import { ActivityItem, Collaborator, ProductionLog, ShiftConfig } from '../types';

export interface CentralSyncState {
  collaborators: Collaborator[];
  shifts: ShiftConfig[];
  activities: ActivityItem[];
  factoryConfig: {
    toleranceMinutes: number;
    efficiencyThresholdGreen: number;
    efficiencyThresholdYellow: number;
    observations: string[];
    customRoleColors: Record<string, string>;
  };
  logs: ProductionLog[];
  autocloseNotifs: any[];
  serverTime: string;
}

type SyncListener<T> = (data: T) => void;

class CentralSyncService {
  private logListeners: Set<SyncListener<ProductionLog[]>> = new Set();
  private singleLogListeners: Set<SyncListener<{ action: 'save' | 'delete'; log?: ProductionLog; id?: string }>> = new Set();
  private collaboratorListeners: Set<SyncListener<Collaborator[]>> = new Set();
  private shiftListeners: Set<SyncListener<ShiftConfig[]>> = new Set();
  private activityListeners: Set<SyncListener<ActivityItem[]>> = new Set();
  private configListeners: Set<SyncListener<any>> = new Set();
  private eventSource: EventSource | null = null;
  private reconnectTimeout: any = null;
  private isConnecting = false;

  constructor() {
    this.initSSE();
  }

  private initSSE() {
    if (typeof window === 'undefined' || !window.EventSource) return;
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {
        // Ignore
      }
    }

    try {
      this.isConnecting = true;
      this.eventSource = new EventSource('/api/events');

      this.eventSource.addEventListener('connected', () => {
        // SSE connection established
        this.isConnecting = false;
      });

      this.eventSource.addEventListener('log_saved', (e) => {
        try {
          const log: ProductionLog = JSON.parse(e.data);
          this.singleLogListeners.forEach((fn) => fn({ action: 'save', log }));
        } catch (err) {
          console.error('Failed to parse SSE log_saved event', err);
        }
      });

      this.eventSource.addEventListener('log_deleted', (e) => {
        try {
          const { id } = JSON.parse(e.data);
          this.singleLogListeners.forEach((fn) => fn({ action: 'delete', id }));
        } catch (err) {
          console.error('Failed to parse SSE log_deleted event', err);
        }
      });

      this.eventSource.addEventListener('collaborators_updated', (e) => {
        try {
          const colabs: Collaborator[] = JSON.parse(e.data);
          this.collaboratorListeners.forEach((fn) => fn(colabs));
        } catch (err) {
          console.error('Failed to parse SSE collaborators_updated', err);
        }
      });

      this.eventSource.addEventListener('shifts_updated', (e) => {
        try {
          const shifts: ShiftConfig[] = JSON.parse(e.data);
          this.shiftListeners.forEach((fn) => fn(shifts));
        } catch (err) {
          console.error('Failed to parse SSE shifts_updated', err);
        }
      });

      this.eventSource.addEventListener('activities_updated', (e) => {
        try {
          const activities: ActivityItem[] = JSON.parse(e.data);
          this.activityListeners.forEach((fn) => fn(activities));
        } catch (err) {
          console.error('Failed to parse SSE activities_updated', err);
        }
      });

      this.eventSource.addEventListener('config_updated', (e) => {
        try {
          const config = JSON.parse(e.data);
          this.configListeners.forEach((fn) => fn(config));
        } catch (err) {
          console.error('Failed to parse SSE config_updated', err);
        }
      });

      this.eventSource.addEventListener('logs_reset', () => {
        this.fetchFullSync().then((state) => {
          if (state) this.logListeners.forEach((fn) => fn(state.logs));
        });
      });

      this.eventSource.addEventListener('logs_restored', (e) => {
        try {
          const logs: ProductionLog[] = JSON.parse(e.data);
          this.logListeners.forEach((fn) => fn(logs));
        } catch (err) {
          console.error('Failed to parse SSE logs_restored', err);
        }
      });

      this.eventSource.onerror = () => {
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }
        if (!this.reconnectTimeout) {
          this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            this.initSSE();
          }, 4000);
        }
      };
    } catch (err) {
      console.warn('Central SSE setup notice:', err);
    }
  }

  // API Call to fetch complete initial database state
  async fetchFullSync(): Promise<CentralSyncState | null> {
    try {
      const res = await fetch('/api/sync', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data: CentralSyncState = await res.json();
      return data;
    } catch (err) {
      console.warn('Failed to fetch full sync from Cloud Run:', err);
      return null;
    }
  }

  // Mutators
  async saveLog(log: ProductionLog): Promise<void> {
    try {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log),
      });
    } catch (err) {
      console.warn('Failed to save log to Cloud Run:', err);
    }
  }

  async deleteLog(id: string): Promise<void> {
    try {
      await fetch(`/api/logs/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.warn('Failed to delete log from Cloud Run:', err);
    }
  }

  async saveCollaborators(colabs: Collaborator[]): Promise<void> {
    try {
      await fetch('/api/collaborators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(colabs),
      });
    } catch (err) {
      console.warn('Failed to save collaborators to Cloud Run:', err);
    }
  }

  async saveShifts(shifts: ShiftConfig[]): Promise<void> {
    try {
      await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shifts),
      });
    } catch (err) {
      console.warn('Failed to save shifts to Cloud Run:', err);
    }
  }

  async saveActivities(activities: ActivityItem[]): Promise<void> {
    try {
      await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activities),
      });
    } catch (err) {
      console.warn('Failed to save activities to Cloud Run:', err);
    }
  }

  async saveFactoryConfig(config: any): Promise<void> {
    try {
      await fetch('/api/factory-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
    } catch (err) {
      console.warn('Failed to save factory config to Cloud Run:', err);
    }
  }

  async resetLogs(): Promise<void> {
    try {
      await fetch('/api/reset-logs', { method: 'POST' });
    } catch (err) {
      console.warn('Failed to reset logs on Cloud Run:', err);
    }
  }

  async restoreLogs(logs?: ProductionLog[]): Promise<void> {
    try {
      await fetch('/api/restore-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs }),
      });
    } catch (err) {
      console.warn('Failed to restore logs on Cloud Run:', err);
    }
  }

  async restoreFullBackup(fullBackupPayload: any): Promise<boolean> {
    try {
      const res = await fetch('/api/restore-full-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullBackupPayload),
      });
      return res.ok;
    } catch (err) {
      console.warn('Failed to restore full backup on Cloud Run:', err);
      return false;
    }
  }

  async saveMasterSnapshot(payload: any): Promise<boolean> {
    try {
      const res = await fetch('/api/master-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch (err) {
      console.warn('Failed to save master snapshot to server:', err);
      return false;
    }
  }

  async saveAutoCloseNotif(notif: any): Promise<void> {
    try {
      await fetch('/api/autoclose-notif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notif),
      });
    } catch (err) {
      console.warn('Failed to save autoclose notif to Cloud Run:', err);
    }
  }

  // Subscriptions
  onCollaborators(fn: SyncListener<Collaborator[]>): () => void {
    this.collaboratorListeners.add(fn);
    return () => this.collaboratorListeners.delete(fn);
  }

  onShifts(fn: SyncListener<ShiftConfig[]>): () => void {
    this.shiftListeners.add(fn);
    return () => this.shiftListeners.delete(fn);
  }

  onActivities(fn: SyncListener<ActivityItem[]>): () => void {
    this.activityListeners.add(fn);
    return () => this.activityListeners.delete(fn);
  }

  onConfig(fn: SyncListener<any>): () => void {
    this.configListeners.add(fn);
    return () => this.configListeners.delete(fn);
  }

  onLogs(fn: SyncListener<ProductionLog[]>): () => void {
    this.logListeners.add(fn);
    return () => this.logListeners.delete(fn);
  }

  onSingleLogChange(fn: SyncListener<{ action: 'save' | 'delete'; log?: ProductionLog; id?: string }>): () => void {
    this.singleLogListeners.add(fn);
    return () => this.singleLogListeners.delete(fn);
  }
}

export const centralSync = new CentralSyncService();
