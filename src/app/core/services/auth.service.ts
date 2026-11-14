import { inject, Injectable } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  UserCredential,
} from '@angular/fire/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);

  async register(fullName: string, email: string, password: string): Promise<void> {
    const { user } = await createUserWithEmailAndPassword(this.auth, email, password);

    try {
      await updateProfile(user, { displayName: fullName });
    } catch (error: unknown) {
      throw new AccountProfileUpdateError(error);
    }
  }

  signIn(email: string, password: string): Promise<UserCredential> {
    return signInWithEmailAndPassword(this.auth, email, password);
  }
}

export class AccountProfileUpdateError extends Error {
  constructor(readonly originalError: unknown) {
    super('The account was created, but the display name could not be saved.');
    this.name = 'AccountProfileUpdateError';
  }
}
