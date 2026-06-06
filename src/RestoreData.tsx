import React, { useState } from 'react';
import { Upload, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { clear, set } from 'idb-keyval';
import { db } from './firebase';
import { collection, getDocs, deleteDoc } from 'firebase/firestore';

export const RestoreData: React.FC = () => {
  const [jsonStr, setJsonStr] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error' | '', message: string }>({ type: '', message: '' });
  const [isClearing, setIsClearing] = useState(false);

  const handleImport = async () => {
    try {
      if (!jsonStr.trim()) {
        setStatus({ type: 'error', message: 'Please paste JSON data first.' });
        return;
      }

      const data = JSON.parse(jsonStr);
      if (typeof data !== 'object' || data === null) {
        throw new Error('Data must be a valid JSON object');
      }

      // Restore keys to localStorage or IndexedDB based on key name
      for (const key of Object.keys(data)) {
        const val = data[key];
        const parsedVal = typeof val === 'string' && (val.startsWith('[') || val.startsWith('{')) ? JSON.parse(val) : val;
        
        if (key === 'tracker_data_v7' || key === 'tracker_entryLogs_v7' || key === 'tracker_activityLogs') {
          await set(key, parsedVal);
        } else {
          localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
        }
      }

      setStatus({ type: 'success', message: 'Data restored successfully! Refresh the page to sync to cloud.' });
      setJsonStr('');
    } catch (e: any) {
      setStatus({ type: 'error', message: `Invalid JSON: ${e.message}` });
    }
  };

  const handleClearData = async () => {
    const confirmation = window.prompt("Are you sure you want to clear ALL data? This will wipe your local database AND cloud database. Type 'DELETE' to confirm. This cannot be undone.");
    if (confirmation === 'DELETE') {
      setIsClearing(true);
      setStatus({ type: '', message: '' });
      try {
        localStorage.clear();
        await clear(); // Clear IndexedDB
        
        // Clear Firebase Collections
        const collections = ['entryLogs', 'operations', 'misc', 'weeks', 'users', 'currentUser'];
        for (const collName of collections) {
          const querySnapshot = await getDocs(collection(db, collName));
          querySnapshot.forEach(async (d) => {
            await deleteDoc(d.ref);
          });
        }
        
        setStatus({ type: 'success', message: 'All local and cloud data cleared successfully! You must refresh the page now.' });
      } catch (error: any) {
        setStatus({ type: 'error', message: `Failed to clear cloud data: ${error.message}` });
      } finally {
        setIsClearing(false);
      }
    }
  };

  return (
    <div className="bg-[#FFFFFF] p-6 rounded-[12px] shadow-sm border border-[#E2E8F0] mt-6">
      <h3 className="text-lg font-bold text-[#1E293B] mb-4 flex items-center gap-2">
        <Upload className="text-[#005689]" size={20} />
        Restore Data
      </h3>
      <div className="space-y-4">
        <p className="text-sm text-[#64748B]">
          Paste the JSON data from localStorage below to restore the application state.
        </p>
        <textarea
          value={jsonStr}
          onChange={(e) => setJsonStr(e.target.value)}
          placeholder='{"tracker_users": "[{...}]", ...}'
          className="w-full h-32 border border-[#CBD5E1] rounded-lg p-3 text-sm font-mono focus:ring-2 focus:ring-[#005689] outline-none resize-y"
        />
        {status.message && (
          <div className={`p-3 rounded-lg flex items-center gap-2 text-sm ${status.type === 'success' ? 'bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0]' : 'bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA]'}`}>
            {status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            {status.message}
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={handleImport}
            disabled={isClearing}
            className={`bg-[#005689] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isClearing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#00436b]'}`}
          >
            Import Data
          </button>
          <button
            onClick={handleClearData}
            disabled={isClearing}
            className={`border border-[#EF4444] text-[#EF4444] px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${isClearing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#FEF2F2]'}`}
          >
            {isClearing && <RefreshCw size={16} className="animate-spin" />}
            Clear All Data
          </button>
        </div>
      </div>
    </div>
  );
};
