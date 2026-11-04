import fs from 'node:fs';
import path from 'node:path';

const slugify = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/**
 * Writes every generated asset into output/<topic>/ together with:
 * - manifest.json: models used, fallbacks, errors, costs and timings
 * - README.md: an overview of the whole content suite
 */
export const exportSuite = ({ outputRoot, topic, options, title, steps }) => {
  const dir = path.join(outputRoot, slugify(topic));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const write = (file, data) => {
    fs.writeFileSync(path.join(dir, file), data);
    return file;
  };

  const files = {};
  const { article, summary, social, header, thumbnail, narration } = steps;
  if (article.ok) files.article = write('article.md', `${article.value}\n`);
  if (summary.ok) files.summary = write('summary.txt', `${summary.value}\n`);
  if (social.ok) files.social = write('social-posts.json', JSON.stringify(social.value, null, 2));
  if (header.ok) files.header = write('header.png', header.value);
  if (thumbnail.ok) files.thumbnail = write('thumbnail.png', thumbnail.value);
  if (narration.ok) files.narration = write('narration.wav', narration.value.wav);

  const manifest = {
    topic,
    title,
    createdAt: new Date().toISOString(),
    options,
    totalCostUsd: Object.values(steps).reduce((sum, step) => sum + (step.cost ?? 0), 0),
    files,
    steps: Object.fromEntries(
      Object.entries(steps).map(([name, step]) => [
        name,
        {
          status: step.ok ? (step.attempts?.length ? 'ok (after fallback)' : 'ok') : step.skipped ? 'skipped' : 'failed',
          model: step.model ?? null,
          seconds: step.seconds ?? null,
          costUsd: step.cost ?? null,
          ...(step.error && { error: step.error }),
          ...(step.attempts?.length && { failedAttempts: step.attempts })
        }
      ])
    )
  };
  write('manifest.json', JSON.stringify(manifest, null, 2));

  const lines = [
    `# Content Suite: ${title}`,
    '',
    `Topic: **${topic}** · Tone: ${options.tone} · Narration: ${options.voice} (${options.emotion})`,
    ''
  ];
  if (files.header) lines.push('![Header](header.png)', '');
  if (summary.ok) lines.push('## Summary', '', summary.value, '');
  lines.push('## Files', '');
  const labels = {
    article: 'Full article',
    summary: 'Summary',
    social: 'Social posts',
    header: 'Header image',
    thumbnail: 'Thumbnail',
    narration: 'Narration of the summary'
  };
  for (const [key, file] of Object.entries(files)) lines.push(`- ${labels[key]}: [${file}](${file})`);
  lines.push('- Run details: [manifest.json](manifest.json)', '');
  if (social.ok) {
    lines.push('## Social Posts', '');
    for (const [network, post] of Object.entries(social.value)) lines.push(`**${network}**`, '', post, '');
  }
  write('README.md', lines.join('\n'));

  return { dir, manifest };
};
