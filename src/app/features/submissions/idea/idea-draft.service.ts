import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/** What we keep in the draft: the form values (never the consent tick). */
export interface DraftAttachmentMeta {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

export interface IdeaDraft {
  version: 1;
  savedAt: number;
  value: Record<string, unknown>;
  attachments?: DraftAttachmentMeta[];
}

/**
 * Keeps an unfinished idea on THIS device so a refresh, a dropped connection or a
 * closed tab does not lose the user's work. It is a convenience only: nothing is sent
 * to a server, and every storage call is wrapped because browsers can block storage
 * (private windows, full disk) and must never break the form.
 * Upgrade path: move to users/{uid}/drafts in Firestore so drafts follow the user across devices.
 */
@Injectable({ providedIn: 'root' })
export class IdeaDraftService {
  private readonly storage = this.findStorage();

  load(uid: string): IdeaDraft | null {
    try {
      const raw = this.storage?.getItem(this.key(uid));
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isDraft(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  save(
    uid: string,
    value: Record<string, unknown>,
    savedAt: number,
    attachments: DraftAttachmentMeta[] = [],
  ): void {
    try {
      const draft: IdeaDraft = { version: 1, savedAt, value, attachments };
      this.storage?.setItem(this.key(uid), JSON.stringify(draft));
    } catch {
      // Storage unavailable or full: the form still works, it just cannot autosave.
    }
  }

  clear(uid: string): void {
    try {
      this.storage?.removeItem(this.key(uid));
    } catch {
      // Nothing to do.
    }
  }

  private key(uid: string): string {
    return `cedability.ideaDraft.${uid}`;
  }

  private findStorage(): Storage | null {
    try {
      return inject(DOCUMENT).defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }
}

function isDraft(value: unknown): value is IdeaDraft {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate['version'] === 1 &&
    typeof candidate['savedAt'] === 'number' &&
    typeof candidate['value'] === 'object' &&
    candidate['value'] !== null
  );
}
