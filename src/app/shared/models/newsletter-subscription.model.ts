import type { Timestamp } from 'firebase/firestore';

export interface NewsletterSubscriptionPreferences {
  newsletter: boolean;
  promotions: boolean;
  newsletterConsentedAt: Timestamp | null;
  promotionsConsentedAt: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type NewsletterSubscriptionSelection = Pick<
  NewsletterSubscriptionPreferences,
  'newsletter' | 'promotions'
>;
