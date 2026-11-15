import { inject, Injectable } from '@angular/core';
import {
  Auth,
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword,
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

  sendPasswordResetEmail(email: string): Promise<void> {
    return sendPasswordResetEmail(this.auth, email);
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = this.auth.currentUser;
    if (
      !user?.email ||
      !user.providerData.some(({ providerId }) => providerId === EmailAuthProvider.PROVIDER_ID)
    ) {
      throw new PasswordChangeUnavailableError();
    }

    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
  }

  signOut(): Promise<void> {
    return firebaseSignOut(this.auth);
  }

  async getCurrentUser(): Promise<User | null> {
    await this.auth.authStateReady();
    return this.auth.currentUser;
  }
}

export class PasswordChangeUnavailableError extends Error {
  constructor() {
    super('Password changes are only available for signed-in email and password accounts.');
    this.name = 'PasswordChangeUnavailableError';
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

