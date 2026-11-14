import type { Timestamp } from 'firebase/firestore';

export type UserType = 'individual' | 'organization';

export interface UserAddress {
  plotNumber: string;
  boxNumber: string;
  location: string;
}

export interface UserContacts {
  phoneNumber: string;
}

export interface Profile {
  userType: UserType;
  profession: string;
  purpose: string;
  plannedLocation: string;
  goals: string;
  address: UserAddress;
  contacts: UserContacts;
  // skills: string[];
  passwordLastSetAt: Timestamp | null;
  onboardingCompleted: boolean;
  onboardingCompletedAt: Timestamp | null;
}
