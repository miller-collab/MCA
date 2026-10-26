/**
 * CENTRAL SYNC (VERSÃO FIRESTORE)
 * --------------------------------
 * Antes: os dados ficavam num arquivo JSON dentro do servidor (Cloud Run), que é apagado
 * quando o servidor reinicia, e o app ainda gravava em mais dois lugares ao mesmo tempo.
 * Agora: o Firestore (nuvem do Google) é a ÚNICA fonte de dados. Cada tablet escuta o
 * Firestore em tempo real e grava só o item que mudou (um documento por item).
 *
 * A interface pública (nomes dos métodos) é a mesma de antes, então o App.tsx continua igual.
 */
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebaseClient';
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

type Listener<T> = (data: T) => void;
type ListKind = 'colabs' | 'shifts' | 'acts' | 'notifs';

const COLS = {
  logs: 'logs',
  colabs: 'mca_collaborators',
  shifts: 'mca_shifts',
  acts: 'mca_activities',
  notifs: 'autoclose_notifs',
} as const;

const CONFIG_PATH: [string, string] = ['mca_config', 'factory'];
const META_PATH: [string, string] = ['mca_meta', 'seeded_v1'];

// ---------- utilitários ----------
function clean<T>(v: T): T {
  // Firestore não aceita "undefined"; isso remove esses campos.
  return JSON.parse(JSON.stringify(v));
}

function stable(v: any): string {
  // JSON com chaves em ordem fixa, para comparar objetos sem falso "mudou".
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}

