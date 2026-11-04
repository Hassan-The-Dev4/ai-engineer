import { openai, MODELS } from './client.js';
import { withFallback } from './fallback.js';

const SAMPLE_RATE = 24000;

export const VOICES = ['Kore', 'Puck', 'Charon', 'Aoede', 'Fenrir', 'Leda', 'Orus', 'Zephyr'];

// Emotion name -> delivery instructions sent to the TTS model
export const EMOTIONS = {
  warm: 'Speak in a warm, friendly and welcoming tone, at a relaxed pace.',
  excited: 'Speak with excitement and energy, at a lively pace, like sharing great news.',
  calm: 'Speak calmly and softly, slowly and soothingly, like a meditation guide.',
  serious: 'Speak in a serious, confident and professional tone, like a news anchor.',
  dramatic: 'Speak dramatically, with suspense and strong emphasis, like a movie trailer narrator.'
};

// The model returns raw PCM audio (16-bit, mono, 24 kHz); adding a WAV header makes it playable
const pcmToWav = (pcm) => {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28); // bytes per second
  header.writeUInt16LE(2, 32); // bytes per sample
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
};

export const createNarration = (text, voice, emotion) =>
  withFallback('Narration', MODELS.speech, async (model) => {
    const response = await openai.audio.speech.create({
      model,
      voice,
      input: text,
      instructions: EMOTIONS[emotion],
      response_format: 'pcm'
    });

    const pcm = Buffer.from(await response.arrayBuffer());
    if (pcm.length === 0) throw new Error('Empty audio response');
    return { value: { wav: pcmToWav(pcm), seconds: pcm.length / (SAMPLE_RATE * 2) } };
  });
