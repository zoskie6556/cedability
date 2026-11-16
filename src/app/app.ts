import { afterNextRender, ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, effect, ElementRef, inject, Injector, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Auth, authState } from '@angular/fire/auth';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { ToastService } from './core/services/toast.service';
import { ToastOutletComponent } from './shared/components/toast-outlet/toast-outlet.component';
import { ChatWidgetComponent } from './shared/components/chat-widget/chat-widget.component';
import { VoiceAccessibilityModalComponent } from './features/accessibility/voice-accessibility-modal/voice-accessibility-modal';


interface OrbPrompt {
  text: string;
  lang: 'en-ZA' | 'en-GB' | 'en-US' | 'tn-ZA';
}

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ToastOutletComponent, ChatWidgetComponent, VoiceAccessibilityModalComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'handleDocumentClick($event)',
    '(document:focusin)': 'handleDocumentFocus($event)',
    '(document:keydown)': 'handleDocumentKeydown($event)',
  },
})
export class App {
  //accessibility modal part
  private readonly voiceModalOpen = signal(false);

  isVoiceModalOpen(): boolean {
    return this.voiceModalOpen();
  }

  openVoiceModal(event?: Event): void {
    event?.stopPropagation();
    this.voiceModalOpen.set(true);
  }

  closeVoiceModal(): void {
    this.voiceModalOpen.set(false);
  }

