import { inject, Injectable, signal } from '@angular/core';
import {
  collection,
  collectionGroup,
  Firestore,
  getDocs,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from '@angular/fire/firestore';

export type StaffRole = 'evaluator' | 'agent' | 'adjudicator';

export interface StaffActivityRow {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  evaluationsCompleted: number;
  feedbackGiven: number;
  pendingAssignments: number;
  decisionsMade: number;
  chatsHandled: number;
  chatsResponded: number;
  ticketsAssigned: number;
  ticketsResolved: number;
  avgFirstResponseSeconds: number | null;
  lastActive: Date | null;
}

const STAFF_ROLES: ReadonlyArray<StaffRole> = ['evaluator', 'agent', 'adjudicator'];

/**
 * Builds the staff activity table from the real collections.
 * Later, when the Cloud Functions maintain `staffStats/{uid}`, this can read that
 * collection instead (one read per staff member rather than scanning everything).
 */
@Injectable({ providedIn: 'root' })
export class AdminStaffService {
  private readonly firestore = inject(Firestore);

  /** Human-readable problem (for example permission-denied), or null. */
  readonly error = signal<string | null>(null);

  async loadStaffActivity(): Promise<StaffActivityRow[]> {
    this.error.set(null);
    const failures: string[] = [];

    // Each source is read separately so one missing collection or rule never blanks the page.
    const read = async (name: string, ref: Query<DocumentData>): Promise<QueryDocumentSnapshot<DocumentData>[]> => {
      try {
        return (await getDocs(ref)).docs;
      } catch (error) {
        const code = (error as { code?: string } | null)?.code ?? String(error);
        console.error(`[AdminStaffService] could not read "${name}" (${code})`, error);
        failures.push(`${name} (${code})`);
        return [];
      }
    };

    const [users, evaluations, feedback, adjudications, assignments, tickets, chats] = await Promise.all([
      read('users', collection(this.firestore, 'users')),
      read('evaluations', collectionGroup(this.firestore, 'evaluations')),
      read('feedback', collectionGroup(this.firestore, 'feedback')),
      read('adjudications', collectionGroup(this.firestore, 'adjudications')),
      read('assignments', collection(this.firestore, 'assignments')),
      read('tickets', collection(this.firestore, 'tickets')),
      read('chats', collection(this.firestore, 'chats')),
    ]);

    // Start with one empty row per staff member found in `users`.
    const rows = new Map<string, StaffActivityRow>();
    for (const document of users) {
      const data = document.data();
      const role = data['role'];
      if (!this.isStaffRole(role)) {
        continue;
      }
      rows.set(document.id, {
        id: document.id,
        name: (data['displayName'] ?? data['name'] ?? 'Unknown user') as string,
        email: (data['email'] ?? '') as string,
        role,
        evaluationsCompleted: 0,
        feedbackGiven: 0,
        pendingAssignments: 0,
        decisionsMade: 0,
        chatsHandled: 0,
        chatsResponded: 0,
        ticketsAssigned: 0,
        ticketsResolved: 0,
        avgFirstResponseSeconds: null,
        lastActive: this.toDate(data['lastActiveAt'] ?? data['lastLoginAt']),
      });
    }

    const touch = (row: StaffActivityRow, value: unknown): void => {
      const date = this.toDate(value);
      if (date && (!row.lastActive || date > row.lastActive)) {
        row.lastActive = date;
      }
    };

    // Accumulators for the average first-response time.
    const responseTimes = new Map<string, { total: number; count: number }>();
    const addResponseTime = (uid: string, started: unknown, responded: unknown): void => {
      const start = this.toDate(started);
      const end = this.toDate(responded);
      if (!start || !end || end < start) {
        return;
      }
      const entry = responseTimes.get(uid) ?? { total: 0, count: 0 };
      entry.total += (end.getTime() - start.getTime()) / 1000;
      entry.count += 1;
      responseTimes.set(uid, entry);
    };

    for (const document of evaluations) {
      const data = document.data();
      const row = rows.get(data['evaluatorUid']);
      if (row) {
        row.evaluationsCompleted++;
        touch(row, data['submittedAt']);
      }
    }

    for (const document of feedback) {
      const data = document.data();
      const row = rows.get(data['evaluatorUid']);
      if (row) {
        row.feedbackGiven++;
        touch(row, data['createdAt']);
      }
    }

    for (const document of adjudications) {
      const data = document.data();
      const row = rows.get(data['adjudicatorUid']);
      if (row) {
        row.decisionsMade++;
        touch(row, data['decidedAt']);
      }
    }

    for (const document of assignments) {
      const data = document.data();
      const row = rows.get(data['evaluatorUid']);
      if (row && data['status'] !== 'done') {
        row.pendingAssignments++;
      }
    }

    for (const document of tickets) {
      const data = document.data();

      const assignee = rows.get(data['assignedTo']);
      if (assignee) {
        assignee.ticketsAssigned++;
        addResponseTime(assignee.id, data['createdAt'], data['firstResponseAt']);
      }

      const resolver = rows.get(data['resolvedBy']);
      if (resolver) {
        resolver.ticketsResolved++;
        touch(resolver, data['resolvedAt']);
      }
    }

    for (const document of chats) {
      const data = document.data();
      const row = rows.get(data['handledBy']);
      if (row) {
        row.chatsHandled++;
        if (data['firstResponseAt']) {
          row.chatsResponded++;
          addResponseTime(row.id, data['startedAt'] ?? data['createdAt'], data['firstResponseAt']);
        }
        touch(row, data['lastMessageAt'] ?? data['firstResponseAt']);
      }
    }

    for (const [uid, entry] of responseTimes) {
      const row = rows.get(uid);
      if (row && entry.count > 0) {
        row.avgFirstResponseSeconds = Math.round(entry.total / entry.count);
      }
    }

    this.error.set(failures.length ? `Could not read: ${failures.join(', ')}` : null);

    return [...rows.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  private isStaffRole(value: unknown): value is StaffRole {
    return typeof value === 'string' && (STAFF_ROLES as ReadonlyArray<string>).includes(value);
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
