import { inject, Injectable } from '@angular/core';
import {
  doc,
  Firestore,
  getDoc,
  runTransaction,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Timestamp } from 'firebase/firestore';
import type {
  NewsletterSubscriptionPreferences,
  NewsletterSubscriptionSelection,
} from '../../shared/models/newsletter-subscription.model';

const PREFERENCES_DOCUMENT_ID = 'current';

@Injectable({ providedIn: 'root' })
export class NewsletterSubscriptionService {
  private readonly firestore = inject(Firestore);

  async getPreferences(uid: string): Promise<NewsletterSubscriptionPreferences> {
    const snapshot = await getDoc(this.preferencesDocument(uid));
    return snapshot.exists() ? parsePreferences(snapshot.data()) : emptyPreferences();
  }

  async savePreferences(
    uid: string,
    selection: NewsletterSubscriptionSelection,
  ): Promise<void> {
    const preferencesRef = this.preferencesDocument(uid);

    await runTransaction(this.firestore, async (transaction) => {
      const currentSnapshot = await transaction.get(preferencesRef);
      const current = currentSnapshot.exists()
        ? parsePreferences(currentSnapshot.data())
        : emptyPreferences();
      const firstConsent = selection.newsletter && !current.newsletter;
      const promotionsConsent = selection.promotions && !current.promotions;

      transaction.set(preferencesRef, {
        newsletter: selection.newsletter,
        promotions: selection.promotions,
        newsletterConsentedAt: firstConsent
          ? serverTimestamp()
          : current.newsletterConsentedAt,
        promotionsConsentedAt: promotionsConsent
          ? serverTimestamp()
          : current.promotionsConsentedAt,
        createdAt: current.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  }

  private preferencesDocument(uid: string) {
    if (!uid.trim()) {
      throw new Error('A signed-in user ID is required to manage email preferences.');
    }

    return doc(this.firestore, 'users', uid, 'newsletterPreferences', PREFERENCES_DOCUMENT_ID);
  }
}

function emptyPreferences(): NewsletterSubscriptionPreferences {
  return {
    newsletter: false,
    promotions: false,
    newsletterConsentedAt: null,
    promotionsConsentedAt: null,
    createdAt: null,
    updatedAt: null,
  };
}

function parsePreferences(value: unknown): NewsletterSubscriptionPreferences {
  if (!isRecord(value)) {
    throw new Error('The Firestore email preferences are not a valid object.');
  }

  return {
    newsletter: requireBoolean(value['newsletter'], 'newsletter'),
    promotions: requireBoolean(value['promotions'], 'promotions'),
    newsletterConsentedAt: requireTimestampOrNull(
      value['newsletterConsentedAt'],
      'newsletterConsentedAt',
    ),
    promotionsConsentedAt: requireTimestampOrNull(
      value['promotionsConsentedAt'],
      'promotionsConsentedAt',
    ),
    createdAt: requireTimestampOrNull(value['createdAt'], 'createdAt'),
    updatedAt: requireTimestampOrNull(value['updatedAt'], 'updatedAt'),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`The Firestore ${fieldName} value is not a boolean.`);
  }

  return value;
}

function requireTimestampOrNull(value: unknown, fieldName: string): Timestamp | null {
  if (value === null || value instanceof Timestamp) {
    return value;
  }

  throw new Error(`The Firestore ${fieldName} value is not a timestamp.`);
}
