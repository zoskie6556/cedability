import type { DownloadableIdeaReport } from '../../core/services/reporting.service';

export function toCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

export function ideaReportCsv(report: DownloadableIdeaReport): string {
  const rows: unknown[][] = [
    ['CEDAbility idea report'],
    ['Idea ID', report.ideaId],
    ['Title', report.title],
    ['Category', report.category],
    ['Current status', report.status],
    [],
    ['Automated review (advisory)'],
    ['Field', 'Value'],
  ];

  for (const [field, value] of Object.entries(report.automatedReview ?? {})) {
    rows.push([field, csvValue(value)]);
  }

  rows.push(
    [],
    ['Evaluator feedback'],
    ['Stage', 'Feedback', 'Requires resubmission', 'Reply', 'Created at'],
  );
  for (const item of report.feedback) {
    rows.push([
      item.stageId,
      item.message,
      item.requiresResubmission ? 'Yes' : 'No',
      item.reply?.message ?? '',
      item.createdAt ?? '',
    ]);
  }

  rows.push([], ['Status history'], ['From', 'To', 'Stage', 'Changed by role', 'Note', 'At']);
  for (const item of report.statusHistory) {
    rows.push([
      item.from,
      item.to,
      item.stageId ?? '',
      item.byRole,
      item.note ?? '',
      item.at ?? '',
    ]);
  }

  return toCsv(rows);
}

function escapeCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function csvValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? '';
}
