import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { columnCaption, type EntityDef } from '@aqualims/shared';
import { displayValue } from './crud';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export interface ExportColumn {
  id: string;
  caption?: string;
}

function table(def: EntityDef, rows: any[], columns: ExportColumn[]) {
  const headers = columns.map((c) => c.caption ?? columnCaption(def, c.id));
  const body = rows.map((row) => columns.map((c) => displayValue(def, row, c.id)));
  return { headers, body };
}

// Spreadsheet apps run CSV cells starting with = + - @ as formulas; prefix ' unless the cell is just a number.
const neutralise = (v: string) => (/^[=+\-@\t\r]/.test(v) && !/^[+-]?[\d,]*\.?\d+$/.test(v) ? `'${v}` : v);
const csvCell = (raw: string) => {
  const v = neutralise(raw);
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

export async function buildExport(def: EntityDef, rows: any[], columns: ExportColumn[], format: ExportFormat): Promise<{ buffer: Buffer; contentType: string; extension: string }> {
  const { headers, body } = table(def, rows, columns);
  if (format === 'csv') {
    const text = [headers, ...body].map((r) => r.map(csvCell).join(',')).join('\r\n');
    return { buffer: Buffer.from('﻿' + text, 'utf8'), contentType: 'text/csv; charset=utf-8', extension: 'csv' };
  }
  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Aqua LIMS';
    const ws = wb.addWorksheet(def.listCaption.slice(0, 31));
    ws.addRow(headers).font = { bold: true };
    for (const r of body) ws.addRow(r);
    ws.columns.forEach((col, i) => {
      const longest = Math.max(headers[i].length, ...body.map((r) => (r[i] ?? '').length));
      col.width = Math.min(60, Math.max(10, longest + 2));
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { buffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' };
  }
  // PDF: simple landscape table with repeated header rows.
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const width = doc.page.width - 72;
  const colWidth = width / Math.max(1, headers.length);
  doc.fontSize(14).text(def.listCaption, { align: 'left' });
  doc.moveDown(0.5);
  const drawRow = (cells: string[], bold: boolean) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    const heights = cells.map((c) => doc.heightOfString(c || ' ', { width: colWidth - 6 }));
    const h = Math.max(...heights) + 6;
    if (doc.y + h > doc.page.height - 36) doc.addPage();
    const y = doc.y;
    cells.forEach((c, i) => doc.text(c, 36 + i * colWidth + 3, y + 3, { width: colWidth - 6 }));
    doc.moveTo(36, y + h).lineTo(36 + width, y + h).strokeColor('#D9E0E8').stroke();
    doc.x = 36;
    doc.y = y + h;
  };
  drawRow(headers, true);
  for (const r of body) {
    if (doc.y > doc.page.height - 60) {
      doc.addPage();
      drawRow(headers, true);
    }
    drawRow(r, false);
  }
  doc.end();
  return { buffer: await done, contentType: 'application/pdf', extension: 'pdf' };
}
