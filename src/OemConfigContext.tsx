
import React, { createContext, useContext } from 'react';
import { useLocalStorage } from './useSyncedStorage';

export type TargetViewMode =
  | 'AO Zone Wise'
  | 'AO Zone + Week Wise'
  | 'AO Zone + State/City + Week Wise'
  | 'Week Wise'
  | 'State/City + Week Wise'
  | 'AO Zone + State/City';

export interface OemConfig {
  id: string; // unique string or just OEM since it's 1-to-1
  oem: string;
  targetType: 'Standard' | 'Weekly' | 'Percentage';
  viewMode?: TargetViewMode;
}

export type ColumnVisibility = {
  showZone: boolean;
  showWeek: boolean;
  showStateCity: boolean;
};

export const getColumnVisibilityStrategy = (viewMode?: TargetViewMode): ColumnVisibility => {
  switch (viewMode) {
    case 'AO Zone Wise':
      return { showZone: true, showWeek: false, showStateCity: false };
    case 'AO Zone + Week Wise':
      return { showZone: true, showWeek: true, showStateCity: false };
    case 'AO Zone + State/City + Week Wise':
      return { showZone: true, showWeek: true, showStateCity: true };
    case 'Week Wise':
      return { showZone: false, showWeek: true, showStateCity: false };
    case 'State/City + Week Wise':
      return { showZone: false, showWeek: true, showStateCity: true };
    case 'AO Zone + State/City':
      return { showZone: true, showWeek: false, showStateCity: true };
    default:
      // Default fallback
      return { showZone: true, showWeek: true, showStateCity: true };
  }
};

interface OemConfigContextType {
  oemConfigs: OemConfig[];
  addOrUpdateConfig: (config: OemConfig) => void;
  deleteConfig: (oem: string) => void;
}

const OemConfigContext = createContext<OemConfigContextType | undefined>(undefined);

const OEM_CONFIGS_KEY = 'tracker_oem_configs';

export const OemConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [oemConfigs, setOemConfigs] = useLocalStorage<OemConfig[]>(OEM_CONFIGS_KEY, []);

  const addOrUpdateConfig = (config: OemConfig) => {
    setOemConfigs(prev => {
      const existingIdx = prev.findIndex(c => c.oem === config.oem);
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = config;
        return next;
      }
      return [...prev, config];
    });
  };

  const deleteConfig = (oem: string) => {
    setOemConfigs(prev => prev.filter(c => c.oem !== oem));
  };

  return (
    <OemConfigContext.Provider value={{ oemConfigs, addOrUpdateConfig, deleteConfig }}>
      {children}
    </OemConfigContext.Provider>
  );
};

export const useOemConfig = () => {
  const context = useContext(OemConfigContext);
  if (!context) throw new Error("useOemConfig must be used within OemConfigProvider");
  return context;
};
