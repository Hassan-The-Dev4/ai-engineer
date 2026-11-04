import { openai, MODELS } from './client.js';
import { withFallback } from './fallback.js';

const QUALITY = 'low'; // cheapest gpt-image quality; "medium"/"high" look better but cost more

// DALL-E 3 and gpt-image models accept different sizes and options
const buildRequest = (model, prompt, shape) =>
  model.includes('dall-e')
    ? {
        model,
        prompt,
        size: shape === 'landscape' ? '1792x1024' : '1024x1024',
        style: 'vivid',
        response_format: 'b64_json'
      }
    : { model, prompt, size: shape === 'landscape' ? '1536x1024' : '1024x1024', quality: QUALITY };

const generateImage = async (model, prompt, shape) => {
  const result = await openai.images.generate(buildRequest(model, prompt, shape));
  const base64 = result.data?.[0]?.b64_json;
  if (!base64) throw new Error('No image data in response');
  return { value: Buffer.from(base64, 'base64'), cost: result.usage?.cost ?? null };
};

export const createHeader = (title, topic) =>
  withFallback('Header image', MODELS.header, (model) =>
    generateImage(
      model,
      `Wide blog header illustration for an article titled "${title}" about ${topic}. Cinematic composition, rich colors, modern editorial style, no text or letters.`,
      'landscape'
    )
  );

export const createThumbnail = (title, topic) =>
  withFallback('Thumbnail', MODELS.thumbnail, (model) =>
    generateImage(
      model,
      `Simple, bold square thumbnail icon representing "${title}" (${topic}). One clear central subject, flat modern style, high contrast, no text or letters.`,
      'square'
    )
  );
