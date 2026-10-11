import { initializeApp, getApps, getApp } from "firebase/app";
import { getMessaging, isSupported } from "firebase/messaging";

export function getSanitizedFirebaseApiKey(): string {
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";
  // Auto-correct common OCR typo where capital 'O' in 7QOc was read as number '0'
  if (key.endsWith("7Q0c")) {
    return key.slice(0, -4) + "7QOc";
  }
  return key || "AIzaSyDczdM33tbYk1EsKrRYq3xvB9TxRDo7QOc";
}

export const firebaseConfig = {
  apiKey: getSanitizedFirebaseApiKey(),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "pinsite-b915a.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "pinsite-b915a",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "pinsite-b915a.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "224548658735",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:224548658735:web:02ed8e40ff2d584f94b0da",
};

export function getFirebaseClientApp() {
  if (typeof window === "undefined") return null;
  const config = {
    ...firebaseConfig,
    apiKey: getSanitizedFirebaseApiKey(),
  };
  if (!config.apiKey || !config.projectId) {
    return null;
  }
  return getApps().length > 0 ? getApp() : initializeApp(config);
}

export async function getFirebaseMessagingInstance() {
  if (typeof window === "undefined") return null;
  const supported = await isSupported().catch(() => false);
  if (!supported) return null;

  const app = getFirebaseClientApp();
  if (!app) return null;

  try {
    return getMessaging(app);
  } catch (err) {
    console.warn("Firebase Messaging init error:", err);
    return null;
  }
}
