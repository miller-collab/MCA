import { ActivityItem, Collaborator, ShiftConfig } from '../types';

export const INITIAL_COLLABORATORS: Collaborator[] = [
  { id: 'col-1', name: 'GERALDO', role: 'PREPARADOR TORNO AUTOMATICO', shift: 'Turno 1', active: true },
  { id: 'col-2', name: 'DIEGO', role: 'INSPETOR TCNC / OPERADOR', shift: 'Turno 1', active: true },
  { id: 'col-3', name: 'CARLOS', role: 'PREPARADOR DE FERRAMENTAS', shift: 'Turno 2', active: true },
  { id: 'col-4', name: 'EVANDRO', role: 'AREA DO CAVACO E OLEO', shift: 'Turno 1', active: true },
  { id: 'col-5', name: 'GABRIEL', role: 'PREPARADOR PROGAMADOR', shift: 'Turno 1', active: true },
  { id: 'col-6', name: 'ALEXANDER', role: 'INSPETOR / OPERADOR TA', shift: 'Turno 2', active: true },
  { id: 'col-7', name: 'WANDERSON', role: 'SISTEMA / AREA DO CAVACO E OLEO', shift: 'Turno 2', active: true },
  { id: 'col-8', name: 'ANSELMO', role: 'PREPARADOR TORNO AUTOMATICO', shift: 'Turno 1', active: true },
  { id: 'col-9', name: 'CRISTIAN', role: 'PREPARADOR DE FERRAMENTAS', shift: 'Turno 1', active: true },
  { id: 'col-10', name: 'IGOR', role: 'PREPARADOR PROGAMADOR', shift: 'Turno 1', active: true },
  { id: 'col-11', name: 'CLEMILSON', role: 'INSPETOR TCNC / OPERADOR', shift: 'Turno 1', active: true },
  { id: 'col-12', name: 'JULIO', role: 'SERVIÇOS GERAIS TORNO AUTOMATICO', shift: 'Turno 1', active: true },
  { id: 'col-13', name: 'VITOR', role: 'SERVIÇOS GERAIS TORNO AUTOMATICO', shift: 'Turno 1', active: true },
  { id: 'col-14', name: 'DANIEL', role: 'SERVIÇOS GERAIS TORNO AUTOMATICO', shift: 'Turno 1', active: true },
];

