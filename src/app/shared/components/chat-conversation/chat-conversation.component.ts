import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import type { ChatMessage } from '../../models/chat.model';

@Component({
  selector: 'app-chat-conversation',
  templateUrl: './chat-conversation.component.html',
  styleUrl: './chat-conversation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatConversationComponent implements AfterViewChecked {
  readonly messages = input<ChatMessage[]>([]);
  readonly currentUid = input<string | null>(null);
  readonly statusLabel = input('');
  readonly placeholder = input('Type a message...');
  readonly disabled = input(false);
  readonly loading = input(false);

  readonly send = output<string>();

  protected readonly draft = signal('');

  @ViewChild('messageList') private messageList?: ElementRef<HTMLDivElement>;
  private lastMessageCount = 0;

  ngAfterViewChecked(): void {
    const count = this.messages().length;
    if (count !== this.lastMessageCount) {
      this.lastMessageCount = count;
      this.scrollToBottom();
    }
  }

  protected isOwnMessage(message: ChatMessage): boolean {
    return message.senderUid === this.currentUid();
  }

  protected onDraftInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement | null)?.value ?? '');
  }

  protected onComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    }
  }

  protected submit(): void {
    const text = this.draft().trim();
    if (!text || this.disabled()) {
      return;
    }

    this.send.emit(text);
    this.draft.set('');
  }

  protected formatTime(date: Date | null): string {
    return date ? new Intl.DateTimeFormat('en-GB', { timeStyle: 'short' }).format(date) : '';
  }

  private scrollToBottom(): void {
    const element = this.messageList?.nativeElement;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }
}
