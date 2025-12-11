import { GoogleGenAI } from "@google/genai";
const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY;

const ai = new GoogleGenAI({ apiKey: GOOGLE_AI_KEY });

async function main(prompt) {
  
  const finalPrompt = `You must respond in valid JSON format only. Never respond with plain text.

User request: ${prompt}

Your response must be valid JSON with this structure:
- For simple messages: {"text": "your response"}
- For code generation: {"text": "explanation", "fileTree": {...}}

Respond now in JSON:`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-001",
      generationConfig:{
        temperature: 0.7,
      },
      systemInstruction: `You are an expert MERN stack developer. You MUST ALWAYS respond with ONLY valid JSON. No plain text.

JSON Structure:
{
  "text": "explanation",
  "fileTree": {
    "filename": {
      "file": {
        "contents": "code"
      }
    }
  }
}

Examples:
1) Input: "hi" -> Output: {"text": "Hello! How can I help you?"}
2) Input: "create express server" -> Output: {"text": "Here's your server", "fileTree": {"app.js": {"file": {"contents": "const express = require('express');..."}}}}`,
      contents: finalPrompt,
    });
    return response.text;
  } catch (error) {
    console.error('AI Service Error:', error.message);
  
    if (error.status === 429) {
      return JSON.stringify({
        text: "⚠️ AI quota exceeded. Please wait a few minutes and try again. Free tier limits: 15 requests/min, 1500 requests/day."
      });
    }
    
    return JSON.stringify({
      text: `❌ AI service error: ${error.message || 'Unknown error'}. Please try again later.`
    });
  }
}

export { main };