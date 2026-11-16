import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  addDoc,
  collection,
  Firestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type DocumentData,
  type Unsubscribe,
} from '@angular/fire/firestore';

export interface AuditEntry {
  id: string;
  actorUid: string;
  actorName: string;
  actorRole: string;
  /** For example "idea.status_changed" or "user.role_changed". */
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  at: Date | null;
}

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string;
  summary?: string;
  actorRole?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminAuditService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  readonly entries = signal<AuditEntry[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  private unsubscribe: Unsubscribe | null = null;

  /** Live view of the newest `max` entries. Call again with a bigger number to load more. */
  watch(max: number, destroyRef?: DestroyRef): void {
    this.stop();
    this.loading.set(true);

    this.unsubscribe = onSnapshot(
      query(collection(this.firestore, 'auditLogs'), orderBy('at', 'desc'), limit(max)),
      snap => {
        // "estimate" shows a just-written entry with the current time instead of an empty date
        this.entries.set(snap.docs.map(document => this.toEntry(document.id, document.data({ serverTimestamps: 'estimate' }))));
        this.error.set(null);
        this.loading.set(false);
      },
      error => {
        console.error('[AdminAuditService] could not read auditLogs', error);
        this.error.set(`Could not read the audit log (${error.code}).`);
        this.loading.set(false);
      },
    );

    destroyRef?.onDestroy(() => this.stop());
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /**
   * Records an action. Call it AFTER the action succeeded.
   * It never throws, so a problem with the log can never break the action the admin just performed,
   * but the failure is printed in the console.
   *
   *   await this.audit.log({ action: 'idea.status_changed', entityType: 'idea', entityId: idea.id,
   *                          summary: `"${idea.title}": ${idea.status} -> ${status}` });
   */
  async log(entry: AuditInput): Promise<void> {
    try {
      const user = this.auth.currentUser;
      await addDoc(collection(this.firestore, 'auditLogs'), {
        actorUid: user?.uid ?? null,
        actorName: user?.displayName ?? user?.email ?? 'Unknown',
        actorRole: entry.actorRole ?? 'admin',
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? '',
        summary: (entry.summary ?? '').slice(0, 500),
        at: serverTimestamp(),
      });
    } catch (error) {
      console.error('[AdminAuditService] could not write the audit entry', entry, error);
    }
  }

  private toEntry(id: string, data: DocumentData): AuditEntry {
    return {
      id,
      actorUid: (data['actorUid'] ?? '') as string,
      actorName: (data['actorName'] ?? data['actor'] ?? 'Unknown') as string,
      actorRole: (data['actorRole'] ?? '') as string,
      action: (data['action'] ?? 'unknown') as string,
      entityType: (data['entityType'] ?? data['target'] ?? '') as string,
      entityId: (data['entityId'] ?? '') as string,
      summary: (data['summary'] ?? '') as string,
      at: this.toDate(data['at']),
    };
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
