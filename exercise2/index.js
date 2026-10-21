import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config({ path: path.join(import.meta.dirname, '..', '.env'), quiet: true });


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1'
});


const MODELS = [
  { id: 'openai/gpt-image-1', name: 'GPT Image 1' },
  { id: 'openai/gpt-image-1-mini', name: 'GPT Image 1 Mini' }
];

const SIZES = [
  { name: 'square', size: '1024x1024' },
  { name: 'landscape', size: '1536x1024' },
  { name: 'portrait', size: '1024x1536' }
];


const STYLES = [
  { name: 'vivid', description: 'hyper-real and dramatic, bold saturated colors, high contrast, cinematic lighting' },
  { name: 'natural', description: 'realistic and natural-looking, soft natural lighting, true-to-life muted colors' }
];

const QUALITY = 'low'; 
const DEFAULT_THEME = 'cyberpunk cityscape';
const IMAGES_DIR = path.join(import.meta.dirname, 'images');

const slugify = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');


const getPngSize = (bytes) => `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;


const generateImage = async ({ theme, model, size, style, runDir }) => {
  const prompt = `${theme}, ${style.description}`;
  const fileName = `${slugify(model.name)}_${size.name}_${style.name}.png`;
  const metadata = {
    file: fileName,
    model: model.id,
    modelName: model.name,
    sizeName: size.name,
    requestedSize: size.size,
    style: style.name,
    prompt,
    quality: QUALITY
  };

  const startedAt = Date.now();
  try {
    const result = await openai.images.generate({
      model: model.id,
      prompt,
      size: size.size,
      quality: QUALITY
    });

    const bytes = Buffer.from(result.data[0].b64_json, 'base64');
    fs.writeFileSync(path.join(runDir, fileName), bytes);

    return {
      ...metadata,
      actualSize: getPngSize(bytes),
      fileSizeKB: Math.round(bytes.length / 1024),
      generationSeconds: (Date.now() - startedAt) / 1000,
      tokens: result.usage?.total_tokens ?? null,
      costUsd: result.usage?.cost ?? null,
      createdAt: new Date().toISOString()
    };
  } catch (error) {
    return { ...metadata, file: null, error: error.message, generationSeconds: (Date.now() - startedAt) / 1000 };
  }
};

const main = async () => {
  console.log('=== Smart Image Generator ===\n');


  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const input = await rl.question(`Enter a theme (press Enter for "${DEFAULT_THEME}"): `);
  rl.close();
  const theme = input.trim() || DEFAULT_THEME;

  const createdAt = new Date().toISOString();
  const runDir = path.join(IMAGES_DIR, `${slugify(theme)}_${createdAt.replace(/[:.]/g, '-')}`);
  fs.mkdirSync(runDir, { recursive: true });


  const variations = MODELS.flatMap((model) =>
    SIZES.flatMap((size) => STYLES.map((style) => ({ theme, model, size, style, runDir })))
  );

  console.log(`\nGenerating ${variations.length} images for "${theme}" (all at the same time)...\n`);

  let finished = 0;
  const images = await Promise.all(
    variations.map(async (variation) => {
      const image = await generateImage(variation);
      finished++;
      const label = `${image.modelName} · ${image.sizeName} · ${image.style}`;
      const details = image.error
        ? `FAILED: ${image.error}`
        : `${image.actualSize}, ${image.generationSeconds.toFixed(1)}s, $${(image.costUsd ?? 0).toFixed(4)}`;
      console.log(`[${finished}/${variations.length}] ${label} -> ${details}`);
      return image;
    })
  );


  const metadata = {
    theme,
    createdAt,
    quality: QUALITY,
    totalImages: images.length,
    successful: images.filter((image) => !image.error).length,
    totalCostUsd: images.reduce((sum, image) => sum + (image.costUsd ?? 0), 0),
    images
  };
  fs.writeFileSync(path.join(runDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

  console.log(`\nDone: ${metadata.successful}/${metadata.totalImages} images, total cost $${metadata.totalCostUsd.toFixed(4)}`);
  console.log(`Images and metadata.json saved in: ${runDir}`);
};

try {
  await main();
} catch (error) {
  console.error('\nSomething went wrong:', error.message);
}
