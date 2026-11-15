import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import type { VoiceDefinition } from './voice';

export interface SynthesizedAudio {
  bytes: Buffer;
  contentType: string;
  extension: string;
  isMock: boolean;
}

export interface TtsProvider {
  readonly id: string;
  synthesize(text: string, voice: VoiceDefinition, rate: number): Promise<SynthesizedAudio>;
}

export class GoogleCloudTtsProvider implements TtsProvider {
  readonly id = 'google-cloud-tts';
  private readonly client = new TextToSpeechClient();

  async synthesize(text: string, voice: VoiceDefinition, rate: number): Promise<SynthesizedAudio> {
    const [response] = await this.client.synthesizeSpeech({
      input: { text },
      voice: {
        languageCode: voice.language,
        name: voice.id,
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: rate,
      },
    });

    const audioContent = response.audioContent;
    if (!audioContent) {
      throw new Error('Google Cloud Text-to-Speech returned no audio content.');
    }

    return {
      bytes:
        typeof audioContent === 'string'
          ? Buffer.from(audioContent, 'binary')
          : Buffer.from(audioContent),
      contentType: 'audio/mpeg',
      extension: 'mp3',
      isMock: false,
    };
  }
}

export class MockTtsProvider implements TtsProvider {
  readonly id = 'mock';

  async synthesize(_text: string, _voice: VoiceDefinition, _rate: number): Promise<SynthesizedAudio> {
    return {
      bytes: this.createTestTone(),
      contentType: 'audio/wav',
      extension: 'wav',
      isMock: true,
    };
  }

  private createTestTone(): Buffer {
    const sampleRate = 8_000;
    const sampleCount = sampleRate / 2;
    const dataSize = sampleCount * 2;
    const wav = Buffer.alloc(44 + dataSize);

    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + dataSize, 4);
    wav.write('WAVE', 8);
    wav.write('fmt ', 12);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(sampleRate * 2, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(dataSize, 40);

    for (let index = 0; index < sampleCount; index += 1) {
      const sample = Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 1_800;
      wav.writeInt16LE(Math.round(sample), 44 + index * 2);
    }

    return wav;
  }
}

export function createTtsProvider(): TtsProvider {
  if (process.env['FUNCTIONS_EMULATOR'] === 'true' || process.env['ACCESSIBILITY_TTS_PROVIDER'] === 'mock') {
    return new MockTtsProvider();
  }

  return new GoogleCloudTtsProvider();
}
