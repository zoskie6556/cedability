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
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { readFile } from 'node:fs/promises';
import { env } from 'node:process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const hasFirestoreEmulator = Boolean(env['FIRESTORE_EMULATOR_HOST']);
const emulatorDescribe = describe.skipIf(!hasFirestoreEmulator);
const users = ['user-a', 'user-b', 'user-c'] as const;
const pairId = 'user-a~user-b';

emulatorDescribe('collaboration Firestore rules', () => {
  let testEnvironment: RulesTestEnvironment;

  beforeAll(async () => {
    const rules = await readFile(new URL('../../../../firestore.rules', import.meta.url), 'utf8');
    testEnvironment = await initializeTestEnvironment({
      projectId: 'cedability-collaboration-rules',
      firestore: { rules },
    });
  });

  afterAll(async () => {
    await testEnvironment.cleanup();
  });

  beforeEach(async () => {
    await testEnvironment.clearFirestore();
  });

  it('allows opt-in directory profiles with no private fields and supports prefix search', async () => {
    await seedUsers();
    await seedDirectoryProfiles(['user-b']);
    const aliceDb = firestoreFor('user-a');
    const profileRef = doc(aliceDb, 'collaborationProfiles', 'user-a');

    await assertSucceeds(
      setDoc(profileRef, {
        ...directoryProfile('user-a', 'Ada Lovelace', 'Engineer'),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(getDoc(doc(aliceDb, 'users', 'user-b')));

    const result = await assertSucceeds(
      getDocs(
        query(
          collection(aliceDb, 'collaborationProfiles'),
          where('discoverable', '==', true),
          where('displayNameSearch', '>=', 'grace'),
          where('displayNameSearch', '<=', 'grace\uf8ff'),
        ),
      ),
    );
    expect(result.docs.map((document) => document.id)).toEqual(['user-b']);
    expect(result.docs[0].data()).not.toHaveProperty('email');
  });

  it('blocks self-requests, duplicate pending requests, and non-participant reads', async () => {
    await seedUsers();
    await seedDirectoryProfiles(['user-a', 'user-b']);
    const aliceDb = firestoreFor('user-a');
    const validRequest = makePendingRequest();
    await assertSucceeds(setDoc(doc(aliceDb, 'collaborationPairs', pairId), validRequest));
    await assertFails(setDoc(doc(aliceDb, 'collaborationPairs', pairId), validRequest));
    await assertFails(
      setDoc(doc(aliceDb, 'collaborationPairs', 'user-a~user-a'), {
        ...validRequest,
        participants: ['user-a', 'user-a'],
        recipientUid: 'user-a',
      }),
    );
    await assertFails(getDoc(doc(firestoreFor('user-c'), 'collaborationPairs', pairId)));
  });

  it('allows only the recipient to accept or decline a pending request', async () => {
    await seedUsers();
    await seedDirectoryProfiles(['user-a', 'user-b']);
    await seedPendingPair();
    const senderDb = firestoreFor('user-a');
    const recipientDb = firestoreFor('user-b');
    const statusChange = {
      status: 'accepted',
      updatedAt: serverTimestamp(),
      respondedAt: serverTimestamp(),
    };

    await assertFails(updateDoc(doc(senderDb, 'collaborationPairs', pairId), statusChange));
    await assertSucceeds(updateDoc(doc(recipientDb, 'collaborationPairs', pairId), statusChange));
  });

  it('allows the recipient to decline but not the sender', async () => {
    await seedUsers();
    await seedPendingPair();
    const senderDb = firestoreFor('user-a');
    const recipientDb = firestoreFor('user-b');
    const decline = {
      status: 'declined',
      updatedAt: serverTimestamp(),
      respondedAt: serverTimestamp(),
    };

    await assertFails(updateDoc(doc(senderDb, 'collaborationPairs', pairId), decline));
    await assertSucceeds(updateDoc(doc(recipientDb, 'collaborationPairs', pairId), decline));
  });

  it('allows only the sender to cancel and permits a fresh request after cancellation', async () => {
    await seedUsers();
    await seedDirectoryProfiles(['user-a', 'user-b']);
    await seedPendingPair();
    const senderDb = firestoreFor('user-a');
    const recipientDb = firestoreFor('user-b');
    const cancellation = {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
      respondedAt: serverTimestamp(),
    };

    await assertFails(updateDoc(doc(recipientDb, 'collaborationPairs', pairId), cancellation));
    await assertSucceeds(updateDoc(doc(senderDb, 'collaborationPairs', pairId), cancellation));
    await assertSucceeds(
      updateDoc(doc(recipientDb, 'collaborationPairs', pairId), {
        senderUid: 'user-b',
        recipientUid: 'user-a',
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        respondedAt: null,
      }),
    );
  });

  it('rejects invalid directory fields and prevents changes to accepted relationships', async () => {
    await seedUsers();
    const aliceDb = firestoreFor('user-a');
    await assertFails(
      setDoc(doc(aliceDb, 'collaborationProfiles', 'user-a'), {
        ...directoryProfile('user-a', 'Ada Lovelace', 'Analytical Engineer'),
        email: 'private@example.com',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    await seedPair('accepted');
    await assertFails(
      updateDoc(doc(aliceDb, 'collaborationPairs', pairId), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
        respondedAt: serverTimestamp(),
      }),
    );
  });

  async function seedUsers(): Promise<void> {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      for (const [index, uid] of users.entries()) {
        const name = uid === 'user-b' ? 'Grace Hopper' : `Member ${index + 1}`;
        await setDoc(doc(db, 'users', uid), {
          uid,
          role: 'user',
          fullName: name,
          email: `${uid}@private.test`,
          profile: { profession: 'Engineer' },
        });
      }
    });
  }

  async function seedDirectoryProfiles(uids: readonly string[]): Promise<void> {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      for (const uid of uids) {
        const name = uid === 'user-b' ? 'Grace Hopper' : 'Ada Lovelace';
        await setDoc(
          doc(db, 'collaborationProfiles', uid),
          directoryProfile(uid, name, 'Engineer'),
        );
      }
    });
  }

  async function seedPendingPair(): Promise<void> {
    await seedPair('pending');
  }

  async function seedPair(status: 'pending' | 'accepted' | 'cancelled'): Promise<void> {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'collaborationPairs', pairId), {
        ...makePendingRequest(),
        status,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        respondedAt: status === 'pending' ? null : Timestamp.now(),
      });
    });
  }

  function firestoreFor(uid: string) {
    return testEnvironment.authenticatedContext(uid).firestore();
  }
});

function directoryProfile(uid: string, displayName: string, profession: string) {
  return {
    uid,
    displayName,
    profession,
    displayNameSearch: displayName.trim().toLowerCase(),
    professionSearch: profession.trim().toLowerCase(),
    discoverable: true,
  };
}

function makePendingRequest() {
  return {
    participants: ['user-a', 'user-b'],
    senderUid: 'user-a',
    recipientUid: 'user-b',
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    respondedAt: null,
  };
}
