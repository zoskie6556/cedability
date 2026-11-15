import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import {
  AccessibilityVoice,
  AccessibilityVoiceTheme,
} from '../models/accessibility-voice.model';

export type SpeechPlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface SpeakOptions {
  voiceId: string;
  language: string;
  rate: number;
}

interface VoiceListResponse {
  voices: unknown;
}

interface SynthesizeSpeechRequest {
  text: string;
  voiceId: string;
  rate: number;
}

interface SynthesizeSpeechResponse {
  audioBase64: string;
  contentType: string;
  isMock: boolean;
}

const MAX_SPEECH_CHUNK_LENGTH = 1_500;

@Injectable({ providedIn: 'root' })
export class SpeechPlayerService {
  private readonly functions = inject(Functions);
  private readonly document = inject(DOCUMENT);

  readonly state = signal<SpeechPlayerState>('idle');
  readonly level = signal(0);
  readonly currentText = signal('');
  readonly statusMessage = signal('');
  readonly error = signal<string | null>(null);

  private operationId = 0;
  private audio: HTMLAudioElement | null = null;
  private cancelAudio: (() => void) | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private audioSource: MediaElementAudioSourceNode | null = null;
  private levelFrameId: number | null = null;

  async loadVoices(): Promise<AccessibilityVoice[]> {
    const callable = httpsCallable<void, VoiceListResponse>(this.functions, 'listVoices');
    const result = await callable();
    return parseVoiceList(result.data.voices);
  }

  async speak(text: string, options: SpeakOptions): Promise<void> {
    this.stop();
    const operationId = ++this.operationId;
    const chunks = splitSpeechText(text);

    if (chunks.length === 0) {
      this.state.set('error');
      this.error.set('There is no text to read.');
      this.statusMessage.set('There is no text to read.');
      return;
    }

    this.error.set(null);
    this.statusMessage.set('');
    this.currentText.set(text.trim());

    for (const chunk of chunks) {
      if (operationId !== this.operationId) {
        return;
      }

      this.state.set('loading');
      try {
        const callable = httpsCallable<SynthesizeSpeechRequest, SynthesizeSpeechResponse>(
          this.functions,
          'synthesizeSpeech',
        );
        const result = await callable({
          text: chunk,
          voiceId: options.voiceId,
          rate: options.rate,
        });
        const audio = parseSpeechResponse(result.data);

        if (operationId !== this.operationId) {
          return;
        }

        this.statusMessage.set(
          audio.isMock
            ? 'The emulator is using a test tone; it does not contain spoken words.'
            : 'Playing the selected online voice.',
        );
        await this.playAudio(audio.audioBase64, audio.contentType, operationId);
      } catch (error) {
        if (operationId !== this.operationId) {
          return;
        }

        console.warn('[SpeechPlayerService] online speech failed; using browser speech.', error);
        this.statusMessage.set('Online speech is unavailable. Using your browser voice.');
        try {
          await this.playBrowserSpeech(chunk, options, operationId);
        } catch (fallbackError) {
          if (operationId !== this.operationId) {
            return;
          }

          const message =
            fallbackError instanceof Error && fallbackError.message
              ? fallbackError.message
              : 'Speech playback is unavailable in this browser.';
          this.error.set(message);
          this.statusMessage.set(message);
          this.state.set('error');
          return;
        }
      }
    }

    if (operationId === this.operationId) {
      this.stopLevelUpdates();
      this.level.set(0);
      this.state.set('idle');
      this.statusMessage.set('Speech playback complete.');
    }
  }

  pause(): void {
    if (this.audio && this.state() === 'playing') {
      this.audio.pause();
      this.state.set('paused');
      this.statusMessage.set('Speech paused.');
      return;
    }

    const speechSynthesis = this.document.defaultView?.speechSynthesis;
    if (speechSynthesis && this.state() === 'playing') {
      speechSynthesis.pause();
      this.state.set('paused');
      this.statusMessage.set('Speech paused.');
    }
  }

  resume(): void {
    if (this.audio && this.state() === 'paused') {
      void this.audio.play().catch((error: unknown) => {
        this.error.set(error instanceof Error ? error.message : 'Could not resume audio playback.');
        this.state.set('error');
      });
      this.state.set('playing');
      this.statusMessage.set('Speech resumed.');
      return;
    }

    const speechSynthesis = this.document.defaultView?.speechSynthesis;
    if (speechSynthesis && this.state() === 'paused') {
      speechSynthesis.resume();
      this.state.set('playing');
      this.statusMessage.set('Speech resumed.');
    }
  }

  stop(): void {
    this.operationId += 1;
    this.cancelAudio?.();
    this.cancelAudio = null;
    this.audio?.pause();
    this.audio = null;
    this.document.defaultView?.speechSynthesis?.cancel();
    this.stopLevelUpdates();
    this.level.set(0);
    this.state.set('idle');
    this.currentText.set('');
    this.statusMessage.set('Speech stopped.');
  }

  private async playAudio(
    audioBase64: string,
    contentType: string,
    operationId: number,
  ): Promise<void> {
    const audio = this.document.createElement('audio');
    const bytes = decodeBase64(audioBase64);
    const audioBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(audioBuffer).set(bytes);
    const objectUrl = URL.createObjectURL(new Blob([audioBuffer], { type: contentType }));
    audio.preload = 'auto';
    audio.src = objectUrl;
    this.audio = audio;
    this.connectAnalyser(audio);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        audio.removeEventListener('playing', onPlaying);
        this.stopLevelUpdates();
        this.audioSource?.disconnect();
        this.analyser?.disconnect();
        this.audioSource = null;
        this.analyser = null;
        audio.pause();
        audio.removeAttribute('src');
        URL.revokeObjectURL(objectUrl);
        if (this.audio === audio) {
          this.audio = null;
        }
        if (this.cancelAudio === cancel) {
          this.cancelAudio = null;
        }
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };
      const onEnded = (): void => finish();
      const onError = (): void => finish(new Error('The audio response could not be played.'));
      const onPlaying = (): void => {
        if (operationId === this.operationId) {
          this.state.set('playing');
          this.statusMessage.set('Speech is playing.');
          this.startLevelUpdates();
        }
      };
      const cancel = (): void => finish();

