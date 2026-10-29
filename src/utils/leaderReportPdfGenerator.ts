import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ProductionLog } from '../types';
import { formatarHorasMinutos } from './factoryCalculations';

export interface LeaderReportPdfOptions {
  selectedRole: string;
  selectedColab: string;
  periodLabel: string;
  selectedActivities: string[];
  totalActivitiesCount: number;
  excludeMeals: boolean;
  summaryAnswerText: string;
  analyzedData: {
    totalCount: number;
    completedCount: number;
    inProgressCount: number;
    avgMinutesPerExecution: number;
    standardMinutes?: number;
    minMinutes: number;
    maxMinutes: number;
    avgMinutesPerDay: number;
    distinctDaysCount: number;
    totalMinutes: number;
    activitiesRank: Array<{
      code: string;
      name: string;
      fullName: string;
      category: string;
      count: number;
      totalMinutes: number;
      avgMinutesPerExecution: number;
      avgMinutesPerDay: number;
      percentageOfTotal: number;
    }>;
    matchedLogs: ProductionLog[];
  };
  collaboratorRoleMap: Map<string, string>;
}

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
 * Gera e salva o Relatório Analítico do Líder em PDF (Preto e Branco / Tons de Cinza)
 * Abre o seletor nativo do sistema operacional (Salvar Como...) para escolher a pasta,
 * ou dispara o download direto do arquivo .pdf.
 */
