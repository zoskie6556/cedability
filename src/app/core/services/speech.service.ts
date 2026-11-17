import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

// The Web Speech API is not in TypeScript's lib.dom, so we declare only what we use.
interface SpeechAlternativeLike { transcript: string }
interface SpeechResultLike { readonly length: number; readonly isFinal: boolean; [index: number]: SpeechAlternativeLike }
interface SpeechResultEventLike { resultIndex: number; results: { readonly length: number; [index: number]: SpeechResultLike } }
interface RecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}
type RecognitionCtor = new () => RecognitionLike;

/**
 * Browser dictation (speech to text) and read-aloud (text to speech).
 * Dictation works in Chrome and Edge only, so callers must check `supported()`.
 * Only ONE field can listen at a time; `owner` says which one.
 */
@Injectable({ providedIn: 'root' })
export class SpeechService {
  private readonly win = inject(DOCUMENT).defaultView as
    | (Window & { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor })
    | null;
  private recognition: RecognitionLike | null = null;
  private readonly ctor = this.win?.SpeechRecognition ?? this.win?.webkitSpeechRecognition ?? null;

  readonly supported = computed(() => this.ctor !== null);
  readonly canSpeak = computed(() => !!this.win?.speechSynthesis);

  readonly listening = signal(false);
  readonly transcript = signal('');
  readonly error = signal<string | null>(null);
  /** Whoever called start(); lets a field know if it is the one listening. */
  readonly owner = signal<unknown>(null);

  start(languageTag: string, owner: unknown): void {
    if (!this.ctor) {
      this.error.set('Voice input is not supported in this browser.');
      return;
    }
    this.stop();
    const rec = new this.ctor();
    rec.lang = languageTag;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
      this.transcript.set(text);
    };
    // Ignore events from a recogniser we already replaced, otherwise a late `onend`
    // from the old field would switch the new field off.
    rec.onerror = (event) => {
      if (this.recognition !== rec) return;
      this.error.set(event.error);
      this.listening.set(false);
    };
    rec.onend = () => {
      if (this.recognition === rec) this.listening.set(false);
    };
    this.transcript.set('');
    this.error.set(null);
    this.recognition = rec;
    this.owner.set(owner);
    rec.start();
    this.listening.set(true);
  }

  stop(): void {
    this.recognition?.stop();
    this.recognition = null;
    this.listening.set(false);
  }

  speak(text: string, languageTag: string): void {
    const synth = this.win?.speechSynthesis;
    if (!synth || text.trim().length === 0) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = languageTag;
    synth.speak(utterance);
  }

  stopSpeaking(): void {
    this.win?.speechSynthesis?.cancel();
  }
}
