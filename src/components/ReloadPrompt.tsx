import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

export const ReloadPrompt: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ', r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5">
      <div className="bg-[#0c1a32] border border-[#00d4ff]/30 p-4 rounded-xl shadow-[0_0_20px_rgba(0,212,255,0.2)] text-white flex items-center gap-4">
        <div>
          <h4 className="font-bold text-[#00d4ff] mb-1">Update Available</h4>
          <p className="text-sm text-[#8ab4c9]">A new version of the app is available. Please reload to update.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => updateServiceWorker(true)}
            className="flex items-center gap-2 bg-[#00d4ff] text-[#070d1c] px-3 py-2 rounded-lg font-bold hover:bg-white transition-colors"
          >
            <RefreshCw size={16} /> Reload
          </button>
          <button
            onClick={() => setNeedRefresh(false)}
            className="p-2 text-[#8ab4c9] hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};
