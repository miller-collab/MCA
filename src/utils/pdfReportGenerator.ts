import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ProductionLog } from '../types';
import { formatarHorasMinutos, calcularDiferencaMinutos, isMedirPecasNaoConforme } from './factoryCalculations';

export interface ReportPDFOptions {
  collaboratorName: string;
  startDate?: string;
  endDate?: string;
  selectedShift?: string;
  filterStatus?: string;
  conciliationMetrics: {
    totalProdutivoMin: number;
    totalRefeicaoMin?: number;
    totalGapsMin: number;
    totalJornadaMin: number;
    aderenciaPct: number;
  };
  timelineItems: Array<
    | { type: 'log'; data: ProductionLog }
    | {
        type: 'gap';
        data: {
          id: string;
          collaboratorName: string;
          date: string;
          startTime: string;
          endTime: string;
          durationMinutes: number;
          shift: string;
        };
      }
  >;
  gapsCount: number;
}

export function generateAndDownloadReportPDF(options: ReportPDFOptions): void {
  const {
    collaboratorName,
    startDate,
    endDate,
    selectedShift = 'Todos os Turnos',
    filterStatus = 'Todos Status',
    conciliationMetrics,
    timelineItems,
    gapsCount,
  } = options;

  // Criar documento PDF A4 em formato paisagem (landscape) ou retrato (portrait)
  // Para uma tabela com 11 colunas e observações, landscape A4 oferece excelente leitura e aproveitamento de espaço!
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;

  // 1. CABEÇALHO DO RELATÓRIO (Cinza claro para impressão limpa e econômica)
  doc.setFillColor(232, 235, 238);
  doc.setDrawColor(180, 185, 190);
  doc.rect(margin, margin, pageWidth - margin * 2, 14, 'FD');

  doc.setTextColor(20, 20, 20);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('MCA • HISTÓRICO E AUDITORIA DE APONTAMENTOS DA FÁBRICA', margin + 4, margin + 9);

  const dataHoraEmissao = new Date().toLocaleString('pt-BR');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(`Emissão: ${dataHoraEmissao}`, pageWidth - margin - 4, margin + 9, { align: 'right' });

  // 2. QUADRO DE FILTROS APLICADOS
  const periodoTexto = startDate || endDate
    ? `${startDate ? startDate.split('-').reverse().join('/') : 'Início'} até ${endDate ? endDate.split('-').reverse().join('/') : 'Atual'}`
    : 'Todo o Período';

  doc.setFillColor(245, 245, 245);
  doc.setDrawColor(200, 200, 200);
  doc.rect(margin, margin + 16, pageWidth - margin * 2, 10, 'FD');

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(8.5);

  doc.setFont('helvetica', 'bold');
  doc.text('COLABORADOR:', margin + 4, margin + 22.5);
  doc.setFont('helvetica', 'normal');
  doc.text(collaboratorName, margin + 32, margin + 22.5);

  doc.setFont('helvetica', 'bold');
  doc.text('PERÍODO:', margin + 95, margin + 22.5);
  doc.setFont('helvetica', 'normal');
  doc.text(periodoTexto, margin + 112, margin + 22.5);

  doc.setFont('helvetica', 'bold');
  doc.text('TURNO:', margin + 175, margin + 22.5);
  doc.setFont('helvetica', 'normal');
  doc.text(selectedShift, margin + 190, margin + 22.5);

  doc.setFont('helvetica', 'bold');
  doc.text('STATUS:', margin + 230, margin + 22.5);
  doc.setFont('helvetica', 'normal');
  doc.text(filterStatus, margin + 246, margin + 22.5);

  // 3. CARDS DE RESUMO DA AUDITORIA / JORNADA
  const cardY = margin + 28;
  const cardW = (pageWidth - margin * 2 - 6) / 3;
  const cardH = 13;

  const cardsData = [
    {
      title: 'PRODUTIVO APONTADO',
      val: formatarHorasMinutos(conciliationMetrics.totalProdutivoMin),
      sub: `${conciliationMetrics.totalProdutivoMin} min`,
    },
    {
      title: 'SEM APONTAMENTO (GAPs)',
      val: formatarHorasMinutos(conciliationMetrics.totalGapsMin),
      sub: `${conciliationMetrics.totalGapsMin} min (${gapsCount} lacuna(s))`,
    },
    {
      title: 'TOTAL CONCILIADO',
      val: formatarHorasMinutos(conciliationMetrics.totalJornadaMin),
      sub: `${conciliationMetrics.aderenciaPct}% aderência produtiva`,
    },
  ];

  cardsData.forEach((c, idx) => {
    const cx = margin + idx * (cardW + 3);
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(180, 180, 180);
    doc.rect(cx, cardY, cardW, cardH, 'FD');

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.text(c.title, cx + 3, cardY + 4);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(c.val, cx + 3, cardY + 9);

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(c.sub, cx + cardW - 3, cardY + 9, { align: 'right' });
  });

  // 4. TABELA DE APONTAMENTOS
  const tableData = timelineItems.map((item, idx) => {
    if (item.type === 'log') {
      const log = item.data;
      const dur =
        log.durationMinutes !== undefined
          ? log.durationMinutes
          : log.endTime
          ? calcularDiferencaMinutos(log.startTime, log.endTime)
          : 0;

      const observacoesArray: string[] = [];
      const initDesc = log.initialDescription?.trim() || '';
      const obs =
        log.observation &&
        log.observation.trim() &&
        log.observation.trim() !== 'Operação Concluída com Sucesso'
          ? log.observation.trim()
          : '';
      const notes = log.notes?.trim() || '';

      if (initDesc) {
        observacoesArray.push(`Início: "${initDesc}"`);
      }
      if (obs && obs !== initDesc) {
        observacoesArray.push(`Fechamento: "${obs}"`);
      }
      if (notes && notes !== initDesc && notes !== obs) {
        observacoesArray.push(`Notas: "${notes}"`);
      }
      // Máquina (TORNO-01) removida a pedido para não poluir o campo de observações
      if (typeof log.partsProduced === 'number' && log.partsProduced > 0) {
        let totalPecas = log.partsProduced;
        if (isMedirPecasNaoConforme(log.activity)) {
          const matchBoas = (log.observation || log.notes || '').match(/Boas:\s*(\d+)/i);
          const matchRuins = (log.observation || log.notes || '').match(/Ruins:\s*(\d+)/i);
          if (matchBoas && matchRuins) {
            const b = parseInt(matchBoas[1], 10);
            const r = parseInt(matchRuins[1], 10);
            totalPecas = b + r;
          } else if (typeof log.scrapCount === 'number' && log.scrapCount > 0) {
            totalPecas = log.partsProduced + log.scrapCount;
          }
        }
        observacoesArray.push(`Peças: ${totalPecas}`);
      }
      if (typeof log.scrapCount === 'number' && log.scrapCount > 0) {
        observacoesArray.push(`Refugos: ${log.scrapCount}`);
      }

      const comentariosTexto =
        observacoesArray.length > 0 ? observacoesArray.join(' | ') : log.observation || '-';

      const dateFmt = log.date ? log.date.split('-').reverse().join('/') : '-';

      return [
        String(idx + 1),
        dateFmt,
        log.collaboratorName || '-',
        log.shift || '-',
        log.category ? `${log.activity || '-'}\n[${log.category}]` : log.activity || '-',
        log.startTime || '-',
        log.endTime || '-',
        formatarHorasMinutos(dur),
        log.status || 'Concluída',
        comentariosTexto,
      ];
    } else {
      const gap = item.data;
      const dateFmt = gap.date ? gap.date.split('-').reverse().join('/') : '-';
      return [
        String(idx + 1),
        dateFmt,
        gap.collaboratorName || '-',
        gap.shift || '-',
        '[GAP] SEM APONTAMENTO\n(Intervalo Ocioso)',
        gap.startTime || '-',
        gap.endTime || '-',
        formatarHorasMinutos(gap.durationMinutes),
        'Sem Registro',
        `Lacuna sem atividade registrada (${gap.durationMinutes} min)`,
      ];
    }
  });

  autoTable(doc, {
    startY: cardY + cardH + 4,
    margin: { left: margin, right: margin, bottom: 25 },
    head: [
      [
        '#',
        'Data',
        'Operador',
        'Turno',
        'Atividade / Operação',
        'Início',
        'Fim',
        'Tempo',
        'Status',
        'Observações / Comentários de Execução',
      ],
    ],
    body: tableData,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 1.8,
      textColor: [20, 20, 20],
      lineColor: [180, 180, 180],
      lineWidth: 0.2,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [225, 228, 233],
      textColor: [20, 20, 20],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
      lineColor: [170, 170, 170],
      lineWidth: 0.3,
    },
    alternateRowStyles: {
      fillColor: [248, 248, 248],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 32, fontStyle: 'bold' },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 52, fontStyle: 'bold' },
      5: { cellWidth: 16, halign: 'center', font: 'courier' },
      6: { cellWidth: 16, halign: 'center', font: 'courier' },
      7: { cellWidth: 18, halign: 'center', fontStyle: 'bold', font: 'courier' },
      8: { cellWidth: 20, halign: 'center' },
      9: { cellWidth: 'auto' }, // Observações ocupam o restante da largura
    },
    didParseCell: (data) => {
      // Destaque visual suave para linhas de GAP
      const rawRow = data.row.raw as string[];
      if (rawRow && rawRow[4] && rawRow[4].includes('[GAP]')) {
        if (data.section === 'body') {
          data.cell.styles.fillColor = [255, 235, 235];
          data.cell.styles.textColor = [160, 0, 0];
        }
      }
    },
    didDrawPage: (data) => {
      // Rodapé em todas as páginas
      const totalPagesExp = '{total_pages_count_string}';
      const pageStr = `Página ${data.pageNumber}`;
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 120, 120);

      doc.text(
        'MCA • Sistema de Monitoramento e Controle das Atividades • DS Industrial',
        margin,
        pageHeight - 6
      );
      doc.text(pageStr, pageWidth - margin, pageHeight - 6, { align: 'right' });
    },
  });

  // 5. CAMPOS DE ASSINATURA NA ÚLTIMA PÁGINA
  const finalY = (doc as any).lastAutoTable?.finalY || pageHeight - 35;
  let signY = finalY + 12;

  // Se não couber na página atual, adiciona uma nova página para as assinaturas
  if (signY + 16 > pageHeight - 10) {
    doc.addPage();
    signY = 30;
  }

  const signWidth = 90;
  const sign1X = margin + 20;
  const sign2X = pageWidth - margin - 20 - signWidth;

  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.3);

  doc.line(sign1X, signY, sign1X + signWidth, signY);
  doc.line(sign2X, signY, sign2X + signWidth, signY);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 40);

  doc.text(`Visto do Operador: ${collaboratorName}`, sign1X + signWidth / 2, signY + 4, {
    align: 'center',
  });
  doc.text('Visto da Liderança / Supervisão', sign2X + signWidth / 2, signY + 4, {
    align: 'center',
  });

  // 6. NOME DO ARQUIVO E DOWNLOAD DIRETO
  const safeName = collaboratorName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  const safePeriodo = (startDate || 'geral').replace(/\//g, '-');
  const fileName = `MCA_Relatorio_${safeName}_${safePeriodo}.pdf`;

  // doc.save() dispara o download imediato do arquivo .pdf sem depender do window.print() do navegador!
  doc.save(fileName);
}
