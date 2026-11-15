import { inject, Injectable } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  User,
  UserCredential,
} from '@angular/fire/auth';
import { UserDataService } from './user-data.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly userData = inject(UserDataService);

  async register(fullName: string, email: string, password: string): Promise<void> {
    const { user } = await createUserWithEmailAndPassword(this.auth, email, password);

    try {
      await this.userData.createUserDocument(user.uid, email, fullName);
    } catch (error: unknown) {
      throw new AccountFirestoreWriteError(error);
    }

    try {
      await updateProfile(user, { displayName: fullName });
    } catch (error: unknown) {
      throw new AccountProfileUpdateError(error);
    }
  }

  signIn(email: string, password: string): Promise<UserCredential> {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  async getCurrentUser(): Promise<User | null> {
    await this.auth.authStateReady();
    return this.auth.currentUser;
  }
}

export class AccountFirestoreWriteError extends Error {
  constructor(readonly originalError: unknown) {
    super('The account was created, but its user record could not be saved.');
    this.name = 'AccountFirestoreWriteError';
  }
}

export class AccountProfileUpdateError extends Error {
  constructor(readonly originalError: unknown) {
    super('The account was created, but the display name could not be saved.');
    this.name = 'AccountProfileUpdateError';
  }
}

