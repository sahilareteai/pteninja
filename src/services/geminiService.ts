import { GoogleGenAI, Modality, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
console.log("[Gemini] SDK initialized. API Key present:", !!process.env.GEMINI_API_KEY);

let quotaExceededUntil = 0;

function isQuotaExceeded() {
  return Date.now() < quotaExceededUntil;
}

function setQuotaExceeded() {
  quotaExceededUntil = Date.now() + 5 * 60 * 1000; // 5 minutes
}

function addWavHeader(base64Pcm: string, sampleRate: number = 24000): string {
  const binaryPcm = atob(base64Pcm);
  const pcmData = new Uint8Array(binaryPcm.length);
  for (let i = 0; i < binaryPcm.length; i++) {
    pcmData[i] = binaryPcm.charCodeAt(i);
  }
  
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
  
  // Convert combined Uint8Array to base64 efficiently
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < combined.length; i += chunkSize) {
    binary += String.fromCharCode(...combined.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

async function callGemini(params: any, retries: number = 3): Promise<any> {
  if (isQuotaExceeded()) {
    const quotaError = new Error("GEMINI_QUOTA_EXCEEDED");
    (quotaError as any).status = 429;
    throw quotaError;
  }

  for (let i = 0; i <= retries; i++) {
    try {
      console.log(`[Gemini] Calling generateContent for model: ${params.model}`);
      return await ai.models.generateContent(params);
    } catch (e: any) {
      console.error(`[Gemini] API Call Error:`, e);
      const isQuotaError = e.message?.includes('429') || e.message?.includes('RESOURCE_EXHAUSTED') || (e.error?.code === 429);
      
      if (isQuotaError) {
        setQuotaExceeded();
        console.warn(`Gemini Quota Exceeded (Attempt ${i + 1}/${retries + 1})`);
        if (i < retries) {
          // Longer delay for quota errors
          const delay = Math.pow(3, i) * 2000 + Math.random() * 1000;
          console.log(`Quota exceeded. Retrying in ${Math.round(delay)}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        const quotaError = new Error("GEMINI_QUOTA_EXCEEDED");
        (quotaError as any).status = 429;
        throw quotaError;
      }

      console.error(`Gemini call attempt ${i + 1} failed:`, e);
      if (i < retries) {
        const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
        console.log(`Retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw e;
      }
    }
  }
}

export async function generateTTS(text: string, retries: number = 1) {
  if (!text || text.trim().length === 0) {
    console.warn("generateTTS: Empty text provided");
    return null;
  }

  try {
    const response = await callGemini({
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
    }, retries);

    const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64) {
      console.error("No audio data in Gemini response");
      return null;
    }

    console.log("TTS generated successfully, length:", base64.length);

    // Check if it already has a RIFF header (starts with "UklGR")
    if (base64.startsWith('UklGR')) {
      return base64;
    }

    // Assume raw PCM 16-bit 24kHz Mono and add header
    return addWavHeader(base64, 24000);
  } catch (e: any) {
    console.error("All generateTTS attempts failed.", e);
    throw e;
  }
}

export async function analyzeSpeaking(audioData: string, taskType: string, mimeType: string = "audio/webm", correctAnswer?: string) {
  const model = "gemini-3.1-pro-preview";
  
  try {
    // Sanitize mimeType (remove parameters like ;codecs=opus)
    const cleanMimeType = mimeType.split(';')[0].trim();
    
    let prompt = `You are a PTE Speaking Examiner. Analyze this audio for ${taskType}. Provide a score (10-90) for Fluency, Pronunciation, and Content. Give specific feedback on pauses, rhythm, and mispronounced words.`;
    
    if (taskType === 'Answer Short Question' && correctAnswer) {
      prompt += ` The expected answer is: "${correctAnswer}". Please check if the spoken response matches this answer or is a valid synonym.`;
    }

    const response = await callGemini({
      model,
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: cleanMimeType, data: audioData } }
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
            transcription: { type: Type.STRING },
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
          required: ["overall", "fluency", "pronunciation", "content", "transcription"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to analyze speaking:", e);
    throw e;
  }
}

export async function analyzeWriting(text: string, taskType: string) {
  const model = "gemini-3.1-pro-preview";
  
  try {
    const response = await callGemini({
      model,
      contents: `Analyze this PTE ${taskType} response: "${text}". Score it (10-90) on Grammar, Vocabulary, Spelling, and Content. Provide specific improvement tips and list any grammatical or other mistakes found in the text. Return JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overall: { type: Type.NUMBER },
            grammar: { type: Type.NUMBER },
            vocabulary: { type: Type.NUMBER },
            spelling: { type: Type.NUMBER },
            content: { type: Type.NUMBER },
            tips: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            mistakes: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["overall", "grammar", "vocabulary", "spelling", "content", "tips", "mistakes"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (e: any) {
    console.error("Failed to analyze writing:", e);
    if (e.message === "GEMINI_QUOTA_EXCEEDED") throw e;
    return {
      overall: 50,
      grammar: 50,
      vocabulary: 50,
      spelling: 50,
      content: 50,
      tips: ["Could not analyze response correctly."],
      mistakes: []
    };
  }
}
