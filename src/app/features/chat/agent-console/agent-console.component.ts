import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Auth, authState, type User as FirebaseUser } from '@angular/fire/auth';
import { ChatService, DEFAULT_MAX_CONCURRENT_CHATS } from '../../../core/services/chat.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserDataService } from '../../../core/services/user-data.service';
import { IdeaLoaderComponent } from '../../../shared/components/idea-loader/idea-loader.component';
import { ChatConversationComponent } from '../../../shared/components/chat-conversation/chat-conversation.component';
import type { AgentPresence, ChatMessage, ChatSession } from '../../../shared/models/chat.model';

const STAFF_ROLES = new Set(['agent', 'admin']);

@Component({
  selector: 'app-chat-agent-console',
  imports: [IdeaLoaderComponent, ChatConversationComponent, DatePipe],
  templateUrl: './agent-console.component.html',
  styleUrl: './agent-console.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentConsoleComponent implements OnInit {
  private readonly auth = inject(Auth);
  private readonly userDataService = inject(UserDataService);
  private readonly chatService = inject(ChatService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly authorized = signal(false);
  protected readonly uid = signal<string | null>(null);
  protected readonly displayName = signal('');
  protected readonly presence = signal<AgentPresence | null>(null);
  protected readonly queue = signal<ChatSession[]>([]);
  protected readonly selectedChatId = signal<string | null>(null);
  protected readonly selectedMessages = signal<ChatMessage[]>([]);
  protected readonly togglingAvailability = signal(false);

  protected readonly waitingChats = computed(() => this.queue().filter((chat) => chat.status === 'waiting'));
  protected readonly myActiveChats = computed(() =>
    this.queue().filter((chat) => chat.status === 'active' && chat.handledBy === this.uid()),
  );
  protected readonly selectedChat = computed(
    () => this.queue().find((chat) => chat.id === this.selectedChatId()) ?? null,
  );
  protected readonly isAvailable = computed(() => this.presence()?.isAvailable ?? false);
  protected readonly capacityLabel = computed(() => {
    const presence = this.presence();
    const active = this.myActiveChats().length;
    const max = presence?.maxConcurrentChats ?? DEFAULT_MAX_CONCURRENT_CHATS;
    return `${active}/${max} active chats`;
  });

  private stopSelectedListeners: (() => void) | null = null;

  ngOnInit(): void {
    void this.initialize();
  }

  protected async toggleAvailability(): Promise<void> {
    const uid = this.uid();
    if (!uid || this.togglingAvailability()) {
      return;
    }

    this.togglingAvailability.set(true);
    try {
      const next = !this.isAvailable();
      await this.chatService.setAgentAvailability(
        uid,
        this.displayName(),
        next,
        this.presence()?.maxConcurrentChats ?? DEFAULT_MAX_CONCURRENT_CHATS,
      );
      this.presence.set(await this.chatService.getAgentPresence(uid));
      this.toast.success(next ? 'You are now available for live chat.' : 'You are now marked unavailable.');
    } catch (error) {
      console.error('[AgentConsoleComponent] could not update availability.', error);
      this.toast.error('Could not update your availability. Please try again.');
    } finally {
      this.togglingAvailability.set(false);
    }
  }

  protected async claim(chat: ChatSession): Promise<void> {
    const uid = this.uid();
    if (!uid) {
      return;
    }

    try {
      await this.chatService.claimChat(chat, uid, this.displayName());
      this.selectChat(chat.id);
      this.presence.set(await this.chatService.getAgentPresence(uid));
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Could not claim this chat.';
      this.toast.error(message);
    }
  }

  protected selectChat(chatId: string): void {
    if (this.selectedChatId() === chatId) {
      return;
    }

    this.selectedChatId.set(chatId);
    this.stopSelectedListeners?.();
    this.stopSelectedListeners = this.chatService.listenToMessages(
      chatId,
      (messages) => this.selectedMessages.set(messages),
      (error) => console.error('[AgentConsoleComponent] message listener failed.', error),
    );
  }

  protected async send(text: string): Promise<void> {
    const chat = this.selectedChat();
    const uid = this.uid();
    if (!chat || !uid) {
      return;
    }

    try {
      await this.chatService.sendMessage(chat, uid, 'agent', text);
    } catch (error) {
      console.error('[AgentConsoleComponent] could not send the message.', error);
      this.toast.error('Your message could not be sent. Please try again.');
    }
  }

  protected async closeSelectedChat(): Promise<void> {
    const chat = this.selectedChat();
    const uid = this.uid();
    if (!chat || !uid) {
      return;
    }

    try {
      await this.chatService.closeChat(chat, uid);
      this.selectedChatId.set(null);
      this.presence.set(await this.chatService.getAgentPresence(uid));
      this.toast.success('Chat closed.');
    } catch (error) {
      console.error('[AgentConsoleComponent] could not close the chat.', error);
      this.toast.error('Could not close the chat. Please try again.');
    }
  }

  protected statusLabelFor(chat: ChatSession): string {
    return chat.status === 'waiting' ? 'Waiting' : `Chatting with ${chat.userName}`;
  }

  private async initialize(): Promise<void> {
    this.loading.set(true);
    const authUser = await this.getCurrentAuthUser();
    if (!authUser) {
      this.loading.set(false);
      return;
    }

    try {
      const user = await this.userDataService.getOrCreateUser(authUser);
      if (!STAFF_ROLES.has(user.role)) {
        this.authorized.set(false);
        return;
      }

      this.authorized.set(true);
      this.uid.set(user.uid);
      this.displayName.set(user.fullName || 'Support consultant');
      this.presence.set(await this.chatService.getAgentPresence(user.uid));

      const stopQueue = this.chatService.listenToAgentQueue(
        user.uid,
        (chats) => this.queue.set(chats),
        (error) => console.error('[AgentConsoleComponent] queue listener failed.', error),
      );
      this.destroyRef.onDestroy(() => {
        stopQueue();
        this.stopSelectedListeners?.();
      });
    } catch (error) {
      console.error('[AgentConsoleComponent] could not load the console.', error);
      this.toast.error('Could not load the chat console. Please refresh and try again.');
    } finally {
      this.loading.set(false);
    }
  }

  private getCurrentAuthUser(): Promise<FirebaseUser | null> {
    return new Promise((resolve) => {
      const subscription = authState(this.auth).subscribe((user) => {
        subscription.unsubscribe();
        resolve(user);
      });
      this.destroyRef.onDestroy(() => subscription.unsubscribe());
    });
  }
}
