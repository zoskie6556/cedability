import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, firstValueFrom, fromEvent, merge, of } from 'rxjs';
import { catchError, map, startWith, takeUntil, tap } from 'rxjs/operators';
import { ChatMessage } from '../../core/models/chat.model';

export const DEFAULT_MAX_CONCURRENT_CHATS = 5;

export interface ChatSession {
  id: string;
  userId: string;
  userName: string;
  handledBy: string;
  handledByName: string;
  status: 'open' | 'closed' | string;
  createdAt: number;
  updatedAt: number;
}

export interface BusinessHoursConfig {
  timezone: string;
  startHour: number;
  endHour: number;
  workingDays: number[];
}

export interface AvailabilityStatus {
  isAvailable: boolean;
  reason?: string;
}

export interface ChatSessionContext {
  isAuthenticated: boolean;
  guestId: string;
  userId?: string;
  displayName: string;
}

@Injectable({
  providedIn: 'root',
})
export class ChatService  {
  // private readonly apiUrl = '/api/chat';
  // private readonly guestIdKey = 'cedability_guest_id';
  // private readonly destroy$ = new Subject<void>();

  // private readonly isOnline$ = new BehaviorSubject<boolean>(
  //   typeof navigator !== 'undefined' ? navigator.onLine : true
  // );
  // private readonly messages$ = new BehaviorSubject<ChatMessage[]>([]);
  // private readonly activeChat$ = new BehaviorSubject<ChatSession | null>(null);
  // private readonly context$: BehaviorSubject<ChatSessionContext>;

  // constructor(private readonly http: HttpClient) {
  //   const initialContext = this.buildSessionContext(false, undefined, 'Guest');
  //   this.context$ = new BehaviorSubject<ChatSessionContext>(initialContext);

  //   this.loadScopedMessages(initialContext);
  //   this.monitorNetworkStatus();
  // }

  // getMessages(): Observable<ChatMessage[]> {
  //   return this.messages$.asObservable();
  // }

  // getOnlineStatus(): Observable<boolean> {
  //   return this.isOnline$.asObservable();
  // }

  // getSessionContext(): Observable<ChatSessionContext> {
  //   return this.context$.asObservable();
  // }

  // getActiveGuestId(): string {
  //   return this.context$.value.guestId;
  // }

  // setAuthState(isAuthenticated: boolean, userId?: string, displayName?: string): void {
  //   const currentGuestId = this.context$.value.guestId;
  //   const resolvedName = isAuthenticated
  //     ? displayName?.trim() || 'User'
  //     : 'Guest';
  //   const nextContext = this.buildSessionContext(isAuthenticated, userId, resolvedName, currentGuestId);

  //   const guestMessages = this.readStorage(
  //     this.getStorageKey({
  //       isAuthenticated: false,
  //       guestId: currentGuestId,
  //       displayName: 'Guest',
  //     })
  //   );

  //   this.context$.next(nextContext);
  //   this.loadScopedMessages(nextContext);

  //   if (isAuthenticated && userId && guestMessages.length > 0 && this.messages$.value.length === 0) {
  //     const migrated = guestMessages.map((msg) => ({
  //       ...msg,
  //       senderUid: userId,
  //       senderName: resolvedName,
  //       senderRole: msg.senderRole === 'guest' ? 'user' : msg.senderRole,
  //     }));
  //     this.saveMessages(migrated, nextContext);
  //   }

  //   if (this.isOnline$.value) {
  //     this.flushQueue();
  //   }
  // }

  // sendMessage(rawContent: string): void {
  //   const content = rawContent.trim();
  //   if (!content) {
  //     return;
  //   }

  //   const ctx = this.context$.value;
  //   const isOffline = !this.isOnline$.value;
  //   const now = Date.now();

  //   const message: ChatMessage = {
  //     id: this.generateId(),
  //     chatId: this.activeChat$.value?.id ?? `local_${ctx.guestId}`,
  //     senderUid: ctx.isAuthenticated && ctx.userId ? ctx.userId : ctx.guestId,
  //     senderName: ctx.displayName,
  //     senderRole: ctx.isAuthenticated ? 'user' : 'guest',
  //     text: content,
  //     createdAt: now,
  //     status: isOffline ? 'queued' : 'sent',
  //   } as ChatMessage;

  //   const updated = [...this.messages$.value, message];
  //   this.saveMessages(updated, ctx);

  //   if (!isOffline) {
  //     this.transmitMessage(message, ctx).subscribe();
  //   }
  // }

  // flushQueue(): void {
  //   if (!this.isOnline$.value) {
  //     return;
  //   }

  //   const ctx = this.context$.value;
  //   const queued = this.messages$.value.filter((m) => (m as { status?: string }).status === 'queued');

  //   for (const msg of queued) {
  //     this.transmitMessage(msg, ctx).subscribe();
  //   }
  // }

