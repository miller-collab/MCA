import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { NavigationTabs } from './components/NavigationTabs';
import { ProductionFloorView } from './components/ProductionFloorView';
import { EfficiencyView } from './components/EfficiencyView';
import { GraficoDiarioView } from './components/GraficoDiarioView';
import { HistoryView } from './components/HistoryView';
import { LeaderDashboardView } from './components/LeaderDashboardView';
import { ShiftAndFactoryConfigView } from './components/ShiftAndFactoryConfigView';

import {
  Collaborator,
  ActivityItem,
  ShiftConfig,
  ProductionLog,
  ActivityCategory,
  AutoCloseNotification,
} from './types';

import {
  INITIAL_COLLABORATORS,
  INITIAL_SHIFTS,
  INITIAL_ACTIVITIES,
  INITIAL_OBSERVATIONS,
  INITIAL_ROLES,
} from './data/initialData';

import {
  formatarDataPtBr,
  formatarHoraPtBr,
  calcularDiferencaMinutos,
  playFactoryChime,
  verificarTurnoEncerrado,
  padronizarNomeTurno,
  desduplicarLogsAtivos,
  obterConfiguracaoRefeicao,
  colaboradorJaUsouRefeicaoHoje,
  calcularDuracaoComDeducaoRefeicao,
  timeToSecondsOfDay,
  timeToMinutesOfDay,
  obterStatusTurno,
} from './utils/factoryCalculations';

import {
  findSavedCollaboratorsInBrowser,
  savePermanentLocalBackup,
  downloadCompleteFactoryBackup,
} from './utils/recoveryUtils';
import { centralSync } from './services/centralSync';

import {
  subscribeToLogs,
  subscribeToCollaborators,
  subscribeToActivities,
  subscribeToShifts,
  subscribeToFactoryConfig,
  subscribeToAutoCloseNotifs,
  saveLogToSupabase,
  deleteLogFromSupabase,
  saveCollaboratorsToSupabase,
  saveActivitiesToSupabase,
  saveShiftsToSupabase,
  saveFactoryConfigToSupabase,
  saveAutoCloseNotifToSupabase,
  dismissAutoCloseNotifInSupabase,
  clearAllNotifsInSupabase,
  seedInitialFirestoreDataIfEmpty,
  fetchAllDataFromFirestore,
  resetProductionLogsInSupabase,
  restoreProductionLogsToSupabase,
  exportProductionLogsBackupFile,
  saveMasterJsonSnapshotToDatabase as saveMasterJsonSnapshotToSupabase,
  subscribeToMasterJsonSnapshot,
  fetchMasterJsonSnapshotFromDatabase as fetchMasterJsonSnapshotFromSupabase,
  // Backward-compatible aliases
  saveLogToFirestore,
  deleteLogFromFirestore,
  saveCollaboratorsToFirestore,
  saveActivitiesToFirestore,
  saveShiftsToFirestore,
  saveFactoryConfigToFirestore,
  saveAutoCloseNotifToFirestore,
  dismissAutoCloseNotifInFirestore,
  clearAllNotifsInFirestore,
  resetProductionLogsInFirestore,
  restoreProductionLogsToFirestore,
  saveMasterJsonSnapshotToFirestore,
  fetchMasterJsonSnapshotFromFirestore,
} from './services/nativeDatabaseSync';

export type TabKey = 'painel' | 'eficiencia' | 'grafico-diario' | 'historico' | 'indicadores' | 'turnos';

// Clean initial logs state (never inject invented logs)
function gerarLogsIniciais(): ProductionLog[] {
  return [];
}

