import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD3SLZwwa3QyZLDZoFoxz-UWkYLUTnZkeE",
  authDomain: "sob-lifting-tracker.firebaseapp.com",
  projectId: "sob-lifting-tracker",
  storageBucket: "sob-lifting-tracker.firebasestorage.app",
  messagingSenderId: "592854133936",
  appId: "1:592854133936:web:d8d6f5e4edf33bc6c2df75"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkCollections() {
  try {
    const opsRef = doc(db, "operations", "data");
    const opsSnap = await getDoc(opsRef);
    if (opsSnap.exists()) {
      const data = opsSnap.data();
      console.log("✅ operations/data exists! Length:", Array.isArray(data.data) ? data.data.length : "Not an array");
    } else {
      console.log("❌ operations/data does NOT exist (empty).");
    }

    const entryRef = doc(db, "entryLogs", "data");
    const entrySnap = await getDoc(entryRef);
    if (entrySnap.exists()) {
      const data = entrySnap.data();
      console.log("✅ entryLogs/data exists! Length:", Array.isArray(data.data) ? data.data.length : "Not an array");
    } else {
      console.log("❌ entryLogs/data does NOT exist (empty).");
    }
    
    process.exit(0);
  } catch (err) {
    console.error("Firebase Error:", err.message);
    process.exit(1);
  }
}

checkCollections();
