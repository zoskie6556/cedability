import { inject, Injectable } from '@angular/core';
import { Storage, deleteObject, ref, uploadBytes } from '@angular/fire/storage';
import type { IdeaAttachment } from '../../shared/models/idea-attachment.model';
import {
  attachmentErrorFor,
  attachmentTypeFor,
} from '../../shared/models/idea-attachment-policy';

@Injectable({ providedIn: 'root' })
export class IdeaAttachmentService {
  private readonly storage = inject(Storage);

  async upload(
    ownerId: string,
    displayName: string,
    ideaId: string,
    files: readonly File[],
  ): Promise<IdeaAttachment[]> {
    const uploaded: IdeaAttachment[] = [];
    try {
      for (const file of files) {
        const error = attachmentErrorFor(file);
        const type = attachmentTypeFor(file.name);
        if (error || !type) throw new Error(error ?? 'This file type is not supported.');

        const id = crypto.randomUUID();
        const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
        const storagePath = `users/${ownerId}/${displayNameSlug(displayName)}/ideas/${ideaId}/images/${id}.${extension}`;
        await uploadBytes(ref(this.storage, storagePath), file, { contentType: type.contentType });
        uploaded.push({
          id,
          name: file.name,
          storagePath,
          contentType: type.contentType,
          sizeBytes: file.size,
        });
      }
      return uploaded;
    } catch (error: unknown) {
      await this.deleteAfterFailure(uploaded, error);
      throw error;
    }
  }

  async remove(attachments: readonly IdeaAttachment[]): Promise<void> {
    const results = await Promise.allSettled(
      attachments.map((attachment) => deleteObject(ref(this.storage, attachment.storagePath))),
    );
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length > 0) {
      throw new Error(`Could not remove ${failures.length} uploaded attachment(s).`);
    }
  }

  private async deleteAfterFailure(
    attachments: readonly IdeaAttachment[],
    originalError: unknown,
  ): Promise<void> {
    if (attachments.length === 0) return;
    try {
      await this.remove(attachments);
    } catch (cleanupError: unknown) {
      console.error('Could not clean up partially uploaded idea attachments', {
        originalError,
        cleanupError,
      });
    }
  }
}

function displayNameSlug(displayName: string): string {
  const slug = displayName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return slug || 'submitter';
}
