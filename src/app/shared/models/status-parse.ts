import { type IdeaStatus, isIdeaStatus } from '../workflow/idea-workflow';

/**
 * Ideas saved before the new stages existed. Mapped on read so old data never crashes the app.
 * A Map (not a plain object) so inherited keys like "constructor" can never match.
 */
const LEGACY_STATUS: ReadonlyMap<string, IdeaStatus> = new Map<string, IdeaStatus>([
  ['under-review', 'human_review'],
  ['needs-revision', 'needs_amendment'],
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