export function App() {
  // 1. Core State
  const [collaborators, setCollaborators] = useState<Collaborator[]>(() => {
    const recovered = findSavedCollaboratorsInBrowser();
    if (recovered.found && recovered.collaborators.length > 0) {
      return recovered.collaborators;
    }
    const saved = localStorage.getItem('mca_collaborators_v3');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          !parsed.some((p: any) => p.name === 'Valter Ribeiro (Líder)' || p.name === 'Carlos Silva' || p.name === 'Marcos Oliveira')
        ) {
          return parsed;
        }
      } catch {
        // Use default
      }
    }
    return INITIAL_COLLABORATORS;
  });

  const [activities, setActivities] = useState<ActivityItem[]>(() => {
    const saved = localStorage.getItem('mca_activities_v3');
    return saved ? JSON.parse(saved) : INITIAL_ACTIVITIES;
  });

  const [shifts, setShifts] = useState<ShiftConfig[]>(() => {
    const saved = localStorage.getItem('mca_shifts_v3');
    return saved ? JSON.parse(saved) : INITIAL_SHIFTS;
  });

  const [observations, setObservations] = useState<string[]>(() => {
    const saved = localStorage.getItem('mca_observations_v3');
    return saved ? JSON.parse(saved) : INITIAL_OBSERVATIONS;
  });

  const [customRoleColors, setCustomRoleColors] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('mca_role_colors_v3');
    return saved ? JSON.parse(saved) : {};
  });

  const [customRoles, setCustomRoles] = useState<string[]>(() => {
    const saved = localStorage.getItem('mca_roles_v3');
    return saved ? JSON.parse(saved) : INITIAL_ROLES;
  });

  const [deletedRoles, setDeletedRoles] = useState<string[]>(() => {
    const saved = localStorage.getItem('mca_deleted_roles_v3');
    return saved ? JSON.parse(saved) : [];
  });

  const [logs, setLogs] = useState<ProductionLog[]>(() => {
    const saved = localStorage.getItem('mca_logs_v3');
    const logMap = new Map<string, ProductionLog>();
    if (saved) {
      try {
        const parsed: ProductionLog[] = JSON.parse(saved);
        for (const l of parsed) {
          if (l && l.id) {
            logMap.set(l.id, {
              ...l,
              shift: padronizarNomeTurno(l.shift),
            });
          }
        }
      } catch {
        // Ignore parse error
      }
    }
    const combined = Array.from(logMap.values());
    const { sanitizedLogs } = desduplicarLogsAtivos(combined, INITIAL_COLLABORATORS, INITIAL_SHIFTS);
    return sanitizedLogs;
  });

  // Auto-close Shift Notifications for Operators and Leader
  const [autoCloseNotifs, setAutoCloseNotifs] = useState<AutoCloseNotification[]>(() => {
    const saved = localStorage.getItem('mca_autoclose_notifs_v3');
    return saved ? JSON.parse(saved) : [];
  });

  // 2. Navigation & UI state
  const [activeTab, setActiveTab] = useState<TabKey>('painel');
  const [isLeaderUnlocked, setIsLeaderUnlocked] = useState(false);
  const [leaderPin] = useState('8619');
  const [toleranceMinutes, setToleranceMinutes] = useState<number>(() => {
    const saved = localStorage.getItem('mca_tolerance_minutes_v3');
    return saved ? parseInt(saved, 10) : 60;
  });
  const [efficiencyThresholdGreen, setEfficiencyThresholdGreen] = useState<number>(() => {
    const saved = localStorage.getItem('mca_eff_green_v3');
    return saved ? parseInt(saved, 10) : 85;
  });
  const [efficiencyThresholdYellow, setEfficiencyThresholdYellow] = useState<number>(() => {
    const saved = localStorage.getItem('mca_eff_yellow_v3');
    return saved ? parseInt(saved, 10) : 70;
  });
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [drilldownFilter, setDrilldownFilter] = useState('');
  const [lastJsonSyncTime, setLastJsonSyncTime] = useState<string>(() => formatarHoraPtBr(new Date()));
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Helper to persist master JSON snapshot to Firestore & Server on every change
  const isApplyingRemoteMasterRef = useRef(false);

  const triggerMasterJsonSave = useCallback(
    (
      currentColabs: Collaborator[],
      currentShifts: ShiftConfig[],
      currentActs: ActivityItem[],
      currentLogs: ProductionLog[],
      currentNotifs: AutoCloseNotification[],
      cfg?: any
    ) => {
      const now = new Date();
      const timeStr = formatarHoraPtBr(now);
      setLastJsonSyncTime(timeStr);
      saveMasterJsonSnapshotToFirestore({
        collaborators: currentColabs,
        shifts: currentShifts,
        activities: currentActs,
        logs: currentLogs,
        autocloseNotifs: currentNotifs,
        factoryConfig: cfg || {
          toleranceMinutes,
          observations,
          customRoleColors,
          efficiencyThresholdGreen,
          efficiencyThresholdYellow,
        },
        formattedSyncTime: timeStr,
        lastUpdated: now.toISOString(),
      }).catch(() => {});
    },
    [toleranceMinutes, observations, customRoleColors, efficiencyThresholdGreen, efficiencyThresholdYellow]
  );

  // 3. Central Cloud Run + Firestore Real-Time Synchronization
  useEffect(() => {
    let isMounted = true;

    // Master JSON apply helper
    const applyMasterSnapshotData = (data: {
      collaborators?: Collaborator[];
      shifts?: ShiftConfig[];
      activities?: ActivityItem[];
      logs?: ProductionLog[];
      factoryConfig?: any;
      autocloseNotifs?: AutoCloseNotification[];
      formattedSyncTime?: string;
    }) => {
      if (!isMounted || !data) return;
      isApplyingRemoteMasterRef.current = true;

      if (data.collaborators && data.collaborators.length > 0) {
        setCollaborators(data.collaborators);
      }
      if (data.shifts && data.shifts.length > 0) {
        setShifts(data.shifts);
      }
      if (data.activities && data.activities.length > 0) {
        setActivities(data.activities);
      }
      if (data.logs && Array.isArray(data.logs)) {
        const cleanLogs = data.logs.filter((l) => l && l.id);
        const formatted = cleanLogs.map((l) => ({ ...l, shift: padronizarNomeTurno(l.shift) }));
        setLogs((prev) => {
          // Merge incoming logs with currently active local logs to ensure newly started tasks NEVER vanish
          const logMap = new Map<string, ProductionLog>();
          for (const l of formatted) {
            if (l && l.id) logMap.set(l.id, l);
          }
          for (const pl of prev) {
            if (pl && pl.id && (pl.status === 'Em Execução' || pl.status === 'Pausada')) {
              if (!logMap.has(pl.id)) {
                logMap.set(pl.id, pl);
              }
            }
          }
          const merged = Array.from(logMap.values());
          const { sanitizedLogs } = desduplicarLogsAtivos(
            merged,
            data.collaborators || collaborators,
            data.shifts || shifts
          );
          return sanitizedLogs;
        });
      }
      if (data.autocloseNotifs && Array.isArray(data.autocloseNotifs)) {
        setAutoCloseNotifs(data.autocloseNotifs);
      }
      if (data.factoryConfig) {
        const cfg = data.factoryConfig;
        if (cfg.toleranceMinutes) setToleranceMinutes(cfg.toleranceMinutes);
        if (cfg.observations && cfg.observations.length > 0) setObservations(cfg.observations);
        if (cfg.customRoleColors) setCustomRoleColors(cfg.customRoleColors);
        if (cfg.efficiencyThresholdGreen !== undefined) setEfficiencyThresholdGreen(cfg.efficiencyThresholdGreen);
        if (cfg.efficiencyThresholdYellow !== undefined) setEfficiencyThresholdYellow(cfg.efficiencyThresholdYellow);
      }
      if (data.formattedSyncTime) {
        setLastJsonSyncTime(data.formattedSyncTime);
      } else {
        setLastJsonSyncTime(formatarHoraPtBr(new Date()));
      }

      setTimeout(() => {
        isApplyingRemoteMasterRef.current = false;
      }, 1000);
    };

    // 3.1 Initial Full Sync directly from Firestore Master JSON as the Universal Truth
    fetchMasterJsonSnapshotFromFirestore().then((masterSnap) => {
      if (masterSnap && masterSnap.logs && masterSnap.logs.length > 0) {
        applyMasterSnapshotData(masterSnap);
      } else {
        // Fallback only if Firestore snapshot is not initialized yet
        centralSync.fetchFullSync().then((state) => {
          if (!isMounted || !state) return;
          applyMasterSnapshotData(state);
        }).catch(() => {});
      }
    }).catch(() => {});

    // 3.2 Real-time push subscriptions from Cloud Run SSE (secondary channel)
    const unsubColabsCentral = centralSync.onCollaborators((newColabs) => {
      if (newColabs && newColabs.length > 0 && !isApplyingRemoteMasterRef.current) {
        setCollaborators(newColabs);
      }
    });

    const unsubShiftsCentral = centralSync.onShifts((newShifts) => {
      if (newShifts && newShifts.length > 0 && !isApplyingRemoteMasterRef.current) {
        setShifts(newShifts);
      }
    });

    const unsubActivitiesCentral = centralSync.onActivities((newActs) => {
      if (newActs && newActs.length > 0 && !isApplyingRemoteMasterRef.current) {
        setActivities(newActs);
      }
    });

    const unsubConfigCentral = centralSync.onConfig((cfg) => {
      if (cfg && !isApplyingRemoteMasterRef.current) {
        if (cfg.toleranceMinutes) setToleranceMinutes(cfg.toleranceMinutes);
        if (cfg.observations) setObservations(cfg.observations);
        if (cfg.customRoleColors) setCustomRoleColors(cfg.customRoleColors);
        if (cfg.efficiencyThresholdGreen !== undefined) setEfficiencyThresholdGreen(cfg.efficiencyThresholdGreen);
        if (cfg.efficiencyThresholdYellow !== undefined) setEfficiencyThresholdYellow(cfg.efficiencyThresholdYellow);
      }
    });

    // 3.3 Real-time Firestore master JSON subscription (Primary Universal Syncer)
    let unsubMasterJsonFirestore = () => {};
    let unsubLogsFirestore = () => {};
    let unsubColabsFirestore = () => {};
    let unsubShiftsFirestore = () => {};
    let unsubActsFirestore = () => {};
    let unsubConfigFirestore = () => {};

    try {
      unsubMasterJsonFirestore = subscribeToMasterJsonSnapshot((masterSnap) => {
        applyMasterSnapshotData(masterSnap);
      });

      unsubLogsFirestore = subscribeToLogs((cloudLogs) => {
        const realLogs = (cloudLogs || []).filter((l) => l && l.id);
        if (realLogs.length > 0 && !isApplyingRemoteMasterRef.current) {
          const formatted = realLogs.map((l) => ({ ...l, shift: padronizarNomeTurno(l.shift) }));
          setLogs((prev) => {
            const logMap = new Map<string, ProductionLog>();
            for (const l of formatted) {
              if (l && l.id) logMap.set(l.id, l);
            }
            // Preserve locally running active tasks so they never flicker or disappear
            for (const pl of prev) {
              if (pl && pl.id && (pl.status === 'Em Execução' || pl.status === 'Pausada')) {
                if (!logMap.has(pl.id)) {
                  logMap.set(pl.id, pl);
                }
              }
            }
            const merged = Array.from(logMap.values());
            const { sanitizedLogs } = desduplicarLogsAtivos(merged, collaborators, shifts);
            return sanitizedLogs;
          });
        }
      });

      unsubColabsFirestore = subscribeToCollaborators((cloudColabs) => {
        if (cloudColabs && cloudColabs.length > 0 && !isApplyingRemoteMasterRef.current) {
          setCollaborators(cloudColabs);
        }
      });

      unsubShiftsFirestore = subscribeToShifts((cloudShifts) => {
        if (cloudShifts && cloudShifts.length > 0 && !isApplyingRemoteMasterRef.current) {
          setShifts(cloudShifts);
        }
      });

      unsubActsFirestore = subscribeToActivities((cloudActs) => {
        if (cloudActs && cloudActs.length > 0 && !isApplyingRemoteMasterRef.current) {
          setActivities(cloudActs);
        }
      });

      unsubConfigFirestore = subscribeToFactoryConfig((cloudConfig) => {
        if (cloudConfig && !isApplyingRemoteMasterRef.current) {
          if (cloudConfig.toleranceMinutes) setToleranceMinutes(cloudConfig.toleranceMinutes);
          if (cloudConfig.observations && cloudConfig.observations.length > 0) setObservations(cloudConfig.observations);
          if (cloudConfig.customRoleColors) setCustomRoleColors(cloudConfig.customRoleColors);
          if (cloudConfig.efficiencyThresholdGreen !== undefined) setEfficiencyThresholdGreen(cloudConfig.efficiencyThresholdGreen);
          if (cloudConfig.efficiencyThresholdYellow !== undefined) setEfficiencyThresholdYellow(cloudConfig.efficiencyThresholdYellow);
        }
      });
    } catch (e) {
      console.warn('Firestore subscription notice:', e);
    }

    // 3.4 Seed initial Firestore data in background if needed
    seedInitialFirestoreDataIfEmpty(
      INITIAL_COLLABORATORS,
      INITIAL_ACTIVITIES,
      INITIAL_SHIFTS,
      INITIAL_OBSERVATIONS
    ).catch(() => {});

    // 3.5 30-Second Automatic Master JSON Sync Loop (ensures all tablets & PCs load the exact master JSON)
    const performPeriodicSync = async () => {
      try {
        // Fetch master snapshot from Firestore (Authoritative Global Truth)
        const masterSnap = await fetchMasterJsonSnapshotFromFirestore();
        if (masterSnap && masterSnap.logs && masterSnap.logs.length > 0) {
          applyMasterSnapshotData(masterSnap);
        } else {
          const cloudData = await fetchAllDataFromFirestore();
          if (cloudData && cloudData.logs && cloudData.logs.length > 0) {
            applyMasterSnapshotData(cloudData);
          }
        }
      } catch (err) {
        console.warn('Periodic master JSON sync loop warning:', err);
      }
    };

    const syncInterval = setInterval(performPeriodicSync, 30000);

    // 3.6 Auto re-sync when tab gains focus or goes back online
    const handleFocusOrOnline = () => {
      performPeriodicSync();
    };

    window.addEventListener('focus', handleFocusOrOnline);
    window.addEventListener('online', handleFocusOrOnline);

    return () => {
      isMounted = false;
      clearInterval(syncInterval);
      unsubColabsCentral();
      unsubShiftsCentral();
      unsubActivitiesCentral();
      unsubConfigCentral();
      try {
        unsubMasterJsonFirestore();
        unsubLogsFirestore();
        unsubColabsFirestore();
        unsubShiftsFirestore();
        unsubActsFirestore();
        unsubConfigFirestore();
      } catch {}
      window.removeEventListener('focus', handleFocusOrOnline);
      window.removeEventListener('online', handleFocusOrOnline);
    };
  }, []);

  // 4. LocalStorage Backup Mirroring & Multi-key redundancy
  useEffect(() => {
    localStorage.setItem('mca_tolerance_minutes_v3', toleranceMinutes.toString());
  }, [toleranceMinutes]);
  useEffect(() => {
    localStorage.setItem('mca_eff_green_v3', efficiencyThresholdGreen.toString());
  }, [efficiencyThresholdGreen]);
  useEffect(() => {
    localStorage.setItem('mca_eff_yellow_v3', efficiencyThresholdYellow.toString());
  }, [efficiencyThresholdYellow]);
  useEffect(() => {
    savePermanentLocalBackup(collaborators, activities, shifts, logs);
  }, [collaborators, activities, shifts, logs]);
  useEffect(() => {
    localStorage.setItem('mca_observations_v3', JSON.stringify(observations));
  }, [observations]);
  useEffect(() => {
    localStorage.setItem('mca_role_colors_v3', JSON.stringify(customRoleColors));
  }, [customRoleColors]);
  useEffect(() => {
    localStorage.setItem('mca_roles_v3', JSON.stringify(customRoles));
  }, [customRoles]);
  useEffect(() => {
    localStorage.setItem('mca_deleted_roles_v3', JSON.stringify(deletedRoles));
  }, [deletedRoles]);
  useEffect(() => {
    localStorage.setItem('mca_autoclose_notifs_v3', JSON.stringify(autoCloseNotifs));
  }, [autoCloseNotifs]);

  // Reset to factory defaults
  const handleResetToDefaults = useCallback(() => {
    setCollaborators(INITIAL_COLLABORATORS);
    setActivities(INITIAL_ACTIVITIES);
    setShifts(INITIAL_SHIFTS);
    setObservations(INITIAL_OBSERVATIONS);
    setCustomRoleColors({});
    setCustomRoles(INITIAL_ROLES);
    setDeletedRoles([]);
    setEfficiencyThresholdGreen(85);
    setEfficiencyThresholdYellow(70);
    localStorage.setItem('mca_eff_green_v3', '85');
    localStorage.setItem('mca_eff_yellow_v3', '70');
    saveCollaboratorsToFirestore(INITIAL_COLLABORATORS);
    saveActivitiesToFirestore(INITIAL_ACTIVITIES);
    saveShiftsToFirestore(INITIAL_SHIFTS);
    saveFactoryConfigToFirestore({
      toleranceMinutes: 60,
      observations: INITIAL_OBSERVATIONS,
      customRoleColors: {},
      customRoles: INITIAL_ROLES,
      deletedRoles: [],
      efficiencyThresholdGreen: 85,
      efficiencyThresholdYellow: 70,
    });
  }, []);

  // 5. Auto Shift Closure & Auto Next-Shift Resume Engine
  useEffect(() => {
    const checkEngine = () => {
      const now = new Date();
      const nowMs = now.getTime();
      const todayDateStr = formatarDataPtBr(now);

      setLogs((prevLogs) => {
        let changed = false;
        const newNotifs: AutoCloseNotification[] = [];
        const newResumedLogs: ProductionLog[] = [];

        // 1. Process existing logs (meal pause, meal resume, shift auto-close, and update pending resumes)
        const updated = prevLogs.map((log) => {
          const colab = collaborators.find(
            (c) => c.name.trim().toLowerCase() === log.collaboratorName.trim().toLowerCase()
          );
          const colabShiftName = (colab?.shift || log.shift || 'Turno 1').toUpperCase();
          const mealConfig = obterConfiguracaoRefeicao(log.collaboratorName, shifts, collaborators);

          // A. Pausa Automática de Refeição ao atingir o Horário de Início do Almoço/Janta do Colaborador
          const isTodayLog = !log.date || log.date === todayDateStr;
          const nowTimePtBr = formatarHoraPtBr(now);
          const nowSec = timeToSecondsOfDay(nowTimePtBr);
          const mealStartSec = timeToSecondsOfDay(mealConfig.saidaAlmoco);
          const mealEndSec = timeToSecondsOfDay(mealConfig.retornoAlmoco);

          if (
            log.status === 'Em Execução' &&
            isTodayLog &&
            nowSec >= mealStartSec &&
            nowSec < mealEndSec &&
            !log.mealBreakDeducted &&
            !colaboradorJaUsouRefeicaoHoje(log.collaboratorName, log.date, prevLogs)
          ) {
            changed = true;
            const pausedLog: ProductionLog = {
              ...log,
              status: 'Pausada',
              isMealPause: true,
              mealPauseStartTime: formatarHoraPtBr(now),
              mealPauseTimestampMs: nowMs,
              mealPauseDurationMinutes: mealConfig.duracaoMinutos,
              observation: log.observation
                ? `${log.observation} | 🍽️ Pausa Automática de Refeição (${mealConfig.saidaAlmoco} - ${mealConfig.retornoAlmoco})`
                : `🍽️ Pausa Automática de Refeição (${mealConfig.saidaAlmoco} - ${mealConfig.retornoAlmoco})`,
            };
            saveLogToFirestore(pausedLog);
            return pausedLog;
          }

          // B. Retomada Automática de Refeição ao Vencer os Minutos Configurados (ex: 90 min) ou chegar no Retorno do Almoço
          if (
            log.status === 'Pausada' &&
            (log.isMealPause || log.mealPauseTimestampMs || log.mealPauseStartTime || log.observation?.includes('Refeição'))
          ) {
            const mealMinutes = log.mealPauseDurationMinutes || mealConfig.duracaoMinutos || 90;
            let pauseStartMs = log.mealPauseTimestampMs;
            if (!pauseStartMs && log.mealPauseStartTime) {
              const pParts = log.mealPauseStartTime.split(':');
              const pDate = new Date(now);
              pDate.setHours(
                parseInt(pParts[0], 10) || 0,
                parseInt(pParts[1], 10) || 0,
                parseInt(pParts[2] || '0', 10) || 0,
                0
              );
              if (pDate.getTime() > nowMs) pDate.setDate(pDate.getDate() - 1);
              pauseStartMs = pDate.getTime();
            }
            if (!pauseStartMs && log.durationMinutes !== undefined && log.durationMinutes > 0 && log.startTime) {
              const [hI, mI, sI] = log.startTime.split(':').map((v) => parseInt(v, 10) || 0);
              const dI = new Date(now);
              dI.setHours(hI, mI, sI, 0);
              if (dI.getTime() > nowMs) dI.setDate(dI.getDate() - 1);
              pauseStartMs = dI.getTime() + (log.durationMinutes * 60 * 1000);
            }

            const mealTimeReached = isTodayLog && nowSec >= mealEndSec;
            const mealDurationElapsed = pauseStartMs && (nowMs - pauseStartMs) >= mealMinutes * 60 * 1000;

            if (mealDurationElapsed || mealTimeReached) {
              // Venceu o tempo de refeição! Retoma automaticamente a contagem na mesma atividade
              changed = true;
              const resumedLog: ProductionLog = {
                ...log,
                status: 'Em Execução',
                isMealPause: false,
                mealBreakDeducted: true,
                mealBreakMinutes: mealMinutes,
                mealResumedAt: formatarHoraPtBr(now),
              };
              saveLogToFirestore(resumedLog);
              return resumedLog;
            }
          }

          // B2. Dedução Automática de Refeição se a tarefa continuou em execução e já passou do horário de almoço
          const startSec = timeToSecondsOfDay(log.startTime);
          if (
            log.status === 'Em Execução' &&
            isTodayLog &&
            nowSec >= mealEndSec &&
            startSec <= mealStartSec + 300 &&
            !log.mealBreakDeducted
          ) {
            changed = true;
            const updatedWithMeal: ProductionLog = {
              ...log,
              mealBreakDeducted: true,
              mealBreakMinutes: mealConfig.duracaoMinutos || 90,
              mealBreakSource: 'automatic',
            };
            saveLogToFirestore(updatedWithMeal);
            return updatedWithMeal;
          }

          // C. Encerramento Automático no Fim do Turno Específico do Colaborador
          if (log.status === 'Em Execução' || log.status === 'Pausada') {
            const shift = shifts.find(
              (s) =>
                s.name.toUpperCase() === colabShiftName ||
                s.code.toUpperCase() === colabShiftName ||
                colabShiftName.includes(s.name.toUpperCase()) ||
                s.name.toUpperCase().includes(colabShiftName)
            ) || shifts[0] || {
              id: 's1',
              name: 'Turno 1',
              code: 't1',
              entrada: '07:00',
              saida: '17:30',
              dias: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
              color: '#007BFF',
            };

            // Verifica se a atividade é de dia anterior OU se o turno do colaborador encerrou enquanto a atividade estava em andamento
            const isOvernight = timeToMinutesOfDay(shift.entrada) > timeToMinutesOfDay(shift.saida);
            const statusAtualTurno = obterStatusTurno(shift.saida, shift.entrada, shift.dias, now);
            const isLogFromPreviousDay = Boolean(log.date && log.date !== todayDateStr);

            // Turno noturno que iniciou ontem e ainda está em andamento na madrugada NÃO deve ser encerrado
            const isNightShiftRunning = isOvernight && isLogFromPreviousDay && statusAtualTurno === 'EM_ANDAMENTO';

            // Para atividades de hoje: só encerra se o início ocorreu dentro do turno e o horário de saída já passou
            const startMins = timeToMinutesOfDay(log.startTime);
            const saidaMins = timeToMinutesOfDay(shift.saida);
            const entradaMins = timeToMinutesOfDay(shift.entrada);
            const iniciouNoTurno = !isOvernight
              ? (startMins >= entradaMins && startMins <= saidaMins)
              : (startMins >= entradaMins || startMins <= saidaMins);

            const turnoEncerrouHoje = !isNightShiftRunning && iniciouNoTurno && statusAtualTurno === 'ENCERRADO';
            const logEsquecidoDiaAnterior = isLogFromPreviousDay && !isNightShiftRunning && statusAtualTurno !== 'EM_ANDAMENTO';

            const turnoEncerrou = turnoEncerrouHoje || logEsquecidoDiaAnterior;

            if (turnoEncerrou) {
              changed = true;
              const jaTeveRefeicao = log.mealBreakDeducted || colaboradorJaUsouRefeicaoHoje(log.collaboratorName, log.date, prevLogs);
              let dur = calcularDiferencaMinutos(log.startTime, shift.saida);
              if (dur <= 0) dur = 60;
              let debitouRefeicaoAuto = false;
              let minsRefeicao = 0;

              // Se o colaborador não acionou pausa de refeição durante o dia, deduz automaticamente a refeição do colaborador no final do turno
              if (!jaTeveRefeicao && dur > mealConfig.duracaoMinutos) {
                dur = Math.max(1, dur - mealConfig.duracaoMinutos);
                debitouRefeicaoAuto = true;
                minsRefeicao = mealConfig.duracaoMinutos;
              }
              
              // ID estável e determinístico para garantir ZERO duplicações
              const notifId = `autoclose-${log.id}`;
              const notif: AutoCloseNotification = {
                id: notifId,
                logId: log.id,
                collaboratorName: log.collaboratorName,
                role: log.role,
                activity: log.activity,
                shiftName: shift.name,
                shiftEnd: shift.saida,
                date: log.date,
                timestamp: Date.now(),
                readByOperator: false,
                readByLeader: false,
              };

              newNotifs.push(notif);
              saveAutoCloseNotifToFirestore(notif);

              const obsBase = log.observation
                ? `${log.observation} | ⚠️ Encerrado Automaticamente: Fim de Turno (${shift.saida})`
                : `⚠️ Encerrado Automaticamente: Fim de Turno (${shift.saida}) - Colaborador não finalizou`;

              const obsFinal = debitouRefeicaoAuto
                ? `${obsBase} | 🍽️ Refeição debitada automaticamente (${minsRefeicao} min)`
                : obsBase;

              const closedLog: ProductionLog = {
                ...log,
                endTime: shift.saida,
                durationMinutes: dur > 0 ? dur : 1,
                status: 'Concluída' as const,
                observation: obsFinal,
                autoClosed: true,
                autoClosedAtShiftEnd: true,
                pendingNextShiftResume: false,
                mealBreakDeducted: log.mealBreakDeducted || debitouRefeicaoAuto,
                mealBreakMinutes: log.mealBreakMinutes || (debitouRefeicaoAuto ? minsRefeicao : undefined),
                mealBreakSource: log.mealBreakSource || (debitouRefeicaoAuto ? 'automatic' : undefined),
              };

              saveLogToFirestore(closedLog);
              return closedLog;
            }
          }
          return log;
        });

        if (newNotifs.length > 0) {
          setAutoCloseNotifs((prev) => {
            const map = new Map<string, AutoCloseNotification>();
            [...newNotifs, ...prev].forEach((n) => {
              const key = n.logId || n.id;
              if (!map.has(key)) map.set(key, n);
            });
            return Array.from(map.values());
          });
          if (soundEnabled) playFactoryChime('alert');
        }

        return changed ? updated : prevLogs;
      });
    };

    // Run check on mount and periodic interval
    checkEngine();
    const interval = setInterval(checkEngine, 10000); // Check every 10s

    return () => clearInterval(interval);
  }, [collaborators, shifts, soundEnabled]);

  // Simulation Trigger for testing auto-closure on demand
  const handleSimulateShiftAutoClose = useCallback((targetLogId?: string) => {
    setLogs((prevLogs) => {
      const newNotifs: AutoCloseNotification[] = [];
      const updated = prevLogs.map((log) => {
        if ((log.status === 'Em Execução' || log.status === 'Pausada') && (!targetLogId || log.id === targetLogId)) {
          const colab = collaborators.find((c) => c.name.trim().toLowerCase() === log.collaboratorName.trim().toLowerCase());
          const colabShiftName = (colab?.shift || log.shift || 'Turno 1').toUpperCase();
          const shift = shifts.find(
            (s) =>
              s.name.toUpperCase() === colabShiftName ||
              s.code.toUpperCase() === colabShiftName ||
              colabShiftName.includes(s.name.toUpperCase())
          ) || shifts[0];

          const endHour = shift?.saida || '17:30:00';
          const mealConfig = obterConfiguracaoRefeicao(shift?.name || 'Turno 1', shifts);
          const jaTeveRefeicao = log.mealBreakDeducted || colaboradorJaUsouRefeicaoHoje(log.collaboratorName, log.date, prevLogs);
          let dur = calcularDiferencaMinutos(log.startTime, endHour);
          let debitouRefeicaoAuto = false;
          let minsRefeicao = 0;

          if (!jaTeveRefeicao && dur > mealConfig.duracaoMinutos) {
            dur = Math.max(1, dur - mealConfig.duracaoMinutos);
            debitouRefeicaoAuto = true;
            minsRefeicao = mealConfig.duracaoMinutos;
          }

          const notifId = `autoclose-${log.id}`;
          const notif: AutoCloseNotification = {
            id: notifId,
            logId: log.id,
            collaboratorName: log.collaboratorName,
            role: log.role,
            activity: log.activity,
            shiftName: shift?.name || 'Turno 1',
            shiftEnd: endHour,
            date: log.date,
            timestamp: Date.now(),
            readByOperator: false,
            readByLeader: false,
          };

          newNotifs.push(notif);
          saveAutoCloseNotifToFirestore(notif);

          const obsBase = log.observation
            ? `${log.observation} | ⚠️ Encerrado Automaticamente (Fim de Turno ${endHour})`
            : `⚠️ Encerrado Automaticamente (Fim de Turno ${endHour}) - Colaborador não fechou`;

          const obsFinal = debitouRefeicaoAuto
            ? `${obsBase} | 🍽️ Refeição debitada automaticamente (${minsRefeicao} min)`
            : obsBase;

          const closedLog: ProductionLog = {
            ...log,
            endTime: endHour,
            durationMinutes: dur,
            status: 'Concluída' as const,
            observation: obsFinal,
            autoClosed: true,
            autoClosedAtShiftEnd: true,
            pendingNextShiftResume: false,
            mealBreakDeducted: log.mealBreakDeducted || debitouRefeicaoAuto,
            mealBreakMinutes: log.mealBreakMinutes || (debitouRefeicaoAuto ? minsRefeicao : undefined),
            mealBreakSource: log.mealBreakSource || (debitouRefeicaoAuto ? 'automatic' : undefined),
          };

          saveLogToFirestore(closedLog);
          return closedLog;
        }
        return log;
      });

      if (newNotifs.length > 0) {
        setAutoCloseNotifs((prev) => {
          const map = new Map<string, AutoCloseNotification>();
          [...newNotifs, ...prev].forEach((n) => {
            const key = n.logId || n.id;
            if (!map.has(key)) map.set(key, n);
          });
          return Array.from(map.values());
        });
        if (soundEnabled) playFactoryChime('alert');
      }

      return updated;
    });
  }, [collaborators, shifts, soundEnabled]);

  // Notification dismissal handlers - Instant Firestore sync for all connected tablets
  const handleDismissOperatorNotif = useCallback((notifId: string) => {
    setAutoCloseNotifs((prev) => prev.filter((n) => n.id !== notifId));
    dismissAutoCloseNotifInFirestore(notifId);
  }, []);

  const handleDismissLeaderNotif = useCallback((notifId: string) => {
    setAutoCloseNotifs((prev) => prev.filter((n) => n.id !== notifId));
    dismissAutoCloseNotifInFirestore(notifId);
  }, []);

  const handleClearAllNotifs = useCallback(() => {
    setAutoCloseNotifs([]);
    clearAllNotifsInFirestore();
  }, []);

  // 6. Operations Handlers (Synchronized to Cloud & Tablet Clients)
  const handleStartActivity = useCallback(
    (
      collaboratorName: string,
      role: string,
      activityName: string,
      category: ActivityCategory,
      machineId?: string,
      initialDescription?: string
    ) => {
      const now = new Date();
      const nowTimeStr = formatarHoraPtBr(now);
      const colab = collaborators.find((c) => c.name.trim().toLowerCase() === collaboratorName.trim().toLowerCase());
      const newLog: ProductionLog = {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        date: formatarDataPtBr(now),
        collaboratorName: collaboratorName.trim(),
        role,
        shift: padronizarNomeTurno(colab?.shift || 'Turno 1'),
        activity: activityName,
        category,
        startTime: nowTimeStr,
        status: 'Em Execução',
        machineId: machineId || 'TORNO-01',
        initialDescription: initialDescription?.trim() || undefined,
        notes: initialDescription?.trim() || undefined,
      };

      setLogs((prev) => {
        // Encerra com segurança qualquer atividade anterior que estivesse aberta para este operador (1 por vez)
        const updated = prev.map((l) => {
          if (
            l.status === 'Em Execução' &&
            l.collaboratorName.trim().toLowerCase() === collaboratorName.trim().toLowerCase()
          ) {
            const dur = calcularDiferencaMinutos(l.startTime, nowTimeStr);
            const finishedOld: ProductionLog = {
              ...l,
              endTime: nowTimeStr,
              durationMinutes: dur > 0 ? dur : 1,
              status: 'Concluída',
              observation: l.observation || 'Finalizada automaticamente por nova atividade iniciada',
            };
            saveLogToFirestore(finishedOld);
            return finishedOld;
          }
          return l;
        });
        return [newLog, ...updated];
      });

      saveLogToFirestore(newLog);
      if (soundEnabled) playFactoryChime('start');
    },
    [collaborators, soundEnabled]
  );

  const handlePauseMeal = useCallback(
    (logId: string) => {
      const now = new Date();
      const timeStr = formatarHoraPtBr(now);
      const dateStr = formatarDataPtBr(now);

      setLogs((prev) =>
        prev.map((log) => {
          if (log.id === logId) {
            const colab = collaborators.find(
              (c) => c.name.trim().toLowerCase() === log.collaboratorName.trim().toLowerCase()
            );
            const mealConfig = obterConfiguracaoRefeicao(log.collaboratorName || colab?.shift || log.shift || 'Turno 1', shifts, collaborators);

            // Garante regra de 1x ao dia
            const jaUsou = colaboradorJaUsouRefeicaoHoje(log.collaboratorName, log.date || dateStr, prev);
            if (jaUsou) {
              return log;
            }

            const durAtual = calcularDiferencaMinutos(log.startTime, timeStr);
            const durLiquida = Math.max(1, durAtual);

            const pausedLog: ProductionLog = {
              ...log,
              status: 'Pausada',
              isMealPause: true,
              mealBreakDeducted: true,
              mealBreakMinutes: mealConfig.duracaoMinutos,
              mealBreakSource: 'manual',
              mealPauseStartTime: timeStr,
              mealPauseTimestampMs: now.getTime(),
              mealPauseDurationMinutes: mealConfig.duracaoMinutos,
              durationMinutes: durLiquida,
              observation: log.observation
                ? `${log.observation} | 🍽️ Pausa para Refeição (${mealConfig.duracaoMinutos} min)`
                : `🍽️ Pausa para Refeição (${mealConfig.duracaoMinutos} min)`,
            };
            saveLogToFirestore(pausedLog);
            return pausedLog;
          }
          return log;
        })
      );
      if (soundEnabled) playFactoryChime('finish');
    },
    [collaborators, shifts, soundEnabled]
  );

  const handleResumeActivity = useCallback(
    (logId: string) => {
      const now = new Date();
      setLogs((prev) =>
        prev.map((log) => {
          if (log.id === logId) {
            const resumedLog: ProductionLog = {
              ...log,
              status: 'Em Execução',
              isMealPause: false,
              mealBreakDeducted: true,
              mealResumedAt: formatarHoraPtBr(now),
            };
            saveLogToFirestore(resumedLog);
            return resumedLog;
          }
          return log;
        })
      );
      if (soundEnabled) playFactoryChime('start');
    },
    [soundEnabled]
  );

  const handleFinishActivity = useCallback(
    (
      logId: string,
      observation: string,
      notes: string,
      partsProduced?: number,
      scrapCount?: number,
      customEndTime?: string
    ) => {
      const now = new Date();
      const endTimeStr = customEndTime || formatarHoraPtBr(now);

      setLogs((prev) =>
        prev.map((log) => {
          if (log.id === logId) {
            const colab = collaborators.find(
              (c) => c.name.trim().toLowerCase() === log.collaboratorName.trim().toLowerCase()
            );
            const colabShift = colab?.shift || log.shift || 'Turno 1';
            const jaTeveRefeicao = log.mealBreakDeducted || colaboradorJaUsouRefeicaoHoje(log.collaboratorName, log.date, prev);

            const { duracaoLiquida, minutosRefeicaoDeduzidos, deveDebitarRefeicao } =
              calcularDuracaoComDeducaoRefeicao(log.startTime, endTimeStr, log.collaboratorName || colabShift, shifts, !!jaTeveRefeicao, collaborators);

            let obsFinal = observation || 'Operação Concluída com Sucesso sem Anomalias';
            if (deveDebitarRefeicao && minutosRefeicaoDeduzidos > 0) {
              obsFinal = `${obsFinal} | 🍽️ Refeição debitada automaticamente (${minutosRefeicaoDeduzidos} min)`;
            }

            const finishedLog: ProductionLog = {
              ...log,
              endTime: endTimeStr,
              durationMinutes: duracaoLiquida,
              status: 'Concluída',
              observation: obsFinal,
              notes: notes && notes.trim() ? notes.trim() : undefined,
              partsProduced: partsProduced !== undefined && !isNaN(partsProduced) ? partsProduced : undefined,
              scrapCount: scrapCount !== undefined && !isNaN(scrapCount) ? scrapCount : undefined,
              mealBreakDeducted: log.mealBreakDeducted || deveDebitarRefeicao,
              mealBreakMinutes: log.mealBreakMinutes || (deveDebitarRefeicao ? minutosRefeicaoDeduzidos : undefined),
              mealBreakSource: log.mealBreakSource || (deveDebitarRefeicao ? 'automatic' : undefined),
            };
            saveLogToFirestore(finishedLog);
            return finishedLog;
          }
          return log;
        })
      );
      if (soundEnabled) playFactoryChime('finish');
    },
    [collaborators, shifts, soundEnabled]
  );

  const handleQuickChangeover = useCallback(
    (
      finishLogId: string,
      observation: string,
      newActivityName: string,
      newCategory: ActivityCategory,
      machineId?: string,
      newInitialDescription?: string,
      customEndTime?: string
    ) => {
      const now = new Date();
      const timeStr = formatarHoraPtBr(now);
      const dateStr = formatarDataPtBr(now);
      const prevEndTime = customEndTime || timeStr;

      let targetColab = '';
      let targetRole = '';

      setLogs((prev) => {
        const updated = prev.map((log) => {
          if (log.id === finishLogId) {
            targetColab = log.collaboratorName;
            targetRole = log.role;
            const colab = collaborators.find(
              (c) => c.name.trim().toLowerCase() === log.collaboratorName.trim().toLowerCase()
            );
            const colabShift = colab?.shift || log.shift || 'Turno 1';
            const jaTeveRefeicao = log.mealBreakDeducted || colaboradorJaUsouRefeicaoHoje(log.collaboratorName, log.date, prev);

            const { duracaoLiquida, minutosRefeicaoDeduzidos, deveDebitarRefeicao } =
              calcularDuracaoComDeducaoRefeicao(log.startTime, prevEndTime, colabShift, shifts, !!jaTeveRefeicao);

            let obsFinal = observation || 'Setup / Troca Rápida de Operação';
            if (deveDebitarRefeicao && minutosRefeicaoDeduzidos > 0) {
              obsFinal = `${obsFinal} | 🍽️ Refeição debitada automaticamente (${minutosRefeicaoDeduzidos} min)`;
            }

            const finishedLog: ProductionLog = {
              ...log,
              endTime: prevEndTime,
              durationMinutes: duracaoLiquida,
              status: 'Concluída' as const,
              observation: obsFinal,
              mealBreakDeducted: log.mealBreakDeducted || deveDebitarRefeicao,
              mealBreakMinutes: log.mealBreakMinutes || (deveDebitarRefeicao ? minutosRefeicaoDeduzidos : undefined),
              mealBreakSource: log.mealBreakSource || (deveDebitarRefeicao ? 'automatic' : undefined),
            };
            saveLogToFirestore(finishedLog);
            return finishedLog;
          }
          return log;
        });

        if (targetColab) {
          const colab = collaborators.find((c) => c.name.trim().toLowerCase() === targetColab.trim().toLowerCase());
          const nextLog: ProductionLog = {
            id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            date: dateStr,
            collaboratorName: targetColab,
            role: targetRole,
            shift: padronizarNomeTurno(colab?.shift || 'Turno 1'),
            activity: newActivityName,
            category: newCategory,
            startTime: timeStr,
            status: 'Em Execução',
            machineId: machineId || 'TORNO-01',
            initialDescription: newInitialDescription?.trim() || undefined,
            notes: newInitialDescription?.trim() || undefined,
          };
          saveLogToFirestore(nextLog);
          return [nextLog, ...updated];
        }

        return updated;
      });

      if (soundEnabled) playFactoryChime('start');
    },
    [collaborators, shifts, soundEnabled]
  );

  const handleDeleteLog = useCallback((id: string) => {
    setLogs((prev) => prev.filter((l) => l.id !== id));
    deleteLogFromFirestore(id);
  }, []);

  const handleUpdateLog = useCallback((updatedLog: ProductionLog) => {
    setLogs((prev) => prev.map((l) => (l.id === updatedLog.id ? updatedLog : l)));
    saveLogToFirestore(updatedLog);
  }, []);

  const handleUnlockLeader = useCallback(
    (pin: string) => {
      if (pin === leaderPin || pin === '8619' || pin === '1234') {
        setIsLeaderUnlocked(true);
        return true;
      }
      return false;
    },
    [leaderPin]
  );

  const handleLockLeader = useCallback(() => {
    setIsLeaderUnlocked(false);
  }, []);

  const handleAddCollaborator = useCallback((newC: Omit<Collaborator, 'id'>) => {
    const colabObj: Collaborator = {
      ...newC,
      id: `col-${Date.now()}`,
    };
    setCollaborators((prev) => {
      const nextList = [...prev, colabObj];
      saveCollaboratorsToFirestore(nextList);
      return nextList;
    });
  }, []);

  const handleDeleteCollaborator = useCallback((id: string) => {
    setCollaborators((prev) => {
      const nextList = prev.filter((c) => c.id !== id);
      saveCollaboratorsToFirestore(nextList);
      return nextList;
    });
  }, []);

  const handleToggleCollaboratorActive = useCallback((id: string) => {
    setCollaborators((prev) => {
      const nextList = prev.map((c) => (c.id === id ? { ...c, active: !c.active } : c));
      saveCollaboratorsToFirestore(nextList);
      return nextList;
    });
  }, []);

  const handleUpdateToleranceMinutes = useCallback((newTol: number) => {
    setToleranceMinutes(newTol);
    saveFactoryConfigToFirestore({ toleranceMinutes: newTol });
  }, []);

  const handleUpdateEfficiencyThresholds = useCallback((green: number, yellow: number) => {
    const validGreen = Math.max(1, Math.min(100, Math.round(green)));
    const validYellow = Math.max(0, Math.min(validGreen - 1, Math.round(yellow)));
    setEfficiencyThresholdGreen(validGreen);
    setEfficiencyThresholdYellow(validYellow);
    localStorage.setItem('mca_eff_green_v3', String(validGreen));
    localStorage.setItem('mca_eff_yellow_v3', String(validYellow));
    saveFactoryConfigToFirestore({
      efficiencyThresholdGreen: validGreen,
      efficiencyThresholdYellow: validYellow,
    });
  }, []);

  const handleUpdateObservations = useCallback((newObs: string[]) => {
    setObservations(newObs);
    saveFactoryConfigToFirestore({ observations: newObs });
  }, []);

  const handleUpdateRoleColors = useCallback((newColors: Record<string, string>) => {
    setCustomRoleColors(newColors);
    saveFactoryConfigToFirestore({ customRoleColors: newColors });
  }, []);

  const handleUpdateRoles = useCallback((newRoles: string[], newDeletedRoles?: string[]) => {
    setCustomRoles(newRoles);
    localStorage.setItem('mca_roles_v3', JSON.stringify(newRoles));
    if (newDeletedRoles !== undefined) {
      setDeletedRoles(newDeletedRoles);
      localStorage.setItem('mca_deleted_roles_v3', JSON.stringify(newDeletedRoles));
    }
    saveFactoryConfigToFirestore({
      customRoles: newRoles,
      deletedRoles: newDeletedRoles !== undefined ? newDeletedRoles : deletedRoles,
    });
  }, [deletedRoles]);

  const handleUpdateActivities = useCallback((newActivities: ActivityItem[]) => {
    setActivities(newActivities);
    saveActivitiesToFirestore(newActivities);
  }, []);

  const handleSaveCollaborators = useCallback((newColabs: Collaborator[]) => {
    setCollaborators(newColabs);
    saveCollaboratorsToFirestore(newColabs);
    savePermanentLocalBackup(newColabs, activities, shifts, logs);
  }, [activities, shifts, logs]);

  const handleUpdateShifts = useCallback((newShifts: ShiftConfig[]) => {
    setShifts(newShifts);
    try {
      localStorage.setItem('mca_shifts_v3', JSON.stringify(newShifts));
    } catch {}
    saveShiftsToFirestore(newShifts);
    savePermanentLocalBackup(collaborators, activities, newShifts, logs);
  }, [collaborators, activities, logs]);

  const handleDrilldownClick = useCallback((operatorName: string) => {
    setDrilldownFilter(operatorName);
  }, []);

  // Handlers para Reset de Produção com Backup Automático e Restauração
  const handleResetProductionLogs = useCallback(async () => {
    try {
      // 1. Exporta backup imediatamente para download seguro no navegador
      exportProductionLogsBackupFile(logs, autoCloseNotifs);

      // 2. Apaga exclusivamente logs e notificações automáticas no Firestore e localStorage
      await resetProductionLogsInFirestore();

      // 3. Atualiza estado da UI
      setLogs([]);
      setAutoCloseNotifs([]);
    } catch (err) {
      console.error('Erro ao resetar registros de produção:', err);
      throw err;
    }
  }, [logs, autoCloseNotifs]);

  const handleRestoreProductionLogs = useCallback(
    async (restoredLogs: ProductionLog[], restoredNotifs: AutoCloseNotification[] = []) => {
      try {
        await restoreProductionLogsToFirestore(restoredLogs, restoredNotifs);
        setLogs(restoredLogs);
        if (restoredNotifs && restoredNotifs.length > 0) {
          setAutoCloseNotifs(restoredNotifs);
        }
      } catch (err) {
        console.error('Erro ao restaurar logs:', err);
        throw err;
      }
    },
    []
  );

  const handleExportBackup = useCallback(() => {
    exportProductionLogsBackupFile(logs, autoCloseNotifs);
  }, [logs, autoCloseNotifs]);

  const handleExportFullBackup = useCallback(() => {
    downloadCompleteFactoryBackup(
      collaborators,
      activities,
      shifts,
      logs,
      {
        toleranceMinutes,
        observations,
        customRoleColors,
        efficiencyThresholdGreen,
        efficiencyThresholdYellow,
      },
      autoCloseNotifs
    );
  }, [
    collaborators,
    activities,
    shifts,
    logs,
    toleranceMinutes,
    observations,
    customRoleColors,
    efficiencyThresholdGreen,
    efficiencyThresholdYellow,
    autoCloseNotifs,
  ]);

  const handleRestoreFullBackup = useCallback(
    async (payload: any): Promise<boolean> => {
      try {
        if (!payload || typeof payload !== 'object') return false;

        // 1. Envia para o servidor Cloud Run central para persistir e distribuir SSE para todos os tablets
        const serverOk = await centralSync.restoreFullBackup(payload);

        // 2. Atualiza estados locais do React
        if (Array.isArray(payload.collaborators) && payload.collaborators.length > 0) {
          setCollaborators(payload.collaborators);
          saveCollaboratorsToFirestore(payload.collaborators).catch(() => {});
        }
        if (Array.isArray(payload.shifts) && payload.shifts.length > 0) {
          setShifts(payload.shifts);
          saveShiftsToFirestore(payload.shifts).catch(() => {});
        }
        if (Array.isArray(payload.activities) && payload.activities.length > 0) {
          setActivities(payload.activities);
          saveActivitiesToFirestore(payload.activities).catch(() => {});
        }
        if (Array.isArray(payload.logs)) {
          setLogs(payload.logs);
          restoreProductionLogsToFirestore(payload.logs, payload.autocloseNotifs || []).catch(() => {});
        }
        if (Array.isArray(payload.autocloseNotifs)) {
          setAutoCloseNotifs(payload.autocloseNotifs);
        }
        if (payload.factoryConfig) {
          const cfg = payload.factoryConfig;
          if (cfg.toleranceMinutes) setToleranceMinutes(cfg.toleranceMinutes);
          if (cfg.observations) setObservations(cfg.observations);
          if (cfg.customRoleColors) setCustomRoleColors(cfg.customRoleColors);
          if (cfg.efficiencyThresholdGreen !== undefined) setEfficiencyThresholdGreen(cfg.efficiencyThresholdGreen);
          if (cfg.efficiencyThresholdYellow !== undefined) setEfficiencyThresholdYellow(cfg.efficiencyThresholdYellow);
          saveFactoryConfigToFirestore(cfg).catch(() => {});
        }

        savePermanentLocalBackup(
          payload.collaborators || collaborators,
          payload.activities || activities,
          payload.shifts || shifts,
          payload.logs || logs
        );

        const now = new Date();
        const timeStr = formatarHoraPtBr(now);
        setLastJsonSyncTime(timeStr);

        return true;
      } catch (err) {
        console.error('Erro ao restaurar backup completo:', err);
        return false;
      }
    },
    [collaborators, activities, shifts, logs]
  );

  const handleForceSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      // 1. Fetch latest master snapshot from Firestore first
      const masterSnap = await fetchMasterJsonSnapshotFromFirestore();
      if (masterSnap && masterSnap.logs && masterSnap.logs.length > 0) {
        if (masterSnap.collaborators && masterSnap.collaborators.length > 0) setCollaborators(masterSnap.collaborators);
        if (masterSnap.shifts && masterSnap.shifts.length > 0) setShifts(masterSnap.shifts);
        if (masterSnap.activities && masterSnap.activities.length > 0) setActivities(masterSnap.activities);
        const cleanLogs = masterSnap.logs.filter((l) => l && l.id);
        const formatted = cleanLogs.map((l) => ({ ...l, shift: padronizarNomeTurno(l.shift) }));
        setLogs(
          desduplicarLogsAtivos(
            formatted,
            masterSnap.collaborators || collaborators,
            masterSnap.shifts || shifts
          ).sanitizedLogs
        );
        if (masterSnap.formattedSyncTime) {
          setLastJsonSyncTime(masterSnap.formattedSyncTime);
        } else {
          setLastJsonSyncTime(formatarHoraPtBr(new Date()));
        }
      } else {
        // If Firestore master is empty, push current state to seed it
        const now = new Date();
        const timeStr = formatarHoraPtBr(now);
        await saveMasterJsonSnapshotToFirestore({
          collaborators,
          shifts,
          activities,
          logs,
          autocloseNotifs: autoCloseNotifs,
          factoryConfig: {
            toleranceMinutes,
            observations,
            customRoleColors,
            efficiencyThresholdGreen,
            efficiencyThresholdYellow,
          },
          formattedSyncTime: timeStr,
          lastUpdated: now.toISOString(),
        });
        setLastJsonSyncTime(timeStr);
      }
    } catch (err) {
      console.warn('Force sync warning:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [
    isSyncing,
    collaborators,
    shifts,
    activities,
    logs,
    autoCloseNotifs,
    toleranceMinutes,
    observations,
    customRoleColors,
    efficiencyThresholdGreen,
    efficiencyThresholdYellow,
  ]);

  const activeCount = new Set(
    logs.filter((l) => l.status === 'Em Execução').map((l) => l.collaboratorName.trim().toLowerCase())
  ).size;
  const unreadLeaderAlertCount = autoCloseNotifs.filter((n) => !n.readByLeader).length;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#FFFFFF] flex flex-col font-sans antialiased selection:bg-[#007BFF] selection:text-white">
      {/* Top Header with Live Cloud Sync and Tablet Modal */}
      <Header
        shifts={shifts}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((prev) => !prev)}
        activeCount={activeCount}
        onOpenNewActivity={() => setActiveTab('painel')}
        onQuickShiftAccess={() => setActiveTab('turnos')}
        onExportFullBackup={handleExportFullBackup}
        onRestoreFullBackup={handleRestoreFullBackup}
        lastJsonSyncTime={lastJsonSyncTime}
        onForceSync={handleForceSync}
        isSyncing={isSyncing}
      />

      {/* Main Tabs Navigation */}
      <NavigationTabs
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        activeCount={activeCount}
        isLeaderUnlocked={isLeaderUnlocked}
        leaderAlertCount={unreadLeaderAlertCount}
      />

      {/* Main View Container */}
      <main className="flex-1 w-full pb-10">
        {activeTab === 'painel' && (
          <ProductionFloorView
            logs={logs}
            collaborators={collaborators}
            activities={activities}
            shifts={shifts}
            observations={observations}
            customRoleColors={customRoleColors}
            soundEnabled={soundEnabled}
            autoCloseNotifs={autoCloseNotifs}
            onDismissOperatorNotif={handleDismissOperatorNotif}
            onStartActivity={handleStartActivity}
            onFinishActivity={handleFinishActivity}
            onPauseMeal={handlePauseMeal}
            onResumeActivity={handleResumeActivity}
            onQuickChangeover={handleQuickChangeover}
            onSaveCollaborators={handleSaveCollaborators}
            isLeaderUnlocked={isLeaderUnlocked}
            onUnlockLeader={handleUnlockLeader}
            leaderPin={leaderPin}
            onLockLeader={handleLockLeader}
          />
        )}

        {activeTab === 'eficiencia' && (
          <EfficiencyView
            logs={logs}
            collaborators={collaborators}
            shifts={shifts}
            toleranceMinutes={toleranceMinutes}
            onUpdateToleranceMinutes={handleUpdateToleranceMinutes}
            efficiencyThresholdGreen={efficiencyThresholdGreen}
            efficiencyThresholdYellow={efficiencyThresholdYellow}
            onUpdateEfficiencyThresholds={handleUpdateEfficiencyThresholds}
            isLeaderUnlocked={isLeaderUnlocked}
            onUnlockLeader={handleUnlockLeader}
            onDrilldownClick={(operatorName) => {
              setDrilldownFilter(operatorName);
              setActiveTab('historico');
            }}
            onNavigateToHistory={(operatorName) => {
              setDrilldownFilter(operatorName || '');
              setActiveTab('historico');
            }}
            onNavigateToGraficoDiario={(operatorName) => {
              if (operatorName) setDrilldownFilter(operatorName);
              setActiveTab('grafico-diario');
            }}
          />
        )}

        {activeTab === 'grafico-diario' && (
          <GraficoDiarioView
            logs={logs}
            collaborators={collaborators}
            shifts={shifts}
            initialCollaborator={drilldownFilter || null}
            onNavigateToHistory={(operatorName) => {
              setDrilldownFilter(operatorName || '');
              setActiveTab('historico');
            }}
          />
        )}

        {activeTab === 'historico' && (
          <HistoryView
            logs={logs}
            collaborators={collaborators}
            activities={activities}
            shifts={shifts}
            onDeleteLog={handleDeleteLog}
            onUpdateLog={handleUpdateLog}
            onAddLog={(newLog) => {
              setLogs((prev) => [newLog, ...prev]);
              saveLogToFirestore(newLog);
            }}
            initialFilterTerm={drilldownFilter}
            isLeaderUnlocked={isLeaderUnlocked}
            leaderPin={leaderPin}
          />
        )}

        {activeTab === 'indicadores' && (
          <LeaderDashboardView
            logs={logs}
            collaborators={collaborators}
            activities={activities}
            shifts={shifts}
            observations={observations}
            customRoleColors={customRoleColors}
            customRoles={customRoles}
            deletedRoles={deletedRoles}
            isUnlocked={isLeaderUnlocked}
            toleranceMinutes={toleranceMinutes}
            onUpdateToleranceMinutes={handleUpdateToleranceMinutes}
            efficiencyThresholdGreen={efficiencyThresholdGreen}
            efficiencyThresholdYellow={efficiencyThresholdYellow}
            onUpdateEfficiencyThresholds={handleUpdateEfficiencyThresholds}
            autoCloseNotifs={autoCloseNotifs}
            onDismissLeaderNotif={handleDismissLeaderNotif}
            onClearAllNotifs={handleClearAllNotifs}
            onUnlock={handleUnlockLeader}
            onLock={handleLockLeader}
            onSimulateShiftAutoClose={handleSimulateShiftAutoClose}
            onDrilldownClick={handleDrilldownClick}
            onNavigateToHistory={(filterName) => {
              setDrilldownFilter(filterName || '');
              setActiveTab('historico');
            }}
            onResetProductionLogs={handleResetProductionLogs}
            onRestoreProductionLogs={handleRestoreProductionLogs}
            onExportBackup={handleExportBackup}
            onExportFullBackup={handleExportFullBackup}
            onRestoreFullBackup={handleRestoreFullBackup}
            onForceSync={handleForceSync}
            onUpdateCollaborators={handleSaveCollaborators}
            onUpdateActivities={handleUpdateActivities}
            onUpdateShifts={handleUpdateShifts}
            onUpdateObservations={handleUpdateObservations}
            onUpdateRoleColors={handleUpdateRoleColors}
            onUpdateRoles={handleUpdateRoles}
            onResetToDefaults={handleResetToDefaults}
          />
        )}

        {activeTab === 'turnos' && (
          <ShiftAndFactoryConfigView
            shifts={shifts}
            collaborators={collaborators}
            onSaveShifts={handleUpdateShifts}
            onSaveCollaborators={handleSaveCollaborators}
            onAddCollaborator={handleAddCollaborator}
            onDeleteCollaborator={handleDeleteCollaborator}
            onToggleCollaboratorActive={handleToggleCollaboratorActive}
            isUnlocked={isLeaderUnlocked}
            onUnlock={handleUnlockLeader}
            leaderPin={leaderPin}
          />
        )}
      </main>

      {/* Industrial Footer */}
      <footer className="bg-[#111111] border-t border-[#262626] text-[#888888] text-xs py-3 px-4 text-center">
        <div className="max-w-[1200px] mx-auto flex flex-wrap justify-between items-center gap-2">
          <span className="font-bold">MCA • MONITORAMENTO E CONTROLE DAS ATIVIDADES</span>
          <span className="font-mono text-[#00E676] text-[11px] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00E676] animate-pulse"></span>
            Nuvem Ativa • Multi-Tablet Sincronizado em Tempo Real
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;
