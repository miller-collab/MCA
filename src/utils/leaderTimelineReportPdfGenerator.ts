import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatarHorasMinutos } from './factoryCalculations';

export interface TimelineActivityBlock {
  id: string;
  date: string;
  collaboratorName: string;
  role: string;
  shift: string;
  activity: string;
  startTime: string;
  endTime: string; // "HH:mm:ss" ou "Em andamento"
  startMinOfDay: number; // Minutos a partir de 00:00 (pode > 1440 se cruzar meia-noite)
  endMinOfDay: number;
  durationMinutes: number;
  status: string;
  isOngoing: boolean;
  isAutoClosed: boolean;
  observation?: string;
}

export interface CollaboratorTimelineSummary {
  collaboratorName: string;
  role: string;
  shift: string;
  firstStartTime: string;
  lastEndTime: string;
  activitiesCount: number;
  totalMinutes: number;
  blocks: TimelineActivityBlock[];
}

export interface LeaderActionFormState {
  classifications: string[];
  actionText: string;
  responsible: string;
  deadline: string;
}

export interface LeaderTimelineReportPdfOptions {
  periodMode: 'DATA' | 'PERIODO';
  periodLabel: string;
  selectedCollaboratorsLabel: string;
  shiftFilterLabel: string;
  summaries: CollaboratorTimelineSummary[];
  timelineRange: { minMinute: number; maxMinute: number };
  totalActivities: number;
  totalMinutes: number;
  overallFirstStart: string;
  overallLastEnd: string;
  leaderAction: LeaderActionFormState;
}

