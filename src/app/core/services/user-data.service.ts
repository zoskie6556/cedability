import { inject, Injectable } from '@angular/core';
import { User as FirebaseUser } from '@angular/fire/auth';
import {
  addDoc,
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Timestamp } from 'firebase/firestore';
import type { IdeaQuestion } from '../../shared/models/idea-evaluation.model';
import type {
  AutomatedReviewFinding,
  AutomatedReviewReport,
  AutomatedReviewStatus,
  Idea,
  IdeaFeasibilityPlan,
  IdeaFinancingPlan,
  IdeaMarketPlan,
  IdeaMilestone,
  NewIdea,
  ReviewFindingStatus,
} from '../../shared/models/idea.model';
import type { IdeaStatus } from '../../shared/models/idea.model';
import type { Profile, UserType } from '../../shared/models/profile.model';
import type { User } from '../../shared/models/user.model';

@Injectable({ providedIn: 'root' })
export class UserDataService {
  private readonly firestore = inject(Firestore);

  async createUserDocument(uid: string, email: string, fullName: string): Promise<void> {
    const userRef = doc(this.firestore, 'users', uid);

    await setDoc(userRef, {
      uid,
      email,
      fullName,
      emailVerified: false,
      phoneNumberVerified: false,
      role: 'user',
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

  async getIdeasForUser(uid: string): Promise<Idea[]> {
    const ideaCollection = collection(this.firestore, 'ideas');
    const userIdeasQuery = query(ideaCollection, where('ownerId', '==', uid));
    const snapshot = await getDocs(userIdeasQuery);

    return snapshot.docs
      .map((ideaDocument) => this.parseIdea(ideaDocument.id, ideaDocument.data()))
      .sort((first, second) => (second.createdAt?.toMillis() ?? 0) - (first.createdAt?.toMillis() ?? 0));
  }

  async getIdeasForEvaluator(): Promise<Idea[]> {
    const snapshot = await getDocs(collection(this.firestore, 'ideas'));

    return snapshot.docs
      .map((ideaDocument) => this.parseIdea(ideaDocument.id, ideaDocument.data()))
      .sort((first, second) => (second.createdAt?.toMillis() ?? 0) - (first.createdAt?.toMillis() ?? 0));
  }

  async getQuestionsForIdea(ideaId: string): Promise<IdeaQuestion[]> {
    const questions = collection(this.firestore, 'ideas', ideaId, 'questions');
    const snapshot = await getDocs(query(questions, orderBy('createdAt', 'asc')));

    return snapshot.docs.map((questionDocument) =>
      this.parseIdeaQuestion(ideaId, questionDocument.id, questionDocument.data()),
    );
  }

  async addEvaluatorQuestion(ideaId: string, askedBy: string, question: string): Promise<void> {
    const questions = collection(this.firestore, 'ideas', ideaId, 'questions');
    await addDoc(questions, {
      askedBy,
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

  private parseUser(uid: string, value: unknown): User {
    const user = requireRecord(value, 'user');
    const profile = requireRecord(user['profile'], 'profile');
    const address = requireRecord(profile['address'], 'address');
    const contacts = requireRecord(profile['contacts'], 'contacts');

    return {
      uid,
      email: requireString(user['email'], 'email'),
      fullName: requireString(user['fullName'], 'fullName'),
      emailVerified: requireBoolean(user['emailVerified'], 'emailVerified'),
      phoneNumberVerified: requireBoolean(user['phoneNumberVerified'], 'phoneNumberVerified'),
      role: requireUserRole(user['role']),
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
      automatedReview: parseAutomatedReview(idea['automatedReview']),
      status: requireIdeaStatus(idea['status']),
      createdAt: requireTimestampOrNull(idea['createdAt'], 'createdAt'),
      updatedAt: requireTimestampOrNull(idea['updatedAt'], 'updatedAt'),
    };
  }

  private parseIdeaQuestion(ideaId: string, id: string, value: unknown): IdeaQuestion {
    const question = requireRecord(value, 'idea question');
    const response = question['response'];
    const respondedBy = question['respondedBy'];

    return {
      id,
      ideaId,
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
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`The Firestore ${fieldName} value is not a number.`);
  }

  return value;
}

function requireStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`The Firestore ${fieldName} value is not a list.`);
  }

  return value.map((item) => requireString(item, fieldName));
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
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('The Firestore milestones value is not a list.');
  }

  return value.map((value) => {
    const milestone = requireRecord(value, 'milestone');
    const estimatedCost = milestone['estimatedCost'];
    return {
      title: requireString(milestone['title'], 'title'),
      targetDate: requireString(milestone['targetDate'], 'targetDate'),
      successMeasure: requireString(milestone['successMeasure'], 'successMeasure'),
      estimatedCost:
        estimatedCost === null ? null : requireNumber(estimatedCost, 'estimatedCost'),
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

function requireIdeaStatus(value: unknown): IdeaStatus {
  if (
    value === 'submitted' ||
    value === 'under-review' ||
    value === 'needs-revision' ||
    value === 'accepted' ||
    value === 'declined'
  ) {
    return value;
  }

  throw new Error('The Firestore idea status value is invalid.');
}
