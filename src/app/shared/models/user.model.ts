import type { Timestamp } from 'firebase/firestore';
import type { EvaluatorType } from './idea-evaluation.model';
import type { Profile } from './profile.model';

export type UserRole = `submitter` | `evaluator` | `adjudicator` | `admin` | `agent`;

export interface User {
  uid: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
  phoneNumberVerified: boolean;
  role: UserRole;
  evaluatorType: EvaluatorType | null;
  organization: string | null;
  profile: Profile;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}
