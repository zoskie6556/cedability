const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { summarizeChats, summarizeStageDurations } = require('../lib/stats/reporting-metrics.js');

const DAY_MS = 86_400_000;

describe('reporting statistics', () => {
  it('averages completed stage visits across status-history events', () => {
    const ideas = [
      { id: 'one', submittedAt: new Date(0), createdAt: new Date(0) },
      { id: 'two', submittedAt: new Date(0), createdAt: new Date(0) },
    ];
    const history = [
      { ideaId: 'one', from: 'submitted', to: 'ai_screening', at: new Date(DAY_MS) },
      {
        ideaId: 'one',
        from: 'ai_screening',
        to: 'human_review',
        at: new Date(4 * DAY_MS),
      },
      { ideaId: 'two', from: 'submitted', to: 'ai_screening', at: new Date(2 * DAY_MS) },
    ];

    const result = summarizeStageDurations(ideas, history);

    assert.equal(result.avgDaysPerStage['submitted'], 1.5);
    assert.equal(result.avgDaysPerStage['ai_screening'], 3);
    assert.equal(result.stageVisitCounts['submitted'], 2);
  });

  it('summarizes chat status, response time, UTC hour, and the rolling 30-day daily counts', () => {
    const now = new Date('2026-02-01T12:00:00.000Z');
    const result = summarizeChats(
      [
        {
          status: 'closed',
          startedAt: new Date('2026-01-31T22:00:00.000Z'),
          firstResponseAt: new Date('2026-01-31T22:00:30.000Z'),
        },
        {
          status: 'active',
          startedAt: new Date('2026-01-31T12:00:00.000Z'),
          firstResponseAt: null,
        },
        {
          status: 'offline_message',
          startedAt: new Date('2025-12-01T10:00:00.000Z'),
          firstResponseAt: null,
        },
      ],
      now,
    );

    assert.equal(result.totalChats, 3);
    assert.equal(result.byStatus.closed, 1);
    assert.equal(result.resolutionRate, 1 / 3);
    assert.equal(result.avgFirstResponseSeconds, 30);
    assert.equal(result.chatsByHour[22], 1);
    assert.equal(result.chatsPerDay['2026-01-31'], 2);
    assert.equal(result.chatsPerDay['2025-12-01'], undefined);
  });
});