export const INITIAL_SHIFTS: ShiftConfig[] = [
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

export const INITIAL_ACTIVITIES: ActivityItem[] = [
  // AREA DO CAVACO E OLEO
  { id: 'act-1', role: 'AREA DO CAVACO E OLEO', name: 'LIMPEZA DO CAVACO', priority: 1, category: '5S & Limpeza', standardMinutes: 45 },
  { id: 'act-2', role: 'AREA DO CAVACO E OLEO', name: 'LAVAR PEÇA', priority: 2, category: 'Operação', standardMinutes: 30 },
  { id: 'act-3', role: 'AREA DO CAVACO E OLEO', name: 'CENTRIFUGAR O CAVACO', priority: 3, category: 'Operação', standardMinutes: 40 },
  { id: 'act-4', role: 'AREA DO CAVACO E OLEO', name: 'BANHO DE PEÇA', priority: 4, category: 'Operação', standardMinutes: 35 },
  { id: 'act-5', role: 'AREA DO CAVACO E OLEO', name: 'TRATAMENTO TERMICO DE PEÇA (FORNO)', priority: 5, category: 'Operação', standardMinutes: 90 },
  { id: 'act-6', role: 'AREA DO CAVACO E OLEO', name: 'VERIFICAÇÃO E REPOSIÇÃO DE ÓLEO NA USINAGEM', priority: 6, category: 'Manutenção', standardMinutes: 25 },
  { id: 'act-7', role: 'AREA DO CAVACO E OLEO', name: 'FAZER ETIQUETA E APONTAR PEÇAS NO SISTEMA', priority: 7, category: 'Sistema & Processo', standardMinutes: 20 },
  { id: 'act-8', role: 'AREA DO CAVACO E OLEO', name: 'LANÇAR TEMPOS E ATUALIZAR PRODUÇÃO SISTEMA', priority: 8, category: 'Sistema & Processo', standardMinutes: 20 },
  { id: 'act-9', role: 'AREA DO CAVACO E OLEO', name: 'ENGRAXAR / LUBRIFICAR TORNO AUTOMATICO (SEG/QUARTA/SEXTA)', priority: 9, category: 'Manutenção', standardMinutes: 45 },
  { id: 'act-10', role: 'AREA DO CAVACO E OLEO', name: 'MANUTENÇÃO DA MÁQUINA', priority: 10, category: 'Manutenção', standardMinutes: 60 },

  // INSPETOR / OPERADOR TA
  { id: 'act-11', role: 'INSPETOR / OPERADOR TA', name: 'MEDIR PEÇAS', priority: 1, category: 'Qualidade / Inspeção', standardMinutes: 30 },
  { id: 'act-12', role: 'INSPETOR / OPERADOR TA', name: 'SEGREGAR E IDENTIFICAR PEÇAS AREA NÃO CONFORME', priority: 2, category: 'Qualidade / Inspeção', standardMinutes: 25 },
  { id: 'act-13', role: 'INSPETOR / OPERADOR TA', name: 'MEDIR PEÇAS NA AREA DE PRODUTO NÃO CONFORME', priority: 3, category: 'Qualidade / Inspeção', standardMinutes: 40 },
  { id: 'act-14', role: 'INSPETOR / OPERADOR TA', name: 'OPERAÇÃO NA MAQUINA', priority: 4, category: 'Operação', standardMinutes: 120 },
  { id: 'act-15', role: 'INSPETOR / OPERADOR TA', name: 'INICIAR A MAQUINA (CAVACO, LUBRIFICAR, INSPECIONAR)', priority: 5, category: 'Setup', standardMinutes: 30 },

  // INSPETOR TCNC / OPERADOR
  { id: 'act-16', role: 'INSPETOR TCNC / OPERADOR', name: 'MEDIR PEÇAS', priority: 1, category: 'Qualidade / Inspeção', standardMinutes: 30 },
  { id: 'act-17', role: 'INSPETOR TCNC / OPERADOR', name: 'CORREÇÕES BÁSICAS', priority: 2, category: 'Setup', standardMinutes: 20 },
  { id: 'act-18', role: 'INSPETOR TCNC / OPERADOR', name: 'SEGREGAR E IDENTIFICAR PEÇAS AREA NÃO CONFORME', priority: 3, category: 'Qualidade / Inspeção', standardMinutes: 25 },
  { id: 'act-19', role: 'INSPETOR TCNC / OPERADOR', name: 'MEDIR PEÇAS NA AREA DE PRODUTO NÃO CONFORME', priority: 4, category: 'Qualidade / Inspeção', standardMinutes: 35 },
  { id: 'act-20', role: 'INSPETOR TCNC / OPERADOR', name: 'LIMPEZA DO CAVACO', priority: 5, category: '5S & Limpeza', standardMinutes: 30 },
  { id: 'act-21', role: 'INSPETOR TCNC / OPERADOR', name: 'OPERAÇÃO NA MAQUINA', priority: 6, category: 'Operação', standardMinutes: 120 },
  { id: 'act-22', role: 'INSPETOR TCNC / OPERADOR', name: 'INICIAR A MAQUINA (CAVACO, LUBRIFICAR, INSPECIONAR)', priority: 7, category: 'Setup', standardMinutes: 30 },

  // PREPARADOR DE FERRAMENTAS
  { id: 'act-23', role: 'PREPARADOR DE FERRAMENTAS', name: 'AFIAR FERRAMENTAS', priority: 1, category: 'Setup', standardMinutes: 45 },
  { id: 'act-24', role: 'PREPARADOR DE FERRAMENTAS', name: 'CORREÇÕES DE FERRAMENTAS', priority: 2, category: 'Setup', standardMinutes: 30 },
  { id: 'act-25', role: 'PREPARADOR DE FERRAMENTAS', name: 'REALIZAR TROCA DE FERRAMENTA', priority: 3, category: 'Setup', standardMinutes: 40 },
  { id: 'act-26', role: 'PREPARADOR DE FERRAMENTAS', name: 'MEDIR PEÇAS NA AREA DE PRODUTO NÃO CONFORME', priority: 4, category: 'Qualidade / Inspeção', standardMinutes: 30 },
  { id: 'act-27', role: 'PREPARADOR DE FERRAMENTAS', name: 'LIMPEZA DE PINÇAS', priority: 5, category: '5S & Limpeza', standardMinutes: 25 },
  { id: 'act-28', role: 'PREPARADOR DE FERRAMENTAS', name: 'LIMPEZA DO CAVACO', priority: 6, category: '5S & Limpeza', standardMinutes: 30 },
  { id: 'act-29', role: 'PREPARADOR DE FERRAMENTAS', name: 'OPERAÇÃO NA MAQUINA (THR / BANCADA / TCNC)', priority: 7, category: 'Operação', standardMinutes: 90 },
  { id: 'act-30', role: 'PREPARADOR DE FERRAMENTAS', name: 'SETUP THR', priority: 8, category: 'Setup', standardMinutes: 60 },
  { id: 'act-31', role: 'PREPARADOR DE FERRAMENTAS', name: 'SETUP EXTERNO', priority: 9, category: 'Setup', standardMinutes: 45 },
  { id: 'act-32', role: 'PREPARADOR DE FERRAMENTAS', name: 'SETUP DE MAQUINA', priority: 10, category: 'Setup', standardMinutes: 75 },
  { id: 'act-33', role: 'PREPARADOR DE FERRAMENTAS', name: 'AJUSTE NO ALIMENTADOR', priority: 11, category: 'Setup', standardMinutes: 35 },
  { id: 'act-34', role: 'PREPARADOR DE FERRAMENTAS', name: 'INICIAR A MAQUINA (CAVACO, LUBRIFICAR, INSPECIONAR)', priority: 12, category: 'Setup', standardMinutes: 30 },
  { id: 'act-35', role: 'PREPARADOR DE FERRAMENTAS', name: 'MANUTENÇÃO DA MÁQUINA', priority: 13, category: 'Manutenção', standardMinutes: 60 },
  { id: 'act-36', role: 'PREPARADOR DE FERRAMENTAS', name: 'TAREFA SOLICITADA PELO LÍDER', priority: 14, category: 'Operação', standardMinutes: 45 },

  // PREPARADOR PROGAMADOR
  { id: 'act-37', role: 'PREPARADOR PROGAMADOR', name: 'SETUP DE MAQUINA', priority: 1, category: 'Setup', standardMinutes: 75 },
  { id: 'act-38', role: 'PREPARADOR PROGAMADOR', name: 'SETUP EXTERNO', priority: 2, category: 'Setup', standardMinutes: 45 },
  { id: 'act-39', role: 'PREPARADOR PROGAMADOR', name: 'CORREÇÕES DE FERRAMENTAS', priority: 3, category: 'Setup', standardMinutes: 30 },
  { id: 'act-40', role: 'PREPARADOR PROGAMADOR', name: 'REALIZAR TROCA DE FERRAMENTA', priority: 4, category: 'Setup', standardMinutes: 35 },
  { id: 'act-41', role: 'PREPARADOR PROGAMADOR', name: 'AFIAR FERRAMENTAS', priority: 5, category: 'Setup', standardMinutes: 40 },
  { id: 'act-42', role: 'PREPARADOR PROGAMADOR', name: 'AJUSTE NO PROGRAMA', priority: 6, category: 'Setup', standardMinutes: 40 },
  { id: 'act-43', role: 'PREPARADOR PROGAMADOR', name: 'AJUSTE NO ALIMENTADOR', priority: 7, category: 'Setup', standardMinutes: 30 },
  { id: 'act-44', role: 'PREPARADOR PROGAMADOR', name: 'LIMPEZA DE PINÇAS', priority: 8, category: '5S & Limpeza', standardMinutes: 20 },
  { id: 'act-45', role: 'PREPARADOR PROGAMADOR', name: 'LIMPEZA DO CAVACO', priority: 9, category: '5S & Limpeza', standardMinutes: 30 },
  { id: 'act-46', role: 'PREPARADOR PROGAMADOR', name: 'SETUP THR', priority: 10, category: 'Setup', standardMinutes: 50 },
  { id: 'act-47', role: 'PREPARADOR PROGAMADOR', name: 'OPERAÇÃO NA MAQUINA', priority: 11, category: 'Operação', standardMinutes: 120 },
  { id: 'act-48', role: 'PREPARADOR PROGAMADOR', name: 'INICIAR A MAQUINA (CAVACO, LUBRIFICAR, INSPECIONAR)', priority: 12, category: 'Setup', standardMinutes: 30 },
  { id: 'act-49', role: 'PREPARADOR PROGAMADOR', name: 'MANUTENÇÃO DA MÁQUINA', priority: 13, category: 'Manutenção', standardMinutes: 60 },

  // PREPARADOR TORNO AUTOMATICO
  { id: 'act-50', role: 'PREPARADOR TORNO AUTOMATICO', name: 'SETUP DE MAQUINA', priority: 1, category: 'Setup', standardMinutes: 75 },
  { id: 'act-51', role: 'PREPARADOR TORNO AUTOMATICO', name: 'AFIAR FERRAMENTAS', priority: 2, category: 'Setup', standardMinutes: 40 },
  { id: 'act-52', role: 'PREPARADOR TORNO AUTOMATICO', name: 'LIMPEZA DE PINÇAS', priority: 3, category: '5S & Limpeza', standardMinutes: 25 },
  { id: 'act-53', role: 'PREPARADOR TORNO AUTOMATICO', name: 'SETUP EXTERNO', priority: 4, category: 'Setup', standardMinutes: 45 },
  { id: 'act-54', role: 'PREPARADOR TORNO AUTOMATICO', name: 'SETUP THR', priority: 5, category: 'Setup', standardMinutes: 50 },
  { id: 'act-55', role: 'PREPARADOR TORNO AUTOMATICO', name: 'PREPARAÇÃO DE BARRAS PARA USINAR', priority: 6, category: 'Operação', standardMinutes: 35 },
  { id: 'act-56', role: 'PREPARADOR TORNO AUTOMATICO', name: 'SETUP MAQUINAS DE BANCADA (FURADEIRAS)', priority: 7, category: 'Setup', standardMinutes: 35 },
  { id: 'act-57', role: 'PREPARADOR TORNO AUTOMATICO', name: 'INICIAR A MAQUINA (CAVACO, LUBRIFICAR, INSPECIONAR)', priority: 8, category: 'Setup', standardMinutes: 30 },
  { id: 'act-58', role: 'PREPARADOR TORNO AUTOMATICO', name: 'MANUTENÇÃO DA MÁQUINA', priority: 9, category: 'Manutenção', standardMinutes: 60 },

  // SERVIÇOS GERAIS TORNO AUTOMATICO
  { id: 'act-59', role: 'SERVIÇOS GERAIS TORNO AUTOMATICO', name: 'PREPARAÇÃO DE BARRAS PARA USINAR', priority: 1, category: 'Operação', standardMinutes: 40 },
  { id: 'act-60', role: 'SERVIÇOS GERAIS TORNO AUTOMATICO', name: 'SETUP MAQUINAS DE BANCADA (FURADEIRAS)', priority: 2, category: 'Setup', standardMinutes: 35 },
  { id: 'act-61', role: 'SERVIÇOS GERAIS TORNO AUTOMATICO', name: 'OPERAÇÃO NA MAQUINA', priority: 3, category: 'Operação', standardMinutes: 120 },
  { id: 'act-62', role: 'SERVIÇOS GERAIS TORNO AUTOMATICO', name: 'MANUTENÇÃO DA MÁQUINA', priority: 4, category: 'Manutenção', standardMinutes: 60 },

  // SISTEMA / AREA DO CAVACO E OLEO
  { id: 'act-63', role: 'SISTEMA / AREA DO CAVACO E OLEO', name: 'FAZER ETIQUETA', priority: 1, category: 'Sistema & Processo', standardMinutes: 20 },
  { id: 'act-64', role: 'SISTEMA / AREA DO CAVACO E OLEO', name: 'LANÇAR TEMPOS E ATUALIZAR PRODUÇÃO SISTEMA', priority: 2, category: 'Sistema & Processo', standardMinutes: 25 },
  { id: 'act-65', role: 'SISTEMA / AREA DO CAVACO E OLEO', name: 'BANHO DE PEÇA', priority: 3, category: 'Operação', standardMinutes: 30 },
  { id: 'act-66', role: 'SISTEMA / AREA DO CAVACO E OLEO', name: 'TRATAMENTO TERMICO DE PEÇA (FORNO)', priority: 4, category: 'Operação', standardMinutes: 80 },
  { id: 'act-67', role: 'SISTEMA / AREA DO CAVACO E OLEO', name: 'CENTRIFUGAR O CAVACO', priority: 5, category: 'Operação', standardMinutes: 35 },
  { id: 'act-68', role: 'SISTEMA / AREA DO CAVACO E OLEO', name: 'VERIFICAÇÃO E REPOSIÇÃO DE ÓLEO', priority: 6, category: 'Manutenção', standardMinutes: 25 },
  { id: 'act-69', role: 'SISTEMA / AREA DO CAVACO E OLEO', name: 'ENGRAXAR / LUBRIFICAR TORNO AUTOMATICO (SEG/QUARTA/SEXTA)', priority: 7, category: 'Manutenção', standardMinutes: 40 },
  { id: 'act-70', role: 'SISTEMA / AREA DO CAVACO E OLEO', name: 'APONTAR PEÇAS NO SISTEMA', priority: 8, category: 'Sistema & Processo', standardMinutes: 25 },
  { id: 'act-71', role: 'SISTEMA / AREA DO CAVACO E OLEO', name: 'AUDITORIA 8S NO SETOR', priority: 9, category: '5S & Limpeza', standardMinutes: 45 },
  { id: 'act-72', role: 'SISTEMA / AREA DO CAVACO E OLEO', name: 'REALIZAR PEDIDOS DE COMPRAS', priority: 10, category: 'Logística / Almoxarifado', standardMinutes: 30 },
  { id: 'act-73', role: 'SISTEMA / AREA DO CAVACO E OLEO', name: 'BUSCAR ITENS RECEBIMENTO / ALMOXARIFADO', priority: 11, category: 'Logística / Almoxarifado', standardMinutes: 25 },
  { id: 'act-74', role: 'SISTEMA / AREA DO CAVACO E OLEO', name: 'PRODUZIR PEÇAS (BANCADA / OUTROS) OU RETRABALHO', priority: 12, category: 'Operação', standardMinutes: 60 },

  // LÍDER DE PRODUÇÃO
  { id: 'act-75', role: 'LÍDER DE PRODUÇÃO', name: 'GESTÃO E DISTRIBUIÇÃO DE ORDENS DE SERVIÇO', priority: 1, category: 'Sistema & Processo', standardMinutes: 60 },
  { id: 'act-76', role: 'LÍDER DE PRODUÇÃO', name: 'RONDA DE CHÃO DE FÁBRICA / AUDITORIA 5S', priority: 2, category: '5S & Limpeza', standardMinutes: 45 },
  { id: 'act-77', role: 'LÍDER DE PRODUÇÃO', name: 'SUPORTE TÉCNICO E LIBERAÇÃO DE SETUP', priority: 3, category: 'Setup', standardMinutes: 50 },
  { id: 'act-78', role: 'LÍDER DE PRODUÇÃO', name: 'REUNIÃO DE ALINHAMENTO DIÁRIO (DDS)', priority: 4, category: 'Sistema & Processo', standardMinutes: 20 },
];

export const INITIAL_OBSERVATIONS = [
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

export const INITIAL_ROLES: string[] = [
  'PREPARADOR TORNO AUTOMATICO',
  'INSPETOR TCNC / OPERADOR',
  'PREPARADOR DE FERRAMENTAS',
  'AREA DO CAVACO E OLEO',
  'PREPARADOR PROGAMADOR',
  'INSPETOR / OPERADOR TA',
  'SISTEMA / AREA DO CAVACO E OLEO',
  'SERVIÇOS GERAIS TORNO AUTOMATICO',
  'LÍDER DE PRODUÇÃO',
  'OPERADOR DE TORNO CNC',
  'OPERADOR DE CENTRO DE USINAGEM',
  'AUXILIAR DE PRODUÇÃO',
  'MANUTENÇÃO MECÂNICA',
  'SOLDADOR TIG/MIG',
];

/**
 * Função exata de cores do script original do usuário
 */
export function definirCorFuncao(funcaoTexto: string = ''): string {
  const f = funcaoTexto.toUpperCase();
  if (f.includes('LIDER') || f.includes('LÍDER')) return '#FFD700'; 
  if (f.includes('PREPARADOR')) return '#8A2BE2'; 
  if (f.includes('INSPETOR')) return '#FF8C00'; 
  if (f.includes('OPERADOR')) return '#007BFF'; 
  if (f.includes('AUXILIAR') || f.includes('AJUDANTE')) return '#00E676'; 
  if (f.includes('PROGRAMADOR') || f.includes('PROGAMADOR')) return '#E91E63'; 
  if (f.includes('SOLDADOR')) return '#FF3D00'; 
  if (f.includes('MANUTENÇÃO') || f.includes('MANUTENCAO')) return '#795548'; 
  if (f.includes('ESTAGIÁRIO') || f.includes('ESTAGIARIO')) return '#00BCD4'; 
  return '#555555'; 
}

export function definirCorTextoHeader(corFundo: string): string {
  if (corFundo === '#FFD700' || corFundo === '#00E676' || corFundo === '#00BCD4') {
    return '#000000';
  }
  return '#FFFFFF';
}