export async function generateAndSaveLeaderReportPdf(
  options: LeaderReportPdfOptions
): Promise<{ success: boolean; method: 'picker' | 'download' | 'cancelled'; fileName: string }> {
  const {
    selectedRole,
    selectedColab,
    periodLabel,
    selectedActivities,
    totalActivitiesCount,
    excludeMeals,
    summaryAnswerText,
    analyzedData,
    collaboratorRoleMap,
  } = options;

  // Criar documento PDF A4 em formato retrato (portrait)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2; // 186mm

  let currentY = margin;

  // 1. CABEÇALHO OFICIAL (Tons de cinza e preto para impressão nítida e economia de tinta)
  doc.setFillColor(242, 244, 246);
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.4);
  doc.rect(margin, currentY, contentWidth, 18, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('MCA | SISTEMA MES INDUSTRIAL - CONTROLE DE ATIVIDADES', margin + 3.5, currentY + 6.5);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('RELATÓRIO ANALÍTICO DO LÍDER DE PRODUÇÃO & AUDITORIA DE PROCESSO', margin + 3.5, currentY + 11.5);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Documento Oficial de Chão de Fábrica • Médias, Ocorrências e Registros de Produtividade', margin + 3.5, currentY + 15.5);

  // Emissão Oficial à direita
  const dataHoraEmissao = `${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('EMISSÃO OFICIAL', pageWidth - margin - 3.5, currentY + 6.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text(dataHoraEmissao, pageWidth - margin - 3.5, currentY + 11.5, { align: 'right' });
  doc.text('Sistema MES MCA', pageWidth - margin - 3.5, currentY + 15.5, { align: 'right' });

  currentY += 21;

  // 2. QUADRO DE CONFIRMAÇÕES IMPORTANTES DOS FILTROS APLICADOS
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.3);
  doc.rect(margin, currentY, contentWidth, 19, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text('CONFIRMAÇÕES IMPORTANTES DOS FILTROS APLICADOS', margin + 3.5, currentY + 5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(80, 80, 80);
  doc.text(`${analyzedData.totalCount} Registros Filtrados`, pageWidth - margin - 3.5, currentY + 5, { align: 'right' });

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(margin + 3.5, currentY + 6.5, pageWidth - margin - 3.5, currentY + 6.5);

  // Linhas de dados de filtros
  doc.setFontSize(7.5);

  // Linha 1
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(60, 60, 60);
  doc.text('Cargo / Função:', margin + 3.5, currentY + 10.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  const roleText = selectedRole === 'TODOS' ? 'Todos os Cargos e Funções' : selectedRole;
  doc.text(roleText.toUpperCase(), margin + 27, currentY + 10.5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(60, 60, 60);
  doc.text('Operador:', margin + 85, currentY + 10.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  const colabText = selectedColab === 'TODOS' ? 'Todos os Operadores' : selectedColab;
  doc.text(colabText.toUpperCase(), margin + 100, currentY + 10.5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(60, 60, 60);
  doc.text('Período:', margin + 145, currentY + 10.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(periodLabel, margin + 158, currentY + 10.5);

  // Linha 2
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(60, 60, 60);
  doc.text('Atividades:', margin + 3.5, currentY + 15.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  const actText = selectedActivities.includes('TODOS')
    ? `Todas as Atividades (${totalActivitiesCount} cadastradas)`
    : selectedActivities.length === 0
    ? 'Nenhuma atividade ticada'
    : selectedActivities.join(', ');
  const safeActText = actText.length > 70 ? `${actText.slice(0, 67)}...` : actText;
  doc.text(safeActText, margin + 20, currentY + 15.5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(60, 60, 60);
  doc.text('Refeição / Pausas:', margin + 125, currentY + 15.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(excludeMeals ? 'Desconsiderada (Tempo Líquido)' : 'Incluída no Tempo', margin + 153, currentY + 15.5);

  currentY += 22;

  // 3. PARECER / DIAGNÓSTICO DO ASSISTENTE INTELIGENTE
  const splitSummary = doc.splitTextToSize(summaryAnswerText, contentWidth - 7);
  const summaryBoxHeight = Math.max(14, 8 + splitSummary.length * 4.2);

  doc.setFillColor(245, 247, 250);
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.4);
  doc.rect(margin, currentY, contentWidth, summaryBoxHeight, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text('PARECER DO ASSISTENTE INTELIGENTE:', margin + 3.5, currentY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(20, 20, 20);
  doc.text(splitSummary, margin + 3.5, currentY + 9.5);

  currentY += summaryBoxHeight + 3.5;

  // 4. RESUMO DOS INDICADORES E MÉDIAS (4 KPIS EM P&B)
  const cardGap = 2.5;
  const cardWidth = (contentWidth - cardGap * 3) / 4;
  const cardHeight = 16;

  // KPI 1: Ocorrências
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(0.3);
  doc.rect(margin, currentY, cardWidth, cardHeight, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(80, 80, 80);
  doc.text('OCORRÊNCIAS', margin + cardWidth / 2, currentY + 4, { align: 'center' });
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(`${analyzedData.totalCount} vezes`, margin + cardWidth / 2, currentY + 9.5, { align: 'center' });
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`${analyzedData.completedCount} concl. • ${analyzedData.inProgressCount} ativ.`, margin + cardWidth / 2, currentY + 13.5, { align: 'center' });

  // KPI 2: Tempo Médio
  const kpi2X = margin + cardWidth + cardGap;
  doc.rect(kpi2X, currentY, cardWidth, cardHeight, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(80, 80, 80);
  doc.text('TEMPO MÉDIO', kpi2X + cardWidth / 2, currentY + 4, { align: 'center' });
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(`${analyzedData.avgMinutesPerExecution} min / vez`, kpi2X + cardWidth / 2, currentY + 9.5, { align: 'center' });
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  const stdInfo = analyzedData.standardMinutes
    ? `Padrão: ${analyzedData.standardMinutes}m`
    : `Mín ${analyzedData.minMinutes}m • Máx ${analyzedData.maxMinutes}m`;
  doc.text(stdInfo, kpi2X + cardWidth / 2, currentY + 13.5, { align: 'center' });

  // KPI 3: Média Diária
  const kpi3X = margin + (cardWidth + cardGap) * 2;
  doc.rect(kpi3X, currentY, cardWidth, cardHeight, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(80, 80, 80);
  doc.text('MÉDIA DIÁRIA', kpi3X + cardWidth / 2, currentY + 4, { align: 'center' });
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(formatarHorasMinutos(analyzedData.avgMinutesPerDay), kpi3X + cardWidth / 2, currentY + 9.5, { align: 'center' });
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`${analyzedData.distinctDaysCount} dia(s) com dados`, kpi3X + cardWidth / 2, currentY + 13.5, { align: 'center' });

  // KPI 4: Tempo Total
  const kpi4X = margin + (cardWidth + cardGap) * 3;
  doc.rect(kpi4X, currentY, cardWidth, cardHeight, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(80, 80, 80);
  doc.text('TEMPO TOTAL', kpi4X + cardWidth / 2, currentY + 4, { align: 'center' });
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(formatarHorasMinutos(analyzedData.totalMinutes), kpi4X + cardWidth / 2, currentY + 9.5, { align: 'center' });
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`${analyzedData.totalMinutes} minutos`, kpi4X + cardWidth / 2, currentY + 13.5, { align: 'center' });

  currentY += cardHeight + 4;

  // 5. TABELA DE RANKING DAS ATIVIDADES (se houver)
  if (analyzedData.activitiesRank.length > 0) {
    const rankingTableData = analyzedData.activitiesRank.map((act) => [
      act.code,
      act.name,
      act.category || 'Operação',
      `${act.count}x`,
      formatarHorasMinutos(act.totalMinutes),
      `${act.avgMinutesPerExecution}m`,
      formatarHorasMinutos(act.avgMinutesPerDay),
      `${act.percentageOfTotal}%`,
    ]);

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin, bottom: 20 },
      head: [
        ['Cód.', 'Atividade', 'Categoria', 'Qtd', 'Total', 'Média', 'Média/Dia', '% Total'],
      ],
      body: rankingTableData,
      theme: 'grid',
      styles: {
        fontSize: 7.5,
        cellPadding: 1.5,
        textColor: [20, 20, 20],
        lineColor: [180, 180, 180],
        lineWidth: 0.15,
      },
      headStyles: {
        fillColor: [225, 228, 232],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'left',
      },
      columnStyles: {
        0: { cellWidth: 14, fontStyle: 'bold', halign: 'center' },
        1: { cellWidth: 62, fontStyle: 'bold' },
        2: { cellWidth: 32 },
        3: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 20, halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: 15, halign: 'right' },
        6: { cellWidth: 18, halign: 'right' },
        7: { cellWidth: 11, halign: 'center', fontStyle: 'bold' },
      },
      alternateRowStyles: {
        fillColor: [248, 249, 250],
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 4;
  }

  // 6. TABELA DE APONTAMENTOS DE PRODUÇÃO
  if (analyzedData.matchedLogs.length > 0) {
    // Se o espaço restante for muito pequeno para o cabeçalho da tabela, quebra página
    if (currentY > pageHeight - 35) {
      doc.addPage();
      currentY = margin;
    }

    const logsTableData = analyzedData.matchedLogs.map((log) => {
      const dataFmt = formatarDataIsoOuPtBr(log.date);
      const horarioFmt = `${log.startTime || ''} - ${log.endTime || 'Ativo'}`;
      const operadorFmt = log.collaboratorName || '-';
      const cargoFmt = log.role || collaboratorRoleMap.get(log.collaboratorName?.toLowerCase()) || 'Operador';
      const atividadeFmt = log.activity || '-';
      const durFmt = log.durationMinutes ? `${log.durationMinutes} min` : (log.status === 'Em Execução' ? 'Ativo' : '-');
      const obsFmt = log.initialDescription || log.observation || log.notes || '-';

      return [
        dataFmt,
        horarioFmt,
        operadorFmt,
        cargoFmt,
        atividadeFmt,
        durFmt,
        log.status || 'Concluída',
        obsFmt,
      ];
    });

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin, bottom: 24 },
      head: [
        ['Data', 'Horário', 'Operador', 'Cargo', 'Atividade', 'Duração', 'Status', 'Observação / Q.I.'],
      ],
      body: logsTableData,
      theme: 'grid',
      styles: {
        fontSize: 6.8,
        cellPadding: 1.3,
        textColor: [20, 20, 20],
        lineColor: [180, 180, 180],
        lineWidth: 0.15,
      },
      headStyles: {
        fillColor: [225, 228, 232],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'left',
      },
      columnStyles: {
        0: { cellWidth: 16 },
        1: { cellWidth: 20 },
        2: { cellWidth: 26, fontStyle: 'bold' },
        3: { cellWidth: 24 },
        4: { cellWidth: 38 },
        5: { cellWidth: 15, halign: 'right', fontStyle: 'bold' },
        6: { cellWidth: 18, halign: 'center' },
        7: { cellWidth: 29 },
      },
      alternateRowStyles: {
        fillColor: [248, 249, 250],
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // 7. ASSINATURA / VISTO DO LÍDER NO RODAPÉ
  if (currentY > pageHeight - 24) {
    doc.addPage();
    currentY = margin + 10;
  }

  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(0.3);
  doc.line(margin, currentY, pageWidth - margin, currentY);

  const signWidth = 85;
  const signX = pageWidth - margin - signWidth;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 30, 30);
  doc.text('CONTROLE FABRIL MCA', margin, currentY + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 100, 100);
  doc.text('Auditoria de apontamentos de produção e indicadores de processo.', margin, currentY + 8);

  doc.setDrawColor(40, 40, 40);
  doc.line(signX, currentY + 7, signX + signWidth, currentY + 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text('Visto do Líder de Produção', signX + signWidth / 2, currentY + 11, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 100, 100);
  doc.text('Assinatura / Data: ____ / ____ / ________', signX + signWidth / 2, currentY + 15, { align: 'center' });

  // 8. NUMERAÇÃO DE PÁGINAS "Página X de Y" EM TODAS AS PÁGINAS
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Página ${i} de ${totalPages} • Relatório Analítico MCA Sistema MES`,
      pageWidth / 2,
      pageHeight - 5,
      { align: 'center' }
    );
  }

  // 9. NOME DO ARQUIVO SEGURO
  const safeOp = (selectedColab === 'TODOS' ? 'Geral' : selectedColab).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 25);
  const safeDate = new Date().toISOString().slice(0, 10);
  const fileName = `Relatorio_Analitico_Lider_MCA_${safeOp}_${safeDate}.pdf`;

  const pdfBlob = doc.output('blob');

  // 10. TENTATIVA 1: showSaveFilePicker (Abre a janela nativa do Windows/Mac para o usuário ESCOLHER onde salvar!)
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: 'Documento PDF (*.pdf)',
            accept: {
              'application/pdf': ['.pdf'],
            },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(pdfBlob);
      await writable.close();
      return { success: true, method: 'picker', fileName };
    } catch (pickerErr: any) {
      if (pickerErr?.name === 'AbortError') {
        // Usuário clicou em "Cancelar" na janela do sistema
        return { success: false, method: 'cancelled', fileName };
      }
      console.warn('showSaveFilePicker não permitido pelo navegador/iframe, acionando download direto:', pickerErr);
    }
  }

  // 11. TENTATIVA 2: doc.save() direto do jsPDF
  try {
    doc.save(fileName);
    return { success: true, method: 'download', fileName };
  } catch (saveErr) {
    // 12. TENTATIVA 3: Link de ancoragem com blob
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { success: true, method: 'download', fileName };
  }
}