function keyOf(item: any): string {
  const k = item && (item.id ?? item.name);
  return k === undefined || k === null ? '' : String(k).replace(/\//g, '_');
}

function stripOrder<T = any>(item: any): T {
  const { __order, ...rest } = item || {};
  return rest as T;
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Aguarda a gravação quando há internet; sem internet, deixa na fila do Firestore e segue. */
async function settle(p: Promise<any>): Promise<void> {
  if (isOffline()) {
    p.catch(() => {});
    return;
  }
  try {
    await p;
  } catch (err) {
    console.warn('Falha ao gravar no Firestore:', err);
  }
}

class CentralSyncService {
  private known: Record<'logs' | ListKind, Map<string, any>> = {
    logs: new Map(),
    colabs: new Map(),
    shifts: new Map(),
    acts: new Map(),
    notifs: new Map(),
  };
  private config: any = null;
  private ready: Record<string, boolean> = {};

  private logListeners = new Set<Listener<ProductionLog[]>>();
  private singleLogListeners = new Set<Listener<{ action: 'save' | 'delete'; log?: ProductionLog; id?: string }>>();
  private listListeners: Record<ListKind, Set<Listener<any[]>>> = {
    colabs: new Set(),
    shifts: new Set(),
    acts: new Set(),
    notifs: new Set(),
  };
  private configListeners = new Set<Listener<any>>();
  private masterListeners = new Set<Listener<CentralSyncState>>();
  private notifClearedListeners = new Set<Listener<any[]>>();
  private notifDeletedListeners = new Set<Listener<string>>();
  private masterTimer: any = null;
  private seeding: Promise<void> | null = null;

  constructor() {
    if (typeof window !== 'undefined') this.start();
  }

  // ---------- escuta em tempo real ----------
  private start() {
    this.watchLogs();
    this.watchList('colabs');
    this.watchList('shifts');
    this.watchList('acts');
    this.watchList('notifs');
    this.watchConfig();
  }

  private watchLogs() {
    onSnapshot(
      collection(db, COLS.logs),
      (snap) => {
        const first = !this.ready.logs;
        this.ready.logs = true;
        snap.docChanges().forEach((ch) => {
          const id = ch.doc.id;
          if (ch.type === 'removed') {
            this.known.logs.delete(id);
            if (!first) this.singleLogListeners.forEach((fn) => fn({ action: 'delete', id }));
          } else {
            const raw = ch.doc.data() as any;
            const log = { ...raw, id: raw.id ?? id } as ProductionLog;
            this.known.logs.set(id, log);
            if (!first) this.singleLogListeners.forEach((fn) => fn({ action: 'save', log }));
          }
        });
        const all = Array.from(this.known.logs.values());
        this.logListeners.forEach((fn) => fn(all));
      },
      (err) => console.warn('Erro ao escutar logs:', err.message)
    );
  }

  private watchList(kind: ListKind) {
    onSnapshot(
      collection(db, COLS[kind]),
      (snap) => {
        this.ready[kind] = true;
        const prev = this.known[kind];
        const next = new Map<string, any>();
        snap.docs.forEach((d) => next.set(d.id, d.data()));
        this.known[kind] = next;

        if (kind === 'notifs') {
          prev.forEach((_v, id) => {
            if (!next.has(id)) this.notifDeletedListeners.forEach((fn) => fn(id));
          });
          if (prev.size > 0 && next.size === 0) this.notifClearedListeners.forEach((fn) => fn([]));
        }

        const list = this.list(kind);
        this.listListeners[kind].forEach((fn) => fn(list));
        this.scheduleMaster();
      },
      (err) => console.warn('Erro ao escutar ' + kind + ':', err.message)
    );
  }

  private watchConfig() {
    onSnapshot(
      doc(db, CONFIG_PATH[0], CONFIG_PATH[1]),
      (snap) => {
        this.ready.config = true;
        if (snap.exists()) {
          const { updatedAt, ...cfg } = snap.data() as any;
          this.config = cfg;
          this.configListeners.forEach((fn) => fn(cfg));
          this.scheduleMaster();
        }
      },
      (err) => console.warn('Erro ao escutar config:', err.message)
    );
  }

  /** Lista na ordem original (campo __order), sem o campo interno. */
  private list(kind: ListKind): any[] {
    const items = Array.from(this.known[kind].values());
    items.sort((a, b) => {
      const ao = typeof a.__order === 'number' ? a.__order : 1e9;
      const bo = typeof b.__order === 'number' ? b.__order : 1e9;
      return ao - bo;
    });
    return items.map(stripOrder);
  }

  private buildState(): CentralSyncState {
    return {
      collaborators: this.list('colabs'),
      shifts: this.list('shifts'),
      activities: this.list('acts'),
      factoryConfig: this.config || ({} as any),
      logs: Array.from(this.known.logs.values()),
      autocloseNotifs: this.list('notifs'),
      serverTime: new Date().toISOString(),
    };
  }

  /** Avisa quem escuta o "estado completo". Não dispara a cada log, só em colaboradores/turnos/atividades/config/avisos. */
  private scheduleMaster() {
    if (this.masterListeners.size === 0) return;
    if (!(this.ready.colabs && this.ready.shifts && this.ready.acts)) return;
    if (this.masterTimer) clearTimeout(this.masterTimer);
    this.masterTimer = setTimeout(() => {
      this.masterTimer = null;
      const state = this.buildState();
      this.masterListeners.forEach((fn) => fn(state));
    }, 500);
  }

  // ---------- leitura completa (consulta direta) ----------
  async fetchFullSync(): Promise<CentralSyncState | null> {
    try {
      const [logs, colabs, shifts, acts, notifs, cfg] = await Promise.all([
        getDocs(collection(db, COLS.logs)),
        getDocs(collection(db, COLS.colabs)),
        getDocs(collection(db, COLS.shifts)),
        getDocs(collection(db, COLS.acts)),
        getDocs(collection(db, COLS.notifs)),
        getDoc(doc(db, CONFIG_PATH[0], CONFIG_PATH[1])),
      ]);
      const ordered = (snap: any) =>
        snap.docs
          .map((d: any) => d.data())
          .sort((a: any, b: any) => (a.__order ?? 1e9) - (b.__order ?? 1e9))
          .map(stripOrder);
      let factoryConfig: any = {};
      if (cfg.exists()) {
        const { updatedAt, ...rest } = cfg.data() as any;
        factoryConfig = rest;
      }
      return {
        collaborators: ordered(colabs),
        shifts: ordered(shifts),
        activities: ordered(acts),
        factoryConfig,
        logs: logs.docs.map((d) => ({ ...(d.data() as any), id: (d.data() as any).id ?? d.id })),
        autocloseNotifs: notifs.docs.map((d) => d.data()),
        serverTime: new Date().toISOString(),
      };
    } catch (err) {
      console.warn('Falha ao ler dados do Firestore:', err);
      return null;
    }
  }

  // ---------- gravação ----------
  private async commit(ops: Array<(b: ReturnType<typeof writeBatch>) => void>) {
    for (let i = 0; i < ops.length; i += 400) {
      const b = writeBatch(db);
      ops.slice(i, i + 400).forEach((op) => op(b));
      await settle(b.commit());
    }
  }

  /**
   * Grava uma lista inteira, mas só mexe no que mudou:
   *  - grava os itens novos/alterados;
   *  - apaga apenas o que ESTE tablet já conhecia e agora não está mais na lista.
   * Assim, dois tablets editando itens diferentes não se sobrescrevem.
   */
  private async saveList(kind: ListKind, list: any[]) {
    const col = COLS[kind];
    const known = this.known[kind];
    const next = new Map<string, any>();
    (list || []).forEach((item, i) => {
      const k = keyOf(item);
      if (k) next.set(k, { ...clean(item), __order: i });
    });
    const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
    next.forEach((item, k) => {
      const old = known.get(k);
      if (!old || stable(old) !== stable(item)) ops.push((b) => b.set(doc(db, col, k), item));
    });
    known.forEach((_v, k) => {
      if (!next.has(k)) ops.push((b) => b.delete(doc(db, col, k)));
    });
    if (ops.length) await this.commit(ops);
  }

  async saveLog(log: ProductionLog): Promise<void> {
    const k = keyOf(log);
    if (!k) return;
    await settle(setDoc(doc(db, COLS.logs, k), { ...clean(log), updatedAt: new Date().toISOString() }));
  }

  async deleteLog(id: string): Promise<void> {
    if (!id) return;
    await settle(deleteDoc(doc(db, COLS.logs, String(id).replace(/\//g, '_'))));
  }

  saveCollaborators(colabs: Collaborator[]) { return this.saveList('colabs', colabs); }
  saveShifts(shifts: ShiftConfig[]) { return this.saveList('shifts', shifts); }
  saveActivities(acts: ActivityItem[]) { return this.saveList('acts', acts); }

  async saveFactoryConfig(config: any): Promise<void> {
    if (!config) return;
    const data = clean({ ...config, updatedAt: new Date().toISOString() });
    // mergeFields: troca por inteiro só os campos enviados (não mistura mapas antigos com novos)
    await settle(setDoc(doc(db, CONFIG_PATH[0], CONFIG_PATH[1]), data, { mergeFields: Object.keys(data) }));
  }

  async saveAutoCloseNotif(notif: any): Promise<void> {
    const k = keyOf(notif);
    if (!k) return;
    await settle(setDoc(doc(db, COLS.notifs, k), clean(notif), { merge: true }));
  }

  async deleteAutoCloseNotif(id: string): Promise<void> {
    if (!id) return;
    await settle(deleteDoc(doc(db, COLS.notifs, String(id).replace(/\//g, '_'))));
  }

  async clearAutoCloseNotifs(): Promise<void> {
    try {
      const snap = await getDocs(collection(db, COLS.notifs));
      await this.commit(snap.docs.map((d) => (b: ReturnType<typeof writeBatch>) => b.delete(d.ref)));
    } catch (err) {
      console.warn('Falha ao limpar avisos:', err);
    }
  }

  async resetLogs(): Promise<void> {
    try {
      const snap = await getDocs(collection(db, COLS.logs));
      await this.commit(snap.docs.map((d) => (b: ReturnType<typeof writeBatch>) => b.delete(d.ref)));
    } catch (err) {
      console.warn('Falha ao zerar logs:', err);
    }
  }

  async restoreLogs(logs?: ProductionLog[]): Promise<void> {
    const ops = (logs || [])
      .filter((l) => l && keyOf(l))
      .map((l) => (b: ReturnType<typeof writeBatch>) => b.set(doc(db, COLS.logs, keyOf(l)), clean(l)));
    if (ops.length) await this.commit(ops);
  }

  async restoreFullBackup(payload: any): Promise<boolean> {
    try {
      if (!payload || typeof payload !== 'object') return false;
      if (Array.isArray(payload.collaborators) && payload.collaborators.length) await this.saveList('colabs', payload.collaborators);
      if (Array.isArray(payload.shifts) && payload.shifts.length) await this.saveList('shifts', payload.shifts);
      if (Array.isArray(payload.activities) && payload.activities.length) await this.saveList('acts', payload.activities);
      if (Array.isArray(payload.logs)) await this.restoreLogs(payload.logs);
      if (payload.factoryConfig && Object.keys(payload.factoryConfig).length) await this.saveFactoryConfig(payload.factoryConfig);
      return true;
    } catch (err) {
      console.warn('Falha ao restaurar backup:', err);
      return false;
    }
  }

  // O "snapshot mestre" antigo era a principal causa de conflito entre tablets (um documento gigante
  // reescrito por todos). Agora cada item é gravado separadamente, então isto não grava mais nada.
  async saveMasterSnapshot(_payload: any): Promise<boolean> {
    return true;
  }

  // ---------- migração única dos dados antigos + dados iniciais ----------
  /**
   * Roda uma vez só (marcada em mca_meta/seeded_v1). Copia os dados antigos
   * (master_snapshot do Firestore e/ou servidor) para a nova estrutura. Se não houver
   * nada antigo, grava os dados iniciais do app.
   */
  migrateAndSeed(initial: { colabs?: any[]; acts?: any[]; shifts?: any[]; observations?: string[] }): Promise<void> {
    if (this.seeding) return this.seeding;
    this.seeding = (async () => {
      try {
        const metaRef = doc(db, META_PATH[0], META_PATH[1]);
        const meta = await getDocFromServer(metaRef);
        if (meta.exists()) return;

        const legacyCurrent = await getDocFromServer(doc(db, 'master_snapshot', 'current'))
          .then((s) => (s.exists() ? (s.data() as any) : null))
          .catch(() => null);
        const legacyList = (name: string) =>
          getDocFromServer(doc(db, 'master_snapshot', name))
            .then((s) => (s.exists() && Array.isArray((s.data() as any).list) ? (s.data() as any).list : null))
            .catch(() => null);
        const legacyConfig = await getDocFromServer(doc(db, 'master_snapshot', 'config'))
          .then((s) => (s.exists() ? (s.data() as any) : null))
          .catch(() => null);
        const server: any = await fetch('/api/sync', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);

        const firstFilled = (...opts: any[]) => opts.find((o) => Array.isArray(o) && o.length > 0) || [];

        const targets: Array<[ListKind, any[]]> = [
          ['colabs', firstFilled(await legacyList('collaborators'), legacyCurrent?.collaborators, server?.collaborators, initial.colabs)],
          ['shifts', firstFilled(await legacyList('shifts'), legacyCurrent?.shifts, server?.shifts, initial.shifts)],
          ['acts', firstFilled(await legacyList('activities'), legacyCurrent?.activities, server?.activities, initial.acts)],
        ];
        for (const [kind, items] of targets) {
          const existing = await getDocsFromServer(collection(db, COLS[kind]));
          if (existing.empty && items.length) {
            const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
            items.forEach((item, i) => {
              const k = keyOf(item);
              if (k) ops.push((b) => b.set(doc(db, COLS[kind], k), { ...clean(item), __order: i }));
            });
            await this.commit(ops);
          }
        }

        // logs antigos que só existiam no snapshot mestre ou no servidor
        const existingLogs = await getDocsFromServer(collection(db, COLS.logs));
        const have = new Set(existingLogs.docs.map((d) => d.id));
        const oldLogs: any[] = [...(legacyCurrent?.logs || []), ...(server?.logs || [])];
        const seen = new Set<string>();
        const logOps: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
        oldLogs.forEach((l) => {
          const k = keyOf(l);
          if (k && !have.has(k) && !seen.has(k)) {
            seen.add(k);
            logOps.push((b) => b.set(doc(db, COLS.logs, k), clean(l)));
          }
        });
        if (logOps.length) await this.commit(logOps);

        // configuração
        const cfgSnap = await getDocFromServer(doc(db, CONFIG_PATH[0], CONFIG_PATH[1]));
        if (!cfgSnap.exists()) {
          const oldCfg = legacyConfig || legacyCurrent?.factoryConfig || server?.factoryConfig || {};
          const { updatedAt, ...rest } = oldCfg;
          const cfg = { toleranceMinutes: 60, observations: initial.observations || [], ...rest };
          await this.saveFactoryConfig(cfg);
        }

        await setDoc(metaRef, { migratedAt: new Date().toISOString() });
      } catch (err) {
        console.warn('Migração/dados iniciais adiada (sem internet?):', err);
        this.seeding = null; // tenta de novo na próxima abertura
      }
    })();
    return this.seeding;
  }

  // ---------- assinaturas ----------
  private subscribeList(kind: ListKind, fn: Listener<any[]>): () => void {
    this.listListeners[kind].add(fn);
    if (this.ready[kind]) {
      const current = this.list(kind);
      queueMicrotask(() => fn(current));
    }
    return () => this.listListeners[kind].delete(fn);
  }

  onCollaborators(fn: Listener<Collaborator[]>) { return this.subscribeList('colabs', fn); }
  onShifts(fn: Listener<ShiftConfig[]>) { return this.subscribeList('shifts', fn); }
  onActivities(fn: Listener<ActivityItem[]>) { return this.subscribeList('acts', fn); }
  onNotifs(fn: Listener<any[]>) { return this.subscribeList('notifs', fn); }

  onConfig(fn: Listener<any>): () => void {
    this.configListeners.add(fn);
    if (this.ready.config && this.config) {
      const cfg = this.config;
      queueMicrotask(() => fn(cfg));
    }
    return () => this.configListeners.delete(fn);
  }

  onLogs(fn: Listener<ProductionLog[]>): () => void {
    this.logListeners.add(fn);
    if (this.ready.logs) {
      const all = Array.from(this.known.logs.values());
      queueMicrotask(() => fn(all));
    }
    return () => this.logListeners.delete(fn);
  }

  onSingleLogChange(fn: Listener<{ action: 'save' | 'delete'; log?: ProductionLog; id?: string }>): () => void {
    this.singleLogListeners.add(fn);
    return () => this.singleLogListeners.delete(fn);
  }

  onSingleLog(fn: Listener<{ action: 'save' | 'delete'; log?: ProductionLog; id?: string }>): () => void {
    return this.onSingleLogChange(fn);
  }

  onMaster(fn: Listener<CentralSyncState>): () => void {
    this.masterListeners.add(fn);
    this.scheduleMaster();
    return () => this.masterListeners.delete(fn);
  }

  onNotifsCleared(fn: Listener<any[]>): () => void {
    this.notifClearedListeners.add(fn);
    return () => this.notifClearedListeners.delete(fn);
  }

  onNotifDeleted(fn: Listener<string>): () => void {
    this.notifDeletedListeners.add(fn);
    return () => this.notifDeletedListeners.delete(fn);
  }
}

export const centralSync = new CentralSyncService();
