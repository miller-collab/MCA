import { ProductionLog, ShiftConfig, OperatorEfficiency, Collaborator, ActivityItem, DailyCollaboratorEfficiency } from '../types';

/**
 * Calculates the difference in minutes between two "HH:mm" or "HH:mm:ss" strings.
 * Handles shifts crossing midnight seamlessly (e.g. 22:00 to 02:00 = 240 mins).
 */
export function calcularDiferencaMinutos(hora1?: string, hora2?: string): number {
  if (!hora1 || !hora2) return 0;
  try {
    const p1 = hora1.split(':');
    const p2 = hora2.split(':');
    const min1 = parseInt(p1[0], 10) * 60 + parseInt(p1[1], 10);
    const min2 = parseInt(p2[0], 10) * 60 + parseInt(p2[1], 10);

    let diff = min2 - min1;
    if (diff < 0) {
      diff += 24 * 60; // Compensação matemática para virada de meia-noite
    }
    return diff;
  } catch {
    return 0;
  }
}

/**
 * Formats total seconds into HH:MM:SS
 */
export function formatarTempoSegundos(segundosTotais: number): string {
  if (isNaN(segundosTotais) || segundosTotais < 0) return '00:00:00';
  const h = Math.floor(segundosTotais / 3600);
  const m = Math.floor((segundosTotais % 3600) / 60);
  const s = Math.floor(segundosTotais % 60);
  return (
    (h < 10 ? '0' : '') + h + ':' +
    (m < 10 ? '0' : '') + m + ':' +
    (s < 10 ? '0' : '') + s
  );
}

/**
 * Formats minutes into "Xh Ym"
 */
export function formatarHorasMinutos(minutosTotais: number): string {
  if (isNaN(minutosTotais) || minutosTotais <= 0) return '0h 00m';
  const hrs = Math.floor(minutosTotais / 60);
  const min = Math.round(minutosTotais % 60);
  return `${hrs}h ${min < 10 ? '0' + min : min}m`;
}

/**
 * Formats Date to "DD/MM/YYYY" using America/Sao_Paulo timezone
 */
