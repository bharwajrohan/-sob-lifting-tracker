import React, { useState, useMemo, useEffect } from 'react';
import { Target, Save, Download, RotateCcw, X, Info } from 'lucide-react';
import { useOemConfig } from './OemConfigContext';

interface OemTargetPlanningProps {
  years: number[];
  months: string[];
  currentYear: number;
  currentMonth: string;
  oems: string[];
  masterPlants: string[];
  oemPlantMap?: Record<string, string[]>;
  masterRoutes?: any[];
  data?: any[];
  onSave?: (oem: string, plant: string, month: string, year: number, gridData: Record<string, Record<string, string>>, colDef: any[], rows?: any[], entryType?: string) => void;
  onReset?: (oem: string, plant: string, month: string, year: number) => void;
}

// OEM-Plant-Zone-State mapping is now derived dynamically from masterRoutes
// instead of being hardcoded here.

const SearchableSelect = ({ value, onChange, options, label, placeholder, disabled = false, helperText }: { value: string, onChange: (val: string) => void, options: string[], label: string, placeholder?: string, disabled?: boolean, helperText?: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="flex flex-col relative" ref={wrapperRef}>
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">{label}</label>
      <div 
        className={`border border-slate-300 rounded-md px-3 py-1.5 text-sm font-semibold text-[#002060] bg-slate-50 min-w-[150px] flex justify-between items-center ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-[#002060]'}`}
        onClick={() => {
          if (disabled) return;
          setIsOpen(!isOpen);
          setSearchTerm('');
        }}
        title={disabled && helperText ? helperText : undefined}
      >
        <span className="truncate mr-2">{value || placeholder || 'Select...'}</span>
        <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </div>
      
      {helperText && disabled && (
        <p className="mt-1 text-[10px] font-semibold text-amber-700">{helperText}</p>
      )}
      {isOpen && (
        <div className="absolute top-[100%] left-0 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg z-[50] max-h-60 flex flex-col">
          <div className="p-2 border-b border-slate-100 sticky top-0 bg-white">
             <input 
               type="text" 
               className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-[#002060] focus:border-transparent" 
               placeholder="Search..." 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               onClick={(e) => e.stopPropagation()}
               autoFocus
             />
          </div>
          <div className="overflow-y-auto flex-1 py-1">
            {filteredOptions.length > 0 ? filteredOptions.map(opt => (
              <div 
                key={opt}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-slate-100 ${value === opt ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700'}`}
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                }}
              >
                {opt}
              </div>
            )) : (
              <div className="px-3 py-2 text-sm text-slate-500 italic text-center">No options found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};


export enum EntryType {
  ZONE_WISE = 'AO Zone Wise',
  WEEK_WISE = 'Week Wise',
  ZONE_WEEK = 'AO Zone + Week Wise',
  ZONE_STATE = 'AO Zone + State/City',
  STATE_WEEK = 'State/City + Week Wise',
  ZONE_STATE_WEEK = 'AO Zone + State/City + Week Wise'
}

export const OemTargetPlanningEntry: React.FC<OemTargetPlanningProps> = ({
  years, months, currentYear, currentMonth, oems, masterPlants, oemPlantMap = {}, masterRoutes = [], data, onSave, onReset
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(`${currentMonth.substring(0,3)}-${currentYear}`);
  const [selectedOEM, setSelectedOEM] = useState<string>(() => oems[0] || 'All');
  const [selectedPlant, setSelectedPlant] = useState<string>(() => {
    const firstOEM = oems[0] || '';
    return (oemPlantMap[firstOEM] || [])[0] || '';
  });
  const ENTRY_TYPE_OPTIONS = Object.values(EntryType);

  const [entryType, setEntryType] = useState<EntryType>(EntryType.ZONE_STATE_WEEK);
  const [qtyType, setQtyType] = useState<string>('Cars');
  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
  const [saveMessage, setSaveMessage] = useState<string>('');

  // Column visibility mapping for each entry type
  const ENTRY_TYPE_CONFIG = useMemo(() => ({
    [EntryType.ZONE_WISE]: { showZone: true, showState: false, showWeek: false, groupBy: 'zone' },
    [EntryType.WEEK_WISE]: { showZone: false, showState: false, showWeek: true, groupBy: 'week' },
    [EntryType.ZONE_WEEK]: { showZone: true, showState: false, showWeek: true, groupBy: 'zone' },
    [EntryType.ZONE_STATE]: { showZone: true, showState: true, showWeek: false, groupBy: 'zone-state' },
    [EntryType.STATE_WEEK]: { showZone: false, showState: true, showWeek: true, groupBy: 'state' },
    [EntryType.ZONE_STATE_WEEK]: { showZone: true, showState: true, showWeek: true, groupBy: 'zone-state' }
  } as Record<EntryType, any>), []);

  const entryConfig = ENTRY_TYPE_CONFIG[entryType] || ENTRY_TYPE_CONFIG[EntryType.ZONE_STATE_WEEK];
  const { oemConfigs } = useOemConfig();

  const normalizeText = (value: any) => String(value ?? '').trim().toLowerCase();

  const hasRealSavedTarget = (record: any) => {
    if (record?.entryType) return true;

    const targetValue = Number(record?.target ?? 0);
    if (targetValue > 0) return true;

    const weeklyBreakdown = Array.isArray(record?.weeklyBreakdown) ? record.weeklyBreakdown : [];
    return weeklyBreakdown.some((entry: any) => Number(entry?.cars ?? entry?.value ?? 0) > 0 || Number(entry?.trailers ?? 0) > 0);
  };

  const existingSavedTargets = useMemo(() => {
    const [mStr, yStr] = selectedMonth.split('-');
    const yearNum = parseInt(yStr, 10);
    const monthName = months.find(m => m.startsWith(mStr)) || mStr;

    return (data || []).filter(d =>
      normalizeText(d.oem) === normalizeText(selectedOEM) &&
      normalizeText(d.plant) === normalizeText(selectedPlant) &&
      normalizeText(d.month) === normalizeText(monthName) &&
      Number(d.year) === yearNum &&
      hasRealSavedTarget(d)
    );
  }, [data, selectedOEM, selectedPlant, selectedMonth, months]);

  const lockedEntryType = useMemo(() => {
    const uniqueEntryTypes = Array.from(new Set((existingSavedTargets || []).map((record: any) => record.entryType || 'AO Zone Wise')));
    return uniqueEntryTypes.length === 1 ? uniqueEntryTypes[0] : null;
  }, [existingSavedTargets]);

  // Lock the entry type only for the currently selected OEM + plant + month.
  // The user must remove the old entry first before switching entry types.
  const isEntryTypeLocked = Boolean(selectedOEM && selectedPlant && existingSavedTargets.length > 0);

  useEffect(() => {
    const activeConfig = oemConfigs.find(c => c.oem === selectedOEM);
    if (activeConfig && activeConfig.viewMode) {
      if (ENTRY_TYPE_OPTIONS.includes(activeConfig.viewMode as EntryType)) {
        setEntryType(activeConfig.viewMode as EntryType);
      } else {
        setEntryType(EntryType.ZONE_WISE);
      }
    }
  }, [selectedOEM, oemConfigs]);

  useEffect(() => {
    if (isEntryTypeLocked && lockedEntryType && ENTRY_TYPE_OPTIONS.includes(lockedEntryType as EntryType)) {
      setEntryType(lockedEntryType as EntryType);
    }
  }, [isEntryTypeLocked, lockedEntryType]);

  const monthOptions = useMemo(() => {
    return years.flatMap(y => months.map(m => `${m.substring(0,3)}-${y}`));
  }, [years, months]);

  // Dynamic COL_DEF based on selected OEM and Plant from masterRoutes
  const baseColumns = useMemo(() => {
    if (!masterRoutes) return [];
    
    const zoneColors: Record<string, string> = {
      // Standard zones
      'North': 'bg-amber-500',
      'South': 'bg-red-500',
      'East': 'bg-lime-600',
      'West': 'bg-purple-600',
      'West - MH': 'bg-purple-600',
      'West - GJ': 'bg-violet-600',
      'Central': 'bg-green-600',
      'Northeast': 'bg-teal-600',
      'Gujarat': 'bg-orange-500',
      'Export': 'bg-pink-600',
      'Domestic': 'bg-blue-600',
      'MP': 'bg-indigo-500',
      // TATA numbered sub-zones
      'Central1': 'bg-green-500', 'Central2': 'bg-green-600', 'Central3': 'bg-green-700',
      'East1': 'bg-lime-500', 'East2': 'bg-lime-600',
      'West1': 'bg-purple-500', 'West2': 'bg-purple-600', 'West3': 'bg-purple-700',
      'South1': 'bg-red-400', 'South2': 'bg-red-500', 'South3': 'bg-red-600',
      'North3': 'bg-amber-600',
      'North Central1': 'bg-yellow-500', 'North Central2': 'bg-yellow-600', 'North Central3': 'bg-yellow-700',
      // Spaced variants
      'North 1': 'bg-amber-400', 'North 2': 'bg-amber-500', 'North 3': 'bg-amber-600',
      'South 1': 'bg-red-400', 'South 2': 'bg-red-500', 'South 3': 'bg-red-600', 'South 4': 'bg-red-700',
      'West 1': 'bg-purple-400', 'West 2': 'bg-purple-500', 'West 3': 'bg-purple-600',
      'Central 1': 'bg-green-500',
      'M.P & Chhattisgarh': 'bg-indigo-500',
    };

    const routes = masterRoutes.filter(r => r.oem === selectedOEM && r.plant === selectedPlant);
    if (routes.length === 0) {
      const anyRoutes = masterRoutes.filter(r => r.oem === selectedOEM);
      if (anyRoutes.length === 0) return [];
      
      const firstAvailablePlant = anyRoutes[0].plant;
      return anyRoutes
        .filter(r => r.plant === firstAvailablePlant)
        .map((r, idx) => ({
          id: `dyn-${idx}`,
          zone: r.zone || 'Unknown',
          zColor: zoneColors[r.zone] || 'bg-slate-500',
          sub: r.statecity,
          state: r.statecity
        }));
    }

    return routes.map((r, idx) => ({
      id: `dyn-${idx}`,
      zone: r.zone || 'Unknown',
      zColor: zoneColors[r.zone] || 'bg-slate-500',
      sub: r.statecity,
      state: r.statecity
    }));
  }, [selectedOEM, selectedPlant, masterRoutes]);

  // Determine weeks in the selected month dynamically (MUST be before COL_DEF)
  const weeks = useMemo(() => {
    if (!selectedMonth) return [];
    
    // selectedMonth comes in format "MMM-YYYY" e.g., "May-2026"
    const [monthStr, yearStr] = selectedMonth.split('-');
    if (!monthStr || !yearStr) return [];
    
    const monthIndex = months.findIndex(m => m.startsWith(monthStr));
    const year = parseInt(yearStr, 10);
    
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    
    // Always present four calendar weeks: 1-7, 8-14, 15-21, 22-end
    const dynamicWeeks = [];
    for (let i = 0; i < 3; i++) {
      const start = i * 7 + 1;
      const end = Math.min(start + 6, daysInMonth);
      const weekNum = i + 1;

      let suffixStart = 'th';
      if (start === 1 || start === 21 || start === 31) suffixStart = 'st';
      if (start === 2 || start === 22) suffixStart = 'nd';
      if (start === 3 || start === 23) suffixStart = 'rd';

      let suffixEnd = 'th';
      if (end === 1 || end === 21 || end === 31) suffixEnd = 'st';
      if (end === 2 || end === 22) suffixEnd = 'nd';
      if (end === 3 || end === 23) suffixEnd = 'rd';

      const endText = end === daysInMonth ? 'End' : `${end}${suffixEnd}`;
      const sub = `(${start}${suffixStart} - ${endText})`;

      dynamicWeeks.push({ id: `wk${weekNum}`, label: `Week ${weekNum}`, sub });
    }

    // Week 4 covers 22nd to end of month (includes days 29-31; do not create week-5)
    const w4Start = 22;
    const w4End = daysInMonth;
    const suffixStart4 = 'nd';
    let suffixEnd4 = 'th';
    if (w4End === 1 || w4End === 21 || w4End === 31) suffixEnd4 = 'st';
    if (w4End === 2 || w4End === 22) suffixEnd4 = 'nd';
    if (w4End === 3 || w4End === 23) suffixEnd4 = 'rd';
    const endText4 = w4End === daysInMonth ? 'End' : `${w4End}${suffixEnd4}`;
    dynamicWeeks.push({ id: `wk4`, label: `Week 4`, sub: `(${w4Start}${suffixStart4} - ${endText4})` });
    
    return dynamicWeeks;
  }, [selectedMonth, months]);

  const visibleColumns = useMemo(() => {
    if (entryConfig.groupBy === 'week') {
      // When user selects Week Wise entry, use actual zones from masterRoutes
      // Get unique zones from baseColumns (which are derived from masterRoutes)
      const uniqueZones = Array.from(new Set(baseColumns.map(c => c.zone)));
      return uniqueZones.map((zone) => ({
        id: `zone-${zone}`,
        zone: zone,
        zColor: baseColumns.find(c => c.zone === zone)?.zColor || 'bg-slate-500',
        sub: zone,
        state: zone,
        type: 'zone'
      }));
    }

    if (entryConfig.groupBy === 'zone') {
      return Array.from(new Set(baseColumns.map(c => c.zone)))
        .map((zone, idx) => ({
          id: `zone-${idx}`,
          zone,
          zColor: baseColumns.find(c => c.zone === zone)?.zColor || 'bg-slate-500',
          sub: zone,
          state: zone,
          type: 'zone'
        }));
    }

    if (entryConfig.groupBy === 'state') {
      return Array.from(new Set(baseColumns.map(c => c.state)))
        .map((state, idx) => ({
          id: `state-${idx}`,
          zone: 'All',
          zColor: 'bg-slate-500',
          sub: state,
          state,
          type: 'state'
        }));
    }

    // Zone + State/City + Week (default): show full detail columns
    return baseColumns;
  }, [entryConfig.groupBy, baseColumns]);

  // If saved data exists for the selected OEM/Plant/Month/Year, limit visible columns to only those saved.
  const filteredVisibleColumns = useMemo(() => {
    if (!data) return visibleColumns;
    const [mStr, yStr] = selectedMonth.split('-');
    const yearNum = parseInt(yStr, 10);
    const monthName = months.find(m => m.startsWith(mStr)) || mStr;
    const saved = (data || []).filter(d =>
      d.oem === selectedOEM &&
      d.plant === selectedPlant &&
      d.month === monthName &&
      d.year === yearNum &&
      hasRealSavedTarget(d)
    );
    if (!saved || saved.length === 0) return visibleColumns;

    const isZoneGrouping = entryConfig.groupBy === 'zone' || entryConfig.groupBy === 'week';

    const cols = visibleColumns.filter(col => {
      const colKey = (col.sub || col.state || col.id || '').toString().trim();
      return saved.some(s => {
        if (isZoneGrouping) {
          // Zone-wise: column key is the zone name — match against saved zone field
          return (s.zone || '').toString().trim() === colKey;
        }
        // State/City-wise: column key is the city name — match against saved statecity field
        return (s.statecity || '').toString().trim() === colKey;
      });
    });

    return cols.length ? cols : visibleColumns;
  }, [data, visibleColumns, selectedOEM, selectedPlant, selectedMonth, months, entryConfig.groupBy]);

  const effectiveColumns = filteredVisibleColumns || visibleColumns;

  const rowDefinitions = useMemo(() => {
    if (entryConfig.showWeek) {
      return weeks;
    }

    return [{ id: 'target-row', label: 'Target', sub: '' }];
  }, [entryConfig.showWeek, weeks]);

  // State: gridData[rowId][colId] = numeric string
  const [gridData, setGridData] = useState<Record<string, Record<string, string>>>({});
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Initialize empty data when key filters change, and prefill from saved records when available
  useEffect(() => {
    const newData: Record<string, Record<string, string>> = {};
    rowDefinitions.forEach(row => {
      newData[row.id] = {};
      effectiveColumns.forEach(col => {
        newData[row.id][col.id] = '';
      });
    });

    if (data) {
      const [mStr, yStr] = selectedMonth.split('-');
      const yearNum = parseInt(yStr, 10);
      const monthName = months.find(m => m.startsWith(mStr)) || mStr;
      const saved = (data || []).filter(d => d.oem === selectedOEM && d.plant === selectedPlant && d.month === monthName && d.year === yearNum);
      if (saved && saved.length) {
        const isZoneGrouping = entryConfig.groupBy === 'zone' || entryConfig.groupBy === 'week';
        effectiveColumns.forEach(col => {
          const colKey = (col.sub || col.state || col.id || '').toString().trim();
          const rec = saved.find(s =>
            isZoneGrouping
              ? (s.zone || '').toString().trim() === colKey
              : (s.statecity || '').toString().trim() === colKey
          );
          if (rec) {
            if (rec.weeklyBreakdown && Array.isArray(rec.weeklyBreakdown)) {
              rec.weeklyBreakdown.forEach((wb: any) => {
                const matchRow = rowDefinitions.find(r => (r.sub || r.label || r.id) === (wb.dateRange || wb.sub || wb.label || wb.id));
                if (matchRow) {
                  newData[matchRow.id] = newData[matchRow.id] || {};
                  newData[matchRow.id][col.id] = String(wb.cars || wb.value || 0);
                }
              });
            } else if (rec.target != null && rowDefinitions.length === 1) {
              newData[rowDefinitions[0].id][col.id] = String(rec.target || 0);
            }
          }
        });
      }
    }

    setGridData(newData);
  }, [selectedMonth, selectedOEM, selectedPlant, entryType, rowDefinitions, effectiveColumns, data, months]);

  const handleInputChange = (weekId: string, colId: string, val: string) => {
    // allow only numbers
    if (val && !/^\d*$/.test(val)) return;
    setIsDirty(true);
    setGridData(prev => ({
      ...prev,
      [weekId]: {
        ...(prev[weekId] || {}),
        [colId]: val
      }
    }));
  };

  const calculateRowTotal = (weekId: string) => {
    let sum = 0;
    if (!gridData[weekId]) return sum;
    effectiveColumns.forEach(c => {
      sum += parseInt(gridData[weekId][c.id] || '0', 10);
    });
    return sum;
  };

  const calculateColTotal = (colId: string) => {
    let sum = 0;
    rowDefinitions.forEach(row => {
      if (gridData[row.id]) {
        sum += parseInt(gridData[row.id][colId] || '0', 10);
      }
    });
    return sum;
  };

  const renderZoneHeaders = () => {
    if (!entryConfig.showZone) {
      return effectiveColumns.map((c, idx) => (
        <th key={idx} className="px-2 py-1.5 text-center text-white text-xs sm:text-sm font-bold border border-slate-300 bg-blue-600">
          {entryConfig.groupBy === 'week' ? c.zone : ''}
        </th>
      ));
    }

    const zones: { zone: string; color: string; count: number }[] = [];
    effectiveColumns.forEach(c => {
      if (zones.length === 0 || zones[zones.length - 1].zone !== c.zone) {
        zones.push({ zone: c.zone, color: c.zColor, count: 1 });
      } else {
        zones[zones.length - 1].count += 1;
      }
    });

    return zones.map((z, idx) => (
      <th key={idx} colSpan={z.count} className={`px-2 py-1.5 text-center text-white text-xs sm:text-sm font-bold border border-slate-300 ${z.color}`}>
        {z.zone.toUpperCase()}
      </th>
    ));
  };

  const renderStateHeaders = () => {
    if (!entryConfig.showState) return null;

    return (
      <tr>
        <th className="bg-slate-50 border border-slate-300 p-2 text-xs font-bold text-slate-500 uppercase sticky left-0 z-10 shadow-[1px_0_0_0_#cbd5e1]">
          STATE/CITY →
        </th>
        {effectiveColumns.map((c, i) => (
          <th key={`state-${i}`} className="bg-slate-100 border border-slate-300 px-2 py-1.5 text-xs font-bold text-[#002060] min-w-[70px]">
            {c.state}
          </th>
        ))}
      </tr>
    );
  };



  const rowHeaderLabel = useMemo(() => {
    if (entryConfig.groupBy === 'zone') return 'AO ZONE →';
    if (entryConfig.groupBy === 'state') return 'STATE/CITY →';
    if (entryConfig.groupBy === 'zone-state') return 'AO ZONE/STATE/CITY →';
    return 'WEEK →';
  }, [entryConfig.groupBy]);

  const grandTotal = rowDefinitions.reduce((acc, row) => acc + calculateRowTotal(row.id), 0);
  const totalZones = new Set(effectiveColumns.map(c => c.zone)).size;

  const handleSave = () => {
    if (onSave) {
      const [mStr, yStr] = selectedMonth.split('-');
      const yearNum = parseInt(yStr, 10);
      // BUG-05 FIX: Pass full month name (e.g. "January") not 3-letter abbreviation ("Jan")
      // App.tsx stores and queries records using full month names
      const fullMonthName = months.find(m => m.startsWith(mStr)) || mStr;
      // Only pass rowDefinitions as week rows when the entry type actually uses weeks.
      // For zone-wise / state-wise (no week), pass undefined so the save handler
      // treats the total as a monthly target, not a weekly breakdown.
      const weekRows = entryConfig.showWeek ? rowDefinitions : undefined;
      onSave(selectedOEM, selectedPlant, fullMonthName, yearNum, gridData, effectiveColumns, weekRows, entryType);
      setIsDirty(false);
    }
    setLastUpdated(new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
    // Use inline state message instead of blocking alert
    setSaveMessage('Target Plan Saved Successfully!');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  const handleReset = () => {
    if (!window.confirm('Reset all entered data? This cannot be undone.')) return;
    const [mStr, yStr] = selectedMonth.split('-');
    const yearNum = parseInt(yStr, 10);
    const fullMonthName = months.find(m => m.startsWith(mStr)) || mStr;

    if (onReset) {
      onReset(selectedOEM, selectedPlant, fullMonthName, yearNum);
    }

    const newData: Record<string, Record<string, string>> = {};
    rowDefinitions.forEach(row => {
      newData[row.id] = {};
      effectiveColumns.forEach(col => {
        newData[row.id][col.id] = '';
      });
    });
    setGridData(newData);
  };

  return (
    <div className="w-full bg-[#f4f7f9] min-h-[calc(100vh-64px)] flex flex-col">
      {/* Header Banner */}
      <div className="bg-[#002060] text-white p-3 md:p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-lg">
            <Target className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-wider shadow-sm">OEM TARGET PLANNING ENTRY</h1>
            <h2 className="text-sm font-semibold text-yellow-400 tracking-wide">Week / AO Zone / State/City - Monthly Target Planning (Entry Type: {entryType})</h2>
          </div>
        </div>
        
        {/* KPI Badge Top Right */}
        <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 flex flex-col items-end backdrop-blur-sm shadow-md">
            <span className="text-[10px] text-zinc-300 font-bold uppercase tracking-wider">Total Monthly Target</span>
            <span className="text-3xl font-black text-cyan-300 leading-none mt-1">{grandTotal.toLocaleString()}</span>
        </div>
      </div>

      <div className="flex-1 p-3 md:p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-4">
        
        {/* Filter Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 md:p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 md:gap-5">
                <SearchableSelect
                    label="OEM"
                    value={selectedOEM}
                    options={oems}
                    onChange={(newOEM) => {
                      setSelectedOEM(newOEM);
                      const availablePlants = oemPlantMap[newOEM] || [];
                      setSelectedPlant(availablePlants[0] || '');
                    }}
                    placeholder="Select OEM"
                />
                
                <SearchableSelect
                    label="Plant"
                    value={selectedPlant}
                    options={oemPlantMap[selectedOEM] || []}
                    onChange={(val) => setSelectedPlant(val)}
                    placeholder="Select Plant"
                />

                <SearchableSelect
                    label="Target Month"
                    value={selectedMonth}
                    options={monthOptions}
                    onChange={(val) => setSelectedMonth(val)}
                    placeholder="Select Month"
                />

                <SearchableSelect
                    label="Entry Type"
                    value={entryType}
                    options={[...ENTRY_TYPE_OPTIONS]}
                    onChange={(val) => setEntryType(val as EntryType)}
                    placeholder="Select Entry Type"
                    disabled={isEntryTypeLocked}
                    helperText={isEntryTypeLocked
                      ? 'Entry type is locked because saved targets already exist for this OEM + plant + month. Remove the old entry first to change the entry type.'
                      : undefined}
                />

                <SearchableSelect
                    label="Qty Unit"
                    value={qtyType}
                    options={['Cars', 'Trailers', 'Tonnage']}
                    onChange={(val) => setQtyType(val)}
                    placeholder="Select Unit"
                />
            </div>

            <div className="flex items-center self-end xl:self-center bg-green-50 border border-green-200 px-3 py-2 rounded-md shadow-sm">
                <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
                <span className="text-xs font-semibold text-green-800">Last Updated: {lastUpdated}</span>
            </div>
        </div>

        {/* Planning Grid Area */}
        <div className="w-full bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col flex-1">
           <div className="overflow-x-auto">
              <div className="min-w-max p-4">
                 <table className="w-full border-collapse">
                    <thead>
                        {/* Row 1: Dynamic Headers based on Entry Type */}
                        <tr>
                            <th className="bg-slate-100 border border-slate-300 p-2 min-w-[150px] sticky left-0 z-10 shadow-[1px_0_0_0_#cbd5e1]">
                               <div className="text-xs font-bold text-slate-500 uppercase">
                                 {rowHeaderLabel}
                               </div>
                            </th>
                            {renderZoneHeaders()}
                            <th rowSpan={renderStateHeaders() ? 2 : 1} className="bg-[#002060] text-white border border-[#002060] px-3 font-black text-center min-w-[100px] uppercase shadow-md relative z-10">
                                Total
                            </th>
                        </tr>
                        {/* Row 2: Dynamic Sub-headers */}
                        {renderStateHeaders()}
                    </thead>
                    <tbody>
                        {rowDefinitions.map((row, rIdx) => {
                            const rTotal = calculateRowTotal(row.id);
                            return (
                            <tr key={row.id} className="hover:bg-blue-50/50 group">
                                <td className="bg-white group-hover:bg-blue-50/50 border border-slate-300 p-2 sticky left-0 z-10 shadow-[1px_0_0_0_#cbd5e1]">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-[#002060] text-sm">{row.label}</span>
                                        {row.sub && <span className="text-[10px] text-slate-500 font-semibold">{row.sub}</span>}
                                    </div>
                                </td>
                                {effectiveColumns.map((c, cIdx) => (
                                  <td key={`${row.id}-${c.id}`} className="border border-slate-300 p-1 bg-white">
                                    <input 
                                      type="text" 
                                      value={gridData[row.id]?.[c.id] || ''}
                                      onChange={(e) => handleInputChange(row.id, c.id, e.target.value)}
                                      className="w-full h-8 text-center text-sm font-semibold text-slate-700 bg-transparent border border-transparent hover:border-slate-300 focus:border-[#002060] focus:ring-1 focus:ring-[#002060] rounded outline-none placeholder-slate-200"
                                      placeholder="0"
                                    />
                                  </td>
                                ))}
                                <td className="border border-slate-300 bg-blue-50 p-2 text-center">
                                    <span className="font-black text-[#002060] text-base">{rTotal > 0 ? rTotal : '-'}</span>
                                </td>
                            </tr>
                        )})}
                        {/* Auto calculations padding row if needed, here we just jump to Total */}
                        <tr className="bg-blue-50/80">
                            <td className="border border-slate-300 p-3 sticky left-0 z-10 shadow-[1px_0_0_0_#cbd5e1] bg-blue-50/80">
                                <span className="font-black text-[#002060] uppercase text-sm">TOTAL (col wise)</span>
                            </td>
                            {effectiveColumns.map((c) => {
                              const cTotal = calculateColTotal(c.id);
                              return (
                                <td key={`total-${c.id}`} className="border border-slate-300 p-2 text-center">
                                  <span className="font-black text-[#002060] text-sm">{cTotal > 0 ? cTotal : '-'}</span>
                                </td>
                              )
                            })}
                            <td className="border border-slate-400 bg-red-50 p-3 text-center shadow-inner">
                                <span className="font-black text-red-600 text-xl">{grandTotal > 0 ? grandTotal : '-'}</span>
                            </td>
                        </tr>
                    </tbody>
                 </table>
              </div>
           </div>
        </div>

        {/* Footer Stats & Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 w-full flex flex-col md:flex-row lg:items-center justify-between gap-6">
            
            <div className="flex flex-wrap items-center gap-3">
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 min-w-[120px] flex flex-col">
                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Monthly Target</span>
                    <span className="text-xl font-black text-[#002060] mt-0.5">{grandTotal.toLocaleString()}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 min-w-[90px] flex flex-col">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">AO Zones</span>
                    <span className="text-xl font-black text-slate-800 mt-0.5">{new Set(baseColumns.map(c => c.zone)).size}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 min-w-[90px] flex flex-col">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">States/Cities</span>
                    <span className="text-xl font-black text-slate-800 mt-0.5">{new Set(baseColumns.map(c => c.state)).size}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 min-w-[90px] flex flex-col">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Columns</span>
                    <span className="text-xl font-black text-slate-800 mt-0.5">{effectiveColumns.length}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 min-w-[90px] flex flex-col">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Weeks</span>
                    <span className="text-xl font-black text-slate-800 mt-0.5">{entryConfig.showWeek ? weeks.length : '-'}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 min-w-[120px] flex flex-col">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Entry Type</span>
                    <span className="text-sm font-black text-slate-800 mt-auto">{entryType}</span>
                </div>
            </div>

            <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 max-w-sm flex-1">
                <div className="flex items-start gap-2 mb-1">
                    <Info size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
                    <span className="text-xs font-bold text-blue-800">Target Planning Notes</span>
                </div>
                <ul className="text-[10px] text-blue-700/80 font-medium pl-6 list-disc space-y-0.5">
                    <li>This grid is strictly for Target Entry (Planning Phase).</li>
                    <li>Row and Column totals calculation is fully automated.</li>
                    <li>Ensure inputs are numbers only.</li>
                </ul>
            </div>

            <div className="flex flex-wrap md:flex-nowrap items-center gap-3 ml-auto md:ml-0">
                <button onClick={handleReset} className="flex items-center justify-center gap-2 px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 font-bold text-xs rounded-lg transition-colors border border-orange-200 w-full md:w-auto">
                    <RotateCcw size={14} /> RESET
                </button>
                <button onClick={handleReset} className="flex items-center justify-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-lg transition-colors border border-red-100 w-full md:w-auto">
                    <X size={14} /> CANCEL
                </button>
                <button className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded-lg transition-colors shadow-sm w-full md:w-auto">
                    <Download size={14} /> EXPORT EXCEL
                </button>
                <button onClick={handleSave} className="flex items-center justify-center gap-2 px-6 py-2 bg-[#002060] hover:bg-[#001540] text-white font-bold text-xs rounded-lg transition-colors shadow-md w-full md:w-auto">
                    <Save size={14} /> SAVE TARGET PLAN
                </button>
            </div>
            {saveMessage && (
              <div className="mt-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-green-800 text-xs font-semibold text-center animate-pulse">
                ✓ {saveMessage}
              </div>
            )}

        </div>

      </div>

      {/* ── Saved Targets for selected OEM / Plant / Month ─────────────────── */}
      {(() => {
        const [mStr, yStr] = selectedMonth.split('-');
        const yearNum = parseInt(yStr, 10);
        const monthName = months.find(m => m.startsWith(mStr)) || mStr;
        const savedRows = (data || []).filter(
          d => d.oem === selectedOEM &&
            d.plant === selectedPlant &&
            d.month === monthName &&
            d.year === yearNum &&
            hasRealSavedTarget(d)
        );
        if (savedRows.length === 0) return null;
        return (
          <div className="mx-4 mb-6 mt-4 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-[#002060] text-white px-4 py-2 flex items-center gap-2">
              <Target size={14} />
              <span className="text-xs font-bold uppercase tracking-wider">
                Saved Targets — {selectedOEM} · {selectedPlant} · {monthName} {yStr}
              </span>
              <span className="ml-auto text-[11px] bg-white/20 px-2 py-0.5 rounded-full font-semibold">
                {savedRows.length} record{savedRows.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-slate-50 z-10">
                  <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-3 py-2 text-left border-r border-slate-200">State / City</th>
                    <th className="px-3 py-2 text-left border-r border-slate-200">Zone</th>
                    <th className="px-3 py-2 text-center border-r border-slate-200">Type</th>
                    <th className="px-3 py-2 text-center border-r border-slate-200">Period</th>
                    <th className="px-3 py-2 text-right border-r border-slate-200">Target (Cars)</th>
                    <th className="px-3 py-2 text-right">Target (Trailers)</th>
                  </tr>
                </thead>
                <tbody>
                  {savedRows.map((row: any) => {
                    const hasWeekly = row.entryType === 'Weekly' && Array.isArray(row.weeklyBreakdown) && row.weeklyBreakdown.length > 0;
                    return (
                      <React.Fragment key={row.id}>
                        {/* Main record row */}
                        <tr className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-[#1e293b] border-r border-slate-200">{row.statecity || '—'}</td>
                          <td className="px-3 py-2 text-slate-500 border-r border-slate-200">{row.zone || '—'}</td>
                          <td className="px-3 py-2 text-center border-r border-slate-200">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${row.entryType === 'Weekly' ? 'bg-purple-100 text-purple-700' : row.entryType === 'Percentage Based' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                              {row.entryType || 'Monthly'}
                            </span>
                            {row.targetLevel === 'AO Zone Wise' && (
                              <span className="ml-1 inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">Zonal</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center text-slate-500 border-r border-slate-200">
                            {row.month}
                            {hasWeekly && <span className="ml-1 text-[10px] text-purple-500 font-semibold">({row.weeklyBreakdown.length}W)</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-[#002060] border-r border-slate-200">{(row.target || 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{(row.targetTrailers || 0).toLocaleString()}</td>
                        </tr>
                        {/* Weekly breakdown sub-rows */}
                        {hasWeekly && row.weeklyBreakdown.map((wb: any, wIdx: number) => (
                          <tr key={`${row.id}-wb-${wIdx}`} className="bg-purple-50/50 border-b border-purple-100/50 text-[11px]">
                            <td className="pl-7 pr-2 py-1.5 text-purple-600 border-r border-slate-200">
                              <span className="text-purple-300 mr-1">↳</span>
                              <span className="font-semibold">W{wIdx + 1}</span>
                            </td>
                            <td className="px-3 py-1.5 text-slate-400 italic border-r border-slate-200">{row.zone}</td>
                            <td className="px-3 py-1.5 text-center border-r border-slate-200">
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-600">Weekly</span>
                            </td>
                            <td className="px-3 py-1.5 text-center text-slate-500 border-r border-slate-200">{wb.dateRange || `Week ${wIdx + 1}`}</td>
                            <td className="px-3 py-1.5 text-right font-semibold text-purple-700 border-r border-slate-200">{(wb.cars || 0).toLocaleString()}</td>
                            <td className="px-3 py-1.5 text-right text-slate-400">{(wb.trailers || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                  <tr className="text-[11px] font-black text-[#002060]">
                    <td colSpan={4} className="px-3 py-2 border-r border-slate-200 uppercase">Total</td>
                    <td className="px-3 py-2 text-right border-r border-slate-200">
                      {savedRows.reduce((s: number, r: any) => s + (r.target || 0), 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {savedRows.reduce((s: number, r: any) => s + (r.targetTrailers || 0), 0).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
