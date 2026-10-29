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

/**
 * Gera e salva o Relatório Analítico do Líder em PDF (Preto e Branco / Tons de Cinza)
 * - Fundo 100% legível (sem quadros escuros nos KPIs)
 * - Nenhuma palavra vazando para fora das bordas
 * - Sem a tabela de apontamentos (conforme solicitado pelo líder: até o ranking de atividades)
 * - Abre o seletor nativo do sistema operacional (Salvar Como...) para escolher a pasta.
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
  doc.setFillColor(245, 247, 250);
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(0.4);
  doc.rect(margin, currentY, contentWidth, 18, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('MCA | SISTEMA MES INDUSTRIAL - CONTROLE DE ATIVIDADES', margin + 4, currentY + 6.5);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('RELATÓRIO ANALÍTICO DO LÍDER DE PRODUÇÃO & AUDITORIA DE PROCESSO', margin + 4, currentY + 11.5);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Documento Oficial de Chão de Fábrica • Médias, Ocorrências e Registros de Produtividade', margin + 4, currentY + 15.5);

  // Emissão Oficial à direita
  const dataHoraEmissao = `${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('EMISSÃO OFICIAL', pageWidth - margin - 4, currentY + 6.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);
  doc.text(dataHoraEmissao, pageWidth - margin - 4, currentY + 11.5, { align: 'right' });
  doc.text('Sistema MES MCA', pageWidth - margin - 4, currentY + 15.5, { align: 'right' });

  currentY += 21;

  // 2. QUADRO DE CONFIRMAÇÕES DOS FILTROS (Organizado em 3 linhas sem corte de palavras)
  const filterBoxHeight = 23;
  doc.setFillColor(252, 252, 252);
  doc.setDrawColor(50, 50, 50);
  doc.setLineWidth(0.35);
  doc.rect(margin, currentY, contentWidth, filterBoxHeight, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(0, 0, 0);
  doc.text('CONFIRMAÇÕES IMPORTANTES DOS FILTROS APLICADOS', margin + 4, currentY + 5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 70, 70);
  doc.text(`${analyzedData.totalCount} Registros Filtrados`, pageWidth - margin - 4, currentY + 5, { align: 'right' });

  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.2);
  doc.line(margin + 4, currentY + 6.5, pageWidth - margin - 4, currentY + 6.5);

  // Linhas organizadas em 2 colunas amplas:
  const col1X = margin + 4;
  const col2X = margin + 96;

  doc.setFontSize(7.2);

  // Linha 1: Cargo / Função e Operador
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 70, 70);
  doc.text('Cargo / Função: ', col1X, currentY + 10.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  const roleText = (selectedRole === 'TODOS' ? 'Todos os Cargos e Funções' : selectedRole).toUpperCase();
  doc.text(roleText.length > 36 ? `${roleText.slice(0, 34)}...` : roleText, col1X + 23, currentY + 10.5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 70, 70);
  doc.text('Operador: ', col2X, currentY + 10.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  const colabText = (selectedColab === 'TODOS' ? 'Todos os Operadores' : selectedColab).toUpperCase();
  doc.text(colabText.length > 36 ? `${colabText.slice(0, 34)}...` : colabText, col2X + 16, currentY + 10.5);

  // Linha 2: Período e Critério de Refeição
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 70, 70);
  doc.text('Período: ', col1X, currentY + 15);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(periodLabel.length > 42 ? `${periodLabel.slice(0, 40)}...` : periodLabel, col1X + 14, currentY + 15);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 70, 70);
  doc.text('Refeição / Pausas: ', col2X, currentY + 15);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(excludeMeals ? 'Desconsiderada (Tempo Líquido)' : 'Incluída no Tempo', col2X + 28, currentY + 15);

  // Linha 3: Atividades selecionadas (largura total segura)
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 70, 70);
  doc.text('Atividades: ', col1X, currentY + 19.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  const actText = selectedActivities.includes('TODOS')
    ? `Todas as Atividades (${totalActivitiesCount} cadastradas no sistema)`
    : selectedActivities.length === 0
    ? 'Nenhuma atividade selecionada'
    : selectedActivities.join(', ');
  const safeActText = actText.length > 95 ? `${actText.slice(0, 92)}...` : actText;
  doc.text(safeActText, col1X + 17, currentY + 19.5);

  currentY += filterBoxHeight + 3.5;

  // 3. PARECER / DIAGNÓSTICO DO ASSISTENTE INTELIGENTE
  // Configura a fonte ANTES de calcular o splitTextToSize com margem interna de segurança de 14mm
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  const splitSummary = doc.splitTextToSize(summaryAnswerText, contentWidth - 14);
  const summaryBoxHeight = Math.max(14, 7.5 + splitSummary.length * 3.8);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.4);
  doc.rect(margin, currentY, contentWidth, summaryBoxHeight, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text('PARECER DO ASSISTENTE INTELIGENTE:', margin + 4, currentY + 4.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(15, 23, 42);
  doc.text(splitSummary, margin + 4, currentY + 9);

  currentY += summaryBoxHeight + 3.5;

  // 4. RESUMO DOS INDICADORES E MÉDIAS (4 KPIS COM FUNDO 100% BRANCO E NÍTIDO)
  const cardGap = 2.5;
  const cardWidth = (contentWidth - cardGap * 3) / 4;
  const cardHeight = 16;

  // Helper para desenhar cada card com fundo BRANCO explícito e borda escura nítida
  const drawKpiCard = (
    xPos: number,
    title: string,
    mainVal: string,
    subVal: string
  ) => {
    // Fundo BRANCO garantido
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.35);
    doc.rect(xPos, currentY, cardWidth, cardHeight, 'FD');

    // Título do KPI (cinza escuro discreto)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(80, 80, 80);
    doc.text(title, xPos + cardWidth / 2, currentY + 4, { align: 'center' });

    // Valor principal (Preto puro, forte e legível)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(mainVal, xPos + cardWidth / 2, currentY + 9.5, { align: 'center' });

    // Sub-informação (cinza médio legível)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(90, 90, 90);
    doc.text(subVal, xPos + cardWidth / 2, currentY + 13.5, { align: 'center' });
  };

  // Card 1: Ocorrências
  drawKpiCard(
    margin,
    'OCORRÊNCIAS',
    `${analyzedData.totalCount} vezes`,
    `${analyzedData.completedCount} concl. • ${analyzedData.inProgressCount} ativ.`
  );

  // Card 2: Tempo Médio
  const kpi2X = margin + cardWidth + cardGap;
  const stdInfo = analyzedData.standardMinutes
    ? `Padrão: ${analyzedData.standardMinutes}m`
    : `Mín ${analyzedData.minMinutes}m • Máx ${analyzedData.maxMinutes}m`;
  drawKpiCard(
    kpi2X,
    'TEMPO MÉDIO',
    `${analyzedData.avgMinutesPerExecution} min / vez`,
    stdInfo
  );

  // Card 3: Média Diária
  const kpi3X = margin + (cardWidth + cardGap) * 2;
  drawKpiCard(
    kpi3X,
    'MÉDIA DIÁRIA',
    formatarHorasMinutos(analyzedData.avgMinutesPerDay),
    `${analyzedData.distinctDaysCount} dia(s) com dados`
  );

  // Card 4: Tempo Total
  const kpi4X = margin + (cardWidth + cardGap) * 3;
  drawKpiCard(
    kpi4X,
    'TEMPO TOTAL',
    formatarHorasMinutos(analyzedData.totalMinutes),
    `${analyzedData.totalMinutes} minutos no total`
  );

  currentY += cardHeight + 4.5;

  // 5. TABELA DE RANKING DAS ATIVIDADES (DETALHAMENTO OFICIAL DO LÍDER)
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
      margin: { left: margin, right: margin, bottom: 22 },
      head: [
        ['Cód.', 'Atividade', 'Categoria', 'Qtd', 'Total', 'Média', 'Média/Dia', '% Total'],
      ],
      body: rankingTableData,
      theme: 'grid',
      styles: {
        fontSize: 7.2,
        cellPadding: 1.5,
        textColor: [20, 20, 20],
        lineColor: [160, 160, 160],
        lineWidth: 0.15,
      },
      headStyles: {
        fillColor: [232, 235, 240],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'left',
      },
      columnStyles: {
        0: { cellWidth: 14, fontStyle: 'bold', halign: 'center' },
        1: { cellWidth: 60, fontStyle: 'bold' },
        2: { cellWidth: 32 },
        3: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 20, halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: 15, halign: 'right' },
        6: { cellWidth: 18, halign: 'right' },
        7: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
      },
      alternateRowStyles: {
        fillColor: [248, 249, 250],
      },
    });

    currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 7 : currentY + 10;
  }

  // OBSERVAÇÃO CIRÚRGICA:
  // Conforme solicitação explícita do usuário:
  // "PODE SER ATÉ O RANKING DE ATIVIDADES PARA IMPRIMIR, A TABELA DE APONTAMENTO NÃO PRECISA"
  // Portanto, a tabela de apontamentos individuais foi removida para manter o documento 100% conciso,
  // limpo e cabendo em uma única folha formal com assinatura do líder!

  // 6. ASSINATURA / VISTO DO LÍDER NO FINAL DO RELATÓRIO
  if (currentY > pageHeight - 26) {
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
  doc.text('Auditoria de apontamentos de produção e eficiência de processos.', margin, currentY + 8);

  doc.setDrawColor(40, 40, 40);
  doc.line(signX, currentY + 6.5, signX + signWidth, currentY + 6.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text('Visto do Líder de Produção', signX + signWidth / 2, currentY + 10.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 100, 100);
  doc.text('Assinatura / Data: ____ / ____ / ________', signX + signWidth / 2, currentY + 14.5, { align: 'center' });

  // 7. NUMERAÇÃO DE PÁGINAS "Página X de Y"
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Página ${i} de ${totalPages} • Relatório Analítico MCA Sistema MES Industrial`,
      pageWidth / 2,
      pageHeight - 4.5,
      { align: 'center' }
    );
  }

  // 8. NOME DO ARQUIVO SEGURO
  const safeOp = (selectedColab === 'TODOS' ? 'Geral' : selectedColab).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 25);
  const safeDate = new Date().toISOString().slice(0, 10);
  const fileName = `Relatorio_Analitico_Lider_MCA_${safeOp}_${safeDate}.pdf`;

  const pdfBlob = doc.output('blob');

  // 9. TENTATIVA 1: showSaveFilePicker (Abre a janela nativa do Windows/Mac para o usuário ESCOLHER onde salvar!)
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

  // 10. TENTATIVA 2: doc.save() direto do jsPDF
  try {
    doc.save(fileName);
    return { success: true, method: 'download', fileName };
  } catch (saveErr) {
    // 11. TENTATIVA 3: Link de ancoragem com blob
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