  //accessibility modal opening and closing ends here

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);
  private readonly auth = inject(Auth);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);

  protected readonly authUser = toSignal(authState(this.auth), { initialValue: undefined });
  protected readonly authStateReady = computed(() => this.authUser() !== undefined);
  protected readonly mobileMenuOpen = signal(false);
  protected readonly profileMenuOpen = signal(false);
  protected readonly isLoggingOut = signal(false);
  // Visual only for now: the language toggle does not translate anything yet.
  protected readonly language = signal<'tn' | 'en'>('en');
  private readonly closeProfileMenuOnSignOut = effect(() => {
    if (this.authUser() === null) {
      this.profileMenuOpen.set(false);
    }
  });
  
  //orb stuff
  private readonly cdr = inject(ChangeDetectorRef);

  readonly orbTexts: string[] = [
    'Hey use me for ease of access',
    'Tobetsa play go simolla',
    'I am here to help you navigate the system and help you start your biggest idea',
    'Tla ke go thuse go simolla',
    'Bua Lenna',
  ];

  readonly activeTextIndex = signal(0);
  readonly isMuted = signal(true);

  private cycleTimer: ReturnType<typeof setInterval> | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private readonly onVoicesChanged = () => {
    this.loadVoices();
  };

  ngOnInit(): void {
    this.initSpeechSynthesis();
    this.startRotation();
  }

  ngOnDestroy(): void {
    this.stopRotation();
    this.stopSpeech();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.removeEventListener('voiceschanged', this.onVoicesChanged);
    }
  }

  toggleMute(event: Event): void {
    event.stopPropagation();
    const nextMuted = !this.isMuted();
    this.isMuted.set(nextMuted);

    if (nextMuted) {
      this.stopSpeech();
    } else {
      this.speakText(this.orbTexts[this.activeTextIndex()]);
    }
    this.cdr.markForCheck();
  }

  private startRotation(): void {
    this.stopRotation();
    this.cycleTimer = setInterval(() => {
      const nextIndex = (this.activeTextIndex() + 1) % this.orbTexts.length;
      this.activeTextIndex.set(nextIndex);

      if (!this.isMuted()) {
        this.speakText(this.orbTexts[nextIndex]);
      }

      this.cdr.markForCheck();
    }, 3400);
  }

  private stopRotation(): void {
    if (this.cycleTimer !== null) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
  }

  private speakText(text: string): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const clearVoice = this.pickClearVoice();
    if (clearVoice) {
      utterance.voice = clearVoice;
      utterance.lang = clearVoice.lang;
    }
    utterance.rate = 0.96;
    utterance.pitch = 1.02;
    utterance.volume = 1;

    synth.speak(utterance);
  }

  private stopSpeech(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  private initSpeechSynthesis(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }
    this.loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', this.onVoicesChanged);
  }

  private loadVoices(): void {
    this.voices = window.speechSynthesis.getVoices();
  }

  private pickClearVoice(): SpeechSynthesisVoice | null {
    if (!this.voices.length) {
      return null;
    }
    const score = (v: SpeechSynthesisVoice): number => {
      let s = 0;
      const n = v.name.toLowerCase();
      const l = v.lang.toLowerCase();
      if (n.includes('natural') || n.includes('online') || n.includes('enhanced')) s += 25;
      if (!v.localService) s += 8;
      if (l.startsWith('en-za') || l.startsWith('en-gb') || l.startsWith('en')) s += 12;
      if (n.includes('zarvox') || n.includes('whisper')) s -= 50;
      return s;
    };
    return [...this.voices].sort((a, b) => score(b) - score(a))[0] ?? null;
  }
  //orb stuff ends here

  @ViewChild('profileMenuTrigger') private profileMenuTrigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('profileAccountMenu') private profileAccountMenu?: ElementRef<HTMLDivElement>;

  protected toggleMobileMenu(): void {
    this.mobileMenuOpen.update((isOpen) => !isOpen);
  }

  protected closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  protected setLanguage(language: 'tn' | 'en'): void {
    this.language.set(language);
  }

  protected toggleProfileMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.profileMenuOpen.update((isOpen) => !isOpen);
  }

  protected handleProfileTriggerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }

    event.preventDefault();
    this.profileMenuOpen.set(true);
    afterNextRender(
      () => this.focusProfileMenuItem(event.key === 'ArrowUp' ? -1 : 0),
      { injector: this.injector },
    );
  }

  protected closeProfileMenu(restoreFocus = false): void {
    if (!this.profileMenuOpen()) {
      return;
    }

    this.profileMenuOpen.set(false);
    if (restoreFocus) {
      queueMicrotask(() => this.profileMenuTrigger?.nativeElement.focus());
    }
  }

  protected handleDocumentClick(event: MouseEvent): void {
    if (this.profileMenuOpen() && !this.isInsideProfileMenu(event.target)) {
      this.closeProfileMenu();
    }
  }

  protected handleDocumentFocus(event: FocusEvent): void {
    if (this.profileMenuOpen() && !this.isInsideProfileMenu(event.target)) {
      this.closeProfileMenu();
    }
  }

  protected handleDocumentKeydown(event: KeyboardEvent): void {
    if (!this.profileMenuOpen()) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeProfileMenu(true);
      return;
    }

    const menu = this.profileAccountMenu?.nativeElement;
    if (!menu || !(event.target instanceof Node) || !menu.contains(event.target)) {
      return;
    }

    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const currentIndex = items.indexOf(this.elementRef.nativeElement.ownerDocument.activeElement as HTMLElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
      items[nextIndex]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const previousIndex =
        currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
      items[previousIndex]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items.at(-1)?.focus();
    }
  }

  protected async logout(): Promise<void> {
    if (this.isLoggingOut()) {
      return;
    }

    this.closeProfileMenu();
    this.isLoggingOut.set(true);

    try {
      try {
        await this.authService.signOut();
      } catch {
        this.toastService.error('Unable to log out right now. Please try again.');
        return;
      }

      this.closeMobileMenu();

      try {
        const navigated = await this.router.navigateByUrl('/account/user/login');
        if (!navigated) {
          this.toastService.error('You have been logged out, but the login page could not be opened.');
          return;
        }
        this.toastService.success('You have been logged out.');
      } catch {
        this.toastService.error('You have been logged out, but the login page could not be opened.');
      }
    } finally {
      this.isLoggingOut.set(false);
    }
  }

  private isInsideProfileMenu(target: EventTarget | null): boolean {
    const container = this.elementRef.nativeElement.querySelector('.profile-menu-container');
    return target instanceof Node && container?.contains(target) === true;
  }

  private focusProfileMenuItem(index: number): void {
    const items =
      this.profileAccountMenu?.nativeElement.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (!items?.length) {
      return;
    }

    items[index < 0 ? items.length - 1 : index]?.focus();
  }

  //speech stuff
  // ngOnDestroy(): void {
  //   if (this.cycleTimer) {
  //     clearInterval(this.cycleTimer);
  //   }
  //   if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  //     window.speechSynthesis.removeEventListener('voiceschanged', this.onVoicesChanged);
  //     window.speechSynthesis.cancel();
  //   }
  // }

  // onOrbClick(): void {
  //   if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
  //     return;
  //   }

  //   const synth = window.speechSynthesis;

  //   // Clicking while speaking stops playback; otherwise speak current phrase & advance
  //   if (synth.speaking || this.isSpeaking) {
  //     synth.cancel();
  //     this.isSpeaking = false;
  //     return;
  //   }

  //   const currentPrompt = this.orbPrompts[this.activePromptIndex];
  //   synth.cancel();

  //   const utterance = new SpeechSynthesisUtterance(currentPrompt.text);
  //   const chosenVoice = this.selectClearVoice(currentPrompt.lang);

  //   if (chosenVoice) {
  //     utterance.voice = chosenVoice;
  //     utterance.lang = chosenVoice.lang;
  //   } else {
  //     utterance.lang = currentPrompt.lang;
  //   }

  //   utterance.rate = 0.96; // slightly measured for clarity
  //   utterance.pitch = 1.03;
  //   utterance.volume = 1;

  //   utterance.onstart = () => {
  //     this.isSpeaking = true;
  //   };

  //   utterance.onend = () => {
  //     this.isSpeaking = false;
  //     this.activePromptIndex = (this.activePromptIndex + 1) % this.orbPrompts.length;
  //   };

  //   utterance.onerror = () => {
  //     this.isSpeaking = false;
  //   };

  //   synth.speak(utterance);
  // }

  // private startPromptRotation(): void {
  //   this.cycleTimer = setInterval(() => {
  //     if (!this.isSpeaking) {
  //       this.activePromptIndex = (this.activePromptIndex + 1) % this.orbPrompts.length;
  //     }
  //   }, 3600);
  // }

  // private initSpeechSynthesis(): void {
  //   if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
  //     return;
  //   }
  //   this.loadVoices();
  //   window.speechSynthesis.addEventListener('voiceschanged', this.onVoicesChanged);
  // }

  // private loadVoices(): void {
  //   this.voices = window.speechSynthesis.getVoices();
  // }

  // private selectClearVoice(preferredLang: string): SpeechSynthesisVoice | null {
  //   if (!this.voices.length) {
  //     return null;
  //   }

  //   const scoreVoice = (voice: SpeechSynthesisVoice): number => {
  //     let score = 0;
  //     const name = voice.name.toLowerCase();
  //     const lang = voice.lang.toLowerCase();

  //     // Prefer clearer neural/enhanced voices when available
  //     if (name.includes('natural') || name.includes('online') || name.includes('enhanced')) {
  //       score += 30;
  //     }
  //     if (!voice.localService) {
  //       score += 8;
  //     }
  //     if (lang === preferredLang.toLowerCase()) {
  //       score += 20;
  //     } else if (lang.startsWith('en-za') || lang.startsWith('en-gb') || lang.startsWith('en')) {
  //       score += 12;
  //     }
  //     // Avoid robotic/novelty voices
  //     if (name.includes('zarvox') || name.includes('whisper') || name.includes('bad news')) {
  //       score -= 50;
  //     }
  //     return score;
  //   };

  //   return [...this.voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ?? null;
  // }

}