import React from 'react';
import { Settings } from 'lucide-react';

interface ApplicationSettingsProps {
  trailerCapacity: number;
  setTrailerCapacity: (capacity: number) => void;
}

export const ApplicationSettings: React.FC<ApplicationSettingsProps> = ({ trailerCapacity, setTrailerCapacity }) => {
  return (
    <div className="bg-[#FFFFFF] p-6 rounded-[12px] shadow-sm border border-[#E2E8F0]">
      <h3 className="text-lg font-bold text-[#1E293B] mb-4 flex items-center gap-2">
        <Settings className="text-[#005689]" size={20} />
        Application Settings
      </h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#1E293B] mb-1">Global Trailer Capacity</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              value={trailerCapacity}
              onChange={(e) => setTrailerCapacity(parseFloat(e.target.value) || 6.5)}
              className="border border-[#CBD5E1] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#005689] outline-none w-32"
            />
            <span className="text-[#64748B] text-sm">cars per trailer</span>
          </div>
          <p className="text-xs text-[#94A3B8] mt-1">Changes apply across all dashboards immediately.</p>
        </div>
      </div>
    </div>
  );
};
