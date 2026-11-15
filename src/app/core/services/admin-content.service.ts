import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  Firestore,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type FirestoreError,
  type Unsubscribe,
} from '@angular/fire/firestore';

export type ContentKind = 'announcement' | 'faq';
export type ContentStatus = 'published' | 'draft';

export interface AdminContentEntry {
  id: string;
  kind: ContentKind;
  kindLabel: 'Announcement' | 'FAQ';
  /** Announcement title, or the FAQ question. */
  title: string;
  /** Announcement text, or the FAQ answer. */
  body: string;
  /** Shortened body for list cards. */
  preview: string;
  status: ContentStatus;
  statusLabel: 'Published' | 'Draft';
  updated: string;
  updatedBy: string;
}

export interface ContentDraft {
  kind: ContentKind;
  title: string;
  body: string;
  status: ContentStatus;
}

/** Firestore collection for each kind of content (see the database schema). */
const COLLECTION_BY_KIND: Record<ContentKind, string> = {
  announcement: 'announcements',
  faq: 'faqs',
};

export const CONTENT_TITLE_MAX = 150;
export const CONTENT_BODY_MAX = 5000;
const PREVIEW_LENGTH = 180;

interface Row {
  entry: AdminContentEntry;
  time: number;
}

@Injectable({ providedIn: 'root' })
export class AdminContentService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth, { optional: true });

  // ---- Live content (announcements + FAQs together, newest first) ----
  readonly entries = signal<AdminContentEntry[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  // ---- Action state ----
  readonly saving = signal(false);
  readonly actionError = signal<string | null>(null);
  /** Id of the entry being published, unpublished or deleted, or null. */
  readonly busyId = signal<string | null>(null);

  private unsubscribers: Unsubscribe[] = [];

  startLive(destroyRef?: DestroyRef): void {
    this.stopLive();
    this.loading.set(true);
    this.error.set(null);

    let announcements: Row[] = [];
    let faqs: Row[] = [];
    const received = new Set<ContentKind>();

    const publish = (kind: ContentKind): void => {
      received.add(kind);
      this.entries.set(
        [...announcements, ...faqs].sort((left, right) => right.time - left.time).map(row => row.entry),
      );
      this.error.set(null);
      if (received.size === 2) {
        this.loading.set(false);
      }
    };

    (Object.keys(COLLECTION_BY_KIND) as ContentKind[]).forEach(kind => {
      const name = COLLECTION_BY_KIND[kind];
      this.unsubscribers.push(
        onSnapshot(
          collection(this.firestore, name),
          snap => {
            const rows = snap.docs.map(document => this.toRow(kind, document.id, document.data()));
            if (kind === 'announcement') {
              announcements = rows;
            } else {
              faqs = rows;
            }
            publish(kind);
          },
          (error: FirestoreError) => {
            console.error(`[AdminContentService] could not read "${name}" (${error.code})`, error);
            this.error.set(`Could not load ${name} (${error.code}).`);
            this.loading.set(false);
          },
        ),
      );
    });

    destroyRef?.onDestroy(() => this.stopLive());
  }

  stopLive(): void {
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.unsubscribers = [];
  }

  /** Returns a human-readable problem with the draft, or null when it can be saved. */
  validate(draft: ContentDraft): string | null {
    const isFaq = draft.kind === 'faq';
    const title = draft.title.trim();
    const body = draft.body.trim();

    if (!title) {
      return isFaq ? 'Enter the question.' : 'Enter a title for the announcement.';
    }
    if (title.length > CONTENT_TITLE_MAX) {
      return `The ${isFaq ? 'question' : 'title'} must be ${CONTENT_TITLE_MAX} characters or fewer.`;
    }
    if (!body) {
      return isFaq ? 'Enter the answer.' : 'Enter the announcement text.';
    }
    if (body.length > CONTENT_BODY_MAX) {
      return `The ${isFaq ? 'answer' : 'text'} must be ${CONTENT_BODY_MAX} characters or fewer.`;
    }
    return null;
  }

  /** Creates a new entry, or updates `existing`. Resolves true on success. */
  async save(draft: ContentDraft, existing: AdminContentEntry | null): Promise<boolean> {
    const problem = this.validate(draft);
    if (problem) {
      this.actionError.set(problem);
      return false;
    }

    const kind = existing?.kind ?? draft.kind;
    const title = draft.title.trim();
    const body = draft.body.trim();
    const fields = kind === 'faq' ? { question: title, answer: body } : { title, body };
    const actor = this.actor();
    const becomesPublished = draft.status === 'published' && existing?.status !== 'published';

    this.saving.set(true);
    this.actionError.set(null);

    try {
      if (existing) {
        await updateDoc(doc(this.firestore, COLLECTION_BY_KIND[kind], existing.id), {
          ...fields,
          status: draft.status,
          updatedAt: serverTimestamp(),
          updatedBy: actor,
          ...(becomesPublished ? { publishedAt: serverTimestamp() } : {}),
        });
      } else {
        await addDoc(collection(this.firestore, COLLECTION_BY_KIND[kind]), {
          ...fields,
          status: draft.status,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: actor,
          updatedBy: actor,
          ...(becomesPublished ? { publishedAt: serverTimestamp() } : {}),
        });
      }
      return true;
    } catch (error) {
      console.error('[AdminContentService] save failed', error);
      this.actionError.set(this.describeError(error, 'save'));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  /** Publishes a draft or moves a published entry back to draft. */
  async setStatus(entry: AdminContentEntry, status: ContentStatus): Promise<boolean> {
    this.busyId.set(entry.id);
    this.actionError.set(null);

    try {
      await updateDoc(doc(this.firestore, COLLECTION_BY_KIND[entry.kind], entry.id), {
        status,
        updatedAt: serverTimestamp(),
        updatedBy: this.actor(),
        ...(status === 'published' ? { publishedAt: serverTimestamp() } : {}),
      });
      return true;
    } catch (error) {
      console.error('[AdminContentService] status change failed', error);
      this.actionError.set(this.describeError(error, 'update'));
      return false;
    } finally {
      this.busyId.set(null);
    }
  }

  async remove(entry: AdminContentEntry): Promise<boolean> {
    this.busyId.set(entry.id);
    this.actionError.set(null);

    try {
      await deleteDoc(doc(this.firestore, COLLECTION_BY_KIND[entry.kind], entry.id));
      return true;
    } catch (error) {
      console.error('[AdminContentService] delete failed', error);
      this.actionError.set(this.describeError(error, 'delete'));
      return false;
    } finally {
      this.busyId.set(null);
    }
  }

  // ---- Helpers ----

  private toRow(kind: ContentKind, id: string, data: DocumentData): Row {
    const isFaq = kind === 'faq';
    const title = String(
      (isFaq ? data['question'] ?? data['title'] : data['title'] ?? data['question']) ?? 'Untitled',
    );
    const body = String((isFaq ? data['answer'] ?? data['body'] : data['body'] ?? data['message']) ?? '');
    // Content without a status (older documents) counts as published.
    const isDraft = data['status'] === 'draft' || data['published'] === false;
    const changed = data['updatedAt'] ?? data['createdAt'];

    return {
      entry: {
        id,
        kind,
        kindLabel: isFaq ? 'FAQ' : 'Announcement',
        title,
        body,
        preview: body.length > PREVIEW_LENGTH ? `${body.slice(0, PREVIEW_LENGTH).trimEnd()}…` : body,
        status: isDraft ? 'draft' : 'published',
        statusLabel: isDraft ? 'Draft' : 'Published',
        updated: this.formatDate(changed),
        updatedBy: String(data['updatedBy'] ?? data['createdBy'] ?? 'Unknown'),
      },
      time: this.toMillis(changed),
    };
  }

  private actor(): string {
    return this.auth?.currentUser?.email ?? this.auth?.currentUser?.uid ?? 'Unknown';
  }

  private toMillis(value: unknown): number {
    const withToDate = value as { toDate?: () => Date } | null;
    // A timestamp that is still being confirmed by the server is null: treat it as newest.
    return withToDate && typeof withToDate.toDate === 'function' ? withToDate.toDate().getTime() : Date.now();
  }

  private formatDate(value: unknown): string {
    const withToDate = value as { toDate?: () => Date } | null;
    if (!withToDate || typeof withToDate.toDate !== 'function') {
      return 'just now';
    }
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
      withToDate.toDate(),
    );
  }

  private describeError(error: unknown, action: string): string {
    const code = (error as { code?: string } | null)?.code ?? '';
    if (code === 'permission-denied') {
      return `You do not have permission to ${action} content.`;
    }
    return `Could not ${action} the content${code ? ` (${code})` : ''}.`;
  }
}
