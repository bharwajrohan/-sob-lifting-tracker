import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { get, set as setIDB } from 'idb-keyval';

export type SyncStatus = 'online' | 'syncing' | 'offline' | 'error';
export let globalSyncStatus: SyncStatus = 'online';
const syncListeners: (() => void)[] = [];
let activeSyncCount = 0;
let syncDelayTimer: number | null = null;

const notifySyncListeners = () => syncListeners.forEach(listener => listener());

const applyGlobalSyncStatus = (status: SyncStatus) => {
  globalSyncStatus = status;
  notifySyncListeners();
};

export const setGlobalSyncStatus = (status: SyncStatus) => {
  if (syncDelayTimer) {
    window.clearTimeout(syncDelayTimer);
    syncDelayTimer = null;
  }
  activeSyncCount = 0;
  applyGlobalSyncStatus(status);
};

export const beginGlobalSync = () => {
  activeSyncCount += 1;
  if (activeSyncCount === 1) {
    if (syncDelayTimer) {
      window.clearTimeout(syncDelayTimer);
    }
    syncDelayTimer = window.setTimeout(() => {
      applyGlobalSyncStatus('syncing');
      syncDelayTimer = null;
    }, 250);
  }
};

export const endGlobalSync = (status: SyncStatus = 'online') => {
  activeSyncCount = Math.max(0, activeSyncCount - 1);
  if (activeSyncCount === 0) {
    if (syncDelayTimer) {
      window.clearTimeout(syncDelayTimer);
      syncDelayTimer = null;
    }
    applyGlobalSyncStatus(status);
  } else if (status !== 'online') {
    applyGlobalSyncStatus(status);
  }
};

export const isNonEmptyData = (value: any): boolean => {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
};

export const useSyncStatus = () => {
  const [status, setStatus] = useState(globalSyncStatus);
  useEffect(() => {
    const listener = () => setStatus(globalSyncStatus);
    syncListeners.push(listener);
    return () => {
      const index = syncListeners.indexOf(listener);
      if (index > -1) syncListeners.splice(index, 1);
    };
  }, []);
  return status;
};

export const getFirestorePath = (key: string) => {
  if (key === 'tracker_entryLogs_v7') return { collection: 'entryLogs', doc: 'data' };
  if (key === 'tracker_data_v7') return { collection: 'operations', doc: 'data' };
  if (key === 'tracker_users') return { collection: 'users', doc: 'data' };
  if (key === 'tracker_currentUser') return { collection: 'currentUser', doc: 'session' };
  if (key === 'tracker_isAuthenticated') return { collection: 'auth', doc: 'status' };
  if (key === 'tracker_userRole') return { collection: 'auth', doc: 'role' };
  if (key === 'tracker_roleTabsMap') return { collection: 'auth', doc: 'roleTabs' };
  if (key === 'tracker_oem_configs') return { collection: 'settings', doc: 'oemConfigs' };
  if (key === 'tracker_transportName') return { collection: 'settings', doc: 'transportName' };
  if (key === 'tracker_transportLogo') return { collection: 'settings', doc: 'transportLogo' };
  if (key === 'tracker_customMenuNames') return { collection: 'settings', doc: 'menuNames' };
  if (key === 'tracker_customTableHeaders') return { collection: 'settings', doc: 'tableHeaders' };
  if (key === 'tracker_manageByBranchMap') return { collection: 'settings', doc: 'branchMap' };
  if (key === 'tracker_masterRoutes_v7') return { collection: 'routes', doc: 'master' };
  if (key === 'tracker_fleet_data') return { collection: 'fleet', doc: 'data' };
  if (key === 'tracker_activityLogs') return { collection: 'appData', doc: 'activityLogs' };
  if (key === 'tracker_incentive_rates_v1') return { collection: 'incentives', doc: 'rates' };
  if (key === 'tracker_incentive_edits_v1') return { collection: 'incentives', doc: 'edits' };
  if (key === 'tracker_manual_incentive_rows_v1') return { collection: 'incentives', doc: 'manualRows' };
  if (key === 'incentive_tracker_start') return { collection: 'incentives', doc: 'startDate' };
  if (key === 'incentive_tracker_end') return { collection: 'incentives', doc: 'endDate' };
  if (key.startsWith('tracker_incentive_target_')) return { collection: 'incentives', doc: key.replace('tracker_incentive_target_', 'target_') };
  if (key.startsWith('tracker_cal_weeks_')) return { collection: 'weeks', doc: key.replace('tracker_cal_weeks_', '') };
  if (key.startsWith('tracker_cal_daily_')) return { collection: 'daily', doc: key.replace('tracker_cal_daily_', '') };
  if (key.startsWith('tracker_cal_config_')) return { collection: 'calendarConfig', doc: key.replace('tracker_cal_config_', '') };
  if (key.startsWith('tracker_')) {
    return { collection: 'appData', doc: key.replace('tracker_', '') };
  }
  return { collection: 'appData', doc: key };
};

