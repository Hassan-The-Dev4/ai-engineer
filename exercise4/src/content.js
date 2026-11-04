import { openai, MODELS } from './client.js';
import { withFallback } from './fallback.js';

const chat = async (model, messages, maxTokens, json = false) => {
  const response = await openai.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    ...(json && { response_format: { type: 'json_object' } })
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty response from model');
  return { value: text, cost: response.usage?.cost ?? null };
};

export const createArticle = (topic, tone) =>
  withFallback('Article', MODELS.text, (model) =>
    chat(
      model,
      [
        { role: 'system', content: `You are a skilled content writer. Write in a ${tone} tone for a general audience.` },
        {
          role: 'user',
          content: `Write a blog article about "${topic}" in Markdown. Start with a "# " title, then an introduction, 3-4 "## " sections and a short conclusion. Aim for about 450 words.`
        }
      ],
      1200
    )
  );

export const createSummary = (article) =>
  withFallback('Summary', MODELS.text, (model) =>
    chat(
      model,
      [{ role: 'user', content: `Summarize this article in 2-3 clear sentences. Return only the summary.\n\n${article}` }],
      200
    )
  );

export const createSocialPosts = (topic, summary) =>
  withFallback('Social posts', MODELS.text, async (model) => {
    const { value, cost } = await chat(
      model,
      [
        { role: 'system', content: 'You write engaging social media posts. Always answer with valid JSON only.' },
        {
          role: 'user',
          content: `Write social posts promoting an article about "${topic}".\nArticle summary: ${summary}\n\nReturn JSON with exactly these keys:\n- "twitter": max 280 characters, 1-2 hashtags\n- "linkedin": 3-4 professional sentences\n- "instagram": friendly, with a few emojis and 3-5 hashtags`
        }
      ],
      600,
      true
    );

    // A malformed answer counts as a failure, so the fallback model gets a chance
    const posts = JSON.parse(value);
    for (const key of ['twitter', 'linkedin', 'instagram']) {
      if (typeof posts[key] !== 'string' || !posts[key].trim()) throw new Error(`Missing "${key}" post in JSON`);
    }
    return { value: posts, cost };
  });

// Uses the article's "# " heading as the title, or the topic if there is none
export const getTitle = (article, topic) => article.match(/^#\s+(.+)$/m)?.[1].trim() ?? topic;
