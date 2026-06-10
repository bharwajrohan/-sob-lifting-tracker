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
  id: string;
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

// FIX: Default viewMode = 'AO Zone + State/City' — dono dikhenge
const DEFAULT_OEM_CONFIGS: OemConfig[] = [
  { id: 'BMW', oem: 'BMW', targetType: 'Standard', viewMode: 'AO Zone Wise' },
  { id: 'Citroën', oem: 'Citroën', targetType: 'Standard', viewMode: 'AO Zone Wise' },
  { id: 'Honda', oem: 'Honda', targetType: 'Standard', viewMode: 'AO Zone Wise' },
  { id: 'Hyundai', oem: 'Hyundai', targetType: 'Standard', viewMode: 'AO Zone Wise' },
  { id: 'Jeep', oem: 'Jeep', targetType: 'Standard', viewMode: 'AO Zone Wise' },
  { id: 'Kia', oem: 'Kia', targetType: 'Standard', viewMode: 'AO Zone Wise' },
  { id: 'MG', oem: 'MG', targetType: 'Standard', viewMode: 'AO Zone Wise' },
  { id: 'MSIL', oem: 'MSIL', targetType: 'Standard', viewMode: 'AO Zone Wise' },
  { id: 'Mahindra', oem: 'Mahindra', targetType: 'Standard', viewMode: 'AO Zone Wise' },
  { id: 'New Holland', oem: 'New Holland', targetType: 'Standard', viewMode: 'AO Zone Wise' },
  { id: 'RNAIPL', oem: 'RNAIPL', targetType: 'Standard', viewMode: 'AO Zone Wise' },
  { id: 'TATA', oem: 'TATA', targetType: 'Standard', viewMode: 'AO Zone Wise' },
  { id: 'Toyota', oem: 'Toyota', targetType: 'Standard', viewMode: 'AO Zone Wise' },
  { id: 'Škoda Auto Volkswagen', oem: 'Škoda Auto Volkswagen', targetType: 'Standard', viewMode: 'AO Zone Wise' },
];

export const OemConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rawOemConfigs, setOemConfigs] = useLocalStorage<OemConfig[]>(OEM_CONFIGS_KEY, DEFAULT_OEM_CONFIGS);

  const oemConfigs = rawOemConfigs && rawOemConfigs.length > 0 ? rawOemConfigs : DEFAULT_OEM_CONFIGS;

  const addOrUpdateConfig = (config: OemConfig) => {
    setOemConfigs(prev => {
      const list = prev && prev.length > 0 ? prev : DEFAULT_OEM_CONFIGS;
      const existingIdx = list.findIndex(c => c.oem === config.oem);
      if (existingIdx >= 0) {
        const next = [...list];
        next[existingIdx] = config;
        return next;
      }
      return [...list, config];
    });
  };

  const deleteConfig = (oem: string) => {
    setOemConfigs(prev => {
      const list = prev && prev.length > 0 ? prev : DEFAULT_OEM_CONFIGS;
      return list.filter(c => c.oem !== oem);
    });
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
