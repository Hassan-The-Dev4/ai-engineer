import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import OpenAI from 'openai';


dotenv.config({ path: path.join(import.meta.dirname, '..', '.env'), quiet: true });


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1'
});

const MODEL = 'google/gemini-3.8-flash-lite-tts';
const SAMPLE_RATE = 24000;
const AUDIO_DIR = path.join(import.meta.dirname, 'audio');


const CONVERSATION = [
  {
    speaker: 'Amina',
    voice: 'Kore',
    emotion: 'excited',
    instructions: 'Speak with excitement and energy, at a fast pace, like sharing great news with friends.',
    text: 'Guess what? The school just opened a brand new computer lab, and every desk has its own laptop!'
  },
  {
    speaker: 'Yusuf',
    voice: 'Charon',
    emotion: 'skeptical',
    instructions: 'Speak in a calm, dry and slightly skeptical tone, slowly and deliberately.',
    text: "New laptops are nice, but without good software and a fast network, they're just expensive paperweights."
  },
  {
    speaker: 'Omar',
    voice: 'Puck',
    emotion: 'playful',
    instructions: 'Speak warmly and playfully, with a light laugh, like reassuring a friend.',
    text: "Relax, Yusuf! I already checked: they installed all the software and upgraded the Wi-Fi. Let's go try them out!"
  }
];


const pcmToWav = (pcm) => {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); 
  header.writeUInt16LE(1, 20); 
  header.writeUInt16LE(1, 22); 
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28); 
  header.writeUInt16LE(2, 32); 
  header.writeUInt16LE(16, 34); 
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
};

const generateVoice = async (line, index) => {
  const response = await openai.audio.speech.create({
    model: MODEL,
    voice: line.voice,
    input: line.text,
    instructions: line.instructions,
    response_format: 'pcm'
  });

  const pcm = Buffer.from(await response.arrayBuffer());
  const fileName = `${index + 1}_${line.speaker.toLowerCase()}_${line.emotion}.wav`;
  fs.writeFileSync(path.join(AUDIO_DIR, fileName), pcmToWav(pcm));

  return { fileName, seconds: pcm.length / (SAMPLE_RATE * 2) };
};

const main = async () => {
  console.log('=== Multi-Voice Conversation (TTS) ===\n');
  fs.mkdirSync(AUDIO_DIR, { recursive: true });

  for (const [index, line] of CONVERSATION.entries()) {
    console.log(`${line.speaker} (${line.voice}, ${line.emotion}): "${line.text}"`);
    const { fileName, seconds } = await generateVoice(line, index);
    console.log(`  -> saved audio/${fileName} (${seconds.toFixed(1)}s)\n`);
  }

  console.log(`Done: ${CONVERSATION.length} audio files saved in ${AUDIO_DIR}`);
};

try {
  await main();
} catch (error) {
  console.error('\nSomething went wrong:', error.message);
}
