import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function analyzeSpeaking(audioData: string, taskType: string) {
  const model = "gemini-2.5-flash-native-audio-preview-12-2025";
  
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: `You are a PTE Speaking Examiner. Analyze this audio for ${taskType}. Provide a score (10-90) for Fluency, Pronunciation, and Content. Give specific feedback on pauses, rhythm, and mispronounced words. Return JSON.` },
          { inlineData: { mimeType: "audio/wav", data: audioData } }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json"
    }
  });

  return JSON.parse(response.text || "{}");
}

export async function analyzeWriting(text: string, taskType: string) {
  const model = "gemini-3.1-pro-preview";
  
  const response = await ai.models.generateContent({
    model,
    contents: `Analyze this PTE ${taskType} response: "${text}". Score it (10-90) on Grammar, Vocabulary, Spelling, and Content. Provide specific improvement tips. Return JSON.`,
    config: {
      responseMimeType: "application/json"
    }
  });

  return JSON.parse(response.text || "{}");
}
