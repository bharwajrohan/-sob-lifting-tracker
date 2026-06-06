import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const missingKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value || String(value).includes('dummy'))
  .map(([key]) => key);

if (missingKeys.length > 0) {
  console.error(
    '[Firebase] Missing or placeholder config values for:',
    missingKeys,
    'Make sure VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, and VITE_FIREBASE_APP_ID are set.'
  );
}

const app: FirebaseApp = getApps().length > 0
  ? getApps()[0]
  : initializeApp(firebaseConfig);

try {
  console.info('[Firebase] Initialized Firebase app', {
    projectId: app.options.projectId,
    authDomain: app.options.authDomain,
    storageBucket: app.options.storageBucket,
    appId: app.options.appId
  });
} catch (initError) {
  console.error('[Firebase] Firebase initialization failed', initError);
}

export const db = getFirestore(app);
