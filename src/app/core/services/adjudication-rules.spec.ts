import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { readFile } from 'node:fs/promises';
import { env } from 'node:process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const hasFirestoreEmulator = Boolean(env['FIRESTORE_EMULATOR_HOST']);
const emulatorDescribe = describe.skipIf(!hasFirestoreEmulator);

emulatorDescribe('adjudication and award Firestore rules', () => {
  let testEnvironment: RulesTestEnvironment;

  beforeAll(async () => {
    const rules = await readFile(new URL('../../../../firestore.rules', import.meta.url), 'utf8');
    testEnvironment = await initializeTestEnvironment({
      projectId: 'cedability-adjudication-rules',
      firestore: { rules },
    });
  });

  afterAll(async () => {
    await testEnvironment.cleanup();
  });

  beforeEach(async () => {
    await testEnvironment.clearFirestore();
    await seedDocuments();
  });

  it('lets adjudicators and admins read decisions but not evaluators or submitters', async () => {
    const decisionPath = ['ideas', 'idea-1', 'adjudications', 'adjudication'] as const;
    await assertSucceeds(
      getDoc(doc(firestoreFor('adjudicator-1', 'adjudicator'), ...decisionPath)),
    );
    await assertSucceeds(getDoc(doc(firestoreFor('admin-1', 'admin'), ...decisionPath)));
    await assertFails(getDoc(doc(firestoreFor('evaluator-1', 'evaluator'), ...decisionPath)));
    await assertFails(getDoc(doc(firestoreFor('owner-1', 'submitter'), ...decisionPath)));
  });

  it('keeps adjudication and award writes behind their authorized Functions', async () => {
    const adjudicationRef = doc(
      firestoreFor('adjudicator-1', 'adjudicator'),
      'ideas',
      'idea-1',
      'adjudications',
      'new-decision',
    );
    const awardRef = doc(firestoreFor('admin-1', 'admin'), 'awards', 'new-award');

    await assertFails(setDoc(adjudicationRef, { decision: 'advance' }));
    await assertFails(
      setDoc(awardRef, {
        ideaId: 'idea-1',
        ownerId: 'owner-1',
        title: 'Innovation Award',
        type: 'grant',
        citation: 'For impact.',
        awardedBy: 'admin-1',
        awardedAt: Timestamp.now(),
        isPublic: false,
      }),
    );
  });

  it('limits private award reads to its owner and staff, and permits public awards', async () => {
    await assertSucceeds(
      getDoc(doc(firestoreFor('owner-1', 'submitter'), 'awards', 'private-award')),
    );
    await assertSucceeds(getDoc(doc(firestoreFor('admin-1', 'admin'), 'awards', 'private-award')));
    await assertFails(getDoc(doc(firestoreFor('other-1', 'submitter'), 'awards', 'private-award')));
    await assertSucceeds(
      getDoc(doc(firestoreFor('other-1', 'submitter'), 'awards', 'public-award')),
    );
    await assertSucceeds(
      getDoc(doc(testEnvironment.unauthenticatedContext().firestore(), 'awards', 'public-award')),
    );
    await assertFails(
      getDoc(doc(testEnvironment.unauthenticatedContext().firestore(), 'awards', 'private-award')),
    );
  });

  async function seedDocuments(): Promise<void> {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'ideas', 'idea-1'), { ownerId: 'owner-1', status: 'approved' });
      await setDoc(doc(db, 'ideas', 'idea-1', 'adjudications', 'adjudication'), {
        stageId: 'adjudication',
        ideaVersion: 1,
        adjudicatorUid: 'adjudicator-1',
        decision: 'advance',
        finalScore: 82,
        note: 'Supported.',
        decidedAt: Timestamp.now(),
      });
      await setDoc(doc(db, 'awards', 'private-award'), {
        ideaId: 'idea-1',
        ownerId: 'owner-1',
        isPublic: false,
      });
      await setDoc(doc(db, 'awards', 'public-award'), {
        ideaId: 'idea-1',
        ownerId: 'owner-1',
        isPublic: true,
      });
    });
  }

  function firestoreFor(uid: string, role: string) {
    return testEnvironment.authenticatedContext(uid, { role }).firestore();
  }
});
