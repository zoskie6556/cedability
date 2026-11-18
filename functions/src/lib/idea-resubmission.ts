import { HttpsError } from 'firebase-functions/v2/https';
import { NOTE_REQUIRED } from '../shared/idea-workflow';
import {
  isIdeaAttachmentContentType,
  isIdeaAttachmentPath,
  MAX_IDEA_ATTACHMENT_BYTES,
  MAX_IDEA_ATTACHMENTS,
  type IdeaAttachment,
} from '../shared/idea-attachment.model';

const MAX_FEEDBACK_NOTE_LENGTH = 500;
const MAX_ID_LENGTH = 128;
const IDEA_FIELDS = [
  'ownerId',
  'ownerName',
  'title',
  'problem',
  'proposedSolution',
  'intendedBeneficiaries',
  'plannedLocation',
  'marketPlan',
  'feasibilityPlan',
  'financingPlan',
  'milestones',
  'attachments',
  'aiAnalysisConsent',
] as const;

export interface RequestChangesInput {
  ideaId: string;
  assignmentId: string;
  stageId: string;
  message: string;
}

export interface ResubmissionPlan {
  title: string;
  problem: string;
  proposedSolution: string;
  intendedBeneficiaries: string;
  plannedLocation: string;
  marketPlan: {
    targetMarket: string;
    alternatives: string;
    differentiation: string;
    marketValidation: string;
  };
  feasibilityPlan: {
    technicalApproach: string;
    operationalPlan: string;
    validationEvidence: string;
    assumptions: string;
    risks: string;
  };
  financingPlan: {
    currency: 'BWP' | 'USD' | 'ZAR';
    totalFundingNeeded: number;
    fundingSources: string;
    costs: Array<{ item: string; amount: number; description: string }>;
  };
  milestones: Array<{
    title: string;
    targetDate: string;
    successMeasure: string;
    estimatedCost: number | null;
  }>;
  attachments: IdeaAttachment[];
  aiAnalysisConsent: true;
}

export interface ResubmissionInput {
  ideaId: string;
  expectedVersion: number;
  plan: ResubmissionPlan;
}

export function parseRequestChangesInput(value: unknown): RequestChangesInput {
  const record = asRecord(value, 'request');
  const ideaId = requireId(record['ideaId'], 'ideaId');
  const assignmentId = requireId(record['assignmentId'], 'assignmentId');
  const stageId = requireId(record['stageId'], 'stageId');
  const message = requireText(record['message'], 'message', MAX_FEEDBACK_NOTE_LENGTH);

  if (NOTE_REQUIRED.includes('needs_amendment') && message.length === 0) {
    throw new HttpsError('invalid-argument', 'A written note is required when requesting changes.');
  }

  return { ideaId, assignmentId, stageId, message };
}