  // clearCurrentSessionMessages(): void {
  //   const ctx = this.context$.value;
  //   this.saveMessages([], ctx);
  // }

  // async findOpenChatForUser(userId?: string): Promise<ChatSession | null> {
  //   const ownerId = userId || this.context$.value.userId || this.context$.value.guestId;
  //   const current = this.activeChat$.value;
  //   if (current && current.userId === ownerId && current.status === 'open') {
  //     return current;
  //   }

  //   if (!this.isOnline$.value) {
  //     return current && current.status === 'open' ? current : null;
  //   }

  //   const remote = await firstValueFrom(
  //     this.http
  //       .get<ChatSession | null>(`${this.apiUrl}/sessions/open`, {
  //         params: { userId: ownerId },
  //       })
  //       .pipe(catchError(() => of(current && current.status === 'open' ? current : null)))
  //   );

  //   if (remote) {
  //     this.activeChat$.next(remote);
  //   }
  //   return remote;
  // }

  // async getBusinessHours(): Promise<BusinessHoursConfig> {
  //   const fallback: BusinessHoursConfig = {
  //     timezone: 'Africa/Gaborone',
  //     startHour: 0,
  //     endHour: 24,
  //     workingDays: [1, 2, 3, 4, 5],
  //   };

  //   if (!this.isOnline$.value) {
  //     return fallback;
  //   }

  //   return firstValueFrom(
  //     this.http
  //       .get<BusinessHoursConfig>(`${this.apiUrl}/business-hours`)
  //       .pipe(catchError(() => of(fallback)))
  //   );
  // }

  // async checkAvailability(hours?: BusinessHoursConfig): Promise<AvailabilityStatus> {
  //   const config = hours ?? (await this.getBusinessHours());
  //   const now = new Date();
  //   const day = now.getDay();
  //   const hour = now.getHours();

  //   const isWorkingDay = config.workingDays.includes(day);
  //   const isWithinHours = hour >= config.startHour && hour < config.endHour;

  //   if (!this.isOnline$.value) {
  //     return {
  //       isAvailable: false,
  //       reason: 'Offline mode — messages are queued locally and send automatically when reconnected.',
  //     };
  //   }

  //   return {
  //     isAvailable: isWorkingDay && isWithinHours,
  //     reason:
  //       isWorkingDay && isWithinHours
  //         ? undefined
  //         : 'Outside live support hours — you can still send a message.',
  //   };
  // }

  // async startChat(
  //   userId?: string,
  //   displayName?: string,
  //   initialMessage?: string
  // ): Promise<ChatSession> {
  //   const ctx = this.context$.value;
  //   const resolvedUserId = userId || ctx.userId || ctx.guestId;
  //   const resolvedName = displayName?.trim() || ctx.displayName || (ctx.isAuthenticated ? 'User' : 'Guest');
  //   const now = Date.now();

  //   const localSession: ChatSession = {
  //     id: `chat_${this.generateId()}`,
  //     userId: resolvedUserId,
  //     userName: resolvedName,
  //     handledBy: '',
  //     handledByName: 'CEDAbility Support',
  //     status: 'open',
  //     createdAt: now,
  //     updatedAt: now,
  //   };

  //   this.activeChat$.next(localSession);

  //   if (initialMessage?.trim()) {
  //     this.sendMessage(initialMessage);
  //   }

  //   if (this.isOnline$.value) {
  //     const created = await firstValueFrom(
  //       this.http
  //         .post<ChatSession>(`${this.apiUrl}/sessions`, {
  //           userId: resolvedUserId,
  //           userName: resolvedName,
  //           isGuest: !ctx.isAuthenticated,
  //         })
  //         .pipe(catchError(() => of(localSession)))
  //     );
  //     this.activeChat$.next(created);
  //     return created;
  //   }

  //   return localSession;
  // }

  // async closeChat(chat?: ChatSession | null): Promise<void> {
  //   const target = chat ?? this.activeChat$.value;
  //   if (!target) {
  //     return;
  //   }

  //   const closedSession: ChatSession = {
  //     ...target,
  //     status: 'closed',
  //     updatedAt: Date.now(),
  //   };

  //   this.activeChat$.next(closedSession);

  //   if (this.isOnline$.value) {
  //     await firstValueFrom(
  //       this.http
  //         .post<void>(`${this.apiUrl}/sessions/${encodeURIComponent(target.id)}/close`, {})
  //         .pipe(catchError(() => of(undefined)))
  //     );
  //   }
  // }

  // listenToChat(
  //   chatId: string,
  //   onNext: (chat: ChatSession | null) => void,
  //   onError?: (error: unknown) => void
  // ): () => void {
  //   void chatId;
  //   const sub = this.activeChat$.subscribe({
  //     next: (session) => onNext(session),
  //     error: (err) => {
  //       if (onError) {
  //         onError(err);
  //       }
  //     },
  //   });

