import path from 'node:path';
import readline from 'node:readline/promises';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config({ path: path.join(import.meta.dirname, '..', '.env'), quiet: true });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1'
});

const MODEL = 'openai/gpt-4o-mini'; 
const DEFAULT_TOPIC = 'Types of computers: hardware and software';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const streamChat = async (messages, maxTokens) => {
  const stream = await openai.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: maxTokens,
    stream: true
  });

  let fullText = '';
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || '';
    process.stdout.write(text);
    fullText += text;
  }
  process.stdout.write('\n');

  return fullText;
};


const ask = async (messages, content, maxTokens) => {
  messages.push({ role: 'user', content });
  const reply = await streamChat(messages, maxTokens);
  messages.push({ role: 'assistant', content: reply });
  return reply;
};

const main = async () => {
  console.log('=== Smart Content Assistant ===\n');


  const input = await rl.question(`Enter a topic (press Enter for "${DEFAULT_TOPIC}"): `);
  const topic = input.trim() || DEFAULT_TOPIC;

  const messages = [
    {
      role: 'system',
      content: `You are a helpful content assistant who writes clear, beginner-friendly blog content. The current topic is "${topic}". Keep answers focused on this topic.`
    }
  ];


  console.log(`\n--- Blog Post Outline: ${topic} ---\n`);
  await ask(
    messages,
    `Create a blog post outline about "${topic}". Include a title, numbered main sections, and 2-3 short bullet points under each section.`,
    800
  );


  console.log('\n--- Summary ---\n');
  await ask(messages, 'Summarize the outline above in exactly 2 sentences.', 150);

 
  console.log('\n--- Follow-up Questions (type "exit" to quit) ---');
  while (true) {
    const question = (await rl.question('\nYou: ')).trim();
    if (!question) continue;
    if (question.toLowerCase() === 'exit') break;

    process.stdout.write('\nAssistant: ');
    await ask(messages, question, 500);
  }

  console.log('\nGoodbye!');
};

try {
  await main();
} catch (error) {
  console.error('\nSomething went wrong:', error.message);
} finally {
  rl.close();
}
