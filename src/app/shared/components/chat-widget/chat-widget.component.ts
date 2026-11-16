import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Auth, authState } from '@angular/fire/auth';
import { ChatService } from '../../../core/services/chat.service';
import { UserDataService } from '../../../core/services/user-data.service';
import type { ChatBusinessHours, ChatMessage, ChatSession } from '../../models/chat.model';
import { IdeaLoaderComponent } from '../idea-loader/idea-loader.component';
import { ChatConversationComponent } from '../chat-conversation/chat-conversation.component';

/** Roles that have their own chat console and do not need the client widget. */
const STAFF_ROLES = new Set(['agent', 'admin']);

@Component({
  selector: 'app-chat-widget',
  imports: [ IdeaLoaderComponent],
  templateUrl: './chat-widget.component.html',
  styleUrl: './chat-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatWidgetComponent {
  // private readonly auth = inject(Auth);
  // private readonly userDataService = inject(UserDataService);
  // private readonly chatService = inject(ChatService);
  // private readonly destroyRef = inject(DestroyRef);

  // private readonly authUser = toSignal(authState(this.auth), { initialValue: undefined });

  // protected readonly uid = signal<string | null>(null);
  // protected readonly displayName = signal('');
  // protected readonly role = signal<string | null>(null);
  // protected readonly isVisible = signal(false);
  // protected readonly isOpen = signal(false);
  // protected readonly loading = signal(false);
  // protected readonly error = signal<string | null>(null);
  // protected readonly unavailableNotice = signal<string | null>(null);
  // protected readonly chat = signal<ChatSession | null>(null);
  // protected readonly messages = signal<ChatMessage[]>([]);

  // private businessHours: ChatBusinessHours | null = null;
  // private unsubscribeChat: (() => void) | null = null;
  // private unsubscribeMessages: (() => void) | null = null;
  // private hasInitialized = false;

  // constructor() {
  //   // Load the signed-in user's role/name once, so we know whether to show the widget at all.
  //   const stopWatchingAuth = authState(this.auth).subscribe((user) => {
  //     if (!user) {
  //       this.uid.set(null);
  //       this.isVisible.set(false);
  //       return;
  //     }

  //     void this.userDataService.getOrCreateUser(user).then((loadedUser) => {
  //       this.uid.set(loadedUser.uid);
  //       this.displayName.set(loadedUser.fullName || 'there');
  //       this.role.set(loadedUser.role);
  //       this.isVisible.set(!STAFF_ROLES.has(loadedUser.role));
  //     }).catch((loadError) => {
  //       console.error('[ChatWidgetComponent] could not load the signed-in user.', loadError);
  //     });
  //   });

  //   this.destroyRef.onDestroy(() => stopWatchingAuth.unsubscribe());
  // }

  // ngOnDestroy(): void {
  //   this.stopListening();
  // }

  // protected toggle(): void {
  //   this.isOpen.update((open) => !open);
  //   if (this.isOpen() && !this.hasInitialized) {
  //     this.hasInitialized = true;
  //     void this.initializeChat();
  //   }
  // }

  // protected async send(text: string): Promise<void> {
  //   const chat = this.chat();
  //   const uid = this.uid();
  //   if (!chat || !uid) {
  //     return;
  //   }

  //   try {
  //     await this.chatService.sendMessage(chat, uid, this.role() ?? 'submitter', text);
  //   } catch (sendError) {
  //     console.error('[ChatWidgetComponent] could not send the message.', sendError);
  //     this.error.set('Your message could not be sent. Please try again.');
  //   }
  // }

  // protected async endChat(): Promise<void> {
  //   const chat = this.chat();
  //   if (!chat || chat.status === 'closed') {
  //     return;
  //   }

  //   try {
  //     await this.chatService.closeChat(chat);
  //   } catch (closeError) {
  //     console.error('[ChatWidgetComponent] could not close the chat.', closeError);
  //     this.error.set('The chat could not be closed. Please try again.');
  //   }
  // }

  // protected statusLabel(): string {
  //   const chat = this.chat();
  //   if (!chat) {
  //     return '';
  //   }
  //   switch (chat.status) {
  //     case 'waiting':
  //       return 'Waiting for the next available consultant...';
  //     case 'active':
  //       return chat.handledByName ? `Chatting with ${chat.handledByName}` : 'A consultant has joined the chat.';
  //     case 'closed':
  //       return 'This conversation has ended.';
  //     case 'offline_message':
  //       return 'Our consultants are offline. Leave a message and we will reply as soon as we are back.';
  //     default:
  //       return '';
  //   }
  // }

  // private async initializeChat(): Promise<void> {
  //   const uid = this.uid();
  //   if (!uid) {
  //     return;
  //   }

  //   this.loading.set(true);
  //   this.error.set(null);
  //   this.unavailableNotice.set(null);

  //   try {
  //     const existing = await this.chatService.findOpenChatForUser(uid);
  //     if (existing) {
  //       this.chat.set(existing);
  //       this.startListening(existing.id);
  //       return;
  //     }

  //     this.businessHours = await this.chatService.getBusinessHours();
  //     const availability = await this.chatService.checkAvailability(this.businessHours);
  //     const isLive = availability.withinBusinessHours && availability.agentAvailable;

  //     if (!isLive) {
  //       this.unavailableNotice.set(this.buildUnavailableMessage(availability));
  //     }

  //     const created = await this.chatService.startChat(uid, this.displayName(), isLive);
  //     this.chat.set(created);
  //     this.startListening(created.id);
  //   } catch (initError) {
  //     console.error('[ChatWidgetComponent] could not start the chat.', initError);
  //     this.error.set('Chat is temporarily unavailable. Please try again shortly.');
  //   } finally {
  //     this.loading.set(false);
  //   }
  // }

  // private buildUnavailableMessage(availability: { withinBusinessHours: boolean }): string {
  //   if (!availability.withinBusinessHours) {
  //     const hours = this.businessHours;
  //     return hours
  //       ? `Agent not available at the moment. Live chat is open ${hours.open}-${hours.close} on working days.`
  //       : 'Agent not available at the moment. Please try again during working hours.';
  //   }
  //   return 'Agent not available at the moment. All consultants are currently busy.';
  // }

  // private startListening(chatId: string): void {
  //   this.stopListening();
  //   this.unsubscribeChat = this.chatService.listenToChat(
  //     chatId,
  //     (chat) => this.chat.set(chat),
  //     (listenError) => console.error('[ChatWidgetComponent] chat listener failed.', listenError),
  //   );
  //   this.unsubscribeMessages = this.chatService.listenToMessages(
  //     chatId,
  //     (messages) => this.messages.set(messages),
  //     (listenError) => console.error('[ChatWidgetComponent] message listener failed.', listenError),
  //   );
  // }

  // private stopListening(): void {
  //   this.unsubscribeChat?.();
  //   this.unsubscribeChat = null;
  //   this.unsubscribeMessages?.();
  //   this.unsubscribeMessages = null;
  // }
}
