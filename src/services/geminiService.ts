import { GoogleGenAI, Modality, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function addWavHeader(base64Pcm: string, sampleRate: number = 24000): string {
  const pcmData = Uint8Array.from(atob(base64Pcm), c => c.charCodeAt(0));
  const dataSize = pcmData.length;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // RIFF identifier
  view.setUint32(0, 0x52494646, false); // "RIFF"
  // file length
  view.setUint32(4, 36 + dataSize, true);
  // RIFF type
  view.setUint32(8, 0x57415645, false); // "WAVE"
  // format chunk identifier
  view.setUint32(12, 0x666d7420, false); // "fmt "
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (1 = PCM)
  view.setUint16(20, 1, true);
  // channel count (1 = Mono)
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  view.setUint32(36, 0x64617461, false); // "data"
  // data chunk length
  view.setUint32(40, dataSize, true);

  const headerUint8 = new Uint8Array(header);
  const combined = new Uint8Array(headerUint8.length + pcmData.length);
  combined.set(headerUint8);
  combined.set(pcmData, headerUint8.length);
  
  // Convert combined Uint8Array to base64
  let binary = '';
  const len = combined.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

export async function generateTTS(text: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Say clearly and naturally: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64) return null;

  // Check if it already has a RIFF header (starts with "UklGR")
  if (base64.startsWith('UklGR')) {
    return base64;
  }

  // Assume raw PCM 16-bit 24kHz Mono and add header
  try {
    return addWavHeader(base64, 24000);
  } catch (e) {
    console.error("Error adding WAV header:", e);
    return base64;
  }
}

export async function analyzeSpeaking(audioData: string, taskType: string, mimeType: string = "audio/webm") {
  const model = "gemini-3-flash-preview";
  
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: `You are a PTE Speaking Examiner. Analyze this audio for ${taskType}. Provide a score (10-90) for Fluency, Pronunciation, and Content. Give specific feedback on pauses, rhythm, and mispronounced words.` },
          { inlineData: { mimeType, data: audioData } }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overall: { type: Type.NUMBER },
          fluency: { type: Type.NUMBER },
          pronunciation: { type: Type.NUMBER },
          content: { type: Type.NUMBER },
          feedback: { 
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          mispronounced: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          hesitations: { type: Type.NUMBER },
          pace: { type: Type.STRING },
          stress: { type: Type.STRING }
        },
        required: ["overall", "fluency", "pronunciation", "content"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to parse Gemini response:", response.text);
    throw e;
  }
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
