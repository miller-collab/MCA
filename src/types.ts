export interface Collaborator {
  id: string;
  name: string;
  role: string;
  shift: string; // "TURNO 1" | "TURNO 2" | "TURNO 3"
  active: boolean;
  avatarColor?: string;
}

export type ActivityCategory = 
  | 'Setup' 
  | 'Operação' 
  | 'Qualidade / Inspeção' 
  | 'Manutenção' 
  | '5S & Limpeza' 
  | 'Logística / Almoxarifado' 
  | 'Sistema & Processo';

export interface ActivityItem {
  id: string;
  role: string;
  name: string;
  priority: number;
  category: ActivityCategory;
  standardMinutes?: number;
}

export interface ShiftConfig {
  id: string;
  name: string;
  code: string; // "t1", "t2", "t3"
  entrada: string; // "08:00"
  saidaAlmoco: string; // "12:00"
  retornoAlmoco: string; // "13:00"
  saida: string; // "17:48"
  dias: string[]; // ["Seg", "Ter", "Qua", "Qui", "Sex"]
  color: string;
}

export interface ProductionLog {
  id: string;
  date: string; // "DD/MM/YYYY"
  collaboratorName: string;
  role: string;
  shift?: string; // e.g. "TURNO 1" | "TURNO 2" | "TURNO 3"
  activity: string;
  category?: ActivityCategory;
  startTime: string; // "HH:mm:ss"
  endTime?: string; // "HH:mm:ss"
  durationMinutes?: number;
  status: 'Em Execução' | 'Concluída' | 'Pausada';
  observation?: string;
  notes?: string;
  machineId?: string;
  partsProduced?: number;
  scrapCount?: number;
  autoClosed?: boolean;
  autoClosedAtShiftEnd?: boolean;
  pendingNextShiftResume?: boolean;
  resumedFromPreviousLogId?: string;
  
  // Refeição (Almoço / Janta)
  isMealPause?: boolean;
  mealBreakDeducted?: boolean;
  mealBreakMinutes?: number;
  mealBreakSource?: 'manual' | 'automatic';
  mealPauseStartTime?: string;
  mealPauseTimestampMs?: number;
  mealPauseDurationMinutes?: number;
  totalPausedSeconds?: number;
  mealResumedAt?: string;
}

export interface AutoCloseNotification {
  id: string;
  logId: string;
  collaboratorName: string;
  role: string;
  activity: string;
  shiftName: string;
  shiftEnd: string;
  date: string;
  timestamp: number;
  readByOperator?: boolean;
  readByLeader?: boolean;
}

export interface EfficiencyThresholds {
  green: number; // Ex: 85 (Meta Excelente >= 85%)
  yellow: number; // Ex: 70 (Faixa de Atenção 70% - 84%)
}

export interface OperatorEfficiency {
  nome: string;
  role: string;
  turno: string;
  turnoEntrada: string;
  turnoSaida: string;
  esperadoMinutos: number;
  trabalhadoMinutos: number;
  semApontarMinutos: number;
  eficienciaPct: number;
  eficienciaRaw: number;
  isFimDoTurno: boolean;
  isAlertaSemApontar: boolean;
  statusTurno?: 'EM_ANDAMENTO' | 'NAO_INICIADO' | 'ENCERRADO' | 'FOLGA';
  tempoOciosoAtualMinutos?: number;
  motivoAlerta?: string;
  isLivreAgora?: boolean;
  ultimaAtividadeFim?: string;
  operacoes: {
    nome: string;
    tempoMinutos: number;
    category?: string;
  }[];
}

export interface AIAnalysisResponse {
  summary: string;
  overallScore: number;
  efficiencyRating: 'Excelente' | 'Boa' | 'Atenção' | 'Crítica';
  highlights: string[];
  bottlenecks: string[];
  actionPlan: string[];
  leanRecommendations: string[];
}
