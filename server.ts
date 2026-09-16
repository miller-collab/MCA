import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// ============================================================================
// CLOUD RUN CENTRAL DATABASE ENGINE (PERSISTENCE & REAL-TIME SSE)
// ============================================================================
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'mca_central_database.json');
const BACKUP_FILE = path.join(DATA_DIR, 'mca_logs_backup.json');

interface CentralDatabase {
  collaborators: any[];
  shifts: any[];
  activities: any[];
  factoryConfig: {
    toleranceMinutes: number;
    efficiencyThresholdGreen: number;
    efficiencyThresholdYellow: number;
    observations: string[];
    customRoleColors: Record<string, string>;
  };
  logs: any[];
  autocloseNotifs: any[];
  lastUpdated: string;
}

const DEFAULT_COLLABORATORS = [
  { id: 'col-1', name: 'GERALDO', role: 'PREPARADOR TORNO AUTOMATICO', shift: 'Turno 1', active: true },
  { id: 'col-2', name: 'DIEGO', role: 'INSPETOR TCNC / OPERADOR', shift: 'Turno 1', active: true },
  { id: 'col-3', name: 'CARLOS', role: 'PREPARADOR DE FERRAMENTAS', shift: 'Turno 2', active: true },
  { id: 'col-4', name: 'EVANDRO', role: 'AREA DO CAVACO E OLEO', shift: 'Turno 1', active: true },
  { id: 'col-5', name: 'GABRIEL', role: 'PREPARADOR PROGAMADOR', shift: 'Turno 1', active: true },
  { id: 'col-6', name: 'ALEXANDER', role: 'INSPETOR / OPERADOR TA', shift: 'Turno 1', active: true },
  { id: 'col-7', name: 'WANDERSON', role: 'SISTEMA / AREA DO CAVACO E OLEO', shift: 'Turno 1', active: true },
  { id: 'col-8', name: 'ANSELMO', role: 'PREPARADOR TORNO AUTOMATICO', shift: 'Turno 1', active: true },
  { id: 'col-9', name: 'CRISTIAN', role: 'PREPARADOR DE FERRAMENTAS', shift: 'Turno 1', active: true },
  { id: 'col-10', name: 'IGOR', role: 'PREPARADOR PROGAMADOR', shift: 'Turno 1', active: true },
  { id: 'col-11', name: 'CLEMILSON', role: 'INSPETOR TCNC / OPERADOR', shift: 'Turno 1', active: true },
  { id: 'col-12', name: 'JULIO', role: 'SERVIÇOS GERAIS TORNO AUTOMATICO', shift: 'Turno 1', active: true },
  { id: 'col-13', name: 'VITOR', role: 'SERVIÇOS GERAIS TORNO AUTOMATICO', shift: 'Turno 1', active: true },
  { id: 'col-14', name: 'DANIEL', role: 'SERVIÇOS GERAIS TORNO AUTOMATICO', shift: 'Turno 1', active: true },
];

const DEFAULT_SHIFTS = [
  {
    id: 's1',
    name: 'Turno 1',
    code: 't1',
    entrada: '07:00',
    saidaAlmoco: '12:00',
    retornoAlmoco: '13:30',
    saida: '17:30',
    dias: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
    color: '#007BFF',
  },
  {
    id: 's2',
    name: 'Turno 2',
    code: 't2',
    entrada: '15:30',
    saidaAlmoco: '20:00',
    retornoAlmoco: '21:00',
    saida: '01:30',
    dias: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
    color: '#FF8C00',
  },
  {
    id: 's3',
    name: 'Turno 3',
    code: 't3',
    entrada: '20:00',
    saidaAlmoco: '02:00',
    retornoAlmoco: '03:00',
    saida: '06:00',
    dias: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
    color: '#9C27B0',
  },
];

const DEFAULT_OBSERVATIONS = [
  'Operação Concluída com Sucesso sem Anomalias',
  'Falta de Material / Barra de Matéria-Prima',
  'Ajuste / Troca de Inserto ou Ferramenta Quebrada',
  'Manutenção Mecânica / Elétrica do Torno',
  'Aguardando Liberação da Qualidade / Inspeção Metrológica',
  'Limpeza de Cavaco e Troca de Fluido de Corte',
  'Setup de Novo Lote de Produção',
  'Retrabalho de Lote Fora do Dimensional',
  'Parada Programada / Reunião 5S',
  'Queda de Energia / Ar Comprimido',
];

