import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
//import { ChatMessage, ChatSession } from '../../../core/models/chat.model';
import { ChatService, ChatSessionContext } from '../../../core/services/chat.service';

@Component({
  selector: 'app-chat-room',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-room.component.html',
  styleUrls: ['./chat-room.component.scss'],
})
export class ChatRoomComponent  {
//   private readonly destroy$ = new Subject<void>();

//   readonly messages = signal<ChatMessage[]>([]);
//   readonly chat = signal<ChatSession | null>(null);
//   readonly isOnline = signal<boolean>(true);
//   readonly session = signal<ChatSessionContext>({
//     isAuthenticated: false,
//     guestId: '',
//     displayName: 'Guest',
//   });

//   readonly instantPrompts: string[] = [
//     'How do I check my submission status?',
//     'What documents do I need to apply?',
//     'Can I speak with a support agent?',
//     'How do I update my profile details?',
//   ];

//   draftText = '';
//   private unsubscribeChat?: () => void;
//   private unsubscribeMessages?: () => void;

//   constructor(private readonly chatService: ChatService) {}

//   ngOnInit(): void {
//     this.chatService
//       .getMessages()
//       .pipe(takeUntil(this.destroy$))
//       .subscribe((msgs) => this.messages.set(msgs));

//     this.chatService
//       .getOnlineStatus()
//       .pipe(takeUntil(this.destroy$))
//       .subscribe((online) => this.isOnline.set(online));

//     this.chatService
//       .getSessionContext()
//       .pipe(takeUntil(this.destroy$))
//       .subscribe((ctx) => this.session.set(ctx));

//     void this.initializeSession();
//   }

//   async initializeSession(): Promise<void> {
//     const existing = await this.chatService.findOpenChatForUser();
//     const active =
//       existing ??
//       (await this.chatService.startChat(
//         this.session().userId,
//         this.session().displayName
//       ));

//     this.chat.set(active);
//     this.bindListeners(active.id);
//   }

//   private bindListeners(chatId: string): void {
//     this.unsubscribeChat?.();
//     this.unsubscribeMessages?.();

//     this.unsubscribeChat = this.chatService.listenToChat(
//       chatId,
//       (updatedChat) => this.chat.set(updatedChat),
//       (listenError) => console.error('[ChatRoomComponent] chat listener error:', listenError)
//     );

//     this.unsubscribeMessages = this.chatService.listenToMessages(
//       chatId,
//       (updatedMessages) => this.messages.set(updatedMessages),
//       (listenError) => console.error('[ChatRoomComponent] messages listener error:', listenError)
//     );
//   }

//   sendInstantPrompt(prompt: string): void {
//     this.chatService.sendMessage(prompt);
//   }

//   onSend(): void {
//     const trimmed = this.draftText.trim();
//     if (!trimmed) {
//       return;
//     }
//     this.chatService.sendMessage(trimmed);
//     this.draftText = '';
//   }

//   retryQueued(): void {
//     this.chatService.flushQueue();
//   }

//   clearChat(): void {
//     this.chatService.clearCurrentSessionMessages();
//   }

//   async onCloseChat(): Promise<void> {
//     await this.chatService.closeChat(this.chat());
//   }

//   getSenderName(msg: ChatMessage): string {
//     const record = msg as ChatMessage & { senderName?: string };
//     if (record.senderName) {
//       return record.senderName;
//     }
//     if (msg.senderRole === 'agent') {
//       return this.chat()?.handledByName || 'Support Agent';
//     }
//     if (msg.senderRole === 'guest') {
//       return 'Guest';
//     }
//     return this.session().displayName || 'User';
//   }

//   getSenderRoleLabel(msg: ChatMessage): string {
//     switch (msg.senderRole) {
//       case 'agent':
//         return 'Support Agent';
//       case 'guest':
//         return 'Guest';
//       case 'system':
//         return 'System';
//       default:
//         return 'Member';
//     }
//   }

//   getMessageStatus(msg: ChatMessage): string | undefined {
//     return (msg as ChatMessage & { status?: string }).status;
//   }

//   ngOnDestroy(): void {
//     this.unsubscribeChat?.();
//     this.unsubscribeMessages?.();
//     this.destroy$.next();
//     this.destroy$.complete();
//   }
 }