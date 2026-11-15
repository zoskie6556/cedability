import { inject, Injectable } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  User,
  UserCredential,
} from '@angular/fire/auth';
<<<<<<< HEAD
import { UserDataService } from './user-data.service';
=======
import { doc, Firestore, serverTimestamp, setDoc } from '@angular/fire/firestore';
>>>>>>> a360f6d5602f1461d424417cc72d0ce3dc33f0ff

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
<<<<<<< HEAD
  private readonly userData = inject(UserDataService);
=======
  private readonly firestore = inject(Firestore);
>>>>>>> a360f6d5602f1461d424417cc72d0ce3dc33f0ff

  async register(fullName: string, email: string, password: string): Promise<void> {
    const { user } = await createUserWithEmailAndPassword(this.auth, email, password);

    try {
<<<<<<< HEAD
      await this.userData.createUserDocument(user.uid, email, fullName);
    } catch (error: unknown) {
      throw new UserDocumentCreationError(error);
=======
      await setDoc(doc(this.firestore, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        mobileVerified: false,
        createdAt: serverTimestamp(),
      });
    } catch (error: unknown) {
      throw new AccountFirestoreWriteError(error);
>>>>>>> a360f6d5602f1461d424417cc72d0ce3dc33f0ff
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

export class UserDocumentCreationError extends Error {
  constructor(readonly originalError: unknown) {
    super('The account was created, but its user document could not be saved.');
    this.name = 'UserDocumentCreationError';
  }
}
