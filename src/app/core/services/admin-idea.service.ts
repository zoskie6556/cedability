import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from '@angular/fire/firestore';
import { parseEvaluationCriteriaSet } from '../../shared/models/idea-evaluation.model';
import type {
  EvaluatorType,
  EvaluatorIdeaView,
} from '../../shared/models/idea-evaluation.model';
import { UserDataService } from './user-data.service';
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
  evaluatorType: EvaluatorType;
  organization: string | null;
}

export interface AdminIdeaAssignment {
  id: string;
  ideaId: string;
  evaluatorUid: string;
  status: string;
}

@Injectable({ providedIn: 'root' })
export class AdminIdeaService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);
  private readonly userDataService = inject(UserDataService);

  readonly ideas = signal<AdminIdeaRow[]>([]);
  readonly assignments = signal<AdminIdeaAssignment[]>([]);
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
        const evaluatorType: EvaluatorType =
          data['evaluatorType'] === 'external' ? 'external' : 'internal';
        return {
          id: document.id,
          name: (data['displayName'] ?? data['fullName'] ?? data['email'] ?? 'Unnamed') as string,
          evaluatorType,
          organization: typeof data['organization'] === 'string' ? data['organization'] : null,
        };
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
    if (!idea.stageId) {
      throw new Error('An idea must have an active evaluation stage before it can be assigned.');
    }

    const assignedBy = this.auth.currentUser?.uid;
    if (!assignedBy) {
      throw new Error('An authenticated administrator is required to assign an evaluator.');
    }

    const assignmentId = `${idea.id}_${idea.stageId}_${evaluator.id}`;
    const assignmentRef = doc(this.firestore, 'assignments', assignmentId);
    if ((await getDoc(assignmentRef)).exists()) {
      throw new Error('This evaluator already has an assignment for the current stage.');
    }

    const batch = writeBatch(this.firestore);
    batch.set(assignmentRef, {
      ideaId: idea.id,
      stageId: idea.stageId,
      evaluatorUid: evaluator.id,
      status: 'pending',
      assignedBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (evaluator.evaluatorType === 'external') {
      const [ideaDocument, stageDocument] = await Promise.all([
        this.userDataService.getIdeaById(idea.id),
        getDoc(doc(this.firestore, 'stages', idea.stageId)),
      ]);
      if (!ideaDocument || !stageDocument.exists()) {
        throw new Error('The idea or evaluation stage could not be found.');
      }

      const stage = stageDocument.data();
      const stageName = stage['name'];
      const criteriaSetId = stage['criteriaSetId'];
      if (typeof stageName !== 'string' || typeof criteriaSetId !== 'string') {
        throw new Error('The evaluation stage configuration is invalid.');
      }

      const criteriaSnapshot = await getDoc(doc(this.firestore, 'criteriaSets', criteriaSetId));
      if (!criteriaSnapshot.exists()) {
        throw new Error('The stage scoring criteria could not be found.');
      }

      const evaluatorView: Omit<EvaluatorIdeaView, 'createdAt'> = {
        ideaId: idea.id,
        assignmentId,
        evaluatorUid: evaluator.id,
        stageId: idea.stageId,
        stageName,
        criteriaSetId,
        criteriaSet: parseEvaluationCriteriaSet(criteriaSetId, criteriaSnapshot.data()),
        title: ideaDocument.title,
        category: ideaDocument.category,
        problem: ideaDocument.problem,
        proposedSolution: ideaDocument.proposedSolution,
        intendedBeneficiaries: ideaDocument.intendedBeneficiaries,
        plannedLocation: ideaDocument.plannedLocation,
        marketPlan: ideaDocument.marketPlan,
        feasibilityPlan: ideaDocument.feasibilityPlan,
        financingPlan: ideaDocument.financingPlan,
        milestones: ideaDocument.milestones,
        automatedReview: ideaDocument.automatedReview,
      };
      batch.set(
        doc(this.firestore, 'ideas', idea.id, 'evaluatorViews', assignmentId),
        { ...evaluatorView, createdAt: serverTimestamp() },
      );
    }

    await batch.commit();
  }

  async removeAssignment(assignmentId: string): Promise<void> {
    const assignmentRef = doc(this.firestore, 'assignments', assignmentId);
    const assignment = await getDoc(assignmentRef);
    if (!assignment.exists()) {
      throw new Error('The evaluator assignment could not be found.');
    }

    const ideaId = assignment.data()['ideaId'];
    if (typeof ideaId !== 'string') {
      throw new Error('The evaluator assignment has an invalid idea reference.');
    }

    const batch = writeBatch(this.firestore);
    batch.delete(assignmentRef);
    batch.delete(doc(this.firestore, 'ideas', ideaId, 'evaluatorViews', assignmentId));
    await batch.commit();
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
