import { type IdeaStatus, isIdeaStatus } from '../workflow/idea-workflow';

/**
 * Ideas saved before the new stages existed. Mapped on read so old data never crashes the app.
 * A Map (not a plain object) so inherited keys like "constructor" can never match.
 */
const LEGACY_STATUS: ReadonlyMap<string, IdeaStatus> = new Map<string, IdeaStatus>([
  ['draft', 'submitted'],
  ['under-review', 'human_review'],
  ['under_review', 'human_review'],
  ['needs-revision', 'needs_amendment'],
  ['needs_revision', 'needs_amendment'],
  ['feedback_requested', 'needs_amendment'],
  ['revised', 'ai_screening'],
  ['accepted', 'approved'],
  ['declined', 'rejected'],
]);

export function requireIdeaStatus(value: unknown): IdeaStatus {
  if (isIdeaStatus(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const mapped = LEGACY_STATUS.get(value);
    if (mapped) {
      return mapped;
    }
  }

  throw new Error('The Firestore idea status value is invalid.');
}
