import {GoogleGenAI} from '@google/genai';
const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY;

const ai = new GoogleGenAI({apiKey: GOOGLE_AI_KEY});

async function main(prompt) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-001',
    contents:prompt
  });
  return response.text;
}

export { main };