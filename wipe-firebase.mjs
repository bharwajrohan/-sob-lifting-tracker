import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc } from 'firebase/firestore';

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

async function wipeFirebase() {
  const collections = ['entryLogs', 'operations', 'misc', 'weeks', 'users', 'currentUser', 'settings', 'routes', 'fleet', 'incentives', 'calendarConfig', 'daily', 'appData'];
  console.log("Starting Firebase wipe...");
  
  for (const collName of collections) {
    try {
      const querySnapshot = await getDocs(collection(db, collName));
      if (querySnapshot.empty) continue;
      
      console.log(`Clearing collection: ${collName}`);
      let count = 0;
      for (const d of querySnapshot.docs) {
        await deleteDoc(d.ref);
        count++;
      }
      console.log(`Deleted ${count} documents from ${collName}`);
    } catch (err) {
      console.error(`Error clearing ${collName}:`, err.message);
    }
  }
  console.log("Firebase wipe complete!");
}

wipeFirebase();
