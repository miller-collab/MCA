import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { NavigationTabs, TabKey } from './components/NavigationTabs';
import { ProductionFloorView } from './components/ProductionFloorView';
import { HistoryView } from './components/HistoryView';
import { EfficiencyView } from './components/EfficiencyView';
import { LeaderDashboardView } from './components/LeaderDashboardView';
import { ShiftAndFactoryConfigView } from './components/ShiftAndFactoryConfigView';

import { 
  Collaborator, 
  ActivityItem, 
  ShiftConfig, 
  ProductionLog, 
  ActivityCategory,
  AutoCloseNotification
} from './types';
import { 
  INITIAL_COLLABORATORS, 
  INITIAL_ACTIVITIES, 
  INITIAL_SHIFTS, 
  INITIAL_OBSERVATIONS 
} from './data/initialData';
import { 
  gerarLogsIniciais, 
  formatarDataPtBr, 
  formatarHoraPtBr, 
  verificarTurnoEncerrado, 
  calcularDiferencaMinutos,
  playFactoryChime,
  padronizarNomeTurno
} from './utils/factoryCalculations';

export default function App() {
  // 1. Core State with LocalStorage Persistence
  const [collaborators, setCollaborators] = useState<Collaborator[]>(() => {
    const saved = localStorage.getItem('mca_collaborators_v3');
    if (saved) {
      try {
        const parsed: Collaborator[] = JSON.parse(saved);
        return parsed.map((c) => ({
          ...c,
          shift: padronizarNomeTurno(c.shift),
        }));
      } catch (e) {
        console.error(e);
      }
    }
    return INITIAL_COLLABORATORS.map((c) => ({
      ...c,
      shift: padronizarNomeTurno(c.shift),
    }));
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
    try {
      const rawList: string[] = saved ? JSON.parse(saved) : INITIAL_OBSERVATIONS;
      return Array.from(
        new Set(
          rawList
            .map((o) => o.trim())
            .filter((o) => o && !o.toLowerCase().startsWith('sem observ'))
        )
      );
    } catch {
      return INITIAL_OBSERVATIONS;
    }
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
  const [leaderPin, setLeaderPin] = useState('8619');
  const [toleranceMinutes, setToleranceMinutes] = useState<number>(() => {
    const saved = localStorage.getItem('mca_tolerance_minutes_v3');
    return saved ? parseInt(saved, 10) : 60;
  });
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [drilldownFilter, setDrilldownFilter] = useState('');

  // 3. Save states to LocalStorage
  useEffect(() => {
    localStorage.setItem('mca_tolerance_minutes_v3', toleranceMinutes.toString());
  }, [toleranceMinutes]);
  useEffect(() => {
    localStorage.setItem('mca_collaborators_v3', JSON.stringify(collaborators));
  }, [collaborators]);

  useEffect(() => {
    localStorage.setItem('mca_activities_v3', JSON.stringify(activities));
  }, [activities]);

  useEffect(() => {
    localStorage.setItem('mca_shifts_v3', JSON.stringify(shifts));
  }, [shifts]);

  useEffect(() => {
    localStorage.setItem('mca_observations_v3', JSON.stringify(observations));
  }, [observations]);

  useEffect(() => {
    localStorage.setItem('mca_role_colors_v3', JSON.stringify(customRoleColors));
  }, [customRoleColors]);

  useEffect(() => {
    localStorage.setItem('mca_logs_v3', JSON.stringify(logs));
  }, [logs]);

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
  }, []);

  // 4. Auto Shift Closure Engine (Closes forgotten operations when shift ends)
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
              
              newNotifs.push({
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
              });

              return {
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

          newNotifs.push({
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
          });

          return {
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
  }, []);

  const handleDismissLeaderNotif = useCallback((notifId: string) => {
    setAutoCloseNotifs((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, readByLeader: true } : n))
    );
  }, []);

  const handleClearAllNotifs = useCallback(() => {
    setAutoCloseNotifs([]);
  }, []);

  // 5. Operations Handlers
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
            return {
              ...log,
              endTime: endTimeStr,
              durationMinutes: dur,
              status: 'Concluída',
              observation: observation || 'Operação Concluída com Sucesso sem Anomalias',
              notes: notes.trim() || undefined,
              partsProduced,
              scrapCount,
            };
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
            return {
              ...log,
              endTime: timeStr,
              durationMinutes: dur,
              status: 'Concluída' as const,
              observation: observation || 'Setup / Troca Rápida de Operação',
            };
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
  }, []);

  const handleUpdateLog = useCallback((updatedLog: ProductionLog) => {
    setLogs((prev) => prev.map((l) => (l.id === updatedLog.id ? updatedLog : l)));
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
    setCollaborators((prev) => [...prev, colabObj]);
  }, []);

  const handleDeleteCollaborator = useCallback((id: string) => {
    setCollaborators((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleToggleCollaboratorActive = useCallback((id: string) => {
    setCollaborators((prev) =>
      prev.map((c) => (c.id === id ? { ...c, active: !c.active } : c))
    );
  }, []);

  const handleDrilldownClick = useCallback((operatorName: string) => {
    setDrilldownFilter(operatorName);
  }, []);

  const activeCount = logs.filter((l) => l.status === 'Em Execução').length;
  const unreadLeaderAlertCount = autoCloseNotifs.filter((n) => !n.readByLeader).length;

  return (
    <div className="min-h-screen bg-[#050505] text-[#FFFFFF] flex flex-col font-sans antialiased">
      {/* Top Header */}
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
          />
        )}

        {activeTab === 'eficiencia' && (
          <EfficiencyView
            logs={logs}
            collaborators={collaborators}
            shifts={shifts}
            toleranceMinutes={toleranceMinutes}
            onUpdateToleranceMinutes={setToleranceMinutes}
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
            onUpdateToleranceMinutes={setToleranceMinutes}
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
            onUpdateActivities={setActivities}
            onUpdateShifts={setShifts}
            onUpdateObservations={setObservations}
            onUpdateRoleColors={setCustomRoleColors}
            onResetToDefaults={handleResetToDefaults}
          />
        )}

        {activeTab === 'turnos' && (
          <ShiftAndFactoryConfigView
            shifts={shifts}
            collaborators={collaborators}
            onSaveShifts={setShifts}
            onAddCollaborator={handleAddCollaborator}
            onDeleteCollaborator={handleDeleteCollaborator}
            onToggleCollaboratorActive={handleToggleCollaboratorActive}
          />
        )}
      </main>

      {/* Industrial Footer */}
      <footer className="bg-[#111111] border-t border-[#333333] text-[#888888] text-xs py-3 px-4 text-center">
        <div className="max-w-[1100px] mx-auto flex flex-wrap justify-between items-center gap-2">
          <span>MCA • MONITORAMENTO E CONTROLE DAS ATIVIDADES</span>
          <span className="font-mono text-[#666666] text-[11px]">
            Modo Chão de Fábrica & Gestão do Líder
          </span>
        </div>
      </footer>
    </div>
  );
}

