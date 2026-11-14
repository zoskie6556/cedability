import type { Timestamp } from 'firebase/firestore';
import type { Profile } from './profile.model';

export type UserRole = 'user' | 'evaluator' | 'admin';

export interface User {
  uid: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
  phoneNumberVerified: boolean;
  role: UserRole;
  profile: Profile;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}
