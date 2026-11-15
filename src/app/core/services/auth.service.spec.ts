import { TestBed } from '@angular/core/testing';
import { Auth, createUserWithEmailAndPassword, updateProfile } from '@angular/fire/auth';
import { doc, Firestore, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { serverTimestamp as createServerTimestamp } from 'firebase/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountFirestoreWriteError, AuthService } from './auth.service';

const firestoreMocks = vi.hoisted(() => ({
  createUserWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock('@angular/fire/auth', () => ({
  Auth: class Auth {},
  createUserWithEmailAndPassword: firestoreMocks.createUserWithEmailAndPassword,
  signInWithEmailAndPassword: vi.fn(),
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
  const userReference = { path: 'users/user-123' };
  const timestamp = createServerTimestamp();
  let authService: AuthService;

  beforeEach(() => {
    vi.mocked(createUserWithEmailAndPassword).mockReset();
    vi.mocked(updateProfile).mockReset();
    vi.mocked(doc).mockReset();
    vi.mocked(serverTimestamp).mockReset();
    vi.mocked(setDoc).mockReset();
    vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({
      user,
    } as Awaited<ReturnType<typeof createUserWithEmailAndPassword>>);
    vi.mocked(updateProfile).mockResolvedValue();
    vi.mocked(doc).mockReturnValue(userReference as ReturnType<typeof doc>);
    vi.mocked(serverTimestamp).mockReturnValue(timestamp);
    vi.mocked(setDoc).mockResolvedValue();

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: Auth, useValue: {} },
        { provide: Firestore, useValue: {} },
      ],
    });
    authService = TestBed.inject(AuthService);
  });

  it('writes the registered user details to users/{uid}', async () => {
    await authService.register('Casey Example', 'casey@example.com', 'password123');

    expect(doc).toHaveBeenCalledWith(expect.anything(), 'users', 'user-123');
    expect(setDoc).toHaveBeenCalledWith(userReference, {
      uid: 'user-123',
      email: 'casey@example.com',
      emailVerified: false,
      mobileVerified: false,
      createdAt: timestamp,
    });
    expect(serverTimestamp).toHaveBeenCalledOnce();
    expect(updateProfile).toHaveBeenCalledWith(user, { displayName: 'Casey Example' });
  });

  it('reports a distinct error when the Firestore write fails after Auth registration', async () => {
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
});
