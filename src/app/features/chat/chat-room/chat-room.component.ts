import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { Auth, authState, type User as FirebaseUser } from '@angular/fire/auth';
import { RouterLink } from '@angular/router';
import { ChatService } from '../../../core/services/chat.service';
import { UserDataService } from '../../../core/services/user-data.service';
import { IdeaLoaderComponent } from '../../../shared/components/idea-loader/idea-loader.component';
import { ChatConversationComponent } from '../../../shared/components/chat-conversation/chat-conversation.component';
import type { ChatBusinessHours, ChatMessage, ChatSession } from '../../../shared/models/chat.model';

@Component({
  selector: 'app-chat-room',
  imports: [IdeaLoaderComponent, ChatConversationComponent, RouterLink],
  templateUrl: './chat-room.component.html',
  styleUrl: './chat-room.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatRoomComponent implements OnInit {
  private readonly auth = inject(Auth);
  private readonly userDataService = inject(UserDataService);
  private readonly chatService = inject(ChatService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly uid = signal<string | null>(null);
  protected readonly role = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly unavailableNotice = signal<string | null>(null);
  protected readonly chat = signal<ChatSession | null>(null);
  protected readonly messages = signal<ChatMessage[]>([]);
  protected readonly signedIn = signal(true);

  private businessHours: ChatBusinessHours | null = null;

  ngOnInit(): void {
    void this.initialize();
  }

  protected async send(text: string): Promise<void> {
    const chat = this.chat();
    const uid = this.uid();
    if (!chat || !uid) {
      return;
    }

    try {
      await this.chatService.sendMessage(chat, uid, this.role() ?? 'submitter', text);
    } catch (sendError) {
      console.error('[ChatRoomComponent] could not send the message.', sendError);
      this.error.set('Your message could not be sent. Please try again.');
    }
  }

  protected async endChat(): Promise<void> {
    const chat = this.chat();
    if (!chat || chat.status === 'closed') {
      return;
    }

    try {
      await this.chatService.closeChat(chat);
    } catch (closeError) {
      console.error('[ChatRoomComponent] could not close the chat.', closeError);
      this.error.set('The chat could not be closed. Please try again.');
    }
  }

  protected statusLabel(): string {
    const chat = this.chat();
    if (!chat) {
      return '';
    }
    switch (chat.status) {
      case 'waiting':
        return 'Waiting for the next available consultant...';
      case 'active':
        return chat.handledByName ? `Chatting with ${chat.handledByName}` : 'A consultant has joined the chat.';
      case 'closed':
        return 'This conversation has ended.';
      case 'offline_message':
        return 'Our consultants are offline. Leave a message and we will reply as soon as we are back.';
      default:
        return '';
    }
  }

  private async initialize(): Promise<void> {
    this.loading.set(true);

    const authUser = await this.getCurrentAuthUser();
    if (!authUser) {
      this.signedIn.set(false);
      this.loading.set(false);
      return;
    }

    try {
      const user = await this.userDataService.getOrCreateUser(authUser);
      this.uid.set(user.uid);
      this.role.set(user.role);

      const existing = await this.chatService.findOpenChatForUser(user.uid);
      if (existing) {
        this.chat.set(existing);
        this.listen(existing.id);
        return;
      }

      this.businessHours = await this.chatService.getBusinessHours();
      const availability = await this.chatService.checkAvailability(this.businessHours);
      const isLive = availability.withinBusinessHours && availability.agentAvailable;
      if (!isLive) {
        this.unavailableNotice.set(this.buildUnavailableMessage(availability));
      }

      const created = await this.chatService.startChat(user.uid, user.fullName || 'there', isLive);
      this.chat.set(created);
      this.listen(created.id);
    } catch (initError) {
      console.error('[ChatRoomComponent] could not start the chat.', initError);
      this.error.set('Chat is temporarily unavailable. Please try again shortly.');
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

  private buildUnavailableMessage(availability: { withinBusinessHours: boolean }): string {
    if (!availability.withinBusinessHours) {
      const hours = this.businessHours;
      return hours
        ? `Agent not available at the moment. Live chat is open ${hours.open}-${hours.close} on working days.`
        : 'Agent not available at the moment. Please try again during working hours.';
    }
    return 'Agent not available at the moment. All consultants are currently busy.';
  }

  private listen(chatId: string): void {
    const stopChat = this.chatService.listenToChat(
      chatId,
      (chat) => this.chat.set(chat),
      (listenError) => console.error('[ChatRoomComponent] chat listener failed.', listenError),
    );
    const stopMessages = this.chatService.listenToMessages(
      chatId,
      (messages) => this.messages.set(messages),
      (listenError) => console.error('[ChatRoomComponent] message listener failed.', listenError),
    );
    this.destroyRef.onDestroy(() => {
      stopChat();
      stopMessages();
    });
  }
}
