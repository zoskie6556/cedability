import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { Timestamp } from 'firebase/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewsletterSubscriptionService } from './newsletter-subscription.service';

const firestoreMocks = vi.hoisted(() => {
  const transaction = {
    get: vi.fn(),
    set: vi.fn(),
  };

  return {
    documentReference: { path: 'users/user-123/newsletterPreferences/current' },
    doc: vi.fn(),
    getDoc: vi.fn(),
    runTransaction: vi.fn(),
    serverTimestamp: vi.fn(),
    transaction,
  };
});

vi.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: firestoreMocks.doc,
  getDoc: firestoreMocks.getDoc,
  runTransaction: firestoreMocks.runTransaction,
  serverTimestamp: firestoreMocks.serverTimestamp,
}));

describe('NewsletterSubscriptionService', () => {
  let service: NewsletterSubscriptionService;

  beforeEach(() => {
    firestoreMocks.documentReference.path = 'users/user-123/newsletterPreferences/current';
    firestoreMocks.doc.mockReset().mockReturnValue(firestoreMocks.documentReference);
    firestoreMocks.getDoc.mockReset();
    firestoreMocks.serverTimestamp.mockReset().mockReturnValue('server-timestamp');
    firestoreMocks.transaction.get.mockReset().mockResolvedValue({ exists: () => false });
    firestoreMocks.transaction.set.mockReset();
    firestoreMocks.runTransaction
      .mockReset()
      .mockImplementation(
        async (
          _firestore: unknown,
          callback: (transaction: typeof firestoreMocks.transaction) => Promise<void>,
        ) => callback(firestoreMocks.transaction),
      );

    TestBed.configureTestingModule({
      providers: [NewsletterSubscriptionService, { provide: Firestore, useValue: {} }],
    });
    service = TestBed.inject(NewsletterSubscriptionService);
  });

  it('defaults both independent options to off when no preference document exists', async () => {
    firestoreMocks.getDoc.mockResolvedValue({ exists: () => false });

    await expect(service.getPreferences('user-123')).resolves.toMatchObject({
      newsletter: false,
      promotions: false,
      newsletterConsentedAt: null,
      promotionsConsentedAt: null,
    });
  });

  it('stores opt-ins and timestamps in one canonical user-scoped document', async () => {
    await service.savePreferences('user-123', { newsletter: true, promotions: true });

    expect(firestoreMocks.doc).toHaveBeenCalledWith(
      expect.anything(),
      'users',
      'user-123',
      'newsletterPreferences',
      'current',
    );
    expect(firestoreMocks.transaction.set).toHaveBeenCalledWith(
      firestoreMocks.documentReference,
      {
        newsletter: true,
        promotions: true,
        newsletterConsentedAt: 'server-timestamp',
        promotionsConsentedAt: 'server-timestamp',
        createdAt: 'server-timestamp',
        updatedAt: 'server-timestamp',
      },
    );
    expect(firestoreMocks.runTransaction).toHaveBeenCalledOnce();
  });

  it('preserves consent history when a user unsubscribes', async () => {
    const newsletterConsentedAt = Timestamp.fromMillis(1);
    const promotionsConsentedAt = Timestamp.fromMillis(2);
    const createdAt = Timestamp.fromMillis(3);
    firestoreMocks.transaction.get.mockResolvedValue({
      exists: () => true,
      data: () => ({
        newsletter: true,
        promotions: true,
        newsletterConsentedAt,
        promotionsConsentedAt,
        createdAt,
        updatedAt: Timestamp.fromMillis(4),
      }),
    });

    await service.savePreferences('user-123', { newsletter: false, promotions: false });

    expect(firestoreMocks.transaction.set).toHaveBeenCalledWith(
      firestoreMocks.documentReference,
      expect.objectContaining({
        newsletter: false,
        promotions: false,
        newsletterConsentedAt,
        promotionsConsentedAt,
        createdAt,
        updatedAt: 'server-timestamp',
      }),
    );
  });

  it('rejects empty user IDs before attempting Firestore access', async () => {
    await expect(
      service.savePreferences(' ', { newsletter: true, promotions: false }),
    ).rejects.toThrow('A signed-in user ID is required');
    expect(firestoreMocks.doc).not.toHaveBeenCalled();
  });
});
