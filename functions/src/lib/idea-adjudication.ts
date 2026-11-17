export type AdjudicationDecision = 'advance' | 'reject' | 'revise';
export type AdjudicationRole = 'adjudicator' | 'admin';
export type AdjudicationTargetStatus = 'approved' | 'rejected' | 'needs_amendment';

export interface RecordAdjudicationInput {
  readonly ideaId: string;
  readonly decision: AdjudicationDecision;
  readonly note: string;
}

export interface AwardIdeaInput {
  readonly ideaId: string;
  readonly title: string;
  readonly type: string;
  readonly citation: string;
  readonly isPublic: boolean;
}

export function isAdjudicationRole(value: unknown): value is AdjudicationRole {
  return value === 'adjudicator' || value === 'admin';
}

export function parseRecordAdjudicationInput(value: unknown): RecordAdjudicationInput {
  const input = requireRecord(value, 'adjudication');
  requireOnlyKeys(input, ['ideaId', 'decision', 'note']);
  const ideaId = requireIdeaId(input['ideaId']);
  const decision = input['decision'];
  const rawNote = input['note'];
  if (typeof rawNote !== 'string' || rawNote.length > 500) {
    throw new Error('The note is invalid.');
  }
  const note = rawNote.trim();
  if (decision !== 'advance' && decision !== 'reject' && decision !== 'revise') {
    throw new Error('The adjudication decision is invalid.');
  }
  if (!note) {
    throw new Error('An adjudication note is required.');
  }
  return { ideaId, decision, note };
}

export function adjudicationTargetStatus(decision: AdjudicationDecision): AdjudicationTargetStatus {
  switch (decision) {
    case 'advance':
      return 'approved';
    case 'reject':
      return 'rejected';
    case 'revise':
      return 'needs_amendment';
  }
}

export function parseAwardIdeaInput(value: unknown): AwardIdeaInput {
  const input = requireRecord(value, 'award');
  requireOnlyKeys(input, ['ideaId', 'title', 'type', 'citation', 'isPublic']);
  const ideaId = requireIdeaId(input['ideaId']);
  const title = requireBoundedString(input['title'], 'title', 120);
  const type = requireBoundedString(input['type'], 'type', 80);
  const citation = requireBoundedString(input['citation'], 'citation', 2000);
  if (typeof input['isPublic'] !== 'boolean') {
    throw new Error('The award visibility is invalid.');
  }
  return {
    ideaId,
    title: title.trim(),
    type: type.trim(),
    citation: citation.trim(),
    isPublic: input['isPublic'],
  };
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`The ${name} input is invalid.`);
  }
  return value as Record<string, unknown>;
}

function requireBoundedString(value: unknown, name: string, maximum: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximum) {
    throw new Error(`The ${name} is invalid.`);
  }
  return value;
}

function requireIdeaId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error('The ideaId is invalid.');
  }
  return value;
}

function requireOnlyKeys(input: Record<string, unknown>, allowedKeys: readonly string[]): void {
  if (Object.keys(input).some((key) => !allowedKeys.includes(key))) {
    throw new Error('The request contains unsupported fields.');
  }
}
