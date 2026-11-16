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
  type Unsubscribe,
} from '@angular/fire/firestore';

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  isPublished: boolean;
  publishAt: Date | null;
  updatedAt: Date | null;
}

export interface AnnouncementInput {
  title: string;
  body: string;
  isPublished: boolean;
}

export interface FaqRow {
  id: string;
  question: string;
  answer: string;
  category: string;
  order: number;
  isPublished: boolean;
  contactAuthority: string;
  contactEmail: string;
  contactPhone: string;
  updatedAt: Date | null;
}

export interface FaqInput {
  question: string;
  answer: string;
  category: string;
  order: number;
  isPublished: boolean;
  contactAuthority: string;
  contactEmail: string;
  contactPhone: string;
}

@Injectable({ providedIn: 'root' })
export class AdminContentService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  readonly announcements = signal<AnnouncementRow[]>([]);
  readonly faqs = signal<FaqRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  private unsubscribers: Unsubscribe[] = [];
  private readonly failures = new Map<string, string>();
  private loaded = new Set<string>();

  /** Real-time listeners for both collections. Pass a DestroyRef to stop them automatically. */
  watch(destroyRef?: DestroyRef): void {
    this.stop();
    this.failures.clear();
    this.loaded = new Set();
    this.loading.set(true);

    this.unsubscribers.push(
      this.listen('announcements', docs => {
        const rows = docs.map(({ id, data }) => this.toAnnouncement(id, data));
        rows.sort((left, right) => this.time(right.publishAt ?? right.updatedAt) - this.time(left.publishAt ?? left.updatedAt));
        this.announcements.set(rows);
      }),
    );

    this.unsubscribers.push(
      this.listen('faqs', docs => {
        const rows = docs.map(({ id, data }) => this.toFaq(id, data));
        rows.sort((left, right) => left.order - right.order || left.question.localeCompare(right.question));
        this.faqs.set(rows);
      }),
    );

    destroyRef?.onDestroy(() => this.stop());
  }

  stop(): void {
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.unsubscribers = [];
  }

  // ---- Announcements ----

  async createAnnouncement(input: AnnouncementInput): Promise<void> {
    await addDoc(collection(this.firestore, 'announcements'), {
      title: input.title,
      body: input.body,
      isPublished: input.isPublished,
      publishAt: input.isPublished ? serverTimestamp() : null,
      createdBy: this.auth.currentUser?.uid ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async updateAnnouncement(row: AnnouncementRow, input: AnnouncementInput): Promise<void> {
    const changes: Record<string, unknown> = {
      title: input.title,
      body: input.body,
      isPublished: input.isPublished,
      updatedAt: serverTimestamp(),
    };
    if (input.isPublished && !row.publishAt) {
      changes['publishAt'] = serverTimestamp();
    }
    await updateDoc(doc(this.firestore, 'announcements', row.id), changes);
  }

  async setAnnouncementPublished(row: AnnouncementRow, isPublished: boolean): Promise<void> {
    const changes: Record<string, unknown> = { isPublished, updatedAt: serverTimestamp() };
    if (isPublished && !row.publishAt) {
      changes['publishAt'] = serverTimestamp();
    }
    await updateDoc(doc(this.firestore, 'announcements', row.id), changes);
  }

  async deleteAnnouncement(row: AnnouncementRow): Promise<void> {
    await deleteDoc(doc(this.firestore, 'announcements', row.id));
  }

  // ---- FAQs ----

  async createFaq(input: FaqInput): Promise<void> {
    await addDoc(collection(this.firestore, 'faqs'), {
      ...this.faqFields(input),
      createdBy: this.auth.currentUser?.uid ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async updateFaq(row: FaqRow, input: FaqInput): Promise<void> {
    await updateDoc(doc(this.firestore, 'faqs', row.id), {
      ...this.faqFields(input),
      updatedAt: serverTimestamp(),
    });
  }

  async setFaqPublished(row: FaqRow, isPublished: boolean): Promise<void> {
    await updateDoc(doc(this.firestore, 'faqs', row.id), { isPublished, updatedAt: serverTimestamp() });
  }

  async deleteFaq(row: FaqRow): Promise<void> {
    await deleteDoc(doc(this.firestore, 'faqs', row.id));
  }

  // ---- Internals ----

  private listen(
    name: string,
    apply: (docs: Array<{ id: string; data: DocumentData }>) => void,
  ): Unsubscribe {
    return onSnapshot(
      collection(this.firestore, name),
      snap => {
        apply(snap.docs.map(document => ({ id: document.id, data: document.data() })));
        this.failures.delete(name);
        this.loaded.add(name);
        this.publishState();
      },
      error => {
        console.error(`[AdminContentService] could not read "${name}"`, error);
        this.failures.set(name, error.code);
        this.loaded.add(name);
        this.publishState();
      },
    );
  }

  private publishState(): void {
    this.error.set(
      this.failures.size
        ? `Could not read: ${[...this.failures.entries()].map(([name, code]) => `${name} (${code})`).join(', ')}`
        : null,
    );
    if (this.loaded.size >= 2) {
      this.loading.set(false);
    }
  }

  private faqFields(input: FaqInput): Record<string, unknown> {
    const hasContact = input.contactAuthority || input.contactEmail || input.contactPhone;
    return {
      question: input.question,
      answer: input.answer,
      category: input.category,
      order: input.order,
      isPublished: input.isPublished,
      contact: hasContact
        ? { authority: input.contactAuthority, email: input.contactEmail, phone: input.contactPhone }
        : null,
    };
  }

  private toAnnouncement(id: string, data: DocumentData): AnnouncementRow {
    return {
      id,
      title: (data['title'] ?? 'Untitled announcement') as string,
      body: (data['body'] ?? '') as string,
      isPublished: data['isPublished'] === true,
      publishAt: this.toDate(data['publishAt']),
      updatedAt: this.toDate(data['updatedAt'] ?? data['createdAt']),
    };
  }

  private toFaq(id: string, data: DocumentData): FaqRow {
    const contact = (data['contact'] ?? {}) as Record<string, unknown>;
    const order = Number(data['order']);
    return {
      id,
      question: (data['question'] ?? 'Untitled question') as string,
      answer: (data['answer'] ?? '') as string,
      category: (data['category'] ?? 'General') as string,
      order: Number.isFinite(order) ? order : 0,
      isPublished: data['isPublished'] !== false,
      contactAuthority: (contact['authority'] ?? '') as string,
      contactEmail: (contact['email'] ?? '') as string,
      contactPhone: (contact['phone'] ?? '') as string,
      updatedAt: this.toDate(data['updatedAt'] ?? data['createdAt']),
    };
  }

  private time(date: Date | null): number {
    return date ? date.getTime() : 0;
  }

  private toDate(value: unknown): Date | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return value;
    }
    const withToDate = value as { toDate?: () => Date };
    if (typeof withToDate.toDate === 'function') {
      return withToDate.toDate();
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }
}
