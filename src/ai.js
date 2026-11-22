import { initializeApp } from "firebase/app";
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, ThinkingLevel, ResponseModality } from "firebase/ai";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { firebaseConfig, recaptchaSiteKey } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);

// The contest requires App Check. On localhost Chrome's console prints a debug token:
// add it in Firebase console > App Check > Apps > Manage debug tokens.
if (import.meta.env.DEV) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey), isTokenAutoRefreshEnabled: true });

const ai = getAI(app, { backend: new GoogleAIBackend() });

// Check the current model name in Firebase console > AI Logic if this one is retired.
const CLOUD_MODEL = "gemini-3.6-flash";
// Gemini 3 "thinks" at a high level by default, which made each answer take 30+ seconds.
const cloudParams = { model: CLOUD_MODEL, generationConfig: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } };

// Quick read: Gemini Nano in Chrome when available, cloud otherwise.
const hybrid = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,
  inCloudParams: cloudParams,
});

// Confirmation + local language: always cloud (bigger model, better at Hausa/Yoruba/Igbo).
const cloud = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: cloudParams });

// Chrome only downloads Gemini Nano after a user click, so the app offers a download button.
// Returns "available", "downloadable", "downloading" or "unavailable".
export async function offlineAIStatus() {
  if (!("LanguageModel" in self)) return "unavailable";
  return LanguageModel.availability({
    expectedInputs: [{ type: "text", languages: ["en"] }, { type: "image" }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
  });
}

// Must be called from a click. onProgress gets a number from 0 to 1.
export const downloadOfflineAI = (onProgress) => hybrid.initializeDeviceModel(onProgress);

const QUICK_PROMPT = `You help smallholder farmers in Nigeria. Look at this plant photo.
Reply with ONLY this JSON, nothing else:
{"crop": string, "healthy": boolean, "problem": string, "confidence": "low"|"medium"|"high", "signs": string, "first_steps": [string]}
Rules: "problem" is the most likely disease, pest or deficiency in plain words ("none" if healthy).
"first_steps" are 2-4 safe, low-cost actions a farmer can do today (remove and burn infected leaves, separate sick plants, improve drainage, wash hands and tools).
Never recommend chemicals or doses. If the photo is not a plant, set "crop" to "unknown" and say so in "signs".`;

const confirmPrompt = (quick, lang) => `You help smallholder farmers in Nigeria. A small offline model gave this first read of the photo:
${JSON.stringify(quick)}
Check the photo yourself. Reply with ONLY this JSON, nothing else:
{"crop": string, "healthy": boolean, "problem": string, "confidence": "low"|"medium"|"high", "agrees": boolean, "explanation": string, "treatment": [string], "prevention": [string], "see_expert": boolean}
Write every text value in ${lang}, in simple words a farmer understands.
Treatment may name active ingredients sold by Nigerian agro-dealers (never brand names), but always say to follow the label and wear gloves and a nose mask.
If you are not sure, set "see_expert" to true and advise visiting the nearest ADP extension officer.`;

const image = (base64) => ({ inlineData: { data: base64, mimeType: "image/jpeg" } });

export async function quickCheck(base64) {
  const { response } = await hybrid.generateContent([QUICK_PROMPT, image(base64)]);
  return { text: response.text(), source: response.inferenceSource ?? "in_cloud" };
}

export async function confirmCheck(base64, quick, lang) {
  const { response } = await cloud.generateContent([confirmPrompt(quick, lang), image(base64)]);
  return response.text();
}

// Natural voice for "Listen": Gemini text-to-speech through Firebase AI Logic.
// If a newer TTS model is listed in Firebase console > AI Logic, try it here for better Igbo/Yoruba/Hausa.
const TTS_MODEL = "gemini-3.1-flash-tts-preview";
const voice = getGenerativeModel(ai, {
  model: TTS_MODEL,
  generationConfig: {
    responseModalities: [ResponseModality.AUDIO],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
  },
});

// Returns base64 raw PCM audio (24 kHz, mono, 16-bit).
export async function speech(text, lang) {
  const { response } = await voice.generateContent(
    `Read this aloud in ${lang} with a warm, clear, natural voice, like a friendly Nigerian farm advisor talking to a farmer, at a calm pace:\n\n${text}`
  );
  const part = response.inlineDataParts()?.[0];
  if (!part) throw new Error("No audio came back.");
  return part.inlineData.data;
}