import { INITIAL_ACTIVITIES, INITIAL_OBSERVATIONS } from './src/data/initialData';

function getTodayPtBr(): string {
  // Always use America/Sao_Paulo (Horário de Brasília) for manufacturing date
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());
}

const DEFAULT_INITIAL_LOGS: any[] = [];
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const DAILY_BACKUPS_DIR = path.join(DATA_DIR, 'daily_backups');
const AUDIT_LOG_FILE = path.join(DATA_DIR, 'audit_production_events.log');

let centralDb: CentralDatabase;

function createBackupSnapshot(db: CentralDatabase) {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotFile = path.join(BACKUPS_DIR, `snapshot_${timestamp}.json`);
    fs.writeFileSync(snapshotFile, JSON.stringify(db, null, 2), 'utf-8');

    // Keep only last 30 snapshots to manage disk space cleanly
    const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.startsWith('snapshot_') && f.endsWith('.json')).sort();
    if (files.length > 30) {
      for (let i = 0; i < files.length - 30; i++) {
        try { fs.unlinkSync(path.join(BACKUPS_DIR, files[i])); } catch {}
      }
    }
  } catch (e) {
    console.error('Snapshot backup error:', e);
  }
}

// Daily automatic snapshot generator
function performDailyBackup(db: CentralDatabase): string {
  try {
    if (!fs.existsSync(DAILY_BACKUPS_DIR)) {
      fs.mkdirSync(DAILY_BACKUPS_DIR, { recursive: true });
    }
    const today = getTodayPtBr(); // "DD/MM/YYYY"
    const safeDate = today.replace(/\//g, '-');
    const dailyFile = path.join(DAILY_BACKUPS_DIR, `backup_diario_${safeDate}.json`);
    
    // Save daily backup payload
    const payload = {
      backupDate: today,
      generatedAt: new Date().toISOString(),
      logsCount: db.logs.length,
      collaboratorsCount: db.collaborators.length,
      database: db,
    };
    fs.writeFileSync(dailyFile, JSON.stringify(payload, null, 2), 'utf-8');
    return dailyFile;
  } catch (err) {
    console.error('Error performing daily backup:', err);
    return '';
  }
}

// Schedule daily backup check (every hour or upon startup)
let lastDailyBackupDate = '';
function checkAndRunDailyBackup(db: CentralDatabase) {
  const today = getTodayPtBr();
  if (lastDailyBackupDate !== today) {
    performDailyBackup(db);
    lastDailyBackupDate = today;
  }
}

function appendAuditLog(action: string, details: any) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      action,
      details,
    }) + '\n';
    fs.appendFileSync(AUDIT_LOG_FILE, entry, 'utf-8');
  } catch (e) {
    console.warn('Audit log write error:', e);
  }
}

function loadOrInitDatabase(): CentralDatabase {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.collaborators) && parsed.collaborators.length > 0) {
        // Keep all genuine production logs (filter out undefined or null entries)
        if (Array.isArray(parsed.logs)) {
          parsed.logs = parsed.logs.filter((l: any) => l && l.id);
        } else {
          parsed.logs = [];
        }

        // Ensure activities catalog is always populated with genuine factory activities
        if (!Array.isArray(parsed.activities) || parsed.activities.length === 0) {
          parsed.activities = INITIAL_ACTIVITIES;
        }

        // Ensure shifts are populated
        if (!Array.isArray(parsed.shifts) || parsed.shifts.length === 0) {
          parsed.shifts = DEFAULT_SHIFTS;
        }

        saveDatabaseToDisk(parsed);
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error loading central database from disk:', err);
  }

  const initial: CentralDatabase = {
    collaborators: DEFAULT_COLLABORATORS,
    shifts: DEFAULT_SHIFTS,
    activities: INITIAL_ACTIVITIES,
    factoryConfig: {
      toleranceMinutes: 60,
      efficiencyThresholdGreen: 85,
      efficiencyThresholdYellow: 70,
      observations: DEFAULT_OBSERVATIONS,
      customRoleColors: {},
    },
    logs: DEFAULT_INITIAL_LOGS,
    autocloseNotifs: [],
    lastUpdated: new Date().toISOString(),
  };

  saveDatabaseToDisk(initial);
  return initial;
}

