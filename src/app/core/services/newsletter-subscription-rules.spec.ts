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
const users = ['user-a', 'user-b'] as const;

emulatorDescribe('newsletter preference Firestore rules', () => {
  let testEnvironment: RulesTestEnvironment;

  beforeAll(async () => {
    const rules = await readFile(new URL('../../../../firestore.rules', import.meta.url), 'utf8');
    testEnvironment = await initializeTestEnvironment({
      projectId: 'cedability-newsletter-rules',
      firestore: { rules },
    });
  });

  afterAll(async () => {
    await testEnvironment.cleanup();
  });

  beforeEach(async () => {
    await testEnvironment.clearFirestore();
    await seedUsers();
  });

  it('allows an owner to save and read the canonical preference document', async () => {
    const preferencesRef = doc(
      firestoreFor('user-a'),
      'users',
      'user-a',
      'newsletterPreferences',
      'current',
    );

    await assertSucceeds(setDoc(preferencesRef, makePreferences(true, false)));
    const snapshot = await assertSucceeds(getDoc(preferencesRef));
    expect(snapshot.data()).not.toHaveProperty('email');
    expect(snapshot.data()).toMatchObject({ newsletter: true, promotions: false });
  });

  it('allows an owner to unsubscribe while preserving the original consent timestamps', async () => {
    const preferencesRef = doc(
      firestoreFor('user-a'),
      'users',
      'user-a',
      'newsletterPreferences',
      'current',
    );
    await assertSucceeds(setDoc(preferencesRef, makePreferences(true, true)));

    await assertSucceeds(
      updateDoc(preferencesRef, {
        newsletter: false,
        promotions: false,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('denies other users and unauthenticated clients access to private preferences', async () => {
    const ownerRef = doc(
      firestoreFor('user-a'),
      'users',
      'user-a',
      'newsletterPreferences',
      'current',
    );
    await assertSucceeds(setDoc(ownerRef, makePreferences(true, false)));

    await assertFails(
      getDoc(
        doc(
          firestoreFor('user-b'),
          'users',
          'user-a',
          'newsletterPreferences',
          'current',
        ),
      ),
    );
    await assertFails(
      getDoc(
        doc(
          testEnvironment.unauthenticatedContext().firestore(),
          'users',
          'user-a',
          'newsletterPreferences',
          'current',
        ),
      ),
    );
    await assertFails(
      getDocs(
        collection(firestoreFor('user-a'), 'users', 'user-a', 'newsletterPreferences'),
      ),
    );
  });

  it('rejects non-canonical documents, email fields, and manipulated timestamps', async () => {
    const database = firestoreFor('user-a');
    await assertFails(
      setDoc(
        doc(database, 'users', 'user-a', 'newsletterPreferences', 'duplicate'),
        makePreferences(true, false),
      ),
    );
    await assertFails(
      setDoc(doc(database, 'users', 'user-a', 'newsletterPreferences', 'current'), {
        ...makePreferences(true, false),
        email: 'private@example.test',
      }),
    );

    const preferencesRef = doc(
      database,
      'users',
      'user-a',
      'newsletterPreferences',
      'current',
    );
    await assertSucceeds(setDoc(preferencesRef, makePreferences(true, false)));
    await assertFails(
      updateDoc(preferencesRef, {
        updatedAt: Timestamp.fromMillis(1),
      }),
    );
  });

  async function seedUsers(): Promise<void> {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore();
      for (const uid of users) {
        await setDoc(doc(database, 'users', uid), { role: 'user' });
      }
    });
  }

  function firestoreFor(uid: string) {
    return testEnvironment.authenticatedContext(uid).firestore();
  }
});

function makePreferences(newsletter: boolean, promotions: boolean) {
  return {
    newsletter,
    promotions,
    newsletterConsentedAt: newsletter ? serverTimestamp() : null,
    promotionsConsentedAt: promotions ? serverTimestamp() : null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}