      this.cancelAudio = cancel;
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', onError);
      audio.addEventListener('playing', onPlaying);
      void audio.play().catch((error: unknown) => {
        finish(error instanceof Error ? error : new Error('The audio response could not be played.'));
      });
    });
  }

  private async playBrowserSpeech(
    text: string,
    options: SpeakOptions,
    operationId: number,
  ): Promise<void> {
    const speechSynthesis = this.document.defaultView?.speechSynthesis;
    if (!speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
      throw new Error('Browser speech is not supported. You can still read the text on screen.');
    }

    this.level.set(0);
    this.state.set('playing');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.language;
    utterance.rate = Math.min(2, Math.max(0.5, options.rate));
    utterance.onpause = () => {
      if (operationId === this.operationId) {
        this.state.set('paused');
      }
    };
    utterance.onresume = () => {
      if (operationId === this.operationId) {
        this.state.set('playing');
      }
    };

    const browserVoice = speechSynthesis
      .getVoices()
      .find((voice) => voice.lang.toLowerCase().startsWith(options.language.toLowerCase()));
    if (browserVoice) {
      utterance.voice = browserVoice;
    }

    await new Promise<void>((resolve, reject) => {
      utterance.onend = () => resolve();
      utterance.onerror = (event: SpeechSynthesisErrorEvent) =>
        reject(new Error(event.error || 'Browser speech playback failed.'));
      speechSynthesis.speak(utterance);
    });
  }

  private connectAnalyser(audio: HTMLAudioElement): void {
    const view = this.document.defaultView;
    if (!view || typeof view.AudioContext !== 'function') {
      return;
    }

    try {
      const context = this.audioContext ?? new view.AudioContext();
      this.audioContext = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      const source = context.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(context.destination);
      this.analyser = analyser;
      this.audioSource = source;

      if (context.state === 'suspended') {
        void context.resume();
      }
    } catch (error) {
      console.warn('[SpeechPlayerService] audio level analysis is unavailable.', error);
      this.analyser = null;
      this.audioSource = null;
    }
  }

  private startLevelUpdates(): void {
    const view = this.document.defaultView;
    const analyser = this.analyser;
    if (!view || !analyser || this.levelFrameId !== null) {
      return;
    }

    const samples = new Uint8Array(analyser.fftSize);
    const update = (): void => {
      if (!this.analyser) {
        this.levelFrameId = null;
        return;
      }

      this.analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const amplitude = (sample - 128) / 128;
        sum += amplitude * amplitude;
      }
      const measured = Math.min(1, Math.sqrt(sum / samples.length) * 2.5);
      this.level.set(this.level() * 0.65 + measured * 0.35);
      this.levelFrameId = view.requestAnimationFrame(update);
    };

    this.levelFrameId = view.requestAnimationFrame(update);
  }

  private stopLevelUpdates(): void {
    const view = this.document.defaultView;
    if (view && this.levelFrameId !== null) {
      view.cancelAnimationFrame(this.levelFrameId);
    }
    this.levelFrameId = null;
  }
}

export function splitSpeechText(text: string, maxLength = MAX_SPEECH_CHUNK_LENGTH): string[] {
  if (!Number.isInteger(maxLength) || maxLength < 1) {
    throw new RangeError('The speech chunk length must be a positive integer.');
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return [];
  }

  const sentences = normalized.match(/[^.!?]+[.!?]*/g) ?? [normalized];
  const chunks: string[] = [];
  let current = '';

  const appendLongSentence = (sentence: string): void => {
    for (const word of sentence.split(' ')) {
      if (word.length > maxLength) {
        if (current) {
          chunks.push(current);
          current = '';
        }
        for (let offset = 0; offset < word.length; offset += maxLength) {
          chunks.push(word.slice(offset, offset + maxLength));
        }
        continue;
      }

      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxLength) {
        chunks.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
  };

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (!sentence) {
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= maxLength) {
      current = candidate;
    } else {
      if (current) {
        chunks.push(current);
        current = '';
      }
      appendLongSentence(sentence);
    }
  }

  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function parseVoiceList(value: unknown): AccessibilityVoice[] {
  if (!Array.isArray(value)) {
    throw new Error('The voice service returned an invalid voice list.');
  }

  return value.map((item) => {
    if (!isRecord(item)) {
      throw new Error('The voice service returned an invalid voice.');
    }

    const { id, displayName, description, language, theme } = item;
    if (
      typeof id !== 'string' ||
      typeof displayName !== 'string' ||
      typeof description !== 'string' ||
      typeof language !== 'string' ||
      (theme !== 'warm' && theme !== 'cool' && theme !== 'deep')
    ) {
      throw new Error('The voice service returned an invalid voice.');
    }

    return {
      id,
      displayName,
      description,
      language,
      theme: theme as AccessibilityVoiceTheme,
    };
  });
}

function parseSpeechResponse(value: unknown): SynthesizeSpeechResponse {
  if (
    !isRecord(value) ||
    typeof value['audioBase64'] !== 'string' ||
    typeof value['contentType'] !== 'string' ||
    typeof value['isMock'] !== 'boolean'
  ) {
    throw new Error('The speech service returned an invalid audio response.');
  }

  return {
    audioBase64: value['audioBase64'],
    contentType: value['contentType'],
    isMock: value['isMock'],
  };
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
