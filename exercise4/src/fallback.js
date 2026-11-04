import { APIConnectionError } from 'openai';

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

// Rate limits, server errors and network problems are worth retrying; bad requests are not
const isRetryable = (error) => error instanceof APIConnectionError || RETRYABLE_STATUS.has(error.status);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// API errors can be long multi-line JSON; keep the log to one short line
const shortMessage = (error) => {
  const text = error.message.replace(/\s+/g, ' ').trim();
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
};

/**
 * Runs `task(model)` with each model in the chain until one succeeds.
 * Temporary errors are retried with exponential backoff (1s, 2s) before moving to the next model.
 * Returns { value, cost, model, attempts }; throws with every attempt attached if all models fail.
 */
export const withFallback = async (label, models, task, { retries = 2 } = {}) => {
  const attempts = [];

  for (const model of models) {
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        const { value, cost = null } = await task(model);
        return { value, cost, model, attempts };
      } catch (error) {
        attempts.push({ model, attempt, status: error.status ?? null, error: shortMessage(error) });

        if (!isRetryable(error) || attempt > retries) break;
        const delay = 1000 * 2 ** (attempt - 1);
        console.log(`   retry  ${label}: ${model} failed (${shortMessage(error)}), retrying in ${delay / 1000}s`);
        await wait(delay);
      }
    }

    const next = models[models.indexOf(model) + 1];
    const reason = attempts.at(-1).error;
    console.log(`   ${next ? `fallback ${label}: ${model} failed (${reason}), switching to ${next}` : `failed ${label}: ${model} failed (${reason})`}`);
  }

  const error = new Error(`${label}: all models failed`);
  error.attempts = attempts;
  throw error;
};
