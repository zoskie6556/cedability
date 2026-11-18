import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { ref, uploadBytes } from 'firebase/storage';
import { readFile } from 'node:fs/promises';
import { env } from 'node:process';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const hasStorageEmulator = Boolean(
  env['FIREBASE_STORAGE_EMULATOR_HOST'] && env['FIRESTORE_EMULATOR_HOST'],
);
const emulatorDescribe = describe.skipIf(!hasStorageEmulator);

emulatorDescribe('idea attachment Storage rules', () => {
  let testEnvironment: RulesTestEnvironment;

  beforeAll(async () => {
    const rules = await readFile(new URL('../../../../storage.rules', import.meta.url), 'utf8');
    testEnvironment = await initializeTestEnvironment({
      projectId: 'cedability-idea-attachment-rules',
      firestore: {
        rules: `rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /{document=**} { allow read, write: if true; }
            }
          }`,
      },
      storage: { rules },
    });
  });

  afterAll(async () => {
    await testEnvironment.cleanup();
  });

  beforeEach(async () => {
    await testEnvironment.clearStorage();
  });

  it('allows the owner to upload a supported file and denies another user', async () => {
    const path = 'users/owner-1/thato/ideas/idea-1/images/0f881e52-7649-4873-8290-15a663d8d568.pdf';
    const file = new Uint8Array([37, 80, 68, 70]);
    const ownerStorage = testEnvironment.authenticatedContext('owner-1').storage();
    const otherStorage = testEnvironment.authenticatedContext('other-1').storage();

    await assertSucceeds(uploadBytes(ref(ownerStorage, path), file, { contentType: 'application/pdf' }));
    await assertFails(uploadBytes(ref(otherStorage, path), file, { contentType: 'application/pdf' }));
  });

  it('rejects unsupported content types and files above the size limit', async () => {
    const storage = testEnvironment.authenticatedContext('owner-1').storage();
    const base = 'users/owner-1/thato/ideas/idea-1/images';

    await assertFails(
      uploadBytes(ref(storage, `${base}/0f881e52-7649-4873-8290-15a663d8d568.exe`), new Uint8Array([1]), {
        contentType: 'application/octet-stream',
      }),
    );
    await assertFails(
      uploadBytes(
        ref(storage, `${base}/1f881e52-7649-4873-8290-15a663d8d568.pdf`),
        new Uint8Array(10 * 1024 * 1024 + 1),
        { contentType: 'application/pdf' },
      ),
    );
  });
});
