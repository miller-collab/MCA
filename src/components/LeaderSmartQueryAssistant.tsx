import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Sparkles, Search, Clock, Hash, Calendar, User, Layers, 
  TrendingUp, CheckCircle2, AlertTriangle, ArrowRight, X, 
  RotateCcw, Copy, ExternalLink, ChevronDown, ChevronUp, Zap, HelpCircle,
  Trophy, Award, Flame, BarChart3, UtensilsCrossed, ShieldAlert, AlertOctagon
} from 'lucide-react';
import { ProductionLog, Collaborator, ShiftConfig, ActivityItem, AutoCloseNotification } from '../types';
import { 
  formatarHorasMinutos, 
  calcularDiferencaMinutos, 
  obterDataHojeIsoPtBr 
} from '../utils/factoryCalculations';

function formatarDataIsoOuPtBr(dStr: string): string {
  if (!dStr) return '';
  if (dStr.includes('/')) return dStr;
  const parts = dStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dStr;
}

/**
 * Identifica se uma atividade corresponde a intervalo ou refeição estatutária
 * (almoço, janta, lanche, refeição, intervalo), a qual não deve contar como
 * tempo produtivo ou atraso de processo fabril no ranking de demora.
 */
export function isMealActivity(activityNameOrCategory?: string, code?: string): boolean {
  if (!activityNameOrCategory) return false;
  const lower = activityNameOrCategory.toLowerCase();
  if (code && (code.toLowerCase() === 'p2.5' || code.toLowerCase().startsWith('p2.5'))) return true;
  return (
    lower.includes('refeiç') ||
    lower.includes('refeicao') ||
    lower.includes('almoço') ||
    lower.includes('almoco') ||
    lower.includes('janta') ||
    lower.includes('jantar') ||
    lower.includes('lanche') ||
    lower.includes('intervalo') ||
    lower === 'refeição' ||
    lower === 'refeicao'
  );
}

interface LeaderSmartQueryAssistantProps {
  logs: ProductionLog[];
  collaborators: Collaborator[];
  activities: ActivityItem[];
  shifts: ShiftConfig[];
  autoCloseNotifs?: AutoCloseNotification[];
  onNavigateToHistory?: (filterName?: string) => void;
}

type PeriodPreset = 'HOJE' | 'ONTEM' | '7DIAS' | 'ESTE_MES' | 'ESPECIFICA' | 'PERSONALIZADO';
type MetricFocus = 
  | 'TODOS' 
  | 'TOP_ATIVIDADES_TEMPO' 
  | 'TOP_ATIVIDADES_CONTAGEM' 
  | 'ATIVIDADES_MAIS_RAPIDAS' 
  | 'CONTAGEM' 
  | 'TEMPO_MEDIO' 
  | 'TEMPO_TOTAL' 
  | 'MEDIA_DIARIA'
  | 'ESQUECIDAS_ENCERRAR';

interface EnrichedActivityOption {
  code: string; // "P1", "P2", "P2.5", etc.
  name: string; // "CORREÇÕES DE FERRAMENTAS"
  fullName: string; // "P2 - CORREÇÕES DE FERRAMENTAS"
  category: string;
  standardMinutes?: number;
  role: string;
}

