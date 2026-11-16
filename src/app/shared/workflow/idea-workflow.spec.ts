import { describe, expect, it } from 'vitest';
import {
  IDEA_STATUSES,
  STAGES,
  TRANSITIONS,
  allowedNextStatuses,
  canTransition,
  processingMessage,
  type IdeaStatus,
  type WorkflowActor,
} from './idea-workflow';

describe('idea workflow', () => {
  it('has stage info and a transition row for every status', () => {
    for (const status of IDEA_STATUSES) {
      expect(STAGES[status]).toBeDefined();
      expect(TRANSITIONS[status]).toBeDefined();
      for (const target of Object.keys(TRANSITIONS[status])) {
        expect(IDEA_STATUSES as readonly string[]).toContain(target);
      }
    }
  });

  const happyPath: [IdeaStatus, IdeaStatus, WorkflowActor][] = [
    ['submitted', 'ai_screening', 'system'],
    ['ai_screening', 'ceda_criteria', 'system'],
    ['ceda_criteria', 'human_review', 'system'],
    ['human_review', 'adjudication', 'evaluator'],
    ['adjudication', 'approved', 'adjudicator'],
    ['approved', 'awarded', 'admin'],
  ];

  it.each(happyPath)('allows %s -> %s for %s and progress increases', (from, to, actor) => {
    expect(canTransition(from, to, actor)).toBe(true);
    expect(STAGES[to].progress!).toBeGreaterThan(STAGES[from].progress!);
  });

  it('lets the owner resubmit after feedback, but not self-advance', () => {
    expect(canTransition('needs_amendment', 'ai_screening', 'owner')).toBe(true);
    expect(canTransition('human_review', 'adjudication', 'owner')).toBe(false);
  });

  it('only adjudicators or admins approve', () => {
    expect(canTransition('adjudication', 'approved', 'evaluator')).toBe(false);
  });

  it('never leaves a terminal stage', () => {
    expect(allowedNextStatuses('awarded', 'admin')).toEqual([]);
    expect(allowedNextStatuses('rejected', 'admin')).toEqual([]);
  });

  it('uses the agreed colours', () => {
    expect(STAGES.needs_amendment.health).toBe('yellow');
    expect(STAGES.rejected.health).toBe('red');
    expect(STAGES.human_review.health).toBe('green');
  });

  it('shows the processing message only when a stage is slow', () => {
    expect(processingMessage('ai_screening', 5 * 60_000)).toBeNull();
    expect(processingMessage('ai_screening', 11 * 60_000)).toBe('Your submission is still being processed.');
    expect(processingMessage('approved', 99 * 3_600_000)).toBeNull();
  });
});

describe('AI stays advisory', () => {
  it('never lets the system reject an idea', () => {
    for (const status of IDEA_STATUSES) {
      expect(canTransition(status, 'rejected', 'system')).toBe(false);
    }
  });
});
