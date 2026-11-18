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
  private audioChunkCount = 0;

  private readonly model = 'gemini-2.5-flash-native-audio-preview-12-2025';
  private readonly systemInstruction =
    'You are a hands-free voice accessibility assistant helping users who cannot see or type draft, structure, and refine their ideas clearly and concisely.';

  async startSession(apiKey: string): Promise<void> {
    console.log('[GeminiLive] startSession called', {
      hasExistingSession: Boolean(this.session),
      hasApiKey: Boolean(apiKey?.trim()),
      model: this.model,
    });

    if (this.session) {
      console.warn('[GeminiLive] Session already active; ignoring duplicate startSession call');
      return;
    }

    if (!apiKey?.trim()) {
      console.error('[GeminiLive] Missing Gemini API key or ephemeral token');
      this.sessionState.set('error');
      this.statusMessage.set('Missing Gemini API key or ephemeral token.');
      return;
    }

    this.sessionState.set('connecting');
    this.statusMessage.set('Connecting to Gemini Live...');
    this.draftedIdea.set('');
    this.assistantReply.set('');
    this.audioChunkCount = 0;

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          apiVersion: 'v1alpha',
        },
      });
      console.log('[GeminiLive] Connecting via ai.live.connect...');

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
            console.log('[GeminiLive] WebSocket / Live session opened');
            this.sessionState.set('listening');
            this.statusMessage.set('Listening — speak to draft your idea...');
          },
          onmessage: (msg) => {
            this.handleServerMessage(msg);
          },
          onerror: (err) => {
            console.error('[GeminiLive] Live session error callback:', err);
            this.sessionState.set('error');
            this.statusMessage.set('Voice connection error. Try again.');
          },
          onclose: (event) => {
            console.error('[GeminiLive] Live session closed', {
              code: event.code,
              reason: event.reason,
              wasClean: event.wasClean,
            });
            if (this.sessionState() !== 'error') {
              this.sessionState.set('idle');
              this.statusMessage.set('Voice session closed.');
            }
          },
        },
      });

      console.log('[GeminiLive] Live session connected; starting microphone capture');
      await this.startMicrophoneCapture();
      console.log('[GeminiLive] Microphone capture started successfully');
    } catch (err) {
      console.error('[GeminiLive] Failed to start session or microphone capture:', err);
      this.cleanupMedia();
      this.session = null;
      this.sessionState.set('error');
      this.statusMessage.set('Could not start microphone or Gemini Live session.');
    }
  }

  async stopSession(): Promise<void> {
    console.log('[GeminiLive] stopSession called', {
      currentState: this.sessionState(),
      hasSession: Boolean(this.session),
      totalAudioChunksPlayed: this.audioChunkCount,
    });

    this.cleanupMedia();

    if (this.session) {
      try {
        this.session.close();
        console.log('[GeminiLive] Active session closed');
      } catch (err) {
        console.warn('[GeminiLive] Error while closing session:', err);
      }
      this.session = null;
    }

    this.sessionState.set('idle');
    this.statusMessage.set('Preparing voice interface...');
  }

  appendIdeaNote(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) {
      console.warn('[GeminiLive] appendIdeaNote called with empty text');
      return;
    }
    console.log('[GeminiLive] Appending manual idea note:', trimmed);
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
    console.log('[GeminiLive] ngOnDestroy triggered');
    void this.stopSession();
  }

  private handleServerMessage(msg: any): void {
    const serverContent = msg?.serverContent;
    if (!serverContent) {
      console.log('[GeminiLive] Non-serverContent message received:', msg);
      return;
    }

    const inputTranscript = serverContent?.inputTranscription?.text;
    if (inputTranscript) {
      console.log('[GeminiLive] Input transcript chunk:', inputTranscript);
      this.draftedIdea.update((curr) => `${curr}${inputTranscript}`);
    }

    const outputTranscript = serverContent?.outputTranscription?.text;
    if (outputTranscript) {
      console.log('[GeminiLive] Output transcript chunk:', outputTranscript);
      this.assistantReply.update((curr) => `${curr}${outputTranscript}`);
    }

    const parts = serverContent?.modelTurn?.parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (part?.inlineData?.data && String(part.inlineData.mimeType || '').startsWith('audio/pcm')) {
          this.audioChunkCount += 1;
          if (this.audioChunkCount === 1 || this.audioChunkCount % 25 === 0) {
            console.log(
              `[GeminiLive] Receiving PCM audio chunk #${this.audioChunkCount} (${part.inlineData.mimeType}, base64Len=${part.inlineData.data.length})`
            );
          }
          this.sessionState.set('speaking');
          this.statusMessage.set('Speaking response...');
          this.playPcm16Chunk(part.inlineData.data, 24000);
        }
      }
    }

    if (serverContent?.turnComplete) {
      const currentDraft = this.draftedIdea().trim();
      const currentReply = this.assistantReply().trim();
      console.log('[GeminiLive] Turn complete', {
        currentDraft,
        currentReply,
        audioChunkCount: this.audioChunkCount,
      });

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
      console.error('[GeminiLive] navigator.mediaDevices.getUserMedia unavailable');
      throw new Error('Microphone access is unsupported in this browser.');
    }

    console.log('[GeminiLive] Requesting microphone access (16kHz mono)...');
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    console.log('[GeminiLive] Microphone stream tracks:', this.micStream.getAudioTracks().map((t) => ({
      label: t.label,
      enabled: t.enabled,
      readyState: t.readyState,
      settings: t.getSettings(),
    })));

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.captureCtx = new AudioCtx({ sampleRate: 16000 });
    console.log('[GeminiLive] Capture AudioContext state:', this.captureCtx.state, 'sampleRate:', this.captureCtx.sampleRate);

    const source = this.captureCtx.createMediaStreamSource(this.micStream);
    this.processorNode = this.captureCtx.createScriptProcessor(4096, 1, 1);

    let sentFrameCount = 0;
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
      sentFrameCount += 1;
      if (sentFrameCount === 1 || sentFrameCount % 50 === 0) {
        console.log(`[GeminiLive] Sent mic audio frame #${sentFrameCount}`);
      }
    };

    source.connect(this.processorNode);
    this.processorNode.connect(this.captureCtx.destination);
  }

  private playPcm16Chunk(base64Data: string, sampleRate: number): void {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!this.playbackCtx) {
      this.playbackCtx = new AudioCtx({ sampleRate });
      this.nextPlaybackTime = this.playbackCtx.currentTime;
      console.log('[GeminiLive] Created playback AudioContext:', {
        state: this.playbackCtx.state,
        sampleRate: this.playbackCtx.sampleRate,
      });
    }

    if (this.playbackCtx.state === 'suspended') {
      console.warn('[GeminiLive] Playback AudioContext is suspended; attempting resume()');
      void this.playbackCtx.resume();
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
    console.log('[GeminiLive] Cleaning up media nodes and streams...');
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