import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function main(prompt) {
  const systemPrompt = `You are an expert MERN stack developer. You MUST respond with ONLY valid JSON.

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
2) Input: "create express server" -> Output: {"text": "Here's your server", "fileTree": {"app.js": {"file": {"contents": "const express = require('express');..."}}}}

Always respond with valid JSON. For simple messages, just include the "text" field. For code generation, include both "text" and "fileTree".`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 4096,
      response_format: { type: "json_object" }
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI Error:', error.message);
    
    if (error.status === 429) {
      return JSON.stringify({ 
        text: "⚠️ OpenAI rate limit exceeded. Please wait a moment and try again." 
      });
    }
    
    if (error.status === 401) {
      return JSON.stringify({ 
        text: "⚠️ OpenAI API key is invalid or not set. Please check your OPENAI_API_KEY environment variable." 
      });
    }
    
    if (error.code === 'insufficient_quota') {
      return JSON.stringify({ 
        text: "⚠️ OpenAI quota exceeded. Please check your OpenAI account billing." 
      });
    }
    
    return JSON.stringify({ 
      text: `❌ OpenAI Error: ${error.message}` 
    });
  }
}
