export interface IdeaAttachment {
  id: string;
  name: string;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
}

export const MAX_IDEA_ATTACHMENTS = 5;
export const MAX_IDEA_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const IDEA_ATTACHMENT_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

const IDEA_ATTACHMENT_CONTENT_TYPE_SET: ReadonlySet<string> = new Set(IDEA_ATTACHMENT_CONTENT_TYPES);

export function isIdeaAttachmentContentType(
  value: unknown,
): value is (typeof IDEA_ATTACHMENT_CONTENT_TYPES)[number] {
  return typeof value === 'string' && IDEA_ATTACHMENT_CONTENT_TYPE_SET.has(value);
}

export function isIdeaAttachmentPath(
  value: unknown,
  ownerId: string,
  ideaId: string,
  attachmentId: string,
): value is string {
  if (typeof value !== 'string') return false;
  const parts = value.split('/');
  return (
    parts.length === 7 &&
    parts[0] === 'users' &&
    parts[1] === ownerId &&
    /^[a-z0-9-]{1,80}$/.test(parts[2]) &&
    parts[3] === 'ideas' &&
    parts[4] === ideaId &&
    parts[5] === 'images' &&
    parts[6].startsWith(`${attachmentId}.`) &&
    /^[a-z0-9]{2,5}$/.test(parts[6].slice(attachmentId.length + 1))
  );
}