function formatMinuteTickLabel(totalMin: number): string {
  const normalized = ((totalMin % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  const suffix = totalMin >= 1440 ? '+' : '';
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}${suffix}`;
}

/**
 * Gera e salva o Relatório Clean de Gestão (Início/Fim + Gráfico em Tons de Cinza + Ação do Líder)
 * usando estritamente tons de cinza e preto para impressão nítida e econômica.
 */
export async function generateAndSaveLeaderTimelinePdf(
  options: LeaderTimelineReportPdfOptions
): Promise<{ success: boolean; method: 'picker' | 'download' | 'cancelled'; fileName: string }> {
  const {
    periodMode,
    periodLabel,
    selectedCollaboratorsLabel,
    shiftFilterLabel,
    summaries,
    timelineRange,
    totalActivities,
    totalMinutes,
    overallFirstStart,
    overallLastEnd,
    leaderAction,
  } = options;

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

  const ensureSpace = (neededMm: number) => {
    if (currentY + neededMm > pageHeight - 14) {
      doc.addPage();
      currentY = margin;
    }
  };

  // =========================================================================
  // 1. CABEÇALHO CLEAN EM TONS DE CINZA
  // =========================================================================
  doc.setFillColor(244, 244, 245); // zinc-100
  doc.setDrawColor(63, 63, 70); // zinc-700
  doc.setLineWidth(0.35);
  doc.rect(margin, currentY, contentWidth, 18, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(24, 24, 27); // zinc-900
  doc.text('RELATÓRIO DE GESTÃO · INÍCIO E FIM DE ATIVIDADES', margin + 4, currentY + 6.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(82, 82, 91); // zinc-600
  doc.text('MCA Controle de Atividades · Acompanhamento de Execução e Encaminhamento do Líder', margin + 4, currentY + 11.5);
  doc.text(`Período: ${periodLabel}  ·  Turno: ${shiftFilterLabel}`, margin + 4, currentY + 15.5);

  const emissaoStr = `${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(39, 39, 42);
  doc.text('EMISSÃO', pageWidth - margin - 4, currentY + 6.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(82, 82, 91);
  doc.text(emissaoStr, pageWidth - margin - 4, currentY + 11, { align: 'right' });
  doc.text(`Filtro: ${selectedCollaboratorsLabel.slice(0, 32)}`, pageWidth - margin - 4, currentY + 15.5, { align: 'right' });

  currentY += 21.5;

  // =========================================================================
  // 2. FAIXA RESUMO DE INDICADORES (4 CÉLULAS EM TONS DE CINZA)
  // =========================================================================
  const kpiGap = 2.5;
  const kpiW = (contentWidth - kpiGap * 3) / 4;
  const kpiH = 14.5;

  const kpiItems = [
    {
      label: 'INICIARAM ATIVIDADES',
      value: `${summaries.length} colaborador(es)`,
      sub: selectedCollaboratorsLabel === 'Todos que iniciaram' ? 'Equipe ativa no filtro' : 'Seleção filtrada',
    },
    {
      label: 'ATIVIDADES REGISTRADAS',
      value: `${totalActivities} registro(s)`,
      sub: 'Ordenado por início',
    },
    {
      label: 'JANELA INÍCIO → FIM',
      value: `${overallFirstStart} – ${overallLastEnd}`,
      sub: '1º início ao último fim',
    },
    {
      label: 'TEMPO TOTAL APONTADO',
      value: formatarHorasMinutos(totalMinutes),
      sub: `${totalMinutes} minutos totais`,
    },
  ];

  kpiItems.forEach((item, idx) => {
    const x = margin + idx * (kpiW + kpiGap);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(161, 161, 170); // zinc-400
    doc.setLineWidth(0.25);
    doc.rect(x, currentY, kpiW, kpiH, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(113, 113, 122); // zinc-500
    doc.text(item.label, x + 3, currentY + 4.2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(24, 24, 27);
    doc.text(item.value, x + 3, currentY + 9.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(82, 82, 91);
    doc.text(item.sub, x + 3, currentY + 12.8);
  });

  currentY += kpiH + 4.5;

  // =========================================================================
  // 3. GRÁFICO VETORIAL EM TONS DE CINZA (LINHA DO TEMPO OU CARGA HORÁRIA)
  // =========================================================================
  if (summaries.length > 0) {
    // 3A. Gráfico Linha do Tempo (Início → Fim) quando Data Específica
    if (periodMode === 'DATA') {
      const rowH = 7.5;
      const headerH = 9;
      const maxVisibleRows = Math.min(summaries.length, 18);
      const chartH = headerH + maxVisibleRows * rowH + 5;

      ensureSpace(chartH + 10);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(24, 24, 27);
      doc.text('GRÁFICO DE LINHA DO TEMPO (INÍCIO → FIM POR COLABORADOR)', margin, currentY + 3.2);
      currentY += 5;

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(161, 161, 170);
      doc.setLineWidth(0.25);
      doc.rect(margin, currentY, contentWidth, chartH, 'FD');

      const labelColW = 36;
      const summaryColW = 28;
      const trackX = margin + labelColW;
      const trackW = contentWidth - labelColW - summaryColW - 3;
      const spanMin = Math.max(60, timelineRange.maxMinute - timelineRange.minMinute);

      // Grade horária vertical
      const stepMinutes = spanMin <= 480 ? 60 : 120;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      for (let m = timelineRange.minMinute; m <= timelineRange.maxMinute; m += stepMinutes) {
        const ratio = (m - timelineRange.minMinute) / spanMin;
        const xTick = trackX + ratio * trackW;
        doc.setDrawColor(228, 228, 231); // zinc-200
        doc.setLineWidth(0.18);
        doc.line(xTick, currentY + 6, xTick, currentY + headerH + maxVisibleRows * rowH);
        doc.setTextColor(113, 113, 122);
        doc.text(formatMinuteTickLabel(m), xTick, currentY + 4.5, { align: 'center' });
      }

      const grayShades: Array<[number, number, number]> = [
        [39, 39, 42],   // zinc-800
        [82, 82, 91],   // zinc-600
        [113, 113, 122],// zinc-500
        [161, 161, 170],// zinc-400
      ];

      summaries.slice(0, maxVisibleRows).forEach((col, idx) => {
        const rowY = currentY + headerH + idx * rowH;

        if (idx % 2 === 1) {
          doc.setFillColor(250, 250, 250);
          doc.rect(margin + 0.5, rowY, contentWidth - 1, rowH, 'F');
        }

        // Nome do colaborador
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.6);
        doc.setTextColor(24, 24, 27);
        const shortName = col.collaboratorName.length > 20 ? `${col.collaboratorName.slice(0, 18)}…` : col.collaboratorName;
        doc.text(shortName, margin + 2.5, rowY + 4.7);

        // Trilho de fundo fino
        doc.setFillColor(244, 244, 245);
        doc.rect(trackX, rowY + 1.8, trackW, rowH - 3.6, 'F');

        // Blocos de início → fim das atividades
        col.blocks.forEach((blk, bIdx) => {
          const clampedStart = Math.max(timelineRange.minMinute, blk.startMinOfDay);
          const clampedEnd = Math.min(timelineRange.maxMinute, Math.max(clampedStart + 4, blk.endMinOfDay));
          const xStart = trackX + ((clampedStart - timelineRange.minMinute) / spanMin) * trackW;
          const bWidth = Math.max(1.2, ((clampedEnd - clampedStart) / spanMin) * trackW);

          const [r, g, b] = grayShades[bIdx % grayShades.length];
          if (blk.isOngoing) {
            doc.setFillColor(212, 212, 216);
            doc.setDrawColor(24, 24, 27);
          } else {
            doc.setFillColor(r, g, b);
            doc.setDrawColor(24, 24, 27);
          }
          doc.setLineWidth(0.15);
          doc.rect(xStart, rowY + 1.8, bWidth, rowH - 3.6, 'FD');
        });

        // Resumo à direita (1º Início - Últ. Fim | Total)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(63, 63, 70);
        const startHHMM = col.firstStartTime.slice(0, 5);
        const endHHMM = col.lastEndTime === 'Em andamento' ? 'Ativo' : col.lastEndTime.slice(0, 5);
        doc.text(
          `${startHHMM}-${endHHMM} (${formatarHorasMinutos(col.totalMinutes)})`,
          pageWidth - margin - 2.5,
          rowY + 4.7,
          { align: 'right' }
        );
      });

      currentY += chartH + 4.5;
    } else {
      // 3B. Gráfico Comparativo de Barras Horizontais em Tons de Cinza (Período)
      const maxRows = Math.min(summaries.length, 16);
      const rowH = 6.8;
      const chartH = 7 + maxRows * rowH + 3;
      ensureSpace(chartH + 10);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(24, 24, 27);
      doc.text('GRÁFICO DE TEMPO APONTADO POR COLABORADOR (TONS DE CINZA)', margin, currentY + 3.2);
      currentY += 5;

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(161, 161, 170);
      doc.setLineWidth(0.25);
      doc.rect(margin, currentY, contentWidth, chartH, 'FD');

      const maxMins = Math.max(1, ...summaries.map((s) => s.totalMinutes));
      const labelW = 40;
      const rightInfoW = 46;
      const barAreaX = margin + labelW;
      const barAreaW = contentWidth - labelW - rightInfoW - 4;

      summaries.slice(0, maxRows).forEach((col, idx) => {
        const y = currentY + 4 + idx * rowH;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.6);
        doc.setTextColor(24, 24, 27);
        const shortName = col.collaboratorName.length > 22 ? `${col.collaboratorName.slice(0, 20)}…` : col.collaboratorName;
        doc.text(shortName, margin + 2.5, y + 4.2);

        // Fundo da barra
        doc.setFillColor(244, 244, 245);
        doc.rect(barAreaX, y + 1.3, barAreaW, rowH - 2.8, 'F');

        // Barra preenchida em tom cinza escuro
        const fillW = Math.max(1.5, (col.totalMinutes / maxMins) * barAreaW);
        const shade = idx % 2 === 0 ? 63 : 113;
        doc.setFillColor(shade, shade, shade + 6);
        doc.rect(barAreaX, y + 1.3, fillW, rowH - 2.8, 'F');

        // Rótulo impresso diretamente ao lado
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.setTextColor(39, 39, 42);
        const startHHMM = col.firstStartTime.slice(0, 5);
        const endHHMM = col.lastEndTime === 'Em andamento' ? 'Ativo' : col.lastEndTime.slice(0, 5);
        doc.text(
          `${formatarHorasMinutos(col.totalMinutes)} (${col.activitiesCount}x) · ${startHHMM}–${endHHMM}`,
          pageWidth - margin - 2.5,
          y + 4.2,
          { align: 'right' }
        );
      });

      currentY += chartH + 4.5;
    }
  }

  // =========================================================================
  // 4. TABELA DETALHADA DE INÍCIO E FIM DAS ATIVIDADES
  // =========================================================================
  ensureSpace(24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(24, 24, 27);
  doc.text('DETALHAMENTO DE ATIVIDADES INICIADAS (INÍCIO / FIM)', margin, currentY + 3);
  currentY += 4.5;

  const tableRows: Array<string[]> = [];
  summaries.forEach((col) => {
    col.blocks.forEach((b) => {
      tableRows.push([
        col.collaboratorName,
        b.date,
        b.activity,
        b.startTime.slice(0, 8),
        b.endTime === 'Em andamento' ? 'Em andamento' : b.endTime.slice(0, 8),
        b.durationMinutes > 0 ? `${b.durationMinutes} min` : (b.isOngoing ? 'Ativo' : '-'),
        b.isAutoClosed ? 'Auto-Fim' : b.status,
      ]);
    });
  });

  if (tableRows.length > 0) {
    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin, bottom: 16 },
      head: [['Colaborador', 'Data', 'Atividade', 'Início', 'Fim', 'Duração', 'Status']],
      body: tableRows,
      theme: 'grid',
      styles: {
        fontSize: 6.8,
        cellPadding: 1.4,
        textColor: [24, 24, 27],
        lineColor: [212, 212, 216],
        lineWidth: 0.15,
      },
      headStyles: {
        fillColor: [228, 228, 231],
        textColor: [24, 24, 27],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 34, fontStyle: 'bold' },
        1: { cellWidth: 19, halign: 'center' },
        2: { cellWidth: 58 },
        3: { cellWidth: 17, halign: 'center' },
        4: { cellWidth: 21, halign: 'center' },
        5: { cellWidth: 17, halign: 'right', fontStyle: 'bold' },
        6: { cellWidth: 20, halign: 'center' },
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250],
      },
    });
    currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 6 : currentY + 12;
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(113, 113, 122);
    doc.text('Nenhum colaborador iniciou atividades para o filtro selecionado.', margin, currentY + 6);
    currentY += 12;
  }

  // =========================================================================
  // 5. FORMULÁRIO DE GESTÃO: CAMPO PARA AÇÃO DO LÍDER
  // =========================================================================
  const actionBlockHeight = 46;
  ensureSpace(actionBlockHeight + 6);

  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(63, 63, 70);
  doc.setLineWidth(0.35);
  doc.rect(margin, currentY, contentWidth, actionBlockHeight, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(24, 24, 27);
  doc.text('AÇÃO DO LÍDER / ENCAMINHAMENTO DE GESTÃO', margin + 4, currentY + 5);

  // Opções de classificação com marcação [X] ou [ ]
  const allOptions = ['Alinhamento / OK', 'Orientação Verbal', 'Ajuste de Processo', 'Acompanhamento', 'Outra Ação'];
  const selectedClasses = leaderAction.classifications || [];
  const checkLine = allOptions
    .map((opt) => `${selectedClasses.includes(opt) ? '[ X ]' : '[   ]'} ${opt}`)
    .join('    ');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(63, 63, 70);
  doc.text(checkLine, margin + 4, currentY + 10);

  doc.setDrawColor(212, 212, 216);
  doc.setLineWidth(0.2);
  doc.line(margin + 4, currentY + 12, pageWidth - margin - 4, currentY + 12);

  // Texto digitado pelo líder OU linhas pautadas para preenchimento à mão
  const trimmedAction = (leaderAction.actionText || '').trim();
  if (trimmedAction) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(24, 24, 27);
    const wrapped = doc.splitTextToSize(trimmedAction, contentWidth - 10).slice(0, 4);
    doc.text(wrapped, margin + 4, currentY + 16.5);
  } else {
    doc.setDrawColor(180, 180, 188);
    doc.setLineWidth(0.2);
    [18, 23, 28, 33].forEach((offset) => {
      doc.line(margin + 4, currentY + offset, pageWidth - margin - 4, currentY + offset);
    });
  }

  // Rodapé do formulário: Responsável, Prazo e Assinatura
  const footerLineY = currentY + 41;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(63, 63, 70);
  doc.text(`Responsável: ${leaderAction.responsible || '_________________________'}`, margin + 4, footerLineY);
  doc.text(`Prazo: ${leaderAction.deadline || '____/____/______'}`, margin + 78, footerLineY);

  doc.setDrawColor(63, 63, 70);
  doc.line(pageWidth - margin - 62, footerLineY - 2.5, pageWidth - margin - 4, footerLineY - 2.5);
  doc.setFontSize(6.5);
  doc.text('Visto / Assinatura do Líder', pageWidth - margin - 33, footerLineY + 1.5, { align: 'center' });

  // =========================================================================
  // 6. NUMERAÇÃO DE PÁGINAS
  // =========================================================================
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(113, 113, 122);
    doc.text(
      `Página ${i} de ${totalPages} · Relatório de Gestão Início/Fim · MCA Sistema MES`,
      pageWidth / 2,
      pageHeight - 5,
      { align: 'center' }
    );
  }

  const safeDate = new Date().toISOString().slice(0, 10);
  const fileName = `Relatorio_Gestao_Inicio_Fim_MCA_${safeDate}.pdf`;
  const pdfBlob = doc.output('blob');

  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: 'Documento PDF (*.pdf)',
            accept: { 'application/pdf': ['.pdf'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(pdfBlob);
      await writable.close();
      return { success: true, method: 'picker', fileName };
    } catch (pickerErr: any) {
      if (pickerErr?.name === 'AbortError') {
        return { success: false, method: 'cancelled', fileName };
      }
    }
  }

  try {
    doc.save(fileName);
    return { success: true, method: 'download', fileName };
  } catch {
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
