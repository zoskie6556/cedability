import { inject, Injectable } from '@angular/core';
import { User as FirebaseUser } from '@angular/fire/auth';
import {
  addDoc,
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Timestamp } from 'firebase/firestore';
import { isIdeaCategory } from '../../shared/models/automated-review.model';
import { parseEvaluationCriteriaSet } from '../../shared/models/idea-evaluation.model';
import type {
  EvaluationContext,
  EvaluationCriteriaSet,
  EvaluationCriterion,
  EvaluationIdeaDetails,
  EvaluationStage,
  EvaluatorType,
  EvaluationWorklistItem,
  IdeaAssignment,
  IdeaEvaluation,
  IdeaQuestion,
  EvaluationRecommendation,
  EvaluatorIdeaView,
  AdjudicationDecision,
  AwardCandidate,
} from '../../shared/models/idea-evaluation.model';
import { requireIdeaStatus } from '../../shared/models/status-parse';
import type { RankedAdjudicationIdea } from '../../shared/workflow/adjudication-ranking';
import { rankAdjudicationIdeas } from '../../shared/workflow/adjudication-ranking';
import {
  type AutomatedReviewFinding,
  type AutomatedReviewReport,
  type AutomatedReviewStatus,
  type IdeaCategory,
  type Idea,
  type IdeaFeedback,
  type IdeaFeedbackReply,
  type IdeaFeasibilityPlan,
  type IdeaFinancingPlan,
  type IdeaMarketPlan,
  type IdeaMilestone,
  type NewIdea,
  type ReviewFindingStatus,
  type SimilarityCheckResult,
} from '../../shared/models/idea.model';
import type { Profile, UserType } from '../../shared/models/profile.model';
import type { User } from '../../shared/models/user.model';

@Injectable({ providedIn: 'root' })
export class UserDataService {
  private readonly firestore = inject(Firestore);
  private readonly functions = inject(Functions);

