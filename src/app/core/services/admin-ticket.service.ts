import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  collection,
  doc,
  Firestore,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type Unsubscribe,
} from '@angular/fire/firestore';

export type TicketPriority = 'low' | 'medium' | 'high';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface AdminTicketRow {
  id: string;
  subject: string;
  userName: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  assignedTo: string | null;
  assignedToName: string | null;
  createdAt: Date | null;
}

export interface SupportAgent {
  id: string;
  name: string;
}

const PRIORITIES: ReadonlyArray<TicketPriority> = ['low', 'medium', 'high'];
const STATUSES: ReadonlyArray<TicketStatus> = ['open', 'in_progress', 'resolved', 'closed'];

@Injectable({ providedIn: 'root' })
export class AdminTicketService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  readonly tickets = signal<AdminTicketRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  private unsubscribe: Unsubscribe | null = null;

  /** Real-time listener. Pass a DestroyRef so it stops when the page is left. */
  watch(destroyRef?: DestroyRef): void {
    this.stop();
    this.loading.set(true);

    // No orderBy here on purpose: Firestore hides documents that lack the ordered field.
    this.unsubscribe = onSnapshot(
      collection(this.firestore, 'tickets'),
      snap => {
        const rows = snap.docs.map(document => this.toRow(document.id, document.data()));
        rows.sort((left, right) => (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0));
        this.tickets.set(rows);
        this.error.set(null);
        this.loading.set(false);
      },
      error => {
        console.error('[AdminTicketService] could not read tickets', error);
        this.error.set(`Could not read tickets (${error.code}).`);
        this.loading.set(false);
      },
    );

    destroyRef?.onDestroy(() => this.stop());
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Support team members available for assignment. */
  async loadAgents(): Promise<SupportAgent[]> {
    const snap = await getDocs(query(collection(this.firestore, 'users'), where('role', '==', 'agent')));
    return snap.docs
      .map(document => {
        const data = document.data();
        return { id: document.id, name: (data['displayName'] ?? data['name'] ?? data['email'] ?? 'Unnamed') as string };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async assign(ticket: AdminTicketRow, agent: SupportAgent | null): Promise<void> {
    const changes: Record<string, unknown> = {
      assignedTo: agent?.id ?? null,
      assignedToName: agent?.name ?? null,
      updatedAt: serverTimestamp(),
    };
    // Assigning an open ticket starts the work.
    if (agent && ticket.status === 'open') {
      changes['status'] = 'in_progress';
    }
    await updateDoc(doc(this.firestore, 'tickets', ticket.id), changes);
  }

  async setStatus(ticket: AdminTicketRow, status: TicketStatus): Promise<void> {
    const changes: Record<string, unknown> = { status, updatedAt: serverTimestamp() };

    if (status === 'resolved' || status === 'closed') {
      changes['resolvedAt'] = serverTimestamp();
      // Credit the assigned agent when there is one, otherwise whoever resolved it.
      changes['resolvedBy'] = ticket.assignedTo ?? this.auth.currentUser?.uid ?? null;
    } else {
      changes['resolvedAt'] = null;
      changes['resolvedBy'] = null;
    }

    await updateDoc(doc(this.firestore, 'tickets', ticket.id), changes);
  }

  private toRow(id: string, data: DocumentData): AdminTicketRow {
    return {
      id,
      subject: (data['subject'] ?? data['title'] ?? 'Untitled ticket') as string,
      userName: (data['userName'] ?? data['user'] ?? data['userId'] ?? 'Unknown user') as string,
      category: (data['category'] ?? '') as string,
      priority: this.normalizePriority(data['priority']),
      status: this.normalizeStatus(data['status']),
      assignedTo: (data['assignedTo'] ?? null) as string | null,
      assignedToName: (data['assignedToName'] ?? null) as string | null,
      createdAt: this.toDate(data['createdAt']),
    };
  }

  private normalizePriority(value: unknown): TicketPriority {
    const text = String(value ?? '').toLowerCase();
    return (PRIORITIES as ReadonlyArray<string>).includes(text) ? (text as TicketPriority) : 'medium';
  }

  private normalizeStatus(value: unknown): TicketStatus {
    const text = String(value ?? '').toLowerCase().trim().replace(/\s+/g, '_');
    return (STATUSES as ReadonlyArray<string>).includes(text) ? (text as TicketStatus) : 'open';
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