  //   return () => sub.unsubscribe();
  // }

  // listenToMessages(
  //   chatId: string,
  //   onNext: (messages: ChatMessage[]) => void,
  //   onError?: (error: unknown) => void
  // ): () => void {
  //   void chatId;
  //   const sub = this.messages$.subscribe({
  //     next: (msgs) => onNext(msgs),
  //     error: (err) => {
  //       if (onError) {
  //         onError(err);
  //       }
  //     },
  //   });

  //   return () => sub.unsubscribe();
  // }

  // private transmitMessage(message: ChatMessage, ctx: ChatSessionContext): Observable<{ id?: string } | null> {
  //   const payload = {
  //     messageId: message.id,
  //     chatId: this.activeChat$.value?.id,
  //     senderUid: message.senderUid,
  //     senderName: message.senderName,
  //     senderRole: message.senderRole,
  //     text: message.text,
  //     createdAt: message.createdAt,
  //     guestId: ctx.isAuthenticated ? undefined : ctx.guestId,
  //     userId: ctx.isAuthenticated ? ctx.userId : undefined,
  //   };

  //   return this.http.post<{ id?: string }>(`${this.apiUrl}/messages`, payload).pipe(
  //     tap(() => {
  //       const nextList = this.messages$.value.map((item) =>
  //         item.id === message.id
  //           ? ({ ...item, status: 'sent' } as ChatMessage)
  //           : item
  //       );
  //       this.saveMessages(nextList, ctx);
  //     }),
  //     catchError(() => {
  //       const nextList = this.messages$.value.map((item) =>
  //         item.id === message.id
  //           ? ({ ...item, status: 'queued' } as ChatMessage)
  //           : item
  //       );
  //       this.saveMessages(nextList, ctx);
  //       return of(null);
  //     })
  //   );
  // }

  // private monitorNetworkStatus(): void {
  //   if (typeof window === 'undefined') {
  //     return;
  //   }

  //   merge(
  //     fromEvent(window, 'online').pipe(map(() => true)),
  //     fromEvent(window, 'offline').pipe(map(() => false))
  //   )
  //     .pipe(
  //       startWith(typeof navigator !== 'undefined' ? navigator.onLine : true),
  //       takeUntil(this.destroy$)
  //     )
  //     .subscribe((online) => {
  //       this.isOnline$.next(online);
  //       if (online) {
  //         this.flushQueue();
  //       }
  //     });
  // }

  // private buildSessionContext(
  //   isAuthenticated: boolean,
  //   userId?: string,
  //   displayName = 'Guest',
  //   existingGuestId?: string
  // ): ChatSessionContext {
  //   const guestId = existingGuestId || this.getOrCreateGuestId();
  //   return {
  //     isAuthenticated,
  //     guestId,
  //     userId: isAuthenticated ? userId : undefined,
  //     displayName: isAuthenticated ? displayName : 'Guest',
  //   };
  // }

  // private getOrCreateGuestId(): string {
  //   try {
  //     const saved = localStorage.getItem(this.guestIdKey);
  //     if (saved) {
  //       return saved;
  //     }
  //     const created = `guest_${this.generateId()}`;
  //     localStorage.setItem(this.guestIdKey, created);
  //     return created;
  //   } catch {
  //     return `guest_${this.generateId()}`;
  //   }
  // }

  // private getStorageKey(ctx: ChatSessionContext): string {
  //   return ctx.isAuthenticated && ctx.userId
  //     ? `cedability_chat_user_${ctx.userId}`
  //     : `cedability_chat_guest_${ctx.guestId}`;
  // }

  // private loadScopedMessages(ctx: ChatSessionContext): void {
  //   const stored = this.readStorage(this.getStorageKey(ctx));
  //   this.messages$.next(stored);
  // }

  // private saveMessages(messages: ChatMessage[], ctx: ChatSessionContext): void {
  //   this.messages$.next(messages);
  //   try {
  //     localStorage.setItem(this.getStorageKey(ctx), JSON.stringify(messages));
  //   } catch {
  //     // Ignore storage quota or private mode errors
  //   }
  // }

  // private readStorage(key: string): ChatMessage[] {
  //   try {
  //     const raw = localStorage.getItem(key);
  //     if (!raw) {
  //       return [];
  //     }
  //     const parsed = JSON.parse(raw);
  //     return Array.isArray(parsed) ? parsed : [];
  //   } catch {
  //     return [];
  //   }
  // }

  // private generateId(): string {
  //   if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
  //     return crypto.randomUUID();
  //   }
  //   return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  // }

  // ngOnDestroy(): void {
  //   this.destroy$.next();
  //   this.destroy$.complete();
  // }
}