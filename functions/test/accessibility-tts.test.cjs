const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { createCacheId, normalizeSpeechText } = require('../lib/accessibility/tts.js');
const { createTtsProvider, MockTtsProvider } = require('../lib/accessibility/tts-provider.js');
const { DEFAULT_VOICES } = require('../lib/accessibility/voice.js');

describe('accessibility TTS helpers', () => {
  it('strips markup and collapses whitespace before synthesis', () => {
    assert.equal(normalizeSpeechText('  <p>Hello</p>\n <strong>CEDA</strong>  '), 'Hello CEDA');
  });

  it('rejects empty or oversized speech requests', () => {
    assert.throws(() => normalizeSpeechText(' <p> </p> '), { code: 'invalid-argument' });
    assert.throws(() => normalizeSpeechText('x'.repeat(1_501)), { code: 'invalid-argument' });
  });

  it('creates stable cache keys that vary with voice and rate', () => {
    const voice = DEFAULT_VOICES[0];
    const key = createCacheId('google-cloud-tts', voice, 1, 'Hello there.');

    assert.equal(key, createCacheId('google-cloud-tts', voice, 1, 'Hello there.'));
    assert.notEqual(key, createCacheId('google-cloud-tts', DEFAULT_VOICES[1], 1, 'Hello there.'));
    assert.notEqual(key, createCacheId('google-cloud-tts', voice, 1.2, 'Hello there.'));
  });

  it('provides local mock audio without calling the cloud provider', async () => {
    const audio = await new MockTtsProvider().synthesize('Test.', DEFAULT_VOICES[0], 1);

    assert.equal(audio.isMock, true);
    assert.equal(audio.contentType, 'audio/wav');
    assert.equal(audio.bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  });

  it('selects the mock provider in the Functions emulator', () => {
    const previousValue = process.env.FUNCTIONS_EMULATOR;
    process.env.FUNCTIONS_EMULATOR = 'true';
    try {
      assert.ok(createTtsProvider() instanceof MockTtsProvider);
    } finally {
      if (previousValue === undefined) {
        delete process.env.FUNCTIONS_EMULATOR;
      } else {
        process.env.FUNCTIONS_EMULATOR = previousValue;
      }
    }
  });
});
