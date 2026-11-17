import { describe, expect, it } from 'vitest';
import { ideaReportCsv, toCsv } from './report-export';

describe('report CSV exports', () => {
  it('quotes values and neutralizes spreadsheet formulas', () => {
    expect(toCsv([['=HYPERLINK("https://example.test")', 'hello, "world"']])).toBe(
      '"\'=HYPERLINK(""https://example.test"")","hello, ""world"""',
    );
  });

  it('includes automated review, feedback, and status history in an idea report', () => {
    const csv = ideaReportCsv({
      ideaId: 'idea-1',
      title: 'Market garden',
      category: 'agriculture',
      status: 'human_review',
      automatedReview: { summary: 'Advisory findings' },
      feedback: [
        {
          stageId: 'technical',
          message: 'Clarify the equipment plan.',
          requiresResubmission: true,
          reply: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      statusHistory: [
        {
          from: 'submitted',
          to: 'ai_screening',
          stageId: null,
          byRole: 'system',
          note: null,
          at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    expect(csv).toContain('"Automated review (advisory)"');
    expect(csv).toContain('"Clarify the equipment plan."');
    expect(csv).toContain('"submitted","ai_screening"');
  });
});
