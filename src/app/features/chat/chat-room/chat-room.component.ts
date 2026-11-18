import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auth, authState, user } from '@angular/fire/auth';
import { Subject, takeUntil } from 'rxjs';
import { ChatMessage, ChatSession } from '../../../core/models/chat.model';
import { ChatModerationError, ChatService } from '../../../core/services/chat.service';

export interface ChatSessionContext {
  isAuthenticated: boolean;
  uid: string;
  displayName: string;
  role: string;
}

@Component({
  selector: 'app-chat-room',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-room.component.html',
  styleUrls: ['./chat-room.component.scss'],
})
export class ChatRoomComponent implements OnInit, OnDestroy {
  private readonly chatService = inject(ChatService);
  private readonly auth = inject(Auth, { optional: true });
  private readonly destroy$ = new Subject<void>();

  readonly messages = signal<ChatMessage[]>([]);
  readonly chat = signal<ChatSession | null>(null);
  readonly isOnline = signal<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  readonly errorMessage = signal<string | null>(null);
  readonly session = signal<ChatSessionContext>({
    isAuthenticated: false,
    uid: this.getOrCreateGuestId(),
    displayName: 'Guest',
    role: 'guest',
  });

  readonly instantPrompts: string[] = [
    'How do I check my submission status?',
    'What documents do I need to apply?',
    'Can I speak with a support agent?',
    'How do I update my profile details?',
  ];

  draftText = '';
  private unsubscribeChat?: () => void;
  private unsubscribeMessages?: () => void;

  private readonly handleOnline = () => {
    this.isOnline.set(true);
    void this.refreshAvailability();
  };

  private readonly handleOffline = () => {
    this.isOnline.set(false);
  };

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }

    if (this.auth) {
      authState(this.auth)
        .pipe(takeUntil(this.destroy$))
        .subscribe((currentUser) => {
          if (currentUser) {
            this.session.set({
              isAuthenticated: true,
              uid: currentUser.uid,
              displayName: currentUser.displayName || currentUser.email || 'Member',
              role: 'user',
            });
          } else {
            this.session.set({
              isAuthenticated: false,
              uid: this.getOrCreateGuestId(),
              displayName: 'Guest',
              role: 'guest',
            });
          }
          void this.initializeSession();
        });
    } else {
      void this.initializeSession();
    }
  }

  async initializeSession(): Promise<void> {
    this.errorMessage.set(null);
    const ctx = this.session();
    const hours = await this.chatService.getBusinessHours();
    const availability = await this.chatService.checkAvailability(hours);
    const isLive = this.isOnline() && availability.withinBusinessHours && availability.agentAvailable;

    const existing = await this.chatService.findOpenChatForUser(ctx.uid);
    const active = existing ?? (await this.chatService.startChat(ctx.uid, ctx.displayName, isLive));

    this.chat.set(active);
    this.bindListeners(active.id);
  }

  private async refreshAvailability(): Promise<void> {
    const currentChat = this.chat();
    if (!currentChat || currentChat.status !== 'offline_message') {
      return;
    }
    const hours = await this.chatService.getBusinessHours();
    const availability = await this.chatService.checkAvailability(hours);
    if (availability.withinBusinessHours && availability.agentAvailable) {
      await this.initializeSession();
    }
  }

  private bindListeners(chatId: string): void {
    this.unsubscribeChat?.();
    this.unsubscribeMessages?.();

    this.unsubscribeChat = this.chatService.listenToChat(
      chatId,
      (updatedChat) => this.chat.set(updatedChat),
      (listenError) => console.error('[ChatRoomComponent] chat listener error:', listenError),
    );

    this.unsubscribeMessages = this.chatService.listenToMessages(
      chatId,
      (updatedMessages) => this.messages.set(updatedMessages),
      (listenError) => console.error('[ChatRoomComponent] messages listener error:', listenError),
    );
  }

  async sendInstantPrompt(prompt: string): Promise<void> {
    await this.dispatchText(prompt);
  }

  async onSend(): Promise<void> {
    const trimmed = this.draftText.trim();
    if (!trimmed) {
      return;
    }
    this.draftText = '';
    await this.dispatchText(trimmed);
  }

  private async dispatchText(text: string): Promise<void> {
    this.errorMessage.set(null);
    let activeChat = this.chat();
    if (!activeChat) {
      await this.initializeSession();
      activeChat = this.chat();
    }
    if (!activeChat) {
      return;
    }

    const ctx = this.session();
    try {
      await this.chatService.sendMessage(activeChat, ctx.uid, ctx.role, text);
    } catch (err) {
      if (err instanceof ChatModerationError) {
        this.errorMessage.set(err.message);
      } else {
        console.error('[ChatRoomComponent] failed to send message:', err);
        this.errorMessage.set('Could not send message. Please try again.');
      }
    }
  }

  async clearChat(): Promise<void> {
    this.messages.set([]);
    this.errorMessage.set(null);
  }

  async onCloseChat(): Promise<void> {
    const currentChat = this.chat();
    if (!currentChat) {
      return;
    }
    const ctx = this.session();
    await this.chatService.closeChat(currentChat, ctx.uid);
    this.unsubscribeChat?.();
    this.unsubscribeMessages?.();
    this.chat.set(null);
    this.messages.set([]);
  }

  getSenderName(msg: ChatMessage): string {
    const record = msg as ChatMessage & { senderName?: string };
    if (record.senderName) {
      return record.senderName;
    }
    if (msg.senderRole === 'agent') {
      return this.chat()?.handledByName || 'Support Agent';
    }
    if (msg.senderRole === 'guest') {
      return 'Guest';
    }
    if (msg.senderRole === 'system') {
      return 'CEDAbility';
    }
    return this.session().displayName || 'Member';
  }

  getSenderRoleLabel(msg: ChatMessage): string {
    switch (msg.senderRole) {
      case 'agent':
        return 'Support Agent';
      case 'guest':
        return 'Guest';
      case 'system':
        return 'System';
      default:
        return 'Member';
    }
  }

  getMessageStatus(msg: ChatMessage): string | undefined {
    return (msg as ChatMessage & { status?: string }).status;
  }

  private getOrCreateGuestId(): string {
    const storageKey = 'cedability_chat_guest_id';
    if (typeof localStorage !== 'undefined') {
      const existing = localStorage.getItem(storageKey);
      if (existing) {
        return existing;
      }
      const generated = `guest_${crypto.randomUUID()}`;
      localStorage.setItem(storageKey, generated);
      return generated;
    }
    return `guest_${Date.now()}`;
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
    this.unsubscribeChat?.();
    this.unsubscribeMessages?.();
    this.destroy$.next();
    this.destroy$.complete();
  }
}