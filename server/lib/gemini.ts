import { GoogleGenAI } from '@google/genai';

let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in server secrets.');
  }
  if (!cachedClient) {
  cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
}

export const CRIPPO_GEMINI_MODEL = 'gemini-4-hydrogen';
