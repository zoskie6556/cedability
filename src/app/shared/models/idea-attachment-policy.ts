import {
  IDEA_ATTACHMENT_CONTENT_TYPES,
  MAX_IDEA_ATTACHMENT_BYTES,
} from './idea-attachment.model';

const TYPES_BY_EXTENSION: Readonly<Record<string, {
  contentType: (typeof IDEA_ATTACHMENT_CONTENT_TYPES)[number];
  label: string;
  category: 'Image' | 'PDF' | 'Document' | 'Spreadsheet' | 'Presentation' | 'Text';
}>> = {
  jpg: { contentType: 'image/jpeg', label: 'JPEG image', category: 'Image' },
  jpeg: { contentType: 'image/jpeg', label: 'JPEG image', category: 'Image' },
  png: { contentType: 'image/png', label: 'PNG image', category: 'Image' },
  webp: { contentType: 'image/webp', label: 'WebP image', category: 'Image' },
  gif: { contentType: 'image/gif', label: 'GIF image', category: 'Image' },
  pdf: { contentType: 'application/pdf', label: 'PDF document', category: 'PDF' },
  txt: { contentType: 'text/plain', label: 'Text document', category: 'Text' },
  csv: { contentType: 'text/csv', label: 'CSV spreadsheet', category: 'Spreadsheet' },
  doc: { contentType: 'application/msword', label: 'Word document', category: 'Document' },
  docx: {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    label: 'Word document',
    category: 'Document',
  },
  xls: { contentType: 'application/vnd.ms-excel', label: 'Excel spreadsheet', category: 'Spreadsheet' },
  xlsx: {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    label: 'Excel spreadsheet',
    category: 'Spreadsheet',
  },
  ppt: { contentType: 'application/vnd.ms-powerpoint', label: 'PowerPoint presentation', category: 'Presentation' },
  pptx: {
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    label: 'PowerPoint presentation',
    category: 'Presentation',
  },
};

const ACCEPTED_MIME_TYPES = new Set<string>(IDEA_ATTACHMENT_CONTENT_TYPES);

export interface AttachmentType {
  contentType: (typeof IDEA_ATTACHMENT_CONTENT_TYPES)[number];
  label: string;
  category: 'Image' | 'PDF' | 'Document' | 'Spreadsheet' | 'Presentation' | 'Text';
}

export function attachmentTypeFor(fileName: string): AttachmentType | null {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension ? TYPES_BY_EXTENSION[extension] ?? null : null;
}

export function attachmentErrorFor(file: File): string | null {
  const type = attachmentTypeFor(file.name);
  if (!type || (file.type && (!ACCEPTED_MIME_TYPES.has(file.type) || file.type !== type.contentType))) {
    return 'Choose a PDF, image, Word, Excel, PowerPoint, CSV, or text file.';
  }
  if (file.size === 0) return 'This file is empty. Choose another file.';
  if (file.size > MAX_IDEA_ATTACHMENT_BYTES) return 'Each file must be 10 MB or smaller.';
  return null;
}

export function attachmentAcceptTypes(): string {
  return Object.keys(TYPES_BY_EXTENSION).map((extension) => `.${extension}`).join(',');
}