export function formatarDataPtBr(date: Date): string {
  if (!date || isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/**
 * Formats Date to "YYYY-MM-DD" (ISO input format) using America/Sao_Paulo timezone
 */
export function formatarDataIsoPtBr(date: Date): string {
  if (!date || isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Returns today's date formatted as "YYYY-MM-DD" in America/Sao_Paulo timezone
 */
export function obterDataHojeIsoPtBr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Formats Date to "HH:mm:ss" using America/Sao_Paulo timezone
 */
export function formatarHoraPtBr(date: Date): string {
  if (!date || isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Returns "HH:mm" in America/Sao_Paulo timezone
 */
export function obterHoraMinutoPtBr(date: Date = new Date()): string {
  if (!date || isNaN(date.getTime())) return '00:00';
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const h = parts.find((p) => p.type === 'hour')?.value || '00';
  const m = parts.find((p) => p.type === 'minute')?.value || '00';
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

/**
 * Returns day-of-week abbreviation ('Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab') in America/Sao_Paulo timezone
 */
export function obterDiaSemanaSiglaPtBr(date: Date = new Date()): string {
  if (!date || isNaN(date.getTime())) return 'Seg';
  const weekdayStr = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
  }).format(date).toLowerCase();

  if (weekdayStr.startsWith('dom')) return 'Dom';
  if (weekdayStr.startsWith('seg')) return 'Seg';
  if (weekdayStr.startsWith('ter')) return 'Ter';
  if (weekdayStr.startsWith('qua')) return 'Qua';
  if (weekdayStr.startsWith('qui')) return 'Qui';
  if (weekdayStr.startsWith('sex')) return 'Sex';
  if (weekdayStr.startsWith('s')) return 'Sab';
  return 'Seg';
}

export interface MealBreakConfig {
  shiftName: string;
  saidaAlmoco: string; // Ex: "12:00"
  retornoAlmoco: string; // Ex: "13:30"
  duracaoMinutos: number; // Ex: 90
  shift?: ShiftConfig;
}

/**
 * Converte string "HH:mm" ou "HH:mm:ss" em minutos a partir de 00:00
 */
export function timeToMinutesOfDay(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

/**
 * Obtém os horários e duração de refeição (almoço/janta) do colaborador ou turno
 */
export function obterConfiguracaoRefeicao(
  colabOrShift: string,
  shifts: ShiftConfig[],
  collaborators?: Collaborator[]
): MealBreakConfig {
  // 1. Prioriza configuração individual do colaborador
  if (collaborators && collaborators.length > 0 && colabOrShift) {
    const colab = collaborators.find(
      (c) =>
        c.name.trim().toLowerCase() === colabOrShift.trim().toLowerCase() ||
        c.id === colabOrShift
    );
    if (colab) {
      // Prioridade máxima: tempo de refeição definido diretamente pelo líder (em minutos)
      if (colab.mealDurationMinutes !== undefined && colab.mealDurationMinutes > 0) {
        return {
          shiftName: colab.shift || 'Turno 1',
          saidaAlmoco: colab.mealStart || '12:00',
          retornoAlmoco: colab.mealEnd || '13:30',
          duracaoMinutos: colab.mealDurationMinutes,
        };
      }
      if (colab.mealStart && colab.mealEnd) {
        const dur = calcularDiferencaMinutos(colab.mealStart, colab.mealEnd);
        return {
          shiftName: colab.shift || 'Turno 1',
          saidaAlmoco: colab.mealStart,
          retornoAlmoco: colab.mealEnd,
          duracaoMinutos: dur > 0 ? dur : (colab.shift?.includes('1') ? 90 : 60),
        };
      }
      // Se não tiver horário customizado, usa o turno do colaborador
      colabOrShift = colab.shift || colabOrShift;
    }
  }

  const normShift = (colabOrShift || 'Turno 1').toUpperCase().trim();
  const shift = shifts.find(
    (s) =>
      s.name.toUpperCase().trim() === normShift ||
      s.code.toUpperCase().trim() === normShift ||
      normShift.includes(s.name.toUpperCase().trim()) ||
      s.name.toUpperCase().includes(normShift)
  );

  if (shift && shift.saidaAlmoco && shift.retornoAlmoco) {
    const dur = calcularDiferencaMinutos(shift.saidaAlmoco, shift.retornoAlmoco);
    return {
      shiftName: shift.name,
      saidaAlmoco: shift.saidaAlmoco,
      retornoAlmoco: shift.retornoAlmoco,
      duracaoMinutos: dur > 0 ? dur : (normShift.includes('1') ? 90 : 60),
      shift,
    };
  }

  // Fallbacks seguros conforme parametrização industrial
  if (normShift.includes('2') || normShift.includes('T2')) {
    return {
      shiftName: 'Turno 2',
      saidaAlmoco: '20:00',
      retornoAlmoco: '21:00',
      duracaoMinutos: 60,
    };
  } else if (normShift.includes('3') || normShift.includes('T3')) {
    return {
      shiftName: 'Turno 3',
      saidaAlmoco: '02:00',
      retornoAlmoco: '03:00',
      duracaoMinutos: 60,
    };
  }

  return {
    shiftName: 'Turno 1',
    saidaAlmoco: '12:00',
    retornoAlmoco: '13:30',
    duracaoMinutos: 90,
  };
}

/**
 * Identifica se a atividade ou categoria se refere a REFEIÇÃO / ALMOÇO / INTERVALO
 */
export function isMealActivity(activityName?: string, category?: string): boolean {
  if (!activityName && !category) return false;
  const act = (activityName || '').trim().toUpperCase();
  const cat = (category || '').trim().toUpperCase();

  return (
    act === 'REFEIÇÃO' ||
    act === 'REFEICAO' ||
    act === 'ALMOÇO' ||
    act === 'ALMOCO' ||
    act === 'PAUSA REFEIÇÃO' ||
    act === 'PAUSA REFEICAO' ||
    act === 'PAUSA ALMOÇO' ||
    act === 'PAUSA ALMOCO' ||
    act === 'HORÁRIO DE ALMOÇO' ||
    act === 'HORARIO DE ALMOCO' ||
    act.includes('REFEIÇÃO') ||
    act.includes('REFEICAO') ||
    act.includes('ALMOÇO') ||
    act.includes('ALMOCO') ||
    cat === 'REFEIÇÃO' ||
    cat === 'REFEICAO' ||
    cat === 'PAUSA'
  );
}

/**
 * Verifica se o colaborador já utilizou a pausa ou dedução de refeição hoje (limite de 1x ao dia)
 */
export function colaboradorJaUsouRefeicaoHoje(
  collaboratorName: string,
  date: string,
  logs: ProductionLog[]
): boolean {
  if (!collaboratorName || !date) return false;
  const colabKey = collaboratorName.trim().toLowerCase();

  return logs.some((l) => {
    if (l.date !== date) return false;
    if (l.collaboratorName.trim().toLowerCase() !== colabKey) return false;

    if (l.isMealPause || l.mealBreakDeducted) return true;
    if (isMealActivity(l.activity, l.category)) return true;
    if (
      l.observation &&
      (l.observation.includes('🍽️') ||
        l.observation.toLowerCase().includes('almoço debitado') ||
        l.observation.toLowerCase().includes('refeição debitada') ||
        l.observation.toLowerCase().includes('pausa para refeição'))
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Calcula a sobreposição de minutos entre um período de trabalho e o intervalo de refeição do turno
 */
export function calcularSobreposicaoRefeicaoMinutos(
  startTime: string,
  endTime: string,
  saidaAlmoco: string,
  retornoAlmoco: string
): number {
  if (!startTime || !endTime || !saidaAlmoco || !retornoAlmoco) return 0;

  const tStart = timeToMinutesOfDay(startTime);
  let tEnd = timeToMinutesOfDay(endTime);
  if (tEnd < tStart) tEnd += 24 * 60; // Virada de meia-noite

  let tMealStart = timeToMinutesOfDay(saidaAlmoco);
  let tMealEnd = timeToMinutesOfDay(retornoAlmoco);
  if (tMealEnd < tMealStart) tMealEnd += 24 * 60;

  // Se o almoço está no ciclo noturno
  if (tMealStart < tStart && tMealStart + 24 * 60 <= tEnd) {
    tMealStart += 24 * 60;
    tMealEnd += 24 * 60;
  }

  const overlapStart = Math.max(tStart, tMealStart);
  const overlapEnd = Math.min(tEnd, tMealEnd);

  if (overlapEnd > overlapStart) {
    const mealDuration = tMealEnd - tMealStart;
    const overlap = overlapEnd - overlapStart;
    return Math.min(overlap, mealDuration);
  }

  return 0;
}

/**
 * Calcula a duração de uma atividade aplicando dedução automática de refeição caso tenha atravessado o almoço
 */
export function calcularDuracaoComDeducaoRefeicao(
  startTime: string,
  endTime: string,
  colabOrShift: string,
  shifts: ShiftConfig[],
  jaTeveRefeicaoNoDia: boolean = false,
  collaborators?: Collaborator[]
): {
  duracaoLiquida: number;
  minutosRefeicaoDeduzidos: number;
  deveDebitarRefeicao: boolean;
} {
  const duracaoBruta = calcularDiferencaMinutos(startTime, endTime);
  if (jaTeveRefeicaoNoDia || duracaoBruta <= 0) {
    return {
      duracaoLiquida: duracaoBruta,
      minutosRefeicaoDeduzidos: 0,
      deveDebitarRefeicao: false,
    };
  }

  const mealConfig = obterConfiguracaoRefeicao(colabOrShift, shifts, collaborators);
  const startSec = timeToSecondsOfDay(startTime);
  const endSec = timeToSecondsOfDay(endTime);
  const mealStartSec = timeToSecondsOfDay(mealConfig.saidaAlmoco);
  const mealEndSec = timeToSecondsOfDay(mealConfig.retornoAlmoco);

  // A dedução integral da refeição (ex: 90 min) ocorre quando:
  // 1. A atividade começou antes ou no início do almoço e terminou após o retorno, ou cruzou o intervalo de refeição
  const cruzouAlmoco = (startSec <= mealStartSec + 300 && endSec >= mealEndSec - 300) ||
    (duracaoBruta >= mealConfig.duracaoMinutos + 15 && startSec < mealEndSec && endSec > mealStartSec);

  // 2. Ou caso o colaborador tenha esquecido de lançar e a atividade finalizou no fim do turno (ou passou do retorno do almoço)
  const shift = shifts.find(
    (s) =>
      padronizarNomeTurno(s.name) === padronizarNomeTurno(mealConfig.shiftName) ||
      padronizarNomeTurno(s.code) === padronizarNomeTurno(mealConfig.shiftName)
  ) || shifts[0];
  const shiftSaidaSec = timeToSecondsOfDay(shift?.saida || '17:30');
  const terminouFimTurno = (endSec >= shiftSaidaSec - 1800 || endSec >= mealEndSec) && duracaoBruta > mealConfig.duracaoMinutos;

  if (cruzouAlmoco || terminouFimTurno) {
    const deducao = mealConfig.duracaoMinutos; // Sempre o valor integral configurado (ex: 90 min)
    const duracaoLiquida = Math.max(1, duracaoBruta - deducao);
    return {
      duracaoLiquida,
      minutosRefeicaoDeduzidos: deducao,
      deveDebitarRefeicao: true,
    };
  }

  return {
    duracaoLiquida: duracaoBruta,
    minutosRefeicaoDeduzidos: 0,
    deveDebitarRefeicao: false,
  };
}

export interface ActivityTimerState {
  tempoTrabalhadoSegundos: number;
  emPausaRefeicao: boolean;
  tempoRestantePausaSegundos: number;
  tempoDecorridoPausaSegundos: number;
  duracaoPausaMinutos: number;
  pausaVenceuRetomou: boolean;
}

/**
 * Calcula com precisão matemática em tempo real o estado de contagem da atividade,
 * congelando durante a refeição e retomando automaticamente ao vencer o tempo configurado (ex: 90 min).
 */
export function calcularEstadoTempoAtividade(
  log: ProductionLog,
  now: Date = new Date(),
  shifts: ShiftConfig[] = [],
  collaborators: Collaborator[] = []
): ActivityTimerState {
  if (!log || !log.startTime) {
    return {
      tempoTrabalhadoSegundos: 0,
      emPausaRefeicao: false,
      tempoRestantePausaSegundos: 0,
      tempoDecorridoPausaSegundos: 0,
      duracaoPausaMinutos: 0,
      pausaVenceuRetomou: false,
    };
  }

  const nowMs = now.getTime();

  // Converter log.startTime para milissegundos
  const parts = log.startTime.split(':');
  const startHours = parseInt(parts[0], 10) || 0;
  const startMins = parseInt(parts[1], 10) || 0;
  const startSecs = parseInt(parts[2] || '0', 10) || 0;

  const startDate = new Date(now);
  startDate.setHours(startHours, startMins, startSecs, 0);

  // Compensação se a atividade iniciou no dia anterior / virada noturna
  if (startDate.getTime() > nowMs) {
    startDate.setDate(startDate.getDate() - 1);
  }

  const totalSegundosDesdeInicio = Math.max(0, Math.floor((nowMs - startDate.getTime()) / 1000));
  const mealConfig = obterConfiguracaoRefeicao(log.collaboratorName || log.shift || 'Turno 1', shifts, collaborators);
  const duracaoPausaMinutos = log.mealPauseDurationMinutes || log.mealBreakMinutes || mealConfig.duracaoMinutos || 90;
  const duracaoPausaSegundos = duracaoPausaMinutos * 60;

  // Se o log está em estado de pausa de refeição
  if (log.isMealPause || log.status === 'Pausada') {
    let pauseStartMs: number;
    if (log.mealPauseTimestampMs) {
      pauseStartMs = log.mealPauseTimestampMs;
    } else if (log.mealPauseStartTime) {
      const pParts = log.mealPauseStartTime.split(':');
      const pDate = new Date(now);
      pDate.setHours(
        parseInt(pParts[0], 10) || 0,
        parseInt(pParts[1], 10) || 0,
        parseInt(pParts[2] || '0', 10) || 0,
        0
      );
      if (pDate.getTime() > nowMs) {
        pDate.setDate(pDate.getDate() - 1);
      }
      pauseStartMs = pDate.getTime();
    } else {
      pauseStartMs = nowMs;
    }

    const tempoDecorridoPausaMs = Math.max(0, nowMs - pauseStartMs);
    const tempoDecorridoPausaSegundos = Math.floor(tempoDecorridoPausaMs / 1000);
    const duracaoPausaTotalMs = duracaoPausaSegundos * 1000;

    if (tempoDecorridoPausaMs < duracaoPausaTotalMs) {
      // AINDA EM REFEIÇÃO (TEMPO DE TRABALHO CONGELADO)
      const tempoRestantePausaSegundos = Math.max(
        0,
        Math.floor((duracaoPausaTotalMs - tempoDecorridoPausaMs) / 1000)
      );
      const tempoCongeladoTrabalhadoSegundos = Math.max(
        0,
        Math.floor((pauseStartMs - startDate.getTime()) / 1000) - (log.totalPausedSeconds || 0)
      );

      return {
        tempoTrabalhadoSegundos: tempoCongeladoTrabalhadoSegundos,
        emPausaRefeicao: true,
        tempoRestantePausaSegundos,
        tempoDecorridoPausaSegundos,
        duracaoPausaMinutos,
        pausaVenceuRetomou: false,
      };
    } else {
      // VENCEU A REFEIÇÃO!
      // Volta a contar o tempo na mesma atividade descontando exatamente os minutos de refeição configurados
      const tempoTrabalhadoAposPausa = Math.max(0, totalSegundosDesdeInicio - duracaoPausaSegundos);

      return {
        tempoTrabalhadoSegundos: tempoTrabalhadoAposPausa,
        emPausaRefeicao: false,
        tempoRestantePausaSegundos: 0,
        tempoDecorridoPausaSegundos: duracaoPausaSegundos,
        duracaoPausaMinutos,
        pausaVenceuRetomou: true,
      };
    }
  }

  // Se não está em pausa atualmente, verifica se já atravessou o horário do almoço hoje ou se já teve dedução
  const startSec = timeToSecondsOfDay(log.startTime);
  const nowTimePtBr = formatarHoraPtBr(now);
  const nowSec = timeToSecondsOfDay(nowTimePtBr);
  const mealStartSec = timeToSecondsOfDay(mealConfig.saidaAlmoco);
  const mealEndSec = timeToSecondsOfDay(mealConfig.retornoAlmoco);

  const cruzouHorarioAlmoco =
    (startSec <= mealStartSec + 300 && nowSec >= mealEndSec - 60) ||
    (totalSegundosDesdeInicio >= (duracaoPausaMinutos + 30) * 60 && startSec < mealStartSec + 600 && nowSec > mealEndSec - 600);

  const deveDeduzirRefeicao = Boolean(log.mealBreakDeducted || cruzouHorarioAlmoco);
  const tempoPausadoAnterior =
    log.totalPausedSeconds || (deveDeduzirRefeicao ? (log.mealBreakMinutes || duracaoPausaMinutos) * 60 : 0);
  const tempoTrabalhadoSegundos = Math.max(0, totalSegundosDesdeInicio - tempoPausadoAnterior);

  return {
    tempoTrabalhadoSegundos,
    emPausaRefeicao: false,
    tempoRestantePausaSegundos: 0,
    tempoDecorridoPausaSegundos: deveDeduzirRefeicao ? duracaoPausaSegundos : 0,
    duracaoPausaMinutos,
    pausaVenceuRetomou: deveDeduzirRefeicao,
  };
}

/**
 * Converte horário "HH:mm:ss" ou "HH:mm" para segundos do dia para comparações exatas
 */
export function timeToSecondsOfDay(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map((p) => parseInt(p, 10) || 0);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const s = parts[2] || 0;
  return h * 3600 + m * 60 + s;
}

/**
 * Converte horário "HH:mm:ss" ou "HH:mm" para segundos relativos ao início do turno,
 * tratando perfeitamente turnos noturnos que cruzam a meia-noite (ex: Turno 2 das 17:00 às 01:30).
 * Ex: Em um turno das 17:00 às 01:30:
 * - 17:00 -> 61200s
 * - 19:18 -> 69516s
 * - 00:30 -> 88200s (1800 + 86400)
 * - 01:30 -> 91800s (5400 + 86400)
 */
export function timeToShiftRelativeSeconds(timeStr: string, shiftEntrada: string = '07:00', isOvernight: boolean = false): number {
  if (!timeStr) return 0;
  const tSec = timeToSecondsOfDay(timeStr);
  const entSec = timeToSecondsOfDay(shiftEntrada);

  if (!isOvernight) {
    return tSec;
  }

  // Turno noturno (cruza meia-noite): horários da madrugada (00:00 às 12:00) vêm DEPOIS das 23:59:59
  if (tSec < entSec && tSec < 12 * 3600) {
    return tSec + 86400;
  }
  return tSec;
}

/**
 * Garante a regra fundamental industrial de produção:
 * 1. Cada colaborador executa no máximo 1 atividade por vez.
 * 2. As atividades de um mesmo dia formam uma linha do tempo contínua sem nenhuma colisão ou sobreposição temporal.
 * 3. Se uma nova atividade foi iniciada às 15:32:42, a atividade anterior OBRIGATORIAMENTE encerra às 15:32:42.
 * 4. Micro-cliques duplicados (< 5 segundos de diferença com mesma atividade e duração zero) são descartados.
 * 5. Dedução de refeição de 90 min (ou configurada para o turno) é aplicada com clareza no registro que atravessou o intervalo.
 * 6. Encerra automaticamente registros no fim do turno (ex: 17:30 para Turno 1, 01:30 para Turno 2).
 */
export function desduplicarLogsAtivos(
  logs: ProductionLog[],
  collaborators?: Collaborator[],
  shifts?: ShiftConfig[]
): {
  sanitizedLogs: ProductionLog[];
  logsParaFinalizar: ProductionLog[];
  logsParaDeletar: string[];
} {
  const sanitizedLogs: ProductionLog[] = [];
  const logsParaFinalizar: ProductionLog[] = [];
  const logsParaDeletar: string[] = [];
  const agora = new Date();
  const hojePtBr = formatarDataPtBr(agora);

  // 1. Filtra registros residuais sintéticos de retomada
  const validLogs: ProductionLog[] = [];
  for (const log of logs) {
    if (log.id.startsWith('log-resume-') || log.resumedFromPreviousLogId) {
      logsParaDeletar.push(log.id);
      continue;
    }
    const cleanLog: ProductionLog = log.pendingNextShiftResume
      ? { ...log, pendingNextShiftResume: false }
      : log;
    validLogs.push(cleanLog);
  }

  // 2. Agrupa logs por colaborador e por data para sanitizar a linha do tempo cronológica
  const groups = new Map<string, ProductionLog[]>();
  for (const log of validLogs) {
    const colabKey = (log.collaboratorName || '').trim().toLowerCase();
    const dateKey = log.date || hojePtBr;
    const groupKey = `${colabKey}__${dateKey}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(log);
  }

  // 3. Processa cada grupo (colaborador + dia)
  for (const [, groupLogs] of groups.entries()) {
    if (groupLogs.length === 0) continue;

    const sampleLog = groupLogs[0];
    const colabKey = sampleLog.collaboratorName.trim().toLowerCase();
    const dateStr = sampleLog.date || hojePtBr;
    const isPreviousDay = dateStr !== hojePtBr;

    // Busca configuração do turno do colaborador
    let shiftSaida = '17:30';
    let shiftEntrada = '07:00';
    let shiftDias: string[] | undefined = undefined;
    let colabShiftName = sampleLog.shift || 'Turno 1';

    if (collaborators && shifts && shifts.length > 0) {
      const colab = collaborators.find((c) => c.name.trim().toLowerCase() === colabKey);
      colabShiftName = colab?.shift || sampleLog.shift || 'Turno 1';
      const foundShift = shifts.find(
        (s) =>
          padronizarNomeTurno(s.name) === padronizarNomeTurno(colabShiftName) ||
          padronizarNomeTurno(s.code) === padronizarNomeTurno(colabShiftName) ||
          s.name.toUpperCase().includes(colabShiftName.toUpperCase())
      ) || shifts[0];

      shiftSaida = foundShift.saida || '17:30';
      shiftEntrada = foundShift.entrada || '07:00';
      shiftDias = foundShift.dias;
    }

    const isOvernight = timeToSecondsOfDay(shiftEntrada) > timeToSecondsOfDay(shiftSaida);
    const shiftEnded = isPreviousDay || verificarTurnoEncerrado(shiftSaida, shiftEntrada, shiftDias, agora);
    const mealConfig = obterConfiguracaoRefeicao(colabKey, shifts || [], collaborators || []);

    // Ordena cronologicamente por horário de início respeitando turnos noturnos
    groupLogs.sort((a, b) => {
      const secA = timeToShiftRelativeSeconds(a.startTime, shiftEntrada, isOvernight);
      const secB = timeToShiftRelativeSeconds(b.startTime, shiftEntrada, isOvernight);
      if (secA !== secB) return secA - secB;
      // Se empatar no mesmo segundo, desempata por timestamp ou ID
      return (a.id || '').localeCompare(b.id || '');
    });

    // Remove duplicatas imediatas geradas por duplo clique no mesmo segundo
    const deduplicatedTimeline: ProductionLog[] = [];
    for (let i = 0; i < groupLogs.length; i++) {
      const current = groupLogs[i];
      const next = groupLogs[i + 1];

      if (
        next &&
        current.activity === next.activity &&
        Math.abs(timeToShiftRelativeSeconds(next.startTime, shiftEntrada, isOvernight) - timeToShiftRelativeSeconds(current.startTime, shiftEntrada, isOvernight)) <= 3 &&
        (current.durationMinutes === undefined || current.durationMinutes <= 1)
      ) {
        // Registro redundante gerado por clique duplo rápido: descarta do banco
        logsParaDeletar.push(current.id);
        continue;
      }
      deduplicatedTimeline.push(current);
    }

    // Controla se a refeição já foi deduzida em algum registro deste colaborador neste dia
    let hasMealBeenDeductedToday = deduplicatedTimeline.some(
      (l) => l.isMealPause || (l.mealBreakDeducted && l.status === 'Concluída')
    );

    const totalLogsInDay = deduplicatedTimeline.length;

    for (let i = 0; i < totalLogsInDay; i++) {
      const current = deduplicatedTimeline[i];
      const isLastLogOfDay = i === totalLogsInDay - 1;
      let needsUpdate = false;
      let updatedLog: ProductionLog = { ...current };

      if (!isLastLogOfDay) {
        // Há uma atividade subsequente no mesmo dia:
        // A atividade atual OBRIGATORIAMENTE encerra no momento de início da próxima atividade!
        const nextLog = deduplicatedTimeline[i + 1];
        const nextStartTime = nextLog.startTime;
        const currentEndSec = current.endTime ? timeToShiftRelativeSeconds(current.endTime, shiftEntrada, isOvernight) : 0;
        const nextStartSec = timeToShiftRelativeSeconds(nextStartTime, shiftEntrada, isOvernight);
        const shiftSaidaSec = timeToShiftRelativeSeconds(shiftSaida, shiftEntrada, isOvernight);

        if (
          current.status !== 'Concluída' ||
          !current.endTime ||
          currentEndSec > nextStartSec ||
          (current.autoClosedAtShiftEnd && nextStartSec < shiftSaidaSec)
        ) {
          // Ajusta o fim para coincidir exatamente com o início da próxima
          updatedLog.endTime = nextStartTime;
          updatedLog.status = 'Concluída';
          updatedLog.autoClosed = false;
          updatedLog.autoClosedAtShiftEnd = false;
          needsUpdate = true;
        }

        // Calcula a duração líquida sem sobreposição
        const endCalculo = updatedLog.endTime || nextStartTime;
        const durBruta = calcularDiferencaMinutos(updatedLog.startTime, endCalculo);

        // Aplica dedução de refeição se a atividade atravessou o intervalo de refeição
        let mealMins = 0;
        let mealDeducted = Boolean(updatedLog.mealBreakDeducted);

        const startSec = timeToShiftRelativeSeconds(updatedLog.startTime, shiftEntrada, isOvernight);
        const endSec = timeToShiftRelativeSeconds(endCalculo, shiftEntrada, isOvernight);
        const mealStartSec = timeToShiftRelativeSeconds(mealConfig.saidaAlmoco, shiftEntrada, isOvernight);
        const mealEndSec = timeToShiftRelativeSeconds(mealConfig.retornoAlmoco, shiftEntrada, isOvernight);

        const cruzouAlmoco =
          (startSec <= mealStartSec + 300 && endSec >= mealEndSec - 300) ||
          (durBruta >= mealConfig.duracaoMinutos + 15 && startSec < mealStartSec + 600 && endSec > mealEndSec - 600);

        if (!hasMealBeenDeductedToday && durBruta >= mealConfig.duracaoMinutos && cruzouAlmoco) {
          mealMins = mealConfig.duracaoMinutos; // Deduz sempre a refeição integral (ex: 90 min)
          mealDeducted = true;
          hasMealBeenDeductedToday = true;
        } else if (updatedLog.isMealPause) {
          mealDeducted = true;
          mealMins = updatedLog.mealBreakMinutes || mealConfig.duracaoMinutos || 90;
        } else {
          // Se não cruzou o almoço integralmente e não é pausa de refeição explícita, não deduz refeição
          mealDeducted = false;
          mealMins = 0;
        }

        const durLiquida = mealDeducted ? Math.max(1, durBruta - mealMins) : Math.max(1, durBruta);

        if (
          updatedLog.durationMinutes !== durLiquida ||
          updatedLog.mealBreakDeducted !== mealDeducted ||
          (mealDeducted && updatedLog.mealBreakMinutes !== mealMins) ||
          (!mealDeducted && updatedLog.mealBreakMinutes !== undefined)
        ) {
          updatedLog.durationMinutes = durLiquida;
          updatedLog.mealBreakDeducted = mealDeducted;
          updatedLog.mealBreakMinutes = mealDeducted ? mealMins : undefined;
          updatedLog.mealBreakSource = mealDeducted ? updatedLog.mealBreakSource || 'automatic' : undefined;
          needsUpdate = true;
        }
      } else {
        // Último log do dia para este colaborador:
        // Se for do dia atual e estiver Em Execução ou Pausada, DEVE PERMANECER ATIVO na tela do operador!
        if (isPreviousDay && (current.status === 'Em Execução' || current.status === 'Pausada')) {
          // Atividade de dia anterior que ficou esquecida aberta: encerra com segurança no horário de saída do turno
          updatedLog.status = 'Concluída';
          updatedLog.endTime = current.endTime || shiftSaida;
          updatedLog.autoClosed = true;
          updatedLog.autoClosedAtShiftEnd = true;
          needsUpdate = true;
        } else if (current.status === 'Concluída' && !current.endTime) {
          updatedLog.endTime = shiftSaida;
          needsUpdate = true;
        }

        // Se o log está Concluído, calcula duração líquida e refeição
        if (updatedLog.status === 'Concluída') {
          const endCalculo = updatedLog.endTime || shiftSaida;
          const durBruta = calcularDiferencaMinutos(updatedLog.startTime, endCalculo);

          let mealMins = 0;
          let mealDeducted = Boolean(updatedLog.mealBreakDeducted);

          const startSec = timeToShiftRelativeSeconds(updatedLog.startTime, shiftEntrada, isOvernight);
          const endSec = timeToShiftRelativeSeconds(endCalculo, shiftEntrada, isOvernight);
          const mealStartSec = timeToShiftRelativeSeconds(mealConfig.saidaAlmoco, shiftEntrada, isOvernight);
          const mealEndSec = timeToShiftRelativeSeconds(mealConfig.retornoAlmoco, shiftEntrada, isOvernight);

          const cruzouAlmoco =
            (startSec <= mealStartSec + 300 && endSec >= mealEndSec - 300) ||
            (durBruta >= mealConfig.duracaoMinutos + 15 && startSec < mealStartSec + 600 && endSec > mealEndSec - 600);

          if (!hasMealBeenDeductedToday && durBruta >= mealConfig.duracaoMinutos && cruzouAlmoco) {
            mealMins = mealConfig.duracaoMinutos; // Deduz sempre a refeição integral (ex: 90 min)
            mealDeducted = true;
            hasMealBeenDeductedToday = true;
          } else if (updatedLog.isMealPause) {
            mealDeducted = true;
            mealMins = updatedLog.mealBreakMinutes || mealConfig.duracaoMinutos || 90;
          } else {
            mealDeducted = false;
            mealMins = 0;
          }

          const durLiquida = mealDeducted ? Math.max(1, durBruta - mealMins) : Math.max(1, durBruta);

          if (
            updatedLog.durationMinutes !== durLiquida ||
            updatedLog.mealBreakDeducted !== mealDeducted ||
            (mealDeducted && updatedLog.mealBreakMinutes !== mealMins) ||
            (!mealDeducted && updatedLog.mealBreakMinutes !== undefined)
          ) {
            updatedLog.durationMinutes = durLiquida;
            updatedLog.mealBreakDeducted = mealDeducted;
            updatedLog.mealBreakMinutes = mealDeducted ? mealMins : undefined;
            updatedLog.mealBreakSource = mealDeducted ? updatedLog.mealBreakSource || 'automatic' : undefined;
            needsUpdate = true;
          }

          if (needsUpdate && isPreviousDay && !updatedLog.observation?.includes('Encerrado Automaticamente')) {
            updatedLog.observation = updatedLog.observation
              ? `${updatedLog.observation} | ⚠️ Encerrado Automaticamente: Fim de Turno (${shiftSaida})`
              : `⚠️ Encerrado Automaticamente: Fim de Turno (${shiftSaida})`;
          }
        }
      }

      sanitizedLogs.push(updatedLog);
      if (needsUpdate) {
        logsParaFinalizar.push(updatedLog);
      }
    }
  }

  return { sanitizedLogs, logsParaFinalizar, logsParaDeletar };
}

/**
 * Calculates the net expected working minutes in a shift
 */
export function calcularCargaHorariaTurno(shift: ShiftConfig): number {
  if (!shift || !shift.entrada || !shift.saida) return 0;
  // If shift has no working days, it is inactive (0 expected minutes)
  if (!shift.dias || shift.dias.length === 0) return 0;

  const trabalho1 = calcularDiferencaMinutos(shift.entrada, shift.saidaAlmoco || shift.saida);
  const trabalho2 = shift.saidaAlmoco && shift.retornoAlmoco && shift.saida
    ? calcularDiferencaMinutos(shift.retornoAlmoco, shift.saida)
    : 0;
  return trabalho1 + trabalho2;
}

export type ShiftStatus = 'EM_ANDAMENTO' | 'NAO_INICIADO' | 'ENCERRADO' | 'FOLGA';

/**
 * Retorna o status exato do turno em uma data específica e horário:
 * - 'FOLGA': Dia de folga (não está nos dias de operação)
 * - 'NAO_INICIADO': O turno inicia mais tarde no dia atual (ex: Turno 2 às 10:20 da manhã)
 * - 'EM_ANDAMENTO': O turno está com a jornada ativa no momento
 * - 'ENCERRADO': O turno já finalizou sua jornada neste dia
 */
export function obterStatusTurno(
  saida: string,
  entrada: string,
  dias?: string[],
  date: Date = new Date()
): ShiftStatus {
  if (!saida || !entrada) return 'ENCERRADO';

  // Verifica se hoje é um dia de trabalho ativo para este turno
  if (dias && dias.length > 0) {
    const diaHoje = obterDiaSemanaSiglaPtBr(date);
    const diasNorm = dias.map((d) => d.trim().toLowerCase().slice(0, 3));
    const diaHojeNorm = diaHoje.trim().toLowerCase().slice(0, 3);
    if (!diasNorm.includes(diaHojeNorm)) {
      return 'FOLGA';
    }
  }

  const currentHourMin = obterHoraMinutoPtBr(date);
  const ent = entrada.slice(0, 5);
  const sai = saida.slice(0, 5);

  if (ent <= sai) {
    // Turno diurno normal (ex: 07:00 às 17:30)
    if (currentHourMin < ent) {
      return 'NAO_INICIADO';
    } else if (currentHourMin >= ent && currentHourMin <= sai) {
      return 'EM_ANDAMENTO';
    } else {
      return 'ENCERRADO';
    }
  } else {
    // Turno que cruza a meia-noite (ex: 15:30 às 01:30, ou 22:00 às 06:00)
    // No período diurno entre a saída da madrugada (01:30) e a entrada da tarde (15:30):
    // O turno de hoje AINDA NÃO INICIOU!
    if (currentHourMin > sai && currentHourMin < ent) {
      return 'NAO_INICIADO';
    } else if (currentHourMin >= ent || currentHourMin <= sai) {
      return 'EM_ANDAMENTO';
    } else {
      return 'ENCERRADO';
    }
  }
}

/**
 * Checks if current time is past the shift's end time (or outside working days)
 */
export function verificarTurnoEncerrado(saida: string, entrada: string, dias?: string[], date: Date = new Date()): boolean {
  const status = obterStatusTurno(saida, entrada, dias, date);
  return status === 'ENCERRADO' || status === 'FOLGA';
}

export interface ShiftGapEntry {
  id: string;
  isGap: true;
  isMealInterval?: boolean;
  date: string;
  collaboratorName: string;
  shift: string;
  role: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  activity: string;
  status: 'Sem Apontamento' | 'Refeição';
  mealBreakMinutes?: number;
  observation: string;
}

export interface ResumoJornadaOperador {
  collaboratorName: string;
  date: string;
  shift: string;
  minutosJornadaEsperada: number;
  minutosProdutivosApontados: number;
  minutosRefeicao: number;
  minutosSemApontamento: number;
  percentualAderencia: number;
}

/**
 * Calcula os períodos de tempo sem apontamento (GAPs) para cada operador na jornada de trabalho.
 * Mapeia desde o início do turno até o fim do turno, identificando onde não houve registro de atividade
 * e destacando os intervalos programados de refeição (almoço/janta).
 */
export function calcularGapsJornadaColaboradores(
  logs: ProductionLog[],
  collaborators: Collaborator[] = [],
  shifts: ShiftConfig[] = [],
  dataFiltro?: string,
  agora: Date = new Date()
): ShiftGapEntry[] {
  const gaps: ShiftGapEntry[] = [];
  const hojePtBr = formatarDataPtBr(agora);

  // Agrupa logs válidos por (colaborador + data)
  const groups = new Map<string, ProductionLog[]>();
  for (const log of logs) {
    if (log.id.startsWith('log-resume-') || log.resumedFromPreviousLogId) continue;
    const date = log.date || hojePtBr;
    if (dataFiltro && dataFiltro !== 'TODAS' && date !== dataFiltro) continue;
    const colab = (log.collaboratorName || '').trim();
    if (!colab) continue;
    const key = `${colab.toLowerCase()}__${date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(log);
  }

  for (const [, groupLogs] of groups.entries()) {
    if (groupLogs.length === 0) continue;

    const sample = groupLogs[0];
    const colabName = sample.collaboratorName;
    const dateStr = sample.date || hojePtBr;
    const isToday = dateStr === hojePtBr;

    const colabObj = collaborators.find((c) => c.name.trim().toLowerCase() === colabName.toLowerCase());
    const shiftName = colabObj?.shift || sample.shift || 'Turno 1';
    const role = colabObj?.role || sample.role || 'Operador';

    const foundShift = shifts.find(
      (s) =>
        padronizarNomeTurno(s.name) === padronizarNomeTurno(shiftName) ||
        padronizarNomeTurno(s.code) === padronizarNomeTurno(shiftName) ||
        s.name.toUpperCase().includes(shiftName.toUpperCase())
    ) || shifts[0] || { entrada: '07:00', saida: '17:30', name: 'Turno 1' };

    const shiftEntrada = foundShift.entrada || '07:00';
    const shiftSaida = foundShift.saida || '17:30';
    const isOvernight = timeToSecondsOfDay(shiftEntrada) > timeToSecondsOfDay(shiftSaida);

    const mealConfig = obterConfiguracaoRefeicao(colabName, shifts, collaborators);
    const mealStartSec = timeToShiftRelativeSeconds(mealConfig.saidaAlmoco, shiftEntrada, isOvernight);
    const mealEndSec = timeToShiftRelativeSeconds(mealConfig.retornoAlmoco, shiftEntrada, isOvernight);

    // Identifica se alguma atividade já absorveu ou deduziu a refeição
    let hasMealBeenProcessed = groupLogs.some(
      (l) => l.isMealPause || (l.mealBreakDeducted && l.status === 'Concluída')
    );

    // Ordena cronologicamente respeitando a virada de meia-noite
    const sorted = [...groupLogs].sort(
      (a, b) => timeToShiftRelativeSeconds(a.startTime, shiftEntrada, isOvernight) - timeToShiftRelativeSeconds(b.startTime, shiftEntrada, isOvernight)
    );

    // Helper interno para fatiar períodos ociosos considerando o horário do almoço/janta
    const registrarGapOuRefeicao = (
      tipo: 'start' | 'mid' | 'end',
      startStr: string,
      endStr: string,
      contextObs: string,
      nextActName?: string
    ) => {
      const sSec = timeToShiftRelativeSeconds(startStr, shiftEntrada, isOvernight);
      const eSec = timeToShiftRelativeSeconds(endStr, shiftEntrada, isOvernight);
      if (eSec - sSec < 60) return; // Menos de 1 minuto

      const cruzaAlmoco =
        !hasMealBeenProcessed &&
        sSec < mealEndSec - 60 &&
        eSec > mealStartSec + 60;

      if (cruzaAlmoco) {
        // 1. Período antes do almoço (se houver)
        if (sSec < mealStartSec && mealStartSec - sSec >= 60) {
          const preMins = Math.round((mealStartSec - sSec) / 60);
          if (preMins >= 1) {
            gaps.push({
              id: `gap-${tipo}-premeal-${colabName}-${dateStr}-${startStr}`,
              isGap: true,
              date: dateStr,
              collaboratorName: colabName,
              shift: shiftName,
              role,
              startTime: startStr,
              endTime: mealConfig.saidaAlmoco,
              durationMinutes: preMins,
              activity: tipo === 'start' ? '⚠️ SEM APONTAMENTO (Início de Turno)' : '⚠️ SEM APONTAMENTO (Intervalo)',
              status: 'Sem Apontamento',
              observation: `Período sem atividade registrada antes do almoço (${startStr} às ${mealConfig.saidaAlmoco}).`,
            });
          }
        }

        // 2. Intervalo de Refeição (Almoço / Janta)
        const mStartStr = sSec >= mealStartSec ? startStr : mealConfig.saidaAlmoco;
        const mEndStr = eSec <= mealEndSec ? endStr : mealConfig.retornoAlmoco;
        const mStartSec = timeToShiftRelativeSeconds(mStartStr, shiftEntrada, isOvernight);
        const mEndSec = timeToShiftRelativeSeconds(mEndStr, shiftEntrada, isOvernight);
        const mealDurationMins = Math.round((mEndSec - mStartSec) / 60);

        if (mealDurationMins >= 1) {
          gaps.push({
            id: `meal-gap-${colabName}-${dateStr}-${mStartStr}`,
            isGap: true,
            isMealInterval: true,
            date: dateStr,
            collaboratorName: colabName,
            shift: shiftName,
            role,
            startTime: mStartStr,
            endTime: mEndStr,
            durationMinutes: mealDurationMins,
            activity: '🍽️ REFEIÇÃO / ALMOÇO (Intervalo)',
            status: 'Refeição',
            mealBreakMinutes: mealDurationMins,
            observation: `Intervalo programado de refeição do colaborador (${mealConfig.saidaAlmoco} às ${mealConfig.retornoAlmoco}).`,
          });
          hasMealBeenProcessed = true;
        }

        // 3. Período após o almoço (se houver)
        if (eSec > mealEndSec && eSec - mealEndSec >= 60) {
          const postMins = Math.round((eSec - mealEndSec) / 60);
          if (postMins >= 1) {
            gaps.push({
              id: `gap-${tipo}-postmeal-${colabName}-${dateStr}-${mealConfig.retornoAlmoco}`,
              isGap: true,
              date: dateStr,
              collaboratorName: colabName,
              shift: shiftName,
              role,
              startTime: mealConfig.retornoAlmoco,
              endTime: endStr,
              durationMinutes: postMins,
              activity: tipo === 'end' ? '⚠️ SEM APONTAMENTO (Fim de Turno)' : '⚠️ SEM APONTAMENTO (Intervalo)',
              status: 'Sem Apontamento',
              observation: `Período sem atividade registrada após o almoço (${mealConfig.retornoAlmoco} às ${endStr}).`,
            });
          }
        }
      } else {
        // Gap simples sem cruzamento de almoço
        const gapMins = Math.round((eSec - sSec) / 60);
        if (gapMins >= 1) {
          let actLabel = '⚠️ SEM APONTAMENTO (Intervalo)';
          if (tipo === 'start') actLabel = '⚠️ SEM APONTAMENTO (Início de Turno)';
          if (tipo === 'end') actLabel = isToday && endStr !== shiftSaida ? '⚠️ SEM ATIVIDADE NO MOMENTO' : '⚠️ SEM APONTAMENTO (Fim de Turno)';

          gaps.push({
            id: `gap-${tipo}-${colabName}-${dateStr}-${startStr}`,
            isGap: true,
            date: dateStr,
            collaboratorName: colabName,
            shift: shiftName,
            role,
            startTime: startStr,
            endTime: endStr,
            durationMinutes: gapMins,
            activity: actLabel,
            status: 'Sem Apontamento',
            observation: contextObs,
          });
        }
      }
    };

    // 1. GAP no início do turno (Entre a entrada do turno e a primeira atividade)
    const firstLog = sorted[0];
    const firstStartSec = timeToShiftRelativeSeconds(firstLog.startTime, shiftEntrada, isOvernight);
    const shiftEntradaSec = timeToShiftRelativeSeconds(shiftEntrada, shiftEntrada, isOvernight);

    if (firstStartSec - shiftEntradaSec >= 60) {
      registrarGapOuRefeicao(
        'start',
        shiftEntrada,
        firstLog.startTime,
        `Colaborador não registrou atividade entre o início do turno (${shiftEntrada}) e o primeiro apontamento (${firstLog.startTime}).`,
        firstLog.activity
      );
    }

    // 2. GAPs intermediários entre atividades consecutivas
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];

      const currentEnd = current.endTime;
      if (!currentEnd) continue;

      const currentEndSec = timeToShiftRelativeSeconds(currentEnd, shiftEntrada, isOvernight);
      const nextStartSec = timeToShiftRelativeSeconds(next.startTime, shiftEntrada, isOvernight);

      if (nextStartSec - currentEndSec >= 60) {
        registrarGapOuRefeicao(
          'mid',
          currentEnd,
          next.startTime,
          `Período sem atividade registrada entre "${current.activity}" (${currentEnd}) e "${next.activity}" (${next.startTime}).`,
          next.activity
        );
      }
    }

    // 3. GAP no fim do turno (Entre o término da última atividade e o fim do turno)
    const lastLog = sorted[sorted.length - 1];
    if (lastLog.status === 'Concluída' && lastLog.endTime) {
      const lastEndSec = timeToShiftRelativeSeconds(lastLog.endTime, shiftEntrada, isOvernight);
      const shiftSaidaSec = timeToShiftRelativeSeconds(shiftSaida, shiftEntrada, isOvernight);

      let limiteFim = shiftSaida;
      let limiteFimSec = shiftSaidaSec;

      if (isToday) {
        const agoraHoraMin = formatarHoraPtBr(agora);
        const agoraSec = timeToShiftRelativeSeconds(agoraHoraMin, shiftEntrada, isOvernight);
        if (agoraSec < shiftSaidaSec) {
          limiteFim = agoraHoraMin;
          limiteFimSec = agoraSec;
        }
      }

      if (limiteFimSec - lastEndSec >= 60) {
        registrarGapOuRefeicao(
          'end',
          lastLog.endTime,
          limiteFim,
          isToday && limiteFim !== shiftSaida
            ? `Última atividade concluída às ${lastLog.endTime}. Colaborador está livre sem apontamento até o momento.`
            : `Atividade finalizada às ${lastLog.endTime} antes do encerramento do turno (${shiftSaida}). Nenhuma outra atividade foi apontada até as ${shiftSaida}.`
        );
      }
    }
  }

  return gaps;
}

/**
 * Calculates overall KPI metrics for Leader Dashboard
 */
export function calcularMetricasKPI(logs: ProductionLog[]): {
  concluidas: number;
  executando: number;
  minutosTrabalhados: number;
} {
  let concluidas = 0;
  let executando = 0;
  let minutosTrabalhados = 0;

  logs.forEach((log) => {
    if (log.status === 'Concluída') {
      concluidas++;
      if (log.durationMinutes !== undefined) {
        minutosTrabalhados += log.durationMinutes;
      } else if (log.startTime && log.endTime) {
        minutosTrabalhados += calcularDiferencaMinutos(log.startTime, log.endTime);
      }
    } else if (log.status === 'Em Execução') {
      executando++;
    }
  });

  return { concluidas, executando, minutosTrabalhados };
}

/**
 * Converte string de data ("DD/MM/YYYY" ou "YYYY-MM-DD") para objeto Date sem fuso horário
 */
export function parseDataParaDate(dataStr: string): Date | null {
  if (!dataStr) return null;
  try {
    const trimmed = dataStr.trim();
    if (trimmed.includes('/')) {
      const parts = trimmed.split('/');
      if (parts.length === 3) {
        return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10), 12, 0, 0);
      }
    } else if (trimmed.includes('-')) {
      const parts = trimmed.split('-');
      if (parts.length === 3) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
      }
    }
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Converte qualquer formato de data para "DD/MM/YYYY"
 */
export function padronizarDataPtBr(dataStr: string): string {
  const d = parseDataParaDate(dataStr);
  return d ? formatarDataPtBr(d) : dataStr;
}

/**
 * Converte qualquer formato de data para "YYYY-MM-DD" para uso em <input type="date">
 */
export function padronizarDataIso(dataStr: string): string {
  const d = parseDataParaDate(dataStr);
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

/**
 * Gera lista de datas no intervalo (inclusivo)
 */
export function gerarDatasNoIntervalo(dataInicioStr: string, dataFimStr: string): { date: Date; datePtBr: string; dayOfWeek: string }[] {
  const dInicio = parseDataParaDate(dataInicioStr);
  const dFim = parseDataParaDate(dataFimStr || dataInicioStr);
  if (!dInicio || !dFim) return [];

  const DIAS_MAP = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  const start = dInicio.getTime() <= dFim.getTime() ? dInicio : dFim;
  const end = dInicio.getTime() <= dFim.getTime() ? dFim : dInicio;

  const lista: { date: Date; datePtBr: string; dayOfWeek: string }[] = [];
  const cur = new Date(start);

  // Evita loops infinitos limitando a 366 dias
  let count = 0;
  while (cur.getTime() <= end.getTime() && count < 366) {
    const dCopy = new Date(cur);
    lista.push({
      date: dCopy,
      datePtBr: formatarDataPtBr(dCopy),
      dayOfWeek: DIAS_MAP[dCopy.getDay()],
    });
    cur.setDate(cur.getDate() + 1);
    count++;
  }

  return lista;
}

/**
 * Calculates team efficiency across a custom Date Range (e.g. from 2026-08-20 to 2026-08-28)
 * Guaranteed mathematical consistency: Global efficiency = (Total Occupied / Total Expected) * 100
 */
export function calcularEficienciaEquipePeriodo(
  logs: ProductionLog[],
  collaborators: Collaborator[],
  shifts: ShiftConfig[],
  dataInicioStr: string,
  dataFimStr: string,
  toleranciaMinutos: number = 60
): OperatorEfficiency[] {
  const diasIntervalo = gerarDatasNoIntervalo(dataInicioStr, dataFimStr);
  const setDatasPtBr = new Set(diasIntervalo.map((d) => d.datePtBr));
  const hojePtBr = formatarDataPtBr(new Date());
  const agora = new Date();
  const currentHourMin = obterHoraMinutoPtBr(agora);

  // 1. Mapa de turnos e horas úteis por turno
  const turnosMap: Record<string, { shift: ShiftConfig; min: number; ent: string; sai: string; entAlmoco?: string; saiAlmoco?: string; dias: string[] }> = {};
  shifts.forEach((s) => {
    const minCalculado = calcularCargaHorariaTurno(s);
    const shiftData = {
      shift: s,
      min: minCalculado,
      ent: s.entrada,
      sai: s.saida,
      entAlmoco: s.saidaAlmoco,
      saiAlmoco: s.retornoAlmoco,
      dias: s.dias || [],
    };
    turnosMap[s.name.toUpperCase().trim()] = shiftData;
    turnosMap[s.code.toUpperCase().trim()] = shiftData;
    const numOnly = s.code.replace(/\D/g, '');
    if (numOnly) {
      turnosMap[`TURNO ${numOnly}`] = shiftData;
      turnosMap[`T${numOnly}`] = shiftData;
    }
  });

  // 2. Mapeamento de Colaboradores e cálculo da Carga Esperada no Intervalo
  const colabMap: Record<
    string,
    {
      collaborator: Collaborator;
      shiftName: string;
      shiftEntrada: string;
      shiftSaida: string;
      esperadoTotalMinutos: number;
      trabalhadoTotalMinutos: number;
      trabalhadoPorDia: Record<string, number>;
      operacoes: Record<string, { tempoMinutos: number; category?: string }>;
      statusTurnoHoje: ShiftStatus;
      isFimDoTurno: boolean;
      todayLogs: ProductionLog[];
    }
  > = {};

  collaborators.forEach((c) => {
    const turnoKey = (c.shift || 'Turno 1').toUpperCase().trim();
    const tData =
      turnosMap[turnoKey] ||
      shifts.find((s) => s.name.toUpperCase().includes(turnoKey) || turnoKey.includes(s.name.toUpperCase()))
        ? {
            shift: shifts.find((s) => s.name.toUpperCase().includes(turnoKey) || turnoKey.includes(s.name.toUpperCase()))!,
            min: calcularCargaHorariaTurno(
              shifts.find((s) => s.name.toUpperCase().includes(turnoKey) || turnoKey.includes(s.name.toUpperCase()))!
            ),
            ent: shifts.find((s) => s.name.toUpperCase().includes(turnoKey) || turnoKey.includes(s.name.toUpperCase()))!.entrada,
            sai: shifts.find((s) => s.name.toUpperCase().includes(turnoKey) || turnoKey.includes(s.name.toUpperCase()))!.saida,
            entAlmoco: shifts.find((s) => s.name.toUpperCase().includes(turnoKey) || turnoKey.includes(s.name.toUpperCase()))!.saidaAlmoco,
            saiAlmoco: shifts.find((s) => s.name.toUpperCase().includes(turnoKey) || turnoKey.includes(s.name.toUpperCase()))!.retornoAlmoco,
            dias: shifts.find((s) => s.name.toUpperCase().includes(turnoKey) || turnoKey.includes(s.name.toUpperCase()))!.dias,
          }
        : {
            shift: shifts[0],
            min: 540,
            ent: '07:00',
            sai: '17:30',
            entAlmoco: '12:00',
            saiAlmoco: '13:00',
            dias: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
          };

    const statusHoje = obterStatusTurno(tData.sai, tData.ent, tData.dias, agora);

    // Calcula esperado no período somando os dias em que o turno trabalha conforme a configuração do turno
    let esperadoMinutosPeriodo = 0;
    diasIntervalo.forEach((diaInfo) => {
      const trabalhaNesteDia = tData.dias && tData.dias.includes(diaInfo.dayOfWeek);
      if (trabalhaNesteDia) {
        // Meta útil do turno para cada dia de trabalho no período (definida na configuração do turno)
        esperadoMinutosPeriodo += tData.min;
      }
    });

    const isFim = statusHoje === 'ENCERRADO' || !setDatasPtBr.has(hojePtBr);

    colabMap[c.name.trim().toLowerCase()] = {
      collaborator: c,
      shiftName: c.shift || 'Turno 1',
      shiftEntrada: tData.ent,
      shiftSaida: tData.sai,
      esperadoTotalMinutos: Math.round(esperadoMinutosPeriodo),
      trabalhadoTotalMinutos: 0,
      trabalhadoPorDia: {},
      operacoes: {},
      statusTurnoHoje: statusHoje,
      isFimDoTurno: isFim,
      todayLogs: [],
    };
  });

  // 3. Processamento dos logs dentro do período
  logs.forEach((log) => {
    const logDatePtBr = padronizarDataPtBr(log.date);
    if (!setDatasPtBr.has(logDatePtBr)) return; // Fora do intervalo

    const colabKey = log.collaboratorName.trim().toLowerCase();
    if (!colabMap[colabKey]) {
      // Colaborador não cadastrado explicitamente
      colabMap[colabKey] = {
        collaborator: {
          id: `temp-${colabKey}`,
          name: log.collaboratorName,
          role: log.role || 'OPERADOR',
          shift: log.shift || 'Turno 1',
          active: true,
        },
        shiftName: log.shift || 'Turno 1',
        shiftEntrada: '07:00',
        shiftSaida: '17:30',
        esperadoTotalMinutos: diasIntervalo.length * 540,
        trabalhadoTotalMinutos: 0,
        trabalhadoPorDia: {},
        operacoes: {},
        statusTurnoHoje: 'ENCERRADO',
        isFimDoTurno: true,
        todayLogs: [],
      };
    }

    const colabEntry = colabMap[colabKey];
    if (logDatePtBr === hojePtBr) {
      colabEntry.todayLogs.push(log);
    }

    let duracaoLogMin = 0;

    if (log.status === 'Concluída') {
      if (log.durationMinutes !== undefined && log.durationMinutes > 0) {
        duracaoLogMin = log.durationMinutes;
      } else if (log.startTime && log.endTime) {
        duracaoLogMin = calcularDiferencaMinutos(log.startTime, log.endTime);
        if (log.mealBreakDeducted && log.mealBreakMinutes) {
          duracaoLogMin = Math.max(0, duracaoLogMin - log.mealBreakMinutes);
        }
      }
    } else if (log.status === 'Em Execução' && log.startTime) {
      if (logDatePtBr === hojePtBr && colabEntry.statusTurnoHoje === 'EM_ANDAMENTO') {
        // Atividade em andamento hoje dentro do turno
        const parts = log.startTime.split(':');
        const h = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        const inicio = new Date();
        inicio.setHours(h, m, 0, 0);
        const diffMs = agora.getTime() - inicio.getTime();
        duracaoLogMin = diffMs > 0 ? diffMs / 60000 : 0;
      } else {
        // Data passada ou turno já encerrado: calcula estritamente até a saída do turno
        duracaoLogMin = calcularDiferencaMinutos(log.startTime, colabEntry.shiftSaida);
        const meal = obterConfiguracaoRefeicao(colabEntry.shiftName, shifts);
        if (duracaoLogMin > meal.duracaoMinutos) {
          duracaoLogMin = Math.max(0, duracaoLogMin - meal.duracaoMinutos);
        }
      }
    } else if (log.status === 'Pausada') {
      duracaoLogMin = log.durationMinutes || 0;
    }

    // Registra tempo por dia para respeitar o limite máximo diário de turno
    if (!colabEntry.trabalhadoPorDia[logDatePtBr]) {
      colabEntry.trabalhadoPorDia[logDatePtBr] = 0;
    }
    colabEntry.trabalhadoPorDia[logDatePtBr] += duracaoLogMin;

    // Agrupa operações
    const actName = log.activity || 'Atividade';
    if (!colabEntry.operacoes[actName]) {
      colabEntry.operacoes[actName] = { tempoMinutos: 0, category: log.category };
    }
    colabEntry.operacoes[actName].tempoMinutos += duracaoLogMin;
  });

  // 3.5. Calcula lacunas reais de jornada a partir do histórico detalhado de cada colaborador
  const todasLacunasPeriodo = calcularGapsJornadaColaboradores(
    logs,
    collaborators,
    shifts,
    undefined,
    agora
  );

  const gapsReaisPorColab: Record<string, number> = {};
  todasLacunasPeriodo.forEach((gap) => {
    if (gap.isMealInterval || gap.status === 'Refeição') return;
    const gapDatePtBr = padronizarDataPtBr(gap.date);
    if (!setDatasPtBr.has(gapDatePtBr)) return;
    const key = gap.collaboratorName.trim().toLowerCase();
    gapsReaisPorColab[key] = (gapsReaisPorColab[key] || 0) + (gap.durationMinutes || 0);
  });

  // 4. Monta resultado consolidado por operador
  const arrayFinal: OperatorEfficiency[] = [];

  Object.values(colabMap).forEach((cData) => {
    let totalTrabalhado = 0;
    Object.entries(cData.trabalhadoPorDia).forEach(([, tempoDia]) => {
      const cargaDiariaReferencia = cData.esperadoTotalMinutos > 0 && diasIntervalo.length > 0
        ? cData.esperadoTotalMinutos / diasIntervalo.length
        : 540;
      
      const tempoAjustadoDia = Math.min(tempoDia, Math.max(cargaDiariaReferencia, 540));
      totalTrabalhado += tempoAjustadoDia;
    });

    const esperado = cData.esperadoTotalMinutos;
    const colabKey = cData.collaborator.name.trim().toLowerCase();
    const gapsHistorico = gapsReaisPorColab[colabKey] || 0;

    // Respeita estritamente o histórico do operador: o tempo sem apontar vem diretamente
    // das lacunas reais registradas entre atividades, início e fim de jornada.
    // Caso o colaborador não tenha tido qualquer registro de atividade em dia esperado, o sem apontar é o esperado.
    const semApontar = (totalTrabalhado > 0 || gapsHistorico > 0)
      ? gapsHistorico
      : esperado;

    const jornadaRealTotal = totalTrabalhado + semApontar;
    
    // Cálculo de Eficiência: tempo trabalhado / jornada real decorrida (trabalhado + lacunas sem apontar)
    let efi = 0;
    if (cData.statusTurnoHoje === 'NAO_INICIADO' && diasIntervalo.length === 1 && diasIntervalo[0].datePtBr === hojePtBr) {
      // Se estamos vendo apenas hoje e o turno ainda não iniciou, não há jornada decorrida
      efi = 0;
    } else if (jornadaRealTotal > 0) {
      efi = Math.min(100, (totalTrabalhado / jornadaRealTotal) * 100);
    } else if (esperado > 0) {
      efi = (totalTrabalhado / esperado) * 100;
    } else {
      efi = 0;
    }
    
    // Análise de Alertas e Ociosidade em Tempo Real
    let isAlerta = false;
    let tempoOciosoAtualMinutos = 0;
    let motivoAlerta: string | undefined = undefined;
    let isLivreAgora = false;
    let ultimaAtividadeFim: string | undefined = undefined;

    if (cData.statusTurnoHoje === 'NAO_INICIADO') {
      // Turno ainda não iniciou hoje: NUNCA gera alerta de ociosidade
      isAlerta = false;
    } else if (cData.statusTurnoHoje === 'EM_ANDAMENTO') {
      // Turno está em andamento agora: analisa tempo sem apontar em tempo real
      const hasActiveLog = cData.todayLogs.some((l) => l.status === 'Em Execução' || l.status === 'Pausada');
      
      if (!hasActiveLog) {
        isLivreAgora = true;
        // Encontra o último horário de término das tarefas de hoje
        const completedLogs = cData.todayLogs.filter((l) => l.status === 'Concluída' && l.endTime);
        if (completedLogs.length === 0) {
          // Sem nenhuma atividade concluída desde o início do turno
          const ocioso = calcularDiferencaMinutos(cData.shiftEntrada, currentHourMin);
          tempoOciosoAtualMinutos = ocioso;
          ultimaAtividadeFim = cData.shiftEntrada;
          if (ocioso >= toleranciaMinutos) {
            isAlerta = true;
            motivoAlerta = `Sem apontamento no turno desde às ${cData.shiftEntrada} (${formatarHorasMinutos(ocioso)} sem atividade)`;
          }
        } else {
          // Pega o término mais recente
          let latestEndSec = 0;
          let latestEndStr = cData.shiftEntrada;
          completedLogs.forEach((l) => {
            const sec = timeToSecondsOfDay(l.endTime);
            if (sec > latestEndSec) {
              latestEndSec = sec;
              latestEndStr = l.endTime;
            }
          });
          const ocioso = calcularDiferencaMinutos(latestEndStr, currentHourMin);
          tempoOciosoAtualMinutos = ocioso;
          ultimaAtividadeFim = latestEndStr;
          if (ocioso >= toleranciaMinutos) {
            isAlerta = true;
            motivoAlerta = `Sem atividade há ${formatarHorasMinutos(ocioso)} (última finalizada às ${latestEndStr.slice(0, 5)})`;
          }
        }
      }

      // Se não deu alerta de ócio atual, verifica se no acumulado do turno o semApontar excedeu a tolerância
      if (!isAlerta && semApontar > toleranciaMinutos) {
        isAlerta = true;
        tempoOciosoAtualMinutos = semApontar;
        motivoAlerta = `Acumulado de ${formatarHorasMinutos(semApontar)} sem apontamento no turno`;
      }
    } else {
      // Turno Encerrado ou Análise de Período Passado
      if (semApontar > toleranciaMinutos) {
        isAlerta = true;
        tempoOciosoAtualMinutos = semApontar;
        motivoAlerta = `Turno encerrado com ${formatarHorasMinutos(semApontar)} sem apontamento`;
      }
    }

    const opsArray = Object.entries(cData.operacoes)
      .map(([nome, opInfo]) => ({
        nome,
        tempoMinutos: opInfo.tempoMinutos,
        category: opInfo.category,
      }))
      .sort((a, b) => b.tempoMinutos - a.tempoMinutos);

    arrayFinal.push({
      nome: cData.collaborator.name,
      role: cData.collaborator.role,
      turno: cData.shiftName,
      turnoEntrada: cData.shiftEntrada,
      turnoSaida: cData.shiftSaida,
      esperadoMinutos: esperado,
      trabalhadoMinutos: Math.round(totalTrabalhado),
      semApontarMinutos: Math.round(semApontar),
      eficienciaPct: parseFloat(Math.min(efi, 100).toFixed(1)),
      eficienciaRaw: Math.min(efi, 100),
      isFimDoTurno: cData.isFimDoTurno,
      isAlertaSemApontar: isAlerta,
      statusTurno: cData.statusTurnoHoje,
      tempoOciosoAtualMinutos,
      motivoAlerta,
      isLivreAgora,
      ultimaAtividadeFim,
      operacoes: opsArray,
    });
  });

  // Ordena por eficiência decrescente
  arrayFinal.sort((a, b) => b.eficienciaPct - a.eficienciaPct);
  return arrayFinal;
}

/**
 * Calculates team efficiency for a single target date (backwards-compatible wrapper)
 */
export function calcularEficienciaEquipe(
  logs: ProductionLog[],
  collaborators: Collaborator[],
  shifts: ShiftConfig[],
  dataAlvo: string,
  toleranciaMinutos: number = 60
): OperatorEfficiency[] {
  return calcularEficienciaEquipePeriodo(
    logs,
    collaborators,
    shifts,
    dataAlvo,
    dataAlvo,
    toleranciaMinutos
  );
}

/**
 * Calculates day-by-day efficiency breakdown for a single collaborator across a date range.
 * Perfect for individual analysis when a collaborator is selected/filtered.
 */
export function calcularEficienciaIndividualDiaria(
  logs: ProductionLog[] = [],
  collaboratorName: string,
  collaborators: Collaborator[] = [],
  shifts: ShiftConfig[] = [],
  dataInicioStr: string,
  dataFimStr: string,
  toleranciaMinutos: number = 60
): DailyCollaboratorEfficiency[] {
  if (!collaboratorName || !collaboratorName.trim()) return [];

  const targetNorm = collaboratorName.trim().toLowerCase();
  const colab = (collaborators || []).find((c) => c && c.name && c.name.trim().toLowerCase() === targetNorm) || {
    id: `temp-${targetNorm}`,
    name: collaboratorName,
    role: 'OPERADOR',
    shift: 'Turno 1',
    active: true,
  };

  const diasIntervalo = gerarDatasNoIntervalo(dataInicioStr, dataFimStr);
  if (!diasIntervalo || diasIntervalo.length === 0) return [];

  const hojePtBr = formatarDataPtBr(new Date());
  const agora = new Date();
  const currentHourMin = obterHoraMinutoPtBr(agora);

  // Encontra configuração do turno do operador
  const turnoKey = (colab.shift || 'Turno 1').toUpperCase().trim();
  const fallbackShift: ShiftConfig = {
    id: 't1',
    name: 'Turno 1',
    code: 't1',
    entrada: '07:00',
    saida: '17:30',
    saidaAlmoco: '12:00',
    retornoAlmoco: '13:30',
    dias: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
    color: '#007BFF',
  };

  const shiftFound = (shifts || []).find((s) => {
    if (!s) return false;
    const sName = (s.name || '').toUpperCase();
    const sCode = (s.code || '').toUpperCase();
    return sName.includes(turnoKey) || turnoKey.includes(sName) || (sCode && sCode.includes(turnoKey));
  }) || shifts?.[0] || fallbackShift;

  const shiftData = {
    shift: shiftFound,
    min: calcularCargaHorariaTurno(shiftFound) || 540,
    ent: shiftFound?.entrada || '07:00',
    sai: shiftFound?.saida || '17:30',
    entAlmoco: shiftFound?.saidaAlmoco || '12:00',
    saiAlmoco: shiftFound?.retornoAlmoco || '13:30',
    dias: shiftFound?.dias && shiftFound.dias.length > 0 ? shiftFound.dias : ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
  };

  const statusHoje = obterStatusTurno(shiftData.sai, shiftData.ent, shiftData.dias, agora);

  const DIAS_FULL_MAP: Record<string, string> = {
    Dom: 'Domingo',
    Seg: 'Segunda-feira',
    Ter: 'Terça-feira',
    Qua: 'Quarta-feira',
    Qui: 'Quinta-feira',
    Sex: 'Sexta-feira',
    Sab: 'Sábado',
  };

  // Filtra os logs apenas desse colaborador
  const userLogs = (logs || []).filter(
    (l) => l && l.collaboratorName && l.collaboratorName.trim().toLowerCase() === targetNorm
  );

  return diasIntervalo.map((diaInfo) => {
    const isHoje = diaInfo.datePtBr === hojePtBr;
    const trabalhaNesteDia = shiftData.dias && shiftData.dias.includes(diaInfo.dayOfWeek);

    let statusDia: 'EM_ANDAMENTO' | 'NAO_INICIADO' | 'ENCERRADO' | 'FOLGA' = 'ENCERRADO';
    let statusLabel = 'Turno Concluído';
    let esperadoDia = 0;

    if (!trabalhaNesteDia) {
      statusDia = 'FOLGA';
      statusLabel = 'Folga / Fim de Semana';
      esperadoDia = 0;
    } else {
      statusDia = isHoje ? statusHoje : 'ENCERRADO';
      statusLabel = isHoje
        ? (statusHoje === 'EM_ANDAMENTO' ? 'Em Andamento' : statusHoje === 'NAO_INICIADO' ? 'Aguardando Turno' : 'Turno Encerrado')
        : 'Turno Concluído';
      esperadoDia = shiftData.min;
    }

    // Processa logs do dia
    const logsDoDia = userLogs.filter((l) => l && padronizarDataPtBr(l.date) === diaInfo.datePtBr);
    let trabalhadoMinutosDia = 0;
    const operacoesMap: Record<string, { tempoMinutos: number; category?: string }> = {};

    logsDoDia.forEach((log) => {
      let duracao = 0;
      if (log.status === 'Concluída') {
        if (log.durationMinutes !== undefined && log.durationMinutes > 0) {
          duracao = log.durationMinutes;
        } else if (log.startTime && log.endTime) {
          duracao = calcularDiferencaMinutos(log.startTime, log.endTime);
          if (log.mealBreakDeducted && log.mealBreakMinutes) {
            duracao = Math.max(0, duracao - log.mealBreakMinutes);
          }
        }
      } else if (log.status === 'Em Execução' && log.startTime) {
        if (isHoje && statusHoje === 'EM_ANDAMENTO') {
          const parts = (log.startTime || '00:00:00').split(':');
          const h = parseInt(parts[0], 10) || 0;
          const m = parseInt(parts[1], 10) || 0;
          const s = parseInt(parts[2] || '0', 10) || 0;
          const inicio = new Date();
          inicio.setHours(h, m, s, 0);
          if (inicio.getTime() > agora.getTime()) {
            inicio.setDate(inicio.getDate() - 1);
          }
          const diffMs = agora.getTime() - inicio.getTime();
          duracao = diffMs > 0 ? diffMs / 60000 : 0;
        } else {
          duracao = calcularDiferencaMinutos(log.startTime, shiftData.sai);
          const meal = obterConfiguracaoRefeicao(shiftData.shift ? shiftData.shift.name : 'Turno 1', shifts);
          if (meal && meal.duracaoMinutos && duracao > meal.duracaoMinutos) {
            duracao = Math.max(0, duracao - meal.duracaoMinutos);
          }
        }
      } else if (log.status === 'Pausada') {
        duracao = log.durationMinutes || 0;
      }

      trabalhadoMinutosDia += duracao;

      const actName = log.activity || 'Atividade';
      if (!operacoesMap[actName]) {
        operacoesMap[actName] = { tempoMinutos: 0, category: log.category };
      }
      operacoesMap[actName].tempoMinutos += duracao;
    });

    // REGRA DE REFEIÇÃO: Caso o colaborador tenha esquecido de acionar REFEIÇÃO até o encerramento do seu turno,
    // o sistema desconta automaticamente a duração configurada (ex: 90 ou 60 min) nos cálculos de indicadores
    // para não distorcer o resultado e sem criar conflitos de registros de apontamento do colaborador.
    const jaTeveRefeicao = logsDoDia.some(
      (l) => l.mealBreakDeducted || isMealActivity(l.activity, l.category)
    );
    const mealCfg = obterConfiguracaoRefeicao(colab.name || colab.shift || 'Turno 1', shifts, collaborators);
    const duracaoRefeicaoDefinida = mealCfg.duracaoMinutos || (turnoKey.includes('1') ? 90 : 60);

    if (!jaTeveRefeicao && logsDoDia.length > 0 && statusDia === 'ENCERRADO') {
      if (trabalhadoMinutosDia > shiftData.min) {
        trabalhadoMinutosDia = Math.max(shiftData.min, trabalhadoMinutosDia - duracaoRefeicaoDefinida);
      }
    }

    const trabalhadoAjustado = Math.min(trabalhadoMinutosDia, Math.max(esperadoDia, 540));

    // Obtém as lacunas reais do dia a partir do histórico do colaborador
    const gapsDoDia = calcularGapsJornadaColaboradores(logsDoDia, collaborators, shifts, diaInfo.datePtBr, agora);
    const gapsReaisDia = gapsDoDia
      .filter((g) => !g.isMealInterval && g.status === 'Sem Apontamento')
      .reduce((sum, g) => sum + (g.durationMinutes || 0), 0);

    const semApontar = (trabalhadoMinutosDia > 0 || gapsReaisDia > 0)
      ? gapsReaisDia
      : (trabalhaNesteDia ? esperadoDia : 0);

    const jornadaRealDia = trabalhadoAjustado + semApontar;

    let efi = 0;
    if (statusDia === 'NAO_INICIADO') {
      efi = 0;
    } else if (statusDia === 'FOLGA') {
      efi = trabalhadoAjustado > 0 ? 100 : 0;
    } else if (jornadaRealDia > 0) {
      efi = Math.min(100, (trabalhadoAjustado / jornadaRealDia) * 100);
    } else if (esperadoDia > 0) {
      efi = (trabalhadoAjustado / esperadoDia) * 100;
    } else {
      efi = 0;
    }

    const diaFull = DIAS_FULL_MAP[diaInfo.dayOfWeek] || diaInfo.dayOfWeek;
    const diaMes = diaInfo.datePtBr ? diaInfo.datePtBr.slice(0, 5) : ''; // "26/08"
    const dayLabel = `${diaMes} ${diaInfo.dayOfWeek}`;

    const opsArray = Object.entries(operacoesMap)
      .map(([nome, op]) => ({
        nome,
        tempoMinutos: Math.round(op.tempoMinutos || 0),
        category: op.category,
      }))
      .sort((a, b) => b.tempoMinutos - a.tempoMinutos);

    let isAlerta = false;
    let motivoAlerta: string | undefined = undefined;
    if (statusDia !== 'FOLGA' && statusDia !== 'NAO_INICIADO' && semApontar > toleranciaMinutos) {
      isAlerta = true;
      motivoAlerta = `${formatarHorasMinutos(semApontar)} sem apontamento no dia`;
    }

    return {
      dateIso: padronizarDataIso(diaInfo.datePtBr),
      datePtBr: diaInfo.datePtBr,
      dayLabel,
      dayOfWeek: diaInfo.dayOfWeek,
      dayOfWeekFull: diaFull,
      esperadoMinutos: Math.round(esperadoDia),
      trabalhadoMinutos: Math.round(trabalhadoAjustado),
      semApontarMinutos: Math.round(semApontar),
      eficienciaPct: parseFloat(Math.min(Math.max(0, efi), 100).toFixed(1)),
      statusDia,
      statusLabel,
      isAlerta,
      motivoAlerta,
      operacoes: opsArray,
    };
  });
}

/**
 * Generates initial demo production logs for realistic testing
 */
export function gerarLogsIniciais(collaborators: Collaborator[], activities: ActivityItem[]): ProductionLog[] {
  const hoje = formatarDataPtBr(new Date());
  const logs: ProductionLog[] = [];

  const sampleActivities = [
    { name: 'Carlos Silva', role: 'PREPARADOR TORNO AUTOMATICO', act: 'SETUP DE MÁQUINA', cat: 'Setup', ini: '08:05:00', fim: '09:20:00', status: 'Concluída', obs: 'Setup de Novo Lote de Produção' },
    { name: 'Carlos Silva', role: 'PREPARADOR TORNO AUTOMATICO', act: 'AFIAR FERRAMENTAS', cat: 'Setup', ini: '09:30:00', fim: '10:15:00', status: 'Concluída', obs: 'Troca de pastilhas de videa' },
    { name: 'Carlos Silva', role: 'PREPARADOR TORNO AUTOMATICO', act: 'PREPARAÇÃO DE BARRAS PARA USINAR', cat: 'Operação', ini: '10:20:00', fim: '', status: 'Em Execução', obs: '' },
    { name: 'Marcos Oliveira', role: 'INSPETOR TCNC / OPERADOR', act: 'INICIAR A MÁQUINA (CAVACO, LUBRIFICAR, INSPECIONAR)', cat: 'Setup', ini: '08:00:00', fim: '08:35:00', status: 'Concluída', obs: 'Operação Concluída com Sucesso sem Anomalias' },
    { name: 'Marcos Oliveira', role: 'INSPETOR TCNC / OPERADOR', act: 'OPERAÇÃO NA MÁQUINA', cat: 'Operação', ini: '08:40:00', fim: '11:45:00', status: 'Concluída', obs: 'Lote 405 peças concluídas' },
    { name: 'Marcos Oliveira', role: 'INSPETOR TCNC / OPERADOR', act: 'MEDIR PEÇAS', cat: 'Qualidade / Inspeção', ini: '13:05:00', fim: '', status: 'Em Execução', obs: '' },
    { name: 'Robson Santos', role: 'PREPARADOR DE FERRAMENTAS', act: 'SETUP THR', cat: 'Setup', ini: '08:10:00', fim: '09:15:00', status: 'Concluída', obs: 'Operação Concluída com Sucesso sem Anomalias' },
    { name: 'Robson Santos', role: 'PREPARADOR DE FERRAMENTAS', act: 'REALIZAR TROCA DE FERRAMENTA', cat: 'Setup', ini: '09:25:00', fim: '', status: 'Em Execução', obs: '' },
    { name: 'Anderson Souza', role: 'AREA DO CAVACO E OLEO', act: 'LIMPEZA DO CAVACO', cat: '5S & Limpeza', ini: '08:00:00', fim: '08:50:00', status: 'Concluída', obs: 'Setor A e B limpos' },
    { name: 'Anderson Souza', role: 'AREA DO CAVACO E OLEO', act: 'CENTRIFUGAR O CAVACO', cat: 'Operação', ini: '09:00:00', fim: '09:45:00', status: 'Concluída', obs: 'Centrífuga 01 operando normal' },
    { name: 'Anderson Souza', role: 'AREA DO CAVACO E OLEO', act: 'VERIFICAÇÃO E REPOSIÇÃO DE ÓLEO NA USINAGEM', cat: 'Manutenção', ini: '10:00:00', fim: '', status: 'Em Execução', obs: '' },
    { name: 'Danilo Costa', role: 'PREPARADOR PROGAMADOR', act: 'AJUSTE NO PROGRAMA CNC', cat: 'Setup', ini: '08:15:00', fim: '09:05:00', status: 'Concluída', obs: 'Otimização de avanço G01' },
    { name: 'Danilo Costa', role: 'PREPARADOR PROGAMADOR', act: 'SETUP DE MÁQUINA', cat: 'Setup', ini: '09:15:00', fim: '', status: 'Em Execução', obs: '' },
  ];

  sampleActivities.forEach((s, idx) => {
    let dur = 0;
    if (s.status === 'Concluída' && s.ini && s.fim) {
      dur = calcularDiferencaMinutos(s.ini, s.fim);
    }
    logs.push({
      id: `log-${Date.now()}-${idx}`,
      date: hoje,
      collaboratorName: s.name,
      role: s.role,
      activity: s.act,
      category: s.cat as any,
      startTime: s.ini,
      endTime: s.fim,
      durationMinutes: dur,
      status: s.status as any,
      observation: s.obs,
      machineId: `TORNO-${(idx % 5) + 1}`,
      partsProduced: s.status === 'Concluída' ? 50 * (idx + 1) : undefined,
    });
  });

  return logs;
}

/**
 * Synthesizes an industrial audio alert chime using Web Audio API
 */
export function playFactoryChime(type: 'start' | 'finish' | 'alert' | 'beep') {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'start') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.15); // G5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } else if (type === 'finish') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      osc.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 0.2); // C6
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } else if (type === 'alert') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(440, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    }
  } catch (e) {
    // Audio contexts might be muted or blocked by browser gesture policy
    console.warn('Audio feedback skipped:', e);
  }
}

/**
 * Converts DD/MM/YYYY string to YYYY-MM-DD for standard date input comparisons
 */
export function converterDataPtParaIso(dataPt?: string): string {
  if (!dataPt) return '';
  const parts = dataPt.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return dataPt;
}

/**
 * Checks if a log's DD/MM/YYYY date falls inside the optional [dataInicio, dataFim] (YYYY-MM-DD) period
 */
export function verificarDataNoPeriodo(dataPt: string, dataInicio?: string, dataFim?: string): boolean {
  if (!dataInicio && !dataFim) return true;
  const iso = converterDataPtParaIso(dataPt);
  if (!iso) return true;
  if (dataInicio && iso < dataInicio) return false;
  if (dataFim && iso > dataFim) return false;
  return true;
}

/**
 * Standardizes any shift string (e.g. "TURNO 1", "turno 1", "1", "Turno 1") strictly to "Turno 1", "Turno 2", or "Turno 3"
 */
export function padronizarNomeTurno(rawShift?: string): string {
  if (!rawShift) return 'Turno 1';
  const clean = rawShift.trim();
  const lower = clean.toLowerCase();
  if (lower.includes('3') || lower.endsWith('3')) return 'Turno 3';
  if (lower.includes('2') || lower.endsWith('2')) return 'Turno 2';
  if (lower.includes('1') || lower.endsWith('1')) return 'Turno 1';
  return 'Turno 1';
}

/**
 * Resolves the shift name for a given log using either log.shift or collaborator shift, normalized
 */
export function obterTurnoDoLog(log: ProductionLog, collaborators: Collaborator[]): string {
  if (log.shift) return padronizarNomeTurno(log.shift);
  const colab = collaborators.find(c => c.name.trim().toLowerCase() === log.collaboratorName.trim().toLowerCase());
  return padronizarNomeTurno(colab?.shift || 'Turno 1');
}

/**
 * Retorna todos os ShiftConfigs ativos no momento, suportando períodos onde turnos se sobrepõem/coincidem (Foto 3)
 */
export function obterTurnosAtivosNoMomento(shifts: ShiftConfig[], date: Date = new Date()): ShiftConfig[] {
  if (!shifts || shifts.length === 0) return [];
  const currentDayName = obterDiaSemanaSiglaPtBr(date);
  const currentHourMin = obterHoraMinutoPtBr(date);

  return shifts.filter((s) => {
    if (s.dias && s.dias.length > 0 && !s.dias.includes(currentDayName)) {
      return false;
    }
    if (s.entrada <= s.saida) {
      return currentHourMin >= s.entrada && currentHourMin <= s.saida;
    } else {
      // Overnight shift
      return currentHourMin >= s.entrada || currentHourMin <= s.saida;
    }
  });
}

/**
 * Returns the currently active ShiftConfig based on current clock time and active days
 */
export function obterTurnoAtual(shifts: ShiftConfig[], date: Date = new Date()): ShiftConfig | undefined {
  const activeList = obterTurnosAtivosNoMomento(shifts, date);
  return activeList.length > 0 ? activeList[0] : (shifts[0] || undefined);
}

/**
 * Returns the standardized name of the currently active shift (e.g. "Turno 1", "Turno 2", "Turno 3")
 */
export function obterNomeTurnoAtual(shifts: ShiftConfig[], date: Date = new Date()): string {
  const t = obterTurnoAtual(shifts, date);
  return t ? padronizarNomeTurno(t.name) : 'Turno 1';
}

/**
 * Busca a configuração do turno correspondente ao nome
 */
export function obterConfigTurno(shiftName: string, shifts: ShiftConfig[]): ShiftConfig | undefined {
  if (!shifts || shifts.length === 0) return undefined;
  const shiftNorm = padronizarNomeTurno(shiftName);
  return shifts.find(
    (s) =>
      padronizarNomeTurno(s.name) === shiftNorm ||
      padronizarNomeTurno(s.code) === shiftNorm ||
      s.name.toUpperCase().includes(shiftNorm.toUpperCase())
  );
}

/**
 * Verifica se um turno específico está com sua jornada em andamento no horário atual
 */
export function isTurnoAtivoNoMomento(shiftName: string, shifts: ShiftConfig[], date: Date = new Date()): boolean {
  if (!shifts || shifts.length === 0) return true;
  const shiftNorm = padronizarNomeTurno(shiftName);
  const activeShifts = obterTurnosAtivosNoMomento(shifts, date);
  return activeShifts.some(
    (s) =>
      padronizarNomeTurno(s.name) === shiftNorm ||
      padronizarNomeTurno(s.code) === shiftNorm
  );
}

/**
 * Verifica se o colaborador pertence a um turno cuja jornada está ativa no momento
 */
export function isColaboradorEmTurnoAtivo(colab: Collaborator, shifts: ShiftConfig[], date: Date = new Date()): boolean {
  if (!colab || !colab.active) return false;
  return isTurnoAtivoNoMomento(colab.shift, shifts, date);
}

/**
 * Calcula o estado dinâmico da pausa de refeição:
 * - Se em pausa de refeição: tempo restante regressivo da pausa (ex: de 90 min para 0)
 * - Se a pausa venceu: retoma automaticamente a contagem do tempo de trabalho na mesma atividade descontando a refeição
 */
export function calcularEstadoTempoRefeicao(
  log: ProductionLog,
  now: Date,
  shifts: ShiftConfig[],
  collaborators?: Collaborator[]
): {
  emPausaRefeicao: boolean;
  tempoRestantePausaSegundos: number;
  tempoDecorridoPausaSegundos: number;
  duracaoPausaMinutos: number;
  tempoTrabalhadoSegundos: number;
  pausaVenceuRetomou: boolean;
  horarioConfigurado?: string;
} {
  const mealConfig = obterConfiguracaoRefeicao(log.collaboratorName || log.shift || 'Turno 1', shifts, collaborators);
  const duracaoMinutos = log.mealPauseDurationMinutes || log.mealBreakMinutes || mealConfig.duracaoMinutos || 90;
  const duracaoPausaSegundos = duracaoMinutos * 60;
  const horarioConfigurado = `${mealConfig.saidaAlmoco} às ${mealConfig.retornoAlmoco} (${duracaoMinutos} min)`;

  // Calcular segundos desde o início da atividade
  const [hI, mI, sI] = (log.startTime || '00:00:00').split(':').map((v) => parseInt(v, 10) || 0);
  const dataInicio = new Date(now);
  dataInicio.setHours(hI, mI, sI, 0);
  if (dataInicio.getTime() > now.getTime()) {
    dataInicio.setDate(dataInicio.getDate() - 1);
  }
  const totalDesdeInicioSegundos = Math.max(0, Math.floor((now.getTime() - dataInicio.getTime()) / 1000));

  const isRefeicaoAct = isMealActivity(log.activity, log.category);

  if (!isRefeicaoAct && !log.isMealPause && log.status !== 'Pausada' && !log.mealPauseTimestampMs && !log.mealPauseStartTime) {
    return {
      emPausaRefeicao: false,
      tempoRestantePausaSegundos: 0,
      tempoDecorridoPausaSegundos: 0,
      duracaoPausaMinutos: duracaoMinutos,
      tempoTrabalhadoSegundos: totalDesdeInicioSegundos,
      pausaVenceuRetomou: false,
      horarioConfigurado,
    };
  }

  // Obter timestamp de quando a pausa foi clicada
  let pauseStartMs = log.mealPauseTimestampMs;
  if (!pauseStartMs && log.mealPauseStartTime) {
    const [hP, mP, sP] = log.mealPauseStartTime.split(':').map((v) => parseInt(v, 10) || 0);
    const dataPausa = new Date(now);
    dataPausa.setHours(hP, mP, sP, 0);
    if (dataPausa.getTime() > now.getTime()) {
      dataPausa.setDate(dataPausa.getDate() - 1);
    }
    pauseStartMs = dataPausa.getTime();
  }

  // Se for a própria atividade REFEIÇÃO, o início da contagem é o início da atividade
  if (!pauseStartMs && isRefeicaoAct) {
    pauseStartMs = dataInicio.getTime();
  }

  // Fallback 1: Se duracaoMinutes foi gravado no momento da pausa
  if (!pauseStartMs && log.durationMinutes !== undefined && log.durationMinutes > 0 && dataInicio) {
    pauseStartMs = dataInicio.getTime() + (log.durationMinutes * 60 * 1000);
  }

  // Fallback 2: Se ainda assim for indefinido mas o status for 'Pausada' ou isMealPause
  if (!pauseStartMs) {
    pauseStartMs = now.getTime();
  }

  const decorridoPausaSegundos = Math.max(0, Math.floor((now.getTime() - pauseStartMs) / 1000));
  const tempoRestantePausaSegundos = Math.max(0, duracaoPausaSegundos - decorridoPausaSegundos);

  // CASO 1: Atividade dedicada de REFEIÇÃO
  if (isRefeicaoAct) {
    const pausaVenceu = decorridoPausaSegundos >= duracaoPausaSegundos;
    return {
      emPausaRefeicao: true,
      tempoRestantePausaSegundos,
      tempoDecorridoPausaSegundos: decorridoPausaSegundos,
      duracaoPausaMinutos: duracaoMinutos,
      tempoTrabalhadoSegundos: 0, // Durante refeição não soma trabalho
      pausaVenceuRetomou: pausaVenceu,
      horarioConfigurado,
    };
  }

  // CASO 2: Pausa temporária dentro de outra atividade
  if (decorridoPausaSegundos < duracaoPausaSegundos && log.status === 'Pausada') {
    // Ainda dentro do intervalo da pausa de refeição
    const tempoTrabalhadoAntesPausa = Math.max(
      0,
      Math.floor((pauseStartMs - dataInicio.getTime()) / 1000)
    );
    return {
      emPausaRefeicao: true,
      tempoRestantePausaSegundos,
      tempoDecorridoPausaSegundos: decorridoPausaSegundos,
      duracaoPausaMinutos: duracaoMinutos,
      tempoTrabalhadoSegundos: tempoTrabalhadoAntesPausa,
      pausaVenceuRetomou: false,
      horarioConfigurado,
    };
  } else {
    // A pausa de refeição venceu os minutos configurados!
    // Volta a contar o tempo de trabalho líquido na mesma atividade
    const tempoTrabalhadoLiquido = Math.max(0, totalDesdeInicioSegundos - duracaoPausaSegundos);
    return {
      emPausaRefeicao: false,
      tempoRestantePausaSegundos: 0,
      tempoDecorridoPausaSegundos: decorridoPausaSegundos,
      duracaoPausaMinutos: duracaoMinutos,
      tempoTrabalhadoSegundos: tempoTrabalhadoLiquido,
      pausaVenceuRetomou: true,
      horarioConfigurado,
    };
  }
}