function saveDatabaseToDisk(db: CentralDatabase) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    db.lastUpdated = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    // Maintain secondary persistent backup copy
    try {
      fs.writeFileSync(BACKUP_FILE, JSON.stringify(db.logs, null, 2), 'utf-8');
    } catch {
      // Ignore backup error
    }
  } catch (err) {
    console.error('Error saving central database to disk:', err);
  }
}

// SSE connected clients
const sseClients: express.Response[] = [];

function broadcastToClients(eventType: string, data: any) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(payload);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

centralDb = loadOrInitDatabase();

// Initial daily backup snapshot on boot & scheduled periodic check
checkAndRunDailyBackup(centralDb);
setInterval(() => {
  if (centralDb) {
    checkAndRunDailyBackup(centralDb);
  }
}, 1000 * 60 * 30); // Checks every 30 minutes

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      engine: 'mca-native-json-server',
      time: new Date().toISOString(),
      connectedClients: sseClients.length,
      totalLogs: centralDb.logs.length,
      collaboratorsCount: centralDb.collaborators.length,
    });
  });

  // ============================================================================
  // REAL-TIME SERVER-SENT EVENTS (SSE) STREAM
  // ============================================================================
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }
    res.write(`event: connected\ndata: {"time":"${new Date().toISOString()}"}\n\n`);
    sseClients.push(res);

    req.on('close', () => {
      const idx = sseClients.indexOf(res);
      if (idx !== -1) {
        sseClients.splice(idx, 1);
      }
    });
  });

  // ============================================================================
  // CENTRAL DATABASE SYNC REST ENDPOINTS
  // ============================================================================

  // 1. Get complete current database state
  app.get('/api/sync', (req, res) => {
    res.json({
      ...centralDb,
      serverTime: new Date().toISOString(),
    });
  });

  // 2. Save or update a production log
  app.post('/api/logs', (req, res) => {
    try {
      const log = req.body;
      if (!log || !log.id) {
        return res.status(400).json({ error: 'Log must have an id' });
      }
      const existingIdx = centralDb.logs.findIndex((l) => l.id === log.id);
      if (existingIdx >= 0) {
        centralDb.logs[existingIdx] = { ...centralDb.logs[existingIdx], ...log };
        appendAuditLog('UPDATE_LOG', log);
      } else {
        centralDb.logs.push(log);
        appendAuditLog('CREATE_LOG', log);
      }
      saveDatabaseToDisk(centralDb);
      createBackupSnapshot(centralDb);
      broadcastToClients('log_saved', log);
      return res.json({ success: true, log });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 2.1 Merge multiple logs (ensures historical recovery never overwrites)
  app.post('/api/logs/merge', (req, res) => {
    try {
      const incomingLogs = Array.isArray(req.body) ? req.body : req.body?.logs;
      if (!Array.isArray(incomingLogs)) {
        return res.status(400).json({ error: 'Body must contain a logs array' });
      }
      const existingMap = new Map<string, any>();
      for (const log of centralDb.logs) {
        if (log && log.id) existingMap.set(log.id, log);
      }
      let addedCount = 0;
      for (const log of incomingLogs) {
        if (!log || !log.id) continue;
        if (!existingMap.has(log.id)) {
          existingMap.set(log.id, log);
          addedCount++;
          appendAuditLog('MERGE_ADD_LOG', log);
        } else {
          const existing = existingMap.get(log.id);
          if (log.status === 'Concluída' && existing.status !== 'Concluída') {
            existingMap.set(log.id, { ...existing, ...log });
            appendAuditLog('MERGE_UPDATE_LOG', log);
          }
        }
      }
      centralDb.logs = Array.from(existingMap.values());
      saveDatabaseToDisk(centralDb);
      createBackupSnapshot(centralDb);
      broadcastToClients('logs_restored', centralDb.logs);
      return res.json({ success: true, count: centralDb.logs.length, addedCount });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 3. Delete a log
  app.delete('/api/logs/:id', (req, res) => {
    try {
      const { id } = req.params;
      appendAuditLog('DELETE_LOG', { id });
      centralDb.logs = centralDb.logs.filter((l) => l.id !== id);
      saveDatabaseToDisk(centralDb);
      broadcastToClients('log_deleted', { id });
      return res.json({ success: true, id });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 4. Save collaborators
  app.post('/api/collaborators', (req, res) => {
    try {
      const colabs = Array.isArray(req.body) ? req.body : req.body?.collaborators;
      if (!Array.isArray(colabs)) {
        return res.status(400).json({ error: 'Expected an array of collaborators' });
      }
      // Guarantee Turno 2 has ONLY CARLOS
      const sanitized = colabs.map((c: any) => {
        if (c.shift === 'Turno 2' && c.name !== 'CARLOS') {
          return { ...c, shift: 'Turno 1' };
        }
        return c;
      });
      centralDb.collaborators = sanitized;
      appendAuditLog('UPDATE_COLLABORATORS', { count: sanitized.length });
      saveDatabaseToDisk(centralDb);
      createBackupSnapshot(centralDb);
      broadcastToClients('collaborators_updated', sanitized);
      return res.json({ success: true, count: sanitized.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 5. Save shifts
  app.post('/api/shifts', (req, res) => {
    try {
      const shifts = Array.isArray(req.body) ? req.body : req.body?.shifts;
      if (!Array.isArray(shifts)) {
        return res.status(400).json({ error: 'Expected an array of shifts' });
      }
      centralDb.shifts = shifts;
      appendAuditLog('UPDATE_SHIFTS', { count: shifts.length });
      saveDatabaseToDisk(centralDb);
      createBackupSnapshot(centralDb);
      broadcastToClients('shifts_updated', shifts);
      return res.json({ success: true, count: shifts.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 6. Save activities
  app.post('/api/activities', (req, res) => {
    try {
      const activities = Array.isArray(req.body) ? req.body : req.body?.activities;
      if (!Array.isArray(activities)) {
        return res.status(400).json({ error: 'Expected an array of activities' });
      }
      centralDb.activities = activities;
      appendAuditLog('UPDATE_ACTIVITIES', { count: activities.length });
      saveDatabaseToDisk(centralDb);
      createBackupSnapshot(centralDb);
      broadcastToClients('activities_updated', activities);
      return res.json({ success: true, count: activities.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 7. Save factory config
  app.post('/api/factory-config', (req, res) => {
    try {
      const cfg = req.body;
      centralDb.factoryConfig = { ...centralDb.factoryConfig, ...cfg };
      appendAuditLog('UPDATE_FACTORY_CONFIG', cfg);
      saveDatabaseToDisk(centralDb);
      createBackupSnapshot(centralDb);
      broadcastToClients('config_updated', centralDb.factoryConfig);
      return res.json({ success: true, config: centralDb.factoryConfig });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 8. Reset production logs (with backup)
  app.post('/api/reset-logs', (req, res) => {
    try {
      // Save backup before clearing
      fs.writeFileSync(BACKUP_FILE, JSON.stringify(centralDb.logs, null, 2), 'utf-8');
      centralDb.logs = [];
      saveDatabaseToDisk(centralDb);
      broadcastToClients('logs_reset', { time: new Date().toISOString() });
      return res.json({ success: true, message: 'Production logs reset and backed up' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 9. Restore production logs from backup
  app.post('/api/restore-logs', (req, res) => {
    try {
      let restoredLogs = [];
      if (req.body && Array.isArray(req.body.logs) && req.body.logs.length > 0) {
        restoredLogs = req.body.logs;
      } else if (fs.existsSync(BACKUP_FILE)) {
        const raw = fs.readFileSync(BACKUP_FILE, 'utf-8');
        restoredLogs = JSON.parse(raw);
      }
      centralDb.logs = restoredLogs;
      saveDatabaseToDisk(centralDb);
      broadcastToClients('logs_restored', restoredLogs);
      return res.json({ success: true, count: restoredLogs.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 10. Save auto-close notification
  app.post('/api/autoclose-notif', (req, res) => {
    try {
      const notif = req.body;
      if (notif && notif.id) {
        const idx = centralDb.autocloseNotifs.findIndex((n) => n.id === notif.id);
        if (idx >= 0) {
          centralDb.autocloseNotifs[idx] = notif;
        } else {
          centralDb.autocloseNotifs.unshift(notif);
        }
        if (centralDb.autocloseNotifs.length > 50) {
          centralDb.autocloseNotifs = centralDb.autocloseNotifs.slice(0, 50);
        }
        saveDatabaseToDisk(centralDb);
        broadcastToClients('notif_updated', notif);
      }
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 11. Restore complete factory database (collaborators, shifts, activities, config, logs)
  app.post('/api/restore-full-backup', (req, res) => {
    try {
      const data = req.body;
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Payload de backup inválido' });
      }

      createBackupSnapshot(centralDb); // Salva snapshot antes de restaurar

      if (Array.isArray(data.collaborators) && data.collaborators.length > 0) {
        centralDb.collaborators = data.collaborators;
        broadcastToClients('collaborators_updated', centralDb.collaborators);
      }
      if (Array.isArray(data.shifts) && data.shifts.length > 0) {
        centralDb.shifts = data.shifts;
        broadcastToClients('shifts_updated', centralDb.shifts);
      }
      if (Array.isArray(data.activities) && data.activities.length > 0) {
        centralDb.activities = data.activities;
        broadcastToClients('activities_updated', centralDb.activities);
      }
      if (data.factoryConfig && typeof data.factoryConfig === 'object') {
        centralDb.factoryConfig = { ...centralDb.factoryConfig, ...data.factoryConfig };
        broadcastToClients('config_updated', centralDb.factoryConfig);
      }
      if (Array.isArray(data.logs)) {
        centralDb.logs = data.logs;
        broadcastToClients('logs_restored', centralDb.logs);
      }
      if (Array.isArray(data.autocloseNotifs)) {
        centralDb.autocloseNotifs = data.autocloseNotifs;
      }

      saveDatabaseToDisk(centralDb);
      appendAuditLog('RESTORE_FULL_BACKUP', {
        logsCount: centralDb.logs.length,
        colabsCount: centralDb.collaborators.length,
        shiftsCount: centralDb.shifts.length,
      });

      return res.json({
        success: true,
        message: 'Backup completo restaurado com sucesso no servidor e sincronizado com todos os tablets!',
        data: centralDb,
      });
    } catch (err: any) {
      console.error('Error in /api/restore-full-backup:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // 12. List available daily backups on the server
  app.get('/api/daily-backups', (req, res) => {
    try {
      if (!fs.existsSync(DAILY_BACKUPS_DIR)) {
        fs.mkdirSync(DAILY_BACKUPS_DIR, { recursive: true });
      }
      const files = fs.readdirSync(DAILY_BACKUPS_DIR)
        .filter(f => f.startsWith('backup_diario_') && f.endsWith('.json'))
        .sort()
        .reverse();

      const backups = files.map(file => {
        const filePath = path.join(DAILY_BACKUPS_DIR, file);
        const stats = fs.statSync(filePath);
        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          return {
            filename: file,
            backupDate: content.backupDate || file.replace('backup_diario_', '').replace('.json', '').replace(/-/g, '/'),
            generatedAt: content.generatedAt || stats.mtime.toISOString(),
            logsCount: content.logsCount || (content.database?.logs?.length || 0),
            collaboratorsCount: content.collaboratorsCount || (content.database?.collaborators?.length || 0),
            sizeBytes: stats.size,
          };
        } catch {
          return {
            filename: file,
            backupDate: file.replace('backup_diario_', '').replace('.json', '').replace(/-/g, '/'),
            generatedAt: stats.mtime.toISOString(),
            logsCount: 0,
            collaboratorsCount: 0,
            sizeBytes: stats.size,
          };
        }
      });

      return res.json({ success: true, backups });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 13. Trigger a manual or scheduled daily backup snapshot
  app.post('/api/daily-backups/create', (req, res) => {
    try {
      const createdFile = performDailyBackup(centralDb);
      return res.json({
        success: true,
        message: 'Backup diário gerado e guardado com sucesso no servidor!',
        file: path.basename(createdFile),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 14. Restore a specific past daily backup by filename
  app.post('/api/daily-backups/restore', (req, res) => {
    try {
      const { filename } = req.body;
      if (!filename || typeof filename !== 'string') {
        return res.status(400).json({ error: 'Nome do arquivo de backup obrigatório' });
      }
      const safeFilename = path.basename(filename);
      const filePath = path.join(DAILY_BACKUPS_DIR, safeFilename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Arquivo de backup diário não encontrado no servidor' });
      }

      createBackupSnapshot(centralDb); // Guarda snapshot de segurança antes de restaurar

      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const restoredDb = parsed.database || parsed;

      if (Array.isArray(restoredDb.collaborators)) {
        centralDb.collaborators = restoredDb.collaborators;
        broadcastToClients('collaborators_updated', centralDb.collaborators);
      }
      if (Array.isArray(restoredDb.shifts)) {
        centralDb.shifts = restoredDb.shifts;
        broadcastToClients('shifts_updated', centralDb.shifts);
      }
      if (Array.isArray(restoredDb.activities)) {
        centralDb.activities = restoredDb.activities;
        broadcastToClients('activities_updated', centralDb.activities);
      }
      if (restoredDb.factoryConfig && typeof restoredDb.factoryConfig === 'object') {
        centralDb.factoryConfig = { ...centralDb.factoryConfig, ...restoredDb.factoryConfig };
        broadcastToClients('config_updated', centralDb.factoryConfig);
      }
      if (Array.isArray(restoredDb.logs)) {
        centralDb.logs = restoredDb.logs;
        broadcastToClients('logs_restored', centralDb.logs);
      }
      if (Array.isArray(restoredDb.autocloseNotifs)) {
        centralDb.autocloseNotifs = restoredDb.autocloseNotifs;
      }

      saveDatabaseToDisk(centralDb);
      appendAuditLog('RESTORE_DAILY_BACKUP', { filename: safeFilename, logsCount: centralDb.logs.length });

      return res.json({
        success: true,
        message: `Backup do dia ${parsed.backupDate || safeFilename} restaurado com sucesso! Sincronizado com todos os tablets.`,
        data: centralDb,
      });
    } catch (err: any) {
      console.error('Error in /api/daily-backups/restore:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // AI Leader Diagnosis & Operational Insights Endpoint
  const handleShiftDiagnostic = async (req: express.Request, res: express.Response) => {
    try {
      const { efficiency, kpis, date, totalOperators } = req.body;

      // Helper for contextual fallback diagnosis
      const generateHeuristicDiagnostic = (isQuotaExceeded = false) => {
        const effList = Array.isArray(efficiency) ? efficiency : [];
        const avgEff = effList.length > 0
          ? Math.round(effList.reduce((acc: number, curr: any) => acc + (Number(curr.efficiencyPercent) || 0), 0) / effList.length)
          : 82;
        
        let rating: 'Excelente' | 'Boa' | 'Atenção' | 'Crítica' = 'Boa';
        if (avgEff >= 90) rating = 'Excelente';
        else if (avgEff >= 75) rating = 'Boa';
        else if (avgEff >= 60) rating = 'Atenção';
        else rating = 'Crítica';

        const highPerformers = effList.filter((e: any) => (e.efficiencyPercent || 0) >= 80).map((e: any) => e.operatorName);
        const lowPerformers = effList.filter((e: any) => (e.efficiencyPercent || 0) < 65).map((e: any) => e.operatorName);

        return {
          summary: `Diagnóstico Operacional do Turno (${date || 'Hoje'}): Eficiência média da equipe calculada em ${avgEff}%, com ${kpis?.executando || 0} atividades em execução e ${kpis?.concluidas || 0} concluídas.${isQuotaExceeded ? ' (Modo de contingência analítica ativo)' : ''}`,
          overallScore: avgEff,
          efficiencyRating: rating,
          highlights: [
            highPerformers.length > 0 ? `Destaque operacional para os postos com alta taxa de ocupação: ${highPerformers.slice(0, 3).join(', ')}.` : 'Apontamento contínuo nas células de usinagem e tornos.',
            `Total de ${kpis?.concluidas || 0} ordens finalizadas no período avaliado.`,
            'Ritmo produtivo e cumprimento das rotinas de chão de fábrica mantidos.'
          ],
          bottlenecks: [
            lowPerformers.length > 0 ? `Atenção aos postos com apontamento reduzido ou ociosidade: ${lowPerformers.slice(0, 3).join(', ')}.` : 'Variação no tempo de troca de ferramentas / setup.',
            'Monitorar intervalos entre encerramento de tarefas e novo apontamento.'
          ],
          actionPlan: [
            'Realizar alinhamento com os operadores em células de menor ocupação para identificar travas técnicas.',
            'Priorizar liberação de ferramental e controle metrológico na ferramentaria.',
            'Garantir registro em tempo real das paradas não programadas.'
          ],
          leanRecommendations: [
            'Padronização do checklist 5S e abastecimento preventivo no início de turno.',
            'Implementação de rotina SMED para redução do tempo de setup nos tornos.'
          ]
        };
      };

      if (!process.env.GEMINI_API_KEY) {
        return res.status(200).json(generateHeuristicDiagnostic(false));
      }

      try {
        const ai = getGenAI();

        const prompt = `Você é um Engenheiro de Produção Especialista em Lean Manufacturing, Six Sigma e Sistema MES para Chão de Fábrica de Usinagem e Metalmecânica (Tornos Automáticos, TCNC, Ferramentaria, Área de Cavaco e Óleo).
Analise os seguintes dados reais de produção do dia ${date || 'Hoje'}:

DADOS DE EFICIÊNCIA DOS OPERADORES:
${JSON.stringify(efficiency || [], null, 2)}

METRICAS KPI GERAIS:
${JSON.stringify(kpis || {}, null, 2)}

Total de Operadores Ativos: ${totalOperators || 10}

Por favor, forneça um diagnóstico executivo em JSON estruturado com os seguintes campos:
1. summary (resumo executivo claro e direto em 2 a 3 frases)
2. overallScore (nota de 0 a 100 da produtividade geral da equipe)
3. efficiencyRating (uma das opções: 'Excelente', 'Boa', 'Atenção', 'Crítica')
4. highlights (lista de 3 a 5 pontos fortes e metas atingidas no turno)
5. bottlenecks (lista de 2 a 4 gargalos, desvios ou riscos operacionais detectados)
6. actionPlan (lista de 3 a 5 ações imediatas recomendadas para o Líder de Produção)
7. leanRecommendations (lista de 2 a 3 sugestões de melhoria contínua Kaizen / SMED / 5S)

Retorne SOMENTE o JSON válido sem blocos markdown adicionais.`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const responseText = response.text || '{}';
        let parsed = {};
        try {
          parsed = JSON.parse(responseText.trim());
        } catch (e) {
          const clean = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
          parsed = JSON.parse(clean);
        }

        return res.json(parsed);
      } catch (geminiError: any) {
        console.warn('Gemini API quota or service notification:', geminiError?.message || geminiError);
        return res.status(200).json(generateHeuristicDiagnostic(true));
      }
    } catch (error: any) {
      console.error('Shift analysis general error:', error);
      return res.status(200).json({
        summary: 'Diagnóstico operacional consolidado do chão de fábrica.',
        overallScore: 80,
        efficiencyRating: 'Boa',
        highlights: ['Produção ativa mantida nos postos de usinagem.'],
        bottlenecks: ['Verificar apontamentos manuais com atraso.'],
        actionPlan: ['Revisar tarefas abertas com o líder de turno.'],
        leanRecommendations: ['Padronização das trocas de turno e 5S.']
      });
    }
  };

  app.post('/api/ai/shift-diagnostic', handleShiftDiagnostic);
  app.post('/api/gemini/analyze-shift', handleShiftDiagnostic);

  // Vite middleware for dev or static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MCA Factory MES Server running on port ${PORT}`);
  });
}

startServer();
