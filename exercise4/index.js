#!/usr/bin/env node
import path from 'node:path';
import readline from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { createArticle, createSummary, createSocialPosts, getTitle } from './src/content.js';
import { createHeader, createThumbnail } from './src/visuals.js';
import { createNarration, VOICES, EMOTIONS } from './src/audio.js';
import { exportSuite } from './src/export.js';

const OUTPUT_ROOT = path.join(import.meta.dirname, 'output');

const HELP = `
AI Content Studio: turns one topic into a full content suite

Usage:
  node exercise4/index.js [topic] [options]

Options:
  -t, --topic <text>     Topic to write about (asked interactively if missing)
      --tone <text>      Writing tone (default: friendly)
  -v, --voice <name>     Narration voice: ${VOICES.join(', ')} (default: Kore)
  -e, --emotion <name>   Narration emotion: ${Object.keys(EMOTIONS).join(', ')} (default: warm)
      --no-images        Skip the header and thumbnail
      --no-audio         Skip the narration
  -h, --help             Show this help

Example:
  node exercise4/index.js "Types of computers" --tone educational --voice Charon --emotion excited
`;

const parseCli = () => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    allowNegative: true,
    options: {
      topic: { type: 'string', short: 't' },
      tone: { type: 'string', default: 'friendly' },
      voice: { type: 'string', short: 'v', default: 'Kore' },
      emotion: { type: 'string', short: 'e', default: 'warm' },
      images: { type: 'boolean', default: true },
      audio: { type: 'boolean', default: true },
      help: { type: 'boolean', short: 'h', default: false }
    }
  });

  const voice = VOICES.find((name) => name.toLowerCase() === values.voice.toLowerCase());
  if (!voice) throw new Error(`Unknown voice "${values.voice}". Choose one of: ${VOICES.join(', ')}`);
  const emotion = values.emotion.toLowerCase();
  if (!EMOTIONS[emotion]) throw new Error(`Unknown emotion "${values.emotion}". Choose one of: ${Object.keys(EMOTIONS).join(', ')}`);

  return { ...values, voice, emotion, topic: values.topic ?? (positionals.join(' ') || undefined) };
};

const askTopic = async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question('What topic should the content suite be about? ')).trim();
  } finally {
    rl.close();
  }
};

// Runs one production step, times it and turns any error into a result instead of crashing the app
const runStep = async (label, enabled, task) => {
  if (!enabled) {
    console.log(`   skip   ${label}`);
    return { ok: false, skipped: true };
  }

  const startedAt = Date.now();
  const seconds = () => Number(((Date.now() - startedAt) / 1000).toFixed(1));
  try {
    const { value, cost, model, attempts } = await task();
    console.log(`   done   ${label} with ${model} (${seconds()}s)`);
    return { ok: true, value, cost, model, attempts, seconds: seconds() };
  } catch (error) {
    console.log(`   failed ${label}: ${error.message}`);
    return { ok: false, error: error.message, attempts: error.attempts, seconds: seconds() };
  }
};

// Fallback text for later steps when the summary fails: the article's first real paragraph
const firstParagraph = (article) =>
  article.split(/\n\s*\n/).find((block) => block.trim() && !block.trim().startsWith('#'))?.trim() ?? article.slice(0, 400);

const main = async () => {
  let options;
  try {
    options = parseCli();
  } catch (error) {
    console.error(`Error: ${error.message}\n${HELP}`);
    process.exitCode = 1;
    return;
  }
  if (options.help) return console.log(HELP);

  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY is missing. Add it to the .env file in the project root.');
    process.exitCode = 1;
    return;
  }

  const topic = options.topic || (await askTopic());
  if (!topic) {
    console.error('Error: a topic is required.');
    process.exitCode = 1;
    return;
  }

  console.log(`\n=== AI Content Studio ===`);
  console.log(`Topic: ${topic} | Tone: ${options.tone} | Voice: ${options.voice} (${options.emotion})\n`);

  // 1. Content creation: the article is the core of the suite, so the run stops if it fails
  console.log('Producing content...');
  const article = await runStep('Article', true, () => createArticle(topic, options.tone));
  if (!article.ok) {
    console.error('\nCannot continue without an article. Check your API key, credit and internet connection.');
    process.exitCode = 1;
    return;
  }
  const title = getTitle(article.value, topic);

  // 2. Visual design: only needs the title, so it starts now and runs while the text and audio steps finish
  const visuals = Promise.all([
    runStep('Header image', options.images, () => createHeader(title, topic)),
    runStep('Thumbnail', options.images, () => createThumbnail(title, topic))
  ]);

  const summary = await runStep('Summary', true, () => createSummary(article.value));
  // 4. Quality control: if the summary failed, later steps use the article's first paragraph instead
  const summaryText = summary.ok ? summary.value : firstParagraph(article.value);
  if (!summary.ok) console.log('   note   Using the first paragraph of the article instead of the summary');

  const [social, narration] = await Promise.all([
    runStep('Social posts', true, () => createSocialPosts(topic, summaryText)),
    // 3. Audio production: narrates the summary with the chosen voice and emotion
    runStep('Narration', options.audio, () => createNarration(summaryText, options.voice, options.emotion))
  ]);

  const [header, thumbnail] = await visuals;

  console.log('\nQuality check');
  const steps = { article, summary, social, header, thumbnail, narration };
  const failed = Object.entries(steps).filter(([, step]) => !step.ok && !step.skipped);
  console.log(failed.length ? `   ${failed.length} step(s) failed: ${failed.map(([name]) => name).join(', ')}` : '   All steps succeeded');

  // 5. Export system
  console.log('\nExport');
  const { dir, manifest } = exportSuite({ outputRoot: OUTPUT_ROOT, topic, options, title, steps });
  for (const file of [...Object.values(manifest.files), 'manifest.json', 'README.md']) console.log(`   ${file}`);
  console.log(`\nContent suite saved in: ${dir}`);
  console.log(`Total cost: $${manifest.totalCostUsd.toFixed(4)}`);
  if (failed.length) process.exitCode = 2;
};

try {
  await main();
} catch (error) {
  console.error('\nUnexpected error:', error.message);
  process.exitCode = 1;
}
