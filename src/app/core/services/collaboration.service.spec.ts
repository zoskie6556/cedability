import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollaborationService } from './collaboration.service';
import type { User } from '../../shared/models/user.model';

const firestoreMocks = vi.hoisted(() => {
  const transaction = {
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
  };

  return {
    transaction,
    documentReference: { path: 'collaborationProfiles/user-123' },
    collection: vi.fn(),
    deleteDoc: vi.fn(),
    doc: vi.fn(),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    limit: vi.fn(),
    query: vi.fn(),
    runTransaction: vi.fn(),
    serverTimestamp: vi.fn(),
    updateDoc: vi.fn(),
    where: vi.fn(),
  };
});

vi.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  collection: firestoreMocks.collection,
  deleteDoc: firestoreMocks.deleteDoc,
  doc: firestoreMocks.doc,
  getDoc: firestoreMocks.getDoc,
  getDocs: firestoreMocks.getDocs,
  limit: firestoreMocks.limit,
  query: firestoreMocks.query,
  runTransaction: firestoreMocks.runTransaction,
  serverTimestamp: firestoreMocks.serverTimestamp,
  updateDoc: firestoreMocks.updateDoc,
  where: firestoreMocks.where,
}));

describe('CollaborationService', () => {
  let service: CollaborationService;

  const user: User = {
    uid: 'user-123',
    email: 'private@example.com',
    fullName: 'Ada Lovelace',
    emailVerified: true,
    phoneNumberVerified: false,
    role: 'submitter',
    profile: {
      userType: 'individual',
      profession: 'Analytical Engineer',
      purpose: 'Private purpose',
      plannedLocation: 'Private location',
      goals: 'Private goals',
      address: { plotNumber: 'private', boxNumber: 'private', location: 'private' },
      contacts: { phoneNumber: 'private' },
      passwordLastSetAt: null,
      onboardingCompleted: true,
      onboardingCompletedAt: null,
    },
    createdAt: null,
    updatedAt: null,
  };

  beforeEach(() => {
    firestoreMocks.transaction.get.mockReset().mockResolvedValue({ exists: () => false });
    firestoreMocks.transaction.set.mockReset();
    firestoreMocks.transaction.update.mockReset();
    firestoreMocks.documentReference.path = 'collaborationProfiles/user-123';
    firestoreMocks.doc.mockReset().mockReturnValue(firestoreMocks.documentReference);
    firestoreMocks.serverTimestamp.mockReset().mockReturnValue('server-timestamp');
    firestoreMocks.runTransaction
      .mockReset()
      .mockImplementation(
        async (
          _firestore: unknown,
          callback: (transaction: typeof firestoreMocks.transaction) => Promise<void>,
        ) => callback(firestoreMocks.transaction),
      );

    TestBed.configureTestingModule({
      providers: [CollaborationService, { provide: Firestore, useValue: {} }],
    });
    service = TestBed.inject(CollaborationService);
  });

  it('publishes only the explicitly selected public profile fields', async () => {
    await service.setDiscoverable(user.uid, user, true);

    const savedData = firestoreMocks.transaction.set.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(savedData).sort()).toEqual(
      [
        'createdAt',
        'discoverable',
        'displayName',
        'displayNameSearch',
        'profession',
        'professionSearch',
        'uid',
        'updatedAt',
      ].sort(),
    );
    expect(savedData).toMatchObject({
      uid: 'user-123',
      displayName: 'Ada Lovelace',
      profession: 'Analytical Engineer',
      displayNameSearch: 'ada lovelace',
      professionSearch: 'analytical engineer',
      discoverable: true,
    });
    expect(savedData).not.toHaveProperty('email');
    expect(savedData).not.toHaveProperty('profile');
  });

  it('rejects self-requests before writing to Firestore', async () => {
    await expect(service.sendRequest(user.uid, user.uid)).rejects.toThrow(
      'You cannot send a collaboration request to yourself.',
    );
    expect(firestoreMocks.runTransaction).not.toHaveBeenCalled();
  });
});
