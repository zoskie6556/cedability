import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from '@angular/fire/firestore';
import type { IdeaStatus } from '../../shared/workflow/idea-workflow';
import { requireIdeaStatus } from '../../shared/models/status-parse';

export interface AdminIdeaRow {
  id: string;
  title: string;
  ownerName: string;
  category: string;
  status: IdeaStatus;
  stageId: string | null;
  score: number | null;
  submittedAt: Date | null;
}

export interface EvaluatorOption {
  id: string;
  name: string;
}

export interface IdeaAssignment {
  id: string;
  ideaId: string;
  evaluatorUid: string;
  status: string;
}

@Injectable({ providedIn: 'root' })
export class AdminIdeaService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  readonly ideas = signal<AdminIdeaRow[]>([]);
  readonly assignments = signal<IdeaAssignment[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  private unsubscribers: Unsubscribe[] = [];

  /** Real-time listeners for ideas and assignments. Pass a DestroyRef to stop them automatically. */
  watch(destroyRef?: DestroyRef): void {
    this.stop();
    this.loading.set(true);

    // No orderBy on purpose: Firestore hides documents that lack the ordered field.
    this.unsubscribers.push(
      onSnapshot(
        collection(this.firestore, 'ideas'),
        snap => {
          const rows = snap.docs.map(document => this.toRow(document.id, document.data()));
          rows.sort((left, right) => (right.submittedAt?.getTime() ?? 0) - (left.submittedAt?.getTime() ?? 0));
          this.ideas.set(rows);
          this.error.set(null);
          this.loading.set(false);
        },
        error => {
          console.error('[AdminIdeaService] could not read ideas', error);
          this.error.set(`Could not read ideas (${error.code}).`);
          this.loading.set(false);
        },
      ),
    );

    this.unsubscribers.push(
      onSnapshot(
        collection(this.firestore, 'assignments'),
        snap => {
          this.assignments.set(
            snap.docs.map(document => {
              const data = document.data();
              return {
                id: document.id,
                ideaId: data['ideaId'] as string,
                evaluatorUid: data['evaluatorUid'] as string,
                status: (data['status'] ?? 'pending') as string,
              };
            }),
          );
        },
        error => console.error('[AdminIdeaService] could not read assignments', error),
      ),
    );

    destroyRef?.onDestroy(() => this.stop());
  }

  stop(): void {
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.unsubscribers = [];
  }

  async loadEvaluators(): Promise<EvaluatorOption[]> {
    const snap = await getDocs(query(collection(this.firestore, 'users'), where('role', '==', 'evaluator')));
    return snap.docs
      .map(document => {
        const data = document.data();
        return { id: document.id, name: (data['displayName'] ?? data['name'] ?? data['email'] ?? 'Unnamed') as string };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  /** Stage id -> stage name, so cards can show "Technical review" instead of an ID. */
  async loadStageNames(): Promise<Record<string, string>> {
    const snap = await getDocs(collection(this.firestore, 'stages'));
    const names: Record<string, string> = {};
    snap.docs.forEach(document => {
      names[document.id] = (document.data()['name'] ?? document.id) as string;
    });
    return names;
  }

  async assignEvaluator(idea: AdminIdeaRow, evaluator: EvaluatorOption): Promise<void> {
    // A fixed document ID means the same evaluator can never be assigned twice to the same idea and stage.
    const assignmentId = `${idea.id}_${idea.stageId ?? 'stage'}_${evaluator.id}`;
    await setDoc(doc(this.firestore, 'assignments', assignmentId), {
      ideaId: idea.id,
      stageId: idea.stageId,
      evaluatorUid: evaluator.id,
      status: 'pending',
      assignedBy: this.auth.currentUser?.uid ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async removeAssignment(assignmentId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'assignments', assignmentId));
  }

  /** Changes the status and records the change in the idea's timeline in one atomic write. */
  async setStatus(idea: AdminIdeaRow, status: IdeaStatus): Promise<void> {
    const batch = writeBatch(this.firestore);

    batch.update(doc(this.firestore, 'ideas', idea.id), { status, updatedAt: serverTimestamp() });
    batch.set(doc(collection(this.firestore, 'ideas', idea.id, 'statusHistory')), {
      from: idea.status,
      to: status,
      stageId: idea.stageId,
      byUid: this.auth.currentUser?.uid ?? null,
      byRole: 'admin',
      at: serverTimestamp(),
    });

    await batch.commit();
  }

  private toRow(id: string, data: DocumentData): AdminIdeaRow {
    const score = data['score'] ?? data['finalScore'];
    return {
      id,
      title: (data['title'] ?? 'Untitled idea') as string,
      ownerName: (data['ownerName'] ?? data['owner'] ?? data['ownerId'] ?? 'Unknown owner') as string,
      category: (data['category'] ?? '') as string,
      status: this.normalizeStatus(data['status']),
      stageId: (data['currentStageId'] ?? null) as string | null,
      score: typeof score === 'number' ? score : null,
      submittedAt: this.toDate(data['submittedAt'] ?? data['createdAt']),
    };
  }

  private normalizeStatus(value: unknown): IdeaStatus {
    const text = typeof value === 'string' ? value.toLowerCase().trim().replace(/\s+/g, '_') : value;
    return requireIdeaStatus(text);
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
