import { Component, effect, inject, input, output } from '@angular/core';
import { GeminiLiveService } from '../services/gemini-live';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-voice-accessibility-modal',
  templateUrl: './voice-accessibility-modal.html',
  styleUrl: './voice-accessibility-modal.scss',
})
export class VoiceAccessibilityModalComponent {
  readonly open = input<boolean>(false);
  readonly closed = output<void>();
  readonly live = inject(GeminiLiveService);

  constructor() {
    effect(() => {
      if (this.open()) {
        // Pass your API key or fetch an ephemeral token from your backend here
        void this.live.startSession((environment as { geminiApiKey?: string }).geminiApiKey ?? '');
      } else {
        void this.live.stopSession();
      }
    });
  }

  onBackdropClick(): void {
    void this.live.stopSession();
    this.closed.emit();
  }

  onCloseClick(): void {
    void this.live.stopSession();
    this.closed.emit();
  }
}