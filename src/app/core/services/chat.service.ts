import { inject, Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  doc,
  Firestore,
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
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type Unsubscribe,
} from '@angular/fire/firestore';
import type {
  AgentPresence,
  ChatAnalyticsSummary,
  ChatAvailability,
  ChatBusinessHours,
  ChatMessage,
  ChatSession,
  ChatStatus,
} from '../../shared/models/chat.model';

/** Used when `agentPresence/{uid}` does not yet set its own cap. */
export const DEFAULT_MAX_CONCURRENT_CHATS = 5;

/** Used when `settings/chat` has not been configured yet. */
const FALLBACK_BUSINESS_HOURS: ChatBusinessHours = {
  timezone: 'Africa/Gaborone',
  days: [1, 2, 3, 4, 5],
  open: '09:00',
  close: '16:00',
  holidays: [],
};

const ISO_WEEKDAY_BY_SHORT_NAME: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

const STATUSES: ReadonlyArray<ChatStatus> = ['waiting', 'active', 'closed', 'offline_message'];

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly firestore = inject(Firestore);

  // ---- Business hours and availability ----

  async getBusinessHours(): Promise<ChatBusinessHours> {
    try {
      const snapshot = await getDoc(doc(this.firestore, 'settings', 'chat'));
      if (!snapshot.exists()) {
        return FALLBACK_BUSINESS_HOURS;
      }
      return this.toBusinessHours(snapshot.data());
    } catch (error) {
      console.error('[ChatService] could not read settings/chat; using fallback hours.', error);
      return FALLBACK_BUSINESS_HOURS;
    }
  }

  isWithinBusinessHours(hours: ChatBusinessHours, at: Date = new Date()): boolean {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: hours.timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(at);

    const part = (type: string): string => parts.find((item) => item.type === type)?.value ?? '';
    const isoWeekday = ISO_WEEKDAY_BY_SHORT_NAME[part('weekday')] ?? 0;
    const dateKey = `${part('year')}-${part('month')}-${part('day')}`;
    const timeKey = `${part('hour')}:${part('minute')}`;

    if (hours.holidays.includes(dateKey)) {
      return false;
    }
    if (!hours.days.includes(isoWeekday)) {
      return false;
    }
    return timeKey >= hours.open && timeKey < hours.close;
  }

  /** Whether live chat should be offered right now. Offline-message fallback otherwise. */
  async checkAvailability(hours?: ChatBusinessHours): Promise<ChatAvailability> {
    const businessHours = hours ?? (await this.getBusinessHours());
    const withinBusinessHours = this.isWithinBusinessHours(businessHours);
    if (!withinBusinessHours) {
      return { withinBusinessHours: false, agentAvailable: false };
    }

    try {
      const snapshot = await getDocs(
        query(collection(this.firestore, 'agentPresence'), where('isAvailable', '==', true)),
      );
      const agentAvailable = snapshot.docs.some((document) => {
        const data = document.data();
        const activeChatCount = Number(data['activeChatCount'] ?? 0);
        const maxConcurrentChats = Number(data['maxConcurrentChats'] ?? DEFAULT_MAX_CONCURRENT_CHATS);
        return activeChatCount < maxConcurrentChats;
      });
      return { withinBusinessHours: true, agentAvailable };
    } catch (error) {
      console.error('[ChatService] could not read agentPresence.', error);
      return { withinBusinessHours: true, agentAvailable: false };
    }
  }

  // ---- Submitter (client) flow ----

  /** The caller's own most recent chat that is still waiting or active, if any. */
  async findOpenChatForUser(uid: string): Promise<ChatSession | null> {
    const [waiting, active] = await Promise.all([
      getDocs(query(collection(this.firestore, 'chats'), where('userId', '==', uid), where('status', '==', 'waiting'))),
      getDocs(query(collection(this.firestore, 'chats'), where('userId', '==', uid), where('status', '==', 'active'))),
    ]);

    const candidates = [...waiting.docs, ...active.docs].map((document) => this.toChatSession(document));
    if (candidates.length === 0) {
      return null;
    }

    return candidates.sort(
      (left, right) => (right.startedAt?.getTime() ?? 0) - (left.startedAt?.getTime() ?? 0),
    )[0];
  }

  async startChat(userId: string, userName: string, isLive: boolean): Promise<ChatSession> {
    const chatsCollection = collection(this.firestore, 'chats');
    const documentReference = await addDoc(chatsCollection, {
      userId,
      userName,
      status: isLive ? 'waiting' : 'offline_message',
      handledBy: null,
      handledByName: null,
      startedAt: serverTimestamp(),
      closedAt: null,
      lastMessageAt: serverTimestamp(),
      firstResponseAt: null,
    });

    const snapshot = await getDoc(documentReference);
    return this.toChatSession(snapshot);
  }

  listenToChat(chatId: string, onChange: (chat: ChatSession | null) => void, onError: (error: Error) => void): Unsubscribe {
    return onSnapshot(
      doc(this.firestore, 'chats', chatId),
      (snapshot) => onChange(snapshot.exists() ? this.toChatSession(snapshot) : null),
      (error) => onError(error),
    );
  }

  listenToMessages(chatId: string, onChange: (messages: ChatMessage[]) => void, onError: (error: Error) => void): Unsubscribe {
    const messagesQuery = query(
      collection(this.firestore, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc'),
    );
    return onSnapshot(
      messagesQuery,
      (snapshot) => onChange(snapshot.docs.map((document) => this.toChatMessage(document))),
      (error) => onError(error),
    );
  }

  async sendMessage(chat: ChatSession, senderUid: string, senderRole: string, text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    const chatRef = doc(this.firestore, 'chats', chat.id);
    const messageRef = doc(collection(this.firestore, 'chats', chat.id, 'messages'));
    const isAssignedAgentReply = chat.handledBy === senderUid;

    const batch = writeBatch(this.firestore);
    batch.set(messageRef, {
      senderUid,
      senderRole,
      text: trimmed,
      createdAt: serverTimestamp(),
    });

    const chatUpdate: Record<string, unknown> = { lastMessageAt: serverTimestamp() };
    if (isAssignedAgentReply && !chat.firstResponseAt) {
      chatUpdate['firstResponseAt'] = serverTimestamp();
    }
    batch.update(chatRef, chatUpdate);

    await batch.commit();
  }

  /** Ends a chat. Pass the acting agent's uid so their active-chat count is released. */
  async closeChat(chat: ChatSession, closingAgentUid?: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'chats', chat.id), {
      status: 'closed',
      closedAt: serverTimestamp(),
    });

    if (closingAgentUid) {
      await this.adjustActiveChatCount(closingAgentUid, -1);
    }
  }

  // ---- Agent flow ----

  async getAgentPresence(uid: string): Promise<AgentPresence | null> {
    const snapshot = await getDoc(doc(this.firestore, 'agentPresence', uid));
    return snapshot.exists() ? this.toAgentPresence(uid, snapshot.data()) : null;
  }

  async setAgentAvailability(
    uid: string,
    displayName: string,
    isAvailable: boolean,
    maxConcurrentChats: number = DEFAULT_MAX_CONCURRENT_CHATS,
  ): Promise<void> {
    const existing = await this.getAgentPresence(uid);
    await setDoc(doc(this.firestore, 'agentPresence', uid), {
      uid,
      displayName,
      isAvailable,
      activeChatCount: existing?.activeChatCount ?? 0,
      maxConcurrentChats,
      updatedAt: serverTimestamp(),
    });
  }

  /** Live queue: chats waiting for any agent, plus chats this agent already holds. */
  listenToAgentQueue(
    agentUid: string,
    onChange: (chats: ChatSession[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const waitingByChat = new Map<string, ChatSession>();
    const ownedByChat = new Map<string, ChatSession>();
    const emit = (): void => {
      onChange([...waitingByChat.values(), ...ownedByChat.values()]);
    };

    const unsubscribeWaiting = onSnapshot(
      query(collection(this.firestore, 'chats'), where('status', '==', 'waiting')),
      (snapshot) => {
        waitingByChat.clear();
        snapshot.docs.forEach((document) => waitingByChat.set(document.id, this.toChatSession(document)));
        emit();
      },
      onError,
    );

    const unsubscribeOwned = onSnapshot(
      query(
        collection(this.firestore, 'chats'),
        where('status', '==', 'active'),
        where('handledBy', '==', agentUid),
      ),
      (snapshot) => {
        ownedByChat.clear();
        snapshot.docs.forEach((document) => ownedByChat.set(document.id, this.toChatSession(document)));
        emit();
      },
      onError,
    );

    return () => {
      unsubscribeWaiting();
      unsubscribeOwned();
    };
  }

  /** Claims a waiting chat for this agent, respecting their own concurrency cap. */
  async claimChat(chat: ChatSession, agentUid: string, agentDisplayName: string): Promise<void> {
    const chatRef = doc(this.firestore, 'chats', chat.id);
    const presenceRef = doc(this.firestore, 'agentPresence', agentUid);

    await runTransaction(this.firestore, async (transaction) => {
      const [chatSnapshot, presenceSnapshot] = await Promise.all([
        transaction.get(chatRef),
        transaction.get(presenceRef),
      ]);

      if (!chatSnapshot.exists() || chatSnapshot.data()['handledBy'] !== null) {
        throw new Error('This chat was already claimed by another agent.');
      }

      const presenceData = presenceSnapshot.data();
      const activeChatCount = Number(presenceData?.['activeChatCount'] ?? 0);
      const maxConcurrentChats = Number(presenceData?.['maxConcurrentChats'] ?? DEFAULT_MAX_CONCURRENT_CHATS);
      if (activeChatCount >= maxConcurrentChats) {
        throw new Error('You have reached your concurrent chat limit. Close a chat before claiming another.');
      }

      transaction.update(chatRef, {
        handledBy: agentUid,
        handledByName: agentDisplayName,
        status: 'active',
      });

      if (presenceSnapshot.exists()) {
        transaction.update(presenceRef, {
          activeChatCount: activeChatCount + 1,
          updatedAt: serverTimestamp(),
        });
      } else {
        transaction.set(presenceRef, {
          uid: agentUid,
          displayName: agentDisplayName,
          isAvailable: true,
          activeChatCount: 1,
          maxConcurrentChats: DEFAULT_MAX_CONCURRENT_CHATS,
          updatedAt: serverTimestamp(),
        });
      }
    });
  }

  private async adjustActiveChatCount(agentUid: string, delta: number): Promise<void> {
    const presenceRef = doc(this.firestore, 'agentPresence', agentUid);
    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(presenceRef);
      if (!snapshot.exists()) {
        return;
      }
      const current = Number(snapshot.data()['activeChatCount'] ?? 0);
      transaction.update(presenceRef, {
        activeChatCount: Math.max(0, current + delta),
        updatedAt: serverTimestamp(),
      });
    });
  }

  // ---- Reporting ----

  async loadAnalytics(): Promise<ChatAnalyticsSummary> {
    const snapshot = await getDocs(collection(this.firestore, 'chats'));
    const chats = snapshot.docs.map((document) => this.toChatSession(document));

    const byStatus: Record<ChatStatus, number> = { waiting: 0, active: 0, closed: 0, offline_message: 0 };
    const chatsPerDay: Record<string, number> = {};
    const chatsByHour = new Array<number>(24).fill(0);
    let responseTotalSeconds = 0;
    let responseCount = 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    cutoff.setHours(0, 0, 0, 0);

    for (const chat of chats) {
      byStatus[chat.status]++;

      if (chat.startedAt) {
        if (chat.startedAt >= cutoff) {
          const dayKey = chat.startedAt.toISOString().slice(0, 10);
          chatsPerDay[dayKey] = (chatsPerDay[dayKey] ?? 0) + 1;
        }
        chatsByHour[chat.startedAt.getHours()]++;
      }

      if (chat.startedAt && chat.firstResponseAt && chat.firstResponseAt >= chat.startedAt) {
        responseTotalSeconds += (chat.firstResponseAt.getTime() - chat.startedAt.getTime()) / 1000;
        responseCount++;
      }
    }

    const resolvable = byStatus.waiting + byStatus.active + byStatus.closed;
    const resolutionRate = resolvable > 0 ? byStatus.closed / resolvable : 0;

    return {
      totalChats: chats.length,
      byStatus,
      resolutionRate,
      avgFirstResponseSeconds: responseCount > 0 ? Math.round(responseTotalSeconds / responseCount) : null,
      chatsPerDay,
      chatsByHour,
    };
  }

  // ---- Mapping helpers ----

  private toChatSession(document: DocumentSnapshot<DocumentData>): ChatSession {
    const data = document.data() ?? {};
    return {
      id: document.id,
      userId: (data['userId'] ?? '') as string,
      userName: (data['userName'] ?? 'Unknown user') as string,
      status: this.normalizeStatus(data['status']),
      handledBy: (data['handledBy'] ?? null) as string | null,
      handledByName: (data['handledByName'] ?? null) as string | null,
      startedAt: this.toDate(data['startedAt']),
      closedAt: this.toDate(data['closedAt']),
      lastMessageAt: this.toDate(data['lastMessageAt']),
      firstResponseAt: this.toDate(data['firstResponseAt']),
    };
  }

  private toChatMessage(document: DocumentSnapshot<DocumentData>): ChatMessage {
    const data = document.data() ?? {};
    return {
      id: document.id,
      senderUid: (data['senderUid'] ?? '') as string,
      senderRole: (data['senderRole'] ?? '') as string,
      text: (data['text'] ?? '') as string,
      createdAt: this.toDate(data['createdAt']),
    };
  }

  private toAgentPresence(uid: string, data: DocumentData): AgentPresence {
    return {
      uid,
      displayName: (data['displayName'] ?? 'Unnamed agent') as string,
      isAvailable: Boolean(data['isAvailable']),
      activeChatCount: Number(data['activeChatCount'] ?? 0),
      maxConcurrentChats: Number(data['maxConcurrentChats'] ?? DEFAULT_MAX_CONCURRENT_CHATS),
      updatedAt: this.toDate(data['updatedAt']),
    };
  }

  private toBusinessHours(data: DocumentData): ChatBusinessHours {
    const days = Array.isArray(data['days']) ? data['days'].map(Number) : FALLBACK_BUSINESS_HOURS.days;
    const holidays = Array.isArray(data['holidays']) ? data['holidays'].map(String) : [];
    return {
      timezone: typeof data['timezone'] === 'string' ? data['timezone'] : FALLBACK_BUSINESS_HOURS.timezone,
      days,
      open: typeof data['open'] === 'string' ? data['open'] : FALLBACK_BUSINESS_HOURS.open,
      close: typeof data['close'] === 'string' ? data['close'] : FALLBACK_BUSINESS_HOURS.close,
      holidays,
    };
  }

  private normalizeStatus(value: unknown): ChatStatus {
    return (STATUSES as ReadonlyArray<string>).includes(String(value)) ? (value as ChatStatus) : 'closed';
  }

  private toDate(value: unknown): Date | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return value;
    }
    const withToDate = value as { toDate?: () => Date };
    if (typeof withToDate.toDate === 'function') {
      return withToDate.toDate();
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }
}
