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
 * Checks if current time is past the shift's end time
 */
export function verificarTurnoEncerrado(saida: string, entrada: string, dias?: string[]): boolean {
  if (!saida || !entrada) return false;
  const agora = new Date();

  // If shift working days are specified, verify if today is an active working day
  if (dias && dias.length > 0) {
    const DIAS_SIGLAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const diaHoje = DIAS_SIGLAS[agora.getDay()];
    if (!dias.includes(diaHoje)) {
      return true; // Outside operating days
    }
  }

  const minAtual = agora.getHours() * 60 + agora.getMinutes();

  const pS = saida.split(':');
  const minSaida = parseInt(pS[0], 10) * 60 + parseInt(pS[1], 10);

  const pE = entrada.split(':');
  const minEntrada = parseInt(pE[0], 10) * 60 + parseInt(pE[1], 10);

  if (minSaida >= minEntrada) {
    // Day shift (e.g. 08:00 to 17:48)
    return minAtual >= minSaida || minAtual < (minEntrada - 120);
  } else {
    // Night shift (e.g. 18:00 to 03:00)
    return minAtual >= minSaida && minAtual < (minEntrada - 120);
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
 * Calculates team efficiency per operator (mirroring Código.gs: obterEficienciaEquipe)
 */
export function calcularEficienciaEquipe(
  logs: ProductionLog[],
  collaborators: Collaborator[],
  shifts: ShiftConfig[],
  dataAlvo: string,
  toleranciaMinutos: number = 60
): OperatorEfficiency[] {
  // Determine day of the week for targeted date if available
  let targetDayOfWeek = '';
  if (dataAlvo) {
    const parts = dataAlvo.includes('/') ? dataAlvo.split('/') : dataAlvo.split('-');
    let d: Date | null = null;
    if (dataAlvo.includes('/')) {
      // DD/MM/YYYY
      d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    } else {
      // YYYY-MM-DD
      d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    if (d && !isNaN(d.getTime())) {
      const DIAS_MAP = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
      targetDayOfWeek = DIAS_MAP[d.getDay()];
    }
  }

  // 1. Shift minutes map dynamically built from shifts prop
  const turnosMap: Record<string, { min: number; ent: string; sai: string; dias: string[]; isInactive: boolean }> = {};

  shifts.forEach((s) => {
    const isInactive = !s.dias || s.dias.length === 0;
    const isOffDay = targetDayOfWeek ? (!s.dias || !s.dias.includes(targetDayOfWeek)) : isInactive;
    const minCalculado = isOffDay ? 0 : calcularCargaHorariaTurno(s);

    const shiftData = {
      min: minCalculado,
      ent: s.entrada,
      sai: s.saida,
      dias: s.dias || [],
      isInactive: isInactive || isOffDay,
    };

    const keyName = s.name.toUpperCase().trim();
    const keyCode = s.code.toUpperCase().trim();
    turnosMap[keyName] = shiftData;
    turnosMap[keyCode] = shiftData;

    const numOnly = s.code.replace(/\D/g, '');
    if (numOnly) {
      turnosMap[`TURNO ${numOnly}`] = shiftData;
      turnosMap[`T${numOnly}`] = shiftData;
    }
  });

  // 2. Collaborator info map
  const colabInfo: Record<string, { role: string; turno: string; esperado: number; entrada: string; saida: string; dias: string[]; isInactive: boolean }> = {};
  collaborators.forEach((c) => {
    const turnoKey = (c.shift || 'Turno 1').toUpperCase().trim();
    const tInfo =
      turnosMap[turnoKey] ||
      shifts.find((s) => s.name.toUpperCase().includes(turnoKey) || turnoKey.includes(s.name.toUpperCase()))?.dias
        ? {
            min: calcularCargaHorariaTurno(
              shifts.find((s) => s.name.toUpperCase().includes(turnoKey) || turnoKey.includes(s.name.toUpperCase()))!
            ),
            ent: shifts.find((s) => s.name.toUpperCase().includes(turnoKey) || turnoKey.includes(s.name.toUpperCase()))!.entrada,
            sai: shifts.find((s) => s.name.toUpperCase().includes(turnoKey) || turnoKey.includes(s.name.toUpperCase()))!.saida,
            dias: shifts.find((s) => s.name.toUpperCase().includes(turnoKey) || turnoKey.includes(s.name.toUpperCase()))!.dias,
            isInactive: false,
          }
        : {
            min: 0,
            ent: '07:00',
            sai: '17:30',
            dias: [],
            isInactive: true,
          };

    colabInfo[c.name] = {
      role: c.role,
      turno: c.shift || 'Turno 1',
      esperado: tInfo.min,
      entrada: tInfo.ent,
      saida: tInfo.sai,
      dias: tInfo.dias,
      isInactive: tInfo.isInactive,
    };
  });

  // 3. Process logs for targeted date
  const resultados: Record<string, { trabalhado: number; operacoes: Record<string, number> }> = {};

  logs.forEach((log) => {
    if (log.date === dataAlvo && (log.status === 'Concluída' || log.status === 'Em Execução')) {
      let tempoMin = 0;
      if (log.status === 'Concluída') {
        tempoMin = log.durationMinutes !== undefined
          ? log.durationMinutes
          : calcularDiferencaMinutos(log.startTime, log.endTime);
      } else if (log.status === 'Em Execução' && log.startTime) {
        const parts = log.startTime.split(':');
        if (parts.length >= 2) {
          const agora = new Date();
          const horaInicio = new Date();
          horaInicio.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2] || '0', 10), 0);
          const diffMs = agora.getTime() - horaInicio.getTime();
          if (diffMs > 0) {
            tempoMin = diffMs / (1000 * 60);
          }
        }
      }

      if (!resultados[log.collaboratorName]) {
        resultados[log.collaboratorName] = { trabalhado: 0, operacoes: {} };
      }
      resultados[log.collaboratorName].trabalhado += tempoMin;

      if (!resultados[log.collaboratorName].operacoes[log.activity]) {
        resultados[log.collaboratorName].operacoes[log.activity] = 0;
      }
      resultados[log.collaboratorName].operacoes[log.activity] += tempoMin;
    }
  });

  // 4. Build final array
  const arrayFinal: OperatorEfficiency[] = [];

  for (const nomeColab in resultados) {
    const info = colabInfo[nomeColab] || {
      role: 'OPERADOR',
      turno: 'Turno 1',
      esperado: 0,
      entrada: '07:00',
      saida: '17:30',
      dias: [],
      isInactive: false,
    };
    const res = resultados[nomeColab];
    
    // If shift has 0 expected minutes (e.g. inactive shift or off day), efficiency is based on work done or 100%
    const efi = info.esperado > 0 ? (res.trabalhado / info.esperado) * 100 : res.trabalhado > 0 ? 100 : 0;
    let semApontar = info.esperado > 0 ? info.esperado - res.trabalhado : 0;
    if (semApontar < 0) semApontar = 0;

    const isFim = verificarTurnoEncerrado(info.saida, info.entrada, info.dias);
    const isAlerta = isFim && semApontar > toleranciaMinutos;

    const opsArray = Object.keys(res.operacoes).map((opNome) => ({
      nome: opNome,
      tempoMinutos: res.operacoes[opNome],
    })).sort((a, b) => b.tempoMinutos - a.tempoMinutos);

    arrayFinal.push({
      nome: nomeColab,
      role: info.role,
      turno: info.turno,
      turnoEntrada: info.entrada,
      turnoSaida: info.saida,
      esperadoMinutos: info.esperado,
      trabalhadoMinutos: res.trabalhado,
      semApontarMinutos: semApontar,
      eficienciaPct: parseFloat(Math.min(efi, 100).toFixed(1)),
      eficienciaRaw: efi,
      isFimDoTurno: isFim,
      isAlertaSemApontar: isAlerta,
      operacoes: opsArray,
    });
  }

  arrayFinal.sort((a, b) => b.eficienciaRaw - a.eficienciaRaw);
  return arrayFinal;
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
