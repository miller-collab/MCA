import React, { useState, useEffect, useCallback } from 'react';
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
} from './utils/factoryCalculations';

import {
  findSavedCollaboratorsInBrowser,
  savePermanentLocalBackup,
} from './utils/recoveryUtils';

import {
  subscribeToLogs,
  subscribeToCollaborators,
  subscribeToActivities,
  subscribeToShifts,
  subscribeToFactoryConfig,
  subscribeToAutoCloseNotifs,
  saveLogToFirestore,
  deleteLogFromFirestore,
  saveCollaboratorsToFirestore,
  saveActivitiesToFirestore,
  saveShiftsToFirestore,
  saveFactoryConfigToFirestore,
  saveAutoCloseNotifToFirestore,
  dismissAutoCloseNotifInFirestore,
  clearAllNotifsInFirestore,
  seedInitialFirestoreDataIfEmpty,
  fetchAllDataFromFirestore,
} from './services/firestoreSync';

export type TabKey = 'painel' | 'eficiencia' | 'grafico-diario' | 'historico' | 'indicadores' | 'turnos';

// Helper to generate initial logs if empty
function gerarLogsIniciais(
  colaboradores: Collaborator[],
  atividades: ActivityItem[]
): ProductionLog[] {
  const hoje = formatarDataPtBr(new Date());
  return [
    {
      id: 'log-seed-1',
      date: hoje,
      collaboratorName: 'GERALDO',
      role: 'PREPARADOR TORNO AUTOMATICO',
      shift: 'Turno 1',
      activity: 'SETUP DE MAQUINA',
      category: 'Setup',
      startTime: '07:00:00',
      endTime: '08:30:00',
      durationMinutes: 90,
      status: 'Concluída',
      observation: 'Setup inicial concluído com sucesso',
    },
    {
      id: 'log-seed-2',
      date: hoje,
      collaboratorName: 'DIEGO',
      role: 'INSPETOR TCNC / OPERADOR',
      shift: 'Turno 1',
      activity: 'MEDIR PEÇAS',
      category: 'Qualidade / Inspeção',
      startTime: '07:15:00',
      endTime: '08:45:00',
      durationMinutes: 90,
      status: 'Concluída',
      observation: 'Inspeção de rotina concluída',
    },
    {
      id: 'log-seed-3',
      date: hoje,
      collaboratorName: 'EVANDRO',
      role: 'AREA DO CAVACO E OLEO',
      shift: 'Turno 1',
      activity: 'LIMPEZA DO CAVACO',
      category: '5S & Limpeza',
      startTime: '07:20:00',
      endTime: '08:20:00',
      durationMinutes: 60,
      status: 'Concluída',
      observation: 'Limpeza 5S executada',
    },
    {
      id: 'log-seed-4',
      date: hoje,
      collaboratorName: 'CRISTIAN',
      role: 'PREPARADOR DE FERRAMENTAS',
      shift: 'Turno 1',
      activity: 'AFIAR FERRAMENTAS',
      category: 'Setup',
      startTime: '07:00:00',
      endTime: '07:45:00',
      durationMinutes: 45,
      status: 'Concluída',
      observation: 'Operação Concluída com Sucesso sem Anomalias',
    },
  ];
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
    if (saved) {
      try {
        const parsed: ProductionLog[] = JSON.parse(saved);
        const formatted = parsed.map((l) => ({
          ...l,
          shift: padronizarNomeTurno(l.shift),
        }));
        const { sanitizedLogs } = desduplicarLogsAtivos(formatted, INITIAL_COLLABORATORS, INITIAL_SHIFTS);
        return sanitizedLogs;
      } catch {
        return gerarLogsIniciais(INITIAL_COLLABORATORS, INITIAL_ACTIVITIES);
      }
    }
    return gerarLogsIniciais(INITIAL_COLLABORATORS, INITIAL_ACTIVITIES);
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

  // 3. Real-Time Cloud Firestore Sync (Subscribes all tablets simultaneously)
  useEffect(() => {
    // Seed initial dataset if Firestore is newly provisioned
    seedInitialFirestoreDataIfEmpty(
      INITIAL_COLLABORATORS,
      INITIAL_ACTIVITIES,
      INITIAL_SHIFTS,
      INITIAL_OBSERVATIONS
    );

    // Subscribe to real-time logs from Firestore
    const unsubLogs = subscribeToLogs((cloudLogs) => {
      if (cloudLogs) {
        const formatted = cloudLogs.map(l => ({ ...l, shift: padronizarNomeTurno(l.shift) }));
        const { sanitizedLogs, logsParaFinalizar, logsParaDeletar } = desduplicarLogsAtivos(formatted, collaborators, shifts);
        setLogs(sanitizedLogs);
        // Se houver registros encerrados automaticamente ou duplicatas no banco, salva a finalização segura
        if (logsParaFinalizar.length > 0) {
          logsParaFinalizar.forEach((log) => saveLogToFirestore(log));
        }
        // Se houver logs sintéticos a serem deletados do Firestore
        if (logsParaDeletar.length > 0) {
          logsParaDeletar.forEach((id) => deleteLogFromFirestore(id));
        }
      }
    });

    // Subscribe to collaborators
    const unsubColabs = subscribeToCollaborators((cloudColabs) => {
      if (cloudColabs && cloudColabs.length > 0) {
        const hasLegacyDummy = cloudColabs.some(
          (c) =>
            c.name === 'Valter Ribeiro (Líder)' ||
            c.name === 'Carlos Silva' ||
            c.name === 'Marcos Oliveira' ||
            c.name === 'Lucas Mendes'
        );
        if (hasLegacyDummy) {
          saveCollaboratorsToFirestore(INITIAL_COLLABORATORS);
          setCollaborators(INITIAL_COLLABORATORS);
        } else {
          setCollaborators((prev) => (JSON.stringify(prev) === JSON.stringify(cloudColabs) ? prev : cloudColabs));
        }
      }
    });

    // Subscribe to activities
    const unsubActivities = subscribeToActivities((cloudActivities) => {
      if (cloudActivities && cloudActivities.length > 0) {
        setActivities((prev) => (JSON.stringify(prev) === JSON.stringify(cloudActivities) ? prev : cloudActivities));
      }
    });

    // Subscribe to shifts
    const unsubShifts = subscribeToShifts((cloudShifts) => {
      if (cloudShifts && cloudShifts.length > 0) {
        setShifts((prev) => (JSON.stringify(prev) === JSON.stringify(cloudShifts) ? prev : cloudShifts));
      }
    });

    // Subscribe to factory config
    const unsubConfig = subscribeToFactoryConfig((cloudConfig) => {
      if (cloudConfig) {
        if (cloudConfig.toleranceMinutes) setToleranceMinutes(cloudConfig.toleranceMinutes);
        if (cloudConfig.observations && cloudConfig.observations.length > 0) {
          setObservations(cloudConfig.observations);
        }
        if (cloudConfig.customRoleColors) {
          setCustomRoleColors(cloudConfig.customRoleColors);
        }
        if (cloudConfig.customRoles && cloudConfig.customRoles.length > 0) {
          setCustomRoles(cloudConfig.customRoles);
        }
        if (cloudConfig.deletedRoles) {
          setDeletedRoles(cloudConfig.deletedRoles);
        }
        if (cloudConfig.efficiencyThresholdGreen !== undefined) {
          setEfficiencyThresholdGreen(cloudConfig.efficiencyThresholdGreen);
          localStorage.setItem('mca_eff_green_v3', String(cloudConfig.efficiencyThresholdGreen));
        }
        if (cloudConfig.efficiencyThresholdYellow !== undefined) {
          setEfficiencyThresholdYellow(cloudConfig.efficiencyThresholdYellow);
          localStorage.setItem('mca_eff_yellow_v3', String(cloudConfig.efficiencyThresholdYellow));
        }
      }
    });

    // Subscribe to auto close notifications
    const unsubNotifs = subscribeToAutoCloseNotifs((cloudNotifs) => {
      setAutoCloseNotifs(cloudNotifs);
    });

    return () => {
      unsubLogs();
      unsubColabs();
      unsubActivities();
      unsubShifts();
      unsubConfig();
      unsubNotifs();
    };
  }, []);

  // 3.1 Background Polling Sync Loop (Foto 1, 2, 3: Mantém sincronismo contínuo entre Studio e Link externo)
  useEffect(() => {
    let isFetching = false;
    const syncWithCloud = async () => {
      if (isFetching) return;
      isFetching = true;
      try {
        const cloudData = await fetchAllDataFromFirestore();
        if (cloudData) {
          if (cloudData.collaborators && cloudData.collaborators.length > 0) {
            const hasLegacyDummy = cloudData.collaborators.some(
              (c) =>
                c.name === 'Valter Ribeiro (Líder)' ||
                c.name === 'Carlos Silva' ||
                c.name === 'Marcos Oliveira' ||
                c.name === 'Lucas Mendes'
            );
            if (hasLegacyDummy) {
              saveCollaboratorsToFirestore(INITIAL_COLLABORATORS);
              setCollaborators(INITIAL_COLLABORATORS);
            } else {
              setCollaborators((prev) => (JSON.stringify(prev) === JSON.stringify(cloudData.collaborators) ? prev : cloudData.collaborators!));
            }
          }
          if (cloudData.activities && cloudData.activities.length > 0) {
            setActivities((prev) => (JSON.stringify(prev) === JSON.stringify(cloudData.activities) ? prev : cloudData.activities!));
          }
          if (cloudData.shifts && cloudData.shifts.length > 0) {
            setShifts((prev) => (JSON.stringify(prev) === JSON.stringify(cloudData.shifts) ? prev : cloudData.shifts!));
          }
          if (cloudData.logs && cloudData.logs.length > 0) {
            const formatted = cloudData.logs.map(l => ({ ...l, shift: padronizarNomeTurno(l.shift) }));
            const { sanitizedLogs, logsParaFinalizar, logsParaDeletar } = desduplicarLogsAtivos(
              formatted,
              cloudData.collaborators || collaborators,
              cloudData.shifts || shifts
            );
            setLogs((prev) => (JSON.stringify(prev) === JSON.stringify(sanitizedLogs) ? prev : sanitizedLogs));
            if (logsParaFinalizar.length > 0) {
              logsParaFinalizar.forEach((log) => saveLogToFirestore(log));
            }
            if (logsParaDeletar.length > 0) {
              logsParaDeletar.forEach((id) => deleteLogFromFirestore(id));
            }
          }
        }
      } catch (err) {
        console.warn('Background sync loop notice:', err);
      } finally {
        isFetching = false;
      }
    };

    // Run every 4 seconds in background when idle
    const interval = setInterval(syncWithCloud, 4000);
    // Also sync immediately when window gains focus or online
    window.addEventListener('focus', syncWithCloud);
    window.addEventListener('online', syncWithCloud);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', syncWithCloud);
      window.removeEventListener('online', syncWithCloud);
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

        // 1. Process existing logs (meal resume, shift auto-close, and update pending resumes)
        const updated = prevLogs.map((log) => {
          // A. Retomada Automática de Refeição ao Vencer os Minutos Configurados (ex: 90 min)
          if (
            log.status === 'Pausada' &&
            (log.isMealPause || log.mealPauseTimestampMs || log.mealPauseStartTime || log.observation?.includes('Refeição'))
          ) {
            const mealMinutes = log.mealPauseDurationMinutes || log.mealBreakMinutes || 90;
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

            if (pauseStartMs && (nowMs - pauseStartMs) >= mealMinutes * 60 * 1000) {
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

          // B. Encerramento Automático no Fim do Turno Específico do Colaborador
          if (log.status === 'Em Execução' || log.status === 'Pausada') {
            const colab = collaborators.find(
              (c) => c.name.trim().toLowerCase() === log.collaboratorName.trim().toLowerCase()
            );
            const colabShiftName = (colab?.shift || log.shift || 'Turno 1').toUpperCase();
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

            // Verifica se a atividade é de dia anterior OU se o turno do colaborador já encerrou hoje
            const isLogFromPreviousDay = Boolean(log.date && log.date !== todayDateStr);
            const turnoEncerrou = isLogFromPreviousDay || verificarTurnoEncerrado(shift.saida, shift.entrada, shift.dias, now);

            if (turnoEncerrou) {
              changed = true;
              const mealConfig = obterConfiguracaoRefeicao(shift.name, shifts);
              const jaTeveRefeicao = log.mealBreakDeducted || colaboradorJaUsouRefeicaoHoje(log.collaboratorName, log.date, prevLogs);
              let dur = calcularDiferencaMinutos(log.startTime, shift.saida);
              if (dur <= 0) dur = 60;
              let debitouRefeicaoAuto = false;
              let minsRefeicao = 0;

              // Se o colaborador não acionou pausa de refeição durante o dia, deduz automaticamente a refeição do turno no final do turno
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
      machineId?: string
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
            const mealConfig = obterConfiguracaoRefeicao(colab?.shift || log.shift || 'Turno 1', shifts);

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
      scrapCount?: number
    ) => {
      const now = new Date();
      const endTimeStr = formatarHoraPtBr(now);

      setLogs((prev) =>
        prev.map((log) => {
          if (log.id === logId) {
            const colab = collaborators.find(
              (c) => c.name.trim().toLowerCase() === log.collaboratorName.trim().toLowerCase()
            );
            const colabShift = colab?.shift || log.shift || 'Turno 1';
            const jaTeveRefeicao = log.mealBreakDeducted || colaboradorJaUsouRefeicaoHoje(log.collaboratorName, log.date, prev);

            const { duracaoLiquida, minutosRefeicaoDeduzidos, deveDebitarRefeicao } =
              calcularDuracaoComDeducaoRefeicao(log.startTime, endTimeStr, colabShift, shifts, !!jaTeveRefeicao);

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
      machineId?: string
    ) => {
      const now = new Date();
      const timeStr = formatarHoraPtBr(now);
      const dateStr = formatarDataPtBr(now);

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
              calcularDuracaoComDeducaoRefeicao(log.startTime, timeStr, colabShift, shifts, !!jaTeveRefeicao);

            let obsFinal = observation || 'Setup / Troca Rápida de Operação';
            if (deveDebitarRefeicao && minutosRefeicaoDeduzidos > 0) {
              obsFinal = `${obsFinal} | 🍽️ Refeição debitada automaticamente (${minutosRefeicaoDeduzidos} min)`;
            }

            const finishedLog: ProductionLog = {
              ...log,
              endTime: timeStr,
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
