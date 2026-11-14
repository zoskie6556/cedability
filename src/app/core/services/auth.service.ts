import { inject, Injectable } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  UserCredential,
} from '@angular/fire/auth';
import { doc, Firestore, serverTimestamp, setDoc } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);

  async register(fullName: string, email: string, password: string): Promise<void> {
    const { user } = await createUserWithEmailAndPassword(this.auth, email, password);

    try {
      await setDoc(doc(this.firestore, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        mobileVerified: false,
        createdAt: serverTimestamp(),
      });
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
