import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from '@angular/fire/firestore';
import type {
  AgentPresence,
  ChatAvailability,
  ChatBusinessHours,
  ChatMessage,
  ChatSession,
  ChatSettings,
  ChatStatus,
} from '../../core/models/chat.model';

export const DEFAULT_MAX_CONCURRENT_CHATS = 3;

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  isEnabled: true,
  openTime: '09:00',
  closeTime: '16:00',
  workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  timezone: 'Africa/Gaborone',
  maxConcurrentChats: DEFAULT_MAX_CONCURRENT_CHATS,
  profanityEnabled: true,
  profanityAction: 'warn_and_ban',
  profanityStrikeLimit: 3,
  banDurationHours: 24,
  blockedTerms: [],
  autoReplyWaitSeconds: 45,
  waitingAutoReply:
    'Thank you for reaching out to CEDA Support. All consultants are currently assisting other applicants—one will join you shortly.',
  offlineAutoReply:
    'Our live chat consultants are currently offline. Leave your message here and we will respond during working hours (09:00–16:00).',
};

/** Thrown when a message is rejected by the profanity rules. Safe to show to the user. */
export class ChatModerationError extends Error {}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const STAFF_ROLES = new Set(['agent', 'admin']);

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly firestore = inject(Firestore);
  private settingsCache: ChatSettings | null = null;

  // ---------- Settings (settings/chat, written by the admin Settings page) ----------

  async getChatSettings(force = false): Promise<ChatSettings> {
    if (this.settingsCache && !force) {
      return this.settingsCache;
    }
    try {
      const snap = await getDoc(doc(this.firestore, 'settings/chat'));
      const data = snap.exists() ? (snap.data() as Partial<ChatSettings>) : {};
      this.settingsCache = {
        ...DEFAULT_CHAT_SETTINGS,
        ...data,
        workingDays:
          Array.isArray(data.workingDays) && data.workingDays.length
            ? data.workingDays
            : DEFAULT_CHAT_SETTINGS.workingDays,
        blockedTerms: Array.isArray(data.blockedTerms) ? data.blockedTerms : [],
      };
    } catch (error) {
      console.error('[ChatService] could not load chat settings, using defaults.', error);
      this.settingsCache = this.settingsCache ?? { ...DEFAULT_CHAT_SETTINGS };
    }
    return this.settingsCache;
  }

  async getBusinessHours(): Promise<ChatBusinessHours> {
    const s = await this.getChatSettings(true);
    return {
      enabled: s.isEnabled,
      open: s.openTime,
      close: s.closeTime,
      workingDays: s.workingDays,
      timezone: s.timezone,
    };
  }

  async checkAvailability(hours: ChatBusinessHours): Promise<ChatAvailability> {
    const withinBusinessHours = hours.enabled && this.isWithinHours(hours);
    let agentAvailable = false;
    if (withinBusinessHours) {
      try {
        const snap = await getDocs(
          query(collection(this.firestore, 'agentPresence'), where('isAvailable', '==', true)),
        );
        agentAvailable = !snap.empty;
      } catch (error) {
        console.error('[ChatService] could not check agent presence.', error);
      }
    }
    return { withinBusinessHours, agentAvailable };
  }

  // ---------- Client side ----------

  async findOpenChatForUser(uid: string): Promise<ChatSession | null> {
    const snap = await getDocs(
      query(
        collection(this.firestore, 'chats'),
        where('userId', '==', uid),
        where('status', 'in', ['waiting', 'active', 'offline_message']),
      ),
    );
    if (snap.empty) {
      return null;
    }
    const sessions = snap.docs.map((d) => this.toSession(d.id, d.data({ serverTimestamps: 'estimate' })));
    return sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  }

  async startChat(uid: string, userName: string, isLive: boolean): Promise<ChatSession> {
    const status: ChatStatus = isLive ? 'waiting' : 'offline_message';
    const ref = await addDoc(collection(this.firestore, 'chats'), {
      userId: uid,
      userName,
      status,
      handledBy: null,
      handledByName: null,
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      closedAt: null,
    });

    const now = new Date();
    const session: ChatSession = {
      id: ref.id,
      userId: uid,
      userName,
      status,
      handledBy: null,
      handledByName: null,
      startedAt: now,
      updatedAt: now,
      closedAt: null,
    };

    if (!isLive) {
      const settings = await this.getChatSettings();
      await this.sendSystemMessage(session, settings.offlineAutoReply);
    }
    return session;
  }

  async sendMessage(chat: ChatSession, uid: string, role: string, rawText: string): Promise<void> {
    const text = rawText.trim();
    if (!text) {
      return;
    }
    const finalText = STAFF_ROLES.has(role) ? text : await this.moderate(uid, text);
    await this.addMessage(chat.id, uid, role, finalText);
  }

  async sendSystemMessage(chat: ChatSession, text: string): Promise<void> {
    await this.addMessage(chat.id, 'system', 'system', text);
  }

  async closeChat(chat: ChatSession, closedBy?: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'chats', chat.id), {
      status: 'closed',
      closedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...(closedBy ? { closedBy } : {}),
    });
  }

  listenToChat(
    chatId: string,
    onNext: (chat: ChatSession | null) => void,
    onError?: (error: unknown) => void,
  ): () => void {
    return onSnapshot(
      doc(this.firestore, 'chats', chatId),
      (snap) => onNext(snap.exists() ? this.toSession(snap.id, snap.data({ serverTimestamps: 'estimate' })) : null),
      (error) => onError?.(error),
    );
  }

  listenToMessages(
    chatId: string,
    onNext: (messages: ChatMessage[]) => void,
    onError?: (error: unknown) => void,
  ): () => void {
    return onSnapshot(
      query(collection(this.firestore, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc')),
      (snap) =>
        onNext(
          snap.docs.map((d) => {
            const data = d.data({ serverTimestamps: 'estimate' });
            return {
              id: d.id,
              chatId,
              senderUid: data['senderUid'],
              senderRole: data['senderRole'],
              text: data['text'],
              createdAt: this.toDate(data['createdAt']),
            } as ChatMessage;
          }),
        ),
      (error) => onError?.(error),
    );
  }

  // ---------- Agent side ----------

  async getAgentPresence(uid: string): Promise<AgentPresence> {
    const snap = await getDoc(doc(this.firestore, 'agentPresence', uid));
    if (snap.exists()) {
      const d = snap.data();
      return {
        uid,
        name: d['name'] ?? '',
        isAvailable: !!d['isAvailable'],
        maxConcurrentChats: Number(d['maxConcurrentChats']) || DEFAULT_MAX_CONCURRENT_CHATS,
      };
    }
    const settings = await this.getChatSettings();
    return { uid, name: '', isAvailable: false, maxConcurrentChats: settings.maxConcurrentChats };
  }

  async setAgentAvailability(uid: string, name: string, isAvailable: boolean, maxConcurrentChats: number): Promise<void> {
    const settings = await this.getChatSettings(true);
    await setDoc(
      doc(this.firestore, 'agentPresence', uid),
      {
        uid,
        name,
        isAvailable,
        maxConcurrentChats: settings.maxConcurrentChats || maxConcurrentChats,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  listenToAgentQueue(
    uid: string,
    onNext: (chats: ChatSession[]) => void,
    onError?: (error: unknown) => void,
  ): () => void {
    void uid;
    return onSnapshot(
      query(collection(this.firestore, 'chats'), where('status', 'in', ['waiting', 'offline_message', 'active'])),
      (snap) =>
        onNext(
          snap.docs
            .map((d) => this.toSession(d.id, d.data({ serverTimestamps: 'estimate' })))
            .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime()),
        ),
      (error) => onError?.(error),
    );
  }

  async claimChat(chat: ChatSession, uid: string, agentName: string): Promise<void> {
    const [presence, active] = await Promise.all([
      this.getAgentPresence(uid),
      getDocs(
        query(
          collection(this.firestore, 'chats'),
          where('handledBy', '==', uid),
          where('status', '==', 'active'),
        ),
      ),
    ]);
    if (active.size >= presence.maxConcurrentChats) {
      throw new Error(`You already have ${presence.maxConcurrentChats} active chats.`);
    }

    const ref = doc(this.firestore, 'chats', chat.id);
    await runTransaction(this.firestore, async (tx) => {
      const snap = await tx.get(ref);
      const status = snap.data()?.['status'];
      if (status !== 'waiting' && status !== 'offline_message') {
        throw new Error('This chat has already been claimed or closed.');
      }
      tx.update(ref, {
        status: 'active',
        handledBy: uid,
        handledByName: agentName,
        updatedAt: serverTimestamp(),
      });
    });

    await this.addMessage(chat.id, 'system', 'system', `${agentName} has joined the chat.`);
  }

  // ---------- Internals ----------

  private async addMessage(chatId: string, senderUid: string, senderRole: string, text: string): Promise<void> {
    await addDoc(collection(this.firestore, 'chats', chatId, 'messages'), {
      senderUid,
      senderRole,
      text,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(this.firestore, 'chats', chatId), { updatedAt: serverTimestamp() });
  }

  /** Applies the admin profanity rules. Returns the (possibly masked) text or throws ChatModerationError. */
  private async moderate(uid: string, text: string): Promise<string> {
    const settings = await this.getChatSettings();
    if (!settings.profanityEnabled || settings.blockedTerms.length === 0) {
      return text;
    }

    const banRef = doc(this.firestore, 'chatModeration', uid);
    const banSnap = await getDoc(banRef);
    const bannedUntil = banSnap.data()?.['bannedUntil'];
    if (bannedUntil instanceof Timestamp && bannedUntil.toMillis() > Date.now()) {
      throw new ChatModerationError('You are temporarily blocked from chatting because of repeated language violations.');
    }

    const lower = text.toLowerCase();
    const hits = settings.blockedTerms.filter((t) => t && lower.includes(t));
    if (hits.length === 0) {
      return text;
    }

    if (settings.profanityAction === 'mask') {
      return hits.reduce(
        (out, term) => out.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => '*'.repeat(m.length)),
        text,
      );
    }

    if (settings.profanityAction === 'block') {
      throw new ChatModerationError('Your message contains language that is not allowed.');
    }

    // warn_and_ban
    const strikes = (Number(banSnap.data()?.['strikes']) || 0) + 1;
    if (strikes >= settings.profanityStrikeLimit) {
      const hours = settings.banDurationHours > 0 ? settings.banDurationHours : 24 * 365 * 100;
      await setDoc(banRef, { strikes: 0, bannedUntil: Timestamp.fromMillis(Date.now() + hours * 3600 * 1000) }, { merge: true });
      throw new ChatModerationError('You have been temporarily blocked from chatting because of repeated language violations.');
    }
    await setDoc(banRef, { strikes }, { merge: true });
    throw new ChatModerationError(
      `Please keep the conversation respectful. Warning ${strikes} of ${settings.profanityStrikeLimit}.`,
    );
  }

  private isWithinHours(hours: ChatBusinessHours): boolean {
    let weekday: string;
    let minutes: number;
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: hours.timezone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date());
      weekday = (parts.find((p) => p.type === 'weekday')?.value ?? '').slice(0, 3).toLowerCase();
      const h = Number(parts.find((p) => p.type === 'hour')?.value);
      const m = Number(parts.find((p) => p.type === 'minute')?.value);
      minutes = h * 60 + m;
    } catch {
      const now = new Date();
      weekday = DAY_KEYS[now.getDay()];
      minutes = now.getHours() * 60 + now.getMinutes();
    }
    const toMinutes = (v: string) => {
      const [h, m] = v.split(':').map(Number);
      return h * 60 + (m || 0);
    };
    return hours.workingDays.includes(weekday) && minutes >= toMinutes(hours.open) && minutes < toMinutes(hours.close);
  }

  private toDate(value: unknown): Date | null {
    return value instanceof Timestamp ? value.toDate() : null;
  }

  private toSession(id: string, d: DocumentData): ChatSession {
    return {
      id,
      userId: d['userId'],
      userName: d['userName'] ?? 'Applicant',
      status: d['status'],
      handledBy: d['handledBy'] ?? null,
      handledByName: d['handledByName'] ?? null,
      startedAt: this.toDate(d['startedAt']) ?? new Date(),
      updatedAt: this.toDate(d['updatedAt']) ?? new Date(),
      closedAt: this.toDate(d['closedAt']),
    };
  }
}