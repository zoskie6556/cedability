import { describe, expect, it } from 'vitest';
import { MAX_IDEA_ATTACHMENT_BYTES } from '../../../shared/models/idea-attachment.model';
import { attachmentErrorFor, attachmentTypeFor } from '../../../shared/models/idea-attachment-policy';

function makeFile(name: string, type: string, size = 10): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('idea attachment policy', () => {
  it('recognizes common image and office document types for clear file labels', () => {
    expect(attachmentTypeFor('plan.PDF')?.category).toBe('PDF');
    expect(attachmentTypeFor('sketch.png')?.category).toBe('Image');
    expect(attachmentTypeFor('budget.xlsx')?.category).toBe('Spreadsheet');
    expect(attachmentTypeFor('pitch.pptx')?.category).toBe('Presentation');
  });

  it('rejects unknown extensions, mismatched MIME types, empty files, and files over the limit', () => {
    expect(attachmentErrorFor(makeFile('notes.exe', 'application/octet-stream'))).toContain('Choose');
    expect(attachmentErrorFor(makeFile('notes.pdf', 'text/plain'))).toContain('Choose');
    expect(attachmentErrorFor(makeFile('empty.pdf', 'application/pdf', 0))).toContain('empty');
    expect(
      attachmentErrorFor(makeFile('large.pdf', 'application/pdf', MAX_IDEA_ATTACHMENT_BYTES + 1)),
    ).toContain('10 MB');
    expect(attachmentErrorFor(makeFile('valid.pdf', 'application/pdf'))).toBeNull();
  });
});
