import { useState, useEffect, useRef } from 'react';
import { get, set } from 'idb-keyval';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirestorePath, beginGlobalSync, endGlobalSync, isNonEmptyData } from '../useSyncedStorage';

export function useIndexedDB<T>(key: string, initialValue: T): [T, (val: T | ((prev: T) => T)) => void, boolean] {
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // FIX 1: localChangesRef — sirf tab sync karo jab user ne khud change kiya ho
  const isLocallyModifiedRef = useRef(false);
  const pendingWritesRef = useRef(0);

  // Initial load from Firestore or IndexedDB
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        beginGlobalSync();

        const localData = await get<T>(key);
        const localTimestamp = (await get<number>(`${key}_lastUpdated`)) ?? -1;
        const localIsNonEmpty = isNonEmptyData(localData);

        const { collection, doc: docId } = getFirestorePath(key);
        const docRef = doc(db, collection, docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const docData = docSnap.data();
          const cloudData = docData.data as T;
          const cloudTimestamp = typeof docData.lastUpdated === 'number' ? docData.lastUpdated : -1;
          const cloudIsNonEmpty = isNonEmptyData(cloudData);

          if (cloudData !== undefined) {
            const shouldUseCloud =
              cloudIsNonEmpty &&
              (cloudTimestamp > localTimestamp || !localIsNonEmpty || cloudTimestamp === localTimestamp);

            if (shouldUseCloud) {
              if (isMounted && !isLocallyModifiedRef.current) {
                setStoredValue(cloudData);
                await set(key, cloudData);
                await set(`${key}_lastUpdated`, cloudTimestamp);
              }
            } else if (localIsNonEmpty) {
              if (isMounted && !isLocallyModifiedRef.current) {
                setStoredValue(localData as T);
              }
            }

            endGlobalSync('online');
            return;
          }
        }

        // Firestore mein nahi hai — IndexedDB check karo
        if (localIsNonEmpty) {
          if (isMounted) setStoredValue(localData as T);
        } else {
          // localStorage migration check
          const localItem = window.localStorage.getItem(key);
          if (localItem) {
            try {
              const parsed = JSON.parse(localItem);
              if (isMounted) setStoredValue(parsed);
              await set(key, parsed);
              window.localStorage.removeItem(key);
            } catch (e) {
              console.error(`Failed to parse local storage migration for ${key}`, e);
            }
          }
        }
        endGlobalSync('online');
      } catch (error) {
        console.error(`Error loading ${key} from Firestore:`, error);

        // Firestore fail — IndexedDB fallback
        try {
          const item = await get<T>(key);
          if (item !== undefined) {
            if (isMounted) setStoredValue(item);
          } else {
            const localItem = window.localStorage.getItem(key);
            if (localItem) {
              try {
                const parsed = JSON.parse(localItem);
                if (isMounted) setStoredValue(parsed);
                await set(key, parsed);
                window.localStorage.removeItem(key);
              } catch (e) {
                console.error(`Failed to parse local storage migration for ${key}`, e);
              }
            }
          }
        } catch (idbError) {
          console.error(`IDB fallback failed for ${key}`, idbError);
        }

        endGlobalSync('offline');
      } finally {
        if (isMounted) {
          setIsLoaded(true);
          setIsInitialized(true);
        }
      }
    }
    loadData();

    return () => {
      isMounted = false;
    };
  }, [key]);

  // FIX 1: Sirf tab Firestore mein likho jab user ne khud change kiya ho
  useEffect(() => {
    if (!isInitialized) return;

    // FIX 1: Yeh check missing tha — ab sirf user changes sync honge
    if (!isLocallyModifiedRef.current) return;

    let isPending = true;

    const timeoutId = setTimeout(async () => {
      try {
        beginGlobalSync();
        const { collection, doc: docId } = getFirestorePath(key);
        const docRef = doc(db, collection, docId);
        const cleanPayload = JSON.parse(JSON.stringify(storedValue));
        const timestamp = Date.now();
        await setDoc(docRef, { data: cleanPayload, lastUpdated: timestamp }, { merge: true });
        await set(`${key}_lastUpdated`, timestamp);
        // FIX 1: Sync ho gaya — flag reset karo
        isLocallyModifiedRef.current = false;
        endGlobalSync('online');
      } catch (error) {
        console.error(`Error syncing ${key} to Firestore:`, error);
        endGlobalSync('offline');
      } finally {
        isPending = false;
      }
    }, 1000);

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isPending || pendingWritesRef.current > 0) {
        e.preventDefault();
        e.returnValue = 'Saving changes... Please wait a moment before closing.';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [key, storedValue, isInitialized]);

  // setValue — user ka data change
  const setValue = (value: T | ((prev: T) => T)) => {
    // FIX 1: User ne change kiya — ab sync hoga
    isLocallyModifiedRef.current = true;
    try {
      setStoredValue(prevStored => {
        const valueToStore = value instanceof Function ? value(prevStored) : value;
        const timestamp = Date.now();
        pendingWritesRef.current += 1;
        set(key, valueToStore)
          .then(() => set(`${key}_lastUpdated`, timestamp))
          .catch(error => console.error(`Error persisting ${key} to IndexedDB:`, error))
          .finally(() => {
            pendingWritesRef.current -= 1;
          });
        return valueToStore;
      });
    } catch (error) {
      console.error(`Error setting ${key} to IndexedDB:`, error);
    }
  };

  return [storedValue, setValue, isLoaded];
}
