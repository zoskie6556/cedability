import { createHash, randomUUID } from 'node:crypto';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { createTtsProvider, type SynthesizedAudio } from './tts-provider';
import { DEFAULT_VOICES, type VoiceDefinition, type VoiceTheme } from './voice';

const MAX_TEXT_CHARACTERS = 1_500;
const MAX_DAILY_CHARACTERS = 15_000;
const MAX_DAILY_REQUESTS = 100;
const CACHE_LEASE_MS = 120_000;
const CACHE_WAIT_MS = 30_000;
const CACHE_POLL_MS = 250;

interface SynthesizeSpeechInput {
  text: string;
  voiceId: string;
  rate: number;
}

interface SpeechResponse {
  audioBase64: string;
  contentType: string;
  isMock: boolean;
}

type CacheDecision = 'generate' | 'ready' | 'wait';

export const listVoices = onCall(async (request) => {
  requireAuthenticatedUid(request);
  return { voices: await readVoices() };
});

export const synthesizeSpeech = onCall(
  {
    timeoutSeconds: 60,
    maxInstances: 10,
  },
  async (request): Promise<SpeechResponse> => {
    const uid = requireAuthenticatedUid(request);
    const input = parseSynthesisInput(request.data);
    const voices = await readVoices();
    const voice = voices.find((candidate) => candidate.id === input.voiceId);
    if (!voice) {
      throw new HttpsError('invalid-argument', 'Choose one of the available voices.');
    }

    const provider = createTtsProvider();
    const cacheId = createCacheId(provider.id, voice, input.rate, input.text);
    const filePath = `tts-cache/${cacheId}.${provider.id === 'mock' ? 'wav' : 'mp3'}`;
    const file = getStorage().bucket().file(filePath);
    const db = getFirestore();

    await reserveDailyQuota(db, uid, input.text.length);

    try {
      const [alreadyCached] = await file.exists();
      if (alreadyCached) {
        return await readCachedAudio(file, provider.id);
      }

      const cacheRef = db.collection('ttsCache').doc(cacheId);
      const leaseOwner = randomUUID();
      const decision = await claimCache(cacheRef, file, leaseOwner, provider.id, filePath);

      if (decision === 'ready' || decision === 'wait') {
        return await waitForCachedAudio(file, provider.id);
      }

      try {
        const audio = await provider.synthesize(input.text, voice, input.rate);
        await saveAudio(file, audio, cacheId, voice.id, input.rate);
        await cacheRef.set(
          {
            status: 'ready',
            provider: provider.id,
            voiceId: voice.id,
            rate: input.rate,
            storagePath: filePath,
            contentType: audio.contentType,
            isMock: audio.isMock,
            updatedAt: FieldValue.serverTimestamp(),
            leaseOwner: FieldValue.delete(),
            leaseExpiresAt: FieldValue.delete(),
          },
          { merge: true },
        );

        return toSpeechResponse(audio);
      } catch (error) {
        await releaseCacheClaim(cacheRef, leaseOwner);
        logger.error('Accessibility speech synthesis failed.', { cacheId, error });
        throw new HttpsError('unavailable', 'Online speech is temporarily unavailable.');
      }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error('Accessibility speech request failed.', { cacheId, error });
      throw new HttpsError('unavailable', 'Online speech is temporarily unavailable.');
    }
  },
);

export function normalizeSpeechText(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'Text must be a string.');
  }

  const normalized = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    throw new HttpsError('invalid-argument', 'Text must not be empty.');
  }
  if (normalized.length > MAX_TEXT_CHARACTERS) {
    throw new HttpsError(
      'invalid-argument',
      `Text must be ${MAX_TEXT_CHARACTERS} characters or fewer per request.`,
    );
  }

  return normalized;
}

export function createCacheId(
  providerId: string,
  voice: VoiceDefinition,
  rate: number,
  normalizedText: string,
): string {
  const cacheInput = JSON.stringify([providerId, voice.id, voice.language, rate, normalizedText]);
  return createHash('sha256').update(cacheInput).digest('hex');
}

function requireAuthenticatedUid(request: CallableRequest<unknown>): string {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in to use online speech.');
  }
  return request.auth.uid;
}

function parseSynthesisInput(value: unknown): SynthesizeSpeechInput {
  if (!isRecord(value)) {
    throw new HttpsError('invalid-argument', 'A speech request is required.');
  }

  const allowedKeys = ['text', 'voiceId', 'rate'];
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new HttpsError('invalid-argument', 'The speech request contains unsupported fields.');
  }

  const text = normalizeSpeechText(value['text']);
  const voiceId = value['voiceId'];
  const rate = value['rate'] ?? 1;
  if (typeof voiceId !== 'string' || voiceId.length < 1 || voiceId.length > 120) {
    throw new HttpsError('invalid-argument', 'Choose a valid voice.');
  }
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0.5 || rate > 2) {
    throw new HttpsError('invalid-argument', 'Speech rate must be between 0.5 and 2.');
  }

  return { text, voiceId, rate };
}

async function readVoices(): Promise<VoiceDefinition[]> {
  const snapshot = await getFirestore().doc('settings/voices').get();
  if (!snapshot.exists) {
    return [...DEFAULT_VOICES];
  }

  const data = snapshot.data();
  if (!data || !Array.isArray(data['voices']) || data['voices'].length < 1 || data['voices'].length > 10) {
    throw new HttpsError('failed-precondition', 'The configured voice list is invalid.');
  }

  const voices = data['voices'].map(parseVoiceDefinition);
  if (new Set(voices.map((voice) => voice.id)).size !== voices.length) {
    throw new HttpsError('failed-precondition', 'Configured voice IDs must be unique.');
  }
  return voices;
}

