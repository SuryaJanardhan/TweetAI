import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import { loadConfig } from '../config.js';
import { AppError } from './errors.js';

let geminiClient: GoogleGenAI | null = null;
let groqClient: Groq | null = null;

const config = loadConfig();

// Helper to check if a key is set and is not a placeholder
function isValidKey(key: string | undefined): boolean {
  return !!key && key !== 'your_gemini_api_key_here' && key !== 'your_groq_api_key_here' && !key.startsWith('your_');
}

if (isValidKey(config.geminiApiKey)) {
  geminiClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
}

if (isValidKey(config.groqApiKey)) {
  groqClient = new Groq({ apiKey: config.groqApiKey });
}

export interface GenerateOptions {
  jsonMode?: boolean;
}

export async function generateText(prompt: string, options: GenerateOptions = {}): Promise<string> {
  const errors: Error[] = [];

  // 1. Attempt Gemini (Primary)
  if (geminiClient) {
    try {
      // eslint-disable-next-line no-console
      console.log(`[LLM] Attempting content generation with Gemini...`);
      const response = await geminiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: options.jsonMode
          ? {
              responseMimeType: 'application/json'
            }
          : undefined
      });

      const text = response.text;
      if (text) {
        return text.trim();
      }
      throw new Error('Gemini response returned empty text');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // eslint-disable-next-line no-console
      console.warn(`[LLM] Gemini generation failed: ${err.message}. Falling back to Groq...`);
      errors.push(err);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('[LLM] Gemini API key not configured or invalid. Skipping Gemini...');
  }

  // 2. Attempt Groq (Fallback)
  if (groqClient) {
    try {
      // eslint-disable-next-line no-console
      console.log(`[LLM] Attempting content generation with Groq...`);
      const chatCompletion = await groqClient.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        response_format: options.jsonMode ? { type: 'json_object' } : undefined
      });

      const text = chatCompletion.choices[0]?.message?.content;
      if (text) {
        return text.trim();
      }
      throw new Error('Groq response returned empty content');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // eslint-disable-next-line no-console
      console.error(`[LLM] Groq generation failed: ${err.message}`);
      errors.push(err);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('[LLM] Groq API key not configured or invalid. Skipping Groq...');
  }

  // If both failed or neither was configured
  if (errors.length > 0) {
    throw new AppError(
      502,
      'llm_generation_failed',
      `LLM generation failed for all configured providers. Errors: ${errors.map((e) => e.message).join('; ')}`
    );
  }

  // No providers available (e.g., in local test mode with placeholders)
  // We return a mock response to allow testing/offline mode
  // eslint-disable-next-line no-console
  console.log('[LLM] No API keys configured. Returning stubbed mock response.');
  if (options.jsonMode) {
    return JSON.stringify({
      mocked: true,
      topics: ['AI', 'Tech', 'Software Engineering'],
      strategy: 'post_original_tweet',
      content: 'Autonomous AI orchestration is the future of developer efficiency. #AI #DevOps',
      reflection: 'The post succeeded and safety checks were clean.',
      lesson: 'Keep prompts focused on technical domains.'
    });
  }
  return 'Mocked content for dry run execution.';
}
