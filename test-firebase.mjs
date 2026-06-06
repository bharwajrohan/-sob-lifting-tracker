import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

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

async function test() {
  try {
    console.log("Attempting to write to Firestore...");
    await setDoc(doc(db, "misc", "test_connection"), { timestamp: Date.now() });
    console.log("Success! Data written.");
  } catch (err) {
    console.error("Firebase Error:", err.message);
  }
}

test();
