import { ProductionLog, ShiftConfig, OperatorEfficiency, Collaborator, ActivityItem } from '../types';

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
 * Formats Date to "DD/MM/YYYY"
 */
export function formatarDataPtBr(date: Date): string {
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const ano = date.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

/**
 * Formats Date to "HH:mm:ss"
 */
export function formatarHoraPtBr(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
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
 * Obtém os horários e duração de refeição (almoço/janta) do turno do colaborador
 */
export function obterConfiguracaoRefeicao(colabShift: string, shifts: ShiftConfig[]): MealBreakConfig {
  const normShift = (colabShift || 'Turno 1').toUpperCase().trim();
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
    if (l.activity && l.activity.toUpperCase().includes('REFEIÇÃO')) return true;
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
  colabShift: string,
  shifts: ShiftConfig[],
  jaTeveRefeicaoNoDia: boolean = false
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

  const mealConfig = obterConfiguracaoRefeicao(colabShift, shifts);
  const sobreposicao = calcularSobreposicaoRefeicaoMinutos(
    startTime,
    endTime,
    mealConfig.saidaAlmoco,
    mealConfig.retornoAlmoco
  );

  if (sobreposicao >= 15) {
    // Se a sobreposição com o intervalo de almoço foi relevante (ex: >= 15 min), debita automaticamente
    const deducao = sobreposicao;
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
  shifts: ShiftConfig[] = []
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
  const mealConfig = obterConfiguracaoRefeicao(log.shift || 'Turno 1', shifts);
  const duracaoPausaMinutos = log.mealPauseDurationMinutes || mealConfig.duracaoMinutos || 90;
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

  // Se não está em pausa atualmente, desconta segundos de pausa anteriores
  const tempoPausadoAnterior =
    log.totalPausedSeconds || (log.mealBreakDeducted ? (log.mealBreakMinutes || 90) * 60 : 0);
  const tempoTrabalhadoSegundos = Math.max(0, totalSegundosDesdeInicio - tempoPausadoAnterior);

  return {
    tempoTrabalhadoSegundos,
    emPausaRefeicao: false,
    tempoRestantePausaSegundos: 0,
    tempoDecorridoPausaSegundos: 0,
    duracaoPausaMinutos,
    pausaVenceuRetomou: false,
  };
}

/**
 * Garante a regra fundamental de produção: cada colaborador executa apenas 1 atividade por vez.
 * Se houver múltiplos registros em status 'Em Execução' para o mesmo colaborador (devido a toques rápidos ou concorrência),
 * preserva o mais recente e finaliza os anteriores com segurança.
 * Também encerra automaticamente qualquer atividade ativa cujo turno já tenha encerrado ou que seja de dias anteriores.
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
  const activeColabSeen = new Set<string>();
  const sanitizedLogs: ProductionLog[] = [];
  const logsParaFinalizar: ProductionLog[] = [];
  const logsParaDeletar: string[] = [];
  const agora = new Date();
  const hojePtBr = formatarDataPtBr(agora);

  for (const log of logs) {
    // 1. Elimina logs residuais de retomada automática sintética
    if (log.id.startsWith('log-resume-') || log.resumedFromPreviousLogId) {
      logsParaDeletar.push(log.id);
      continue;
    }

    // Garante que nenhuma flag de retomada pendente permaneça ativa
    const cleanLog: ProductionLog = log.pendingNextShiftResume
      ? { ...log, pendingNextShiftResume: false }
      : log;

    if (cleanLog.status === 'Em Execução' || cleanLog.status === 'Pausada') {
      const colabKey = cleanLog.collaboratorName.trim().toLowerCase();

      // Verifica se o turno já encerrou (ou se a atividade é de dias anteriores)
      const isPreviousDay = Boolean(cleanLog.date && cleanLog.date !== hojePtBr);
      let shiftEnded = isPreviousDay;
      let shiftSaida = '17:30';
      let shiftEntrada = '07:00';
      let shiftDias: string[] | undefined = undefined;

      if (collaborators && shifts && shifts.length > 0) {
        const colab = collaborators.find((c) => c.name.trim().toLowerCase() === colabKey);
        const colabShift = (colab?.shift || cleanLog.shift || 'Turno 1').toUpperCase();
        const foundShift = shifts.find(
          (s) =>
            s.name.toUpperCase() === colabShift ||
            s.code.toUpperCase() === colabShift ||
            colabShift.includes(s.name.toUpperCase()) ||
            s.name.toUpperCase().includes(colabShift)
        ) || shifts[0];

        shiftSaida = foundShift.saida || '17:30';
        shiftEntrada = foundShift.entrada || '07:00';
        shiftDias = foundShift.dias;

        if (isPreviousDay || verificarTurnoEncerrado(foundShift.saida, foundShift.entrada, foundShift.dias, agora)) {
          shiftEnded = true;
        }
      } else if (!isPreviousDay) {
        // Fallback: se não temos lista de turnos, verifica horário padrão 17:30
        shiftEnded = verificarTurnoEncerrado('17:30', '07:00', undefined, agora);
      }

      if (shiftEnded) {
        // Encerramento automático por fim de turno / fim do dia anterior
        let dur = calcularDiferencaMinutos(cleanLog.startTime, shiftSaida);
        if (dur <= 0) dur = 60;
        let mealDeducted = cleanLog.mealBreakDeducted;
        let mealMins = cleanLog.mealBreakMinutes;
        if (!mealDeducted && dur > 90) {
          dur = Math.max(1, dur - 90);
          mealDeducted = true;
          mealMins = 90;
        }

        const autoClosedLog: ProductionLog = {
          ...cleanLog,
          status: 'Concluída',
          endTime: shiftSaida,
          durationMinutes: dur,
          autoClosed: true,
          autoClosedAtShiftEnd: true,
          pendingNextShiftResume: false,
          mealBreakDeducted: mealDeducted,
          mealBreakMinutes: mealMins,
          mealBreakSource: mealDeducted ? 'automatic' : undefined,
          observation: cleanLog.observation
            ? `${cleanLog.observation} | ⚠️ Encerrado Automaticamente: Fim de Turno (${shiftSaida})`
            : `⚠️ Encerrado Automaticamente: Fim de Turno (${shiftSaida}) - Fechado no fim do dia`,
        };
        sanitizedLogs.push(autoClosedLog);
        logsParaFinalizar.push(autoClosedLog);
      } else if (activeColabSeen.has(colabKey)) {
        // Já existe uma atividade mais recente aberta para este mesmo operador!
        // Finaliza com segurança este registro duplicado
        const fallbackEnd = cleanLog.endTime || formatarHoraPtBr(agora);
        const dur = calcularDiferencaMinutos(cleanLog.startTime, fallbackEnd);
        const autoFinished: ProductionLog = {
          ...cleanLog,
          status: 'Concluída',
          endTime: fallbackEnd,
          durationMinutes: dur > 0 ? dur : 1,
          observation: cleanLog.observation || 'Finalizada automaticamente por nova atividade do colaborador',
        };
        sanitizedLogs.push(autoFinished);
        logsParaFinalizar.push(autoFinished);
      } else {
        activeColabSeen.add(colabKey);
        sanitizedLogs.push(cleanLog);
      }
    } else {
      sanitizedLogs.push(cleanLog);
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

/**
 * Checks if current time is past the shift's end time (or outside working days)
 */
export function verificarTurnoEncerrado(saida: string, entrada: string, dias?: string[], date: Date = new Date()): boolean {
  if (!saida || !entrada) return false;

  // If shift working days are specified, verify if today is an active working day
  if (dias && dias.length > 0) {
    const DIAS_SIGLAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const diaHoje = DIAS_SIGLAS[date.getDay()];
    const diasNorm = dias.map((d) => d.trim().toLowerCase().slice(0, 3));
    const diaHojeNorm = diaHoje.trim().toLowerCase().slice(0, 3);
    if (!diasNorm.includes(diaHojeNorm)) {
      return true; // Outside operating days -> shift is closed!
    }
  }

  const currentHourMin = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const ent = entrada.slice(0, 5);
  const sai = saida.slice(0, 5);

  if (ent <= sai) {
    // Normal day shift (e.g. 07:00 to 17:30)
    // Active if ent <= currentHourMin <= sai
    // Closed if currentHourMin >= sai or currentHourMin < ent
    return currentHourMin >= sai || currentHourMin < ent;
  } else {
    // Overnight shift crossing midnight (e.g. 20:00 to 06:00 or 15:30 to 01:30)
    // Active if currentHourMin >= ent || currentHourMin <= sai
    // Closed if currentHourMin >= sai && currentHourMin < ent
    return currentHourMin >= sai && currentHourMin < ent;
  }
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

  // 1. Mapa de turnos e horas úteis por turno
  const turnosMap: Record<string, { shift: ShiftConfig; min: number; ent: string; sai: string; dias: string[] }> = {};
  shifts.forEach((s) => {
    const minCalculado = calcularCargaHorariaTurno(s);
    const shiftData = {
      shift: s,
      min: minCalculado,
      ent: s.entrada,
      sai: s.saida,
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
      isFimDoTurno: boolean;
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
            dias: shifts.find((s) => s.name.toUpperCase().includes(turnoKey) || turnoKey.includes(s.name.toUpperCase()))!.dias,
          }
        : {
            shift: shifts[0],
            min: 540,
            ent: '07:00',
            sai: '17:30',
            dias: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
          };

    // Calcula esperado no período somando os dias em que o turno trabalha
    let esperadoMinutosPeriodo = 0;
    diasIntervalo.forEach((diaInfo) => {
      const trabalhaNesteDia = tData.dias && tData.dias.includes(diaInfo.dayOfWeek);
      if (trabalhaNesteDia) {
        esperadoMinutosPeriodo += tData.min;
      }
    });

    const isFim = verificarTurnoEncerrado(tData.sai, tData.ent, tData.dias);

    colabMap[c.name.trim().toLowerCase()] = {
      collaborator: c,
      shiftName: c.shift || 'Turno 1',
      shiftEntrada: tData.ent,
      shiftSaida: tData.sai,
      esperadoTotalMinutos: esperadoMinutosPeriodo,
      trabalhadoTotalMinutos: 0,
      trabalhadoPorDia: {},
      operacoes: {},
      isFimDoTurno: isFim,
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
        isFimDoTurno: true,
      };
    }

    const colabEntry = colabMap[colabKey];
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
      if (logDatePtBr === hojePtBr && !colabEntry.isFimDoTurno) {
        // Atividade em andamento hoje dentro do turno
        const parts = log.startTime.split(':');
        const h = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        const agora = new Date();
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

  // 4. Monta resultado consolidado por operador
  const arrayFinal: OperatorEfficiency[] = [];

  Object.values(colabMap).forEach((cData) => {
    // Soma tempo trabalhado (capando cada dia à carga diária normal para evitar distorções)
    let totalTrabalhado = 0;
    Object.entries(cData.trabalhadoPorDia).forEach(([, tempoDia]) => {
      // Carga padrão diária de referência = 540 min (9h) ou proporcional ao turno
      const cargaDiariaReferencia = cData.esperadoTotalMinutos > 0 && diasIntervalo.length > 0
        ? cData.esperadoTotalMinutos / diasIntervalo.length
        : 540;
      
      // Limita o tempo normal de um dia para a carga máxima útil diária
      const tempoAjustadoDia = Math.min(tempoDia, Math.max(cargaDiariaReferencia, 540));
      totalTrabalhado += tempoAjustadoDia;
    });

    const esperado = cData.esperadoTotalMinutos;
    
    // Se o turno não tem esperado (ex: folga em todos os dias do filtro), eficiência é 100% se trabalhou
    const efi = esperado > 0 ? (totalTrabalhado / esperado) * 100 : totalTrabalhado > 0 ? 100 : 0;
    const semApontar = esperado > 0 ? Math.max(0, esperado - totalTrabalhado) : 0;
    const isAlerta = cData.isFimDoTurno && semApontar > toleranciaMinutos;

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
      trabalhadoMinutos: totalTrabalhado,
      semApontarMinutos: semApontar,
      eficienciaPct: parseFloat(Math.min(efi, 100).toFixed(1)),
      eficienciaRaw: Math.min(efi, 100),
      isFimDoTurno: cData.isFimDoTurno,
      isAlertaSemApontar: isAlerta,
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
  const DIAS_SIGLAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  const currentDayName = DIAS_SIGLAS[date.getDay()];
  const currentHourMin = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

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
 * Calcula o estado dinâmico da pausa de refeição:
 * - Se em pausa de refeição: tempo restante regressivo da pausa (ex: de 90 min para 0)
 * - Se a pausa venceu: retoma automaticamente a contagem do tempo de trabalho na mesma atividade descontando a refeição
 */
export function calcularEstadoTempoRefeicao(
  log: ProductionLog,
  now: Date,
  shifts: ShiftConfig[]
): {
  emPausaRefeicao: boolean;
  tempoRestantePausaSegundos: number;
  duracaoPausaMinutos: number;
  tempoTrabalhadoSegundos: number;
  pausaVenceuRetomou: boolean;
} {
  const colabShift = log.shift || 'Turno 1';
  const mealConfig = obterConfiguracaoRefeicao(colabShift, shifts);
  const duracaoMinutos = log.mealPauseDurationMinutes || log.mealBreakMinutes || mealConfig.duracaoMinutos || 90;
  const duracaoPausaSegundos = duracaoMinutos * 60;

  // Calcular segundos desde o início da atividade
  const [hI, mI, sI] = (log.startTime || '00:00:00').split(':').map((v) => parseInt(v, 10) || 0);
  const dataInicio = new Date(now);
  dataInicio.setHours(hI, mI, sI, 0);
  if (dataInicio.getTime() > now.getTime()) {
    dataInicio.setDate(dataInicio.getDate() - 1);
  }
  const totalDesdeInicioSegundos = Math.max(0, Math.floor((now.getTime() - dataInicio.getTime()) / 1000));

  if (!log.isMealPause && log.status !== 'Pausada' && !log.mealPauseTimestampMs && !log.mealPauseStartTime) {
    return {
      emPausaRefeicao: false,
      tempoRestantePausaSegundos: 0,
      duracaoPausaMinutos: duracaoMinutos,
      tempoTrabalhadoSegundos: totalDesdeInicioSegundos,
      pausaVenceuRetomou: false,
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

  if (decorridoPausaSegundos < duracaoPausaSegundos && log.status === 'Pausada') {
    // Ainda dentro do intervalo da pausa de refeição
    const tempoTrabalhadoAntesPausa = Math.max(
      0,
      Math.floor((pauseStartMs - dataInicio.getTime()) / 1000)
    );
    return {
      emPausaRefeicao: true,
      tempoRestantePausaSegundos,
      duracaoPausaMinutos: duracaoMinutos,
      tempoTrabalhadoSegundos: tempoTrabalhadoAntesPausa,
      pausaVenceuRetomou: false,
    };
  } else {
    // A pausa de refeição venceu os minutos configurados!
    // Volta a contar o tempo de trabalho líquido na mesma atividade
    const tempoTrabalhadoLiquido = Math.max(0, totalDesdeInicioSegundos - duracaoPausaSegundos);
    return {
      emPausaRefeicao: false,
      tempoRestantePausaSegundos: 0,
      duracaoPausaMinutos: duracaoMinutos,
      tempoTrabalhadoSegundos: tempoTrabalhadoLiquido,
      pausaVenceuRetomou: true,
    };
  }
}
