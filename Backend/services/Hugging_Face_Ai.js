import { InferenceClient } from "@huggingface/inference";

const client = new InferenceClient(process.env.HUGGINGFACE_API_KEY);

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
}`;

  try {
    const chatCompletion = await client.chatCompletion({
      model: "Qwen/Qwen2.5-Coder-32B-Instruct",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      max_tokens: 4096,
      temperature: 0.7,
    });

    return chatCompletion.choices[0].message.content;
  } catch (error) {
    console.error('Hugging Face Error:', error.message);
    
    if (error.message?.includes('429')) {
      return JSON.stringify({ text: "⚠️ Hugging Face quota exceeded. Try again later." });
    }
    
    return JSON.stringify({ text: `❌ Error: ${error.message}` });
  }
}