const log = {
  info: (message: string, ...args: any[]) => console.info(`[useSyncedStorage] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.debug(`[useSyncedStorage] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[useSyncedStorage] ${message}`, ...args)
};

const localTimestampKey = (key: string) => `${key}_lastUpdated`;

const readLocalCache = async <T>(key: string) => {
  let localData: T | undefined;
  let localTimestamp = -1;
  const storedString = window.localStorage.getItem(key);
  if (storedString) {
    try {
      localData = JSON.parse(storedString) as T;
    } catch (error) {
      log.error(`Failed to parse localStorage for ${key}`, error);
    }
    const storedTimestamp = window.localStorage.getItem(localTimestampKey(key));
    localTimestamp = storedTimestamp ? Number(storedTimestamp) || -1 : -1;
  }
  if (localData === undefined) {
    try {
      localData = await get<T>(key);
      if (localData !== undefined) {
        window.localStorage.setItem(key, JSON.stringify(localData));
      }
      const persistedTimestamp = await get<number>(localTimestampKey(key));
      localTimestamp = typeof persistedTimestamp === 'number' ? persistedTimestamp : localTimestamp;
      if (localTimestamp > -1) {
        window.localStorage.setItem(localTimestampKey(key), String(localTimestamp));
      }
    } catch (error) {
      log.error(`Failed to read IndexedDB cache for ${key}`, error);
    }
  }
  return { localData, localTimestamp };
};

const persistLocalCache = async <T>(key: string, data: T, timestamp: number) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
    window.localStorage.setItem(localTimestampKey(key), String(timestamp));
  } catch (error) {
    log.error(`Failed to write localStorage for ${key}`, error);
  }
  try {
    await setIDB(key, data);
    await setIDB(localTimestampKey(key), timestamp);
  } catch (error) {
    log.error(`Failed to write IndexedDB for ${key}`, error);
  }
};

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      log.error(`Failed to parse initial localStorage for ${key}`, error);
      return initialValue;
    }
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const isMountedRef = useRef(true);

  // FIX 1: localChangesRef — sirf tab sync karo jab user ne khud data change kiya ho
  // Pehle yeh ref set hota tha setValue mein, lekin sync effect mein check hi nahi tha!
  const localChangesRef = useRef(false);

  const syncPendingRef = useRef(false);
  const syncTimeoutRef = useRef<number | null>(null);

  // FIX 2: isSelfWriteRef — jab hum khud localStorage mein likhte hain,
  // toh 'storage' event fire hota tha aur dobara setStoredValue call hota tha → infinite loop
  // Ab is flag se apni hi write ko ignore karenge
  const isSelfWriteRef = useRef(false);

  // FIX 3: initialValue ko ref mein store karo taaki har render pe effect re-run na ho
  // Agar initialValue object/array hai toh dependency array mein dalne se infinite loop banta tha
  const initialValueRef = useRef(initialValue);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // INIT EFFECT — Firestore se data load karo (sirf ek baar key change hone pe)
  useEffect(() => {
    let isCancelled = false;

    const loadData = async () => {
      log.info(`Starting sync init for key=${key}`);
      try {
        const { localData, localTimestamp } = await readLocalCache<T>(key);
        const localIsNonEmpty = isNonEmptyData(localData);

        let selectedData: T = initialValueRef.current; // FIX 3: ref use kar rahe hain
        let selectedTimestamp = localTimestamp;

        if (localData !== undefined) {
          selectedData = localData;
          log.debug(`Loaded local cache for ${key}`, { localTimestamp, localIsNonEmpty });
        }

        beginGlobalSync();
        const { collection, doc: docId } = getFirestorePath(key);
        const docRef = doc(db, collection, docId);
        const docSnap = await getDoc(docRef);
        log.debug(`Firestore read for ${collection}/${docId}`, { exists: docSnap.exists() });

        if (docSnap.exists()) {
          const firestoreData = docSnap.data() as Record<string, any>;
          const cloudData = firestoreData.data as T | undefined;
          const cloudTimestamp = typeof firestoreData.lastUpdated === 'number' ? firestoreData.lastUpdated : -1;
          const cloudIsNonEmpty = isNonEmptyData(cloudData);
          log.debug(`Cloud values for ${collection}/${docId}`, { cloudTimestamp, cloudIsNonEmpty });

          if (cloudIsNonEmpty && (cloudTimestamp >= localTimestamp || !localIsNonEmpty)) {
            selectedData = cloudData as T;
            selectedTimestamp = cloudTimestamp;
            log.info(`Using Firestore data for ${key}`);
          } else if (localIsNonEmpty) {
            log.info(`Keeping local data for ${key}`);
          } else if (cloudIsNonEmpty) {
            selectedData = cloudData as T;
            selectedTimestamp = cloudTimestamp;
            log.info(`Using Firestore fallback data for ${key}`);
          }
        }

        if (isCancelled || !isMountedRef.current) return;

        if (selectedData !== undefined) {
          setStoredValue(selectedData);
        }

        if (selectedTimestamp < 0) {
          selectedTimestamp = Date.now();
        }

        await persistLocalCache(key, selectedData, selectedTimestamp);
        endGlobalSync('online');
      } catch (loadError) {
        log.error(`Error initializing ${key}`, loadError);
        setError(loadError as Error);
        endGlobalSync('offline');
      } finally {
        if (!isCancelled && isMountedRef.current) {
          setIsLoading(false);
          setIsInitialized(true);
          log.info(`Finished init for ${key}`);
        }
      }
    };

    loadData();
    return () => {
      isCancelled = true;
    };
  }, [key]); // FIX 3: initialValue dependency hata di — ref se le rahe hain ab

  // SYNC EFFECT — sirf tab Firestore mein likho jab user ne khud change kiya ho
  useEffect(() => {
    if (!isInitialized) return;

    // FIX 1: Yeh check pehle missing tha — isi wajah se init load ke baad bhi sync fire hota tha
    if (!localChangesRef.current) return;

    if (syncTimeoutRef.current) {
      window.clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = window.setTimeout(async () => {
      syncPendingRef.current = true;
      try {
        beginGlobalSync();
        const cleanPayload = JSON.parse(JSON.stringify(storedValue));
        const timestamp = Date.now();
        const { collection, doc: docId } = getFirestorePath(key);
        const docRef = doc(db, collection, docId);
        log.info(`Syncing ${key} to Firestore`, { collection, docId, timestamp });
        log.debug(`Sync payload for ${key}`, cleanPayload);
        await setDoc(docRef, { data: cleanPayload, lastUpdated: timestamp }, { merge: true });
        await persistLocalCache(key, cleanPayload, timestamp);
        localChangesRef.current = false; // sync ho gaya, flag reset karo
        endGlobalSync('online');
      } catch (syncError) {
        log.error(`Error syncing ${key} to Firestore`, syncError);
        setError(syncError as Error);
        endGlobalSync('offline');
      } finally {
        syncPendingRef.current = false;
      }
    }, 700);

    return () => {
      if (syncTimeoutRef.current) {
        window.clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [key, storedValue, isInitialized]);

  // Page band hone se pehle warn karo agar sync pending hai
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (syncPendingRef.current) {
        event.preventDefault();
        event.returnValue = 'Syncing data to server... Please wait a moment before closing.';
        return event.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Cross-tab sync — dusre tab mein change hone pe yahan bhi update karo
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === key && event.newValue) {
        // FIX 2: Apni hi write ko ignore karo — warna infinite loop banta tha
        if (isSelfWriteRef.current) {
          isSelfWriteRef.current = false;
          return;
        }
        try {
          const parsed = JSON.parse(event.newValue);
          setStoredValue(parsed);
          log.info(`Cross-tab localStorage update applied for ${key}`);
        } catch (parseError) {
          log.error(`Failed to parse cross-tab update for ${key}`, parseError);
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [key]);

  // setValue — user ka data change
  const setValue = useCallback((value: T | ((val: T) => T)) => {
    // FIX 1: User ne change kiya hai — ab sync hoga
    localChangesRef.current = true;

    try {
      setStoredValue(prevStored => {
        const valueToStore = value instanceof Function ? value(prevStored) : value;
        try {
          // FIX 2: Apni write se pehle flag set karo
          isSelfWriteRef.current = true;
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
          const timestamp = Date.now();
          window.localStorage.setItem(localTimestampKey(key), String(timestamp));
          setIDB(localTimestampKey(key), timestamp).catch(error => {
            log.error(`Failed to persist timestamp for ${key}`, error);
          });
        } catch (writeError) {
          log.error(`Failed to persist local cache for ${key}`, writeError);
        }
        setIDB(key, valueToStore).catch(error => {
          log.error(`Failed to persist IndexedDB cache for ${key}`, error);
        });
        return valueToStore;
      });
    } catch (setError) {
      log.error(`Failed to set value for ${key}`, setError);
    }
  }, [key]);

  return [storedValue, setValue, isLoading, error] as const;
}