  async createUserDocument(uid: string, email: string, fullName: string): Promise<void> {
    const userRef = doc(this.firestore, 'users', uid);

    await setDoc(userRef, {
      uid,
      email,
      fullName,
      emailVerified: false,
      phoneNumberVerified: false,
      role: 'user',
      evaluatorType: null,
      organization: null,
      profile: this.createEmptyProfile(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async getOrCreateUser(authUser: FirebaseUser): Promise<User> {
    const userRef = doc(this.firestore, 'users', authUser.uid);
    const userSnapshot = await getDoc(userRef);

    if (userSnapshot.exists()) {
      return this.parseUser(authUser.uid, userSnapshot.data());
    }

    await setDoc(userRef, {
      uid: authUser.uid,
      email: authUser.email ?? '',
      fullName: authUser.displayName ?? '',
      emailVerified: authUser.emailVerified,
      phoneNumberVerified: false,
      role: 'user',
      evaluatorType: null,
      organization: null,
      profile: this.createEmptyProfile(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const createdUserSnapshot = await getDoc(userRef);
    if (!createdUserSnapshot.exists()) {
      throw new Error('The user document was not available after it was created.');
    }

    return this.parseUser(authUser.uid, createdUserSnapshot.data());
  }

  async getRoleRecord(uid: string): Promise<{ exists: boolean; role: unknown }> {
    const userSnapshot = await getDoc(doc(this.firestore, 'users', uid));
    if (!userSnapshot.exists()) {
      return { exists: false, role: undefined };
    }

    return { exists: true, role: userSnapshot.data()['role'] };
  }

  async saveProfile(uid: string, profile: Profile): Promise<void> {
    await updateDoc(doc(this.firestore, 'users', uid), {
      profile: {
        ...profile,
        onboardingCompletedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    });
  }

  async createIdea(idea: NewIdea): Promise<string> {
    const ideaCollection = collection(this.firestore, 'ideas');
    const document = await addDoc(ideaCollection, {
      ...idea,
      status: 'submitted',
      version: 1,
      submittedAt: serverTimestamp(),
      aiAnalysisConsentAt: serverTimestamp(),
      automatedReview: {
        status: 'queued',
        model: 'gemini-3.5-flash-lite',
        rubricVersion: 'cedability-v1',
        summary: '',
        criteria: null,
        strengths: [],
        informationGaps: [],
        questionsForHumanEvaluator: [],
        limitations: [],
        startedAt: null,
        completedAt: null,
        failureMessage: null,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return document.id;
  }

  async requestIdeaChanges(
    ideaId: string,
    assignmentId: string,
    stageId: string,
    message: string,
  ): Promise<void> {
    const callable = httpsCallable<
      { ideaId: string; assignmentId: string; stageId: string; message: string },
      { feedbackId: string }
    >(this.functions, 'requestIdeaChanges');
    await callable({ ideaId, assignmentId, stageId, message: message.trim() });
  }

  async resubmitIdea(
    ideaId: string,
    expectedVersion: number,
    idea: NewIdea,
  ): Promise<{ ideaId: string; version: number }> {
    const callable = httpsCallable<
      { ideaId: string; expectedVersion: number; idea: NewIdea },
      { ideaId: string; version: number }
    >(this.functions, 'resubmitIdea');
    const result = await callable({ ideaId, expectedVersion, idea });
    return result.data;
  }

  async getFeedbackForIdea(ideaId: string): Promise<IdeaFeedback[]> {
    const feedbackQuery = query(
      collection(this.firestore, 'ideas', ideaId, 'feedback'),
      orderBy('createdAt', 'asc'),
    );
    const snapshot = await getDocs(feedbackQuery);
    return snapshot.docs.map((feedbackDocument) =>
      this.parseIdeaFeedback(ideaId, feedbackDocument.id, feedbackDocument.data()),
    );
  }

  async replyToFeedback(ideaId: string, feedbackId: string, message: string): Promise<void> {
    const cleanMessage = message.trim();
    if (!cleanMessage || cleanMessage.length > 2000) {
      throw new Error('Your reply must be between 1 and 2000 characters.');
    }

    await updateDoc(doc(this.firestore, 'ideas', ideaId, 'feedback', feedbackId), {
      reply: { message: cleanMessage, at: serverTimestamp() },
    });
  }

  // async getIdeasForUser(uid: string): Promise<Idea[]> {
  //   const ideaCollection = collection(this.firestore, 'ideas');
  //   const userIdeasQuery = query(ideaCollection, where('ownerId', '==', uid));
  //   const snapshot = await getDocs(userIdeasQuery);

  //   const ideas = snapshot.docs.map((ideaDocument) => this.parseIdea(ideaDocument.id, ideaDocument.data()));
  //   console.log("User's Ideas:", ideas);
    
  //   return this.sortIdeasByLatestUpdate(ideas);
  // }

  async getIdeasForUser(uid: string): Promise<Idea[]> {
    const ideaCollection = collection(this.firestore, 'ideas');
    const userIdeasQuery = query(ideaCollection, where('ownerId', '==', uid));
    const snapshot = await getDocs(userIdeasQuery);

    console.log(`[UserDataService] Found ${snapshot.docs.length} raw idea docs for UID: ${uid}`);

    const parsedIdeas: Idea[] = [];
    const failedDocs: { id: string; error: unknown; rawData: unknown }[] = [];

    for (const ideaDocument of snapshot.docs) {
      const rawData = ideaDocument.data();
      console.log(`[UserDataService] Raw Idea [${ideaDocument.id}] JSON:`, JSON.stringify(rawData, null, 2));

      try {
        const parsed = this.parseIdea(ideaDocument.id, rawData);
        parsedIdeas.push(parsed);
      } catch (err) {
        console.error(`[UserDataService] ❌ Failed to parse idea [${ideaDocument.id}]:`, err);
        failedDocs.push({ id: ideaDocument.id, error: err, rawData });
      }
    }

    if (failedDocs.length > 0 && parsedIdeas.length === 0) {
      // Re-throw if every single idea failed so the UI still shows the error state
      throw failedDocs[0].error;
    }

    return this.sortIdeasByLatestUpdate(parsedIdeas);
  }

  watchIdeasForUser(
    uid: string,
    onIdeas: (ideas: Idea[]) => void,
    onError: (error: unknown) => void,
  ): () => void {
    const userIdeasQuery = query(collection(this.firestore, 'ideas'), where('ownerId', '==', uid));

    return onSnapshot(
      userIdeasQuery,
      (snapshot) => {
        try {
          onIdeas(
            this.sortIdeasByLatestUpdate(
              snapshot.docs.map((ideaDocument) =>
                this.parseIdea(ideaDocument.id, ideaDocument.data()),
              ),
            ),
          );
        } catch (error: unknown) {
          onError(error);
        }
      },
      onError,
    );
  }

  async getIdeasForEvaluator(): Promise<Idea[]> {
    const snapshot = await getDocs(collection(this.firestore, 'ideas'));

    return snapshot.docs
      .map((ideaDocument) => this.parseIdea(ideaDocument.id, ideaDocument.data()))
      .sort((first, second) => (second.createdAt?.toMillis() ?? 0) - (first.createdAt?.toMillis() ?? 0));
  }

  private sortIdeasByLatestUpdate(ideas: Idea[]): Idea[] {
    return ideas.sort((first, second) => {
      const firstUpdatedAt = first.updatedAt?.toMillis() ?? first.createdAt?.toMillis() ?? 0;
      const secondUpdatedAt = second.updatedAt?.toMillis() ?? second.createdAt?.toMillis() ?? 0;
      return secondUpdatedAt - firstUpdatedAt;
    });
  }

  async getIdeaById(ideaId: string): Promise<Idea | null> {
    const snapshot = await getDoc(doc(this.firestore, 'ideas', ideaId));
    return snapshot.exists() ? this.parseIdea(snapshot.id, snapshot.data()) : null;
  }

  async getEvaluatorWorklist(evaluatorUid: string): Promise<EvaluationWorklistItem[]> {
    const access = await this.getEvaluatorAccess(evaluatorUid);
    if (access.role !== 'evaluator') {
      throw new Error('Evaluator access is required to load assignments.');
    }

    const assignmentQuery = query(
      collection(this.firestore, 'assignments'),
      where('evaluatorUid', '==', evaluatorUid),
      where('status', '!=', 'done'),
    );
    const snapshot = await getDocs(assignmentQuery);
    const assignments = snapshot.docs.map((assignment) =>
      parseEvaluationAssignment(assignment.id, assignment.data()),
    );

    return Promise.all(
      assignments.map(async (assignment) => {
        const idea = await this.getAssignedIdea(assignment, access.evaluatorType === 'external');
        return { assignment, title: idea.title, category: idea.category };
      }),
    );
  }

  async getEvaluationContext(evaluatorUid: string, assignmentId: string): Promise<EvaluationContext> {
    const access = await this.getEvaluatorAccess(evaluatorUid);
    if (access.role !== 'evaluator') {
      throw new Error('Evaluator access is required to open this assignment.');
    }

    const assignmentSnapshot = await getDoc(doc(this.firestore, 'assignments', assignmentId));
    if (!assignmentSnapshot.exists()) {
      throw new Error('This evaluation assignment is no longer available.');
    }
    const assignment = parseEvaluationAssignment(assignmentSnapshot.id, assignmentSnapshot.data());
    if (assignment.evaluatorUid !== evaluatorUid) {
      throw new Error('This evaluation assignment belongs to another evaluator.');
    }

    if (access.evaluatorType === 'external') {
      const view = await this.getEvaluatorIdeaView(assignment);
      return {
        assignment,
        idea: view,
        stageName: view.stageName,
        criteriaSet: view.criteriaSet,
        evaluatorType: 'external',
      };
    }

    const [ideaSnapshot, stageSnapshot] = await Promise.all([
      getDoc(doc(this.firestore, 'ideas', assignment.ideaId)),
      getDoc(doc(this.firestore, 'stages', assignment.stageId)),
    ]);
    if (!ideaSnapshot.exists() || !stageSnapshot.exists()) {
      throw new Error('The idea or evaluation stage could not be found.');
    }

    const stage = parseEvaluationStage(assignment.stageId, stageSnapshot.data());
    const criteriaSnapshot = await getDoc(doc(this.firestore, 'criteriaSets', stage.criteriaSetId));
    if (!criteriaSnapshot.exists()) {
      throw new Error('The scoring criteria for this stage could not be found.');
    }

    const idea = this.parseIdea(ideaSnapshot.id, ideaSnapshot.data());
    return {
      assignment,
      idea: toEvaluationIdeaDetails(idea),
      stageName: stage.name,
      criteriaSet: parseEvaluationCriteriaSet(stage.criteriaSetId, criteriaSnapshot.data()),
      evaluatorType: 'internal',
    };
  }

  async getPanelEvaluations(
    ideaId: string,
    stageId: string,
    evaluatorUid: string,
  ): Promise<IdeaEvaluation[]> {
    const access = await this.getEvaluatorAccess(evaluatorUid);
    const canReadPanel =
      access.role === 'admin' ||
      access.role === 'adjudicator' ||
      (access.role === 'evaluator' && access.evaluatorType === 'internal');
    if (!canReadPanel) {
      throw new Error('Panel summaries are restricted to internal evaluation staff.');
    }

    const evaluationQuery = query(
      collection(this.firestore, 'ideas', ideaId, 'evaluations'),
      where('stageId', '==', stageId),
    );
    const snapshot = await getDocs(evaluationQuery);
    return snapshot.docs.map((evaluation) =>
      parseIdeaEvaluation(ideaId, evaluation.id, evaluation.data()),
    );
  }

  async getAdjudicationWorklist(adjudicatorUid: string): Promise<RankedAdjudicationIdea[]> {
    const access = await this.getEvaluatorAccess(adjudicatorUid);
    if (access.role !== 'adjudicator' && access.role !== 'admin') {
      throw new Error('Adjudicator access is required to load this worklist.');
    }

    const ideas = await getDocs(
      query(collection(this.firestore, 'ideas'), where('status', '==', 'adjudication')),
    );
    const candidates = await Promise.all(
      ideas.docs.map(async (ideaDocument) => {
        const idea = this.parseIdea(ideaDocument.id, ideaDocument.data());
        const evaluations = await getDocs(
          collection(this.firestore, 'ideas', ideaDocument.id, 'evaluations'),
        );
        return {
          ideaId: idea.id,
          title: idea.title,
          category: idea.category,
          evaluations: evaluations.docs.map((evaluation) => {
            const parsed = parseIdeaEvaluation(idea.id, evaluation.id, evaluation.data());
            return {
              evaluatorUid: parsed.evaluatorUid,
              stageId: parsed.stageId,
              total: parsed.total,
            };
          }),
        };
      }),
    );

    return rankAdjudicationIdeas(candidates);
  }

  async getApprovedIdeasForAward(adminUid: string): Promise<AwardCandidate[]> {
    const access = await this.getEvaluatorAccess(adminUid);
    if (access.role !== 'admin') {
      throw new Error('Admin access is required to award ideas.');
    }

    const snapshot = await getDocs(
      query(collection(this.firestore, 'ideas'), where('status', '==', 'approved')),
    );
    return snapshot.docs.map((ideaDocument) => {
      const idea = this.parseIdea(ideaDocument.id, ideaDocument.data());
      return {
        ideaId: idea.id,
        ownerId: idea.ownerId,
        title: idea.title,
        category: idea.category,
      };
    });
  }

  async recordAdjudication(
    ideaId: string,
    decision: AdjudicationDecision,
    note: string,
  ): Promise<void> {
    const callable = httpsCallable<
      { ideaId: string; decision: AdjudicationDecision; note: string },
      { ideaId: string; status: string }
    >(this.functions, 'recordAdjudication');
    await callable({ ideaId, decision, note: note.trim() });
  }

  async awardIdea(input: {
    ideaId: string;
    title: string;
    type: string;
    citation: string;
    isPublic: boolean;
  }): Promise<void> {
    const callable = httpsCallable<
      {
        ideaId: string;
        title: string;
        type: string;
        citation: string;
        isPublic: boolean;
      },
      { ideaId: string; awardId: string }
    >(this.functions, 'awardApprovedIdea');
    await callable(input);
  }

  async getQuestionsForIdea(ideaId: string, stageId?: string): Promise<IdeaQuestion[]> {
    const questions = collection(this.firestore, 'ideas', ideaId, 'questions');
    const questionQuery = stageId
      ? query(questions, where('stageId', '==', stageId))
      : query(questions, orderBy('createdAt', 'asc'));
    const snapshot = await getDocs(questionQuery);

    return snapshot.docs.map((questionDocument) =>
      this.parseIdeaQuestion(ideaId, questionDocument.id, questionDocument.data()),
    ).sort((first, second) => (first.createdAt?.toMillis() ?? 0) - (second.createdAt?.toMillis() ?? 0));
  }

  async addEvaluatorQuestion(
    ideaId: string,
    askedBy: string,
    question: string,
    stageId: string | null = null,
  ): Promise<void> {
    const questions = collection(this.firestore, 'ideas', ideaId, 'questions');
    await addDoc(questions, {
      askedBy,
      stageId,
      question: question.trim(),
      createdAt: serverTimestamp(),
      response: null,
      respondedBy: null,
      respondedAt: null,
    });
  }

  async respondToQuestion(
    ideaId: string,
    questionId: string,
    respondedBy: string,
    response: string,
  ): Promise<void> {
    await updateDoc(doc(this.firestore, 'ideas', ideaId, 'questions', questionId), {
      response: response.trim(),
      respondedBy,
      respondedAt: serverTimestamp(),
    });
  }

  async saveEvaluation(
    assignment: IdeaAssignment,
    evaluatorUid: string,
    scores: Readonly<Record<string, number>>,
    comments: string,
    recommendation: EvaluationRecommendation,
    total: number,
  ): Promise<void> {
    if (assignment.evaluatorUid !== evaluatorUid || assignment.status === 'done') {
      throw new Error('This evaluation assignment cannot be submitted.');
    }

    const batch = writeBatch(this.firestore);
    const evaluationId = `${assignment.stageId}_${evaluatorUid}`;
    batch.set(
      doc(this.firestore, 'ideas', assignment.ideaId, 'evaluations', evaluationId),
      {
        stageId: assignment.stageId,
        evaluatorUid,
        scores: { ...scores },
        comments: comments.trim(),
        recommendation,
        total,
        submittedAt: serverTimestamp(),
      },
    );
    batch.update(doc(this.firestore, 'assignments', assignment.id), {
      status: 'done',
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  }

  async getEvaluatorAccess(uid: string): Promise<{
    role: User['role'];
    evaluatorType: EvaluatorType | null;
    organization: string | null;
  }> {
    const snapshot = await getDoc(doc(this.firestore, 'users', uid));
    if (!snapshot.exists()) {
      throw new Error('The evaluator profile could not be found.');
    }

    const user = snapshot.data();
    const role = requireUserRole(user['role']);
    const organization =
      user['organization'] === undefined || user['organization'] === null
        ? null
        : requireString(user['organization'], 'organization');
    return {
      role,
      evaluatorType: requireEvaluatorType(user['evaluatorType'], role),
      organization,
    };
  }

  private async getAssignedIdea(
    assignment: IdeaAssignment,
    isExternal: boolean,
  ): Promise<EvaluationIdeaDetails> {
    if (isExternal) {
      return this.getEvaluatorIdeaView(assignment);
    }

    const snapshot = await getDoc(doc(this.firestore, 'ideas', assignment.ideaId));
    if (!snapshot.exists()) {
      throw new Error('An assigned idea could not be found.');
    }
    return toEvaluationIdeaDetails(this.parseIdea(snapshot.id, snapshot.data()));
  }

  private async getEvaluatorIdeaView(assignment: IdeaAssignment): Promise<EvaluatorIdeaView> {
    const snapshot = await getDoc(
      doc(this.firestore, 'ideas', assignment.ideaId, 'evaluatorViews', assignment.id),
    );
    if (!snapshot.exists()) {
      throw new Error('The restricted evaluator view could not be found.');
    }

    const view = parseEvaluatorIdeaView(snapshot.id, snapshot.data());
    if (
      view.ideaId !== assignment.ideaId ||
      view.evaluatorUid !== assignment.evaluatorUid ||
      view.stageId !== assignment.stageId
    ) {
      throw new Error('The restricted evaluator view does not match its assignment.');
    }

    return view;
  }

  private parseUser(uid: string, value: unknown): User {
    const user = requireRecord(value, 'user');
    const profile = requireRecord(user['profile'], 'profile');
    const address = requireRecord(profile['address'], 'address');
    const contacts = requireRecord(profile['contacts'], 'contacts');
    const role = requireUserRole(user['role']);

    return {
      uid,
      email: requireString(user['email'], 'email'),
      fullName: requireString(user['fullName'], 'fullName'),
      emailVerified: requireBoolean(user['emailVerified'], 'emailVerified'),
      phoneNumberVerified: requireBoolean(user['phoneNumberVerified'], 'phoneNumberVerified'),
      role,
      evaluatorType: requireEvaluatorType(user['evaluatorType'], role),
      organization:
        user['organization'] === undefined || user['organization'] === null
          ? null
          : requireString(user['organization'], 'organization'),
      profile: {
        userType: requireUserType(profile['userType']),
        profession: requireString(profile['profession'], 'profession'),
        purpose: requireString(profile['purpose'], 'purpose'),
        plannedLocation: requireString(profile['plannedLocation'], 'plannedLocation'),
        goals: requireString(profile['goals'], 'goals'),
        address: {
          plotNumber: requireString(address['plotNumber'], 'plotNumber'),
          boxNumber: requireString(address['boxNumber'], 'boxNumber'),
          location: requireString(address['location'], 'location'),
        },
        contacts: {
          phoneNumber: requireString(contacts['phoneNumber'], 'phoneNumber'),
        },
        passwordLastSetAt: requireTimestampOrNull(profile['passwordLastSetAt'], 'passwordLastSetAt'),
        onboardingCompleted: requireBoolean(profile['onboardingCompleted'], 'onboardingCompleted'),
        onboardingCompletedAt: requireTimestampOrNull(
          profile['onboardingCompletedAt'],
          'onboardingCompletedAt',
        ),
      },
      createdAt: requireTimestampOrNull(user['createdAt'], 'createdAt'),
      updatedAt: requireTimestampOrNull(user['updatedAt'], 'updatedAt'),
    };
  }

  private parseIdea(id: string, value: unknown): Idea {
    const idea = requireRecord(value, 'idea');
    const createdAt = requireTimestampOrNull(idea['createdAt'], 'createdAt');
    const submittedAt =
      idea['submittedAt'] === undefined
        ? createdAt
        : requireTimestampOrNull(idea['submittedAt'], 'submittedAt');

    return {
      id,
      ownerId: requireString(idea['ownerId'], 'ownerId'),
      ownerName: requireString(idea['ownerName'], 'ownerName'),
      title: requireString(idea['title'], 'title'),
      problem: requireString(idea['problem'], 'problem'),
      proposedSolution: requireString(idea['proposedSolution'], 'proposedSolution'),
      intendedBeneficiaries: requireString(idea['intendedBeneficiaries'], 'intendedBeneficiaries'),
      plannedLocation: requireString(idea['plannedLocation'], 'plannedLocation'),
      marketPlan: parseMarketPlan(idea['marketPlan']),
      feasibilityPlan: parseFeasibilityPlan(idea['feasibilityPlan']),
      financingPlan: parseFinancingPlan(idea['financingPlan']),
      milestones: parseMilestones(idea['milestones']),
      aiAnalysisConsent: idea['aiAnalysisConsent'] === true,
      category: parseIdeaCategory(idea['category']),
      similarityCheck: parseSimilarityCheck(idea['similarityCheck']),
      automatedReview: parseAutomatedReview(idea['automatedReview']),
      status: requireIdeaStatus(idea['status']),
      version: requireIdeaVersion(idea['version']),
      createdAt,
      submittedAt,
      statusEnteredAt:
        idea['statusEnteredAt'] === undefined
          ? null
          : requireTimestampOrNull(idea['statusEnteredAt'], 'statusEnteredAt'),
      updatedAt: requireTimestampOrNull(idea['updatedAt'], 'updatedAt'),
    };
  }

  private parseIdeaFeedback(ideaId: string, id: string, value: unknown): IdeaFeedback {
    const feedback = requireRecord(value, 'idea feedback');
    const rawReply = feedback['reply'];
    let reply: IdeaFeedbackReply | null = null;
    if (rawReply !== null && rawReply !== undefined) {
      const parsedReply = requireRecord(rawReply, 'idea feedback reply');
      reply = {
        message: requireString(parsedReply['message'], 'reply message'),
        at: requireTimestampOrNull(parsedReply['at'], 'reply timestamp'),
      };
    }

    return {
      id,
      ideaId,
      stageId: requireString(feedback['stageId'], 'stageId'),
      evaluatorUid: requireString(feedback['evaluatorUid'], 'evaluatorUid'),
      evaluatorName: requireString(feedback['evaluatorName'], 'evaluatorName'),
      message: requireString(feedback['message'], 'feedback message'),
      requiresResubmission: requireBoolean(
        feedback['requiresResubmission'],
        'requiresResubmission',
      ),
      reply,
      createdAt: requireTimestampOrNull(feedback['createdAt'], 'feedback createdAt'),
    };
  }

  private parseIdeaQuestion(ideaId: string, id: string, value: unknown): IdeaQuestion {
    const question = requireRecord(value, 'idea question');
    const response = question['response'];
    const respondedBy = question['respondedBy'];

    return {
      id,
      ideaId,
      stageId:
        question['stageId'] === undefined || question['stageId'] === null
          ? null
          : requireString(question['stageId'], 'stageId'),
      askedBy: requireString(question['askedBy'], 'askedBy'),
      question: requireString(question['question'], 'question'),
      createdAt: requireTimestampOrNull(question['createdAt'], 'createdAt'),
      response: response === null ? null : requireString(response, 'response'),
      respondedBy: respondedBy === null ? null : requireString(respondedBy, 'respondedBy'),
      respondedAt: requireTimestampOrNull(question['respondedAt'], 'respondedAt'),
    };
  }

  private createEmptyProfile(): Profile {
    return {
      userType: 'individual',
      profession: '',
      purpose: '',
      plannedLocation: '',
      goals: '',
      address: {
        plotNumber: '',
        boxNumber: '',
        location: '',
      },
      contacts: {
        phoneNumber: '',
      },
      passwordLastSetAt: null,
      onboardingCompleted: false,
      onboardingCompletedAt: null,
    };
  }
}

function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`The Firestore ${fieldName} data is not a valid object.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`The Firestore ${fieldName} value is not a string.`);
  }

  return value;
}

function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`The Firestore ${fieldName} value is not a boolean.`);
  }

  return value;
}

function requireNumber(value: unknown, fieldName: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error(`The Firestore ${fieldName} value is not a number.`);
}

function requireIdeaVersion(value: unknown): number {
  if (value === undefined) {
    return 1;
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error('The Firestore idea version is invalid.');
  }
  return value;
}

function requireArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`The Firestore ${fieldName} value is not a list.`);
  }

  return value;
}

function requireStringArray(value: unknown, fieldName: string): string[] {
  return requireArray(value, fieldName).map((item) => requireString(item, fieldName));
}

function requireTimestampOrNull(value: unknown, fieldName: string): Timestamp | null {
  if (value === null || value instanceof Timestamp) {
    return value;
  }

  throw new Error(`The Firestore ${fieldName} value is not a timestamp.`);
}

function parseMarketPlan(value: unknown): IdeaMarketPlan {
  if (value === undefined) {
    return { targetMarket: '', alternatives: '', differentiation: '', marketValidation: '' };
  }

  const plan = requireRecord(value, 'market plan');
  return {
    targetMarket: requireString(plan['targetMarket'], 'targetMarket'),
    alternatives: requireString(plan['alternatives'], 'alternatives'),
    differentiation: requireString(plan['differentiation'], 'differentiation'),
    marketValidation: requireString(plan['marketValidation'], 'marketValidation'),
  };
}

function parseFeasibilityPlan(value: unknown): IdeaFeasibilityPlan {
  if (value === undefined) {
    return {
      technicalApproach: '',
      operationalPlan: '',
      validationEvidence: '',
      assumptions: '',
      risks: '',
    };
  }

  const plan = requireRecord(value, 'feasibility plan');
  return {
    technicalApproach: requireString(plan['technicalApproach'], 'technicalApproach'),
    operationalPlan: requireString(plan['operationalPlan'], 'operationalPlan'),
    validationEvidence: requireString(plan['validationEvidence'], 'validationEvidence'),
    assumptions: requireString(plan['assumptions'], 'assumptions'),
    risks: requireString(plan['risks'], 'risks'),
  };
}

function parseFinancingPlan(value: unknown): IdeaFinancingPlan {
  if (value === undefined) {
    return { currency: 'BWP', totalFundingNeeded: 0, fundingSources: '', costs: [] };
  }

  const plan = requireRecord(value, 'financing plan');
  const costs = plan['costs'];
  if (!Array.isArray(costs)) {
    throw new Error('The Firestore costs value is not a list.');
  }

  return {
    currency: requireString(plan['currency'], 'currency'),
    totalFundingNeeded: requireNumber(plan['totalFundingNeeded'], 'totalFundingNeeded'),
    fundingSources: requireString(plan['fundingSources'], 'fundingSources'),
    costs: costs.map((value) => {
      const cost = requireRecord(value, 'cost item');
      return {
        item: requireString(cost['item'], 'item'),
        amount: requireNumber(cost['amount'], 'amount'),
        description: requireString(cost['description'], 'description'),
      };
    }),
  };
}

function parseMilestones(value: unknown): IdeaMilestone[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('The Firestore milestones value is not a list.');
  }

  return value.map((value) => {
    const milestone = requireRecord(value, 'milestone');
    const estimatedCost = milestone['estimatedCost'];
    const isEmpty =
      estimatedCost === null ||
      estimatedCost === undefined ||
      (typeof estimatedCost === 'string' && estimatedCost.trim() === '');

    return {
      title: requireString(milestone['title'], 'title'),
      targetDate: requireString(milestone['targetDate'], 'targetDate'),
      successMeasure: requireString(milestone['successMeasure'], 'successMeasure'),
      estimatedCost: isEmpty ? null : requireNumber(estimatedCost, 'estimatedCost'),
    };
  });
}

function parseAutomatedReview(value: unknown): AutomatedReviewReport | null {
  if (value === undefined || value === null) {
    return null;
  }

  const review = requireRecord(value, 'automated review');
  const rawCriteria = review['criteria'];
  let criteria: AutomatedReviewReport['criteria'] = null;
  if (rawCriteria !== null) {
    const criterionValues = requireRecord(rawCriteria, 'review criteria');
    criteria = {
      market: parseReviewFinding(criterionValues['market']),
      technical: parseReviewFinding(criterionValues['technical']),
      operations: parseReviewFinding(criterionValues['operations']),
      financial: parseReviewFinding(criterionValues['financial']),
      delivery: parseReviewFinding(criterionValues['delivery']),
      impact: parseReviewFinding(criterionValues['impact']),
    };
  }

  return {
    status: requireAutomatedReviewStatus(review['status']),
    model: requireString(review['model'], 'model'),
    rubricVersion: requireString(review['rubricVersion'], 'rubricVersion'),
    summary: requireString(review['summary'], 'summary'),
    criteria,
    strengths: requireStringArray(review['strengths'], 'strengths'),
    informationGaps: requireStringArray(review['informationGaps'], 'informationGaps'),
    questionsForHumanEvaluator: requireStringArray(
      review['questionsForHumanEvaluator'],
      'questionsForHumanEvaluator',
    ),
    limitations: requireStringArray(review['limitations'], 'limitations'),
    startedAt: requireTimestampOrNull(review['startedAt'], 'startedAt'),
    completedAt: requireTimestampOrNull(review['completedAt'], 'completedAt'),
    failureMessage:
      review['failureMessage'] === null
        ? null
        : requireString(review['failureMessage'], 'failureMessage'),
  };
}

function parseIdeaCategory(value: unknown): IdeaCategory | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (isIdeaCategory(value)) {
    return value;
  }
  if (typeof value === 'string') {
    return 'other';
  }
  throw new Error('The Firestore idea category is invalid.');
}

function parseSimilarityCheck(value: unknown): SimilarityCheckResult | null {
  if (value === undefined || value === null) {
    return null;
  }

  const check = requireRecord(value, 'similarity check');
  const status = check['status'];
  if (status !== 'complete' && status !== 'failed') {
    throw new Error('The Firestore similarity check status is invalid.');
  }
  const comparedIdeas = requireNumber(check['comparedIdeas'], 'comparedIdeas');
  if (!Number.isInteger(comparedIdeas) || comparedIdeas < 0) {
    throw new Error('The Firestore similarity check count is invalid.');
  }
  const truncated = check['truncated'];
  if (typeof truncated !== 'boolean') {
    throw new Error('The Firestore similarity check truncation flag is invalid.');
  }
  const matches = requireArray(check['matches'], 'similarity matches').map((value) => {
    const match = requireRecord(value, 'similar idea match');
    const jaccardSimilarity = requireNumber(match['jaccardSimilarity'], 'jaccardSimilarity');
    if (jaccardSimilarity < 0 || jaccardSimilarity > 1) {
      throw new Error('The Firestore idea similarity score is invalid.');
    }
    return {
      ideaId: requireString(match['ideaId'], 'ideaId'),
      title: requireString(match['title'], 'title'),
      jaccardSimilarity,
      matchingKeywords: requireStringArray(match['matchingKeywords'], 'matchingKeywords'),
    };
  });
  const failureMessage =
    check['failureMessage'] === null
      ? null
      : requireString(check['failureMessage'], 'failureMessage');

  return { status, comparedIdeas, truncated, matches, failureMessage };
}

function parseReviewFinding(value: unknown): AutomatedReviewFinding {
  const finding = requireRecord(value, 'review finding');
  return {
    status: requireReviewFindingStatus(finding['status']),
    evidence: requireStringArray(finding['evidence'], 'evidence'),
    informationGaps: requireStringArray(finding['informationGaps'], 'informationGaps'),
    evaluatorQuestions: requireStringArray(
      finding['evaluatorQuestions'],
      'evaluatorQuestions',
    ),
  };
}

function requireUserRole(value: unknown): User['role'] {
  if (value === 'user') {
    return 'submitter';
  }

  if (
    value === 'submitter' ||
    value === 'evaluator' ||
    value === 'adjudicator' ||
    value === 'agent' ||
    value === 'admin'
  ) {
    return value;
  }

  throw new Error('The Firestore role value is invalid.');
}

function requireEvaluatorType(value: unknown, role: User['role']): EvaluatorType | null {
  if (value === undefined || value === null) {
    return role === 'evaluator' ? 'internal' : null;
  }
  if ((value === 'internal' || value === 'external') && role === 'evaluator') {
    return value;
  }

  throw new Error('The Firestore evaluator type is invalid.');
}

function requireUserType(value: unknown): UserType {
  if (value === 'individual' || value === 'organization') {
    return value;
  }

  throw new Error('The Firestore user type value is invalid.');
}

function requireAutomatedReviewStatus(value: unknown): AutomatedReviewStatus {
  if (value === 'queued' || value === 'running' || value === 'complete' || value === 'failed') {
    return value;
  }

  throw new Error('The Firestore automated review status is invalid.');
}

function requireReviewFindingStatus(value: unknown): ReviewFindingStatus {
  if (
    value === 'supported' ||
    value === 'unclear' ||
    value === 'risk' ||
    value === 'not-enough-information'
  ) {
    return value;
  }

  throw new Error('The Firestore review finding status is invalid.');
}

function parseEvaluationAssignment(id: string, value: unknown): IdeaAssignment {
  const assignment = requireRecord(value, 'evaluation assignment');
  const status = assignment['status'];
  if (status !== 'pending' && status !== 'in_progress' && status !== 'done') {
    throw new Error('The Firestore evaluation assignment status is invalid.');
  }

  return {
    id,
    ideaId: requireString(assignment['ideaId'], 'ideaId'),
    stageId: requireString(assignment['stageId'], 'stageId'),
    evaluatorUid: requireString(assignment['evaluatorUid'], 'evaluatorUid'),
    status,
    dueAt:
      assignment['dueAt'] === undefined || assignment['dueAt'] === null
        ? null
        : requireTimestampOrNull(assignment['dueAt'], 'dueAt'),
    assignedBy: requireString(assignment['assignedBy'], 'assignedBy'),
    createdAt: requireTimestampOrNull(assignment['createdAt'], 'createdAt'),
    updatedAt: requireTimestampOrNull(assignment['updatedAt'], 'updatedAt'),
  };
}

function parseEvaluationStage(id: string, value: unknown): EvaluationStage {
  const stage = requireRecord(value, 'evaluation stage');
  const order = requireNumber(stage['order'], 'stage order');
  if (!Number.isInteger(order) || order < 0) {
    throw new Error('The Firestore evaluation stage order is invalid.');
  }

  return {
    id,
    name: requireString(stage['name'], 'stage name'),
    order,
    criteriaSetId: requireString(stage['criteriaSetId'], 'criteriaSetId'),
    evaluatorUids: requireStringArray(stage['evaluatorUids'], 'evaluatorUids'),
    requiresAdjudication: requireBoolean(stage['requiresAdjudication'], 'requiresAdjudication'),
    isActive: requireBoolean(stage['isActive'], 'isActive'),
  };
}

function parseEvaluatorIdeaView(id: string, value: unknown): EvaluatorIdeaView {
  const view = requireRecord(value, 'evaluator idea view');
  const assignmentId = requireString(view['assignmentId'], 'assignmentId');
  if (assignmentId !== id) {
    throw new Error('The evaluator idea view assignment identifier is inconsistent.');
  }
  const criteriaSetId = requireString(view['criteriaSetId'], 'criteriaSetId');

  return {
    ideaId: requireString(view['ideaId'], 'ideaId'),
    assignmentId,
    evaluatorUid: requireString(view['evaluatorUid'], 'evaluatorUid'),
    stageId: requireString(view['stageId'], 'stageId'),
    stageName: requireString(view['stageName'], 'stageName'),
    criteriaSetId,
    criteriaSet: parseEvaluationCriteriaSet(criteriaSetId, view['criteriaSet']),
    createdAt: requireTimestampOrNull(view['createdAt'], 'createdAt'),
    ...parseEvaluationIdeaDetails(view),
  };
}

function parseEvaluationIdeaDetails(value: Record<string, unknown>): EvaluationIdeaDetails {
  return {
    title: requireString(value['title'], 'title'),
    category: parseIdeaCategory(value['category']),
    problem: requireString(value['problem'], 'problem'),
    proposedSolution: requireString(value['proposedSolution'], 'proposedSolution'),
    intendedBeneficiaries: requireString(value['intendedBeneficiaries'], 'intendedBeneficiaries'),
    plannedLocation: requireString(value['plannedLocation'], 'plannedLocation'),
    marketPlan: parseMarketPlan(value['marketPlan']),
    feasibilityPlan: parseFeasibilityPlan(value['feasibilityPlan']),
    financingPlan: parseFinancingPlan(value['financingPlan']),
    milestones: parseMilestones(value['milestones']),
    automatedReview: parseAutomatedReview(value['automatedReview']),
  };
}

function toEvaluationIdeaDetails(idea: Idea): EvaluationIdeaDetails {
  return {
    title: idea.title,
    category: idea.category,
    problem: idea.problem,
    proposedSolution: idea.proposedSolution,
    intendedBeneficiaries: idea.intendedBeneficiaries,
    plannedLocation: idea.plannedLocation,
    marketPlan: idea.marketPlan,
    feasibilityPlan: idea.feasibilityPlan,
    financingPlan: idea.financingPlan,
    milestones: idea.milestones,
    automatedReview: idea.automatedReview,
  };
}

function parseIdeaEvaluation(ideaId: string, id: string, value: unknown): IdeaEvaluation {
  const evaluation = requireRecord(value, 'idea evaluation');
  const rawScores = requireRecord(evaluation['scores'], 'evaluation scores');
  const scores: Record<string, number> = {};
  for (const [criterionId, score] of Object.entries(rawScores)) {
    scores[criterionId] = requireNumber(score, 'criterion score');
  }

  const recommendation = evaluation['recommendation'];
  if (
    recommendation !== 'advance' &&
    recommendation !== 'revise' &&
    recommendation !== 'decline'
  ) {
    throw new Error('The Firestore evaluation recommendation is invalid.');
  }
  const total = requireNumber(evaluation['total'], 'evaluation total');
  if (total < 0 || total > 100) {
    throw new Error('The Firestore evaluation total is outside the allowed range.');
  }

  return {
    id,
    ideaId,
    stageId: requireString(evaluation['stageId'], 'stageId'),
    evaluatorUid: requireString(evaluation['evaluatorUid'], 'evaluatorUid'),
    scores,
    comments: requireString(evaluation['comments'], 'comments'),
    recommendation,
    total,
    submittedAt: requireTimestampOrNull(evaluation['submittedAt'], 'submittedAt'),
  };
}
