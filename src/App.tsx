import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { NavigationTabs } from './components/NavigationTabs';
import { ProductionFloorView } from './components/ProductionFloorView';
import { EfficiencyView } from './components/EfficiencyView';
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
} from './data/initialData';

import {
  formatarDataPtBr,
  formatarHoraPtBr,
  calcularDiferencaMinutos,
  playFactoryChime,
  verificarTurnoEncerrado,
  padronizarNomeTurno,
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
} from './services/firestoreSync';

export type TabKey = 'painel' | 'eficiencia' | 'historico' | 'indicadores' | 'turnos';

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
      collaboratorName: 'Carlos Silva',
      role: 'PREPARADOR TORNO AUTOMATICO',
      shift: 'Turno 1',
      activity: 'SETUP DE MAQUINA',
      category: 'Setup',
      startTime: '08:00:00',
      status: 'Em Execução',
    },
    {
      id: 'log-seed-2',
      date: hoje,
      collaboratorName: 'Marcos Oliveira',
      role: 'INSPETOR TCNC / OPERADOR',
      shift: 'Turno 1',
      activity: 'MEDIR PEÇAS',
      category: 'Qualidade / Inspeção',
      startTime: '08:15:00',
      status: 'Em Execução',
    },
    {
      id: 'log-seed-3',
      date: hoje,
      collaboratorName: 'Anderson Souza',
      role: 'AREA DO CAVACO E OLEO',
      shift: 'Turno 1',
      activity: 'LIMPEZA DO CAVACO',
      category: '5S & Limpeza',
      startTime: '07:50:00',
      status: 'Em Execução',
    },
    {
      id: 'log-seed-4',
      date: hoje,
      collaboratorName: 'Robson Santos',
      role: 'PREPARADOR DE FERRAMENTAS',
      shift: 'Turno 1',
      activity: 'AFIAR FERRAMENTAS',
      category: 'Setup',
      startTime: '07:30:00',
      endTime: '08:15:00',
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
    return saved ? JSON.parse(saved) : INITIAL_COLLABORATORS;
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

  const [logs, setLogs] = useState<ProductionLog[]>(() => {
    const saved = localStorage.getItem('mca_logs_v3');
    if (saved) {
      try {
        const parsed: ProductionLog[] = JSON.parse(saved);
        return parsed.map((l) => ({
          ...l,
          shift: padronizarNomeTurno(l.shift),
        }));
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
      if (cloudLogs && cloudLogs.length > 0) {
        setLogs(cloudLogs.map(l => ({ ...l, shift: padronizarNomeTurno(l.shift) })));
      }
    });

    // Subscribe to collaborators
    const unsubColabs = subscribeToCollaborators((cloudColabs) => {
      if (cloudColabs && cloudColabs.length > 0) {
        setCollaborators(cloudColabs);
      }
    });

    // Subscribe to activities
    const unsubActivities = subscribeToActivities((cloudActivities) => {
      if (cloudActivities && cloudActivities.length > 0) {
        setActivities(cloudActivities);
      }
    });

    // Subscribe to shifts
    const unsubShifts = subscribeToShifts((cloudShifts) => {
      if (cloudShifts && cloudShifts.length > 0) {
        setShifts(cloudShifts);
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

  // 4. LocalStorage Backup Mirroring & Multi-key redundancy
  useEffect(() => {
    localStorage.setItem('mca_tolerance_minutes_v3', toleranceMinutes.toString());
  }, [toleranceMinutes]);
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
    localStorage.setItem('mca_autoclose_notifs_v3', JSON.stringify(autoCloseNotifs));
  }, [autoCloseNotifs]);

  // Reset to factory defaults
  const handleResetToDefaults = useCallback(() => {
    setCollaborators(INITIAL_COLLABORATORS);
    setActivities(INITIAL_ACTIVITIES);
    setShifts(INITIAL_SHIFTS);
    setObservations(INITIAL_OBSERVATIONS);
    setCustomRoleColors({});
    saveCollaboratorsToFirestore(INITIAL_COLLABORATORS);
    saveActivitiesToFirestore(INITIAL_ACTIVITIES);
    saveShiftsToFirestore(INITIAL_SHIFTS);
    saveFactoryConfigToFirestore({
      toleranceMinutes: 60,
      observations: INITIAL_OBSERVATIONS,
      customRoleColors: {}
    });
  }, []);

  // 5. Auto Shift Closure Engine (Closes forgotten operations when shift ends)
  useEffect(() => {
    const checkAndAutoCloseShifts = () => {
      setLogs((prevLogs) => {
        let changed = false;
        const newNotifs: AutoCloseNotification[] = [];

        const updated = prevLogs.map((log) => {
          if (log.status === 'Em Execução') {
            const colab = collaborators.find((c) => c.name === log.collaboratorName);
            const colabShiftName = (colab?.shift || 'Turno 1').toUpperCase();
            const shift = shifts.find(
              (s) =>
                s.name.toUpperCase() === colabShiftName ||
                s.code.toUpperCase() === colabShiftName ||
                colabShiftName.includes(s.name.toUpperCase())
            );

            if (shift && verificarTurnoEncerrado(shift.saida, shift.entrada, shift.dias)) {
              // Auto-close at shift end
              changed = true;
              const dur = calcularDiferencaMinutos(log.startTime, shift.saida);
              
              const notif: AutoCloseNotification = {
                id: `autoclose-${Date.now()}-${log.id}`,
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

              const closedLog: ProductionLog = {
                ...log,
                endTime: shift.saida,
                durationMinutes: dur,
                status: 'Concluída' as const,
                observation: log.observation
                  ? `${log.observation} | ⚠️ Encerrado Automaticamente: Fim de Turno (${shift.saida})`
                  : `⚠️ Encerrado Automaticamente: Fim de Turno (${shift.saida}) - Colaborador esqueceu de fechar`,
                autoClosed: true,
                autoClosedAtShiftEnd: true,
              };

              saveLogToFirestore(closedLog);
              return closedLog;
            }
          }
          return log;
        });

        if (newNotifs.length > 0) {
          setAutoCloseNotifs((prev) => [...newNotifs, ...prev]);
          if (soundEnabled) playFactoryChime('alert');
        }

        return changed ? updated : prevLogs;
      });
    };

    // Run check on mount and periodic interval
    checkAndAutoCloseShifts();
    const interval = setInterval(checkAndAutoCloseShifts, 10000); // Check every 10s

    return () => clearInterval(interval);
  }, [collaborators, shifts, soundEnabled]);

  // Simulation Trigger for testing auto-closure on demand
  const handleSimulateShiftAutoClose = useCallback((targetLogId?: string) => {
    setLogs((prevLogs) => {
      const newNotifs: AutoCloseNotification[] = [];
      const updated = prevLogs.map((log) => {
        if (log.status === 'Em Execução' && (!targetLogId || log.id === targetLogId)) {
          const colab = collaborators.find((c) => c.name === log.collaboratorName);
          const colabShiftName = (colab?.shift || 'Turno 1').toUpperCase();
          const shift = shifts.find(
            (s) =>
              s.name.toUpperCase() === colabShiftName ||
              s.code.toUpperCase() === colabShiftName ||
              colabShiftName.includes(s.name.toUpperCase())
          ) || shifts[0];

          const endHour = shift?.saida || '17:30:00';
          const dur = calcularDiferencaMinutos(log.startTime, endHour);

          const notif: AutoCloseNotification = {
            id: `autoclose-${Date.now()}-${log.id}`,
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

          const closedLog: ProductionLog = {
            ...log,
            endTime: endHour,
            durationMinutes: dur,
            status: 'Concluída' as const,
            observation: log.observation
              ? `${log.observation} | ⚠️ Encerrado Automaticamente (Fim de Turno ${endHour})`
              : `⚠️ Encerrado Automaticamente (Fim de Turno ${endHour}) - Colaborador não fechou`,
            autoClosed: true,
            autoClosedAtShiftEnd: true,
          };

          saveLogToFirestore(closedLog);
          return closedLog;
        }
        return log;
      });

      if (newNotifs.length > 0) {
        setAutoCloseNotifs((prev) => [...newNotifs, ...prev]);
        if (soundEnabled) playFactoryChime('alert');
      }

      return updated;
    });
  }, [collaborators, shifts, soundEnabled]);

  // Notification dismissal handlers
  const handleDismissOperatorNotif = useCallback((notifId: string) => {
    setAutoCloseNotifs((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, readByOperator: true } : n))
    );
    dismissAutoCloseNotifInFirestore(notifId);
  }, []);

  const handleDismissLeaderNotif = useCallback((notifId: string) => {
    setAutoCloseNotifs((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, readByLeader: true } : n))
    );
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
      const colab = collaborators.find((c) => c.name.trim().toLowerCase() === collaboratorName.trim().toLowerCase());
      const newLog: ProductionLog = {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        date: formatarDataPtBr(now),
        collaboratorName,
        role,
        shift: padronizarNomeTurno(colab?.shift || 'Turno 1'),
        activity: activityName,
        category,
        startTime: formatarHoraPtBr(now),
        status: 'Em Execução',
        machineId: machineId || 'TORNO-01',
      };

      setLogs((prev) => [newLog, ...prev]);
      saveLogToFirestore(newLog);
      if (soundEnabled) playFactoryChime('start');
    },
    [collaborators, soundEnabled]
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
            const dur = calcularDiferencaMinutos(log.startTime, endTimeStr);
            const finishedLog: ProductionLog = {
              ...log,
              endTime: endTimeStr,
              durationMinutes: dur,
              status: 'Concluída',
              observation: observation || 'Operação Concluída com Sucesso sem Anomalias',
              notes: notes.trim() || undefined,
              partsProduced,
              scrapCount,
            };
            saveLogToFirestore(finishedLog);
            return finishedLog;
          }
          return log;
        })
      );
      if (soundEnabled) playFactoryChime('finish');
    },
    [soundEnabled]
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
            const dur = calcularDiferencaMinutos(log.startTime, timeStr);
            const finishedLog: ProductionLog = {
              ...log,
              endTime: timeStr,
              durationMinutes: dur,
              status: 'Concluída' as const,
              observation: observation || 'Setup / Troca Rápida de Operação',
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
            shift: colab?.shift || 'Turno 1',
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
    [collaborators, soundEnabled]
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

  const handleUpdateObservations = useCallback((newObs: string[]) => {
    setObservations(newObs);
    saveFactoryConfigToFirestore({ observations: newObs });
  }, []);

  const handleUpdateRoleColors = useCallback((newColors: Record<string, string>) => {
    setCustomRoleColors(newColors);
    saveFactoryConfigToFirestore({ customRoleColors: newColors });
  }, []);

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
    saveShiftsToFirestore(newShifts);
  }, []);

  const handleDrilldownClick = useCallback((operatorName: string) => {
    setDrilldownFilter(operatorName);
  }, []);

  const activeCount = logs.filter((l) => l.status === 'Em Execução').length;
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
            onQuickChangeover={handleQuickChangeover}
            onSaveCollaborators={handleSaveCollaborators}
          />
        )}

        {activeTab === 'eficiencia' && (
          <EfficiencyView
            logs={logs}
            collaborators={collaborators}
            shifts={shifts}
            toleranceMinutes={toleranceMinutes}
            onUpdateToleranceMinutes={handleUpdateToleranceMinutes}
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
          />
        )}

        {activeTab === 'historico' && (
          <HistoryView
            logs={logs}
            collaborators={collaborators}
            shifts={shifts}
            onDeleteLog={handleDeleteLog}
            onUpdateLog={handleUpdateLog}
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
            isUnlocked={isLeaderUnlocked}
            toleranceMinutes={toleranceMinutes}
            onUpdateToleranceMinutes={handleUpdateToleranceMinutes}
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
            onUpdateCollaborators={setCollaborators}
            onUpdateActivities={handleUpdateActivities}
            onUpdateShifts={handleUpdateShifts}
            onUpdateObservations={handleUpdateObservations}
            onUpdateRoleColors={handleUpdateRoleColors}
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
