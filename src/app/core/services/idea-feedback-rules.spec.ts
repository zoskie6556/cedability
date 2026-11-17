import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { readFile } from 'node:fs/promises';
import { env } from 'node:process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const hasFirestoreEmulator = Boolean(env['FIRESTORE_EMULATOR_HOST']);
const emulatorDescribe = describe.skipIf(!hasFirestoreEmulator);

emulatorDescribe('idea feedback and version Firestore rules', () => {
  let testEnvironment: RulesTestEnvironment;

  beforeAll(async () => {
    const rules = await readFile(new URL('../../../../firestore.rules', import.meta.url), 'utf8');
    testEnvironment = await initializeTestEnvironment({
      projectId: 'cedability-feedback-rules',
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

  it('lets only the owner read feedback and a prior version', async () => {
    const ownerDb = firestoreFor('owner-1');
    const otherDb = firestoreFor('other-1');

    await assertSucceeds(getDoc(doc(ownerDb, 'ideas', 'idea-1', 'feedback', 'feedback-1')));
    const feedback = await assertSucceeds(
      getDocs(
        query(
          collection(ownerDb, 'ideas', 'idea-1', 'feedback'),
          orderBy('createdAt', 'asc'),
        ),
      ),
    );
    expect(feedback.size).toBe(1);
    await assertSucceeds(getDoc(doc(ownerDb, 'ideas', 'idea-1', 'versions', '1')));

    await assertFails(getDoc(doc(otherDb, 'ideas', 'idea-1', 'feedback', 'feedback-1')));
    await assertFails(getDoc(doc(otherDb, 'ideas', 'idea-1', 'versions', '1')));
  });

  it('allows one bounded owner reply and denies edits to evaluator feedback', async () => {
    const ownerDb = firestoreFor('owner-1');
    const otherDb = firestoreFor('other-1');
    const feedbackRef = doc(ownerDb, 'ideas', 'idea-1', 'feedback', 'feedback-1');

    await assertFails(
      updateDoc(doc(otherDb, 'ideas', 'idea-1', 'feedback', 'feedback-1'), {
        reply: { message: 'Not the owner', at: serverTimestamp() },
      }),
    );
    await assertSucceeds(
      updateDoc(feedbackRef, {
        reply: { message: 'I will update the delivery plan.', at: serverTimestamp() },
      }),
    );
    await assertFails(
      updateDoc(feedbackRef, {
        reply: { message: 'Changing my answer', at: serverTimestamp() },
      }),
    );
    await assertFails(
      updateDoc(doc(ownerDb, 'ideas', 'idea-1', 'feedback', 'feedback-1'), {
        message: 'Changed evaluator feedback',
        reply: { message: 'Reply', at: serverTimestamp() },
      }),
    );
    await assertFails(
      setDoc(doc(ownerDb, 'ideas', 'idea-1', 'feedback', 'new-feedback'), {
        message: 'Client-created evaluator feedback',
      }),
    );
  });

  async function seedDocuments(): Promise<void> {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await Promise.all(
        ['owner-1', 'other-1'].map((uid) =>
          setDoc(doc(db, 'users', uid), {
            uid,
            role: 'submitter',
            email: `${uid}@private.test`,
          }),
        ),
      );
      await setDoc(doc(db, 'ideas', 'idea-1'), { ownerId: 'owner-1' });
      await setDoc(doc(db, 'ideas', 'idea-1', 'feedback', 'feedback-1'), {
        stageId: 'human_review',
        evaluatorUid: 'evaluator-1',
        evaluatorName: 'Evaluator',
        message: 'Please clarify the delivery plan.',
        requiresResubmission: true,
        reply: null,
        createdAt: Timestamp.now(),
      });
      await setDoc(doc(db, 'ideas', 'idea-1', 'versions', '1'), {
        version: 1,
        title: 'Original plan',
      });
    });
  }

  function firestoreFor(uid: string) {
    return testEnvironment.authenticatedContext(uid, { role: 'submitter' }).firestore();
  }
});
