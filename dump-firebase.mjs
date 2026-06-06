import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';

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

async function dump() {
  try {
    const docRef = doc(db, "entryLogs", "data");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      fs.writeFileSync('dump.json', JSON.stringify(data, null, 2));
      console.log("Dumped to dump.json");
    } else {
      console.log("entryLogs/data does NOT exist.");
    }
  } catch (err) {
    console.error("Firebase Error:", err.message);
  }
}

dump();
