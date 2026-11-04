import path from 'node:path';
import dotenv from 'dotenv';
import OpenAI from 'openai';

// .env lives in the project root, two folders above this file
dotenv.config({ path: path.join(import.meta.dirname, '..', '..', '.env'), quiet: true });

// The key in .env is an OpenRouter key (sk-or-...), so every request goes through OpenRouter.
// maxRetries is 0 because retries and fallbacks are handled in fallback.js
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  maxRetries: 0
});

// Each list is a fallback chain: the first model is tried first, the next ones only if it fails
export const MODELS = {
  text: ['openai/gpt-4o-mini', 'openai/gpt-4.1-nano'],
  // DALL-E 3 was shut down on May 12, 2026 and gpt-image-1 may be retired too, so newer models act as fallbacks
  header: ['openai/dall-e-3', 'openai/gpt-image-1', 'openai/gpt-image-1-mini', 'openai/gpt-image-2'],
  thumbnail: ['openai/gpt-image-1', 'openai/gpt-image-1-mini', 'openai/gpt-image-2'],
  // OpenAI's TTS models are not on OpenRouter; Gemini TTS supports voices and emotion instructions
  speech: ['google/gemini-3.8-flash-lite-tts', 'google/gemini-3.8-flash-tts']
};
