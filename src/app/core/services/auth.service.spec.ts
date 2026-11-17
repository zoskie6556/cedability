import { TestBed } from '@angular/core/testing';
import {
  Auth,
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signOut,
  updatePassword,
  updateProfile,
  User,
} from '@angular/fire/auth';
import { doc, Firestore, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { serverTimestamp as createServerTimestamp } from 'firebase/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountFirestoreWriteError,
  AuthService,
  PasswordChangeUnavailableError,
} from './auth.service';
import { UserDataService } from './user-data.service';

const firestoreMocks = vi.hoisted(() => ({
  createUserWithEmailAndPassword: vi.fn(),
  emailCredential: vi.fn(),
  reauthenticateWithCredential: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signOut: vi.fn(),
  updatePassword: vi.fn(),
  updateProfile: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock('@angular/fire/auth', () => ({
  Auth: class Auth {},
  EmailAuthProvider: { PROVIDER_ID: 'password', credential: firestoreMocks.emailCredential },
  createUserWithEmailAndPassword: firestoreMocks.createUserWithEmailAndPassword,
  reauthenticateWithCredential: firestoreMocks.reauthenticateWithCredential,
  sendPasswordResetEmail: firestoreMocks.sendPasswordResetEmail,
  signInWithEmailAndPassword: vi.fn(),
  signOut: firestoreMocks.signOut,
  updatePassword: firestoreMocks.updatePassword,
  updateProfile: firestoreMocks.updateProfile,
}));

vi.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  doc: firestoreMocks.doc,
  serverTimestamp: firestoreMocks.serverTimestamp,
  setDoc: firestoreMocks.setDoc,
}));

describe('AuthService', () => {
  const user = {
    uid: 'user-123',
    email: 'casey@example.com',
    emailVerified: false,
  };
  const firebaseUser = {
    uid: 'user-123',
    email: 'casey@example.com',
    providerData: [{ providerId: 'password' }],
  } as User;
  const userReference = { path: 'users/user-123' };
  const authInstance: { currentUser: User | null } = { currentUser: firebaseUser };
  const timestamp = createServerTimestamp();
  let authService: AuthService;

  beforeEach(() => {
    vi.mocked(createUserWithEmailAndPassword).mockReset();
    vi.mocked(EmailAuthProvider.credential).mockReset();
    vi.mocked(reauthenticateWithCredential).mockReset();
    vi.mocked(sendPasswordResetEmail).mockReset();
    vi.mocked(signOut).mockReset();
    vi.mocked(updatePassword).mockReset();
    vi.mocked(updateProfile).mockReset();
    vi.mocked(doc).mockReset();
    vi.mocked(serverTimestamp).mockReset();
    vi.mocked(setDoc).mockReset();
    vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({
      user,
    } as Awaited<ReturnType<typeof createUserWithEmailAndPassword>>);
    authInstance.currentUser = firebaseUser;
    vi.mocked(EmailAuthProvider.credential).mockReturnValue(
      { providerId: 'password' } as ReturnType<typeof EmailAuthProvider.credential>,
    );
    vi.mocked(reauthenticateWithCredential).mockResolvedValue({
      user: firebaseUser,
    } as Awaited<ReturnType<typeof reauthenticateWithCredential>>);
    vi.mocked(updatePassword).mockResolvedValue();
    vi.mocked(updateProfile).mockResolvedValue();
    vi.mocked(doc).mockReturnValue(userReference as ReturnType<typeof doc>);
    vi.mocked(serverTimestamp).mockReturnValue(timestamp);
    vi.mocked(setDoc).mockResolvedValue();

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        UserDataService,
        { provide: Auth, useValue: authInstance },
        { provide: Firestore, useValue: {} },
      ],
    });
    authService = TestBed.inject(AuthService);
  });

  it('creates a complete user record and updates the auth profile', async () => {
    await authService.register('Casey Example', 'casey@example.com', 'password123');

    expect(doc).toHaveBeenCalledWith(expect.anything(), 'users', 'user-123');
    expect(setDoc).toHaveBeenCalledWith(userReference, {
      uid: 'user-123',
      email: 'casey@example.com',
      fullName: 'Casey Example',
      emailVerified: false,
      phoneNumberVerified: false,
      role: 'user',
      profile: {
        userType: 'individual',
        profession: '',
        purpose: '',
        plannedLocation: '',
        goals: '',
        address: {
          plotNumber: '',
          boxNumber: '',
          location: '',
        },
        contacts: {
          phoneNumber: '',
        },
        passwordLastSetAt: null,
        onboardingCompleted: false,
        onboardingCompletedAt: null,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    expect(serverTimestamp).toHaveBeenCalledTimes(2);
    expect(updateProfile).toHaveBeenCalledWith(user, { displayName: 'Casey Example' });
  });

  it('reports a distinct error when creating the user record fails after Auth registration', async () => {
    const writeError = new Error('Firestore unavailable');
    vi.mocked(setDoc).mockRejectedValue(writeError);

    await expect(
      authService.register('Casey Example', 'casey@example.com', 'password123'),
    ).rejects.toMatchObject({
      name: 'AccountFirestoreWriteError',
      originalError: writeError,
    });
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('signs out the current Firebase Authentication user', async () => {
    vi.mocked(signOut).mockResolvedValue();

    await authService.signOut();

    expect(signOut).toHaveBeenCalledWith(authInstance);
  });

  it('sends password reset emails through Firebase Authentication', async () => {
    vi.mocked(sendPasswordResetEmail).mockResolvedValue();

    await authService.sendPasswordResetEmail('casey@example.com');

    expect(sendPasswordResetEmail).toHaveBeenCalledWith(authInstance, 'casey@example.com');
  });

  it('propagates Firebase password reset errors to the caller', async () => {
    const resetError = new Error('Firebase is unavailable');
    vi.mocked(sendPasswordResetEmail).mockRejectedValue(resetError);

    await expect(authService.sendPasswordResetEmail('casey@example.com')).rejects.toBe(resetError);
  });

  it('reauthenticates the current account before changing its password', async () => {
    const credential = { providerId: 'password' } as ReturnType<typeof EmailAuthProvider.credential>;
    vi.mocked(EmailAuthProvider.credential).mockReturnValue(credential);
    await authService.changePassword('old-password', 'new-password');

    expect(EmailAuthProvider.credential).toHaveBeenCalledWith(
      'casey@example.com',
      'old-password',
    );
    expect(reauthenticateWithCredential).toHaveBeenCalledWith(firebaseUser, credential);
    expect(updatePassword).toHaveBeenCalledWith(firebaseUser, 'new-password');
    expect(vi.mocked(reauthenticateWithCredential).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(updatePassword).mock.invocationCallOrder[0],
    );
  });

  it('does not change the password if reauthentication fails', async () => {
    const reauthenticationError = new Error('Current password is incorrect');
    vi.mocked(reauthenticateWithCredential).mockRejectedValue(reauthenticationError);

    await expect(
      authService.changePassword('wrong-password', 'new-password'),
    ).rejects.toBe(reauthenticationError);
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('rejects password changes when there is no signed-in password account', async () => {
    authInstance.currentUser = null;

    await expect(
      authService.changePassword('old-password', 'new-password'),
    ).rejects.toBeInstanceOf(PasswordChangeUnavailableError);
    expect(reauthenticateWithCredential).not.toHaveBeenCalled();
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('propagates Firebase sign-out failures to the caller', async () => {
    const signOutError = new Error('Firebase is unavailable');
    vi.mocked(signOut).mockRejectedValue(signOutError);

    await expect(authService.signOut()).rejects.toBe(signOutError);
  });
});
