import { Injectable, OnDestroy, signal } from '@angular/core';
import { GoogleGenAI, Modality, Session } from '@google/genai';
import { IdeaDraftEntry, VoiceSessionState } from '../models/accessibility-voice.model';

@Injectable({ providedIn: 'root' })
export class GeminiLiveService implements OnDestroy {
  readonly sessionState = signal<VoiceSessionState>('idle');
  readonly statusMessage = signal<string>('Preparing voice interface...');
  readonly draftedIdea = signal<string>('');
  readonly assistantReply = signal<string>('');
  readonly entries = signal<IdeaDraftEntry[]>([]);

  private session: Session | null = null;
  private micStream: MediaStream | null = null;
  private captureCtx: AudioContext | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private playbackCtx: AudioContext | null = null;
  private nextPlaybackTime = 0;

  private readonly model = 'gemini-2.5-flash';
  private readonly systemInstruction =
    'You are a hands-free voice accessibility assistant helping users who cannot see or type draft, structure, and refine their ideas clearly and concisely.';

  async startSession(apiKey: string): Promise<void> {
    if (this.session) {
      return;
    }

    if (!apiKey?.trim()) {
      this.sessionState.set('error');
      this.statusMessage.set('Missing Gemini API key or ephemeral token.');
      return;
    }

    this.sessionState.set('connecting');
    this.statusMessage.set('Connecting to Gemini Live...');
    this.draftedIdea.set('');
    this.assistantReply.set('');

    try {
      const ai = new GoogleGenAI({ apiKey });

      this.session = await ai.live.connect({
        model: this.model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: {
            parts: [{ text: this.systemInstruction }],
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            this.sessionState.set('listening');
            this.statusMessage.set('Listening — speak to draft your idea...');
          },
          onmessage: (msg) => {
            this.handleServerMessage(msg);
          },
          onerror: () => {
            this.sessionState.set('error');
            this.statusMessage.set('Voice connection error. Try again.');
          },
          onclose: () => {
            if (this.sessionState() !== 'error') {
              this.sessionState.set('idle');
              this.statusMessage.set('Voice session closed.');
            }
          },
        },
      });

      await this.startMicrophoneCapture();
    } catch {
      this.cleanupMedia();
      this.session = null;
      this.sessionState.set('error');
      this.statusMessage.set('Could not start microphone or Gemini Live session.');
    }
  }

  async stopSession(): Promise<void> {
    this.cleanupMedia();

    if (this.session) {
      try {
        this.session.close();
      } catch {
        // Ignore close errors during teardown
      }
      this.session = null;
    }

    this.sessionState.set('idle');
    this.statusMessage.set('Preparing voice interface...');
  }

  appendIdeaNote(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.entries.update((list) => [
      ...list,
      {
        id: crypto.randomUUID(),
        role: 'user',
        text: trimmed,
        timestamp: Date.now(),
      },
    ]);
  }

  ngOnDestroy(): void {
    void this.stopSession();
  }

  private handleServerMessage(msg: any): void {
    const serverContent = msg?.serverContent;

    const inputTranscript = serverContent?.inputTranscription?.text;
    if (inputTranscript) {
      this.draftedIdea.update((curr) => `${curr}${inputTranscript}`);
    }

    const outputTranscript = serverContent?.outputTranscription?.text;
    if (outputTranscript) {
      this.assistantReply.update((curr) => `${curr}${outputTranscript}`);
    }

    const parts = serverContent?.modelTurn?.parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (part?.inlineData?.data && String(part.inlineData.mimeType || '').startsWith('audio/pcm')) {
          this.sessionState.set('speaking');
          this.statusMessage.set('Speaking response...');
          this.playPcm16Chunk(part.inlineData.data, 24000);
        }
      }
    }

    if (serverContent?.turnComplete) {
      const currentDraft = this.draftedIdea().trim();
      const currentReply = this.assistantReply().trim();

      if (currentDraft || currentReply) {
        this.entries.update((list) => [
          ...list,
          ...(currentDraft
            ? [{ id: crypto.randomUUID(), role: 'user' as const, text: currentDraft, timestamp: Date.now() }]
            : []),
          ...(currentReply
            ? [{ id: crypto.randomUUID(), role: 'assistant' as const, text: currentReply, timestamp: Date.now() }]
            : []),
        ]);
      }

      this.draftedIdea.set('');
      this.assistantReply.set('');
      if (this.session) {
        this.sessionState.set('listening');
        this.statusMessage.set('Listening — speak to continue your idea...');
      }
    }
  }

  private async startMicrophoneCapture(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is unsupported in this browser.');
    }

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.captureCtx = new AudioCtx({ sampleRate: 16000 });
    const source = this.captureCtx.createMediaStreamSource(this.micStream);
    this.processorNode = this.captureCtx.createScriptProcessor(4096, 1, 1);

    this.processorNode.onaudioprocess = (event) => {
      if (!this.session || this.sessionState() === 'error') return;
      const float32 = event.inputBuffer.getChannelData(0);
      const base64Pcm = this.float32ToPcm16Base64(float32);
      this.session.sendRealtimeInput({
        audio: {
          data: base64Pcm,
          mimeType: 'audio/pcm;rate=16000',
        },
      });
    };

    source.connect(this.processorNode);
    this.processorNode.connect(this.captureCtx.destination);
  }

  private playPcm16Chunk(base64Data: string, sampleRate: number): void {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!this.playbackCtx) {
      this.playbackCtx = new AudioCtx({ sampleRate });
      this.nextPlaybackTime = this.playbackCtx.currentTime;
    }

    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const pcm16 = new Int16Array(bytes.buffer);
    const audioBuffer = this.playbackCtx.createBuffer(1, pcm16.length, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < pcm16.length; i++) {
      channelData[i] = pcm16[i] / 32768;
    }

    const src = this.playbackCtx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(this.playbackCtx.destination);

    const startAt = Math.max(this.playbackCtx.currentTime, this.nextPlaybackTime);
    src.start(startAt);
    this.nextPlaybackTime = startAt + audioBuffer.duration;
  }

  private float32ToPcm16Base64(float32: Float32Array): string {
    const pcm16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const clamped = Math.max(-1, Math.min(1, float32[i]));
      pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }

    const bytes = new Uint8Array(pcm16.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private cleanupMedia(): void {
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }
    if (this.captureCtx) {
      void this.captureCtx.close();
      this.captureCtx = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.playbackCtx) {
      void this.playbackCtx.close();
      this.playbackCtx = null;
    }
    this.nextPlaybackTime = 0;
  }
}