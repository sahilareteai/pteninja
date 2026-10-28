import { auth } from '../firebase';

/** Returns the current user's Firebase ID token, ensuring an authentic session exists. */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  try {
    if (!auth.currentUser) {
      try {
        const { signInAnonymously } = await import('firebase/auth');
        await signInAnonymously(auth);
      } catch (anonErr) {
        console.warn('[geminiService] Anonymous session bootstrap deferred:', anonErr);
      }
    }
    return (await auth.currentUser?.getIdToken(forceRefresh)) ?? null;
  } catch (err) {
    console.warn('[geminiService] Could not retrieve auth token:', err);
    return null;
  }
}

/** POST to a server-side Gemini proxy endpoint with auth and automatic 401 retry. */
async function proxyPost<T>(path: string, body: Record<string, unknown>, retryCount = 0): Promise<T> {
  let token = await getIdToken(retryCount > 0);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });

  if (!res.ok) {
    // If token expired or session just linked, refresh token and retry once
    if (res.status === 401 && retryCount === 0) {
      console.warn('[geminiService] Received 401 Unauthorized, refreshing token and retrying...');
      return proxyPost<T>(path, body, retryCount + 1);
    }
    const errData = await res.json().catch(() => ({}));
    if (res.status === 503) {
      const err = new Error('GEMINI_QUOTA_EXCEEDED');
      (err as any).status = 429;
      throw err;
    }
    throw new Error(errData.error ?? `Server error ${res.status}`);
  }
  return res.json() as Promise<T>;
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

  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);   // PCM
  view.setUint16(22, 1, true);   // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true);

  const headerUint8 = new Uint8Array(header);
  const combined = new Uint8Array(headerUint8.length + pcmData.length);
  combined.set(headerUint8);
  combined.set(pcmData, headerUint8.length);

  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < combined.length; i += chunkSize) {
    binary += String.fromCharCode(...combined.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function generateTTS(text: string): Promise<string | null> {
  if (!text || text.trim().length === 0) {
    console.warn('generateTTS: Empty text provided');
    return null;
  }

  try {
    const { audio } = await proxyPost<{ audio: string }>('/api/generate-tts', { text });
    if (!audio) return null;
    // Add WAV header if the audio is raw PCM (does not start with RIFF signature)
    return audio.startsWith('UklGR') ? audio : addWavHeader(audio, 24000);
  } catch (e: any) {
    console.error('generateTTS failed:', e);
    throw e;
  }
}

export async function analyzeSpeaking(
  audioData: string,
  taskType: string,
  mimeType: string = 'audio/webm',
  correctAnswer?: string,
) {
  try {
    return await proxyPost('/api/analyze-speaking', { audioData, taskType, mimeType, correctAnswer });
  } catch (e) {
    console.error('Failed to analyze speaking:', e);
    throw e;
  }
}

export interface WritingAnalysisResult {
  overall: number;
  grammar: number;
  vocabulary: number;
  spelling: number;
  content: number;
  tips: string[];
  mistakes: string[];
}

export async function analyzeWriting(text: string, taskType: string): Promise<WritingAnalysisResult> {
  try {
    return await proxyPost<WritingAnalysisResult>('/api/analyze-writing', { text, taskType });
  } catch (e: any) {
    console.error('Failed to analyze writing:', e);
    if (e.message === 'GEMINI_QUOTA_EXCEEDED') throw e;
    return {
      overall: 50,
      grammar: 50,
      vocabulary: 50,
      spelling: 50,
      content: 50,
      tips: ['Could not analyze response correctly.'],
      mistakes: [],
    };
  }
}