function parseVoiceDefinition(value: unknown): VoiceDefinition {
  if (!isRecord(value)) {
    throw new HttpsError('failed-precondition', 'A configured voice is invalid.');
  }

  const { id, displayName, description, language, theme } = value;
  if (
    typeof id !== 'string' ||
    id.trim().length === 0 ||
    id.length > 120 ||
    typeof displayName !== 'string' ||
    displayName.trim().length === 0 ||
    displayName.length > 80 ||
    typeof description !== 'string' ||
    description.length > 240 ||
    typeof language !== 'string' ||
    !/^[a-z]{2}-[A-Z]{2}$/.test(language) ||
    (theme !== 'warm' && theme !== 'cool' && theme !== 'deep')
  ) {
    throw new HttpsError('failed-precondition', 'A configured voice is invalid.');
  }

  return { id, displayName, description, language, theme: theme as VoiceTheme };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function reserveDailyQuota(
  db: FirebaseFirestore.Firestore,
  uid: string,
  characterCount: number,
): Promise<void> {
  const utcDay = new Date().toISOString().slice(0, 10);
  const usageRef = db.doc(`users/${uid}/usage/${utcDay}`);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(usageRef);
    const data = snapshot.data();
    const usedCharacters = typeof data?.['characters'] === 'number' ? data['characters'] : 0;
    const requestCount = typeof data?.['requests'] === 'number' ? data['requests'] : 0;

    if (
      usedCharacters + characterCount > MAX_DAILY_CHARACTERS ||
      requestCount + 1 > MAX_DAILY_REQUESTS
    ) {
      throw new HttpsError(
        'resource-exhausted',
        'Your daily online speech limit has been reached. Try again tomorrow.',
      );
    }

    transaction.set(
      usageRef,
      {
        utcDay,
        characters: usedCharacters + characterCount,
        requests: requestCount + 1,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

async function claimCache(
  cacheRef: FirebaseFirestore.DocumentReference,
  file: ReturnType<ReturnType<typeof getStorage>['bucket']>['file'] extends (...args: never[]) => infer T
    ? T
    : never,
  leaseOwner: string,
  providerId: string,
  storagePath: string,
): Promise<CacheDecision> {
  return getFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(cacheRef);
    const status = snapshot.get('status');
    const [fileExists] = await file.exists();

    if (status === 'ready' && fileExists) {
      return 'ready';
    }

    const leaseExpiresAt = snapshot.get('leaseExpiresAt');
    if (
      status === 'generating' &&
      leaseExpiresAt instanceof Timestamp &&
      leaseExpiresAt.toMillis() > Date.now()
    ) {
      return 'wait';
    }

    transaction.set(
      cacheRef,
      {
        status: 'generating',
        provider: providerId,
        storagePath,
        leaseOwner,
        leaseExpiresAt: Timestamp.fromMillis(Date.now() + CACHE_LEASE_MS),
        createdAt: snapshot.get('createdAt') ?? FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return 'generate';
  });
}

async function waitForCachedAudio(
  file: ReturnType<ReturnType<typeof getStorage>['bucket']>['file'] extends (...args: never[]) => infer T
    ? T
    : never,
  providerId: string,
): Promise<SpeechResponse> {
  const deadline = Date.now() + CACHE_WAIT_MS;
  while (Date.now() < deadline) {
    const [exists] = await file.exists();
    if (exists) {
      return readCachedAudio(file, providerId);
    }
    await new Promise((resolve) => setTimeout(resolve, CACHE_POLL_MS));
  }

  throw new HttpsError('unavailable', 'Speech audio is still being prepared. Please try again.');
}

async function readCachedAudio(
  file: ReturnType<ReturnType<typeof getStorage>['bucket']>['file'] extends (...args: never[]) => infer T
    ? T
    : never,
  providerId: string,
): Promise<SpeechResponse> {
  const [[bytes], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
  return {
    audioBase64: bytes.toString('base64'),
    contentType: metadata.contentType ?? (providerId === 'mock' ? 'audio/wav' : 'audio/mpeg'),
    isMock: metadata.metadata?.['isMock'] === 'true',
  };
}

async function saveAudio(
  file: ReturnType<ReturnType<typeof getStorage>['bucket']>['file'] extends (...args: never[]) => infer T
    ? T
    : never,
  audio: SynthesizedAudio,
  cacheId: string,
  voiceId: string,
  rate: number,
): Promise<void> {
  await file.save(audio.bytes, {
    resumable: false,
    metadata: {
      contentType: audio.contentType,
      cacheControl: 'private, max-age=31536000',
      metadata: {
        cacheId,
        isMock: String(audio.isMock),
        voiceId,
        rate: String(rate),
      },
    },
  });
}

function toSpeechResponse(audio: SynthesizedAudio): SpeechResponse {
  return {
    audioBase64: audio.bytes.toString('base64'),
    contentType: audio.contentType,
    isMock: audio.isMock,
  };
}

async function releaseCacheClaim(
  cacheRef: FirebaseFirestore.DocumentReference,
  leaseOwner: string,
): Promise<void> {
  await getFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(cacheRef);
    if (snapshot.exists && snapshot.get('leaseOwner') === leaseOwner) {
      transaction.delete(cacheRef);
    }
  });
}