export function parseResubmissionInput(value: unknown, ownerUid: string): ResubmissionInput {
  const record = asRecord(value, 'request');
  const ideaId = requireId(record['ideaId'], 'ideaId');
  const expectedVersion = record['expectedVersion'];
  if (
    typeof expectedVersion !== 'number' ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1
  ) {
    throw new HttpsError('invalid-argument', 'The expected idea version is invalid.');
  }

  const rawIdea = asRecord(record['idea'], 'idea');
  if (
    Object.keys(rawIdea).some((key) => !IDEA_FIELDS.includes(key as (typeof IDEA_FIELDS)[number])) ||
    rawIdea['ownerId'] !== ownerUid ||
    typeof rawIdea['ownerName'] !== 'string' ||
    rawIdea['ownerName'].length > 120
  ) {
    throw new HttpsError('invalid-argument', 'The submitted idea identity is invalid.');
  }

  if (rawIdea['aiAnalysisConsent'] !== true) {
    throw new HttpsError('invalid-argument', 'Consent is required before automated screening.');
  }

  const market = asRecord(rawIdea['marketPlan'], 'market plan');
  const feasibility = asRecord(rawIdea['feasibilityPlan'], 'feasibility plan');
  const financing = asRecord(rawIdea['financingPlan'], 'financing plan');
  const currency = financing['currency'];
  if (currency !== 'BWP' && currency !== 'USD' && currency !== 'ZAR') {
    throw new HttpsError('invalid-argument', 'The financing currency is invalid.');
  }

  const rawCosts = financing['costs'];
  if (!Array.isArray(rawCosts) || rawCosts.length < 1 || rawCosts.length > 10) {
    throw new HttpsError('invalid-argument', 'Include between one and ten cost items.');
  }
  const costs = rawCosts.map((value) => {
    const cost = asRecord(value, 'cost item');
    const amount = cost['amount'];
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0.01) {
      throw new HttpsError('invalid-argument', 'Each cost amount must be a positive number.');
    }
    return {
      item: requireText(cost['item'], 'cost item', 500),
      amount,
      description: requireOptionalText(cost['description'], 'cost description', 500),
    };
  });

  const rawMilestones = rawIdea['milestones'];
  if (!Array.isArray(rawMilestones) || rawMilestones.length < 1 || rawMilestones.length > 10) {
    throw new HttpsError('invalid-argument', 'Include between one and ten milestones.');
  }
  const milestones = rawMilestones.map((value) => {
    const milestone = asRecord(value, 'milestone');
    const estimatedCost = milestone['estimatedCost'];
    if (
      estimatedCost !== null &&
      (typeof estimatedCost !== 'number' || !Number.isFinite(estimatedCost) || estimatedCost < 0)
    ) {
      throw new HttpsError('invalid-argument', 'A milestone cost is invalid.');
    }
    const targetDate = requireText(milestone['targetDate'], 'milestone date', 40);
    if (!isValidDate(targetDate)) {
      throw new HttpsError('invalid-argument', 'A milestone date is invalid.');
    }
    return {
      title: requireText(milestone['title'], 'milestone title', 500),
      targetDate,
      successMeasure: requireText(milestone['successMeasure'], 'success measure', 500),
      estimatedCost,
    };
  });
  const attachments = parseIdeaAttachments(rawIdea['attachments'], ownerUid, ideaId);

  return {
    ideaId,
    expectedVersion,
    plan: {
      title: requireText(rawIdea['title'], 'title', 120),
      problem: requireText(rawIdea['problem'], 'problem', 2000),
      proposedSolution: requireText(rawIdea['proposedSolution'], 'proposed solution', 2000),
      intendedBeneficiaries: requireText(rawIdea['intendedBeneficiaries'], 'beneficiaries', 500),
      plannedLocation: requireText(rawIdea['plannedLocation'], 'location', 500),
      marketPlan: {
        targetMarket: requireText(market['targetMarket'], 'target market', 2000),
        alternatives: requireText(market['alternatives'], 'alternatives', 2000),
        differentiation: requireText(market['differentiation'], 'differentiation', 2000),
        marketValidation: requireText(market['marketValidation'], 'market validation', 2000),
      },
      feasibilityPlan: {
        technicalApproach: requireText(feasibility['technicalApproach'], 'technical approach', 2000),
        operationalPlan: requireText(feasibility['operationalPlan'], 'operations plan', 2000),
        validationEvidence: requireText(feasibility['validationEvidence'], 'validation evidence', 2000),
        assumptions: requireText(feasibility['assumptions'], 'assumptions', 2000),
        risks: requireText(feasibility['risks'], 'risks', 2000),
      },
      financingPlan: {
        currency,
        totalFundingNeeded: roundMoney(costs.reduce((sum, cost) => sum + cost.amount, 0)),
        fundingSources: requireText(financing['fundingSources'], 'funding sources', 500),
        costs,
      },
      milestones,
      attachments,
      aiAnalysisConsent: true,
    },
  };
}

function parseIdeaAttachments(value: unknown, ownerUid: string, ideaId: string): IdeaAttachment[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_IDEA_ATTACHMENTS) {
    throw new HttpsError('invalid-argument', 'The attachment list is invalid.');
  }

  const seenIds = new Set<string>();
  return value.map((rawAttachment) => {
    const attachment = asRecord(rawAttachment, 'attachment');
    const id = requireText(attachment['id'], 'attachment id', 36);
    const name = requireText(attachment['name'], 'attachment name', 255);
    const storagePath = attachment['storagePath'];
    const contentType = attachment['contentType'];
    const sizeBytes = attachment['sizeBytes'];
    if (
      !/^[a-f0-9-]{36}$/.test(id) ||
      seenIds.has(id) ||
      !isIdeaAttachmentPath(storagePath, ownerUid, ideaId, id) ||
      !isIdeaAttachmentContentType(contentType) ||
      typeof sizeBytes !== 'number' ||
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes < 1 ||
      sizeBytes > MAX_IDEA_ATTACHMENT_BYTES ||
      Object.keys(attachment).some(
        (key) => !['id', 'name', 'storagePath', 'contentType', 'sizeBytes'].includes(key),
      )
    ) {
      throw new HttpsError('invalid-argument', 'An attachment is invalid.');
    }
    seenIds.add(id);
    return { id, name, storagePath, contentType, sizeBytes };
  });
}

export function readIdeaVersion(value: unknown): number {
  if (value === undefined || value === null) {
    return 1;
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new HttpsError('failed-precondition', 'The stored idea version is invalid.');
  }
  return value;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function requireId(value: unknown, fieldName: string): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > MAX_ID_LENGTH ||
    value.includes('/')
  ) {
    throw new HttpsError('invalid-argument', `The ${fieldName} is invalid.`);
  }
  return value.trim();
}

function requireText(value: unknown, fieldName: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `The ${fieldName} must be text.`);
  }
  const text = value.trim();
  if (!text || text.length > maxLength) {
    throw new HttpsError(
      'invalid-argument',
      `The ${fieldName} must be between 1 and ${maxLength} characters.`,
    );
  }
  return text;
}

function requireOptionalText(value: unknown, fieldName: string, maxLength: number): string {
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new HttpsError('invalid-argument', `The ${fieldName} is invalid.`);
  }
  return value.trim();
}

function asRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', `The ${fieldName} must be an object.`);
  }
  return value as Record<string, unknown>;
}