export const LeaderSmartQueryAssistant: React.FC<LeaderSmartQueryAssistantProps> = ({
  logs,
  collaborators,
  activities,
  shifts,
  autoCloseNotifs = [],
  onNavigateToHistory,
}) => {
  // 1. Estado da consulta livre e construtor guiado
  const [naturalQuery, setNaturalQuery] = useState('');
  const [selectedColab, setSelectedColab] = useState<string>('TODOS');
  const [selectedActivityName, setSelectedActivityName] = useState<string>('TODOS');
  const [activitySearchInput, setActivitySearchInput] = useState('');
  const [isActivityDropdownOpen, setIsActivityDropdownOpen] = useState(false);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('HOJE');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [specificDate, setSpecificDate] = useState(() => obterDataHojeIsoPtBr());
  const [metricFocus, setMetricFocus] = useState<MetricFocus>('TODOS');
  const [rankingSortBy, setRankingSortBy] = useState<'TEMPO' | 'DIARIO' | 'MEDIA' | 'CONTAGEM'>('TEMPO');
  const [excludeMeals, setExcludeMeals] = useState<boolean>(true); // Refeição não conta nos tempos produtivos por padrão
  const [copiedAnswer, setCopiedAnswer] = useState(false);
  const [showLogsDetails, setShowLogsDetails] = useState(false);
  const activityDropdownRef = useRef<HTMLDivElement>(null);

  // 2. Mapeamento enriquecido de todas as atividades com suas prioridades (Ex: P2 - CORREÇÕES DE FERRAMENTAS)
  const enrichedActivitiesList = useMemo<EnrichedActivityOption[]>(() => {
    const list: EnrichedActivityOption[] = [];
    const seen = new Set<string>();

    // 1º: Atividades cadastradas nas configurações da fábrica
    (activities || []).forEach((act) => {
      const code = `P${act.priority !== undefined ? act.priority : '?'}`;
      const name = act.name.trim();
      const key = `${code}-${name.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push({
          code,
          name,
          fullName: `${code} - ${name}`,
          category: act.category || 'Operação',
          standardMinutes: act.standardMinutes,
          role: act.role || 'Geral',
        });
      }
    });

    // 2º: Atividades encontradas nos logs mas que possam não estar nas atividades ativas
    (logs || []).forEach((log) => {
      if (log.activity && log.activity.trim()) {
        const name = log.activity.trim();
        const existing = list.find((a) => a.name.toLowerCase() === name.toLowerCase());
        if (!existing) {
          const key = `P?-${name.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            list.push({
              code: 'P?',
              name,
              fullName: name,
              category: log.category || 'Operação',
              role: log.role || 'Geral',
            });
          }
        }
      }
    });

    // Ordenar por prioridade numérica
    return list.sort((a, b) => {
      const numA = parseFloat(a.code.replace('P', '')) || 999;
      const numB = parseFloat(b.code.replace('P', '')) || 999;
      return numA - numB;
    });
  }, [activities, logs]);

  // Lista de atividades filtradas pela busca interativa
  const filteredActivityOptions = useMemo(() => {
    if (!activitySearchInput.trim()) return enrichedActivitiesList;
    const q = activitySearchInput.toLowerCase().trim();
    return enrichedActivitiesList.filter(
      (a) =>
        a.fullName.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q)
    );
  }, [enrichedActivitiesList, activitySearchInput]);

  // Lista única de operadores (ativos + colaboradores encontrados nos logs)
  const availableOperators = useMemo(() => {
    const map = new Map<string, { name: string; role: string }>();
    (collaborators || []).forEach((c) => {
      if (c && c.name) map.set(c.name.trim().toLowerCase(), { name: c.name.trim(), role: c.role || 'Operador' });
    });
    (logs || []).forEach((l) => {
      if (l && l.collaboratorName) {
        const key = l.collaboratorName.trim().toLowerCase();
        if (!map.has(key)) {
          map.set(key, { name: l.collaboratorName.trim(), role: l.role || 'Operador' });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [collaborators, logs]);

  // Fechar dropdown de atividades ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (activityDropdownRef.current && !activityDropdownRef.current.contains(e.target as Node)) {
        setIsActivityDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 3. Parser Inteligente de Linguagem Natural (interpreta perguntas digitadas)
  const handleParseNaturalQuery = (queryText: string) => {
    setNaturalQuery(queryText);
    if (!queryText.trim()) return;

    const lower = queryText.toLowerCase();

    // 1. Detectar se a pergunta é sobre esquecimento ou não encerramento de atividades
    // Ex: "qual colaborador mais esqueci de encerrar atividades", "quem mais esquece de fechar atividade", "atividades em aberto"
    const isAskingForgottenToClose =
      /esquec/i.test(lower) || // esqueci, esquece, esquecem, esqueceram, esquecida, esquecimento
      /n[aã]o\s+(encerrou|fechou|finalizou|encerrar)/i.test(lower) ||
      /sem\s+(encerrar|fechar|finalizar)/i.test(lower) ||
      /em\s+aberto/i.test(lower) ||
      /deixou\s+abert/i.test(lower) ||
      /auto[- ]?encerrad/i.test(lower) ||
      /auto[- ]?fechad/i.test(lower) ||
      /fim\s+de\s+turno/i.test(lower);

    const isAskingWhichCollaborator =
      /qual(\s+o)?\s+(colaborador|operador|funcion[aá]rio)/i.test(lower) ||
      /quais(\s+os)?\s+(colaboradores|operadores)/i.test(lower) ||
      /\bquem\b/i.test(lower);

    // 2. Detectar Operador citado
    let foundColab = 'TODOS';
    for (const op of availableOperators) {
      const opLower = op.name.toLowerCase();
      // Checa primeiro nome ou nome completo
      const firstName = opLower.split(' ')[0];
      if (lower.includes(opLower) || (firstName.length >= 3 && new RegExp(`\\b${firstName}\\b`).test(lower))) {
        foundColab = op.name;
        break;
      }
    }

    // Se perguntou "qual colaborador...", deve analisar todos para poder ranquear quem mais esquece/faz
    if (isAskingWhichCollaborator && foundColab === 'TODOS') {
      setSelectedColab('TODOS');
    } else {
      setSelectedColab(foundColab);
    }

    // 3. Detectar se é uma pergunta comparativa de "QUAL ATIVIDADE..."
    const isAskingWhichActivity = 
      /qual(\s+a)?\s+atividade/i.test(lower) ||
      /quais(\s+as)?\s+atividades/i.test(lower) ||
      /em\s+qual/i.test(lower) ||
      /onde\s+(ele|ela|o\s+colaborador|o\s+operador|a\s+equipe)?\s*(passa|gasta|demora|leva)/i.test(lower) ||
      /o\s+que\s+(ele|ela|o\s+colaborador|o\s+operador|a\s+equipe)\s+mais/i.test(lower);

    const isAskingMostTime =
      /mais\s+leva\s+tempo/i.test(lower) ||
      /mais\s+demora/i.test(lower) ||
      /demora\s+mais/i.test(lower) ||
      /mais\s+gasta\s+tempo/i.test(lower) ||
      /gasta\s+mais\s+tempo/i.test(lower) ||
      /mais\s+tempo/i.test(lower) ||
      /maior\s+tempo/i.test(lower) ||
      /demora\s+diariamente/i.test(lower) ||
      /mais\s+demorada/i.test(lower);

    const isAskingMostCount =
      /mais\s+feita/i.test(lower) ||
      /mais\s+realizada/i.test(lower) ||
      /mais\s+frequente/i.test(lower) ||
      /mais\s+vezes/i.test(lower) ||
      /mais\s+executada/i.test(lower) ||
      /maior\s+quantidade/i.test(lower);

    const isAskingFastest =
      /mais\s+r[aá]pida/i.test(lower) ||
      /menos\s+demora/i.test(lower) ||
      /menor\s+tempo/i.test(lower) ||
      /mais\s+curta/i.test(lower);

    // 4. Detecção de Refeição explícita
    const isExplicitMealQuery = lower.includes('refeiç') || lower.includes('almoço') || lower.includes('p2.5');
    if (isExplicitMealQuery) {
      setExcludeMeals(false); // Usuário pediu especificamente refeição
    } else {
      setExcludeMeals(true); // Refeição não conta nos tempos e rankings de atividades por padrão
    }

    // 5. Detectar Atividade (Código ex: P2, P1, P3, P2.5 ou palavras-chave no nome)
    let foundAct = 'TODOS';
    
    // Se a pergunta for "qual atividade..." ou pergunta sobre esquecer de encerrar, NÃO fixa uma atividade específica
    if (!isAskingWhichActivity && !isAskingForgottenToClose) {
      // Testa primeiro código exato de prioridade (ex: P2, P1, P3, P2.5)
      const priorityMatch = lower.match(/\bp\s*([0-9]+(\.[0-9]+)?)\b/);
      if (priorityMatch) {
        const codeTarget = `p${priorityMatch[1]}`;
        const matchByCode = enrichedActivitiesList.find((a) => a.code.toLowerCase() === codeTarget);
        if (matchByCode) {
          foundAct = matchByCode.name;
        }
      }

      if (foundAct === 'TODOS') {
        // Testa nomes e termos comuns
        for (const act of enrichedActivitiesList) {
          const actLower = act.name.toLowerCase();
          if (lower.includes(actLower)) {
            foundAct = act.name;
            break;
          }
        }
      }

      // Termos sinônimos frequentes
      if (foundAct === 'TODOS') {
        if (lower.includes('correç') || lower.includes('corrigir')) {
          const p2 = enrichedActivitiesList.find((a) => a.code === 'P2' || a.name.toLowerCase().includes('correç'));
          if (p2) foundAct = p2.name;
        } else if (lower.includes('troca de ferramenta') || lower.includes('trocar ferramenta')) {
          const p3 = enrichedActivitiesList.find((a) => a.code === 'P3' || a.name.toLowerCase().includes('troca'));
          if (p3) foundAct = p3.name;
        } else if (lower.includes('afiar')) {
          const p1 = enrichedActivitiesList.find((a) => a.code === 'P1' || a.name.toLowerCase().includes('afiar'));
          if (p1) foundAct = p1.name;
        } else if (lower.includes('refeiç') || lower.includes('almoço')) {
          const pMeal = enrichedActivitiesList.find((a) => a.name.toLowerCase().includes('refeiç'));
          if (pMeal) foundAct = pMeal.name;
        }
      }
    }
    setSelectedActivityName(foundAct);

    // 6. Detectar Período
    if (lower.includes('hoje')) {
      setPeriodPreset('HOJE');
    } else if (lower.includes('ontem')) {
      setPeriodPreset('ONTEM');
    } else if (lower.includes('7 dias') || lower.includes('semana')) {
      setPeriodPreset('7DIAS');
    } else if (lower.includes('mês') || lower.includes('mes')) {
      setPeriodPreset('ESTE_MES');
    } else if (lower.includes('diariamente') || lower.includes('dia a dia') || lower.includes('rotina')) {
      // Quando pergunta de tempo diário ou rotina sem especificar o dia, o mês corrente dá a melhor amostra estatística
      setPeriodPreset('ESTE_MES');
    } else {
      // Verificar se há data explícita (ex: 26/10/2026 ou 26/10)
      const dateMatch = queryText.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
      if (dateMatch) {
        const day = dateMatch[1].padStart(2, '0');
        const month = dateMatch[2].padStart(2, '0');
        const year = dateMatch[3] ? (dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]) : new Date().getFullYear().toString();
        setSpecificDate(`${year}-${month}-${day}`);
        setPeriodPreset('ESPECIFICA');
      }
    }

    // 7. Detectar Métrica / Foco da Resposta
    if (isAskingForgottenToClose) {
      setMetricFocus('ESQUECIDAS_ENCERRAR');
    } else if (isAskingFastest) {
      setMetricFocus('ATIVIDADES_MAIS_RAPIDAS');
      setRankingSortBy('MEDIA');
    } else if (isAskingMostCount) {
      setMetricFocus('TOP_ATIVIDADES_CONTAGEM');
      setRankingSortBy('CONTAGEM');
    } else if (isAskingMostTime || isAskingWhichActivity) {
      setMetricFocus('TOP_ATIVIDADES_TEMPO');
      setRankingSortBy('TEMPO');
    } else if (lower.includes('quantas vezes') || lower.includes('quantos') || lower.includes('quantidade')) {
      setMetricFocus('CONTAGEM');
    } else if (lower.includes('tempo médio') || lower.includes('tempo medio') || lower.includes('demora em media') || lower.includes('quanto tempo demora')) {
      setMetricFocus('TEMPO_MEDIO');
    } else if (lower.includes('tempo total') || lower.includes('total de horas') || lower.includes('quanto tempo gastou')) {
      setMetricFocus('TEMPO_TOTAL');
    } else if (lower.includes('por dia') || lower.includes('media diaria') || lower.includes('média diária')) {
      setMetricFocus('MEDIA_DIARIA');
    } else {
      setMetricFocus('TODOS');
    }
  };

  // 4. Determinação das datas limites conforme o preset escolhido
  const periodDates = useMemo(() => {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (periodPreset === 'HOJE') {
      const iso = toIso(today);
      return { start: iso, end: iso, label: `Hoje (${formatarDataIsoOuPtBr(iso)})` };
    }
    if (periodPreset === 'ONTEM') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const iso = toIso(yesterday);
      return { start: iso, end: iso, label: `Ontem (${formatarDataIsoOuPtBr(iso)})` };
    }
    if (periodPreset === '7DIAS') {
      const startD = new Date(today);
      startD.setDate(startD.getDate() - 6);
      return {
        start: toIso(startD),
        end: toIso(today),
        label: `Últimos 7 Dias (${formatarDataIsoOuPtBr(toIso(startD))} a ${formatarDataIsoOuPtBr(toIso(today))})`,
      };
    }
    if (periodPreset === 'ESTE_MES') {
      const startD = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        start: toIso(startD),
        end: toIso(today),
        label: `Este Mês (${formatarDataIsoOuPtBr(toIso(startD))} a ${formatarDataIsoOuPtBr(toIso(today))})`,
      };
    }
    if (periodPreset === 'ESPECIFICA') {
      const iso = specificDate || toIso(today);
      return { start: iso, end: iso, label: `Data ${formatarDataIsoOuPtBr(iso)}` };
    }
    if (periodPreset === 'PERSONALIZADO') {
      const s = customStartDate || toIso(today);
      const e = customEndDate || toIso(today);
      return {
        start: s,
        end: e,
        label: `Período ${formatarDataIsoOuPtBr(s)} a ${formatarDataIsoOuPtBr(e)}`,
      };
    }
    const iso = toIso(today);
    return { start: iso, end: iso, label: `Hoje (${formatarDataIsoOuPtBr(iso)})` };
  }, [periodPreset, specificDate, customStartDate, customEndDate]);

  // 5. Filtragem Cirúrgica dos Logs para Análise
  const analyzedData = useMemo(() => {
    const { start, end } = periodDates;
    const startNum = parseInt(start.replace(/-/g, ''), 10);
    const endNum = parseInt(end.replace(/-/g, ''), 10);

    const targetColabNorm = selectedColab !== 'TODOS' ? selectedColab.trim().toLowerCase() : null;
    const targetActNorm = selectedActivityName !== 'TODOS' ? selectedActivityName.trim().toLowerCase() : null;

    const matchedLogs = (logs || []).filter((l) => {
      if (!l || !l.date) return false;

      // Normaliza data do log (DD/MM/YYYY ou YYYY-MM-DD)
      let logDateIso = l.date;
      if (l.date.includes('/')) {
        const parts = l.date.split('/');
        if (parts.length === 3) {
          logDateIso = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
      const logNum = parseInt(logDateIso.replace(/-/g, ''), 10);
      if (isNaN(logNum) || logNum < startNum || logNum > endNum) return false;

      // Filtro por colaborador
      if (targetColabNorm && l.collaboratorName.trim().toLowerCase() !== targetColabNorm) {
        return false;
      }

      // Filtro por atividade
      if (targetActNorm && l.activity.trim().toLowerCase() !== targetActNorm) {
        return false;
      }

      return true;
    });

    // Ordenar cronologicamente inverso (mais recentes primeiro)
    matchedLogs.sort((a, b) => {
      const dateComp = (b.date || '').localeCompare(a.date || '');
      if (dateComp !== 0) return dateComp;
      return (b.startTime || '').localeCompare(a.startTime || '');
    });

    // Cálculos Métricos Globais
    const totalCount = matchedLogs.length;
    const completedLogs = matchedLogs.filter((l) => l.status === 'Concluída');
    const inProgressLogs = matchedLogs.filter((l) => l.status === 'Em Execução' || l.status === 'Pausada');

    // Duração de cada execução
    const durations = matchedLogs.map((l) => {
      if (l.durationMinutes && l.durationMinutes > 0) return l.durationMinutes;
      if (l.startTime && l.endTime) {
        return Math.max(1, calcularDiferencaMinutos(l.startTime, l.endTime));
      }
      return 0;
    }).filter((d) => d > 0);

    const totalMinutes = durations.reduce((acc, curr) => acc + curr, 0);
    const avgMinutesPerExecution = durations.length > 0 ? Math.round(totalMinutes / durations.length) : 0;

    // Dias distintos trabalhados com essa atividade
    const distinctDaysSet = new Set(matchedLogs.map((l) => l.date));
    const distinctDaysCount = distinctDaysSet.size;
    const avgMinutesPerDay = distinctDaysCount > 0 ? Math.round(totalMinutes / distinctDaysCount) : 0;

    const minMinutes = durations.length > 0 ? Math.min(...durations) : 0;
    const maxMinutes = durations.length > 0 ? Math.max(...durations) : 0;

    // Tempo Padrão da Atividade Selecionada (se houver)
    const targetActItem = enrichedActivitiesList.find(
      (a) => a.name.toLowerCase() === (selectedActivityName || '').toLowerCase()
    );
    const standardMinutes = targetActItem?.standardMinutes;

    // Comparativo com padrão
    let standardDiff: number | null = null;
    if (standardMinutes && standardMinutes > 0 && avgMinutesPerExecution > 0) {
      standardDiff = avgMinutesPerExecution - standardMinutes;
    }

    // -------------------------------------------------------------
    // BREAKDOWN DETALHADO POR ATIVIDADE (PARA RESPONDER QUAL ATIVIDADE MAIS DEMORA)
    // -------------------------------------------------------------
    const activityMap = new Map<string, {
      name: string;
      item?: EnrichedActivityOption;
      code: string;
      fullName: string;
      count: number;
      completedCount: number;
      totalMinutes: number;
      durations: number[];
      distinctDaysSet: Set<string>;
    }>();

    matchedLogs.forEach((l) => {
      const actName = (l.activity || 'Sem Atividade').trim();
      const existing = activityMap.get(actName) || {
        name: actName,
        item: enrichedActivitiesList.find((a) => a.name.toLowerCase() === actName.toLowerCase()),
        code: '',
        fullName: actName,
        count: 0,
        completedCount: 0,
        totalMinutes: 0,
        durations: [],
        distinctDaysSet: new Set<string>(),
      };

      existing.count += 1;
      if (l.status === 'Concluída') existing.completedCount += 1;
      if (l.date) existing.distinctDaysSet.add(l.date);

      const dur = (l.durationMinutes && l.durationMinutes > 0)
        ? l.durationMinutes
        : (l.startTime && l.endTime ? Math.max(1, calcularDiferencaMinutos(l.startTime, l.endTime)) : 0);

      if (dur > 0) {
        existing.totalMinutes += dur;
        existing.durations.push(dur);
      }

      if (!existing.code) {
        const item = existing.item;
        existing.code = item?.code || 'P?';
        existing.fullName = item?.fullName || (item?.code ? `${item.code} - ${actName}` : actName);
      }

      activityMap.set(actName, existing);
    });

    // Filtro de refeição: Se excludeMeals for true e a atividade não foi selecionada manualmente como refeição
    const isTargetExplicitMeal = selectedActivityName !== 'TODOS' && isMealActivity(selectedActivityName);
    const shouldFilterOutMeals = excludeMeals && !isTargetExplicitMeal;

    const allActivitiesRank = Array.from(activityMap.values()).map((act) => {
      const avgRun = act.durations.length > 0 ? Math.round(act.totalMinutes / act.durations.length) : 0;
      const daysCount = act.distinctDaysSet.size || 1;
      const avgDay = Math.round(act.totalMinutes / daysCount);
      const standardMin = act.item?.standardMinutes;
      const standardDiff = (standardMin && standardMin > 0 && avgRun > 0) ? (avgRun - standardMin) : null;
      const percentageOfTotal = totalMinutes > 0 ? Math.round((act.totalMinutes / totalMinutes) * 100) : 0;

      return {
        name: act.name,
        code: act.code,
        fullName: act.fullName,
        count: act.count,
        completedCount: act.completedCount,
        totalMinutes: act.totalMinutes,
        avgMinutesPerExecution: avgRun,
        distinctDaysCount: daysCount,
        avgMinutesPerDay: avgDay,
        standardMinutes: standardMin,
        standardDiff,
        percentageOfTotal,
        category: act.item?.category || 'Operação',
        role: act.item?.role || 'Geral',
      };
    });

    // Se excludeMeals estiver ativo, não conta refeição no ranking de demora produtiva
    const activitiesRank = allActivitiesRank.filter((act) => {
      if (!shouldFilterOutMeals) return true;
      return !isMealActivity(act.name, act.code);
    });

    // 1. Mais Demoradas por Tempo Total Acumulado
    const activitiesRankByTime = [...activitiesRank].sort((a, b) => b.totalMinutes - a.totalMinutes || b.avgMinutesPerDay - a.avgMinutesPerDay);

    // 2. Mais Demoradas por Média Diária
    const activitiesRankByDaily = [...activitiesRank].sort((a, b) => b.avgMinutesPerDay - a.avgMinutesPerDay || b.totalMinutes - a.totalMinutes);

    // 3. Mais Frequentes (quantidade de vezes feitas)
    const activitiesRankByCount = [...activitiesRank].sort((a, b) => b.count - a.count || b.totalMinutes - a.totalMinutes);

    // 4. Mais Rápidas (menor tempo médio por execução)
    const activitiesRankByFastest = [...activitiesRank]
      .filter((a) => a.avgMinutesPerExecution > 0)
      .sort((a, b) => a.avgMinutesPerExecution - b.avgMinutesPerExecution);

    // 5. Maior Duração Média por Execução
    const activitiesRankByAvg = [...activitiesRank].sort((a, b) => b.avgMinutesPerExecution - a.avgMinutesPerExecution);

    // -------------------------------------------------------------
    // Breakdown por operador (se consultou "TODOS" ou para visualização do líder)
    // -------------------------------------------------------------
    const operatorMap = new Map<string, { count: number; totalMin: number; durations: number[] }>();
    matchedLogs.forEach((l) => {
      const name = l.collaboratorName.trim();
      const dur = (l.durationMinutes && l.durationMinutes > 0)
        ? l.durationMinutes
        : (l.startTime && l.endTime ? Math.max(1, calcularDiferencaMinutos(l.startTime, l.endTime)) : 0);
      const existing = operatorMap.get(name) || { count: 0, totalMin: 0, durations: [] };
      existing.count += 1;
      if (dur > 0) {
        existing.totalMin += dur;
        existing.durations.push(dur);
      }
      operatorMap.set(name, existing);
    });

    const operatorRank = Array.from(operatorMap.entries()).map(([name, data]) => {
      const avg = data.durations.length > 0 ? Math.round(data.totalMin / data.durations.length) : 0;
      return {
        name,
        count: data.count,
        totalMin: data.totalMin,
        avgMin: avg,
      };
    }).sort((a, b) => b.count - a.count);

    // -------------------------------------------------------------
    // AUDITORIA / RANKING DE ATIVIDADES ESQUECIDAS DE ENCERRAR
    // (Auto-encerradas no fim de turno ou em aberto)
    // -------------------------------------------------------------
    const unclosedMap = new Map<string, {
      name: string;
      role: string;
      totalUnclosed: number;
      autoClosedCount: number;
      currentlyOpenCount: number;
      activitiesList: Array<{ activity: string; date: string; time?: string; type: 'auto-fechada' | 'em-execucao' }>;
    }>();

    const getOrInitUnclosed = (colabName: string, defaultRole = 'Operador') => {
      const norm = colabName.trim();
      let item = unclosedMap.get(norm);
      if (!item) {
        const found = (collaborators || []).find((c) => c.name.toLowerCase() === norm.toLowerCase());
        item = {
          name: norm,
          role: found?.role || defaultRole,
          totalUnclosed: 0,
          autoClosedCount: 0,
          currentlyOpenCount: 0,
          activitiesList: [],
        };
        unclosedMap.set(norm, item);
      }
      return item;
    };

    const accountedLogIds = new Set<string>();

    matchedLogs.forEach((l) => {
      const isAutoClosed = Boolean(l.autoClosed || l.autoClosedAtShiftEnd);
      const isOpen = l.status === 'Em Execução';

      if (isAutoClosed || isOpen) {
        if (l.id) accountedLogIds.add(l.id);
        const entry = getOrInitUnclosed(l.collaboratorName, l.role);
        entry.totalUnclosed += 1;
        if (isAutoClosed) entry.autoClosedCount += 1;
        if (isOpen) entry.currentlyOpenCount += 1;
        entry.activitiesList.push({
          activity: l.activity || 'Sem Atividade',
          date: l.date,
          time: l.startTime,
          type: isAutoClosed ? 'auto-fechada' : 'em-execucao',
        });
      }
    });

    // Também contabilizar autoCloseNotifs recebidas da fábrica
    (autoCloseNotifs || []).forEach((notif) => {
      if (!notif || !notif.collaboratorName) return;
      if (notif.logId && accountedLogIds.has(notif.logId)) return;

      // Filtrar pelo colaborador se selecionado
      if (targetColabNorm && notif.collaboratorName.trim().toLowerCase() !== targetColabNorm) {
        return;
      }

      // Validar data se dentro do período
      let notifDateIso = notif.date || '';
      if (notifDateIso.includes('/')) {
        const parts = notifDateIso.split('/');
        if (parts.length === 3) {
          notifDateIso = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
      const notifNum = parseInt(notifDateIso.replace(/-/g, ''), 10);
      if (!isNaN(notifNum) && (notifNum < startNum || notifNum > endNum)) {
        return;
      }

      const entry = getOrInitUnclosed(notif.collaboratorName, notif.role || 'Operador');
      entry.totalUnclosed += 1;
      entry.autoClosedCount += 1;
      entry.activitiesList.push({
        activity: notif.activity || 'Sem Atividade',
        date: notif.date,
        type: 'auto-fechada',
      });
    });

    const unclosedRanking = Array.from(unclosedMap.values())
      .filter((u) => u.totalUnclosed > 0)
      .sort((a, b) => b.totalUnclosed - a.totalUnclosed || b.autoClosedCount - a.autoClosedCount);

    return {
      matchedLogs,
      totalCount,
      completedCount: completedLogs.length,
      inProgressCount: inProgressLogs.length,
      totalMinutes,
      avgMinutesPerExecution,
      distinctDaysCount,
      avgMinutesPerDay,
      minMinutes,
      maxMinutes,
      standardMinutes,
      standardDiff,
      targetActItem,
      operatorRank,
      allActivitiesRank,
      activitiesRank,
      activitiesRankByTime,
      activitiesRankByDaily,
      activitiesRankByCount,
      activitiesRankByFastest,
      activitiesRankByAvg,
      unclosedRanking,
      shouldFilterOutMeals,
    };
  }, [logs, periodDates, selectedColab, selectedActivityName, enrichedActivitiesList, excludeMeals, autoCloseNotifs, collaborators]);

  // 6. Geração da Frase Síntese em Linguagem Natural Clara e Cirúrgica
  const summaryAnswerText = useMemo(() => {
    const { 
      totalCount, 
      totalMinutes, 
      avgMinutesPerExecution, 
      avgMinutesPerDay, 
      distinctDaysCount, 
      standardMinutes, 
      standardDiff, 
      targetActItem,
      activitiesRankByTime,
      activitiesRankByCount,
      activitiesRankByFastest,
      unclosedRanking,
      shouldFilterOutMeals,
    } = analyzedData;

    const opText = selectedColab === 'TODOS' ? 'A equipe da fábrica' : `O operador ${selectedColab.toUpperCase()}`;
    const periodLabel = periodDates.label.toLowerCase();

    // -------------------------------------------------------------------------------------------------
    // CASO ESPECÍFICO: "QUAL COLABORADOR MAIS ESQUECE DE ENCERRAR ATIVIDADES" / ATIVIDADES EM ABERTO
    // -------------------------------------------------------------------------------------------------
    if (metricFocus === 'ESQUECIDAS_ENCERRAR') {
      if (unclosedRanking.length === 0) {
        return `Nenhum colaborador possui atividades esquecidas de encerrar ou em aberto no período ${periodLabel}. Todos os apontamentos foram devidamente finalizados! ✅`;
      }

      if (selectedColab === 'TODOS') {
        const top1 = unclosedRanking[0];
        const top2 = unclosedRanking[1];
        const top3 = unclosedRanking[2];

        const top1Acts = Array.from(new Set(top1.activitiesList.map((a) => a.activity))).slice(0, 3).join(', ');

        let resp = `O colaborador que mais esquece (ou possui pendências) de encerrar atividades em ${periodLabel} é ${top1.name.toUpperCase()} (${top1.role}), somando ${top1.totalUnclosed} atividade(s) não encerradas (${top1.autoClosedCount} auto-encerrada(s) no fim de turno e ${top1.currentlyOpenCount} ainda em aberto/execução).`;

        if (top1Acts) {
          resp += ` Principais atividades esquecidas: "${top1Acts}".`;
        }
        if (top2) {
          resp += ` Em 2º lugar: ${top2.name.toUpperCase()} com ${top2.totalUnclosed} ocorrência(s) (${top2.autoClosedCount} no fim de turno, ${top2.currentlyOpenCount} em aberto).`;
        }
        if (top3) {
          resp += ` Em 3º lugar: ${top3.name.toUpperCase()} (${top3.totalUnclosed}x).`;
        }
        return resp;
      } else {
        const targetData = unclosedRanking.find((u) => u.name.toLowerCase() === selectedColab.toLowerCase());
        if (!targetData || targetData.totalUnclosed === 0) {
          return `O operador ${selectedColab.toUpperCase()} NÃO possui nenhuma atividade esquecida de encerrar no período ${periodLabel}. Todos os seus apontamentos foram concluídos corretamente! ✅`;
        }
        const colabActs = Array.from(new Set(targetData.activitiesList.map((a) => a.activity))).slice(0, 3).join(', ');
        return `O operador ${selectedColab.toUpperCase()} possui ${targetData.totalUnclosed} atividade(s) não encerradas em ${periodLabel}: sendo ${targetData.autoClosedCount} encerrada(s) automaticamente no encerramento de turno e ${targetData.currentlyOpenCount} ainda em execução. Atividades: "${colabActs}".`;
      }
    }

    if (totalCount === 0) {
      const actLabel = targetActItem ? `${targetActItem.code} - ${targetActItem.name}` : (selectedActivityName === 'TODOS' ? 'atividades' : selectedActivityName);
      return `${opText} NÃO possui nenhum registro da atividade "${actLabel}" no período ${periodLabel}.`;
    }

    // -------------------------------------------------------------------------------------------------
    // RESPOSTA CIRÚRGICA QUANDO CONSULTA "TODAS AS ATIVIDADES" OU PERGUNTA "QUAL ATIVIDADE MAIS DEMORA"
    // -------------------------------------------------------------------------------------------------
    if (
      selectedActivityName === 'TODOS' || 
      metricFocus === 'TOP_ATIVIDADES_TEMPO' || 
      metricFocus === 'TOP_ATIVIDADES_CONTAGEM' || 
      metricFocus === 'ATIVIDADES_MAIS_RAPIDAS'
    ) {
      if (activitiesRankByTime.length === 0) {
        return `${opText} possui ${totalCount} apontamentos em ${periodLabel}, somando ${formatarHorasMinutos(totalMinutes)}.`;
      }

      // Caso 1: Pergunta por Atividade Mais Frequente / Mais Realizada
      if (metricFocus === 'TOP_ATIVIDADES_CONTAGEM') {
        const top1 = activitiesRankByCount[0];
        const top2 = activitiesRankByCount[1];
        let resp = `A atividade que ${opText.toLowerCase()} mais realizou em ${periodLabel} foi "${top1.fullName}", com ${top1.count} vez${top1.count > 1 ? 'es' : ''} executadas (total de ${formatarHorasMinutos(top1.totalMinutes)}, média de ${top1.avgMinutesPerExecution} min/vez).`;
        if (top2) {
          resp += ` Em 2º lugar mais realizada: "${top2.fullName}" com ${top2.count} execuções (${formatarHorasMinutos(top2.totalMinutes)}).`;
        }
        return resp;
      }

      // Caso 2: Pergunta por Atividade Mais Rápida / Menos Demorada
      if (metricFocus === 'ATIVIDADES_MAIS_RAPIDAS') {
        const top1 = activitiesRankByFastest[0];
        const top2 = activitiesRankByFastest[1];
        if (!top1) return `${opText} não possui execuções concluídas em ${periodLabel}.`;
        let resp = `A atividade mais rápida (que menos demora) de ${opText.toLowerCase()} em ${periodLabel} foi "${top1.fullName}", com média de apenas ${top1.avgMinutesPerExecution} min por execução (${top1.count} vez${top1.count > 1 ? 'es' : ''}, acumulando ${formatarHorasMinutos(top1.totalMinutes)}).`;
        if (top2) {
          resp += ` Em 2º lugar: "${top2.fullName}" com média de ${top2.avgMinutesPerExecution} min/vez (${top2.count}x).`;
        }
        return resp;
      }

      // Caso 3: Pergunta Padrão - QUAL ATIVIDADE MAIS DEMORA / MAIS LEVA TEMPO DIARIAMENTE
      const top1 = activitiesRankByTime[0];
      const top2 = activitiesRankByTime[1];
      const top3 = activitiesRankByTime[2];

      const dailyPartTop1 = top1.distinctDaysCount > 1 
        ? `, com média de ${formatarHorasMinutos(top1.avgMinutesPerDay)} por dia em ${top1.distinctDaysCount} dias trabalhados`
        : `, total diário de ${formatarHorasMinutos(top1.avgMinutesPerDay)}`;

      const mealClarification = shouldFilterOutMeals ? ' (desconsiderando refeição/pausas)' : '';

      let resp = `A atividade em que ${opText.toLowerCase()} mais leva tempo (demora) diariamente${mealClarification} é "${top1.fullName}", acumulando ${formatarHorasMinutos(top1.totalMinutes)} (${top1.totalMinutes} min) no total em ${periodLabel}${dailyPartTop1}. Foi realizada ${top1.count} vez${top1.count > 1 ? 'es' : ''} (média de ${top1.avgMinutesPerExecution} min por execução, consumindo ${top1.percentageOfTotal}% de todo o tempo registrado).`;

      if (top2) {
        resp += ` Em 2º lugar mais demorada: "${top2.fullName}" (${formatarHorasMinutos(top2.totalMinutes)}, ${top2.count}x, média ${top2.avgMinutesPerExecution} min/vez).`;
      }
      if (top3) {
        resp += ` Em 3º lugar: "${top3.fullName}" (${formatarHorasMinutos(top3.totalMinutes)}, ${top3.count}x).`;
      }

      return resp;
    }

    // -------------------------------------------------------------------------------------------------
    // CASO O USUÁRIO TENHA ESPECIFICADO UMA ÚNICA ATIVIDADE (Ex: P2 - CORREÇÕES DE FERRAMENTAS)
    // -------------------------------------------------------------------------------------------------
    const actLabel = targetActItem ? `${targetActItem.code} - ${targetActItem.name}` : selectedActivityName;
    const countPart = `${opText} realizou ${totalCount} vez${totalCount > 1 ? 'es' : ''} a atividade "${actLabel}" em ${periodLabel}.`;
    const totalTimePart = totalMinutes > 0 ? ` Acumulou ${formatarHorasMinutos(totalMinutes)} (${totalMinutes} min) no total.` : '';
    
    let avgPart = '';
    if (avgMinutesPerExecution > 0) {
      avgPart = ` A média de tempo por execução foi de ${avgMinutesPerExecution} min.`;
    }

    let standardPart = '';
    if (standardMinutes && standardDiff !== null) {
      if (standardDiff < 0) {
        standardPart = ` Está ${Math.abs(standardDiff)} min mais rápido que o tempo padrão cadastrado (${standardMinutes} min)! 🚀`;
      } else if (standardDiff > 0) {
        standardPart = ` Está ${standardDiff} min acima do tempo padrão cadastrado (${standardMinutes} min). ⚠️`;
      } else {
        standardPart = ` Exatamente no tempo padrão estipulado de ${standardMinutes} min. ✅`;
      }
    }

    let dailyPart = '';
    if (distinctDaysCount > 1 && avgMinutesPerDay > 0) {
      dailyPart = ` Média de ${formatarHorasMinutos(avgMinutesPerDay)} por dia em ${distinctDaysCount} dias trabalhados.`;
    } else if (distinctDaysCount === 1 && avgMinutesPerDay > 0) {
      dailyPart = ` Total diário de ${formatarHorasMinutos(avgMinutesPerDay)}.`;
    }

    return `${countPart}${totalTimePart}${avgPart}${standardPart}${dailyPart}`;
  }, [analyzedData, selectedColab, selectedActivityName, periodDates, metricFocus]);

  // Copiar resposta para a área de transferência
  const handleCopyAnswer = () => {
    navigator.clipboard.writeText(summaryAnswerText);
    setCopiedAnswer(true);
    setTimeout(() => setCopiedAnswer(false), 3000);
  };

  // Resetar consulta para padrão
  const handleResetQuery = () => {
    setNaturalQuery('');
    setSelectedColab('TODOS');
    setSelectedActivityName('TODOS');
    setActivitySearchInput('');
    setPeriodPreset('HOJE');
    setMetricFocus('TODOS');
  };

  // Chips de perguntas prontas recomendadas para o líder
  const handleQuickQuestion = (question: string) => {
    handleParseNaturalQuery(question);
  };

  return (
    <div
      id="leader-smart-query-container"
      className="p-4 sm:p-5 rounded-2xl bg-[#0F172A] border-2 border-[#38BDF8]/60 shadow-2xl space-y-4 animate-in fade-in duration-200"
    >
      {/* CABEÇALHO DO ASSISTENTE INTELIGENTE */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#334155]/70 pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#0284C7]/25 text-[#38BDF8] border border-[#38BDF8]/40 shadow-inner">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-black text-white tracking-wide flex items-center gap-2">
                <span>ASSISTENTE INTELIGENTE DO LÍDER</span>
                <span className="px-2 py-0.5 rounded-full bg-[#0284C7]/20 border border-[#38BDF8]/40 text-[#38BDF8] text-[10px] font-bold">
                  Consulta de Registros em Tempo Real
                </span>
              </h3>
            </div>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Tire dúvidas da fábrica: quantas vezes uma atividade foi feita, tempo médio por troca de ferramenta, ocorrências por operador e período.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(selectedColab !== 'TODOS' || selectedActivityName !== 'TODOS' || naturalQuery || periodPreset !== 'HOJE') && (
            <button
              onClick={handleResetQuery}
              className="px-2.5 py-1.5 bg-[#1E293B] hover:bg-[#334155] text-[#94A3B8] hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-[#334155]"
              title="Limpar filtros e voltar para a consulta inicial"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpar</span>
            </button>
          )}

          <button
            onClick={handleCopyAnswer}
            disabled={analyzedData.totalCount === 0}
            className="px-3 py-1.5 bg-[#0284C7] hover:bg-[#0369A1] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow disabled:opacity-50"
            title="Copiar resposta resumida para enviar no WhatsApp ou relatório"
          >
            {copiedAnswer ? <CheckCircle2 className="w-3.5 h-3.5 text-[#00E676]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedAnswer ? 'Copiado!' : 'Copiar Resposta'}</span>
          </button>
        </div>
      </div>

      {/* 1. CAMPO DE PERGUNTA LIVRE EM LINGUAGEM NATURAL */}
      <div className="space-y-1.5">
        <div className="relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#38BDF8] flex items-center gap-1.5">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={naturalQuery}
            onChange={(e) => handleParseNaturalQuery(e.target.value)}
            placeholder='Faça uma pergunta livre... Ex: "Quantas vezes Igor fez P2 hoje?" ou "Tempo médio Cristian troca de ferramenta"'
            className="w-full pl-10 pr-10 py-3 bg-[#090D16] text-white placeholder-[#64748B] border border-[#38BDF8]/40 focus:border-[#38BDF8] rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#38BDF8]/25 transition shadow-inner"
          />
          {naturalQuery && (
            <button
              type="button"
              onClick={() => {
                setNaturalQuery('');
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-white"
              title="Limpar pergunta"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Chips de Perguntas Rápidas de 1 Clique */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] select-none custom-scrollbar">
          <span className="text-[#64748B] font-bold shrink-0 flex items-center gap-1">
            <Zap className="w-3 h-3 text-[#F59E0B]" />
            <span>Exemplos:</span>
          </span>
          <button
            type="button"
            onClick={() => handleQuickQuestion('qual colaborador mais esqueci de encerrar atividades')}
            className="px-2.5 py-1 rounded-full bg-[#EF4444]/20 hover:bg-[#EF4444]/35 text-[#FCA5A5] hover:text-white border border-[#EF4444]/50 shrink-0 cursor-pointer transition font-bold flex items-center gap-1 shadow-sm"
          >
            <ShieldAlert className="w-3 h-3 text-[#EF4444]" />
            <span>Quem mais esquece de encerrar atividades?</span>
          </button>
          <button
            type="button"
            onClick={() => handleQuickQuestion('Em qual atividade que meu colaborador wanderson mais leva tempo ou seja demora diariamente')}
            className="px-2.5 py-1 rounded-full bg-[#0284C7]/20 hover:bg-[#0284C7]/40 text-[#38BDF8] hover:text-white border border-[#38BDF8]/50 shrink-0 cursor-pointer transition font-bold flex items-center gap-1"
          >
            <Trophy className="w-3 h-3 text-[#F59E0B]" />
            <span>Em qual atividade Wanderson mais demora?</span>
          </button>
          <button
            type="button"
            onClick={() => handleQuickQuestion('Quantas vezes P2 correções de ferramentas foi feita hoje?')}
            className="px-2.5 py-1 rounded-full bg-[#1E293B] hover:bg-[#334155] text-[#CBD5E1] hover:text-white border border-[#475569]/60 shrink-0 cursor-pointer transition"
          >
            Quantas vezes P2 hoje?
          </button>
          <button
            type="button"
            onClick={() => handleQuickQuestion('Tempo médio de troca de ferramenta P3')}
            className="px-2.5 py-1 rounded-full bg-[#1E293B] hover:bg-[#334155] text-[#CBD5E1] hover:text-white border border-[#475569]/60 shrink-0 cursor-pointer transition"
          >
            Tempo médio de troca de ferramenta (P3)
          </button>
          <button
            type="button"
            onClick={() => handleQuickQuestion('Quantas correções de ferramentas P2 este mês?')}
            className="px-2.5 py-1 rounded-full bg-[#1E293B] hover:bg-[#334155] text-[#CBD5E1] hover:text-white border border-[#475569]/60 shrink-0 cursor-pointer transition"
          >
            P2 no mês
          </button>
          <button
            type="button"
            onClick={() => handleQuickQuestion('Tempo médio Cristian afiar ferramentas P1')}
            className="px-2.5 py-1 rounded-full bg-[#1E293B] hover:bg-[#334155] text-[#CBD5E1] hover:text-white border border-[#475569]/60 shrink-0 cursor-pointer transition"
          >
            Cristian afiar (P1)
          </button>
        </div>
      </div>

      {/* 2. CONSTRUTOR GUIADO / FILTROS INTELIGENTES DE CONSULTA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 bg-[#090D16]/80 p-3 rounded-xl border border-[#1E293B]">
        {/* Filtro Operador */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] flex items-center gap-1">
            <User className="w-3 h-3 text-[#38BDF8]" />
            <span>Operador</span>
          </label>
          <select
            value={selectedColab}
            onChange={(e) => setSelectedColab(e.target.value)}
            className="w-full py-1.5 px-2.5 bg-[#1E293B] text-white border border-[#475569] rounded-lg text-xs font-medium focus:outline-none focus:border-[#38BDF8]"
          >
            <option value="TODOS">Todos os Operadores</option>
            {availableOperators.map((op) => (
              <option key={op.name} value={op.name}>
                {op.name} ({op.role})
              </option>
            ))}
          </select>
        </div>

        {/* Filtro Atividade com Busca Preditiva de Prioridades (P1, P2, P3...) */}
        <div className="space-y-1 relative" ref={activityDropdownRef}>
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Layers className="w-3 h-3 text-[#38BDF8]" />
              <span>Atividade (Foto 2)</span>
            </span>
            {selectedActivityName !== 'TODOS' && (
              <button
                type="button"
                onClick={() => {
                  setSelectedActivityName('TODOS');
                  setActivitySearchInput('');
                }}
                className="text-[10px] text-[#38BDF8] hover:underline"
              >
                Limpar
              </button>
            )}
          </label>

          <button
            type="button"
            onClick={() => setIsActivityDropdownOpen((prev) => !prev)}
            className="w-full py-1.5 px-2.5 bg-[#1E293B] text-white border border-[#475569] hover:border-[#38BDF8] rounded-lg text-xs font-medium focus:outline-none flex items-center justify-between gap-1 text-left"
          >
            <span className="truncate">
              {selectedActivityName === 'TODOS'
                ? 'Todas as Atividades'
                : enrichedActivitiesList.find((a) => a.name.toLowerCase() === selectedActivityName.toLowerCase())?.fullName || selectedActivityName}
            </span>
            {isActivityDropdownOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
            )}
          </button>

          {/* Dropdown com Busca Instantânea por P1, P2, P3 ou Nome */}
          {isActivityDropdownOpen && (
            <div className="absolute z-50 top-full mt-1 left-0 w-80 sm:w-96 max-w-[calc(100vw-32px)] bg-[#182234] border border-[#38BDF8]/50 rounded-xl shadow-2xl p-2.5 space-y-2 text-xs">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Digite P1, P2, correções, troca..."
                  value={activitySearchInput}
                  onChange={(e) => setActivitySearchInput(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 bg-[#0F172A] text-white placeholder-[#64748B] border border-[#334155] rounded-lg text-xs focus:outline-none focus:border-[#38BDF8]"
                />
                {activitySearchInput && (
                  <button
                    type="button"
                    onClick={() => setActivitySearchInput('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedActivityName('TODOS');
                    setIsActivityDropdownOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between ${
                    selectedActivityName === 'TODOS'
                      ? 'bg-[#0284C7] text-white'
                      : 'text-[#CBD5E1] hover:bg-[#1E293B]'
                  }`}
                >
                  <span>Todas as Atividades</span>
                </button>

                {filteredActivityOptions.map((act) => {
                  const isSelected = selectedActivityName.toLowerCase() === act.name.toLowerCase();
                  return (
                    <button
                      key={`${act.code}-${act.name}`}
                      type="button"
                      onClick={() => {
                        setSelectedActivityName(act.name);
                        setIsActivityDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between gap-2 transition cursor-pointer ${
                        isSelected
                          ? 'bg-[#0284C7] text-white'
                          : 'text-[#CBD5E1] hover:bg-[#1E293B]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-1.5 py-0.5 rounded bg-[#0F172A] text-[#38BDF8] font-mono text-[10px] font-bold border border-[#38BDF8]/30 shrink-0">
                          {act.code}
                        </span>
                        <span className="truncate">{act.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 text-[10px] text-[#94A3B8]">
                        {act.standardMinutes && (
                          <span className="text-[#38BDF8] font-mono">{act.standardMinutes}m</span>
                        )}
                        <span className="opacity-70">({act.category})</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Filtro Período */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] flex items-center gap-1">
            <Calendar className="w-3 h-3 text-[#38BDF8]" />
            <span>Período</span>
          </label>
          <select
            value={periodPreset}
            onChange={(e) => setPeriodPreset(e.target.value as PeriodPreset)}
            className="w-full py-1.5 px-2.5 bg-[#1E293B] text-white border border-[#475569] rounded-lg text-xs font-medium focus:outline-none focus:border-[#38BDF8]"
          >
            <option value="HOJE">Hoje (Tempo Real)</option>
            <option value="ONTEM">Ontem</option>
            <option value="7DIAS">Últimos 7 Dias</option>
            <option value="ESTE_MES">Este Mês</option>
            <option value="ESPECIFICA">Data Específica</option>
            <option value="PERSONALIZADO">Período Personalizado</option>
          </select>
        </div>

        {/* Métrica / Foco da Resposta */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-[#38BDF8]" />
            <span>Foco da Resposta</span>
          </label>
          <select
            value={metricFocus}
            onChange={(e) => {
              const val = e.target.value as MetricFocus;
              setMetricFocus(val);
              if (val === 'TOP_ATIVIDADES_TEMPO') setRankingSortBy('TEMPO');
              if (val === 'TOP_ATIVIDADES_CONTAGEM') setRankingSortBy('CONTAGEM');
              if (val === 'ATIVIDADES_MAIS_RAPIDAS') setRankingSortBy('MEDIA');
              if (val === 'MEDIA_DIARIA') setRankingSortBy('DIARIO');
            }}
            className="w-full py-1.5 px-2.5 bg-[#1E293B] text-white border border-[#475569] rounded-lg text-xs font-medium focus:outline-none focus:border-[#38BDF8]"
          >
            <option value="TODOS">Visão Completa (Tudo)</option>
            <option value="ESQUECIDAS_ENCERRAR">⚠️ Quem Mais Esquece de Encerrar (Fim de Turno & Abertas)</option>
            <option value="TOP_ATIVIDADES_TEMPO">🏆 Atividade que Mais Demora (Tempo Total/Diário)</option>
            <option value="TOP_ATIVIDADES_CONTAGEM">📊 Atividade Mais Realizada (Frequência)</option>
            <option value="ATIVIDADES_MAIS_RAPIDAS">⚡ Atividade Mais Rápida (Menor Duração)</option>
            <option value="TEMPO_MEDIO">Tempo Médio por Execução</option>
            <option value="MEDIA_DIARIA">Tempo Médio por Dia</option>
            <option value="TEMPO_TOTAL">Tempo Total Gasto</option>
            <option value="CONTAGEM">Quantas Vezes Fez</option>
          </select>
        </div>
      </div>

      {/* Datas Específicas / Personalizadas (se selecionadas) */}
      {periodPreset === 'ESPECIFICA' && (
        <div className="flex items-center gap-2 p-2 bg-[#1E293B] rounded-lg border border-[#334155] w-fit text-xs">
          <span className="text-[#94A3B8] font-medium">Selecione o dia:</span>
          <input
            type="date"
            value={specificDate}
            onChange={(e) => setSpecificDate(e.target.value)}
            className="bg-[#0F172A] text-white px-2 py-1 rounded border border-[#475569] focus:outline-none focus:border-[#38BDF8]"
          >
          </input>
        </div>
      )}

      {periodPreset === 'PERSONALIZADO' && (
        <div className="flex flex-wrap items-center gap-2 p-2 bg-[#1E293B] rounded-lg border border-[#334155] text-xs">
          <span className="text-[#94A3B8] font-medium">De:</span>
          <input
            type="date"
            value={customStartDate}
            onChange={(e) => setCustomStartDate(e.target.value)}
            className="bg-[#0F172A] text-white px-2 py-1 rounded border border-[#475569] focus:outline-none focus:border-[#38BDF8]"
          />
          <span className="text-[#94A3B8] font-medium">Até:</span>
          <input
            type="date"
            value={customEndDate}
            onChange={(e) => setCustomEndDate(e.target.value)}
            className="bg-[#0F172A] text-white px-2 py-1 rounded border border-[#475569] focus:outline-none focus:border-[#38BDF8]"
          />
        </div>
      )}

      {/* 3. CARD DE RESPOSTA PRINCIPAL DO ASSISTENTE */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-[#0369A1]/20 via-[#0F172A] to-[#0284C7]/20 border border-[#38BDF8]/50 shadow-lg space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-[#38BDF8]/20 text-[#38BDF8] shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] font-black uppercase tracking-wider text-[#38BDF8] flex items-center gap-1.5">
                <span>Resposta do Assistente</span>
                <span className="px-1.5 py-0.2 rounded bg-[#38BDF8]/20 text-[#BAE6FD] font-mono text-[10px]">
                  {analyzedData.totalCount} registro(s) encontrado(s)
                </span>
              </span>

              {onNavigateToHistory && (
                <button
                  type="button"
                  onClick={() => onNavigateToHistory(selectedColab !== 'TODOS' ? selectedColab : undefined)}
                  className="text-xs text-[#38BDF8] hover:text-white flex items-center gap-1 font-semibold hover:underline cursor-pointer"
                >
                  <span>Abrir no Histórico</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>

            <p className="text-sm sm:text-base font-bold text-white leading-relaxed">
              {summaryAnswerText}
            </p>
          </div>
        </div>

        {/* 4. OS 4 GRANDES INDICADORES NUMÉRICOS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-[#334155]/60">
          {/* Card 1: Ocorrências */}
          <div className={`p-3 rounded-xl border ${metricFocus === 'CONTAGEM' ? 'bg-[#0284C7]/30 border-[#38BDF8]' : 'bg-[#090D16] border-[#334155]'}`}>
            <div className="flex items-center justify-between text-[#94A3B8] text-[11px]">
              <span className="font-semibold uppercase tracking-wider">Ocorrências</span>
              <Hash className="w-3.5 h-3.5 text-[#38BDF8]" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-white mt-1">
              {analyzedData.totalCount} <span className="text-xs font-normal text-[#94A3B8]">vezes</span>
            </div>
            <div className="text-[10px] text-[#38BDF8] mt-0.5 truncate">
              {analyzedData.completedCount} concluídas • {analyzedData.inProgressCount} ativas
            </div>
          </div>

          {/* Card 2: Tempo Médio por Execução */}
          <div className={`p-3 rounded-xl border ${metricFocus === 'TEMPO_MEDIO' ? 'bg-[#0284C7]/30 border-[#38BDF8]' : 'bg-[#090D16] border-[#334155]'}`}>
            <div className="flex items-center justify-between text-[#94A3B8] text-[11px]">
              <span className="font-semibold uppercase tracking-wider">Tempo Médio</span>
              <Clock className="w-3.5 h-3.5 text-[#38BDF8]" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-white mt-1">
              {analyzedData.avgMinutesPerExecution} <span className="text-xs font-normal text-[#94A3B8]">min / vez</span>
            </div>
            <div className="text-[10px] text-[#94A3B8] mt-0.5 truncate">
              {analyzedData.standardMinutes ? (
                <span className={analyzedData.standardDiff !== null && analyzedData.standardDiff <= 0 ? 'text-[#00E676] font-bold' : 'text-[#F59E0B] font-bold'}>
                  Padrão: {analyzedData.standardMinutes} min ({analyzedData.standardDiff !== null && analyzedData.standardDiff <= 0 ? 'Mais rápido' : 'Acima'})
                </span>
              ) : (
                `Mín: ${analyzedData.minMinutes}m • Máx: ${analyzedData.maxMinutes}m`
              )}
            </div>
          </div>

          {/* Card 3: Média Diária */}
          <div className={`p-3 rounded-xl border ${metricFocus === 'MEDIA_DIARIA' ? 'bg-[#0284C7]/30 border-[#38BDF8]' : 'bg-[#090D16] border-[#334155]'}`}>
            <div className="flex items-center justify-between text-[#94A3B8] text-[11px]">
              <span className="font-semibold uppercase tracking-wider">Média por Dia</span>
              <Calendar className="w-3.5 h-3.5 text-[#38BDF8]" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-white mt-1">
              {formatarHorasMinutos(analyzedData.avgMinutesPerDay)}
            </div>
            <div className="text-[10px] text-[#94A3B8] mt-0.5 truncate">
              {analyzedData.distinctDaysCount} dia(s) com apontamentos
            </div>
          </div>

          {/* Card 4: Tempo Total Acumulado */}
          <div className={`p-3 rounded-xl border ${metricFocus === 'TEMPO_TOTAL' ? 'bg-[#0284C7]/30 border-[#38BDF8]' : 'bg-[#090D16] border-[#334155]'}`}>
            <div className="flex items-center justify-between text-[#94A3B8] text-[11px]">
              <span className="font-semibold uppercase tracking-wider">Tempo Total</span>
              <TrendingUp className="w-3.5 h-3.5 text-[#00E676]" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-[#00E676] mt-1">
              {formatarHorasMinutos(analyzedData.totalMinutes)}
            </div>
            <div className="text-[10px] text-[#94A3B8] mt-0.5 truncate">
              Total de {analyzedData.totalMinutes} minutos
            </div>
          </div>
        </div>

        {/* 4.5. RANKING DE COLABORADORES: QUEM MAIS ESQUECE / DEIXA ATIVIDADES SEM ENCERRAR */}
        {(metricFocus === 'ESQUECIDAS_ENCERRAR' || (selectedColab === 'TODOS' && analyzedData.unclosedRanking.length > 0)) && (
          <div className="space-y-3 pt-3 border-t border-[#334155]/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/40">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
                    <span>Ranking de Colaboradores: Quem Mais Esquece de Encerrar Atividades</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#EF4444]/20 text-[#FCA5A5] font-mono">
                      {analyzedData.unclosedRanking.length} colaborador(es) com pendências
                    </span>
                  </h4>
                  <p className="text-[11px] text-[#94A3B8]">
                    Auditoria unificada: encerramentos automáticos no fim de turno e tarefas em andamento/aberto
                  </p>
                </div>
              </div>

              {metricFocus !== 'ESQUECIDAS_ENCERRAR' && (
                <button
                  type="button"
                  onClick={() => setMetricFocus('ESQUECIDAS_ENCERRAR')}
                  className="px-2.5 py-1 rounded-lg bg-[#EF4444]/20 hover:bg-[#EF4444]/30 text-[#FCA5A5] text-[10px] font-bold border border-[#EF4444]/40 transition cursor-pointer"
                >
                  Focar nesta Auditoria
                </button>
              )}
            </div>

            {analyzedData.unclosedRanking.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#090D16] border border-[#334155] text-center text-xs text-[#94A3B8]">
                Nenhum colaborador com pendências de encerramento neste período. Todos os apontamentos foram devidamente finalizados! ✅
              </div>
            ) : (
              <div className="space-y-2">
                {analyzedData.unclosedRanking.map((colab, idx) => {
                  const isTop = idx === 0;
                  const actsSummary = Array.from(new Set(colab.activitiesList.map((a) => a.activity))).slice(0, 4).join(', ');

                  return (
                    <div
                      key={colab.name}
                      onClick={() => {
                        setSelectedColab(colab.name);
                        setMetricFocus('ESQUECIDAS_ENCERRAR');
                      }}
                      className={`p-3 rounded-xl border transition cursor-pointer relative overflow-hidden group ${
                        isTop
                          ? 'bg-gradient-to-r from-[#EF4444]/15 via-[#0F172A] to-[#EF4444]/10 border-[#EF4444]/60 shadow-lg'
                          : 'bg-[#090D16] hover:bg-[#1E293B]/80 border-[#334155] hover:border-[#EF4444]/50'
                      }`}
                      title={`Clique para auditar apontamentos de ${colab.name}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Badge de Posição */}
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                              isTop
                                ? 'bg-[#EF4444] text-white shadow-md'
                                : idx === 1
                                ? 'bg-[#F97316] text-white'
                                : idx === 2
                                ? 'bg-[#FBBF24] text-black'
                                : 'bg-[#1E293B] text-[#94A3B8] border border-[#334155]'
                            }`}
                          >
                            {isTop ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <strong className="text-white text-xs sm:text-sm truncate">
                                {colab.name}
                              </strong>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#1E293B] text-[#94A3B8] border border-[#334155]">
                                {colab.role}
                              </span>
                              {isTop && (
                                <span className="text-[10px] font-bold text-[#EF4444] bg-[#EF4444]/20 border border-[#EF4444]/40 px-2 py-0.2 rounded-full uppercase tracking-wider">
                                  Mais Esquece de Encerrar
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#94A3B8] mt-0.5 flex items-center gap-2 flex-wrap">
                              {actsSummary && (
                                <span className="truncate max-w-md">
                                  Atividades esquecidas: <strong className="text-[#CBD5E1]">{actsSummary}</strong>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Indicadores de Contagem à Direita */}
                        <div className="flex items-center gap-2.5 sm:gap-4 shrink-0 text-right">
                          <div className="text-right">
                            <div className="text-[10px] uppercase font-bold text-[#94A3B8]">Detalhes</div>
                            <div className="text-[10.5px] text-[#94A3B8]">
                              <span className="text-[#EF4444] font-bold">{colab.autoClosedCount}</span> auto-fechada(s)
                              {colab.currentlyOpenCount > 0 && (
                                <> • <span className="text-[#FBBF24] font-bold">{colab.currentlyOpenCount}</span> em aberto</>
                              )}
                            </div>
                          </div>

                          <div className="border-l border-[#334155]/60 pl-3">
                            <div className="text-[10px] uppercase font-bold text-[#94A3B8]">Total Esquecidas</div>
                            <div className="text-base sm:text-lg font-black text-[#EF4444]">
                              {colab.totalUnclosed} <span className="text-xs font-normal text-[#94A3B8]">vezes</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#EF4444]/20 hover:bg-[#EF4444] text-[#FCA5A5] hover:text-white border border-[#EF4444]/40 text-xs font-bold transition cursor-pointer"
                          >
                            <span>Auditar</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 5. RANKING DE ATIVIDADES: ONDE O COLABORADOR MAIS DEMORA / GASTA TEMPO */}
        {selectedActivityName === 'TODOS' && analyzedData.activitiesRank.length > 0 && metricFocus !== 'ESQUECIDAS_ENCERRAR' && (
          <div className="space-y-3 pt-3 border-t border-[#334155]/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40">
                  <Trophy className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
                    <span>Ranking das Atividades: Onde {selectedColab === 'TODOS' ? 'a Equipe' : selectedColab.toUpperCase()} Mais Demora</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#0284C7]/20 text-[#38BDF8] font-mono">
                      {analyzedData.activitiesRank.length} atividade(s)
                    </span>
                  </h4>
                  <p className="text-[11px] text-[#94A3B8]">
                    Clique em qualquer atividade abaixo para filtrar e auditar os apontamentos detalhados dela
                  </p>
                </div>
              </div>

              {/* Controles do Ranking: Toggle Refeição e Ordenação */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Botão de Toggle: Ignorar Refeição no ranking de demora */}
                <button
                  type="button"
                  onClick={() => setExcludeMeals((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition border cursor-pointer ${
                    excludeMeals
                      ? 'bg-[#00E676]/15 text-[#00E676] border-[#00E676]/40 hover:bg-[#00E676]/25'
                      : 'bg-[#1E293B] text-[#94A3B8] border-[#334155] hover:text-white'
                  }`}
                  title="Refeição não conta no ranking de atividades industriais demoradas"
                >
                  <UtensilsCrossed className="w-3 h-3" />
                  <span>{excludeMeals ? '✓ Ignorando Refeição (P2.5)' : 'Incluir Refeição'}</span>
                </button>

                {/* Botões de Ordenação do Ranking */}
                <div className="flex items-center gap-1 bg-[#090D16] p-1 rounded-lg border border-[#334155] text-[10px]">
                  <button
                    type="button"
                    onClick={() => setRankingSortBy('TEMPO')}
                    className={`px-2 py-1 rounded font-bold cursor-pointer transition ${
                      rankingSortBy === 'TEMPO'
                        ? 'bg-[#0284C7] text-white shadow'
                        : 'text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    Tempo Total
                  </button>
                  <button
                    type="button"
                    onClick={() => setRankingSortBy('DIARIO')}
                    className={`px-2 py-1 rounded font-bold cursor-pointer transition ${
                      rankingSortBy === 'DIARIO'
                        ? 'bg-[#0284C7] text-white shadow'
                        : 'text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    Média por Dia
                  </button>
                  <button
                    type="button"
                    onClick={() => setRankingSortBy('MEDIA')}
                    className={`px-2 py-1 rounded font-bold cursor-pointer transition ${
                      rankingSortBy === 'MEDIA'
                        ? 'bg-[#0284C7] text-white shadow'
                        : 'text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    Média / Vez
                  </button>
                  <button
                    type="button"
                    onClick={() => setRankingSortBy('CONTAGEM')}
                    className={`px-2 py-1 rounded font-bold cursor-pointer transition ${
                      rankingSortBy === 'CONTAGEM'
                        ? 'bg-[#0284C7] text-white shadow'
                        : 'text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    Mais Feitas (Vezes)
                  </button>
                </div>
              </div>
            </div>

            {/* Lista dos Itens do Ranking */}
            <div className="space-y-2">
              {(() => {
                let currentRankList = analyzedData.activitiesRankByTime;
                if (rankingSortBy === 'DIARIO') currentRankList = analyzedData.activitiesRankByDaily;
                if (rankingSortBy === 'MEDIA') currentRankList = analyzedData.activitiesRankByAvg;
                if (rankingSortBy === 'CONTAGEM') currentRankList = analyzedData.activitiesRankByCount;

                return currentRankList.map((act, idx) => {
                  const isFirst = idx === 0;

                  return (
                    <div
                      key={act.name}
                      onClick={() => {
                        setSelectedActivityName(act.name);
                        setMetricFocus('TODOS');
                      }}
                      className={`p-3 rounded-xl border transition cursor-pointer relative overflow-hidden group ${
                        isFirst
                          ? 'bg-gradient-to-r from-[#F59E0B]/15 via-[#0F172A] to-[#0284C7]/20 border-[#F59E0B]/60 shadow-lg'
                          : 'bg-[#090D16] hover:bg-[#1E293B]/80 border-[#334155] hover:border-[#38BDF8]/60'
                      }`}
                      title={`Clique para filtrar apenas "${act.name}"`}
                    >
                      {/* Barra de Progresso visual de fundo com % do tempo total */}
                      <div
                        className="absolute bottom-0 left-0 top-0 bg-[#38BDF8]/10 pointer-events-none transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(4, act.percentageOfTotal))}%` }}
                      />

                      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Badge de Posição */}
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                              isFirst
                                ? 'bg-[#F59E0B] text-black shadow-md'
                                : idx === 1
                                ? 'bg-[#94A3B8] text-black'
                                : idx === 2
                                ? 'bg-[#B45309] text-white'
                                : 'bg-[#1E293B] text-[#94A3B8] border border-[#334155]'
                            }`}
                          >
                            {isFirst ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                          </div>

                          {/* Código da Atividade (Foto 2) e Nome */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-1.5 py-0.5 rounded bg-[#0F172A] text-[#38BDF8] font-mono text-[11px] font-bold border border-[#38BDF8]/40">
                                {act.code}
                              </span>
                              <strong className="text-white text-xs sm:text-sm truncate">
                                {act.name}
                              </strong>
                              {isFirst && (
                                <span className="text-[10px] font-bold text-[#F59E0B] bg-[#F59E0B]/20 border border-[#F59E0B]/40 px-2 py-0.2 rounded-full uppercase tracking-wider">
                                  1º Lugar: Onde Mais Demora
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#94A3B8] mt-0.5 flex items-center gap-2 flex-wrap">
                              <span>{act.count} vez{act.count > 1 ? 'es' : ''} realizada{act.count > 1 ? 's' : ''}</span>
                              <span>•</span>
                              <span>Média de <strong className="text-white">{act.avgMinutesPerExecution} min</strong> por execução</span>
                              {act.standardMinutes && (
                                <>
                                  <span>•</span>
                                  <span className={act.standardDiff !== null && act.standardDiff <= 0 ? 'text-[#00E676]' : 'text-[#F59E0B]'}>
                                    Padrão: {act.standardMinutes}m ({act.standardDiff !== null && act.standardDiff <= 0 ? 'Mais rápido' : 'Acima'})
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Indicadores de Tempo e Médias à Direita */}
                        <div className="flex items-center gap-3 sm:gap-4 shrink-0 text-right">
                          <div>
                            <div className="text-[10px] uppercase font-bold text-[#94A3B8]">Média Diária</div>
                            <div className="text-xs sm:text-sm font-bold text-white">
                              {formatarHorasMinutos(act.avgMinutesPerDay)}
                              <span className="text-[10px] font-normal text-[#94A3B8]"> /dia</span>
                            </div>
                            <div className="text-[9.5px] text-[#64748B]">{act.distinctDaysCount} dia(s) trab.</div>
                          </div>

                          <div className="border-l border-[#334155]/60 pl-3">
                            <div className="text-[10px] uppercase font-bold text-[#94A3B8]">Tempo Total</div>
                            <div className="text-sm sm:text-base font-black text-[#00E676]">
                              {formatarHorasMinutos(act.totalMinutes)}
                            </div>
                            <div className="text-[10px] font-bold text-[#38BDF8]">
                              {act.percentageOfTotal}% do tempo
                            </div>
                          </div>

                          <button
                            type="button"
                            className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0284C7]/20 hover:bg-[#0284C7] text-[#38BDF8] hover:text-white border border-[#38BDF8]/40 text-xs font-bold transition cursor-pointer"
                          >
                            <span>Ver Detalhes</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* 5. COMPARATIVO ENTRE OPERADORES (se mais de 1 operador executou) */}
        {analyzedData.operatorRank.length > 1 && (
          <div className="space-y-2 pt-2 border-t border-[#334155]/60">
            <span className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>Comparativo Entre Operadores nesta Atividade / Período:</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {analyzedData.operatorRank.map((op, idx) => (
                <div
                  key={op.name}
                  onClick={() => setSelectedColab(op.name)}
                  className={`p-2 rounded-lg border flex items-center justify-between text-xs cursor-pointer transition ${
                    selectedColab.toLowerCase() === op.name.toLowerCase()
                      ? 'bg-[#0284C7]/20 border-[#38BDF8] text-white'
                      : 'bg-[#090D16] border-[#334155] text-[#CBD5E1] hover:bg-[#1E293B]'
                  }`}
                  title="Clique para filtrar apenas este operador"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[10px] text-[#38BDF8] font-bold">#{idx + 1}</span>
                    <strong className="truncate">{op.name}</strong>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-white">{op.count}x • {op.avgMin} min/vez</div>
                    <div className="text-[10px] text-[#94A3B8]">{formatarHorasMinutos(op.totalMin)} tot</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6. LISTA AUDITÁVEL DOS REGISTROS (EXPANSÍVEL) */}
        {analyzedData.matchedLogs.length > 0 && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowLogsDetails((prev) => !prev)}
              className="text-xs text-[#38BDF8] hover:text-white flex items-center gap-1.5 font-bold cursor-pointer py-1"
            >
              {showLogsDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>{showLogsDetails ? 'Ocultar Detalhes dos Registros' : `Ver Lista Detalhada dos ${analyzedData.matchedLogs.length} Registros`}</span>
            </button>

            {showLogsDetails && (
              <div className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-[#334155] bg-[#090D16] p-2 space-y-1.5 custom-scrollbar">
                {analyzedData.matchedLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2 rounded-lg bg-[#111827] border border-[#1F2937] hover:border-[#374151] flex flex-wrap items-center justify-between gap-2 text-xs transition"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <strong className="text-white">{log.collaboratorName}</strong>
                        <span className="text-[#38BDF8] font-bold">• {log.activity}</span>
                        {log.shift && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#1F2937] text-[#9CA3AF]">
                            {log.shift}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#94A3B8] flex items-center gap-2">
                        <span>{formatarDataIsoOuPtBr(log.date)}</span>
                        <span>{log.startTime} às {log.endTime || 'Em andamento'}</span>
                        {log.machineId && <span>• Máq: {log.machineId}</span>}
                      </div>
                      {log.initialDescription && (
                        <div className="text-[11px] text-[#E2E8F0] italic">
                          "{log.initialDescription}"
                        </div>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-[#0284C7]/20 text-[#38BDF8] border border-[#38BDF8]/40">
                        {log.durationMinutes ? `${log.durationMinutes} min` : (log.status === 'Em Execução' ? 'Em Execução' : '0 min')}
                      </span>
                      <div className="text-[10px] text-[#94A3B8] mt-0.5">
                        {log.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
export default LeaderSmartQueryAssistant;
