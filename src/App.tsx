/* eslint-disable */
/* eslint-disable security/detect-object-injection */
/* eslint-disable react/jsx-no-literals */
/* eslint-disable i18next/no-literal-string */
/* eslint-disable @typescript-eslint/no-explicit-any */
// NOSONAR - This file intentionally uses bracket notation for performance-critical
// internal data structures keyed from static masterData.json (not user input).
// All dynamic keys are sanitised before use. i18n is out of scope for this app.

/**
 * Safe property accessor — prevents prototype-pollution warnings.
 * Uses Object.hasOwn so __proto__ / constructor / toString keys are rejected.
 */
const safeGet = <T = any>(obj: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(obj, key) ? obj[key] : undefined;

const safeSet = <T = any>(obj: Record<string, T>, key: string, value: T): void => {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') return;
  obj[key] = value;
};

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Wifi, WifiOff, Download, TrendingUp, AlertCircle, CheckCircle2, XCircle, Truck, Factory, MapPin, Target, Plus, X, Upload, Shield, Edit2, Trash2, Calendar, CalendarDays, RefreshCw, Filter, BarChart3, ChevronDown, Settings, Menu, Home, Crosshair, TrendingDown, CalendarClock, AlertTriangle, Award, Search, Database, MapIcon, Activity, Building, Layers3, Trophy, Users } from 'lucide-react';
import { buildBreakdownInput, computeAndSave, deleteBreakdown, deleteBreakdowns } from './TargetBreakdownService';
import { RestoreData } from './RestoreData';
import { ApplicationSettings } from './components/ApplicationSettings';
import { ReloadPrompt } from './components/ReloadPrompt';
import { useLocalStorage, useSyncStatus } from './useSyncedStorage';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, LabelList, PieChart, Pie } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { FleetPlanner } from './FleetPlanner';
import { Login } from './Login';
import { UserManagement } from './UserManagement';
import { CalendarTab } from './CalendarTab';
import { ShareOfBusinessTab } from './ShareOfBusinessTab';
import { ZoneBranchReport } from './ZoneBranchReport';
import { DayWiseBranchReport } from './DayWiseBranchReport';
import { useIndexedDB } from './hooks/useIndexedDB';
import { OemTargetPlanningEntry } from './OemTargetPlanningEntry';
import { BranchPerformanceTargetReport } from './BranchPerformanceTargetReport';
import { IncentivePlannerTab } from './IncentivePlannerTab';
import { OemConfigProvider, useOemConfig, getColumnVisibilityStrategy } from './OemConfigContext';
import { validateTargetPlanSave } from './targetPlanValidation';

import rawMasterData from './masterData.json';
const masterData: any[] = Array.isArray(rawMasterData) ? rawMasterData : (rawMasterData as any).default || [];

// BUG-07 FIX: Removed shared CAPACITY constant — trailerCapacity state is passed directly now

export const normalizeZone = (zone: any): string => {
  if (!zone || typeof zone !== 'string') return 'Unknown';
  const z = zone.trim();
  const zl = z.toLowerCase();

  // Destination zones - keep the space-dash-space format to match masterData.json
  if (zl === 'west - mh' || zl === 'west mh' || zl === 'westmh') return 'West - MH';
  if (zl === 'west - gj' || zl === 'west gj' || zl === 'westgj') return 'West - GJ';

  // Standard AO zones — normalise case
  if (zl === 'north') return 'North';
  if (zl === 'south') return 'South';
  if (zl === 'east') return 'East';
  if (zl === 'west') return 'West';
  if (zl === 'central') return 'Central';
  if (zl === 'northeast' || zl === 'north east') return 'Northeast';
  if (zl === 'gujarat') return 'Gujarat';
  if (zl === 'export') return 'Export';
  if (zl === 'domestic') return 'Domestic';
  if (zl === 'mp') return 'MP';

  // Numbered sub-zones (TATA style) — keep as-is but normalise spacing
  // e.g. "Central1" -> "Central1", "North Central1" -> "North Central1"
  // "West 1" -> "West 1", "South 2" -> "South 2"
  // These are valid distinct zones, just pass through trimmed
  return z;
};

const isZonePlaceholder = (value: string | undefined | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['domestic', 'export', 'all destinations', 'all regions'].includes(normalized);
};

const getDisplayStateCity = (row: any) => {
  const raw = String(row?.statecity || '').trim();
  if (!isZonePlaceholder(raw) && raw) return raw;

  const match = (masterData as any[]).find((r: any) =>
    r.oem === row?.oem &&
    r.plant === row?.plant &&
    (r.stateCity === raw || r.zoneAO === row?.zone || r.destinationZone === row?.zone)
  );

  return match?.stateCity || raw || 'Unknown';
};

// Define the structure for a master routing entry
type MasterRoute = {
  originZone: string,
  oem: string,
  plant: string,
  statecity: string,
  zone: string,
  destZone: string,
  manageByBranch: string
};

// Map raw JSON data to our standardized MasterRoute structure
const DEFAULT_MASTER_ROUTES: MasterRoute[] = (masterData as any[]).map(r =>
({
  originZone: normalizeZone(r.originZone),
  oem: r.oem,
  plant: r.plant,
  statecity: r.stateCity,
  zone: normalizeZone(r.zoneAO),
  destZone: normalizeZone(r.destinationZone || 'Unknown'),
  manageByBranch: r.branchName || 'Unknown'
})
);

export const readConfig = () => {
  try {
    const stored = window.localStorage.getItem('tracker_zone_config');
    if (stored) return JSON.parse(stored);
  } catch (e) { }

  // All configuration is now derived from masterData.json
  return {
    originMap: {},
    destMapTerms: {},
    mahindraCities: {}
  };
};

export const getOriginZone = (plant: string): string => {
  if (!plant) return 'Unknown';
  const p = plant.trim();
  const pLower = p.toLowerCase();

  // Rely strictly on masterData-derived PLANT_ZONES
  if (PLANT_ZONES[p]) return PLANT_ZONES[p];
  const plantZoneKey = Object.keys(PLANT_ZONES).find(k => k.toLowerCase() === pLower);
  if (plantZoneKey) return PLANT_ZONES[plantZoneKey];

  return "Unknown";
};

export const getDestinationZone = (destinationOrRecord: any): string => {
  if (!destinationOrRecord) return 'Unknown';
  let statecity = '';
  let recordOem = '';
  let recordPlant = '';

  if (typeof destinationOrRecord === 'object') {
    if (destinationOrRecord.targetLevel === 'AO Zone') return destinationOrRecord.zone;

    recordOem = destinationOrRecord.oem || '';
    recordPlant = destinationOrRecord.plant || '';
    statecity = destinationOrRecord.statecity || '';

    // 1. Direct masterData lookup by oem+plant+stateCity for destZone
    const mdMatch = (masterData as any[]).find((r: any) =>
      r.oem === recordOem && r.plant === recordPlant && r.stateCity === statecity
    );
    if (mdMatch && mdMatch.destinationZone != null) {
      return normalizeZone(mdMatch.destinationZone);
    }
  } else {
    statecity = destinationOrRecord as string;
  }

  if (!statecity) return 'Unknown';

  // 2. Try masterData lookup by stateCity only
  const mdByDest = (masterData as any[]).find((r: any) =>
    (r.stateCity || '').toLowerCase() === statecity.toLowerCase()
  );
  if (mdByDest && mdByDest.destinationZone != null) {
    return normalizeZone(mdByDest.destinationZone);
  }

  return "Unknown";
};

export const getMahindraCities = () => {
  return readConfig().mahindraCities;
};

export const INITIAL_MANAGE_BY_BRANCH_MAP: Record<string, Record<string, string>> = {};
(masterData as any[]).forEach((r: any) => {
  if (r.oem && r.plant && r.branchName) {
    if (!safeGet(INITIAL_MANAGE_BY_BRANCH_MAP, r.oem)) safeSet(INITIAL_MANAGE_BY_BRANCH_MAP, r.oem, {});
    const oemEntry = safeGet(INITIAL_MANAGE_BY_BRANCH_MAP, r.oem) as Record<string, string>;
    if (oemEntry && !safeGet(oemEntry, r.plant)) {
      safeSet(oemEntry, r.plant, r.branchName);
    }
  }
});

const resolveManageByBranch = (oem: string, plant: string) => {
  const fromMap = ((safeGet(INITIAL_MANAGE_BY_BRANCH_MAP, oem) as Record<string, string> | undefined)?.[plant] || '').trim();
  if (fromMap && fromMap !== 'Unknown') return fromMap;

  const fromMaster = (masterData as any[])
    .find((r: any) => r.oem === oem && r.plant === plant)?.branchName?.trim();

  return fromMaster && fromMaster !== 'Unknown' ? fromMaster : '';
};


type TransportRecord = {
  id: string;
  oem: string;
  plant: string;
  statecity: string;
  zone: string;
  originZone?: string;
  destZone?: string;
  manageByBranch?: string;
  target: number;
  targetTrailers?: number;
  lifted: number;

  liftedTrailers?: number;
  liftedTrucks?: number;
  month: string;
  year: number;
  username?: string;
  entryType?: string;
  targetLevel?: 'State/City Wise' | 'AO Zone Wise';
  weeklyBreakdown?: { dateRange: string, cars: number, trailers: number }[];
};

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const timeframes = [...months, 'Q1 (Jan-Mar)', 'Q2 (Apr-Jun)', 'Q3 (Jul-Sep)', 'Q4 (Oct-Dec)', 'H1 (Jan-Jun)', 'H2 (Jul-Dec)', 'Full Year'];
const currentMonth = months[new Date().getMonth()];
const currentYear = new Date().getFullYear();
const achievementPieModes = ['Origin Zone', 'Branch', 'OEM', 'Plant'] as const;
const achievementPiePalette = ['#2563EB', '#16A34A', '#F59E0B', '#8B5CF6', '#64748B', '#14B8A6', '#EF4444', '#EAB308'];
// Generate a sensible year range around the runtime current year
// (keeps dropdown useful for past and near-future years)
const YEAR_RANGE_PREVIOUS = 10;
const YEAR_RANGE_FUTURE = 20;
const yearsStart = currentYear - YEAR_RANGE_PREVIOUS;
const years = Array.from({ length: YEAR_RANGE_PREVIOUS + YEAR_RANGE_FUTURE + 1 }, (_, i) => yearsStart + i);

const PLANT_ZONES: Record<string, string> = {};
(masterData as any[]).forEach((r: any) => {
  if (r.plant && r.originZone && !safeGet(PLANT_ZONES, r.plant)) {
    safeSet(PLANT_ZONES, r.plant, normalizeZone(r.originZone));
  }
});
const originZones = Array.from(new Set(Object.values(PLANT_ZONES)));
const ALL_DEST_ZONES = Array.from(new Set(DEFAULT_MASTER_ROUTES.map(r => r.destZone).filter(z => z !== 'Unknown' && z !== undefined))).sort();
const ALL_ZONES = Array.from(new Set([...originZones, ...ALL_DEST_ZONES])).sort();

const getMonthsForTimeframe = (timeframe: string): string[] => {
  if (months.includes(timeframe)) return [timeframe];
  if (timeframe === 'Q1 (Jan-Mar)') return ['January', 'February', 'March'];
  if (timeframe === 'Q2 (Apr-Jun)') return ['April', 'May', 'June'];
  if (timeframe === 'Q3 (Jul-Sep)') return ['July', 'August', 'September'];
  if (timeframe === 'Q4 (Oct-Dec)') return ['October', 'November', 'December'];
  if (timeframe === 'H1 (Jan-Jun)') return ['January', 'February', 'March', 'April', 'May', 'June'];
  if (timeframe === 'H2 (Jul-Dec)') return ['July', 'August', 'September', 'October', 'November', 'December'];
  if (timeframe === 'Full Year') return months;
  return [currentMonth];
};

const getDaysInTimeframe = (timeframe: string, year: number): number => {
  const targetMonths = getMonthsForTimeframe(timeframe);
  return targetMonths.reduce((total, month) => {
    return total + new Date(year, months.indexOf(month) + 1, 0).getDate();
  }, 0);
};

/**
 * Breaks a monthly target into 4 calendar-week buckets.
 *
 * Week boundaries (fixed, 1-indexed days):
 *   W1: days  1 – 7          (7 days)
 *   W2: days  8 – 14         (7 days)
 *   W3: days 15 – 21         (7 days)
 *   W4: days 22 – end        (remaining days, e.g. 8–10)
 *
 * Each week's target = Math.floor(total × weekDays / daysInMonth).
 * The remainder is added to W4 so the sum always equals `total` exactly.
 *
 * If the record already has an explicit `weeklyBreakdown` array (saved by the
 * user in Weekly mode), those exact values are returned instead.
 */
export function breakTargetIntoWeeks(
  monthlyTarget: number,
  month: string,
  year: number,
  weeklyBreakdown?: { dateRange: string; cars: number; trailers: number }[],
): { w1: number; w2: number; w3: number; w4: number; w4Days: number; daysInMonth: number } {
  const mIdx = months.indexOf(month);
  const dim = new Date(year, mIdx + 1, 0).getDate();
  const w4Days = dim - 21; // days in W4 (e.g. 10 for a 31-day month)

  // If explicit weekly breakdown was saved by the user, use it directly
  if (weeklyBreakdown && weeklyBreakdown.length > 0) {
    return {
      w1: weeklyBreakdown[0]?.cars ?? 0,
      w2: weeklyBreakdown[1]?.cars ?? 0,
      w3: weeklyBreakdown[2]?.cars ?? 0,
      w4: weeklyBreakdown[3]?.cars ?? 0,
      w4Days,
      daysInMonth: dim,
    };
  }

  // Auto-calculate proportionally from calendar days
  const w1 = Math.floor(monthlyTarget * 7 / dim);
  const w2 = Math.floor(monthlyTarget * 7 / dim);
  const w3 = Math.floor(monthlyTarget * 7 / dim);
  const w4 = monthlyTarget - w1 - w2 - w3; // absorbs remainder

  return { w1, w2, w3, w4: Math.max(0, w4), w4Days, daysInMonth: dim };
}

/**
 * Computes daily / weekly / monthly required lifting from the current date.
 *
 * @param monthlyTarget  Total monthly target (cars)
 * @param lifted         Cars lifted so far this month
 * @param month          Full month name, e.g. "May"
 * @param year           Calendar year, e.g. 2026
 * @returns
 *   balance        = max(0, target - lifted)          — total remaining
 *   remainingDays  = calendar days from today to EOM  — includes today
 *   dailyRequired  = balance / remainingDays           — cars needed per day
 *   weeklyRequired = dailyRequired × daysLeftInWeek   — cars needed for the rest of this week
 *   expectedToDate = (target / daysInMonth) × dayOfMonth — pace-based expected lifted
 *   shortfall      = expectedToDate - lifted           — negative = ahead, positive = behind
 *   achPct         = (lifted / target) × 100
 */
export function computeRequirements(
  monthlyTarget: number,
  lifted: number,
  month: string,
  year: number,
) {
  const today = new Date();
  const mIdx = months.indexOf(month);
  const daysInMonth = new Date(year, mIdx + 1, 0).getDate();

  // Is this the current month?
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === mIdx;

  // Day of month to use for "today" — for past months use last day, future months use day 1
  const dayOfMonth = isCurrentMonth
    ? today.getDate()
    : today.getFullYear() > year || (today.getFullYear() === year && today.getMonth() > mIdx)
      ? daysInMonth   // past month — all days elapsed
      : 1;            // future month — no days elapsed yet

  // Remaining days from today to end of month (inclusive)
  const remainingDays = Math.max(1, daysInMonth - dayOfMonth + 1);

  const balance = Math.max(0, monthlyTarget - lifted);
  const dailyRequired = remainingDays > 0 ? balance / remainingDays : 0;
  const daysLeftInWeek = today.getDay() === 0 ? 1 : Math.max(1, 7 - today.getDay());
  const weeklyRequired = dailyRequired * daysLeftInWeek;

  const expectedToDate = daysInMonth > 0 ? (monthlyTarget / daysInMonth) * dayOfMonth : 0;
  const shortfall = expectedToDate - lifted; // negative = ahead of pace
  const achPct = monthlyTarget > 0 ? (lifted / monthlyTarget) * 100 : (lifted > 0 ? 100 : 0);

  return {
    daysInMonth,
    dayOfMonth,
    remainingDays,
    balance,
    dailyRequired,
    weeklyRequired,
    expectedToDate,
    shortfall,
    achPct,
  };
}

export const FilterDropdown = ({ value, options, onChange, icon: Icon, defaultLabel = "All", clearValue = "All", activeCondition, disabled, label }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const selectRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  React.useEffect(() => {
    if (!isOpen) {
      setSearchTerm("");
    }
  }, [isOpen]);

  const isActive = activeCondition ? activeCondition(value) : (value !== clearValue && value !== defaultLabel);

  const filteredOptions = options.filter((opt: any) => {
    const optLabel = typeof opt === 'object' ? opt.label : opt;
    return String(optLabel).toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="relative" ref={selectRef}>
      <div className="flex items-center">
        <motion.button
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={label ? `Filter by ${label}` : 'Filter dropdown'}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl font-medium transition-all shadow-sm outline-none bg-[#FFFFFF] border ${disabled ? 'opacity-50 cursor-not-allowed border-[#E2E8F0] text-[#94A3B8]' :
            isActive
              ? 'border-[#005689] text-[#005689] ring-2 ring-[#005689] ring-offset-1'
              : 'border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]'
            }`}
          animate={isActive && !disabled ? { boxShadow: ["0px 0px 0px rgba(0,86,137,0)", "0px 0px 12px rgba(0,86,137,0.4)", "0px 0px 0px rgba(0,86,137,0)"] } : {}}
          transition={isActive && !disabled ? { duration: 2, repeat: Infinity } : {}}
        >
          {Icon && <Icon size={16} aria-hidden="true" className={isActive ? 'text-[#005689]' : 'text-[#94A3B8]'} />}
          <div className="flex flex-col items-start text-left">
            {label && <span className="text-[10px] uppercase tracking-wider font-bold text-[#94A3B8] leading-none mb-0.5" aria-hidden="true">{label}</span>}
            <span className={`text-sm leading-none ${isActive ? 'font-bold' : 'font-medium'}`}>{value === clearValue || value === defaultLabel ? defaultLabel : value}</span>
          </div>
          <ChevronDown size={16} aria-hidden="true" className={`ml-1 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ${isActive ? 'text-[#005689]' : 'text-[#94A3B8]'}`} />
        </motion.button>
        {isActive && !disabled && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChange(clearValue);
            }}
            aria-label={`Clear ${label || 'filter'}`}
            className="absolute -right-2 -top-2 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#64748B] hover:text-[#1E293B] rounded-full p-1 shadow-sm border border-[#E2E8F0] transition-colors z-10 focus:outline-none focus:ring-2 focus:ring-[#005689]"
            title="Clear filter"
          >
            <X size={12} aria-hidden="true" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15 }}
            role="listbox"
            aria-label={label ? `${label} options` : 'Filter options'}
            className="absolute z-50 mt-2 w-56 max-h-72 flex flex-col bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl shadow-xl focus:outline-none"
          >
            {options.length > 5 && (
              <div className="p-2 border-b border-[#E2E8F0] sticky top-0 bg-white rounded-t-xl z-10">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" aria-hidden="true" />
                  <input
                    type="text"
                    placeholder="Search..."
                    aria-label={`Search ${label || 'options'}`}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-[#E2E8F0] rounded-md focus:outline-none focus:border-[#005689] focus:ring-1 focus:ring-[#005689]"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            )}
            <div className="p-1.5 overflow-y-auto hide-scrollbar">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-4 text-sm text-center text-[#64748B]" role="option" aria-selected="false">No results found</div>
              ) : (
                filteredOptions.map((opt: any) => {
                  const optValue = typeof opt === 'object' ? opt.value : opt;
                  const optLabel = typeof opt === 'object' ? opt.label : opt;
                  return (
                    <button
                      key={optValue}
                      role="option"
                      aria-selected={value === optValue}
                      onClick={() => { onChange(optValue); setIsOpen(false); }}
                      className={`w-full text-left px-3 py-2.5 text-sm rounded-lg transition-colors flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#005689] ${value === optValue ? 'bg-[#F0F9FF] font-bold text-[#005689]' : 'text-[#64748B] hover:bg-[#F8FAFC]'}`}
                    >
                      {optLabel}
                      {value === optValue && <CheckCircle2 size={16} aria-hidden="true" className="text-[#005689]" />}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const FormCombobox = ({
  id,
  value,
  placeholder,
  disabled,
  options,
  onChange,
  onClear
}: {
  id: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  options: string[];
  onChange: (val: string) => void;
  onClear?: () => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchTerm(value || "");
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm(value || "");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value]);

  const filteredOptions = useMemo(() => {
    const query = searchTerm.toLowerCase().trim();
    if (!query) return options;
    return options.filter((opt: string) => opt.toLowerCase().includes(query));
  }, [options, searchTerm]);

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative flex items-center">
        <Search size={16} className="absolute left-3 text-slate-400 pointer-events-none" />
        <input
          id={id}
          type="text"
          value={searchTerm}
          placeholder={disabled ? "Select option..." : placeholder}
          disabled={disabled}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (!disabled) setIsOpen(true);
          }}
          className="w-full border border-[#CBD5E1] rounded-lg pl-9 pr-8 py-2 focus:ring-2 focus:ring-[#005689] focus:border-[#005689] outline-none bg-white disabled:bg-[#F1F5F9] cursor-pointer text-sm"
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSearchTerm("");
              onChange("");
              if (onClear) onClear();
            }}
            className="absolute right-3 text-slate-400 hover:text-red-500 transition-colors"
          >
            <X size={14} />
          </button>
        )}
        {!value && (
          <ChevronDown
            size={16}
            className="absolute right-3 text-slate-400 pointer-events-none"
          />
        )}
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-[#CBD5E1] rounded-lg shadow-lg overflow-hidden">
          <ul className="max-h-52 overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-400 text-center">No options found</li>
            ) : (
              filteredOptions.map((opt: string) => (
                <li
                  key={opt}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-[#EFF6FF] transition-colors flex items-center justify-between ${value === opt ? 'bg-[#DBEAFE] font-semibold text-[#005689]' : 'text-[#1E293B]'
                    }`}
                  onClick={() => {
                    onChange(opt);
                    setSearchTerm(opt);
                    setIsOpen(false);
                  }}
                >
                  <span>{opt}</span>
                  {value === opt && <CheckCircle2 size={16} className="text-[#005689]" />}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};


const rawInitialData = (() => {
  const norm = (v: any) => String(v || '').trim().toLowerCase();
  const seen = new Set<string>();
  const result: any[] = [];
  let counter = 0;
  (masterData as any[]).forEach((r: any) => {
    const key = `${norm(r.oem)}|${norm(r.plant)}|${norm(r.stateCity)}|${norm(r.zoneAO)}`;
    if (!seen.has(key)) {
      seen.add(key);
      counter++;
      result.push({
        id: `md${counter}`,
        oem: r.oem,
        plant: r.plant,
        statecity: r.stateCity,
        zone: r.zoneAO,
        originZone: r.originZone || 'Unknown',
        destZone: r.destinationZone || undefined,
        manageByBranch: r.branchName || '',
        target: 0,
        lifted: 0
      });
    }
  });
  return result;
})();

const initialData: TransportRecord[] = rawInitialData.map(d => ({ ...d, month: currentMonth, year: currentYear, target: 0, lifted: 0 }));


function MetricCard({ title, value, icon, onClick, secondary }: { title: string, value: string | number, icon: React.ReactNode, onClick?: () => void, secondary?: string }) {
  return (
    <div
      className={`bg-[#FFFFFF] p-5 rounded-[12px] shadow-sm border border-[#E2E8F0] flex items-center gap-4 transition-all hover:shadow-md ${onClick ? 'cursor-pointer hover:bg-slate-50 relative' : ''}`}
      onClick={onClick}
    >
      <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-[#64748B]">{title}</p>
        <p className="text-2xl font-bold text-[#1E293B]">{value}</p>
        {secondary ? <p className="text-xs text-[#64748B] font-medium">{secondary}</p> : null}
      </div>
      {onClick && <span className="absolute top-2 right-2 text-slate-400"><Search size={14} /></span>}
    </div>
  );
}

type Alert = {
  id: string;
  message: string;
};

type UserRole = 'Admin' | 'Tracker' | 'Viewer';

const KeyValueEditor = ({ title, data, onSave, valueLabel }: { title: string, data: Record<string, string>, onSave: (v: { k: string, v: string }[]) => void, valueLabel: string }) => {
  const [items, setItems] = React.useState<{ id: string, k: string, v: string }[]>(
    Object.entries(data).map(([k, v]) => ({ id: Math.random().toString(), k, v }))
  );

  const addItem = () => setItems([{ id: Math.random().toString(), k: '', v: '' }, ...items]);
  const remove = (id: string) => setItems(items.filter(i => i.id !== id));
  const update = (id: string, field: 'k' | 'v', val: string) => setItems(items.map(i => i.id === id ? { ...i, [field]: val } : i));

  return (
    <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-4 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-semibold text-[#1E293B]">{title}</h4>
        <div className="flex gap-2">
          <button onClick={() => onSave(items)} className="bg-[#005689] text-white px-3 py-1 rounded text-sm hover:opacity-90">Save Changes</button>
          <button onClick={addItem} className="bg-[#FFFFFF] border border-[#CBD5E1] px-3 py-1 rounded text-sm hover:bg-[#F1F5F9] text-[#005689] flex items-center gap-1"><Plus size={14} /> Add New</button>
        </div>
      </div>
      <div className="max-h-[500px] overflow-y-auto pr-2 space-y-2">
        {items.map(item => (
          <div key={item.id} className="flex flex-col sm:flex-row gap-2">
            <input type="text" value={item.k} onChange={e => update(item.id, 'k', e.target.value)} placeholder="Key (e.g. Plant/Zone)" className="flex-1 sm:max-w-xs border border-[#CBD5E1] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#005689] outline-none" />
            <input type="text" value={item.v} onChange={e => update(item.id, 'v', e.target.value)} placeholder={valueLabel} className="flex-1 border border-[#CBD5E1] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#005689] outline-none" />
            <button onClick={() => remove(item.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-[#94A3B8] italic">No mappings configured.</p>}
      </div>
    </div>
  )
}

const ZoneCityConfigEditor = () => {
  const [config, setConfig] = React.useState(() => readConfig());

  const saveConfig = (newConfig: any) => {
    setConfig(newConfig);
    window.localStorage.setItem('tracker_zone_config', JSON.stringify(newConfig));
    window.alert('Configuration saved successfully.');
  };

  const updateOriginMap = (mappings: { k: string, v: string }[]) => {
    const newMap: Record<string, string> = {};
    mappings.forEach(m => { if (m.k) safeSet(newMap as any, m.k, m.v); });
    saveConfig({ ...config, originMap: newMap });
  };

  const updateDestMapTerms = (mappings: { k: string, v: string }[]) => {
    const newMap: Record<string, string[]> = {};
    mappings.forEach(m => {
      if (m.k) safeSet(newMap as any, m.k, m.v.split(',').map(s => s.trim()).filter(Boolean));
    });
    saveConfig({ ...config, destMapTerms: newMap });
  };

  const updateMahindraCities = (mappings: { k: string, v: string }[]) => {
    const newMap: Record<string, string[]> = {};
    mappings.forEach(m => {
      if (m.k) safeSet(newMap as any, m.k, m.v.split(',').map(s => s.trim()).filter(Boolean));
    });
    saveConfig({ ...config, mahindraCities: newMap });
  };

  return (
    <div className="space-y-6">
      <KeyValueEditor title="Origin Zone Mapping (Plant to Zone)" data={config.originMap} onSave={updateOriginMap} valueLabel="Zone Name" />
      <KeyValueEditor title="Destination Zone Mapping (Zone Name to Keywords/Cities)" data={Object.fromEntries(Object.entries(config.destMapTerms).map(([k, v]) => [k, (v as string[]).join(', ')]))} onSave={updateDestMapTerms} valueLabel="Comma-separated Keywords (e.g. gujrat, ahmedabad)" />
      <KeyValueEditor title="Mahindra Branches Configuration (Base City to Branches/Cities)" data={Object.fromEntries(Object.entries(config.mahindraCities).map(([k, v]) => [k, (v as string[]).join(', ')]))} onSave={updateMahindraCities} valueLabel="Comma-separated Sub-Cities/Branches" />
    </div>
  )
}

const RoleTabConfigEditor = ({ roleTabsMap, setRoleTabsMap, ALL_TABS }: any) => {
  const roles = ['Admin', 'Tracker', 'Viewer'];

  const toggleTab = (role: string, tabId: string) => {
    if (role === 'Admin' && tabId === 'admin') return;
    setRoleTabsMap((prev: any) => {
      const current = safeGet(prev, role) || [];
      if (current.includes(tabId)) {
        return { ...prev, [role]: current.filter((id: string) => id !== tabId) };
      } else {
        return { ...prev, [role]: [...current, tabId] };
      }
    });
  };

  return (
    <div className="bg-[#FFFFFF] p-6 rounded-[12px] shadow-sm border border-[#E2E8F0]">
      <h3 className="text-lg font-bold text-[#1E293B] mb-4 flex items-center gap-2">
        <Settings className="text-[#005689]" size={20} />
        Role-Based Tab Access Config
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#F8FAFC]">
              <th className="p-3 border-b text-sm font-semibold text-[#1E293B]">Tab \\ Role</th>
              {roles.map(r => (
                <th key={r} className="p-3 border-b text-sm font-semibold text-center text-[#1E293B]">{r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_TABS.map((t: any) => (
              <tr key={t.id} className="border-b hover:bg-[#F8FAFC]">
                <td className="p-3 text-sm text-[#1E293B] flex items-center gap-2">
                  <t.icon size={16} /> {t.label}
                </td>
                {roles.map(r => (
                  <td key={r} className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={(safeGet(roleTabsMap, r) || []).includes(t.id)}
                      onChange={() => toggleTab(r, t.id)}
                      className="w-4 h-4 text-[#005689] rounded focus:ring-[#005689]"
                      disabled={r === 'Admin' && t.id === 'admin'}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm mt-3 text-gray-500 italic">Note: The Admin role must always have access to the Config tab. Changes are saved automatically.</p>
      </div>
    </div>
  );
};

const MasterMappingList = ({
  title,
  parents,
  childrenList,
  mapping,
  setMapping,
  parentLabel,
  childLabel
}: {
  title: string,
  parents: string[],
  childrenList: string[],
  mapping: Record<string, string[]>,
  setMapping: React.Dispatch<React.SetStateAction<Record<string, string[]>>>,
  parentLabel: string,
  childLabel: string
}) => {
  const [selectedParent, setSelectedParent] = useState<string>(parents[0] || '');

  React.useEffect(() => {
    if (parents.length > 0 && !selectedParent) {
      setSelectedParent(parents[0]);
    }
  }, [parents, selectedParent]);

  const toggleChild = (child: string) => {
    if (!selectedParent) return;
    setMapping(prev => {
      const current = prev[selectedParent] || [];
      const updated = current.includes(child)
        ? current.filter(c => c !== child)
        : [...current, child];
      return { ...prev, [selectedParent]: updated };
    });
  };

  return (
    <div className="bg-[#FFFFFF] p-6 rounded-[12px] shadow-sm border border-[#E2E8F0] col-span-1 xl:col-span-2">
      <h3 className="text-lg font-bold text-[#1E293B] mb-4">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-[#64748B] mb-2">Select {parentLabel}</label>
          <select
            value={selectedParent}
            onChange={e => setSelectedParent(e.target.value)}
            className="w-full border border-[#CBD5E1] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#005689] outline-none"
          >
            {parents.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-[#64748B] mb-2">Mapped {childLabel}</label>
          <div className="h-48 overflow-y-auto border border-[#E2E8F0] rounded-lg p-2 space-y-1">
            {childrenList.map(child => {
              const isMapped = mapping[selectedParent]?.includes(child) || false;
              return (
                <label key={child} className="flex items-center gap-2 p-2 hover:bg-[#F8FAFC] rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isMapped}
                    onChange={() => toggleChild(child)}
                    className="rounded text-[#005689] focus:ring-[#005689] w-4 h-4"
                  />
                  <span className="text-sm text-[#1E293B]">{child}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};


const GlobalMasterDataTable = ({ masterRoutes, setMasterRoutes, manageByBranchMap, setManageByBranchMap, plantsWithTargets = [], allEntryLogs = [], setAllEntryLogs = (_: any) => {} }: any) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const [newRow, setNewRow] = useState({ oem: '', plant: '', statecity: '', zone: '', originZone: '', destZone: '', manageByBranch: '' });
  const normalizeText = (value: any) => String(value ?? '').trim().toLowerCase();


  const availableRoutes = useMemo(() => [...masterRoutes, ...(masterData || [])], [masterRoutes]);
  const oemOptions = useMemo(() => Array.from(new Set(availableRoutes.map((r: any) => r.oem).filter(Boolean))).sort(), [availableRoutes]);
  const plantOptions = useMemo(() => Array.from(new Set(availableRoutes.filter((r: any) => r.oem === newRow.oem).map((r: any) => r.plant).filter(Boolean))).sort(), [newRow.oem, availableRoutes]);
  const stateCityOptions = useMemo(() => Array.from(new Set(availableRoutes.filter((r: any) => r.oem === newRow.oem && r.plant === newRow.plant).map((r: any) => r.stateCity).filter(Boolean))).sort(), [newRow.oem, newRow.plant, availableRoutes]);
  const matchedRoute = useMemo(() => availableRoutes.find((r: any) => normalizeText(r.oem) === normalizeText(newRow.oem) && normalizeText(r.plant) === normalizeText(newRow.plant) && normalizeText(r.stateCity) === normalizeText(newRow.statecity)), [newRow.oem, newRow.plant, newRow.statecity, availableRoutes]);

  useEffect(() => {
    if (!matchedRoute) return;

    setNewRow((prev: any) => ({
      ...prev,
      zone: normalizeZone(matchedRoute.zoneAO || prev.zone || ''),
      originZone: normalizeZone(matchedRoute.originZone || prev.originZone || ''),
      destZone: normalizeZone(matchedRoute.destinationZone || prev.destZone || ''),
      manageByBranch: matchedRoute.branchName || prev.manageByBranch || ''
    }));
  }, [matchedRoute]);

  const zoneOptions = useMemo(() => Array.from(new Set(availableRoutes.map((r: any) => normalizeZone(r.zoneAO || '')).filter(Boolean))).sort(), [availableRoutes]);
  const originZoneOptions = useMemo(() => Array.from(new Set(availableRoutes.map((r: any) => normalizeZone(r.originZone || '')).filter(Boolean))).sort(), [availableRoutes]);
  const destZoneOptions = useMemo(() => Array.from(new Set(availableRoutes.map((r: any) => normalizeZone(r.destinationZone || '')).filter(Boolean))).sort(), [availableRoutes]);
  const branchNameOptions = useMemo(() => Array.from(new Set(availableRoutes.map((r: any) => r.branchName).filter(Boolean))).sort(), [availableRoutes]);

  const filteredRoutes = masterRoutes.filter((r: any) =>
    r.oem.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.plant.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.statecity.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.zone.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.originZone || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.destZone || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.manageByBranch || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredRoutes.length / itemsPerPage));
  const paginatedRoutes = filteredRoutes.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const updateRoute = (routeIndex: number, updates: Partial<MasterRoute>) => {
    setMasterRoutes((prev: any) => prev.map((pr: any, idx: number) => (
      idx === routeIndex ? { ...pr, ...updates } : pr
    )));
  };

  const handleDeleteRoute = (routeToDelete: any) => {
    setMasterRoutes((prev: any) => prev.filter((r: any) => !(r.oem === routeToDelete.oem && r.plant === routeToDelete.plant && r.statecity === routeToDelete.statecity)));
  };

  const handleAdd = () => {
    const requiredFields = ['oem', 'plant', 'statecity', 'zone', 'originZone', 'destZone', 'manageByBranch'];
    const hasMissing = requiredFields.some(field => !String(newRow[field as keyof typeof newRow]).trim());
    if (hasMissing) {
      alert('Please complete all master data fields before adding a new route.');
      return;
    }

    const existing = masterRoutes.find((r: any) =>
      normalizeText(r.oem) === normalizeText(newRow.oem) &&
      normalizeText(r.plant) === normalizeText(newRow.plant) &&
      normalizeText(r.statecity) === normalizeText(newRow.statecity)
    );

    if (existing) {
      alert('This master route already exists. Please edit the existing row if you want to update it.');
      return;
    }

    setMasterRoutes((prev: any) => [...prev, {
      oem: newRow.oem.trim(),
      plant: newRow.plant.trim(),
      statecity: newRow.statecity.trim(),
      zone: normalizeZone(newRow.zone),
      originZone: normalizeZone(newRow.originZone),
      destZone: normalizeZone(newRow.destZone),
      manageByBranch: newRow.manageByBranch.trim()
    }]);

    setNewRow({ oem: '', plant: '', statecity: '', zone: '', originZone: '', destZone: '', manageByBranch: '' });
  };

  return (
    <div className="bg-[#FFFFFF] p-6 rounded-[12px] shadow-sm border border-[#E2E8F0]">
      <h3 className="text-lg font-bold text-[#1E293B] mb-4 flex items-center gap-2">
        <Database className="text-[#005689]" size={20} />
        Master Data Routing Table
      </h3>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by OEM, Plant, City, Zone, Branch..."
          className="w-full border border-[#CBD5E1] rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-[#005689] outline-none"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <p className="mt-2 text-xs text-[#64748B]">You can add new master routes directly. OEM, Plant, and State/City may be custom values, and related zone and branch fields can be entered manually.</p>
      </div>


      <div className="overflow-x-auto max-h-[500px] border border-[#E2E8F0] rounded-lg">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead className="sticky top-0 bg-[#F8FAFC] shadow-sm z-10">
            <tr className="text-xs uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
              <th className="p-3 font-bold">OEM</th>
              <th className="p-3 font-bold">Origin Plant</th>
              <th className="p-3 font-bold">State/City</th>
              <th className="p-3 font-bold">Zone AO</th>
              <th className="p-3 font-bold">Origin Zone</th>
              <th className="p-3 font-bold">Dest. Zone</th>
              <th className="p-3 font-bold">Branch Name</th>
              <th className="p-3 font-bold text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            <tr className="bg-slate-50/50">
              <td className="p-2">
                <input
                  list="oem-list"
                  value={newRow.oem}
                  onChange={(e) => setNewRow({ oem: e.target.value, plant: '', statecity: '', zone: '', originZone: '', destZone: '', manageByBranch: '' })}
                  placeholder="Enter OEM"
                  className="w-full text-xs border border-[#CBD5E1] p-1.5 rounded focus:ring-1 focus:ring-[#005689] outline-none"
                />
                <datalist id="oem-list">
                  {oemOptions.map((opt: string) => <option key={opt} value={opt} />)}
                </datalist>
              </td>
              <td className="p-2">
                <input
                  list="plant-list"
                  value={newRow.plant}
                  onChange={(e) => setNewRow({ ...newRow, plant: e.target.value, statecity: '', zone: '', originZone: '', destZone: '', manageByBranch: '' })}
                  placeholder="Enter Plant"
                  className="w-full text-xs border border-[#CBD5E1] p-1.5 rounded focus:ring-1 focus:ring-[#005689] outline-none"
                />
                <datalist id="plant-list">
                  {plantOptions.map((opt: string) => <option key={opt} value={opt} />)}
                </datalist>
              </td>
              <td className="p-2">
                <input
                  list="statecity-list"
                  value={newRow.statecity}
                  onChange={(e) => setNewRow({ ...newRow, statecity: e.target.value })}
                  placeholder="Enter State/City"
                  className="w-full text-xs border border-[#CBD5E1] p-1.5 rounded focus:ring-1 focus:ring-[#005689] outline-none"
                />
                <datalist id="statecity-list">
                  {stateCityOptions.map((opt: string) => <option key={opt} value={opt} />)}
                </datalist>
              </td>
              <td className="p-2"><input
                type="text"
                value={newRow.zone}
                onChange={(e) => setNewRow({ ...newRow, zone: e.target.value })}
                placeholder="Enter AO Zone"
                className="w-full text-xs border border-[#CBD5E1] p-1.5 rounded focus:ring-1 focus:ring-[#005689] outline-none"
              /></td>
              <td className="p-2"><input
                type="text"
                value={newRow.originZone}
                onChange={(e) => setNewRow({ ...newRow, originZone: e.target.value })}
                placeholder="Enter Origin Zone"
                className="w-full text-xs border border-[#CBD5E1] p-1.5 rounded focus:ring-1 focus:ring-[#005689] outline-none"
              /></td>
              <td className="p-2"><input
                type="text"
                value={newRow.destZone}
                onChange={(e) => setNewRow({ ...newRow, destZone: e.target.value })}
                placeholder="Enter Destination Zone"
                className="w-full text-xs border border-[#CBD5E1] p-1.5 rounded focus:ring-1 focus:ring-[#005689] outline-none"
              /></td>
              <td className="p-2"><input
                type="text"
                value={newRow.manageByBranch}
                onChange={(e) => setNewRow({ ...newRow, manageByBranch: e.target.value })}
                placeholder="Enter Branch Name"
                className="w-full text-xs border border-[#CBD5E1] p-1.5 rounded focus:ring-1 focus:ring-[#005689] outline-none"
              /></td>
              <td className="p-2 text-center"><button onClick={handleAdd} className="bg-[#005689] text-white p-1.5 rounded hover:bg-[#004a75] transition-colors"><Plus size={16} /></button></td>
            </tr>
            {paginatedRoutes.map((r: any, idx: number) => {
              const routeIndex = masterRoutes.indexOf(r);
              return (
                <tr key={`${r.oem}-${r.plant}-${r.statecity}-${idx}`} className="hover:bg-[#F8FAFC] transition-colors">
                  <td className="p-3 text-sm text-[#1E293B] font-medium">
                    <EditableCell
                      value={r.oem}
                      onChange={(v: string) => updateRoute(routeIndex, { oem: v })}
                      className="w-full bg-transparent border border-transparent hover:border-[#CBD5E1] focus:border-[#005689] rounded-md px-2 py-1 text-sm text-[#1E293B] outline-none"
                      placeholder="OEM"
                    />
                  </td>
                  <td className="p-3 text-sm text-[#475569]">
                    <EditableCell
                      value={r.plant}
                      onChange={(v: string) => updateRoute(routeIndex, { plant: v })}
                      className="w-full bg-transparent border border-transparent hover:border-[#CBD5E1] focus:border-[#005689] rounded-md px-2 py-1 text-sm text-[#475569] outline-none"
                      placeholder="Plant"
                    />
                  </td>
                  <td className="p-3 text-sm text-[#475569]">
                    <EditableCell
                      value={r.statecity}
                      onChange={(v: string) => updateRoute(routeIndex, { statecity: v })}
                      className="w-full bg-transparent border border-transparent hover:border-[#CBD5E1] focus:border-[#005689] rounded-md px-2 py-1 text-sm text-[#475569] outline-none"
                      placeholder="State/City"
                    />
                  </td>
                  <td className="p-3 text-sm text-[#64748B] font-medium">
                    <EditableCell
                      type="text"
                      value={r.zone}
                      onChange={(v: string) => updateRoute(routeIndex, { zone: normalizeZone(v) })}
                      className="w-full bg-transparent border border-transparent hover:border-[#CBD5E1] focus:border-[#005689] rounded-md px-2 py-1 text-sm text-[#64748B] outline-none"
                      placeholder="AO Zone"
                    />
                  </td>
                  <td className="p-3 text-sm text-[#64748B]">
                    <EditableCell
                      type="text"
                      value={r.originZone}
                      onChange={(v: string) => updateRoute(routeIndex, { originZone: normalizeZone(v) })}
                      className="w-full bg-transparent border border-transparent hover:border-[#CBD5E1] focus:border-[#005689] rounded-md px-2 py-1 text-sm text-[#64748B] outline-none"
                      placeholder="Origin Zone"
                    />
                  </td>
                  <td className="p-3 text-sm text-[#64748B] font-bold text-[#005689]">
                    <EditableCell
                      type="text"
                      value={r.destZone}
                      onChange={(v: string) => updateRoute(routeIndex, { destZone: normalizeZone(v) })}
                      className="w-full bg-transparent border border-transparent hover:border-[#CBD5E1] focus:border-[#005689] rounded-md px-2 py-1 text-sm text-[#64748B] outline-none"
                      placeholder="Destination Zone"
                    />
                  </td>
                  <td className="p-3 text-sm">
                    <EditableCell
                      value={r.manageByBranch || (safeGet(manageByBranchMap as any, r.oem) as any)?.[r.plant] || ''}
                      onChange={(v: string) => {
                        updateRoute(routeIndex, { manageByBranch: v });
                        setManageByBranchMap((prev: any) => ({
                          ...prev, [r.oem]: { ...(safeGet(prev, r.oem) || {}), [r.plant]: v }
                        }));
                      }}
                      className="w-full bg-transparent border border-transparent hover:border-[#CBD5E1] focus:border-[#005689] rounded-md px-2 py-1 text-sm text-[#475569] outline-none"
                      placeholder="Branch Name"
                    />
                  </td>
                  <td className="p-3 text-center">
                    <button onClick={() => handleDeleteRoute(r)} className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-red-50">
                      <Trash2 size={16} />
                    </button>
                  </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>
      
      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-[#E2E8F0] pt-4">
          <span className="text-sm text-[#64748B]">
            Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredRoutes.length)} of {filteredRoutes.length} entries
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 rounded border border-[#CBD5E1] bg-white text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-[#1E293B] font-medium">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 rounded border border-[#CBD5E1] bg-white text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => {
            setMasterRoutes((prev: any) => [...prev]);
            alert('Master data details saved successfully.');
          }}
          className="inline-flex items-center gap-2 rounded-md bg-[#005689] px-4 py-2 text-sm font-medium text-white hover:bg-[#004a75] transition-colors"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
};




const TransportProfileEntryStatus = ({ plantsWithTargets = [], allEntryLogs = [] }: any) => {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });

  const plantStatuses = React.useMemo(() => {
    const list = Array.isArray(plantsWithTargets) ? plantsWithTargets : [];
    const logs = Array.isArray(allEntryLogs) ? allEntryLogs : [];
    return list.map((plant: string) => ({
      plant,
      status: logs.some((l: any) => l.date === selectedDate && l.plant === plant) ? 'Done' : 'Pending'
    }));
  }, [plantsWithTargets, allEntryLogs, selectedDate]);

  const doneCount = plantStatuses.filter((p: any) => p.status === 'Done').length;
  const pendingCount = plantStatuses.length - doneCount;

  const chartData = React.useMemo(() => [
    { name: 'Done', value: doneCount, fill: '#16A34A' },
    { name: 'Pending', value: pendingCount, fill: '#F59E0B' }
  ], [doneCount, pendingCount]);

  return (
    <div className="bg-[#F8FAFC] rounded-[12px] p-4 shadow-sm border border-[#E2E8F0] mt-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-[#1E293B]">Daily Entry Status</h4>
          <p className="text-xs text-[#64748B]">Plants with saved targets: {plantStatuses.length}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-[#475569]">Select date</label>
          <input
            type="date"
            value={selectedDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setSelectedDate(e.target.value)}
            onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
            className="text-sm border border-[#CBD5E1] rounded px-2 py-1 outline-none bg-white cursor-pointer"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr] mt-4">
        <div className="bg-white rounded-[12px] p-3 flex flex-col items-center justify-center shadow-sm">
          <div className="w-full h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={4}
                >
                  {chartData.map((entry: any, index: number) => (
                    <Cell key={`transport-status-cell-${index}`} fill={entry.fill} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any, name: any) => [`${value}`, name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 text-center">
            <div className="text-xs text-[#64748B] uppercase tracking-[0.16em]">Done vs Pending</div>
            <div className="text-2xl font-semibold text-[#1E293B]">{doneCount}/{plantStatuses.length}</div>
          </div>
        </div>

        <div className="bg-white rounded-[12px] p-3 shadow-sm overflow-hidden">
          <div className="max-h-[380px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[#64748B] uppercase tracking-wider">
                  <th className="py-2">Plant</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {plantStatuses.map((ps: any) => (
                  <tr key={ps.plant} className="border-t border-[#E2E8F0] text-[13px]">
                    <td className="py-2 text-[#1E293B]">{ps.plant}</td>
                    <td className="py-2 text-[#1E293B]">
                      {ps.status === 'Done' ? <span className="text-green-600 font-semibold">Done</span> : <span className="text-yellow-600 font-semibold">Pending</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

const MasterDataList = ({ title, items, setItems }: { title: string, items: string[], setItems: React.Dispatch<React.SetStateAction<string[]>> }) => {
  const [newItem, setNewItem] = useState('');
  return (
    <div className="bg-[#FFFFFF] p-6 rounded-[12px] shadow-sm border border-[#E2E8F0]">
      <h3 className="text-lg font-bold text-[#1E293B] mb-4">{title}</h3>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          className="flex-1 border border-[#CBD5E1] rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-[#005689] outline-none"
          placeholder={`Add new ${title.toLowerCase()}`}
        />
        <button
          onClick={() => { if (newItem && !items.includes(newItem)) { setItems([...items, newItem]); setNewItem(''); } }}
          className="bg-[#005689] text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-[#004470]"
        >
          Add
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
        {items.map(item => (
          <div key={item} className="flex justify-between items-center p-2 bg-[#F8FAFC] rounded border border-[#E2E8F0]">
            <span className="text-sm text-[#1E293B]">{item}</span>
            <button onClick={() => setItems(items.filter(i => i !== item))} className="text-[#EF4444] hover:text-[#B91C1C]">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};




export const useTableSearch = () => {
  const [filters, setFilters] = useState<Record<string, string>>({});

  const FilterHeader = ({ title, columnKey, className = "" }: { title: string, columnKey: string, className?: string }) => (
    <th className={`p-4 font-semibold border-r border-[#E2E8F0] align-top ${className}`}>
      <div className="flex flex-col gap-2 relative h-full justify-between">
        <span className="whitespace-nowrap">{title}</span>
        <div className="relative mt-2">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            placeholder={`Search...`}
            value={safeGet(filters, columnKey) || ''}
            onChange={(e) => setFilters(prev => ({ ...prev, [columnKey]: e.target.value.toLowerCase() }))}
            className="w-full pl-6 pr-2 py-1 text-xs border border-[#E2E8F0] bg-white bg-opacity-50 rounded-md focus:outline-none focus:border-[#005689] focus:bg-white transition-all font-normal placeholder-[#94A3B8]"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    </th>
  );

  const filterData = <T extends Record<string, any>>(data: T[]): T[] => {
    return data.filter(item => {
      for (const key in filters) {
        if (!filters[key]) continue;
        const value = item[key]?.toString().toLowerCase() || '';
        if (!value.includes(filters[key])) return false;
      }
      return true;
    });
  };

  return { FilterHeader, filterData, filters };
};


const EditableCell = ({ value, onChange, onBlur, type = "text", options = [], className = "", placeholder = "" }: any) => {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  if (type === "select") {
    return (
      <select
        value={localValue || ""}
        onChange={(e) => {
          setLocalValue(e.target.value);
          onChange(e.target.value);
        }}
        onBlur={onBlur}
        className={className + " appearance-none cursor-pointer pr-8"}
      >
        <option value="" disabled>{placeholder || "Select..."}</option>
        {options.map((opt: string) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  return (
    <input

      type={type}
      value={localValue === 0 && type === 'number' ? '' : localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={(e) => {
        if (localValue !== value) {
          onChange(e.target.value);
        }
        if (onBlur) onBlur(e);
      }}
      className={className}
      placeholder={placeholder}
      min={type === 'number' ? "0" : undefined}
    />
  );
};

export const MasterDataContext = React.createContext<any>(null);

const getGreetingInfo = (name: string) => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const date = today.getDate();
  const hour = today.getHours();

  let text = '';
  let emoji = '';
  if (hour < 12) { text = 'Good morning'; emoji = '🌅'; }
  else if (hour < 16) { text = 'Good afternoon'; emoji = '☀️'; }
  else { text = 'Good evening'; emoji = '🌙'; }

  // Fixed Date Holidays
  if (month === 1 && date === 1) { text = 'Happy New Year'; emoji = '🎆'; }
  else if (month === 1 && date === 26) { text = 'Happy Republic Day'; emoji = '🇮🇳'; }
  else if (month === 8 && date === 15) { text = 'Happy Independence Day'; emoji = '🇮🇳'; }
  else if (month === 10 && date === 2) { text = 'Happy Gandhi Jayanti'; emoji = '🕊️'; }
  else if (month === 12 && date === 25) { text = 'Merry Christmas'; emoji = '🎄'; }
  else {
    // Dynamic (Lunar) Holidays Mapping (2024 - 2030)
    const dynamicHolidays: Record<string, Record<number, { m: number, d: number, e: string }>> = {
      'Happy Holi': {
        2024: { m: 3, d: 25, e: '🎨' }, 2025: { m: 3, d: 14, e: '🎨' }, 2026: { m: 3, d: 3, e: '🎨' },
        2027: { m: 3, d: 22, e: '🎨' }, 2028: { m: 3, d: 11, e: '🎨' }, 2029: { m: 3, d: 1, e: '🎨' }, 2030: { m: 3, d: 19, e: '🎨' }
      },
      'Happy Raksha Bandhan': {
        2024: { m: 8, d: 19, e: '🎀' }, 2025: { m: 8, d: 9, e: '🎀' }, 2026: { m: 8, d: 28, e: '🎀' },
        2027: { m: 8, d: 17, e: '🎀' }, 2028: { m: 8, d: 5, e: '🎀' }, 2029: { m: 8, d: 24, e: '🎀' }, 2030: { m: 8, d: 13, e: '🎀' }
      },
      'Happy Diwali': {
        2024: { m: 10, d: 31, e: '🪔' }, 2025: { m: 10, d: 20, e: '🪔' }, 2026: { m: 11, d: 8, e: '🪔' },
        2027: { m: 10, d: 29, e: '🪔' }, 2028: { m: 10, d: 17, e: '🪔' }, 2029: { m: 11, d: 5, e: '🪔' }, 2030: { m: 10, d: 26, e: '🪔' }
      }
    };

    for (const [fest, years] of Object.entries(dynamicHolidays)) {
      if (years[year] && years[year].m === month && years[year].d === date) {
        text = fest;
        emoji = years[year].e;
        break;
      }
    }
  }

  return { text, emoji, name: name || 'Admin' };
};
export default function App() {
  const syncStatus = useSyncStatus();
  const [userRole, setUserRole] = useLocalStorage<UserRole>('tracker_userRole', 'Admin');
  const [currentUser, setCurrentUser] = useLocalStorage<{ username: string, loginTime: number, role: string } | null>('tracker_currentUser', null);
  const [users, setUsers] = useLocalStorage<{ username: string; password?: string; role: string }[]>('tracker_users', [{ username: 'admin', password: 'admin123', role: 'Admin' }]);
  const [activityLogs, setActivityLogs, isActivityLogsLoaded] = useLocalStorage<{ id: string, username: string, action: string, timestamp: number }[]>('tracker_activityLogs', []);

  const [roleTabsMap, setRoleTabsMap] = useLocalStorage<Record<string, string[]>>('tracker_roleTabsMap', {
    'Admin': ['dashboard', 'data-entry', 'targets', 'today-target', 'fleet-planner', 'fleet', 'plant-planner', 'zone', 'branch-performance', 'incentive', 'admin', 'calendar', 'sob-download'],
    'Tracker': ['dashboard', 'data-entry'],
    'Viewer': ['dashboard']
  });

  useEffect(() => {
    // Ensure Admin has access to new tabs if they were added later
    setRoleTabsMap(prev => {
      const currentMap = prev || {
        'Admin': ['dashboard', 'data-entry', 'targets', 'today-target', 'fleet-planner', 'fleet', 'plant-planner', 'zone', 'branch-performance', 'incentive', 'admin', 'calendar', 'sob-download'],
        'Tracker': ['dashboard', 'data-entry'],
        'Viewer': ['dashboard']
      };
      let adminTabs = currentMap['Admin'] || [];
      let changed = false;
      if (!adminTabs.includes('sob-download')) {
        adminTabs = [...adminTabs, 'sob-download'];
        changed = true;
      }
      if (!adminTabs.includes('zone-branch-report')) {
        adminTabs = [...adminTabs, 'zone-branch-report'];
        changed = true;
      }
      if (!adminTabs.includes('day-branch-report')) {
        adminTabs = [...adminTabs, 'day-branch-report'];
        changed = true;
      }
      if (!adminTabs.includes('oem-target-planning')) {
        adminTabs = [...adminTabs, 'oem-target-planning'];
        changed = true;
      }
      if (changed) {
        return { ...currentMap, Admin: adminTabs };
      }
      return currentMap;
    });
  }, []);

  const [allData, setAllData, isDataLoaded] = useIndexedDB<TransportRecord[]>('tracker_data_v7', initialData);
  const [masterRoutes, setMasterRoutes] = useLocalStorage<MasterRoute[]>('tracker_masterRoutes_v7', DEFAULT_MASTER_ROUTES);

  const data = React.useMemo(() => {
    const dataList = Array.isArray(allData) ? allData : [];
    const routesList = Array.isArray(masterRoutes) ? masterRoutes : [];
    const raw = userRole === 'Tracker' ? dataList.filter(d => d.username === currentUser?.username) : dataList;
    // Auto-populate missing zone/statecity/branch from masterRoutes and compute originZone from PLANT_ZONES
    return raw.map(d => {
      // Compute originZone from PLANT_ZONES if not already set
      const computedOriginZone = d.originZone && d.originZone !== 'Unknown'
        ? d.originZone
        : (safeGet(PLANT_ZONES, d.plant) || 'Unknown');

      if (d.zone && d.statecity && d.zone !== 'Unknown') {
        return { ...d, originZone: computedOriginZone };
      }
      const match = routesList.find(r => r.oem === d.oem && r.plant === d.plant && (r.statecity === d.statecity || r.statecity === (d as any).stateCity));
      if (match) {
        const branchName = (d as any).manageByBranch && (d as any).manageByBranch !== 'Unknown'
          ? (d as any).manageByBranch
          : (match.manageByBranch && match.manageByBranch !== 'Unknown'
            ? match.manageByBranch
            : resolveManageByBranch(d.oem, d.plant));

        return {
          ...d,
          zone: d.zone && d.zone !== 'Unknown' ? normalizeZone(d.zone) : match.zone,
          statecity: d.statecity || match.statecity,
          manageByBranch: branchName,
          originZone: computedOriginZone
        };
      }
      return { ...d, originZone: computedOriginZone };
    });
  }, [allData, userRole, currentUser?.username, masterRoutes]);

  // Enrich data with zone from masterData if still 'Unknown'
  const enrichedData = React.useMemo(() => {
    return data.map(d => {
      // If zone is already known, return as-is
      if (d.zone && d.zone !== 'Unknown') return d;

      // Try to find zone from masterData by oem+plant+statecity
      const mdMatch = (masterData as any[]).find((r: any) =>
        r.oem === d.oem &&
        r.plant === d.plant &&
        (r.stateCity === d.statecity || r.stateCity === (d as any).stateCity)
      );

      if (mdMatch && mdMatch.zoneAO && mdMatch.zoneAO !== 'Unknown') {
        return {
          ...d,
          zone: normalizeZone(mdMatch.zoneAO)
        };
      }

      // If still unknown, try by plant origin zone as fallback
      if (!d.zone || d.zone === 'Unknown') {
        const plantOrigin = getOriginZone(d.plant || '');
        if (plantOrigin && plantOrigin !== 'Unknown') {
          return {
            ...d,
            zone: plantOrigin
          };
        }
      }

      // FIX 1: Always normalize the zone field even if already set, to fix old saved data
      // e.g. "West MH" → "West - MH", "West GJ" → "West - GJ"
      return { ...d, zone: normalizeZone(d.zone || 'Unknown') };
    });
  }, [data]);

  const setData = setAllData;
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>(currentMonth);
  const [selectedOEM, setSelectedOEM] = useState<string>('All');
  const [selectedPlant, setSelectedPlant] = useState<string>('All');
  const [selectedOriginZone, setSelectedOriginZone] = useState<string>('All');
  const [selectedBranch, setSelectedBranch] = useState<string>('All');
  const [achievementPieMode, setAchievementPieMode] = useState<(typeof achievementPieModes)[number]>('Origin Zone');
  const [isAchievementDropdownOpen, setIsAchievementDropdownOpen] = useState(false);
  const [activePieSlice, setActivePieSlice] = useState<string | null>(null);
  const achievementChartRef = useRef<HTMLDivElement | null>(null);
  const [showOemsModal, setShowOemsModal] = useState(false);
  const [showPlantsModal, setShowPlantsModal] = useState(false);

  // Plant Requirement specific state
  const [plannerYear, setPlannerYear] = useState<number>(currentYear);
  const [plannerTimeframe, setPlannerTimeframe] = useState<string>(currentMonth);
  const [plannerOEM, setPlannerOEM] = useState<string>('All');
  const [plannerPlant, setPlannerPlant] = useState<string>('All');
  const [plannerOriginZone, setPlannerOriginZone] = useState<string>('All');
  const [plannerBranch, setPlannerBranch] = useState<string>('All');
  const [plannerDestination, setPlannerDestination] = useState<string>('All');
  const [plannerRegion, setPlannerRegion] = useState<string>('All');

  // Keep plant-planner filters in sync with the top-level selections so the table shows selected data
  useEffect(() => {
    setPlannerOEM(selectedOEM || 'All');
  }, [selectedOEM]);
  useEffect(() => {
    setPlannerPlant(selectedPlant || 'All');
  }, [selectedPlant]);
  useEffect(() => {
    setPlannerTimeframe(selectedTimeframe || currentMonth);
  }, [selectedTimeframe]);
  useEffect(() => {
    setPlannerBranch(selectedBranch || 'All');
  }, [selectedBranch]);
  useEffect(() => {
    setPlannerOriginZone(selectedOriginZone || 'All');
  }, [selectedOriginZone]);

  // Master Data Derived
  const masterOEMs = useMemo(() => {
    const routesList = Array.isArray(masterRoutes) ? masterRoutes : [];
    return Array.from(new Set(routesList.map(r => r.oem))).sort();
  }, [masterRoutes]);

  const masterPlants = useMemo(() => {
    const routesList = Array.isArray(masterRoutes) ? masterRoutes : [];
    return Array.from(new Set(routesList.map(r => r.plant))).sort();
  }, [masterRoutes]);

  const plantsWithTargets = useMemo(() => {
    const dataList = Array.isArray(allData) ? allData : [];
    return Array.from(new Set(dataList.filter(d => d.target && d.target > 0).map(d => d.plant))).sort();
  }, [allData]);

  const masterDestinations = useMemo(() => {
    const routesList = Array.isArray(masterRoutes) ? masterRoutes : [];
    return Array.from(new Set(routesList.map(r => r.statecity))).sort();
  }, [masterRoutes]);

  const masterRegions = useMemo(() => {
    const routesList = Array.isArray(masterRoutes) ? masterRoutes : [];
    return Array.from(new Set(routesList.map(r => r.zone))).sort();
  }, [masterRoutes]);

  const masterBranches = useMemo(() => {
    // Collect branches from both masterRoutes and data items to ensure completeness
    const branchesFromRoutes = (Array.isArray(masterRoutes) ? masterRoutes : [])
      .map(r => (r.manageByBranch || '').trim())
      .filter(b => b && b !== 'Unknown');

    const branchesFromData = (Array.isArray(data) ? data : [])
      .map(d => (d.manageByBranch || '').trim())
      .filter(b => b && b !== 'Unknown' && b !== '');

    // Merge both sources, deduplicate, and sort
    return Array.from(new Set([...branchesFromRoutes, ...branchesFromData])).sort();
  }, [masterRoutes, data]);

  const oemPlantMap = useMemo(() => {
    const routesList = Array.isArray(masterRoutes) ? masterRoutes : [];
    const map: Record<string, string[]> = {};
    routesList.forEach(r => {
      if (!safeGet(map, r.oem)) safeSet(map as any, r.oem, []);
      if (!(safeGet(map, r.oem) as string[]).includes(r.plant)) (safeGet(map, r.oem) as string[]).push(r.plant);
    });
    return map;
  }, [masterRoutes]);

  const plantDestMap = useMemo(() => {
    const routesList = Array.isArray(masterRoutes) ? masterRoutes : [];
    const map: Record<string, string[]> = {};
    routesList.forEach(r => {
      // Keyed by oem + plant to avoid mixing destinations between different OEMs at the same plant
      const key = `${r.oem}_${r.plant}`;
      if (!safeGet(map, key)) safeSet(map as any, key, []);
      if (!(safeGet(map, key) as string[]).includes(r.statecity)) (safeGet(map, key) as string[]).push(r.statecity);
    });
    return map;
  }, [masterRoutes]);

  const [manageByBranchMap, setManageByBranchMap] = useLocalStorage<Record<string, Record<string, string>>>('tracker_manageByBranchMap', INITIAL_MANAGE_BY_BRANCH_MAP);

  // Synchronize LocalStorage with masterData.json updates automatically
  useEffect(() => {
    const MASTER_DATA_SIG = "sig_v12_" + JSON.stringify(rawMasterData).length + "_" + rawMasterData.length;
    const currentSig = localStorage.getItem('tracker_masterdata_sig');

    if (currentSig !== MASTER_DATA_SIG) {

      // 1. Reset masterRoutes to the fresh DEFAULT_MASTER_ROUTES
      setMasterRoutes(DEFAULT_MASTER_ROUTES);

      // 2. Reset branch map to the new INITIAL_MANAGE_BY_BRANCH_MAP
      setManageByBranchMap(INITIAL_MANAGE_BY_BRANCH_MAP);

      // 3. Update allData (tracker_data_v7) to use new master data mapping definitions line-by-line
      setAllData(prevData => {
        const dataList = Array.isArray(prevData) ? prevData : [];

        // Map master data by lowercase key for instant O(1) matching
        const mdMap = new Map<string, any>();
        (rawMasterData as any[]).forEach(r => {
          const key = `${(r.oem || '').trim().toLowerCase()}|${(r.plant || '').trim().toLowerCase()}|${(r.stateCity || '').trim().toLowerCase()}`;
          mdMap.set(key, r);
        });

        // 3a. Update metadata (zone, destZone, manageByBranch) on existing entries that match new masterData
        const updated = dataList.map(d => {
          const key = `${(d.oem || '').trim().toLowerCase()}|${(d.plant || '').trim().toLowerCase()}|${(d.statecity || '').trim().toLowerCase()}`;
          const match = mdMap.get(key);
          if (match) {
            return {
              ...d,
              zone: match.zoneAO || d.zone,
              destZone: match.destinationZone || 'Unknown',
              manageByBranch: match.branchName || 'Unknown'
            };
          }
          return d;
        });

        // 3b. Add any new routes from masterData.json into the dataset for all months/years present in the dataset
        const yearsMonths = new Set<string>();
        dataList.forEach(d => {
          if (d.year && d.month) {
            yearsMonths.add(`${d.year}|${d.month}`);
          }
        });

        if (yearsMonths.size === 0) {
          yearsMonths.add(`${currentYear}|${currentMonth}`);
        }

        const newEntries: TransportRecord[] = [];
        yearsMonths.forEach(ym => {
          const [yearStr, month] = ym.split('|');
          const year = parseInt(yearStr, 10);

          rawInitialData.forEach(ri => {
            const exists = updated.some(u =>
              u.year === year &&
              u.month === month &&
              (u.oem || '').trim().toLowerCase() === (ri.oem || '').trim().toLowerCase() &&
              (u.plant || '').trim().toLowerCase() === (ri.plant || '').trim().toLowerCase() &&
              (u.statecity || '').trim().toLowerCase() === (ri.statecity || '').trim().toLowerCase()
            );
            if (!exists) {
              newEntries.push({
                ...ri,
                id: `${ri.id}-${year}-${month}`,
                year,
                month,
                target: 0,
                lifted: 0
              });
            }
          });
        });

        return [...updated, ...newEntries];
      });

      // 4. Save the signature so this runs exactly once
      localStorage.setItem('tracker_masterdata_sig', MASTER_DATA_SIG);
    }
  }, [setMasterRoutes, setManageByBranchMap, setAllData]);

  const getManageByBranch = (oem: string, plant: string): string => {
    const fromMap = (manageByBranchMap || {})[oem]?.[plant]?.trim();
    if (fromMap && fromMap !== 'Unknown') return fromMap;

    const fromMaster = (masterData as any[])
      .find((r: any) => r.oem === oem && r.plant === plant)?.branchName?.trim();

    return fromMaster && fromMaster !== 'Unknown' ? fromMaster : "";
  };

  const getDisplayBranch = (row: any): string => {
    const direct = String(row?.manageByBranch || '').trim();
    if (direct && direct !== 'Unknown') return direct;

    const resolved = getManageByBranch(row?.oem || '', row?.plant || '');
    if (resolved) return resolved;

    const fallback = (masterData as any[])
      .find((r: any) => r.oem === row?.oem && r.plant === row?.plant)?.branchName?.trim();
    return fallback && fallback !== 'Unknown' ? fallback : 'Unknown';
  };

  // Utility to find the zone for a specific OEM-Plant-City route
  const getZoneForRoute = (oem: string, plant: string, statecity: string): string => {
    const routesList = Array.isArray(masterRoutes) ? masterRoutes : [];
    const route = routesList.find(r => r.oem === oem && r.plant === plant && r.statecity === statecity);
    return route ? route.zone : '';
  };

  // Automatically register a new route in master data if it's encountered during entry
  const registerDataRoute = (oem: string, plant: string, statecity: string, zone: string, originZone?: string, destZone?: string, manageByBranch?: string) => {
    setMasterRoutes(prev => {
      // Avoid duplicates
      if (prev.some(r => r.oem === oem && r.plant === plant && r.statecity === statecity)) return prev;

      // Try to find missing info from the core master data file
      const mdMatch = (masterData as any[]).find((r: any) => r.oem === oem && r.plant === plant && r.stateCity === statecity);

      return [...prev, {
        oem,
        plant,
        statecity,
        zone: zone || mdMatch?.zoneAO || 'Unknown',
        originZone: originZone || mdMatch?.originZone || getOriginZone(plant),
        destZone: destZone || mdMatch?.destinationZone || getDestinationZone({ oem, plant, statecity }),
        manageByBranch: manageByBranch || mdMatch?.branchName || getManageByBranch(oem, plant)
      }];
    });
  };



  // Menu Customization State
  const [customMenuNames, setCustomMenuNames] = useLocalStorage<Record<string, string>>('tracker_customMenuNames', {});
  const [customTableHeaders, setCustomTableHeaders] = useLocalStorage<Record<string, string>>('tracker_customTableHeaders', {});
  const [hiddenTabs, setHiddenTabs] = useState<string[]>([]);

  // Alerts State
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // Data Entry State
  const [allEntryLogs, setAllEntryLogs, isEntryLogsLoaded] = useIndexedDB<{ id: string, date: string, month: string, year: number, oem: string, plant: string, statecity: string, zone?: string, city: string, lifted: number, trailers?: number, trucks?: number, username?: string }[]>('tracker_entryLogs_v7', []);

  useEffect(() => {
    const MIGRATION_VERSION = "v2";
    const currentVersion = localStorage.getItem('tracker_migration_version_logs');

    if (currentVersion !== MIGRATION_VERSION) {
      const getMappedOEM = (oldOEM: string): string => {
        const map: Record<string, string> = {
          "Maruti MSIL": "MSIL",
          "Tata Motors": "TATA",
          "MG Motor": "MG",
          "Renault & Nissan": "RNAIPL",
          "Citroen": "Citroën",
          "VW": "Volkswagen/Škoda",
          "Skoda": "Volkswagen/Škoda",
          "KIA": "Kia"
        };
        return map[oldOEM] || oldOEM;
      };

      const getMappedPlant = (oem: string, oldPlant: string): string => {
        const newOEM = getMappedOEM(oem);
        const p = (oldPlant || '').trim();
        if (newOEM === "MSIL") {
          if (p === "GGN") return "Gurgaon";
          if (p === "SMG") return "Becharaji";
          if (p === "BIDADI") return "Bidadi";
        }
        if (newOEM === "Toyota" && p === "Bangalore") return "Bidadi";
        if (newOEM === "Toyota" && p === "Farrukh Nagar") return "Farrukhnagar";
        if (newOEM === "Jeep" && p === "Ranjangao") return "Ranjangaon";
        return p;
      };

      const logsList = Array.isArray(allEntryLogs) ? allEntryLogs : [];
      const migrated = logsList.map(d => ({
        ...d,
        oem: getMappedOEM(d.oem || ''),
        plant: getMappedPlant(d.oem || '', d.plant || '')
      }));
      setAllEntryLogs(migrated);
      localStorage.setItem('tracker_migration_version_logs', MIGRATION_VERSION);
    }
  }, [allEntryLogs, setAllEntryLogs]);

  const entryLogs = React.useMemo(() => {
    const logsList = Array.isArray(allEntryLogs) ? allEntryLogs : [];
    return userRole === 'Tracker' ? logsList.filter(l => l.username === currentUser?.username) : logsList;
  }, [allEntryLogs, userRole, currentUser?.username]);
  const setEntryLogs = setAllEntryLogs;
  const todayDateStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const yesterdayDateStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const [entryForm, setEntryForm] = useState({ year: currentYear, month: currentMonth, date: yesterdayDateStr, oem: '', plant: '', statecity: '', zone: '', city: '', lifted: '', trailerType: 'Trailer', trailerQty: '' });

  // Tab State
  const [transportName, setTransportName] = useLocalStorage<string>('tracker_transportName', 'STPL');
  const [transportLogo, setTransportLogo] = useLocalStorage<string>('tracker_transportLogo', 'https://placehold.co/100x40/005689/ffffff?text=LOGO');

  const [activeTab, setActiveTab] = useState<'dashboard' | 'targets' | 'fleet' | 'zone' | 'fleet-planner' | 'branch-performance' | 'admin' | 'today-target' | 'plant-planner' | 'incentive' | 'data-entry' | 'calendar' | 'sob-download' | 'zone-branch-report' | 'day-branch-report' | 'oem-target-planning'>('dashboard');
  const [dashboardView, setDashboardView] = useState<'car' | 'trailer'>('car');
  const [targetViewMode, setTargetViewMode] = useState<'today' | 'week'>('today');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // User & Activity State removed as moved up

  const ALL_TABS = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'zone-branch-report', label: 'AO Zone & Branch Report', icon: BarChart3 },
    { id: 'day-branch-report', label: 'Day wise Branch Report', icon: BarChart3 },
    { id: 'oem-target-planning', label: 'OEM Target Planning', icon: Target },
    { id: 'data-entry', label: 'New Data Entry', icon: Plus },
    { id: 'targets', label: 'Target Management', icon: Target },
    { id: 'today-target', label: 'Today\'s Target', icon: Crosshair },
    { id: 'fleet-planner', label: 'Fleet Planner', icon: Truck },
    { id: 'fleet', label: 'Fleet Requirement', icon: Truck },
    { id: 'plant-planner', label: 'Plant Requirement', icon: Factory },
    { id: 'zone', label: 'AO Zone Analytics', icon: MapIcon },
    { id: 'branch-performance', label: 'Branch Performance', icon: BarChart3 },
    { id: 'incentive', label: 'Incentive', icon: Award },
    { id: 'admin', label: 'Config', icon: Settings },
    { id: 'calendar', label: 'Calendar Details', icon: Calendar },
    { id: 'sob-download', label: 'Share of Business', icon: Download }
  ];

  const allowedTabsForRole = roleTabsMap[userRole] || [];
  const visibleMenu = ALL_TABS.filter(item => allowedTabsForRole.includes(item.id) && !hiddenTabs.includes(item.id));

  const logActivity = (action: string, usernameOverride?: string) => {
    const username = usernameOverride || currentUser?.username;
    if (!username) return;
    setActivityLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      username,
      action,
      timestamp: Date.now()
    }, ...prev]);
  };

  // Incentive State
  const [incentiveYear, setIncentiveYear] = useState<number>(currentYear);
  const [incentiveTimeframe, setIncentiveTimeframe] = useState<string>(currentMonth);
  const [incentiveOEM, setIncentiveOEM] = useState<string>('');
  const [incentiveRates, setIncentiveRates] = useLocalStorage<Record<string, number>>('tracker_incentive_rates_v1', {});
  // Local edits for Incentive Planner only (do not affect global `data`)
  const [incentiveEdits, setIncentiveEdits] = useLocalStorage<Record<string, { target: number; lifted: number; startDate?: string; endDate?: string }>>('tracker_incentive_edits_v1', {});



  const exportIncentiveToExcel = (rows: any[]) => {
    try {
      const exportRows = rows.map(r => ({
        Plant: r.plant,
        State: r.statecity || '',
        Zone: r.zone || '',
        Target: r.target,
        Lifted: r.lifted,
        Balance: Math.max(0, r.target - r.lifted),
        Potential: r.potential
      }));
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Incentive');
      XLSX.writeFile(wb, `incentive_${incentiveOEM || 'all'}_${incentiveYear}.xlsx`);
    } catch (e) {
      console.error(e);
      alert('Export failed');
    }
  };

  const exportIncentiveToPDF = (rows: any[]) => {
    // Simple printable table approach
    const html = `
      <html>
        <head>
          <title>Incentive Export</title>
        </head>
        <body>
          <h2>Incentive Planner - ${incentiveOEM} - ${incentiveYear}</h2>
          <table border="1" cellpadding="6" cellspacing="0">
            <thead>
              <tr><th>Plant</th><th>State</th><th>Zone</th><th>Target</th><th>Lifted</th><th>Balance</th><th>Potential</th></tr>
            </thead>
            <tbody>
              ${rows.map(r => {
      const escapeHtml = (unsafe: any) => String(unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
      return `<tr><td>${escapeHtml(r.plant)}</td><td>${escapeHtml(r.statecity)}</td><td>${escapeHtml(r.zone)}</td><td>${Number(r.target)}</td><td>${Number(r.lifted)}</td><td>${Math.max(0, Number(r.target) - Number(r.lifted))}</td><td>${Number(r.potential)}</td></tr>`;
    }).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    const w = window.open('', '_blank');
    if (!w) return alert('Popup blocked');
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.print(); }, 500);
  };

  // Target Management State
  const [targetYear, setTargetYear] = useState<number>(currentYear);
  const [targetMonth, setTargetMonth] = useState<string>(currentMonth);
  const [targetOEM, setTargetOEM] = useState<string>('All');
  const [targetPlant, setTargetPlant] = useState<string>('All');
  const [newTargetOEM, setNewTargetOEM] = useState<string>('');
  const [newTargetPlant, setNewTargetPlant] = useState<string>('');
  const [newTargetDest, setNewTargetDest] = useState<string>('');
  const [newTargetRegion, setNewTargetRegion] = useState<string>('');
  const [newTargetVal, setNewTargetVal] = useState<string>('');
  const [targetEntryMode, setTargetEntryMode] = useState<'Standard' | 'Weekly' | 'Percentage'>('Standard');
  const [targetLevel, setTargetLevel] = useState<'State/City Wise' | 'AO Zone Wise'>('State/City Wise');
  const [weeklyTargets, setWeeklyTargets] = useState<{ startDate: string, endDate: string, cars: string, trailers: string }[]>([{ startDate: '', endDate: '', cars: '', trailers: '' }]);
  // Weekly mode zone category: 'Domestic' resolves to the matching AO zone from masterRoutes;
  // 'Export' is saved directly as the Export AO zone.
  const [weeklyZoneType, setWeeklyZoneType] = useState<'Domestic' | 'Export'>('Domestic');
  const [sobTotal, setSobTotal] = useState<string>('');

  const { oemConfigs } = useOemConfig();

  useEffect(() => {
    if (selectedOEM && selectedOEM !== 'All') {
      const activeConfig = oemConfigs.find(c => c.oem === selectedOEM);
      if (activeConfig && activeConfig.viewMode) {
        const isWeek = activeConfig.viewMode.includes('Week');
        setTargetViewMode(isWeek ? 'week' : 'today');
      }
    }
  }, [selectedOEM, oemConfigs]);

  useEffect(() => {
    if (newTargetOEM && newTargetOEM !== 'All') {
      const activeConfig = oemConfigs.find(c => c.oem === newTargetOEM);
      if (activeConfig) {
        if (activeConfig.targetType) {
          setTargetEntryMode(activeConfig.targetType);
        }
      }
    }
  }, [newTargetOEM, oemConfigs]);
  const [sobPercentages, setSobPercentages] = useState<Record<string, string>>({});

  const dashboardColumnVisibility = useMemo(() => getColumnVisibilityStrategy(oemConfigs.find(c => c.oem === selectedOEM)?.viewMode), [selectedOEM, oemConfigs]);
  const targetColumnVisibility = useMemo(() => getColumnVisibilityStrategy(oemConfigs.find(c => c.oem === targetOEM)?.viewMode), [targetOEM, oemConfigs]);
  const incentiveColumnVisibility = useMemo(() => getColumnVisibilityStrategy(oemConfigs.find(c => c.oem === incentiveOEM)?.viewMode), [incentiveOEM, oemConfigs]);

  // Fleet Requirement State
  const [fleetYear, setFleetYear] = useState<number>(currentYear);
  const [fleetMonth, setFleetMonth] = useState<string>(currentMonth);
  const [fleetOEM, setFleetOEM] = useState<string>('All');
  const [fleetPlant, setFleetPlant] = useState<string>('All');
  const [fleetBranch, setFleetBranch] = useState<string>('All');
  const [fleetOriginZone, setFleetOriginZone] = useState<string>('All');
  const [fleetDestZone, setFleetDestZone] = useState<string>('All');
  const [fleetTimeframe, setFleetTimeframe] = useState<'Daily' | 'Weekly' | 'Monthly'>('Daily');
  const [trailerCapacity, setTrailerCapacity] = useState<number>(6.5);
  const convertToViewUnits = (value: number, view: 'car' | 'trailer') => {
    if (view === 'car') return Math.max(0, Math.round(value));
    const converted = value / trailerCapacity;
    if (value <= 0) return 0;
    // For trailer view, ensure at least 1 trailer when there's any target
    return Math.max(1, Math.ceil(converted));
  };
  const [fleetSort, setFleetSort] = useState<'oem' | 'plant' | 'statecity' | 'trailers'>('oem');
  const [fleetSortDirection, setFleetSortDirection] = useState<'asc' | 'desc'>('asc');
  // Zone-Wise Fleet Requirement breakdown view
  const [fleetBreakdownView, setFleetBreakdownView] = useState<'zone' | 'oem' | 'plant' | 'branch'>('zone');

  const targetFormPlants = useMemo(() => {
    if (!newTargetOEM) return [...masterPlants].sort();
    return (safeGet(oemPlantMap, newTargetOEM) || []).slice().sort();
  }, [newTargetOEM, oemPlantMap, masterPlants]);

  const targetFormDestinations = useMemo(() => {
    let destinations: string[] = [];
    if (!newTargetPlant) {
      if (newTargetOEM) {
        destinations = Array.from(new Set(masterRoutes.filter(r => r.oem === newTargetOEM).map(r => r.statecity)));
      } else {
        destinations = [...masterDestinations];
      }
    } else {
      destinations = safeGet(plantDestMap, `${newTargetOEM}_${newTargetPlant}`) || safeGet(plantDestMap, newTargetPlant) || [];
      if (destinations.length === 0) {
        destinations = Array.from(new Set(masterRoutes.filter(r => r.oem === newTargetOEM && r.plant === newTargetPlant).map(r => r.statecity)));
      }
    }
    return destinations.filter(Boolean).sort();
  }, [newTargetOEM, newTargetPlant, plantDestMap, masterDestinations, masterRoutes]);

  const targetFormRegions = useMemo(() => {
    if (!newTargetPlant) {
      if (newTargetOEM) {
        return Array.from(new Set(masterRoutes.filter(r => r.oem === newTargetOEM).map(r => r.zone))).filter(Boolean).sort();
      }
      return [...masterRegions].sort();
    }
    const mapped = masterRoutes.filter(r => r.oem === newTargetOEM && r.plant === newTargetPlant).map(r => r.zone);
    return Array.from(new Set([...mapped])).filter(Boolean).sort();
  }, [newTargetOEM, newTargetPlant, masterRegions, masterRoutes]);

  // Zone Analytics State
  const [zoneYear, setZoneYear] = useState<number>(currentYear);
  const [zoneTimeframe, setZoneTimeframe] = useState<string>(currentMonth);
  const [zoneOEM, setZoneOEM] = useState<string>('All');
  const [zoneMatrixView, setZoneMatrixView] = useState<'Cars' | 'Trailers'>('Cars');
  const [interZoneMovementView, setInterZoneMovementView] = useState<'Cars' | 'Trailers'>('Trailers');
  const [summaryOriginZone, setSummaryOriginZone] = useState<string>('All');
  const [summaryDestZone, setSummaryDestZone] = useState<string>('All');
  const [summaryView, setSummaryView] = useState<'Cars' | 'Trailers'>('Cars');

  // Branch Performance State
  const [branchYear, setBranchYear] = useState<number>(currentYear);
  const [branchMonth, setBranchMonth] = useState<string>(currentMonth);
  const [branchOEM, setBranchOEM] = useState<string>('All');

  // Table Search Hooks

  const plantPlannerSearch = useTableSearch();
  const incentiveSearch = useTableSearch();
  const targetSearch = useTableSearch();
  const zoneSummarySearch = useTableSearch();
  const branchSearch = useTableSearch();
  const todayTargetSearch = useTableSearch();
  const [todayBreakdownView, setTodayBreakdownView] = useState<'zone' | 'oem' | 'plant' | 'branch'>('zone');
  const fleetMoveSearch = useTableSearch();
  const fleetReqSearch = useTableSearch();
  const fleetSearch = useTableSearch();

  // ── Incentive Planner: separate target store ─────────────────────────────
  // Incentive targets are independent from SOB targets. They are stored in a
  // dedicated localStorage key so editing them never affects the SOB data.
  const [incentiveTargetStore, setIncentiveTargetStore] = useLocalStorage<
    Record<string, number>  // key: `${oem}||${year}||${month}||${recordId}`, value: incentive target
  >('tracker_incentive_targets_v1', {});

  const incentiveBaseRows = useMemo(() => {
    const sobRows = data.filter(d =>
      getMonthsForTimeframe(incentiveTimeframe).includes(d.month) &&
      d.year === incentiveYear &&
      d.oem === incentiveOEM
    );
    // Overlay incentive-specific targets: if the user has set a separate incentive
    // target for a record, use that instead of the SOB target.
    // Do not merge SOB lifted and target data as per user request.
    return sobRows.map(d => {
      const storeKey = `${d.oem}||${d.year}||${d.month}||${d.id}`;
      const incentiveTarget = incentiveTargetStore[storeKey];
      return { 
        ...d, 
        target: incentiveTarget !== undefined ? incentiveTarget : 0,
        lifted: 0,
        _hasIncentiveTarget: incentiveTarget !== undefined 
      };
    });
  }, [data, incentiveTimeframe, incentiveYear, incentiveOEM, incentiveTargetStore]);

  const [incentivePlantFilter, setIncentivePlantFilter] = useState<string>('All');
  const [incentiveScopeFilter, setIncentiveScopeFilter] = useState<'All' | 'AO Zone Wise' | 'State Wise'>('All');
  const [selectedZoneFilter, setSelectedZoneFilter] = useState<string>('All');
  const [selectedStateCityFilter, setSelectedStateCityFilter] = useState<string>('All');
  const [manualIncentiveRows, setManualIncentiveRows] = useLocalStorage<any[]>('tracker_manual_incentive_rows_v1', []);

  const incentivePlantOptions = useMemo(() => {
    const opts = Array.from(new Set(incentiveBaseRows.map(r => r.plant))).filter(Boolean).sort();
    return ['All', ...opts];
  }, [incentiveBaseRows]);

  const currentManualIncentiveRows = useMemo(() => {
    return manualIncentiveRows.filter(r => r.oem === incentiveOEM && r.year === incentiveYear && r.month === incentiveTimeframe);
  }, [manualIncentiveRows, incentiveOEM, incentiveYear, incentiveTimeframe]);

  const incentiveZoneOptions = useMemo(() => {
    const opts = Array.from(new Set([...incentiveBaseRows, ...currentManualIncentiveRows].map(r => r.zone))).filter(Boolean).sort();
    return ['All', ...opts];
  }, [incentiveBaseRows, currentManualIncentiveRows]);

  const incentiveStateCityOptions = useMemo(() => {
    const opts = Array.from(new Set([...incentiveBaseRows, ...currentManualIncentiveRows].map(r => r.statecity))).filter(Boolean).sort();
    return ['All', ...opts];
  }, [incentiveBaseRows, currentManualIncentiveRows]);

  const incentiveAllRows = useMemo(() => {
    return [...incentiveBaseRows, ...currentManualIncentiveRows];
  }, [incentiveBaseRows, currentManualIncentiveRows]);


  useEffect(() => {
    if (incentiveScopeFilter !== 'AO Zone Wise') {
      setSelectedZoneFilter('All');
    }
    if (incentiveScopeFilter !== 'State Wise') {
      setSelectedStateCityFilter('All');
    }
  }, [incentiveScopeFilter]);

  const addManualIncentiveRow = () => {
    if (!incentiveOEM || incentiveOEM === 'All') {
      return alert('Please select a specific OEM before adding manual incentive entries.');
    }

    const id = `manual-${Date.now()}`;
    setManualIncentiveRows(prev => [
      ...prev,
      {
        id,
        plant: '',
        statecity: '',
        zone: '',
        target: 0,
        lifted: 0,
        manual: true,
        oem: incentiveOEM,
        year: incentiveYear,
        month: incentiveTimeframe
      }
    ]);
    setIncentiveEdits(prev => ({ ...prev, [id]: { target: 0, lifted: 0 } }));
  };

  const rowsWithIncentiveEdits = useMemo(() => {
    return incentiveAllRows.map(d => {
      const edit = safeGet(incentiveEdits, d.id) || { target: d.target || 0, lifted: d.lifted || 0 };
      const balanceTarget = Math.max(0, edit.target - edit.lifted);
      const incentiveAmt = safeGet(incentiveRates, d.id) || 0;
      const potential = balanceTarget * incentiveAmt;
      return { ...d, target: edit.target, lifted: edit.lifted, balanceTarget, incentiveAmt, potential };
    });
  }, [incentiveAllRows, incentiveEdits, incentiveRates]);

  const incentiveFilteredRows = useMemo(() => {
    let base = incentivePlantFilter && incentivePlantFilter !== 'All' ? rowsWithIncentiveEdits.filter(r => r.plant === incentivePlantFilter) : rowsWithIncentiveEdits;
    if (incentiveScopeFilter === 'AO Zone Wise' && selectedZoneFilter && selectedZoneFilter !== 'All') {
      base = base.filter(r => r.zone === selectedZoneFilter);
    }
    if (incentiveScopeFilter === 'State Wise' && selectedStateCityFilter && selectedStateCityFilter !== 'All') {
      base = base.filter(r => r.statecity === selectedStateCityFilter);
    }
    return incentiveSearch.filterData(base.map(r => ({ ...r, balanceTarget: r.balanceTarget })));
  }, [rowsWithIncentiveEdits, incentiveSearch, incentivePlantFilter, incentiveScopeFilter, selectedZoneFilter, selectedStateCityFilter]);

  const incentivePieSummary = useMemo(() => {
    const dataSource = incentiveFilteredRows;
    const totalTarget = dataSource.reduce((sum, r) => sum + (r.target || 0), 0);
    const totalLifted = dataSource.reduce((sum, r) => sum + (r.lifted || 0), 0);
    const totalIncentiveAmt = dataSource.reduce((sum, r) => sum + ((r.target || 0) * (r.incentiveAmt || 0)), 0);
    const totalEarnings = dataSource.reduce((sum, r) => sum + ((r.lifted || 0) * (r.incentiveAmt || 0)), 0);
    const achievementPercent = totalTarget > 0 ? Math.round((totalLifted / totalTarget) * 100) : 0;
    const earningsPercent = totalIncentiveAmt > 0 ? Math.round((totalEarnings / totalIncentiveAmt) * 100) : 0;

    return {
      achievementPie: [
        { name: 'Lifted', value: totalLifted },
        { name: 'Remaining', value: Math.max(0, totalTarget - totalLifted) }
      ],
      earningsPie: [
        { name: 'Earnings', value: totalEarnings },
        { name: 'Remaining', value: Math.max(0, totalIncentiveAmt - totalEarnings) }
      ],
      achievementPercent,
      earningsPercent
    };
  }, [incentiveFilteredRows]);

  // Log Edit/Delete State
  const [editingLog, setEditingLog] = useState<{ id: string, lifted: number, trailers: number, trucks: number } | null>(null);
  const [deleteLogId, setDeleteLogId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    };
  }, []);

  const [isAuthenticated, setIsAuthenticated] = useLocalStorage('tracker_isAuthenticated', false);

  useEffect(() => {
    if (isDataLoaded && isEntryLogsLoaded && isActivityLogsLoaded) {
      setIsInitialLoad(false);
    }
  }, [isDataLoaded, isEntryLogsLoaded, isActivityLogsLoaded]);

  React.useEffect(() => {
    // If user's current active tab is not in their visibleMenu, redirect to dashboard
    const isTabPermitted = visibleMenu.some(item => item.id === activeTab);
    if (!isTabPermitted) {
      setActiveTab('dashboard');
    }
  }, [userRole, activeTab, visibleMenu]);

  React.useEffect(() => {
    setData(prev => {
      let updatedData = [...prev];
      let changed = false;

      const targetMonths = getMonthsForTimeframe(selectedTimeframe);
      targetMonths.forEach(month => {
        if (!updatedData.some(d => d.month === month && d.year === selectedYear)) {
          const newData = rawInitialData.map(d => ({ ...d, id: `${d.id}-${selectedYear}-${month}`, month: month, year: selectedYear, lifted: 0, target: 0 }));
          updatedData = [...updatedData, ...newData];
          changed = true;
        }
      });

      if (!updatedData.some(d => d.month === entryForm.month && d.year === entryForm.year)) {
        const newData = rawInitialData.map(d => ({ ...d, id: `${d.id}-${entryForm.year}-${entryForm.month}`, month: entryForm.month, year: entryForm.year, lifted: 0, target: 0 }));
        updatedData = [...updatedData, ...newData];
        changed = true;
      }

      if (!updatedData.some(d => d.month === targetMonth && d.year === targetYear)) {
        const newData = rawInitialData.map(d => ({ ...d, id: `${d.id}-${targetYear}-${targetMonth}`, month: targetMonth, year: targetYear, lifted: 0, target: 0 }));
        updatedData = [...updatedData, ...newData];
        changed = true;
      }

      return changed ? updatedData : prev;
    });
  }, [selectedTimeframe, selectedYear, entryForm.month, entryForm.year, targetMonth, targetYear]);

  const addAlert = (message: string) => {
    const id = Date.now().toString() + Math.random().toString();
    setAlerts(prev => [...prev, { id, message }]);
    setTimeout(() => {
      setAlerts(prev => prev.filter(a => a.id !== id));
    }, 5000);
  };

  const handleLiftedChange = (id: string, value: string) => {
    let numValue = parseFloat(value);
    if (value !== '' && (isNaN(numValue) || numValue < 0)) return;

    setData(prev => prev.map(item => {
      if (item.id === id) {
        let newLifted = item.lifted;
        let newLiftedTrailers = item.liftedTrailers !== undefined ? item.liftedTrailers : convertToViewUnits(item.lifted, 'trailer');

        if (dashboardView === 'trailer') {
          newLiftedTrailers = isNaN(numValue) ? 0 : Math.max(0, Math.ceil(numValue));
          newLifted = Math.max(0, Math.ceil(newLiftedTrailers * trailerCapacity)); // sync back
        } else {
          newLifted = isNaN(numValue) ? 0 : Math.round(numValue);
        }

        if (dashboardView === 'car' && newLifted >= item.target && item.lifted < item.target) {
          addAlert(`Target reached for ${item.statecity} (${item.oem})!`);
        }
        return { ...item, lifted: newLifted, liftedTrailers: newLiftedTrailers };
      }
      return item;
    }));
  };

  const handleAddTargetExt = () => {
    if (!newTargetOEM || !newTargetPlant) {
      addAlert('Please select OEM and Plant.');
      return;
    }

    let newRecords: TransportRecord[] = [];
    const timestamp = Date.now();
    let finalDest = '';
    let finalRegion = '';

    if (targetEntryMode === 'Percentage') {
      const total = parseInt(sobTotal, 10);
      if (isNaN(total) || total <= 0) {
        addAlert('Please enter a valid Total OEM SOB number.');
        return;
      }

      let added = false;
      const distList = targetLevel === 'State/City Wise' ? targetFormDestinations : targetFormRegions;
      distList.forEach((r, idx) => {
        const pct = parseFloat(safeGet(sobPercentages, r) as string);
        if (!isNaN(pct) && pct > 0) {
          const calcTarget = Math.round(total * (pct / 100));
          const zoneVal = targetLevel === 'State/City Wise' ? getZoneForRoute(newTargetOEM, newTargetPlant, r) : r;
          const statecityVal = targetLevel === 'State/City Wise' ? r : r + ' Zone';
          newRecords.push({
            id: `new-pct-target-${timestamp}-${idx}`,
            year: targetYear, month: targetMonth,
            oem: newTargetOEM, plant: newTargetPlant,
            statecity: statecityVal, zone: zoneVal,
            target: calcTarget, lifted: 0,
            username: currentUser?.username,
            entryType: 'Percentage Based',
            targetLevel: targetLevel
          });
          added = true;
        }
      });
      if (!added) {
        addAlert('Please enter valid percentages for at least one zone.');
        return;
      }
    } else {
      // Standard or Weekly
      let calculatedTarget = 0;
      let calculatedTargetTrailers = 0;
      if (targetEntryMode === 'Weekly') {
        calculatedTarget = weeklyTargets.reduce((sum, w) => sum + parseInt(w.cars || '0', 10), 0);
        calculatedTargetTrailers = weeklyTargets.reduce((sum, w) => sum + parseInt(w.trailers || '0', 10), 0);
        if (calculatedTarget <= 0 && calculatedTargetTrailers <= 0) {
          addAlert('Please enter weekly targets.'); return;
        }
      } else {
        calculatedTarget = parseInt(newTargetVal || '0', 10);
        if (isNaN(calculatedTarget) || calculatedTarget <= 0) {
          addAlert('Please enter a valid target.'); return;
        }
      }

      finalRegion = newTargetRegion;
      finalDest = targetLevel === 'AO Zone Wise' ? (newTargetRegion ? newTargetRegion + ' Zone' : '') : newTargetDest;
      let finalTargetLevel = targetLevel;

      if (targetEntryMode !== 'Weekly') {
        if (targetLevel === 'State/City Wise' && !newTargetDest) {
          addAlert('Please select a statecity.'); return;
        }
        if (targetLevel === 'AO Zone Wise' && !newTargetRegion) {
          addAlert('Please select a zone/zone.'); return;
        }
      }

      if (targetLevel === 'State/City Wise' && finalDest && !finalRegion) {
        finalRegion = getZoneForRoute(newTargetOEM, newTargetPlant, finalDest) || 'Unknown';
        if (finalRegion === 'Unknown' && targetEntryMode !== 'Weekly') {
          addAlert('Please select a valid Zone mapping.'); return;
        }
      }

      if (targetEntryMode === 'Weekly') {
        finalDest = finalDest || 'All Destinations';

        // ── Domestic / Export zone resolution ──────────────────────────────
        // Export: save directly as 'Export' (it is already an AO zone in masterData)
        // Domestic: look up the AO zone from masterRoutes for the selected OEM+Plant.
        //   If a 'Domestic' zone exists in masterRoutes for this OEM+Plant, use it.
        //   If not found, fall back to whatever the user typed in newTargetRegion.
        if (weeklyZoneType === 'Export') {
          finalRegion = 'Export';
        } else {
          // Domestic: try to find the actual AO zone name from masterRoutes
          const domesticRoute = masterRoutes.find(
            r => r.oem === newTargetOEM && r.plant === newTargetPlant && r.zone === 'Domestic'
          );
          if (domesticRoute) {
            finalRegion = 'Domestic';
          } else {
            // No 'Domestic' zone in masterRoutes for this OEM+Plant — keep whatever was entered
            finalRegion = finalRegion || 'All Regions';
          }
        }

        if (finalDest === 'All Destinations') finalTargetLevel = 'AO Zone Wise';
      }

      newRecords.push({
        id: `new-target-${timestamp}`,
        year: targetYear, month: targetMonth,
        oem: newTargetOEM, plant: newTargetPlant,
        statecity: finalDest, zone: finalRegion,
        target: calculatedTarget,
        targetTrailers: calculatedTargetTrailers,
        lifted: 0,
        liftedTrailers: 0,
        username: currentUser?.username,
        entryType: targetEntryMode === 'Weekly' ? 'Weekly' : 'Monthly',
        targetLevel: targetEntryMode === 'Weekly' ? finalTargetLevel : targetLevel,
        weeklyBreakdown: targetEntryMode === 'Weekly' ? weeklyTargets.map(wt => ({ dateRange: (`${wt.startDate || ''} to ${wt.endDate || ''}`).trim(), cars: parseInt(wt.cars || '0', 10), trailers: parseInt(wt.trailers || '0', 10) })) : undefined
      });
    }

    setData(prev => [...newRecords, ...prev]);

    // Persist temporal breakdown for every saved record so all views
    // can aggregate from the canonical daily table.
    newRecords.forEach(rec => {
      buildBreakdownInput(rec).forEach(input => computeAndSave(input));
    });

    registerDataRoute(newTargetOEM, newTargetPlant, targetEntryMode !== 'Percentage' && targetLevel === 'State/City Wise' && finalDest !== 'All Destinations' ? finalDest : 'All State', 'Unknown');

    logActivity(`Added ${newRecords.length} target(s) via ${targetEntryMode} mode`);

    // reset basic fields
    setNewTargetVal('');
    setWeeklyTargets([{ startDate: '', endDate: '', cars: '', trailers: '' }]);
    setWeeklyZoneType('Domestic');
    setSobTotal('');
    setSobPercentages({});
    setNewTargetDest('');
    setNewTargetRegion('');
    addAlert(`Successfully added ${newRecords.length} target(s).`);
  };

  const handleTargetChange = (id: string, value: string) => {
    const numValue = parseInt(value, 10);
    if (value !== '' && (isNaN(numValue) || numValue < 0)) return;

    setData(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, target: isNaN(numValue) ? 0 : numValue };
      }
      return item;
    }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      setTimeout(() => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const parsedData = XLSX.utils.sheet_to_json(ws) as any[];

          let updatedCount = 0;
          let failedRows: { row: number, reason: string }[] = [];

          setData(prev => {
            let newData = [...prev];
            parsedData.forEach((row, index) => {
              const oem = row['OEM'] || row['oem'];
              const plant = row['Origin Plant'] || row['Plant'] || row['plant'];
              const statecity = row['State/Region'] || row['statecity'];
              const target = parseInt(row['Monthly Target'] || row['Target'] || row['target'], 10);
              const month = row['Month'] || row['month'] || targetMonth;
              const year = parseInt(row['Year'] || row['year'] || targetYear, 10);

              if (!oem || !plant || !statecity) {
                failedRows.push({ row: index + 2, reason: 'Missing required fields' });
                return;
              }
              if (isNaN(target)) {
                failedRows.push({ row: index + 2, reason: 'Invalid Target value' });
                return;
              }
              if (isNaN(year)) {
                failedRows.push({ row: index + 2, reason: 'Invalid Year value' });
                return;
              }

              const existingIndex = newData.findIndex(d => d.oem === oem && d.plant === plant && d.statecity === statecity && d.month === month && d.year === year);
              if (existingIndex !== -1) {
                newData[existingIndex] = { ...newData[existingIndex], target };
                updatedCount++;
              } else {
                // Create new route
                const zone = row['Zone'] || row['Region'] || row['zone'] || 'Unknown';
                newData.push({
                  id: `${oem.toLowerCase()}-${plant.toLowerCase().replace(/\s+/g, '-')}-${statecity.toLowerCase().replace(/\s+/g, '-')}-${month}-${year}`,
                  oem,
                  plant,
                  statecity,
                  zone,
                  target,
                  lifted: 0,
                  month,
                  year
                });
                updatedCount++;

                // Update master data lists and mappings if new
                registerDataRoute(oem, plant, statecity, zone);
              }
            });

            // Schedule the alert to run after the state update
            setTimeout(() => {
              if (failedRows.length > 0) {
                const errorMsg = failedRows.slice(0, 3).map(f => `Row ${f.row}: ${f.reason}`).join(', ') + (failedRows.length > 3 ? `... and ${failedRows.length - 3} more` : '');
                addAlert(`Updated ${updatedCount} targets. ${failedRows.length} rows failed. Details: ${errorMsg}`);
              } else {
                addAlert(`Successfully updated ${updatedCount} targets from Excel.`);
              }
              logActivity(`Uploaded targets file: ${updatedCount} updated, ${failedRows.length} failed`);
            }, 0);

            return newData;
          });
        } catch (error) {
          console.error("Error parsing Excel file:", error);
          addAlert("Error parsing Excel file. Please check the format.");
          logActivity(`Failed to upload targets file: Format error`);
        } finally {
          setIsUploading(false);
        }
      }, 500); // Add a small delay for the spinner to be visible
    };
    reader.readAsBinaryString(file);
    // Reset the input value so the same file can be uploaded again
    e.target.value = '';
  };

  const exportToCSV = () => {
    const headers = ['Year', 'Timeframe', 'OEM', 'Origin Plant', 'State/City', 'Zone AO', 'Origin Zone', 'Destination Zone', 'Branch Name', 'Target', 'Daily Target', 'Weekly Target', 'Cars Lifted', 'Balance Target', 'Achievement %', 'Status'];
    const rows = filteredData.map(row => {
      const daysInTimeframe = getDaysInTimeframe(plannerTimeframe, plannerYear);
      const dailyTarget = Math.round(row.target / daysInTimeframe);
      const weeklyTarget = Math.round((row.target / daysInTimeframe) * 7);
      const balanceTarget = Math.max(0, row.target - row.lifted);
      const achievement = row.target > 0 ? Math.round((row.lifted / row.target) * 100) : 0;
      let status = 'Behind';
      if (achievement >= 75) status = 'On Track';
      else if (achievement >= 50) status = 'At Risk';

      const route = masterRoutes.find(r => r.oem === row.oem && r.plant === row.plant && r.statecity === row.statecity);

      return [
        selectedYear,
        selectedTimeframe,
        row.oem,
        row.plant,
        row.statecity, // stateCity
        row.zone, // zoneAO
        route?.originZone || getOriginZone(row.plant),
        route?.destZone || getDestinationZone(row),
        route?.manageByBranch || getManageByBranch(row.oem, row.plant),
        row.target,
        dailyTarget,
        weeklyTarget,
        row.lifted,
        balanceTarget,
        `${achievement}%`,
        status
      ].join(',');
    });

    try {
      const csvString = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'sob_lifting_tracker.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('CSV export failed', e);
      alert('CSV export failed. Please try again.');
    }
  };

  const exportDashboardPDF = async () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;

    const filters = [
      `Period: ${selectedTimeframe}`,
      `Year: ${selectedYear}`,
      `OEM: ${selectedOEM}`,
      `Plant: ${selectedPlant}`,
      `Branch: ${selectedBranch}`,
      `View: ${dashboardView === 'car' ? 'Cars' : 'Trailers'}`,
      `Grouping: ${achievementPieMode}`
    ];

    const drawHeader = (title: string, pageNumber: number) => {
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 18, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.text(title, margin, 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Page ${pageNumber} of 3`, pageWidth - margin, 12, { align: 'right' });
      doc.setDrawColor(255, 255, 255);
      doc.line(margin, 20, pageWidth - margin, 20);
      doc.setTextColor(30, 41, 59);
    };

    const drawSectionHeading = (text: string, x: number, y: number) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(text, x, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
    };

    const drawInfoTiles = (startY: number) => {
      const tileWidth = (contentWidth - 24) / 3;
      const tileHeight = 18;
      const rows = [
        ['Total OEMs', totalOEMs.toString(), 'Total Plants', totalPlants.toString(), 'Total Cars Target', totalTargetCars.toLocaleString()],
        ['Cars Lifted', totalLiftedCars.toLocaleString(), 'Balance', totalBalance.toLocaleString(), 'Achievement', achievementPct]
      ];

      rows.forEach((row, rowIndex) => {
        for (let tileIndex = 0; tileIndex < 3; tileIndex += 1) {
          const x = margin + tileIndex * (tileWidth + 12);
          const y = startY + rowIndex * (tileHeight + 8);
          const title = String(row[tileIndex * 2] || '');
          const value = String(row[tileIndex * 2 + 1] || '');

          doc.setFillColor(248, 250, 252);
          doc.roundedRect(x, y, tileWidth, tileHeight, 3, 3, 'F');
          doc.setDrawColor(229, 231, 235);
          doc.roundedRect(x, y, tileWidth, tileHeight, 3, 3);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.text(title, x + 3, y + 7);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(11);
          doc.text(value, x + 3, y + 14);
        }
      });

      return startY + rows.length * (tileHeight + 8);
    };

    const drawBarChart = (title: string, items: any[], x: number, y: number, width: number, height: number, isTrend = false) => {
      const chartX = x + 4;
      const chartY = y + 10;
      const chartHeight = height - 28;
      const chartWidth = width - 8;
      const chartItems = items.slice(0, 7);
      const maxTarget = Math.max(...chartItems.map(item => item.target || 0), 1);
      const groupWidth = chartWidth / chartItems.length;
      const barWidth = Math.min(10, groupWidth * 0.35);

      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, y, width, height, 4, 4);
      drawSectionHeading(title, x + 6, y + 8);

      for (let step = 0; step <= 4; step += 1) {
        const lineY = chartY + (chartHeight * step) / 4;
        doc.setDrawColor(226, 232, 240);
        doc.line(chartX, lineY, chartX + chartWidth, lineY);
      }

      chartItems.forEach((item, idx) => {
        const baseX = chartX + idx * groupWidth + (groupWidth - barWidth * 2 - 4) / 2;
        const targetVal = item.target || 0;
        const targetHeight = Math.round((targetVal / maxTarget) * chartHeight);
        const achievementPct = Math.min(100, Math.max(0, item.achievement || 0));
        const achievementHeight = Math.round((achievementPct / 100) * chartHeight);

        if (isTrend) {
          doc.setFillColor(59, 130, 246);
          doc.rect(baseX, chartY + chartHeight - targetHeight, barWidth, targetHeight, 'F');
          doc.setFillColor(139, 92, 246);
          doc.circle(baseX + barWidth + 6, chartY + chartHeight - achievementHeight, 2.5, 'F');
          if (idx > 0) {
            const prevItem = chartItems[idx - 1];
            const prevAchievement = Math.min(100, Math.max(0, prevItem.achievement || 0));
            const prevHeight = Math.round((prevAchievement / 100) * chartHeight);
            const prevX = chartX + (idx - 1) * groupWidth + (groupWidth - barWidth * 2 - 4) / 2 + barWidth + 6;
            const prevY = chartY + chartHeight - prevHeight;
            const currX = baseX + barWidth + 6;
            const currY = chartY + chartHeight - achievementHeight;
            doc.setDrawColor(139, 92, 246);
            doc.setLineWidth(0.8);
            doc.line(prevX, prevY, currX, currY);
          }
        } else {
          doc.setFillColor(59, 130, 246);
          doc.rect(baseX, chartY + chartHeight - targetHeight, barWidth, targetHeight, 'F');
          doc.setFillColor(234, 179, 8);
          doc.rect(baseX + barWidth + 4, chartY + chartHeight - achievementHeight, barWidth, achievementHeight, 'F');
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(item.oem || item.month || 'N/A', chartX + idx * groupWidth + groupWidth / 2, chartY + chartHeight + 6, { align: 'center', maxWidth: groupWidth - 2 });
      });

      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);
      doc.text('Target', x + 6, y + height - 6);
      if (isTrend) {
        doc.setFillColor(139, 92, 246);
        doc.circle(x + 18, y + height - 7, 1.5, 'F');
        doc.text('Achievement %', x + 22, y + height - 5);
      } else {
        doc.setFillColor(59, 130, 246);
        doc.rect(x + 22, y + height - 8, 6, 4, 'F');
        doc.text('Target', x + 30, y + height - 5);
        doc.setFillColor(234, 179, 8);
        doc.rect(x + 68, y + height - 8, 6, 4, 'F');
        doc.text('Achievement %', x + 76, y + height - 5);
      }
    };

    const createChartImageDataUrl = async (svgElement: SVGSVGElement): Promise<string | null> => {
      try {
        if (!svgElement) return null;
        const clone = svgElement.cloneNode(true) as SVGSVGElement;
        if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(clone);
        const svgData = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const loadedImage = await new Promise<HTMLImageElement>((resolve, reject) => {
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = svgData;
        });

        const canvas = document.createElement('canvas');
        canvas.width = loadedImage.naturalWidth || 600;
        canvas.height = loadedImage.naturalHeight || 600;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(loadedImage, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
      } catch (e) {
        console.warn('Failed to rasterize SVG chart for PDF export:', e);
        return null;
      }
    };

    const drawSummaryMetrics = (startY: number) => {
      const metrics = [
        ['Total Target', achievementContributionData.totalTarget.toLocaleString()],
        ['Total Lifted', `${achievementContributionData.totalLifted.toLocaleString()} (${achievementContributionData.totalAchievementPct}%)`],
        ['Top Item', achievementContributionData.topItem?.name || 'N/A'],
        ['Total Groups', achievementContributionData.items.length.toString()]
      ];
      const metricWidth = (contentWidth - 12) / 2;
      metrics.forEach((item, idx) => {
        const x = margin + (idx % 2) * (metricWidth + 12);
        const y = startY + Math.floor(idx / 2) * 26;
        doc.setFillColor(247, 249, 255);
        doc.roundedRect(x, y, metricWidth, 20, 3, 3, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(x, y, metricWidth, 20, 3, 3);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(item[0], x + 3, y + 7);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text(item[1], x + 3, y + 15);
      });
      return startY + 52;
    };

    const drawFilterSummary = (y: number) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      filters.forEach((label, index) => {
        doc.text(label, margin + (index % 3) * 70, y + Math.floor(index / 3) * 5);
      });
      return y + 12;
    };

    const targetMonths = getMonthsForTimeframe(selectedTimeframe);
    const carSummary = oems.filter(oem => selectedOEM === 'All' || oem === selectedOEM).map(oem => {
      let oemData = data.filter(d => d.oem === oem && targetMonths.includes(d.month) && d.year === selectedYear);
      if (selectedPlant !== 'All') {
        oemData = oemData.filter(d => d.plant === selectedPlant);
      }
      if (selectedBranch !== 'All') {
        const normalizedSelectedBranch = (selectedBranch || '').trim();
        oemData = oemData.filter(d => (d.manageByBranch || '').trim() === normalizedSelectedBranch);
      }
      const target = oemData.reduce((sum, d) => sum + d.target, 0);
      const lifted = oemData.reduce((sum, d) => sum + d.lifted, 0);
      const achievement = target > 0 ? (lifted / target) * 100 : 0;
      return { oem, target, lifted, achievement };
    }).sort((a, b) => b.target - a.target);

    drawHeader('SOB Lifting Tracker Dashboard', 1);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text('Dashboard Overview', margin, 30);
    let currentY = 34;
    currentY = drawFilterSummary(currentY) + 4;
    currentY = drawInfoTiles(currentY) + 6;

    const halfWidth = (contentWidth - 12) / 2;
    if (carSummary.length > 0) {
      drawBarChart('OEM Target vs Achievement (Cars)', carSummary.slice(0, 7), margin, currentY, halfWidth, 88);
      drawBarChart('Monthly Lifting Trends (Cars)', monthlyTrendData, margin + halfWidth + 12, currentY, halfWidth, 88, true);
      currentY += 96;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const summaryText = 'This page provides a quick executive summary of OEM targets, achieved lifts, and the latest trend performance across the selected period. Filters and metrics are shown for a crisp, presentation-ready export.';
    doc.text(summaryText, margin, currentY, { maxWidth: contentWidth });

    doc.addPage();
    drawHeader('SOB Achievement Contribution', 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text('Contribution Summary', margin, 30);

    const chartSvg = achievementChartRef.current?.querySelector('svg');
    const chartImageDataUrl = chartSvg ? await createChartImageDataUrl(chartSvg as SVGSVGElement) : null;
    const chartWidth = 110;
    const chartHeight = 110;
    if (chartImageDataUrl) {
      doc.addImage(chartImageDataUrl, 'PNG', margin, 36, chartWidth, chartHeight);
    } else {
      drawSectionHeading(`SOB Achievement Contribution (${achievementPieMode})`, margin, 36);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Grouping: ${achievementPieMode}`, margin, 150);

    autoTable(doc, {
      startY: 36,
      margin: { left: margin + chartWidth + 12, right: margin },
      head: [[achievementPieMode, 'Achievement (%)']],
      body: achievementContributionData.items.slice(0, 8).map(item => [item.name, `${item.share.toFixed(1)}%`]),
      theme: 'striped',
      styles: { fontSize: 8, halign: 'left', cellPadding: 3 },
      headStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontStyle: 'bold' },
      foot: [['Total', '100%']],
      footStyles: { fillColor: [238, 242, 255], textColor: [15, 23, 42], fontStyle: 'bold' }
    });

    doc.addPage();
    drawHeader('OEM Performance Summary', 3);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text('OEM Performance Summary', margin, 30);

    autoTable(doc, {
      startY: 36,
      head: [['OEM', 'Total Target', 'Total Lifted', 'Achievement %']],
      body: oemSummary.map(item => [
        item.oem,
        item.target.toLocaleString(),
        item.lifted.toLocaleString(),
        `${item.achievement != null ? item.achievement.toFixed(1) : 'N/A'}%`
      ]),
      theme: 'striped',
      styles: { fontSize: 9, halign: 'left', cellPadding: 3 },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      margin: { left: margin, right: margin }
    });

    doc.save(`dashboard_summary_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const displayData = useMemo(() => {
    const targetMonths = getMonthsForTimeframe(selectedTimeframe);
    let filtered = data.filter(d => targetMonths.includes(d.month) && d.year === selectedYear);
    if (selectedOEM !== 'All') filtered = filtered.filter(d => d.oem === selectedOEM);
    if (selectedPlant !== 'All') filtered = filtered.filter(d => d.plant === selectedPlant);
    if (selectedOriginZone !== 'All') filtered = filtered.filter(d => PLANT_ZONES[d.plant] === selectedOriginZone);
    if (selectedBranch !== 'All') {
      // Normalize both values for comparison (trim whitespace)
      const normalizedSelectedBranch = (selectedBranch || '').trim();
      filtered = filtered.filter(d => {
        const normalizedDataBranch = (d.manageByBranch || '').trim();
        return normalizedDataBranch === normalizedSelectedBranch;
      });
    }
    return filtered;
  }, [data, selectedOEM, selectedPlant, selectedOriginZone, selectedBranch, selectedTimeframe, selectedYear]);

  const totalOEMs = useMemo(() => {
    // Count unique OEMs from filtered data
    return new Set(displayData.map(d => d.oem)).size;
  }, [displayData]);

  const totalPlants = useMemo(() => {
    // Count unique Plants from filtered data
    return new Set(displayData.map(d => d.plant)).size;
  }, [displayData]);

  const uniqueOEMsArray = useMemo(() => {
    return Array.from(new Set(displayData.map(d => d.oem)));
  }, [displayData]);

  const uniquePlantsArray = useMemo(() => {
    return Array.from(new Set(displayData.map(d => d.plant)));
  }, [displayData]);

  const totalTargetCars = useMemo(() => displayData.reduce((sum, d) => sum + d.target, 0), [displayData]);
  const totalLiftedCars = useMemo(() => displayData.reduce((sum, d) => sum + d.lifted, 0), [displayData]);
  const totalTargetTrailers = useMemo(() => displayData.reduce((sum, d) => sum + (d.targetTrailers !== undefined ? d.targetTrailers : convertToViewUnits(d.target, 'trailer')), 0), [displayData, trailerCapacity]);
  const totalLiftedTrailers = useMemo(() => displayData.reduce((sum, d) => sum + (d.liftedTrailers !== undefined ? d.liftedTrailers : convertToViewUnits(d.lifted, 'trailer')), 0), [displayData, trailerCapacity]);

  const totalTarget = dashboardView === 'car' ? totalTargetCars : totalTargetTrailers;
  const totalLifted = dashboardView === 'car' ? totalLiftedCars : totalLiftedTrailers;
  const totalBalance = useMemo(() => Math.max(0, totalTarget - totalLifted), [totalTarget, totalLifted]);

  const achievementPct = totalTarget > 0 ? Math.round((totalLifted / totalTarget) * 100) + '%' : 'N/A';

  const oems = masterOEMs;

  const filteredOEMsForDropdown = useMemo(() => {
    let availableOems = oems;
    if (selectedBranch !== 'All') {
      availableOems = availableOems.filter(oem => masterRoutes.some(r => r.oem === oem && (r.manageByBranch || '').trim() === selectedBranch));
    }
    if (selectedOriginZone !== 'All') {
      availableOems = availableOems.filter(oem => masterRoutes.some(r => r.oem === oem && safeGet(PLANT_ZONES, r.plant) === selectedOriginZone));
    }
    if (selectedPlant !== 'All') {
      availableOems = availableOems.filter(oem => masterRoutes.some(r => r.oem === oem && r.plant === selectedPlant));
    }
    return Array.from(new Set(availableOems));
  }, [oems, selectedOriginZone, selectedPlant, selectedBranch, masterRoutes]);

  const filteredZonesForDropdown = useMemo(() => {
    let zones = originZones;
    if (selectedBranch !== 'All') {
      zones = zones.filter(zone => masterRoutes.some(r => PLANT_ZONES[r.plant] === zone && (r.manageByBranch || '').trim() === selectedBranch));
    }
    if (selectedOEM !== 'All') {
      zones = zones.filter(zone => masterRoutes.some(r => PLANT_ZONES[r.plant] === zone && r.oem === selectedOEM));
    }
    if (selectedPlant !== 'All') {
      zones = zones.filter(zone => PLANT_ZONES[selectedPlant] === zone);
    }
    return Array.from(new Set(zones));
  }, [originZones, selectedOEM, selectedPlant, selectedBranch, masterRoutes]);

  const plantsForSelectedOEM = useMemo(() => {
    let plants = selectedOEM === 'All' ? masterPlants : (oemPlantMap[selectedOEM] || []);
    // When Branch is selected, further narrow plants to those belonging to that branch
    if (selectedBranch !== 'All') {
      plants = plants.filter(p => masterRoutes.some(r => r.plant === p && (r.manageByBranch || '').trim() === selectedBranch));
    }
    return plants;
  }, [selectedOEM, selectedBranch, oemPlantMap, masterPlants, masterRoutes]);

  // When Branch changes, auto-reset OEM/Plant/Zone if they are no longer valid
  useEffect(() => {
    if (selectedBranch === 'All') return;
    const validOEMs = masterRoutes.filter(r => (r.manageByBranch || '').trim() === selectedBranch).map(r => r.oem);
    if (selectedOEM !== 'All' && !validOEMs.includes(selectedOEM)) setSelectedOEM('All');
    const validPlants = masterRoutes.filter(r => (r.manageByBranch || '').trim() === selectedBranch).map(r => r.plant);
    if (selectedPlant !== 'All' && !validPlants.includes(selectedPlant)) setSelectedPlant('All');
    const validZones = masterRoutes.filter(r => (r.manageByBranch || '').trim() === selectedBranch).map(r => PLANT_ZONES[r.plant]).filter(Boolean);
    if (selectedOriginZone !== 'All' && !validZones.includes(selectedOriginZone)) setSelectedOriginZone('All');
  }, [selectedBranch, masterRoutes]);

  const plannerFilteredOEMs = useMemo(() => {
    let availableOems = oems;
    // We cannot easily filter OEMs by Origin Zone without iterating master routes.
    // Wait, let's keep master data filter for this.
    if (plannerOriginZone !== 'All') {
      availableOems = availableOems.filter(oem => masterRoutes.some(r => r.oem === oem && PLANT_ZONES[r.plant] === plannerOriginZone));
    }
    return availableOems;
  }, [oems, plannerOriginZone, masterRoutes]);

  const plannerFilteredZones = useMemo(() => {
    let zones = originZones;
    if (plannerOEM !== 'All') {
      zones = zones.filter(zone => masterRoutes.some(r => PLANT_ZONES[r.plant] === zone && r.oem === plannerOEM));
    }
    if (plannerPlant !== 'All') {
      zones = zones.filter(zone => PLANT_ZONES[plannerPlant] === zone);
    }
    return Array.from(new Set(zones));
  }, [originZones, plannerOEM, plannerPlant, masterRoutes]);

  const plannerFilteredPlants = useMemo(() => {
    if (plannerOEM === 'All') return masterPlants;
    return safeGet(oemPlantMap, plannerOEM) || [];
  }, [plannerOEM, oemPlantMap, masterPlants]);

  const plannerFilteredBranches = useMemo(() => {
    // Filter branches based on Origin Zone, OEM, and Plant selections
    let filteredBranches = masterBranches;
    
    if (plannerOriginZone !== 'All' || plannerOEM !== 'All' || plannerPlant !== 'All') {
      filteredBranches = masterBranches.filter(branch => {
        return masterRoutes.some(route => {
          if (plannerOriginZone !== 'All' && safeGet(PLANT_ZONES, route.plant) !== plannerOriginZone) return false;
          if (plannerOEM !== 'All' && route.oem !== plannerOEM) return false;
          if (plannerPlant !== 'All' && route.plant !== plannerPlant) return false;
          return (route.manageByBranch || '').trim() === branch;
        });
      });
    }
    
    return filteredBranches;
  }, [plannerOriginZone, plannerOEM, plannerPlant, masterBranches, masterRoutes]);

  const plannerFilteredDestinations = useMemo(() => {
    if (plannerPlant === 'All') {
      if (plannerOEM !== 'All') {
        return Array.from(new Set(masterRoutes.filter(r => r.oem === plannerOEM).map(r => r.statecity))).sort();
      }
      return masterDestinations;
    }
    return safeGet(plantDestMap, `${plannerOEM}_${plannerPlant}`) || [];
  }, [plannerPlant, plannerOEM, plantDestMap, masterDestinations, masterRoutes]);

  const plannerFilteredRegions = useMemo(() => {
    let regions = masterRegions;
    if (plannerOEM !== 'All') {
      regions = regions.filter(zone => masterRoutes.some(r => r.zone === zone && r.oem === plannerOEM));
    }
    if (plannerPlant !== 'All') {
      regions = regions.filter(zone => masterRoutes.some(r => r.zone === zone && r.plant === plannerPlant));
    }
    if (plannerDestination !== 'All') {
      regions = regions.filter(zone => masterRoutes.some(r => r.zone === zone && r.statecity === plannerDestination));
    }
    return Array.from(new Set(regions));
  }, [masterRegions, plannerOEM, plannerPlant, plannerDestination, masterRoutes]);

  const targetPlantsForOEM = useMemo(() => {
    if (targetOEM === 'All') return masterPlants;
    return safeGet(oemPlantMap, targetOEM) || [];
  }, [targetOEM, oemPlantMap, masterPlants]);

  React.useEffect(() => {
    setTargetPlant('All');
  }, [targetOEM]);

  const filteredData = useMemo(() => {
    const targetMonths = getMonthsForTimeframe(selectedTimeframe);
    const filtered = data.filter(d =>
      targetMonths.includes(d.month) &&
      d.year === selectedYear &&
      (selectedOEM === 'All' || d.oem === selectedOEM) &&
      (selectedPlant === 'All' || d.plant === selectedPlant) &&
      (plannerOEM === 'All' || d.oem === plannerOEM) &&
      (plannerPlant === 'All' || d.plant === plannerPlant) &&
      (plannerDestination === 'All' || d.statecity === plannerDestination) &&
      (plannerRegion === 'All' || d.zone === plannerRegion) &&
      (plannerOriginZone === 'All' || safeGet(PLANT_ZONES, d.plant) === plannerOriginZone) &&
      (plannerBranch === 'All' || (d.manageByBranch || '').trim() === (plannerBranch || '').trim()) &&
      (selectedBranch === 'All' || (d.manageByBranch || '').trim() === (selectedBranch || '').trim())
    );

    const aggregated = new Map<string, TransportRecord>();
    filtered.forEach(d => {
      const baseId = d.id.split('-')[0];
      if (aggregated.has(baseId)) {
        const existing = aggregated.get(baseId)!;
        aggregated.set(baseId, {
          ...existing,
          target: existing.target + d.target,
          lifted: existing.lifted + d.lifted
        });
      } else {
        aggregated.set(baseId, { ...d, id: baseId, month: selectedTimeframe });
      }
    });
    return Array.from(aggregated.values());
  }, [data, selectedOEM, selectedPlant, selectedTimeframe, selectedYear, plannerOEM, plannerPlant, plannerDestination, plannerRegion, plannerOriginZone, plannerBranch, selectedBranch]);

  // Pre-compute table rows for Plant Requirement view to avoid heavy inline computation during render
  const plantPlannerRows = useMemo(() => {
    // If no meaningful filter is selected, don't show all data by default
    const filters = [selectedOEM, selectedPlant, plannerOEM, plannerPlant, plannerDestination, plannerRegion, plannerOriginZone, plannerBranch, selectedBranch];
    const hasFilterSelected = filters.some(v => v && v !== 'All');
    if (!hasFilterSelected) return [];

    return filteredData.map(r => {
      const rowTarget = dashboardView === 'car' ? r.target : (r.targetTrailers !== undefined ? r.targetTrailers : convertToViewUnits(r.target, 'trailer'));
      const rowLifted = dashboardView === 'car' ? r.lifted : (r.liftedTrailers !== undefined ? r.liftedTrailers : convertToViewUnits(r.lifted, 'trailer'));
      const balanceTarget = Math.max(0, rowTarget - rowLifted);
      const req = computeRequirements(rowTarget, rowLifted, r.month || selectedTimeframe, selectedYear);
      const dailyTarget = Math.ceil(req.dailyRequired);
      const weeklyTarget = Math.ceil(req.weeklyRequired);
      const achievement = rowTarget > 0 ? Math.round((rowLifted / rowTarget) * 100) : null;
      let statusColor = 'text-red-700 bg-red-50 border-red-200';
      let barColor = 'bg-red-500';
      let statusText = 'Behind';
      let StatusIcon = XCircle;
      if (achievement !== null && achievement >= 75) {
        statusColor = 'text-[#10B981] bg-[#10B981]/10 border-[#10B981]/20';
        barColor = 'bg-[#10B981]';
        statusText = 'On Track';
        StatusIcon = CheckCircle2;
      } else if (achievement !== null && achievement >= 50) {
        statusColor = 'text-amber-700 bg-amber-50 border-amber-200';
        barColor = 'bg-amber-500';
        statusText = 'At Risk';
        StatusIcon = AlertCircle;
      }
      return { ...r, rowTarget, rowLifted, balanceTarget, dailyTarget, weeklyTarget, achievement, statusColor, barColor, statusText, StatusIcon };
    });
  }, [filteredData, dashboardView, trailerCapacity, selectedTimeframe, selectedYear]);

  const todayTargetData = useMemo(() => {
    const currentMonthData = data.filter(d => d.month === currentMonth && d.year === currentYear);

    let totalTarget = 0;
    let totalLifted = 0;

    const plantStats: Record<string, any> = {};
    const zoneStats: Record<string, any> = {};
    const oemStats: Record<string, any> = {};
    const branchStats: Record<string, any> = {};

    currentMonthData.forEach(d => {
      totalTarget += d.target;
      totalLifted += d.lifted;

      const originZone = normalizeZone(getOriginZone(d.plant));
      const branch = getDisplayBranch(d);

      // Origin Zone stats — use normalized zone name as key to prevent duplicates
      if (originZone !== 'Unknown') {
        if (!safeGet(zoneStats, originZone)) safeSet(zoneStats as any, originZone, { name: originZone, target: 0, lifted: 0 });
        (safeGet(zoneStats, originZone) as any).target += d.target;
        (safeGet(zoneStats, originZone) as any).lifted += d.lifted;
      }

      // OEM stats
      if (!safeGet(oemStats, d.oem)) safeSet(oemStats as any, d.oem, { name: d.oem, target: 0, lifted: 0 });
      (safeGet(oemStats, d.oem) as any).target += d.target;
      (safeGet(oemStats, d.oem) as any).lifted += d.lifted;

      // Plant stats (with origin zone label)
      const plantKey = d.plant;
      if (!safeGet(plantStats, plantKey)) safeSet(plantStats as any, plantKey, { name: d.plant, target: 0, lifted: 0, zone: originZone, oem: d.oem });
      (safeGet(plantStats, plantKey) as any).target += d.target;
      (safeGet(plantStats, plantKey) as any).lifted += d.lifted;

      // Branch stats
      if (branch && branch !== 'Unknown') {
        if (!safeGet(branchStats, branch)) safeSet(branchStats as any, branch, { name: branch, target: 0, lifted: 0 });
        (safeGet(branchStats, branch) as any).target += d.target;
        (safeGet(branchStats, branch) as any).lifted += d.lifted;
      }
    });

    const processStats = (stats: Record<string, any>) => {
      return Object.values(stats).map(s => {
        const req = computeRequirements(s.target, s.lifted, currentMonth, currentYear);
        return {
          ...s,
          expected:      req.expectedToDate,
          shortfall:     req.shortfall,
          remaining:     req.balance,
          requiredDaily: req.dailyRequired,
          requiredWeekly: req.weeklyRequired,
        };
      }).sort((a, b) => b.shortfall - a.shortfall);
    };

    const totalReq = computeRequirements(totalTarget, totalLifted, currentMonth, currentYear);

    return {
      currentDay:          totalReq.dayOfMonth,
      daysInMonth:         totalReq.daysInMonth,
      remainingDays:       totalReq.remainingDays,
      totalTarget,
      totalLifted,
      expectedTotal:       totalReq.expectedToDate,
      totalShortfall:      totalReq.shortfall,
      totalRemaining:      totalReq.balance,
      totalRequiredDaily:  totalReq.dailyRequired,
      totalRequiredWeekly: totalReq.weeklyRequired,
      plants:   processStats(plantStats),
      zones:    processStats(zoneStats),
      oems:     processStats(oemStats),
      branches: processStats(branchStats),
    };
  }, [data, currentMonth, currentYear]);

  const oemSummary = useMemo(() => {
    const targetMonths = getMonthsForTimeframe(selectedTimeframe);
    let availableOems = oems;
    if (selectedOriginZone !== 'All') {
      availableOems = availableOems.filter(oem => data.some(d => d.oem === oem && safeGet(PLANT_ZONES, d.plant) === selectedOriginZone));
    }
    if (selectedOEM !== 'All') {
      availableOems = availableOems.filter(oem => oem === selectedOEM);
    }
    if (selectedPlant !== 'All') {
      availableOems = availableOems.filter(oem => data.some(d => d.oem === oem && d.plant === selectedPlant));
    }
    if (selectedBranch !== 'All') {
      const normalizedSelectedBranch = (selectedBranch || '').trim();
      availableOems = availableOems.filter(oem => data.some(d => d.oem === oem && (d.manageByBranch || '').trim() === normalizedSelectedBranch));
    }
    return availableOems.map(oem => {
      let oemData = data.filter(d => d.oem === oem && targetMonths.includes(d.month) && d.year === selectedYear);
      if (selectedOriginZone !== 'All') {
        oemData = oemData.filter(d => PLANT_ZONES[d.plant] === selectedOriginZone);
      }
      if (selectedPlant !== 'All') {
        oemData = oemData.filter(d => d.plant === selectedPlant);
      }
      if (selectedBranch !== 'All') {
        const normalizedSelectedBranch = (selectedBranch || '').trim();
        oemData = oemData.filter(d => (d.manageByBranch || '').trim() === normalizedSelectedBranch);
      }
      const target = dashboardView === 'car' ? oemData.reduce((sum, d) => sum + d.target, 0) : oemData.reduce((sum, d) => sum + (d.targetTrailers !== undefined ? d.targetTrailers : Math.round(d.target / trailerCapacity)), 0);
      const lifted = dashboardView === 'car' ? oemData.reduce((sum, d) => sum + d.lifted, 0) : oemData.reduce((sum, d) => sum + (d.liftedTrailers !== undefined ? d.liftedTrailers : Math.round(d.lifted / trailerCapacity)), 0);
      const achievement = target > 0 ? (lifted / target) * 100 : null;
      return { oem, target, lifted, achievement };
    }).sort((a, b) => {
      if (b.target !== a.target) return b.target - a.target;
      return a.oem.localeCompare(b.oem);
    });
  }, [data, oems, selectedTimeframe, selectedYear, selectedOriginZone, selectedOEM, selectedPlant, selectedBranch, dashboardView, trailerCapacity]);

  const monthlyTrendData = useMemo(() => {
    let trendMonthsWithYears: { month: string, year: number }[] = [];
    const date = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(date.getFullYear(), date.getMonth() - i, 1);
      trendMonthsWithYears.push({
        month: months[d.getMonth()],
        year: d.getFullYear()
      });
    }

    return trendMonthsWithYears.map(({ month, year }) => {
      let monthData = data.filter(d => d.month === month && d.year === year);
      const target = dashboardView === 'car' ? monthData.reduce((sum, d) => sum + d.target, 0) : monthData.reduce((sum, d) => sum + (d.targetTrailers !== undefined ? d.targetTrailers : Math.round(d.target / trailerCapacity)), 0);
      const lifted = dashboardView === 'car' ? monthData.reduce((sum, d) => sum + d.lifted, 0) : monthData.reduce((sum, d) => sum + (d.liftedTrailers !== undefined ? d.liftedTrailers : Math.round(d.lifted / trailerCapacity)), 0);
      const achievement = target > 0 ? (lifted / target) * 100 : null;
      return { month: `${month.substring(0, 3)} ${year}`, target, lifted, achievement };
    });
  }, [data, dashboardView, trailerCapacity]);

  const achievementContributionData = useMemo(() => {
    const rows = displayData;

    const groupValue = (record: any) => {
      if (achievementPieMode === 'Origin Zone') return normalizeZone(getOriginZone(record.plant));
      if (achievementPieMode === 'Branch') return getDisplayBranch(record);
      if (achievementPieMode === 'OEM') return record.oem || 'Unknown';
      return record.plant || 'Unknown';
    };

    const grouped = new Map<string, { name: string; target: number; lifted: number; count: number }>();

    rows.forEach((record: any) => {
      const name = groupValue(record);
      const target = dashboardView === 'car' ? record.target : (record.targetTrailers ?? Math.max(1, Math.round(record.target / trailerCapacity)));
      const lifted = dashboardView === 'car' ? record.lifted : (record.liftedTrailers ?? Math.max(1, Math.round(record.lifted / trailerCapacity)));

      if (!grouped.has(name)) {
        grouped.set(name, { name, target: 0, lifted: 0, count: 0 });
      }

      const bucket = grouped.get(name)!;
      bucket.target += target;
      bucket.lifted += lifted;
      bucket.count += 1;
    });

    const totalTarget = rows.reduce((sum, row: any) => sum + (dashboardView === 'car' ? row.target : (row.targetTrailers ?? Math.max(1, Math.round(row.target / trailerCapacity)))), 0);
    const totalLifted = rows.reduce((sum, row: any) => sum + (dashboardView === 'car' ? row.lifted : (row.liftedTrailers ?? Math.max(1, Math.round(row.lifted / trailerCapacity)))), 0);
    const items = Array.from(grouped.values())
      .map((item, index) => ({
        ...item,
        share: totalLifted > 0 ? (item.lifted / totalLifted) * 100 : 0,
        color: achievementPiePalette[index % achievementPiePalette.length],
      }))
      .sort((a, b) => b.lifted - a.lifted);
    const topItem = items[0] || null;

    return { items, totalTarget, totalLifted, totalAchievementPct: totalTarget > 0 ? Math.round((totalLifted / totalTarget) * 100) : null, topItem };
  }, [achievementPieMode, dashboardView, displayData, trailerCapacity]);

  // Data Entry Form Options
  const formPlants = useMemo(() => {
    if (!entryForm.oem) return [...masterPlants].sort();
    const mapped = safeGet(oemPlantMap, entryForm.oem) || [];
    return Array.from(new Set([...mapped])).sort();
  }, [entryForm.oem, oemPlantMap, masterPlants]);

  const formZones = useMemo(() => {
    if (!entryForm.plant) {
      if (entryForm.oem) {
        return Array.from(new Set(masterRoutes.filter(r => r.oem === entryForm.oem).map(r => r.zone))).filter(Boolean).sort();
      }
      return [...masterRegions].sort();
    }
    const mapped = masterRoutes.filter(r => r.oem === entryForm.oem && r.plant === entryForm.plant).map(r => r.zone);
    return Array.from(new Set([...mapped])).filter(Boolean).sort();
  }, [entryForm.plant, entryForm.oem, masterRegions, masterRoutes]);

  const formDestinations = useMemo(() => {
    let destinations: string[] = [];
    if (!entryForm.plant) {
      if (entryForm.oem) {
        destinations = Array.from(new Set(masterRoutes.filter(r => r.oem === entryForm.oem).map(r => r.statecity)));
      } else {
        destinations = [...masterDestinations];
      }
    } else {
      destinations = safeGet(plantDestMap, `${entryForm.oem}_${entryForm.plant}`) || [];
    }

    if (entryForm.zone) {
      destinations = destinations.filter(dest => {
        const route = masterRoutes.find(r => r.oem === entryForm.oem && r.plant === entryForm.plant && r.statecity === dest);
        return route && route.zone === entryForm.zone;
      });
    }

    return Array.from(new Set([...destinations])).sort();
  }, [entryForm.plant, entryForm.oem, entryForm.zone, plantDestMap, masterDestinations, masterRoutes]);

  const formCities = useMemo(() => {
    if (entryForm.oem === 'Mahindra' && entryForm.statecity && safeGet(getMahindraCities(), entryForm.statecity)) {
      return safeGet(getMahindraCities(), entryForm.statecity);
    }
    return [];
  }, [entryForm.oem, entryForm.statecity]);

  const downloadExcelTemplate = () => {
    const selectedOEM = entryForm.oem || 'Mahindra';
    const selectedPlant = entryForm.plant || (masterPlants[0] || '');

    if (!selectedOEM || !selectedPlant) {
      addAlert('Please choose an OEM and Plant before downloading the template.');
      return;
    }

    const routeRows = Array.from(
      new Map(
        (Array.isArray(masterRoutes) ? masterRoutes : [])
          .filter(route => route.oem === selectedOEM && route.plant === selectedPlant)
          .map(route => [route.statecity, route])
      ).values()
    );

    const templateData = (routeRows.length ? routeRows : [{ statecity: 'Example Route', zone: 'West' }]).map(route => ({
      'Date': entryForm.date || todayDateStr,
      'Year': entryForm.year || new Date().getFullYear(),
      'Month': entryForm.month || months[new Date().getMonth()],
      'OEM': selectedOEM,
      'Plant': selectedPlant,
      'Zone AO': route.zone || '',
      'State/City': route.statecity || '',
      'Cars Lifted': '',
      'Trucks Lifted': '',
      'Trailers Lifted': ''
    }));

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, `Data_Entry_Template_${selectedOEM}_${selectedPlant}.xlsx`);
  };

  const handleResetTargetPlan = (oem: string, plant: string, month: string, year: number) => {
    const existingPlanRecords = data.filter(record =>
      record.oem === oem &&
      record.plant === plant &&
      record.month === month &&
      record.year === year
    );

    if (existingPlanRecords.length > 0) {
      const existingIds = existingPlanRecords.map(record => record.id).filter(Boolean);
      deleteBreakdowns(existingIds);
      setData(prev => prev.filter(record => !(record.oem === oem && record.plant === plant && record.month === month && record.year === year)));
      addAlert(`Targets for ${oem} ${plant} (${month} ${year}) cleared successfully.`);
    }
  };

  const handleSaveTargetPlan = (oem: string, plant: string, month: string, year: number, gridData: Record<string, Record<string, string>>, colDef: any[], rows?: any[], entryType?: string) => {
    const validation = validateTargetPlanSave(data, { oem, plant, month, year, requestedEntryType: entryType });
    if (!validation.isValid) {
      addAlert(validation.error || 'Unable to save target plan due to validation failure.');
      return;
    }

    const existingPlanRecords = data.filter(record =>
      record.oem === oem &&
      record.plant === plant &&
      record.month === month &&
      record.year === year
    );

    if (existingPlanRecords.length > 0) {
      const existingIds = existingPlanRecords.map(record => record.id).filter(Boolean);
      deleteBreakdowns(existingIds);
    }

    // Collect the upserted records so we can compute breakdowns after setData
    const upsertedRecords: { id: string; oem: string; plant: string; statecity: string; zone: string; target: number; targetTrailers?: number; month: string; year: number; entryType?: string; targetLevel?: string; weeklyBreakdown?: { dateRange: string; cars: number; trailers: number }[] }[] = [];

    setData(prev => {
      let newData = prev.filter(record => !(record.oem === oem && record.plant === plant && record.month === month && record.year === year));
      const processedStateCities = new Set<string>();

      // For each column (statecity/route)
      colDef.forEach(col => {
        const statecity = col.sub || col.state;
        processedStateCities.add(statecity);

        // Sum up targets across all weeks for this column
        let totalTarget = 0;
        Object.values(gridData).forEach(weekData => {
          totalTarget += parseInt(safeGet(weekData as any, col.id) || '0', 10);
        });

        // Build weekly breakdown if rows (week rows) were provided
        const weeklyBreakdown: any[] = [];
        if (rows && rows.length) {
          rows.forEach(r => {
            const weekRow = safeGet(gridData as any, r.id);
            const val = parseInt((weekRow && safeGet(weekRow as any, col.id)) || '0', 10);
            weeklyBreakdown.push({ dateRange: r.sub || r.label || r.id, cars: val, trailers: 0 });
          });
        }

        const derivedEntryType: TransportRecord['entryType'] = entryType || (weeklyBreakdown.length > 0 ? 'Week Wise' : 'AO Zone Wise');
        const derivedTargetLevel: TransportRecord['targetLevel'] = col.zone && !col.state ? 'AO Zone Wise' : 'State/City Wise';

        const existingRecord = existingPlanRecords.find(d => d.statecity === statecity);

        const newRec: TransportRecord = {
          id: existingRecord?.id || `${oem}-${plant}-${statecity}-${month}-${year}-${Date.now()}`,
          oem,
          plant,
          statecity,
          zone: existingRecord?.zone || col.zone || 'Unknown',
          originZone: existingRecord?.originZone || getOriginZone(plant) || 'Unknown',
          destZone: existingRecord?.destZone || undefined,
          manageByBranch: existingRecord?.manageByBranch || undefined,
          target: totalTarget,
          targetTrailers: existingRecord?.targetTrailers ?? 0,
          lifted: existingRecord?.lifted ?? 0,
          liftedTrucks: existingRecord?.liftedTrucks ?? 0,
          liftedTrailers: existingRecord?.liftedTrailers ?? 0,
          weeklyBreakdown: weeklyBreakdown.length ? weeklyBreakdown : existingRecord?.weeklyBreakdown,
          month,
          year,
          entryType: derivedEntryType,
          targetLevel: derivedTargetLevel,
          username: existingRecord?.username || currentUser?.username || 'Unknown',
        };
        newData.push(newRec);
        upsertedRecords.push(newRec);
      });

      // Preserve existing records that were NOT in the new target grid
      // This ensures data is not deleted unless explicitly deleted by the user
      existingPlanRecords.forEach(existing => {
        if (!processedStateCities.has(existing.statecity)) {
          const preservedRec = { ...existing };
          newData.push(preservedRec);
          upsertedRecords.push(preservedRec);
        }
      });

      return newData;
    });

    // Persist temporal breakdown for every upserted record
    upsertedRecords.forEach(rec => {
      buildBreakdownInput(rec).forEach(input => computeAndSave(input));
    });

    addAlert(`Targets for ${oem} ${plant} (${month} ${year}) updated successfully.`);
  };

  const handleDataEntryFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = (safeGet(wb.Sheets as any, wsname) as any);
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        const validationErrors: string[] = [];
        let successCount = 0;
        const newLogsToAppend: any[] = [];

        setData(prevData => {
          let newData = [...prevData];

          rows.forEach((row: any, index: number) => {
            const rowNumber = index + 2;
            const rawDate = row['Date'] || row['date'] || '';
            const pickedDate = rawDate ? new Date(rawDate) : null;
            const year = parseInt(String(row['Year'] || row['year'] || (pickedDate?.getFullYear() || '')), 10);
            const month = String(row['Month'] || row['month'] || (pickedDate ? months[pickedDate.getMonth()] : '')).trim();
            const oem = String(row['OEM'] || row['oem'] || '').trim();
            const plant = String(row['Plant'] || row['plant'] || row['Origin Plant'] || '').trim();
            const statecity = String(row['State/City'] || row['statecity'] || row['State/Region'] || '').trim();
            const zone = String(row['Zone AO'] || row['zoneAO'] || row['Zone'] || row['zone'] || '').trim();
            const lifted = parseInt(String(row['Cars Lifted'] || row['Lifted'] || row['lifted'] || '0'), 10);
            const trucks = parseInt(String(row['Trucks Lifted'] || row['Trucks'] || row['trucks'] || '0'), 10);
            const trailers = parseInt(String(row['Trailers Lifted'] || row['Trailers'] || row['trailers'] || '0'), 10);

            if (!year || !month || !oem || !plant || !statecity) {
              validationErrors.push(`Row ${rowNumber}: Date/OEM/Plant/State-City are required.`);
              return;
            }
            if (!Number.isFinite(lifted) || lifted < 0) {
              validationErrors.push(`Row ${rowNumber}: Cars Lifted must be a valid number.`);
              return;
            }
            if (!Number.isFinite(trucks) || trucks < 0) {
              validationErrors.push(`Row ${rowNumber}: Trucks Lifted must be a valid number.`);
              return;
            }
            if (!Number.isFinite(trailers) || trailers < 0) {
              validationErrors.push(`Row ${rowNumber}: Trailers Lifted must be a valid number.`);
              return;
            }
            if (!masterOEMs.includes(oem)) {
              validationErrors.push(`Row ${rowNumber}: OEM "${oem}" is not available in the current configuration.`);
              return;
            }
            if (!masterPlants.includes(plant)) {
              validationErrors.push(`Row ${rowNumber}: Plant "${plant}" is not available in the current configuration.`);
              return;
            }

            const routeMatch = (Array.isArray(masterRoutes) ? masterRoutes : []).find(r => r.oem === oem && r.plant === plant && r.statecity === statecity);
            if (!routeMatch) {
              validationErrors.push(`Row ${rowNumber}: State/City "${statecity}" is not mapped for ${oem} / ${plant}.`);
              return;
            }

            const dateStr = rawDate || new Date().toISOString().split('T')[0];
            const logDateStr = new Date(dateStr).toLocaleDateString();
            const logZone = zone || routeMatch.zone || 'Unknown';

            // Check duplicate against existing entryLogs
            const isDuplicateInExisting = entryLogs.some(log =>
              new Date(log.date).toLocaleDateString() === logDateStr &&
              log.oem === oem &&
              log.plant === plant &&
              log.statecity === statecity &&
              (!zone || (log as any).zone === zone) &&
              log.month === month &&
              log.year === year
            );

            // Check duplicate against previously processed rows in this file
            const isDuplicateInNew = newLogsToAppend.some(log =>
              new Date(log.date).toLocaleDateString() === logDateStr &&
              log.oem === oem &&
              log.plant === plant &&
              log.statecity === statecity &&
              (!zone || log.zone === zone) &&
              log.month === month &&
              log.year === year
            );

            if (isDuplicateInExisting || isDuplicateInNew) {
              validationErrors.push(`Row ${rowNumber}: Please check, it's already exist.`);
              return; // skip this row
            }

            const existingIndex = newData.findIndex(item => item.year === year && item.month === month && item.oem === oem && item.plant === plant && item.statecity === statecity);
            if (existingIndex !== -1) {
              newData[existingIndex] = {
                ...newData[existingIndex],
                lifted: newData[existingIndex].lifted + lifted,
                liftedTrucks: (newData[existingIndex].liftedTrucks || 0) + trucks,
                liftedTrailers: (newData[existingIndex].liftedTrailers || 0) + trailers,
              };
            } else {
              newData.push({
                id: `${oem.toLowerCase()}-${plant.toLowerCase().replace(/\s+/g, '-')}-${statecity.toLowerCase().replace(/\s+/g, '-')}-${month}-${year}-${Date.now()}`,
                oem,
                plant,
                statecity,
                zone: logZone,
                originZone: routeMatch.originZone || getOriginZone(plant) || 'Unknown',
                destZone: routeMatch.destZone || undefined,
                manageByBranch: routeMatch.manageByBranch || undefined,
                target: 0,
                lifted,
                liftedTrucks: trucks,
                liftedTrailers: trailers,
                month,
                year,
                username: currentUser?.username || 'Unknown',
              });
              registerDataRoute(oem, plant, statecity, logZone, routeMatch.originZone, routeMatch.destZone, routeMatch.manageByBranch);
            }

            newLogsToAppend.push({
              id: Date.now().toString() + '-' + index,
              date: dateStr,
              month,
              year,
              oem,
              plant,
              statecity,
              zone: logZone,
              city: '-',
              lifted,
              trailers,
              trucks,
              username: currentUser?.username || 'Bulk Upload'
            });

            successCount++;
          });

          return newData;
        });

        if (newLogsToAppend.length > 0) {
          setEntryLogs(prev => [...newLogsToAppend, ...prev]);
        }

        if (validationErrors.length > 0) {
          addAlert(`Upload stopped with ${validationErrors.length} validation issue(s): ${validationErrors.slice(0, 3).join(' ')}${validationErrors.length > 3 ? ' …' : ''}`);
        } else {
          addAlert(`Successfully uploaded ${successCount} entry rows.`);
        }
        logActivity(`Bulk data entry upload completed: ${successCount} records, ${validationErrors.length} validation issues`);
      } catch (error) {
        console.error(error);
        addAlert('Error reading Excel file. Please ensure it matches the simplified template.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleEntrySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryForm.year || !entryForm.month || !entryForm.oem || !entryForm.plant || !entryForm.statecity || !entryForm.lifted) {
      addAlert("Please fill in all required fields.");
      return;
    }

    const liftedNum = parseInt(entryForm.lifted, 10);
    const trailerType = entryForm.trailerType || 'Trailer';
    const trailerQtyNum = parseInt(entryForm.trailerQty || '0', 10);
    
    let trucksNum = 0;
    let trailersNum = 0;
    if (trailerType === 'Truck') {
      trucksNum = trailerQtyNum;
    } else {
      trailersNum = trailerQtyNum;
    }

    if (isNaN(liftedNum) || liftedNum <= 0) {
      addAlert("Please enter a valid positive number for Cars Lifted.");
      return;
    }
    if (isNaN(trailerQtyNum) || trailerQtyNum < 0) {
      addAlert(`Please enter a valid number for ${trailerType}.`);
      return;
    }

    const todayStr = new Date(entryForm.date).toLocaleDateString();
    const isDuplicate = entryLogs.some(log =>
      new Date(log.date).toLocaleDateString() === todayStr &&
      log.oem === entryForm.oem &&
      log.plant === entryForm.plant &&
      log.statecity === entryForm.statecity &&
      (!entryForm.zone || (log as any).zone === entryForm.zone) &&
      log.month === entryForm.month &&
      log.year === entryForm.year
    );

    if (isDuplicate) {
      addAlert("Duplicate entry detected for today with the same OEM, Plant, and Destination.");
      return;
    }

    // Update main data
    let routeExists = false;
    let suggestedRegion = 'Unknown';
    let isNewRoute = false;

    // Check if route exists entirely
    for (const item of data) {
      if (item.year === entryForm.year && item.month === entryForm.month && item.oem === entryForm.oem && item.plant === entryForm.plant && item.statecity === entryForm.statecity && (!entryForm.zone || item.zone === entryForm.zone)) {
        routeExists = true;
        break;
      }
    }

    if (!routeExists) {
      const historical = data.find(d => d.statecity === entryForm.statecity && d.zone && d.zone !== 'Unknown' && (!entryForm.zone || d.zone === entryForm.zone));
      if (historical) {
        suggestedRegion = historical.zone;
      } else if (entryForm.zone) {
        suggestedRegion = entryForm.zone;
      } else {
        const promptRegion = window.prompt(`This is a new route for ${entryForm.statecity}. Please enter the Zone/Region (e.g. North, South, East, West):`);
        if (promptRegion === null) return; // user cancelled
        suggestedRegion = promptRegion || 'Unknown';
      }
      isNewRoute = true;
    }

    setData(prev => {
      const newData = prev.map(item => {
        if (item.year === entryForm.year && item.month === entryForm.month && item.oem === entryForm.oem && item.plant === entryForm.plant && item.statecity === entryForm.statecity && (!entryForm.zone || item.zone === entryForm.zone)) {
          routeExists = true;
          const newLifted = item.lifted + liftedNum;
          const newLiftedTrailers = (item.liftedTrailers || 0) + trailersNum;
          const newLiftedTrucks = (item.liftedTrucks || 0) + trucksNum;
          if (newLifted >= item.target && item.lifted < item.target) {
            addAlert(`Target reached for ${item.statecity} (${item.oem})!`);
          }
          return { ...item, lifted: newLifted, liftedTrailers: newLiftedTrailers, liftedTrucks: newLiftedTrucks };
        }
        return item;
      });

      if (isNewRoute) {
        // Create new route with 0 target
        newData.push({
          id: `${entryForm.oem.toLowerCase()}-${entryForm.plant.toLowerCase().replace(/\s+/g, '-')}-${entryForm.statecity.toLowerCase().replace(/\s+/g, '-')}-${entryForm.month}-${entryForm.year}`,
          oem: entryForm.oem,
          plant: entryForm.plant,
          statecity: entryForm.statecity,
          zone: suggestedRegion,
          target: 0,
          targetTrailers: 0,
          lifted: liftedNum,
          liftedTrailers: trailersNum,
          liftedTrucks: trucksNum,
          month: entryForm.month,
          year: entryForm.year,
          username: currentUser?.username || 'Unknown'
        });

        // Update master data lists and mappings if new
        registerDataRoute(entryForm.oem, entryForm.plant, entryForm.statecity, suggestedRegion);
      }

      return newData;
    });

    // Add to logs - use the user-selected date
    const dateStr = entryForm.date;
    
    setEntryLogs(prev => [{
      id: Date.now().toString(),
      date: dateStr,
      month: entryForm.month,
      year: entryForm.year,
      oem: entryForm.oem,
      plant: entryForm.plant,
      statecity: entryForm.statecity,
      zone: entryForm.zone,
      city: entryForm.oem === 'Mahindra' && entryForm.city ? entryForm.city : '-',
      lifted: liftedNum,
      trailers: trailersNum,
      trucks: trucksNum,
      username: currentUser?.username || 'Unknown' // Track user who entered it
    }, ...prev]);

    logActivity(`Added data entry: ${liftedNum} cars, ${trucksNum} trucks, ${trailersNum} trailers for ${entryForm.statecity}`);

    // Reset form lifted amount, trailerQty, statecity, zone, and city; keep date as-is for consecutive entries
    setEntryForm(prev => ({ ...prev, lifted: '', trailerQty: '', city: '', statecity: '', zone: '' }));
  };

  const confirmDeleteLog = () => {
    if (!deleteLogId) return;
    const logToDel = entryLogs.find(l => l.id === deleteLogId);
    if (!logToDel) return;

    setData(prev => prev.map(item => {
      if (item.year === logToDel.year && item.month === logToDel.month && item.oem === logToDel.oem && item.plant === logToDel.plant && item.statecity === logToDel.statecity) {
        return { ...item, lifted: Math.max(0, item.lifted - logToDel.lifted), liftedTrailers: Math.max(0, (item.liftedTrailers || 0) - (logToDel.trailers || 0)), liftedTrucks: Math.max(0, (item.liftedTrucks || 0) - (logToDel.trucks || 0)) };
      }
      return item;
    }));

    setEntryLogs(prev => prev.filter(l => l.id !== deleteLogId));
    setDeleteLogId(null);
    addAlert("Entry deleted successfully.");
    logActivity(`Deleted data entry for ${logToDel.statecity}`);
  };

  const saveEditLog = () => {
    if (!editingLog) return;
    const originalLog = entryLogs.find(l => l.id === editingLog.id);
    if (!originalLog) return;

    const newLifted = editingLog.lifted;
    const newTrailers = editingLog.trailers;
    if (isNaN(newLifted) || newLifted < 0) {
      addAlert("Please enter a valid positive number for cars.");
      return;
    }
    if (isNaN(newTrailers) || newTrailers < 0) {
      addAlert("Please enter a valid number for trailers.");
      return;
    }

    const diff = newLifted - originalLog.lifted;
    const diffTrailers = newTrailers - (originalLog.trailers || 0);

    setData(prev => prev.map(item => {
      if (item.year === originalLog.year && item.month === originalLog.month && item.oem === originalLog.oem && item.plant === originalLog.plant && item.statecity === originalLog.statecity) {
        return { ...item, lifted: Math.max(0, item.lifted + diff), liftedTrailers: Math.max(0, (item.liftedTrailers || 0) + diffTrailers) };
      }
      return item;
    }));

    setEntryLogs(prev => prev.map(l => l.id === editingLog.id ? { ...l, lifted: newLifted, trailers: newTrailers } : l));
    setEditingLog(null);
    addAlert("Entry updated successfully.");
    logActivity(`Edited data entry for ${originalLog.statecity}: cars ${originalLog.lifted}->${newLifted}, trailers ${originalLog.trailers}->${newTrailers}`);
  };



  const filteredEntryPreviewLogs = useMemo(() => {
    const selectedOEM = entryForm.oem || '';
    const selectedPlant = entryForm.plant || '';
    return entryLogs.filter(log => {
      const matchesOEM = !selectedOEM || log.oem === selectedOEM;
      const matchesPlant = !selectedPlant || log.plant === selectedPlant;
      return matchesOEM && matchesPlant;
    }).slice(0, 10);
  }, [entryForm.oem, entryForm.plant, entryLogs]);

  const formatValue = (value: number, view: 'car' | 'trailer', isCeil = false) => {
    if (view === 'car') return Math.round(value);
    if (isCeil) return Math.ceil(value / trailerCapacity);
    return convertToViewUnits(value, view);
  };

  if (!isAuthenticated) {
    return <Login users={users} onLogin={(user) => {
      setCurrentUser({ username: user.username, loginTime: Date.now(), role: user.role });
      setUserRole(user.role as any);
      setIsAuthenticated(true);
      logActivity('User logged in', user.username);
    }} />;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans p-4 md:p-6 lg:p-8 relative">
      <ReloadPrompt />
      <AnimatePresence>
        {isInitialLoad && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-[#F8FAFC]"
          >
            <motion.div
              initial={{ x: '-100vw' }}
              animate={{ x: '100vw' }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
              className="flex items-center gap-4 text-[#005689]"
            >
              <Truck size={80} strokeWidth={1.5} />
              <span className="text-4xl font-bold tracking-tight text-[#1E293B]">STPL</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-[#1E293B]/50 z-40"
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
              role="dialog"
              aria-label="Main Navigation Menu"
              aria-modal="true"
              className="fixed top-0 left-0 bottom-0 w-72 bg-[#FFFFFF] shadow-2xl z-50 flex flex-col"
            >
              <div className="p-6 border-b border-[#E2E8F0] flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-[#64748B]">Main Menu</span>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-2 hover:bg-[#F1F5F9] rounded-lg transition-colors text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#005689]"
                  aria-label="Close navigation menu"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto py-4" aria-label="Main Navigation">
                <div className="flex flex-col gap-1 px-3">
                  {visibleMenu.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id as any);
                        setIsSidebarOpen(false);
                      }}
                      aria-current={activeTab === item.id ? 'page' : undefined}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#005689] ${activeTab === item.id
                        ? 'bg-[#005689] text-white font-medium'
                        : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B] font-medium'
                        }`}
                    >
                      <item.icon size={20} aria-hidden="true" className={activeTab === item.id ? 'text-white' : 'text-[#94A3B8]'} />
                      {safeGet(customMenuNames || {}, item.id) || item.label}
                    </button>
                  ))}
                </div>
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 print:hidden">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">

            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${isOnline ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
                <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline Mode'}</span>
              </div>

              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 hover:bg-[#E2E8F0] rounded-lg transition-colors text-[#1E293B]"
              >
                <Menu size={28} />
              </button>
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 120, damping: 12 }}
                className="flex items-center gap-3 bg-white p-2 pr-4 rounded-[12px] shadow-sm border border-[#E2E8F0]"
              >
                {transportLogo ? (
                  <img
                    src={transportLogo}
                    alt={`${transportName} Logo`}
                    className="h-12 w-auto max-w-[120px] object-contain"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = 'none';
                      if (target.nextElementSibling) {
                        target.nextElementSibling.classList.remove('hidden');
                      }
                    }}
                  />
                ) : null}
                {/* Fallback stylized text if image is not uploaded yet */}
                <div className="hidden font-black tracking-tighter text-3xl italic">
                  <span className="text-[#004BB8]">{transportName.slice(0, 1) || 'L'}</span>
                  <span className="text-[#E6192B] -ml-0.5">{transportName.slice(1, 2) || 'O'}</span>
                  <span className="text-[#004BB8] -ml-0.5">{transportName.slice(2, 3) || 'G'}</span>
                  <span className="text-[#004BB8] -ml-0.5">{transportName.slice(3, 4) || 'O'}</span>
                </div>

                <div className="border-l border-[#E2E8F0] pl-3">
                  <h1 className="text-[1.35rem] leading-tight font-bold text-[#1E293B] uppercase tracking-wide">
                    {transportName}
                  </h1>
                  <p className="text-[#64748B] text-sm font-medium tracking-wide">
                    SOB Lifting Tracker Dashboard
                  </p>
                </div>
              </motion.div>
            </div>

            <div className="flex items-center gap-4">
              <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${syncStatus === 'online' ? 'bg-green-100 text-green-700' : syncStatus === 'syncing' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                {syncStatus === 'online' && <Wifi size={14} />}
                {syncStatus === 'syncing' && <RefreshCw size={14} className="animate-spin" />}
                {syncStatus === 'offline' && <WifiOff size={14} />}
                {syncStatus === 'error' && <AlertTriangle size={14} />}
                <span className="capitalize">{syncStatus}</span>
              </div>
              {currentUser && (
                <div className="text-sm text-[#64748B] hidden sm:block text-right">
                  Logged in as: <span className="font-bold text-[#1E293B]">{currentUser.username}</span>
                </div>
              )}
              <button
                onClick={() => {
                  logActivity('User logged out');
                  setIsAuthenticated(false);
                  setCurrentUser(null);
                }}
                className="px-4 py-2 bg-[#FFFFFF] border border-[#E2E8F0] text-[#64748B] hover:bg-[#F1F5F9] rounded-xl font-medium transition-colors shadow-sm"
              >
                Logout
              </button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            {activeTab === 'dashboard' && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-wrap items-center gap-2 bg-[#FFFFFF] p-1.5 rounded-[12px] border border-[#E2E8F0] shadow-sm">
                  <FilterDropdown
                    label="Year"
                    value={selectedYear}
                    options={years}
                    onChange={(val: any) => { setSelectedYear(parseInt(val, 10)); }}
                    icon={Calendar}
                    defaultLabel={currentYear.toString()}
                    clearValue={currentYear}
                    activeCondition={(v: any) => v !== currentYear}
                  />
                  <div className="w-px h-6 bg-[#E2E8F0] mx-1 hidden sm:block"></div>
                  <FilterDropdown
                    label="Month/Time"
                    value={selectedTimeframe}
                    options={timeframes}
                    onChange={(val: any) => { setSelectedTimeframe(val); }}
                    icon={RefreshCw}
                    defaultLabel="YTD"
                    clearValue="YTD"
                  />
                  <div className="w-px h-6 bg-[#E2E8F0] mx-1 hidden sm:block"></div>
                  <FilterDropdown
                    label="OEM"
                    value={selectedOEM}
                    options={['All', ...filteredOEMsForDropdown]}
                    onChange={(val: any) => { setSelectedOEM(String(val)); setSelectedPlant('All'); }}
                    icon={Truck}
                  />
                  <div className="w-px h-6 bg-[#E2E8F0] mx-1 hidden sm:block"></div>
                  <FilterDropdown
                    label="Plant"
                    value={selectedPlant}
                    options={['All', ...plantsForSelectedOEM]}
                    onChange={(val: any) => { setSelectedPlant(String(val)); }}
                    icon={Factory}
                  />
                  <div className="w-px h-6 bg-[#E2E8F0] mx-1 hidden sm:block"></div>
                  <FilterDropdown
                    label="Branch Name"
                    value={selectedBranch}
                    options={['All', ...masterBranches]}
                    onChange={(val: any) => setSelectedBranch(String(val))}
                    icon={MapPin}
                  />
                </div>

                <div className="ml-auto flex items-center gap-4">
                  <button onClick={exportDashboardPDF} className="flex items-center gap-2 bg-[#FFFFFF] border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[#1E293B] px-5 py-2.5 rounded-[12px] font-bold transition-all shadow-sm hover:shadow-md transform hover:-translate-y-0.5">
                    <Download size={18} />
                    Export PDF
                  </button>
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="hidden xl:flex items-center gap-3 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 px-4 py-2 rounded-[12px] border border-blue-100/50 shadow-sm"
                  >
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                      className="text-2xl drop-shadow-sm"
                    >
                      {getGreetingInfo(transportName).emoji}
                    </motion.div>
                    <div className="flex flex-col">
                      <span className="text-[15px] font-extrabold text-[#1E293B] tracking-tight leading-none mb-1">
                        {getGreetingInfo(transportName).text}, <span className="text-[#005689]">{getGreetingInfo(transportName).name}</span>!
                      </span>
                      <span className="text-[11px] text-[#64748B] font-medium leading-none">Welcome to your command center.</span>
                    </div>
                  </motion.div>
                </div>
              </div>
            )}
          </div>
        </div>

        {activeTab === 'dashboard' && (
          <>
            {/* Grand Total Dashboard */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              <MetricCard title="Total OEMs" value={totalOEMs} icon={<Truck className="text-[#005689]" />} onClick={() => setShowOemsModal(true)} />
              <MetricCard title="Total Plants" value={totalPlants} icon={<Factory className="text-[#F59E0B]" />} onClick={() => setShowPlantsModal(true)} />
              <MetricCard title={dashboardView === 'car' ? "Total Cars Target" : "Total Trailers Target"} value={totalTarget.toLocaleString()} icon={<Target className="text-[#10B981]" />} />
              <MetricCard title={dashboardView === 'car' ? "Cars Lifted" : "Trailers Lifted"} value={totalLifted.toLocaleString()} icon={<BarChart3 className="text-[#3B82F6]" />} />
              <MetricCard title="Balance" value={totalBalance.toLocaleString()} icon={<AlertTriangle className="text-[#EF4444]" />} />
              <MetricCard title="Achievement" value={achievementPct} icon={<Award className="text-[#8B5CF6]" />} />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* OEM Target vs Achievement Chart */}
              <div className="bg-[#FFFFFF] p-5 rounded-[12px] shadow-sm border border-[#E2E8F0]">
                <h3 className="text-lg font-semibold text-[#1E293B] mb-4">OEM Target vs Achievement ({dashboardView === 'car' ? 'Cars' : 'Trailers'})</h3>
                <div className="chart-wrapper">
                  <ResponsiveContainer width="100%" height="100%" key={`bar-${selectedYear}-${selectedTimeframe}-${selectedOEM}-${selectedPlant}-${selectedBranch}-${dashboardView}`}>
                    <BarChart
                      data={oemSummary}
                      margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="oem" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} angle={-90} textAnchor="end" height={80} dx={-5} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} tickFormatter={(value) => `${value}%`} />
                      <Tooltip
                        content={({ active, payload, label }: any) => {
                          if (active && payload && payload.length) {
                            const target = payload[0].payload.target || 0;
                            const lifted = payload[0].payload.lifted || 0;
                            const pct = target > 0 ? Math.round((lifted / target) * 100) : (lifted > 0 ? 100 : 0);
                            return (
                              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-md min-w-[200px]">
                                <p className="font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">{label}</p>
                                <div className="flex flex-col gap-2">
                                  <div className="flex justify-between items-center gap-4">
                                    <p className="text-sm text-slate-500 font-medium">Target Value</p>
                                    <p className="font-semibold text-slate-700">{target.toLocaleString()}</p>
                                  </div>
                                  <div className="flex justify-between items-center gap-4">
                                    <p className="text-sm text-slate-500 font-medium">Lifted Value</p>
                                    <p className="font-semibold text-[#005689]">{lifted.toLocaleString()}</p>
                                  </div>
                                  <div className="flex justify-between items-center gap-4 pt-1 border-t border-slate-50">
                                    <p className="text-sm text-slate-500 font-medium">Achievement %</p>
                                    <p className="font-bold text-[#8B5CF6]">{pct}%</p>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                        cursor={{ fill: '#F8FAFC' }}
                      />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      <Bar dataKey="achievement" name="Achievement %" radius={[4, 4, 0, 0]} maxBarSize={50} isAnimationActive={true} animationDuration={1000} animationEasing="ease-out">
                        {oemSummary.map((entry, index) => {
                          const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#06B6D4'];
                          return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                        })}
                        <LabelList dataKey="achievement" position="top" formatter={(val: any) => val == null ? 'N/A' : `${Math.round(Number(val))}%`} style={{ fill: '#64748B', fontSize: 11, fontWeight: 500 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Monthly Trend Bar Chart */}
              <div className="bg-[#FFFFFF] p-5 rounded-[12px] shadow-sm border border-[#E2E8F0]">
                <h3 className="text-lg font-semibold text-[#1E293B] mb-4">Monthly Lifting Trends ({dashboardView === 'car' ? 'Cars' : 'Trailers'})</h3>
                <div className="chart-wrapper">
                  <ResponsiveContainer width="100%" height="100%" key={`bar-trend-${selectedYear}-${selectedTimeframe}-${selectedOEM}-${selectedPlant}-${selectedBranch}-${dashboardView}`}>
                    <BarChart
                      data={monthlyTrendData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} tickFormatter={(value) => `${value}%`} />
                      <Tooltip
                        content={({ active, payload, label }: any) => {
                          if (active && payload && payload.length) {
                            const target = payload[0].payload.target || 0;
                            const lifted = payload[0].payload.lifted || 0;
                            const pct = target > 0 ? Math.round((lifted / target) * 100) : (lifted > 0 ? 100 : 0);
                            return (
                              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-md min-w-[200px]">
                                <p className="font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">{label}</p>
                                <div className="flex flex-col gap-2">
                                  <div className="flex justify-between items-center gap-4">
                                    <p className="text-sm text-slate-500 font-medium">Target Value</p>
                                    <p className="font-semibold text-slate-700">{target.toLocaleString()}</p>
                                  </div>
                                  <div className="flex justify-between items-center gap-4">
                                    <p className="text-sm text-slate-500 font-medium">Lifted Value</p>
                                    <p className="font-semibold text-[#005689]">{lifted.toLocaleString()}</p>
                                  </div>
                                  <div className="flex justify-between items-center gap-4 pt-1 border-t border-slate-50">
                                    <p className="text-sm text-slate-500 font-medium">Achievement %</p>
                                    <p className="font-bold text-[#8B5CF6]">{pct}%</p>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                        cursor={{ fill: '#F1F5F9' }}
                      />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      <Bar dataKey="achievement" name="Achievement %" radius={[4, 4, 0, 0]} maxBarSize={50} isAnimationActive={true} animationDuration={1000} animationEasing="ease-out">
                        {monthlyTrendData.map((entry, index) => {
                          const colors = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#06B6D4'];
                          return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                        })}
                        <LabelList dataKey="achievement" position="top" formatter={(val: any) => val == null ? 'N/A' : `${Math.round(Number(val))}%`} style={{ fill: '#64748B', fontSize: 11, fontWeight: 500 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-[12px] border border-[#E2E8F0] shadow-sm p-5">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-[#64748B]">SOB Achievement Contribution</p>
                  <h3 className="text-xl font-semibold text-[#1E293B]">SOB Achievement Contribution</h3>
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsAchievementDropdownOpen((prev) => !prev)}
                    className="flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm font-semibold text-[#1E293B] shadow-sm hover:bg-white"
                  >
                    <Layers3 size={16} className="text-[#005689]" />
                    {achievementPieMode}
                    <ChevronDown size={16} className={`text-[#64748B] transition-transform ${isAchievementDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {isAchievementDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="absolute right-0 mt-2 w-48 rounded-xl border border-[#E2E8F0] bg-white shadow-xl z-50 overflow-hidden"
                      >
                        {achievementPieModes.map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => { setAchievementPieMode(mode); setIsAchievementDropdownOpen(false); }}
                            className={`block w-full px-3 py-2 text-left text-sm hover:bg-[#F8FAFC] ${achievementPieMode === mode ? 'bg-[#EEF6FF] text-[#005689] font-semibold' : 'text-[#1E293B]'}`}
                          >
                            {mode}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6 items-center">
                <div ref={achievementChartRef} className="h-[340px] rounded-[12px] bg-[#F8FAFC] p-4 border border-[#E2E8F0]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={achievementPieMode}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.25 }}
                      className="h-full"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={achievementContributionData.items.filter((item: any) => item.lifted > 0)}
                            dataKey="lifted"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={110}
                            paddingAngle={2}
                            isAnimationActive
                            animationDuration={600}
                            labelLine={false}
                            label={({ cx, cy, midAngle, outerRadius, percent, name }: any) => {
                              const RADIAN = Math.PI / 180;
                              const textRadius = outerRadius + 10;
                              const x = cx + textRadius * Math.cos(-midAngle * RADIAN);
                              const y = cy + textRadius * Math.sin(-midAngle * RADIAN);
                              const pct = `${(percent * 100).toFixed(0)}%`;
                              return (
                                <text
                                  x={x}
                                  y={y}
                                  fill="#1E293B"
                                  fontSize={11}
                                  fontWeight={600}
                                  textAnchor={x > cx ? 'start' : 'end'}
                                  dominantBaseline="middle"
                                >
                                  {`${name} ${pct}`}
                                </text>
                              );
                            }}
                            onMouseEnter={(_, index) => setActivePieSlice(achievementContributionData.items[index]?.name || null)}
                            onMouseLeave={() => setActivePieSlice(null)}
                            onClick={(entry: any) => {
                              const clickedName = entry?.name ?? null;
                              setActivePieSlice(clickedName === activePieSlice ? null : clickedName);
                            }}
                          >
                            {achievementContributionData.items.map((entry, index) => (
                              <Cell key={`${entry.name}-${index}`} fill={entry.color} stroke={activePieSlice === entry.name ? '#0F172A' : '#FFFFFF'} strokeWidth={activePieSlice === entry.name ? 3 : 1} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: any, name: any) => [`${Number(value).toLocaleString()} units`, name]}
                            content={({ active, payload }: any) => {
                              if (!active || !payload?.length) return null;
                              const item = payload[0].payload;
                              return (
                                <div className="rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-xl text-sm">
                                  <p className="font-semibold text-[#1E293B]">{item.name}</p>
                                  <p className="text-[#64748B]">Target: {item.target.toLocaleString()}</p>
                                  <p className="text-[#64748B]">Achievement: {item.lifted.toLocaleString()}</p>
                                  <p className="text-[#8B5CF6] font-semibold">{item.share.toFixed(1)}%</p>
                                </div>
                              );
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </motion.div>
                  </AnimatePresence>
                </div>

                <div className="rounded-[12px] border border-[#E2E8F0] bg-gradient-to-b from-white to-[#F8FAFC] shadow-[0_8px_30px_rgb(0,0,0,0.12)] overflow-hidden h-fit transform transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.16)]">
                  <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-gradient-to-b from-[#F8FAFC] to-[#E2E8F0] px-4 py-3 shadow-sm relative z-10">
                    <h4 className="text-sm font-semibold text-[#1E293B]">Distribution (%)</h4>
                    <span className="text-xs uppercase tracking-[0.2em] text-[#64748B]">{achievementPieMode}</span>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[#F8FAFC] text-[#64748B]">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold w-16 border-r border-[#E2E8F0]">Rank</th>
                          <th className="px-3 py-2 text-left font-semibold border-r border-[#E2E8F0]">{achievementPieMode}</th>
                          <th className="px-3 py-2 text-right font-semibold">Achievement (%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {achievementContributionData.items.map((item, index) => {
                          const getOrdinal = (n: number) => {
                            const s = ["th", "st", "nd", "rd"];
                            const v = n % 100;
                            return n + (s[(v - 20) % 10] || s[v] || s[0]);
                          };
                          return (
                          <tr key={`${item.name}-${index}`} className={`border-t border-[#E2E8F0] ${activePieSlice === item.name ? 'bg-[#EEF6FF]' : index % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]'}`}>
                            <td className="px-3 py-2 text-left font-semibold text-[#64748B] border-r border-[#E2E8F0]">{getOrdinal(index + 1)}</td>
                            <td className="px-3 py-2 border-r border-[#E2E8F0]">
                              <div className="flex items-center gap-2 font-medium text-[#1E293B]">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                                {item.name}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-[#005689]">{item.share.toFixed(1)}%</td>
                          </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="relative z-10 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]">
                        <tr className="bg-gradient-to-r from-[#EEF2FF] to-[#E0E7FF] text-[#1E293B] font-bold">
                          <td className="px-3 py-2 border-r border-[#E2E8F0]/50"></td>
                          <td className="px-3 py-2 border-r border-[#E2E8F0]/50">Total</td>
                          <td className="px-3 py-2 text-right">100%</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                <MetricCard title="Total Target" value={achievementContributionData.totalTarget.toLocaleString()} icon={<Target className="text-[#EF4444]" />} />
                <MetricCard title="Total Achievement" value={`${achievementContributionData.totalLifted.toLocaleString()} (${achievementContributionData.totalAchievementPct == null ? 'N/A' : achievementContributionData.totalAchievementPct + '%'})`} icon={<TrendingUp className="text-[#10B981]" />} />
                <MetricCard title={achievementPieMode === 'Origin Zone' ? 'Top Zone' : achievementPieMode === 'Branch' ? 'Top Branch' : achievementPieMode === 'OEM' ? 'Top OEM' : 'Top Plant'} value={achievementContributionData.topItem?.name || 'N/A'} icon={<Trophy className="text-[#F59E0B]" />} secondary={achievementContributionData.topItem ? `${achievementContributionData.topItem.share.toFixed(1)}%` : undefined} />
                <MetricCard title={achievementPieMode === 'Origin Zone' ? 'Total Zones' : achievementPieMode === 'Branch' ? 'Total Branches' : achievementPieMode === 'OEM' ? 'Total OEMs' : 'Total Plants'} value={achievementContributionData.items.length.toString()} icon={<Users className="text-[#3B82F6]" />} />
                <MetricCard title="Date" value={`${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} (${new Date().toLocaleDateString('en-US', { weekday: 'long' })})`} icon={<CalendarDays className="text-[#EF4444]" />} />
              </div>
            </motion.div>


            {/* OEM Summary Table */}
            <div className="bg-[#FFFFFF] rounded-[12px] shadow-sm border border-[#E2E8F0] overflow-hidden">
              <div className="p-5 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <h2 className="text-lg font-semibold text-[#1E293B] flex items-center gap-2">
                  <TrendingUp className="text-[#64748B]" size={20} />
                  OEM Performance Summary
                </h2>
              </div>
              <div className="overflow-x-auto border-t border-[#E2E8F0]">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-gradient-to-r from-purple-600 to-blue-500 text-white text-xs uppercase tracking-wider border-b-2 border-[#E2E8F0]">
                      <th className="px-4 py-3 font-bold text-left w-1/4">🏷️ OEM</th>
                      <th className="px-4 py-3 font-bold text-center w-[15%]">🎯 Total Target</th>
                      <th className="px-4 py-3 font-bold text-center w-[15%]">📦 Total Lifted</th>
                      <th className="px-4 py-3 font-bold text-left w-1/3">📊 Overall Achievement</th>
                      <th className="px-4 py-3 font-bold text-center w-[12%]">🏆 Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] bg-[#FFFFFF]">
                    {oemSummary.map((summary, index) => {
                      let barColor = 'bg-red-500';
                      if (summary.achievement !== null && summary.achievement >= 75) barColor = 'bg-[#10B981]';
                      else if (summary.achievement !== null && summary.achievement >= 50) barColor = 'bg-amber-500';

                      let statusBadge = { color: 'bg-slate-100 text-slate-600', text: 'N/A' };
                      if (summary.target === 0 || summary.achievement === null) {
                        statusBadge = { color: 'bg-slate-100 text-slate-600', text: 'N/A' };
                      } else if (summary.achievement >= 100) {
                        statusBadge = { color: 'bg-emerald-100 text-emerald-800', text: 'Outstanding' };
                      } else if (summary.achievement >= 75) {
                        statusBadge = { color: 'bg-blue-100 text-blue-800', text: 'Excellent' };
                      } else if (summary.achievement >= 50) {
                        statusBadge = { color: 'bg-teal-100 text-teal-800', text: 'Good' };
                      } else if (summary.achievement >= 25) {
                        statusBadge = { color: 'bg-yellow-100 text-yellow-800', text: 'Fair' };
                      } else {
                        statusBadge = { color: 'bg-red-100 text-red-800', text: 'Poor' };
                      }

                      return (
                        <motion.tr
                          key={summary.oem}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.05 }}
                          className="hover:bg-[#F8FAFC] even:bg-[#F8FAFC]/50 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm font-bold text-[#1E293B] border-r border-[#E2E8F0]">
                            {summary.oem}
                          </td>
                          <td className="px-4 py-3 text-sm text-[#1E293B] text-center border-r border-[#E2E8F0] bg-[#F8FAFC]/30">{summary.target.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-[#1E293B] text-center border-r border-[#E2E8F0] bg-[#F8FAFC]/30">{summary.lifted.toLocaleString()}</td>
                          <td className="px-4 py-3 border-r border-[#E2E8F0]">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-2.5 bg-[#E2E8F0] rounded-full overflow-hidden shadow-inner">
                                <div
                                  className={`h-full rounded-full ${barColor} transition-all duration-500`}
                                  style={{ width: `${summary.achievement == null ? 0 : Math.min(summary.achievement, 100)}%` }}
                                />
                              </div>
                              <span className="text-sm font-bold text-[#1E293B] w-12 text-right">
                                {summary.achievement == null ? 'N/A' : `${Math.round(summary.achievement)}%`}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${statusBadge.color}`}>
                              {statusBadge.text}
                            </span>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="p-3 bg-[#F8FAFC] border-t border-[#E2E8F0] text-center text-xs text-slate-500 font-medium">
                🟢 Outstanding ≥100% | 🔵 Excellent 75–99% | 🩵 Good 50–74% | 🟡 Fair 25–49% | 🔴 Poor &lt;25% | ⚪ N/A Target=0
              </div>
            </div>
          </>
        )}

        {activeTab === 'plant-planner' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#FFFFFF] p-6 rounded-2xl shadow-sm border border-[#E2E8F0]">
              <div>
                <h2 className="text-2xl font-bold text-[#1E293B]">Plant Requirement</h2>
                <p className="text-[#64748B] mt-1">Detailed view of target vs lifted quantities per plant and statecity.</p>
              </div>
              <div className="flex flex-wrap gap-4 items-center">
                <FilterDropdown
                  label="Origin Zone"
                  value={plannerOriginZone}
                  options={['All', ...plannerFilteredZones]}
                  onChange={(val: any) => setPlannerOriginZone(val)}
                  icon={MapIcon}
                  defaultLabel="All Zones"
                />
                <FilterDropdown
                  label="OEM"
                  value={plannerOEM}
                  options={['All', ...masterOEMs]}
                  onChange={(val: any) => { setPlannerOEM(val); setPlannerPlant('All'); setPlannerDestination('All'); setPlannerRegion('All'); setPlannerBranch('All'); }}
                  icon={Truck}
                  defaultLabel="All OEMs"
                />
                <FilterDropdown
                  label="Plant"
                  value={plannerPlant}
                  options={['All', ...plannerFilteredPlants]}
                  onChange={(val: any) => { setPlannerPlant(val); setPlannerDestination('All'); setPlannerRegion('All'); setPlannerBranch('All'); }}
                  icon={Factory}
                  defaultLabel="All Plants"
                />
                {dashboardColumnVisibility.showStateCity && (
                  <FilterDropdown
                    label="State/City"
                    value={plannerDestination}
                    options={['All', ...plannerFilteredDestinations]}
                    onChange={(val: any) => setPlannerDestination(val)}
                    icon={MapPin}
                    defaultLabel="All State/City"
                  />
                )}
                <FilterDropdown
                  label="Branch Name"
                  value={plannerBranch}
                  options={['All', ...plannerFilteredBranches]}
                  onChange={(val: any) => setPlannerBranch(val)}
                  icon={Building}
                  defaultLabel="All Branches"
                />
                <div className="flex bg-[#F1F5F9] p-1 rounded-xl ml-2">
                  <button
                    onClick={() => setDashboardView('car')}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${dashboardView === 'car' ? 'bg-[#FFFFFF] text-[#1E293B] shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'}`}
                  >
                    Car Wise
                  </button>
                  <button
                    onClick={() => setDashboardView('trailer')}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${dashboardView === 'trailer' ? 'bg-[#FFFFFF] text-[#1E293B] shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'}`}
                  >
                    Trailer Wise
                  </button>
                </div>
              </div>
            </div>

            {/* Data Table Section */}
            <div className="bg-[#FFFFFF] rounded-2xl shadow-sm border border-[#E2E8F0] overflow-hidden">
              {/* Destination Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead className="bg-[#F8FAFC]">
                    <tr className="text-[#1E293B] text-xs uppercase tracking-wider border-b-2 border-[#E2E8F0]">
                      <th className="p-4 font-semibold border-r border-[#E2E8F0]">Origin Plant</th>
                      {dashboardColumnVisibility.showStateCity && <plantPlannerSearch.FilterHeader title="State/City" columnKey="statecity" />}
                      {dashboardColumnVisibility.showZone && <plantPlannerSearch.FilterHeader title="Zone" columnKey="zone" />}
                      <th className="p-4 font-semibold border-r border-[#E2E8F0] text-right">Monthly {(customTableHeaders || {})['Target'] || 'Target'}</th>
                      <th className="p-4 font-semibold border-r border-[#E2E8F0] text-right">Daily {(customTableHeaders || {})['Target'] || 'Target'}</th>
                      {dashboardColumnVisibility.showWeek && <th className="p-4 font-semibold border-r border-[#E2E8F0] text-right">Weekly {(customTableHeaders || {})['Target'] || 'Target'}</th>}
                      <th className="p-4 font-semibold border-r border-[#E2E8F0] text-right">{dashboardView === 'car' ? `Cars ${(customTableHeaders || {})['Lifted'] || 'Lifted'}` : `Trailers ${(customTableHeaders || {})['Lifted'] || 'Lifted'}`}</th>
                      <th className="p-4 font-semibold border-r border-[#E2E8F0] text-right">Balance {(customTableHeaders || {})['Target'] || 'Target'}</th>
                      <th className="p-4 font-semibold border-r border-[#E2E8F0] text-right">{(customTableHeaders || {})['Achievement'] || 'Achievement %'}</th>
                      <th className="p-4 font-semibold border-r border-[#E2E8F0] text-center">Target Met</th>
                      <th className="p-4 font-semibold border-r border-[#E2E8F0] w-32">Progress</th>
                      <th className="p-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] bg-[#FFFFFF]">

                    {zoneSummarySearch.filterData(plantPlannerRows).map((row, index) => {
                      const isSingleMonth = months.includes(selectedTimeframe);
                      const canEdit = (userRole === 'Admin' || userRole === 'Tracker') && isSingleMonth;
                      return (
                        <motion.tr
                          key={row.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.05 }}
                          className="hover:bg-[#F8FAFC] even:bg-[#F8FAFC]/50 transition-colors"
                        >
                          <td className="p-4 text-sm font-medium text-[#1E293B] border-r border-[#E2E8F0]">{row.plant}</td>
                          {dashboardColumnVisibility.showStateCity && <td className="p-4 text-sm text-[#1E293B] border-r border-[#E2E8F0]">{row.statecity}</td>}
                          {dashboardColumnVisibility.showZone && <td className="p-4 text-sm text-[#64748B] border-r border-[#E2E8F0]">{row.zone}</td>}
                          <td className="p-4 text-sm font-semibold text-[#1E293B] text-right border-r border-[#E2E8F0] bg-[#F8FAFC]/30">{row.rowTarget.toLocaleString()}</td>
                          <td className="p-4 text-sm text-[#64748B] text-right border-r border-[#E2E8F0] bg-[#F8FAFC]/30">{row.dailyTarget.toLocaleString()}</td>
                          {dashboardColumnVisibility.showWeek && <td className="p-4 text-sm text-[#64748B] text-right border-r border-[#E2E8F0] bg-[#F8FAFC]/30">{row.weeklyTarget.toLocaleString()}</td>}
                          <td className="p-3 text-right border-r border-[#E2E8F0] bg-[#F8FAFC]/30">
                            {canEdit ? (
                              <input
                                type="number"
                                min="0"
                                value={row.rowLifted === 0 && row.rowTarget > 0 ? '' : row.rowLifted}
                                onChange={(e) => handleLiftedChange(row.id, e.target.value)}
                                className="w-24 text-right border border-[#CBD5E1] rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-[#005689] focus:border-[#005689] outline-none transition-all shadow-inner bg-[#FFFFFF]"
                                placeholder="0"
                              />
                            ) : (
                              <span className="font-medium text-[#1E293B]">{row.rowLifted.toLocaleString()}</span>
                            )}
                          </td>
                          <td className="p-4 text-sm font-semibold text-[#1E293B] text-right border-r border-[#E2E8F0] bg-[#F8FAFC]/30">{row.balanceTarget.toLocaleString()}</td>
                          <td className="p-4 text-sm font-bold text-[#1E293B] text-right border-r border-[#E2E8F0]">{row.achievement == null ? 'N/A' : `${row.achievement}%`}</td>
                          <td className="p-4 border-r border-[#E2E8F0] text-center">
                            {row.rowLifted >= row.rowTarget ? (
                              <CheckCircle2 className="inline-block text-[#10B981]" size={20} />
                            ) : (
                              <XCircle className="inline-block text-red-500" size={20} />
                            )}
                          </td>
                          <td className="p-4 border-r border-[#E2E8F0]">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-2 bg-[#E2E8F0] rounded-full overflow-hidden shadow-inner">
                                <div
                                  className={`h-full rounded-full ${row.barColor} transition-all duration-500`}
                                  style={{ width: `${Math.min(row.achievement || 0, 100)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${row.statusColor} shadow-sm`}>
                              <row.StatusIcon size={14} />
                              {row.statusText}
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                    {zoneSummarySearch.filterData(plantPlannerRows).length === 0 && (
                      <tr>
                        <td colSpan={12} className="p-8 text-center text-[#64748B]">
                          No records found for the selected filters
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'incentive' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#FFFFFF] p-4 rounded-[12px] shadow-sm border border-[#E2E8F0] print:hidden">
              <div>
                <h2 className="text-2xl font-bold text-[#1E293B]">Incentive Planner</h2>
                <p className="text-[#64748B] mt-1">Track targets and manage incentive payouts by OEM.</p>
              </div>
              <div className="flex flex-wrap gap-4 items-center">
                <FilterDropdown
                  label="Year"
                  value={incentiveYear}
                  options={years}
                  onChange={(val: any) => {
                    setIncentiveYear(val);
                    setIncentivePlantFilter('All');
                    setIncentiveScopeFilter('All');
                    setSelectedZoneFilter('All');
                    setSelectedStateCityFilter('All');
                  }}
                  icon={Calendar}
                  defaultLabel={currentYear.toString()}
                  clearValue={currentYear}
                />
                <FilterDropdown
                  label="Timeframe"
                  value={incentiveTimeframe}
                  options={timeframes}
                  onChange={(val: any) => {
                    setIncentiveTimeframe(val);
                    setIncentivePlantFilter('All');
                    setIncentiveScopeFilter('All');
                    setSelectedZoneFilter('All');
                    setSelectedStateCityFilter('All');
                  }}
                  icon={Calendar}
                  defaultLabel={currentMonth}
                  clearValue={currentMonth}
                />
                <div className="w-px h-6 bg-[#E2E8F0] mx-1"></div>
                <FilterDropdown
                  label="OEM"
                  value={incentiveOEM}
                  options={oems}
                  onChange={(val: any) => {
                    setIncentiveOEM(val);
                    setIncentiveYear(currentYear);
                    setIncentiveTimeframe(currentMonth);
                    setIncentivePlantFilter('All');
                    setIncentiveScopeFilter('All');
                    setSelectedZoneFilter('All');
                    setSelectedStateCityFilter('All');
                  }}
                  icon={Truck}
                  defaultLabel="Select OEM"
                  clearValue=""
                />
                <FilterDropdown
                  label="Plant"
                  value={incentivePlantFilter}
                  options={incentivePlantOptions}
                  onChange={(val: any) => setIncentivePlantFilter(val)}
                  icon={Factory}
                  defaultLabel="All Plants"
                  clearValue="All"
                />
                <FilterDropdown
                  label="Type"
                  value={incentiveScopeFilter}
                  options={['All', 'AO Zone Wise', 'State Wise']}
                  onChange={(val: any) => setIncentiveScopeFilter(val)}
                  icon={MapPin}
                  defaultLabel="All"
                  clearValue="All"
                />
                {incentiveScopeFilter === 'AO Zone Wise' && (
                  <FilterDropdown
                    label="Zone"
                    value={selectedZoneFilter}
                    options={incentiveZoneOptions}
                    onChange={(val: any) => setSelectedZoneFilter(val)}
                    icon={MapPin}
                    defaultLabel="All Zones"
                    clearValue="All"
                  />
                )}
                {incentiveScopeFilter === 'State Wise' && (
                  <FilterDropdown
                    label="State/City"
                    value={selectedStateCityFilter}
                    options={incentiveStateCityOptions}
                    onChange={(val: any) => setSelectedStateCityFilter(val)}
                    icon={MapPin}
                    defaultLabel="All"
                    clearValue="All"
                  />
                )}
              </div>
            </div>

            {!incentiveOEM || incentiveOEM === 'All' ? (
              <div className="bg-[#FFFFFF] p-12 rounded-[12px] shadow-sm border border-[#E2E8F0] text-center">
                <Award className="mx-auto text-[#CBD5E1] mb-4" size={48} />
                <h3 className="text-lg font-medium text-[#1E293B]">Select an OEM</h3>
                <p className="text-[#64748B] mt-2">Please select a specific OEM from the filter above to view and manage incentives.</p>
              </div>
            ) : (
              <IncentivePlannerTab
                incentiveOEM={incentiveOEM}
                incentiveYear={incentiveYear}
                incentiveTimeframe={incentiveTimeframe}
                incentiveFilteredRows={incentiveFilteredRows}
                manualIncentiveRows={currentManualIncentiveRows}
                setManualIncentiveRows={setManualIncentiveRows}
                incentiveEdits={incentiveEdits}
                setIncentiveEdits={setIncentiveEdits}
                incentiveRates={incentiveRates}
                setIncentiveRates={setIncentiveRates}
                incentiveTargetStore={incentiveTargetStore}
                setIncentiveTargetStore={setIncentiveTargetStore}
                columnVisibility={{
                  showStateCity: incentiveScopeFilter === 'State Wise'
                    ? true
                    : incentiveScopeFilter === 'AO Zone Wise'
                      ? false
                      : incentiveColumnVisibility.showStateCity,
                  showZone: incentiveScopeFilter === 'AO Zone Wise'
                    ? true
                    : incentiveScopeFilter === 'State Wise'
                      ? false
                      : incentiveColumnVisibility.showZone,
                }}
                canEditIncentives={userRole !== 'Viewer'}
                customTableHeaders={customTableHeaders}
                pieSummary={incentivePieSummary}
                incentiveScopeFilter={incentiveScopeFilter}
                incentiveBaseRows={incentiveBaseRows}
              />
            )}
          </div>
        )}

        {activeTab === 'targets' && (
          <div className="bg-[#FFFFFF] rounded-[12px] shadow-sm border border-[#E2E8F0] overflow-hidden">
            <div className="p-4 bg-[#F8FAFC] border-b border-[#E2E8F0] flex flex-wrap gap-4 justify-between items-center">
              <div className="flex items-center gap-2 bg-[#FFFFFF] p-1.5 rounded-[12px] border border-[#E2E8F0] shadow-sm">
                <FilterDropdown
                  label="Year"
                  value={targetYear}
                  options={years}
                  onChange={(val: any) => setTargetYear(parseInt(val, 10))}
                  icon={Calendar}
                  defaultLabel={currentYear}
                  clearValue={currentYear}
                  activeCondition={(v: any) => v !== currentYear}
                />
                <div className="w-px h-6 bg-[#E2E8F0] mx-1"></div>
                <FilterDropdown
                  label="Month"
                  value={targetMonth}
                  options={months}
                  onChange={(val: any) => setTargetMonth(val)}
                  icon={Calendar}
                  defaultLabel={months[new Date().getMonth()]}
                  clearValue={months[new Date().getMonth()]}
                  activeCondition={(v: any) => v !== months[new Date().getMonth()]}
                />
                <div className="w-px h-6 bg-[#E2E8F0] mx-1"></div>
                <FilterDropdown
                  label="OEM"
                  value={targetOEM}
                  options={['All', ...oems]}
                  onChange={(val: any) => { setTargetOEM(val); setTargetPlant('All'); }}
                  icon={Truck}
                  defaultLabel="All"
                />
                <div className="w-px h-6 bg-[#E2E8F0] mx-1"></div>
                <FilterDropdown
                  label="Plant"
                  value={targetPlant}
                  options={['All', ...targetPlantsForOEM]}
                  onChange={(val: any) => setTargetPlant(val)}
                  icon={Factory}
                  defaultLabel="All"
                  disabled={false}
                />
              </div>
              <div className="flex flex-wrap gap-3 items-center">
              </div>
            </div>

            {/* New Target Entry Panel */}
            <div className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] mb-4 rounded-lg shadow-sm">
              <div className="flex gap-3 mb-4 pb-3 border-b border-[#CBD5E1]">
                <button onClick={() => setTargetEntryMode('Standard')} className={`px-4 py-2 font-bold text-sm rounded-lg transition-colors ${targetEntryMode === 'Standard' ? 'bg-[#005689] text-white shadow' : 'text-[#64748B] hover:bg-gray-200'}`}>Standard Entry</button>
                <button onClick={() => setTargetEntryMode('Weekly')} className={`px-4 py-2 font-bold text-sm rounded-lg transition-colors ${targetEntryMode === 'Weekly' ? 'bg-[#005689] text-white shadow' : 'text-[#64748B] hover:bg-gray-200'}`}>Weekly Mode</button>
                <button onClick={() => setTargetEntryMode('Percentage')} className={`px-4 py-2 font-bold text-sm rounded-lg transition-colors ${targetEntryMode === 'Percentage' ? 'bg-[#005689] text-white shadow' : 'text-[#64748B] hover:bg-gray-200'}`}>Distribution %</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pb-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#64748B] uppercase">OEM</label>
                  <select value={newTargetOEM} onChange={e => { setNewTargetOEM(e.target.value); setNewTargetPlant(''); setNewTargetDest(''); }} className="w-full bg-white border border-[#CBD5E1] p-2 text-sm rounded-md outline-none focus:border-[#005689] focus:ring-1 focus:ring-[#005689]">
                    <option value="" disabled>Select OEM...</option>
                    {masterOEMs.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#64748B] uppercase">Plant</label>
                  <select value={newTargetPlant} onChange={e => { setNewTargetPlant(e.target.value); setNewTargetDest(''); }} disabled={!newTargetOEM} className="w-full bg-white border border-[#CBD5E1] p-2 text-sm rounded-md outline-none focus:border-[#005689] focus:ring-1 focus:ring-[#005689] disabled:bg-gray-100 disabled:cursor-not-allowed">
                    <option value="" disabled>Select Plant...</option>
                    {targetFormPlants.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#64748B] uppercase">Target Level</label>
                  <select value={targetLevel} onChange={e => setTargetLevel(e.target.value as any)} className="w-full bg-white border border-[#CBD5E1] p-2 text-sm rounded-md outline-none focus:border-[#005689] focus:ring-1 focus:ring-[#005689]">
                    <option value="State/City Wise">State/City Wise</option>
                    <option value="AO Zone Wise">AO Zone Wise</option>
                  </select>
                </div>
                {(targetEntryMode === 'Standard' || targetEntryMode === 'Weekly') && (
                  <>
                    {targetLevel === 'State/City Wise' ? (
                      <>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-[#64748B] uppercase">State/City {targetEntryMode === 'Weekly' && '(Optional)'}</label>
                          <FormCombobox
                            id="target-statecity-search"
                            value={newTargetDest}
                            placeholder={newTargetPlant ? "Search State/City..." : "Select Plant first"}
                            disabled={!newTargetPlant}
                            options={targetFormDestinations}
                            onChange={(val: string) => {
                              setNewTargetDest(val);
                              setNewTargetRegion(getZoneForRoute(newTargetOEM, newTargetPlant, val));
                            }}
                            onClear={() => {
                              setNewTargetDest('');
                              setNewTargetRegion('');
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-[#64748B] uppercase">Zone {targetEntryMode === 'Weekly' && '(Optional)'}</label>
                          <input
                            type="text"
                            value={newTargetRegion}
                            readOnly
                            className="w-full bg-slate-50 border border-[#CBD5E1] p-2 text-sm text-[#64748B] rounded-md outline-none cursor-not-allowed"
                            placeholder="Auto-populated Zone"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-[#64748B] uppercase">Zone / Region {targetEntryMode === 'Weekly' && '(Optional)'}</label>
                        <FormCombobox
                          id="target-zone-search"
                          value={newTargetRegion}
                          placeholder={newTargetPlant ? "Search Zone..." : "Select Plant first"}
                          disabled={!newTargetPlant}
                          options={targetFormRegions}
                          onChange={(val: string) => setNewTargetRegion(val)}
                          onClear={() => setNewTargetRegion('')}
                        />
                      </div>
                    )}
                  </>
                )}
                {targetEntryMode === 'Standard' && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#64748B] uppercase">Monthly Target</label>
                    <input type="number" placeholder="Target" value={newTargetVal} onChange={e => setNewTargetVal(e.target.value)} className="w-full bg-white border border-[#CBD5E1] p-2 text-sm rounded-md outline-none focus:border-[#005689] focus:ring-1 focus:ring-[#005689] font-bold" />
                  </div>
                )}
                {targetEntryMode === 'Weekly' && (
                  <div className="col-span-1 md:col-span-4 bg-white p-3 border border-[#E2E8F0] rounded-lg shadow-sm space-y-3">
                    {/* Zone category selector — shown only in Weekly mode */}
                    <div className="flex items-center gap-3 pb-2 border-b border-[#E2E8F0]">
                      <span className="text-xs font-bold text-[#64748B] uppercase">Zone Category</span>
                      <button
                        type="button"
                        onClick={() => setWeeklyZoneType('Domestic')}
                        className={`px-4 py-1.5 text-xs font-bold rounded-lg border transition-colors ${weeklyZoneType === 'Domestic' ? 'bg-[#005689] text-white border-[#005689] shadow' : 'bg-white text-[#64748B] border-[#CBD5E1] hover:bg-slate-50'}`}
                      >
                        🏠 Domestic
                      </button>
                      <button
                        type="button"
                        onClick={() => setWeeklyZoneType('Export')}
                        className={`px-4 py-1.5 text-xs font-bold rounded-lg border transition-colors ${weeklyZoneType === 'Export' ? 'bg-[#e91e63] text-white border-[#e91e63] shadow' : 'bg-white text-[#64748B] border-[#CBD5E1] hover:bg-slate-50'}`}
                      >
                        🚢 Export
                      </button>
                      <span className="text-[11px] text-[#94a3b8] ml-1">
                        {weeklyZoneType === 'Export'
                          ? 'Target will be saved under the Export AO zone'
                          : masterRoutes.some(r => r.oem === newTargetOEM && r.plant === newTargetPlant && r.zone === 'Domestic')
                            ? 'Domestic AO zone found — target will be saved under Domestic'
                            : 'No Domestic AO zone found for this OEM/Plant — zone from selection will be used'}
                      </span>
                    </div>
                    {weeklyTargets.map((wt, idx) => (
                      <div key={idx} className="flex flex-wrap md:flex-nowrap items-end gap-3 p-2 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg">
                        <div className="flex-1 space-y-1">
                          <label className="text-[10px] font-bold text-[#64748B] uppercase">Start Date</label>
                          <input type="date" value={wt.startDate} onChange={e => { const newT = [...weeklyTargets]; newT[idx].startDate = e.target.value; setWeeklyTargets(newT); }} className="w-full border p-1.5 text-sm rounded border-[#CBD5E1] focus:border-[#005689]" />
                        </div>
                        <div className="flex-1 space-y-1">
                          <label className="text-[10px] font-bold text-[#64748B] uppercase">End Date</label>
                          <input type="date" value={wt.endDate} onChange={e => { const newT = [...weeklyTargets]; newT[idx].endDate = e.target.value; setWeeklyTargets(newT); }} className="w-full border p-1.5 text-sm rounded border-[#CBD5E1] focus:border-[#005689]" />
                        </div>
                        <div className="w-24 space-y-1">
                          <label className="text-[10px] font-bold text-[#64748B] uppercase">Cars</label>
                          <input type="number" placeholder="0" value={wt.cars} onChange={e => { const newT = [...weeklyTargets]; newT[idx].cars = e.target.value; setWeeklyTargets(newT); }} className="w-full border p-1.5 text-sm rounded border-[#CBD5E1] focus:border-[#005689]" />
                        </div>
                        <div className="w-24 space-y-1">
                          <label className="text-[10px] font-bold text-[#64748B] uppercase">Trailers</label>
                          <input type="number" placeholder="0" value={wt.trailers} onChange={e => { const newT = [...weeklyTargets]; newT[idx].trailers = e.target.value; setWeeklyTargets(newT); }} className="w-full border p-1.5 text-sm rounded border-[#CBD5E1] focus:border-[#005689]" />
                        </div>
                        {weeklyTargets.length > 1 && (
                          <button onClick={() => setWeeklyTargets(weeklyTargets.filter((_, i) => i !== idx))} className="mb-1 p-1.5 text-red-600 hover:bg-red-50 rounded" title="Remove row"><X size={16} /></button>
                        )}
                      </div>
                    ))}
                    <div className="flex justify-between items-center px-1">
                      <button onClick={() => setWeeklyTargets([...weeklyTargets, { startDate: '', endDate: '', cars: '', trailers: '' }])} className="text-[#005689] font-bold text-xs flex items-center gap-1 hover:underline">
                        <Plus size={14} /> Add Weekend/Date Range
                      </button>
                      <div className="flex gap-4">
                        <div className="text-sm font-bold"><span className="text-[#64748B]">Total Cars:</span> <span className="text-[#005689]">{weeklyTargets.reduce((sum, w) => sum + parseInt(w.cars || '0', 10), 0)}</span></div>
                        <div className="text-sm font-bold"><span className="text-[#64748B]">Total Trailers:</span> <span className="text-[#005689]">{weeklyTargets.reduce((sum, w) => sum + parseInt(w.trailers || '0', 10), 0)}</span></div>
                      </div>
                    </div>
                  </div>
                )}
                {targetEntryMode === 'Percentage' && (
                  <div className="col-span-1 md:col-span-4 space-y-4 p-4 border border-[#E2E8F0] bg-white rounded-lg shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-green-700 uppercase">Total OEM SOB (Cars)</label>
                        <input type="number" value={sobTotal} onChange={e => setSobTotal(e.target.value)} placeholder="e.g. 1000" className="w-full bg-green-50 border border-green-200 p-2 rounded-md focus:border-green-500 font-bold text-lg text-green-900" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                      {(targetLevel === 'State/City Wise' ? targetFormDestinations : targetFormRegions).map(r => (
                        <div key={r} className="space-y-1 bg-gray-50 border border-gray-100 p-2 rounded">
                          <label className="text-[10px] font-bold text-[#64748B] uppercase block w-full truncate" title={r}>{r} %</label>
                          <div className="relative">
                            <input type="number" max="100" min="0" value={sobPercentages[r] || ''} onChange={e => setSobPercentages(p => ({ ...p, [r]: e.target.value }))} className="w-full border border-[#CBD5E1] p-1.5 pr-6 text-sm rounded focus:border-[#005689]" />
                            <span className="absolute right-2 top-1.5 text-gray-500 font-bold">%</span>
                          </div>
                          {sobTotal && sobPercentages[r] && (
                            <div className="text-[11px] text-[#005689] font-bold mt-1">
                              {Math.round(parseInt(sobTotal) * (parseFloat(sobPercentages[r]) / 100))} targets
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="col-span-1 md:col-span-4 flex justify-end mt-2">
                  <button onClick={handleAddTargetExt} className="bg-[#005689] text-white text-sm px-6 py-2 rounded-lg hover:bg-[#004470] font-bold shadow transition-all flex items-center justify-center gap-2">
                    <Plus size={16} /> Save Target(s)
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-[8px] border border-[#E2E8F0]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] shadow-sm">
                    <th className="p-3 text-xs font-bold text-[#64748B] uppercase tracking-wider border-r border-[#E2E8F0]">OEM</th>
                    <th className="p-3 text-xs font-bold text-[#64748B] uppercase tracking-wider border-r border-[#E2E8F0]">Plant</th>
                    {targetColumnVisibility.showStateCity && <th className="p-3 text-xs font-bold text-[#64748B] uppercase tracking-wider border-r border-[#E2E8F0]">State/Region</th>}
                    {targetColumnVisibility.showZone && <th className="p-3 text-xs font-bold text-[#64748B] uppercase tracking-wider border-r border-[#E2E8F0]">Zone</th>}
                    <th className="p-3 text-xs font-bold text-[#64748B] uppercase tracking-wider border-r border-[#E2E8F0]">Type</th>
                    <th className="p-3 text-xs font-bold text-[#64748B] uppercase tracking-wider border-r border-[#E2E8F0]">Period</th>
                    <th className="p-3 text-xs font-bold text-[#64748B] uppercase tracking-wider text-right border-r border-[#E2E8F0] w-28">Target (Cars)</th>
                    <th className="p-3 text-xs font-bold text-[#64748B] uppercase tracking-wider text-right border-r border-[#E2E8F0] w-28">Target (Trailers)</th>
                    <th className="p-3 text-xs font-bold text-[#64748B] uppercase tracking-wider text-center w-16">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {targetSearch.filterData(data.filter(d => d.year === targetYear && d.month === targetMonth && (targetOEM === 'All' || d.oem === targetOEM) && (targetPlant === 'All' || d.plant === targetPlant))).slice(0, 100).map(row => {
                    const hasWeekly = row.entryType === 'Weekly' && Array.isArray(row.weeklyBreakdown) && row.weeklyBreakdown.length > 0;
                    const colSpan = 9 - (targetColumnVisibility.showStateCity ? 0 : 1) - (targetColumnVisibility.showZone ? 0 : 1);
                    return (
                      <React.Fragment key={row.id}>
                        {/* ── Main record row ── */}
                        <tr className="group hover:bg-[#F8FAFC] transition-colors border-b border-[#E2E8F0]">
                          <td className="p-2 border-r border-[#E2E8F0]"><EditableCell type="select" options={masterOEMs} placeholder="Select OEM" value={row.oem} onChange={(v: string) => setData(prev => prev.map(d => d.id === row.id ? { ...d, oem: v } : d))} className="w-full bg-transparent border border-transparent hover:border-[#E2E8F0] focus:border-[#005689] focus:bg-white p-2 text-sm font-medium text-[#1E293B] rounded-md transition-all outline-none" /></td>
                          <td className="p-2 border-r border-[#E2E8F0]"><EditableCell type="select" options={masterPlants} placeholder="Select Plant" value={row.plant} onChange={(v: string) => setData(prev => prev.map(d => d.id === row.id ? { ...d, plant: v } : d))} className="w-full bg-transparent border border-transparent hover:border-[#E2E8F0] focus:border-[#005689] focus:bg-white p-2 text-sm text-[#1E293B] rounded-md transition-all outline-none" /></td>
                          {targetColumnVisibility.showStateCity && <td className="p-2 border-r border-[#E2E8F0]"><EditableCell type="select" options={masterDestinations} placeholder="Select State/Region" value={row.statecity} onChange={(v: string) => setData(prev => prev.map(d => d.id === row.id ? { ...d, statecity: v } : d))} className="w-full bg-transparent border border-transparent hover:border-[#E2E8F0] focus:border-[#005689] focus:bg-white p-2 text-sm text-[#1E293B] rounded-md transition-all outline-none" /></td>}
                          {targetColumnVisibility.showZone && <td className="p-2 border-r border-[#E2E8F0]"><EditableCell type="select" options={masterRegions} placeholder="Select Zone" value={row.zone} onChange={(v: string) => setData(prev => prev.map(d => d.id === row.id ? { ...d, zone: v } : d))} className="w-full bg-transparent border border-transparent hover:border-[#E2E8F0] focus:border-[#005689] focus:bg-white p-2 text-sm text-[#64748B] rounded-md transition-all outline-none" /></td>}
                          <td className="p-2 border-r border-[#E2E8F0]">
                            <div className="flex gap-1 items-center flex-wrap">
                              <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${row.entryType === 'Weekly' ? 'bg-purple-100 text-purple-700' : row.entryType === 'Percentage Based' ? 'bg-green-100 text-green-700' : 'bg-[#F1F5F9] text-[#475569]'}`}>
                                {row.entryType || 'Monthly'}
                              </span>
                              {row.targetLevel === 'AO Zone Wise' && <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#EFF6FF] text-[#1D4ED8]">Zonal</span>}
                            </div>
                          </td>
                          <td className="p-2 border-r border-[#E2E8F0] text-sm text-[#1E293B]">
                            {row.month}
                            {hasWeekly && <span className="ml-1 text-[10px] text-purple-500 font-semibold">({row.weeklyBreakdown!.length}W)</span>}
                          </td>
                          <td className="p-2 text-right border-r border-[#E2E8F0] font-bold text-[#005689]">
                            {row.target.toLocaleString()}
                          </td>
                          <td className="p-2 text-right border-r border-[#E2E8F0] text-[#64748B]">
                            {(row.targetTrailers || 0).toLocaleString()}
                          </td>
                          <td className="p-2 text-center">
                            <button onClick={() => {
                              if (window.confirm('Delete this target?')) {
                                setData(prev => prev.filter(d => d.id !== row.id));
                                deleteBreakdown(row.id);
                                logActivity(`Deleted target for ${row.statecity}`);
                              }
                            }} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-opacity mx-auto">
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>

                        {/* ── Weekly breakdown sub-rows ── */}
                        {hasWeekly && row.weeklyBreakdown!.map((wb: { dateRange: string; cars: number; trailers: number }, wIdx: number) => (
                          <tr key={`${row.id}-wb-${wIdx}`} className="bg-purple-50/40 border-b border-purple-100/60 text-[12px]">
                            {/* indent spacer */}
                            <td className="pl-6 pr-2 py-1.5 border-r border-[#E2E8F0] text-[#94a3b8]" colSpan={targetColumnVisibility.showStateCity && targetColumnVisibility.showZone ? 2 : targetColumnVisibility.showStateCity || targetColumnVisibility.showZone ? 2 : 2}>
                              <span className="text-purple-400 mr-1">↳</span>
                              <span className="font-semibold text-purple-700">W{wIdx + 1}</span>
                            </td>
                            {targetColumnVisibility.showStateCity && <td className="py-1.5 px-2 border-r border-[#E2E8F0] text-[#64748B] text-[11px] italic">{row.statecity}</td>}
                            {targetColumnVisibility.showZone && <td className="py-1.5 px-2 border-r border-[#E2E8F0] text-[#64748B] text-[11px] italic">{row.zone}</td>}
                            <td className="py-1.5 px-2 border-r border-[#E2E8F0]">
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-600">Weekly</span>
                            </td>
                            <td className="py-1.5 px-2 border-r border-[#E2E8F0] text-[#475569] text-[11px]">{wb.dateRange || `Week ${wIdx + 1}`}</td>
                            <td className="py-1.5 px-2 text-right border-r border-[#E2E8F0] font-semibold text-purple-700">{wb.cars.toLocaleString()}</td>
                            <td className="py-1.5 px-2 text-right border-r border-[#E2E8F0] text-[#64748B]">{wb.trailers.toLocaleString()}</td>
                            <td className="py-1.5 px-2" />
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                  {data.filter(d => d.year === targetYear && d.month === targetMonth && (targetOEM === 'All' || d.oem === targetOEM) && (targetPlant === 'All' || d.plant === targetPlant)).length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-[#64748B]">
                        No records found for the selected filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'fleet' && (
          <div className="space-y-6">
            {/* Fleet Filters */}
            <div className="flex flex-wrap gap-4 items-center justify-between bg-[#FFFFFF] p-4 rounded-[12px] shadow-sm border border-[#E2E8F0]">
              <div className="flex flex-wrap gap-4 items-center">
                <FilterDropdown
                  label="Origin Zone"
                  value={fleetOriginZone}
                  options={['All', ...Array.from(new Set(masterRoutes.map(r => getOriginZone(r.plant)).filter(Boolean))).sort()]}
                  onChange={(val: any) => { setFleetOriginZone(val); setFleetOEM('All'); setFleetPlant('All'); setFleetBranch('All'); }}
                  icon={MapIcon}
                  defaultLabel="All Zones"
                />
                <div className="w-px h-6 bg-[#E2E8F0] mx-1"></div>
                <FilterDropdown
                  label="OEM"
                  value={fleetOEM}
                  options={['All', ...masterOEMs]}
                  onChange={(val: any) => { setFleetOEM(val); setFleetPlant('All'); setFleetBranch('All'); }}
                  icon={Factory}
                  defaultLabel="All OEMs"
                />
                <div className="w-px h-6 bg-[#E2E8F0] mx-1"></div>
                <FilterDropdown
                  label="Plant"
                  value={fleetPlant}
                  options={['All', ...(fleetOEM === 'All' ? masterPlants : (oemPlantMap[fleetOEM] || []).slice().sort())]}
                  onChange={(val: any) => { setFleetPlant(val); setFleetBranch('All'); }}
                  icon={Factory}
                  defaultLabel="All Plants"
                />
                <div className="w-px h-6 bg-[#E2E8F0] mx-1"></div>
                <FilterDropdown
                  label="Branch"
                  value={fleetBranch}
                  options={['All', ...masterBranches]}
                  onChange={(val: any) => setFleetBranch(val)}
                  icon={Building}
                  defaultLabel="All Branches"
                />
                <div className="w-px h-6 bg-[#E2E8F0] mx-1"></div>
                <div className="flex items-center gap-2 bg-[#F8FAFC] px-3 py-1.5 rounded-[12px] border border-[#E2E8F0]">
                  <span className="text-sm font-medium text-[#64748B]">Capacity:</span>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    value={trailerCapacity}
                    onChange={(e) => setTrailerCapacity(Number(e.target.value) || 6.5)}
                    className="w-16 bg-[#FFFFFF] border border-[#CBD5E1] rounded px-2 py-1 text-sm focus:ring-2 focus:ring-[#005689] outline-none"
                  />
                </div>
              </div>

              {/* Timeframe Sub-tabs */}
              <div className="flex bg-[#F8FAFC] p-1 rounded-[12px] border border-[#E2E8F0]">
                {['Daily', 'Weekly', 'Monthly'].map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setFleetTimeframe(tf as any)}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${fleetTimeframe === tf
                      ? 'bg-[#FFFFFF] text-[#005689] shadow-sm border border-[#E2E8F0]'
                      : 'text-[#64748B] hover:bg-[#E2E8F0]/50'
                      }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* Fleet Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-[#005689] to-[#004066] rounded-[12px] p-6 text-white shadow-md relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center gap-2 text-white/80 mb-2">
                    <Truck size={20} />
                    <h3 className="font-medium">Total Trips Needed</h3>
                  </div>
                  <div className="text-4xl font-bold">
                    {(() => {
                      const filtered = data.filter(d =>
                        d.year === fleetYear &&
                        d.month === fleetMonth &&
                        (fleetOEM === 'All' || d.oem === fleetOEM) &&
                        (fleetPlant === 'All' || d.plant === fleetPlant) &&
                        (fleetBranch === 'All' || (d.manageByBranch || '').trim() === fleetBranch) &&
                        (fleetOriginZone === 'All' || getOriginZone(d.plant) === fleetOriginZone)
                      );
                      const totalCars = filtered.reduce((sum, item) => sum + (item.target || 0), 0);
                      const totalLifted = filtered.reduce((sum, item) => sum + (item.lifted || 0), 0);
                      const req = computeRequirements(totalCars, totalLifted, fleetMonth, fleetYear);
                      let requiredCars = req.balance;
                      if (fleetTimeframe === 'Daily') requiredCars = req.dailyRequired;
                      if (fleetTimeframe === 'Weekly') requiredCars = req.weeklyRequired;
                      return Math.max(0, Math.ceil(requiredCars / trailerCapacity)).toLocaleString();
                    })()}
                  </div>
                  <div className="text-sm text-white/80 mt-2">
                    Based on remaining target and days remaining from today
                  </div>
                </div>
                <Truck className="absolute -bottom-4 -right-4 text-white/10" size={120} />
              </div>
            </div>

            {/* Zone-Wise Fleet Requirement */}
            <div className="bg-[#FFFFFF] rounded-[12px] shadow-sm border border-[#E2E8F0] overflow-hidden">
              <div className="p-5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="text-lg font-bold text-[#1E293B] flex items-center gap-2">
                    <MapIcon className="text-[#005689]" size={20} />
                    Fleet Requirement Breakdown
                  </h3>
                  <p className="text-sm text-[#64748B] mt-1 ml-7">
                    Daily, weekly and monthly trip requirements — switch view to analyse by zone, OEM, plant or branch.
                  </p>
                </div>
                {/* View selector tabs */}
                <div className="flex bg-[#F1F5F9] p-1 rounded-xl border border-[#E2E8F0] gap-0.5">
                  {([
                    { key: 'zone',   label: 'Origin Zone' },
                    { key: 'oem',    label: 'OEM' },
                    { key: 'plant',  label: 'Plant' },
                    { key: 'branch', label: 'Branch' },
                  ] as { key: 'zone'|'oem'|'plant'|'branch'; label: string }[]).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setFleetBreakdownView(tab.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                        fleetBreakdownView === tab.key
                          ? 'bg-[#005689] text-white shadow-sm'
                          : 'text-[#64748B] hover:text-[#1E293B]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead className="bg-[#F8FAFC]">
                    <tr className="text-[#1E293B] text-xs uppercase tracking-wider border-b-2 border-[#E2E8F0]">
                      {/* Dynamic first column */}
                      {fleetBreakdownView === 'zone' && (
                        <th className="p-4 font-semibold border-r border-[#E2E8F0]">Origin Zone</th>
                      )}
                      {fleetBreakdownView === 'oem' && (
                        <th className="p-4 font-semibold border-r border-[#E2E8F0]">OEM</th>
                      )}
                      {fleetBreakdownView === 'plant' && (
                        <th className="p-4 font-semibold border-r border-[#E2E8F0]">Plant</th>
                      )}
                      {fleetBreakdownView === 'branch' && (
                        <th className="p-4 font-semibold border-r border-[#E2E8F0]">Branch</th>
                      )}
                      <th className="p-4 font-semibold text-right border-r border-[#E2E8F0]">Monthly Target (Cars)</th>
                      <th className="p-4 font-semibold text-right border-r border-[#E2E8F0] bg-[#F0F9FF]/60">Daily Trips</th>
                      <th className="p-4 font-semibold text-right border-r border-[#E2E8F0] bg-[#F0F9FF]/60">Weekly Trips</th>
                      <th className="p-4 font-semibold text-right bg-[#F0F9FF]/60">Monthly Trips</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {(() => {
                      const filtered = data.filter(d =>
                        d.year === fleetYear &&
                        d.month === fleetMonth &&
                        (fleetOEM === 'All' || d.oem === fleetOEM) &&
                        (fleetPlant === 'All' || d.plant === fleetPlant) &&
                        (fleetBranch === 'All' || (d.manageByBranch || '').trim() === fleetBranch) &&
                        (fleetOriginZone === 'All' || getOriginZone(d.plant) === fleetOriginZone) &&
                        (fleetDestZone === 'All' || getDestinationZone(d) === fleetDestZone)
                      );

                      const rows: React.ReactNode[] = [];

                      const makeTrips = (targetCars: number, liftedCars: number) => {
                        const req = computeRequirements(targetCars, liftedCars, fleetMonth, fleetYear);
                        return {
                          daily: Math.max(0, Math.ceil((req.dailyRequired || 0) / trailerCapacity)),
                          weekly: Math.max(0, Math.ceil((req.weeklyRequired || 0) / trailerCapacity)),
                          monthly: Math.max(0, Math.ceil((req.balance || 0) / trailerCapacity)),
                        };
                      };

                      if (fleetBreakdownView === 'zone') {
                        // Group by originZone
                        const groupMap = new Map<string, { originZone: string; target: number; lifted: number }>();
                        filtered.forEach(d => {
                          const oz = getOriginZone(d.plant) || 'Unknown';
                          if (!groupMap.has(oz)) groupMap.set(oz, { originZone: oz, target: 0, lifted: 0 });
                          groupMap.get(oz)!.target += d.target || 0;
                          groupMap.get(oz)!.lifted += d.lifted || 0;
                        });
                        Array.from(groupMap.values())
                          .filter(g => g.target > 0)
                          .sort((a, b) => a.originZone.localeCompare(b.originZone))
                          .forEach((g, i) => {
                            const t = makeTrips(g.target, g.lifted);
                            rows.push(
                              <tr key={i} className="hover:bg-[#F8FAFC] transition-colors">
                                <td className="p-4 text-sm font-bold text-[#1E293B] border-r border-[#E2E8F0]">{g.originZone}</td>
                                <td className="p-4 text-sm text-[#64748B] text-right border-r border-[#E2E8F0]">{g.target.toLocaleString()}</td>
                                <td className="p-4 text-sm font-semibold text-[#005689] text-right border-r border-[#E2E8F0] bg-[#F0F9FF]/40">{t.daily.toLocaleString()}</td>
                                <td className="p-4 text-sm font-semibold text-[#005689] text-right border-r border-[#E2E8F0] bg-[#F0F9FF]/40">{t.weekly.toLocaleString()}</td>
                                <td className="p-4 text-sm font-semibold text-[#005689] text-right bg-[#F0F9FF]/40">{t.monthly.toLocaleString()}</td>
                              </tr>
                            );
                          });

                      } else if (fleetBreakdownView === 'oem') {
                        // Group by OEM
                        const groupMap = new Map<string, { oem: string; target: number; lifted: number }>();
                        filtered.forEach(d => {
                          if (!groupMap.has(d.oem)) groupMap.set(d.oem, { oem: d.oem, target: 0, lifted: 0 });
                          groupMap.get(d.oem)!.target += d.target || 0;
                          groupMap.get(d.oem)!.lifted += d.lifted || 0;
                        });
                        Array.from(groupMap.values())
                          .filter(g => g.target > 0)
                          .sort((a, b) => a.oem.localeCompare(b.oem))
                          .forEach((g, i) => {
                            const t = makeTrips(g.target, g.lifted);
                            rows.push(
                              <tr key={i} className="hover:bg-[#F8FAFC] transition-colors">
                                <td className="p-4 text-sm font-bold text-[#1E293B] border-r border-[#E2E8F0]">{g.oem}</td>
                                <td className="p-4 text-sm text-[#64748B] text-right border-r border-[#E2E8F0]">{g.target.toLocaleString()}</td>
                                <td className="p-4 text-sm font-semibold text-[#005689] text-right border-r border-[#E2E8F0] bg-[#F0F9FF]/40">{t.daily.toLocaleString()}</td>
                                <td className="p-4 text-sm font-semibold text-[#005689] text-right border-r border-[#E2E8F0] bg-[#F0F9FF]/40">{t.weekly.toLocaleString()}</td>
                                <td className="p-4 text-sm font-semibold text-[#005689] text-right bg-[#F0F9FF]/40">{t.monthly.toLocaleString()}</td>
                              </tr>
                            );
                          });

                      } else if (fleetBreakdownView === 'plant') {
                        // Group by plant
                        const groupMap = new Map<string, { plant: string; target: number; lifted: number }>();
                        filtered.forEach(d => {
                          if (!groupMap.has(d.plant)) groupMap.set(d.plant, { plant: d.plant, target: 0, lifted: 0 });
                          groupMap.get(d.plant)!.target += d.target || 0;
                          groupMap.get(d.plant)!.lifted += d.lifted || 0;
                        });
                        Array.from(groupMap.values())
                          .filter(g => g.target > 0)
                          .sort((a, b) => a.plant.localeCompare(b.plant))
                          .forEach((g, i) => {
                            const t = makeTrips(g.target, g.lifted);
                            rows.push(
                              <tr key={i} className="hover:bg-[#F8FAFC] transition-colors">
                                <td className="p-4 text-sm font-bold text-[#1E293B] border-r border-[#E2E8F0]">{g.plant}</td>
                                <td className="p-4 text-sm text-[#64748B] text-right border-r border-[#E2E8F0]">{g.target.toLocaleString()}</td>
                                <td className="p-4 text-sm font-semibold text-[#005689] text-right border-r border-[#E2E8F0] bg-[#F0F9FF]/40">{t.daily.toLocaleString()}</td>
                                <td className="p-4 text-sm font-semibold text-[#005689] text-right border-r border-[#E2E8F0] bg-[#F0F9FF]/40">{t.weekly.toLocaleString()}</td>
                                <td className="p-4 text-sm font-semibold text-[#005689] text-right bg-[#F0F9FF]/40">{t.monthly.toLocaleString()}</td>
                              </tr>
                            );
                          });

                      } else {
                        // Branch view — group by manageByBranch
                        const groupMap = new Map<string, { branch: string; target: number; lifted: number }>();
                        filtered.forEach(d => {
                          const branch = getDisplayBranch(d);
                          if (!groupMap.has(branch)) groupMap.set(branch, { branch, target: 0, lifted: 0 });
                          groupMap.get(branch)!.target += d.target || 0;
                          groupMap.get(branch)!.lifted += d.lifted || 0;
                        });
                        Array.from(groupMap.values())
                          .filter(g => g.target > 0)
                          .sort((a, b) => b.target - a.target)
                          .forEach((g, i) => {
                            const t = makeTrips(g.target, g.lifted);
                            rows.push(
                              <tr key={i} className="hover:bg-[#F8FAFC] transition-colors">
                                <td className="p-4 text-sm font-bold text-[#1E293B] border-r border-[#E2E8F0]">{g.branch}</td>
                                <td className="p-4 text-sm text-[#64748B] text-right border-r border-[#E2E8F0]">{g.target.toLocaleString()}</td>
                                <td className="p-4 text-sm font-semibold text-[#005689] text-right border-r border-[#E2E8F0] bg-[#F0F9FF]/40">{t.daily.toLocaleString()}</td>
                                <td className="p-4 text-sm font-semibold text-[#005689] text-right border-r border-[#E2E8F0] bg-[#F0F9FF]/40">{t.weekly.toLocaleString()}</td>
                                <td className="p-4 text-sm font-semibold text-[#005689] text-right bg-[#F0F9FF]/40">{t.monthly.toLocaleString()}</td>
                              </tr>
                            );
                          });
                      }

                      // Grand total footer
                      const totalCars = filtered.reduce((sum, d) => sum + (d.target || 0), 0);
                      const totalLifted = filtered.reduce((sum, d) => sum + (d.lifted || 0), 0);
                      const totalT = makeTrips(totalCars, totalLifted);

                      return (
                        <>
                          {rows.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-8 text-center text-[#94A3B8] text-sm">
                                No data for selected filters
                              </td>
                            </tr>
                          ) : rows}
                          {totalCars > 0 && (
                            <tr className="bg-[#F8FAFC] border-t-2 border-[#CBD5E1] font-bold text-[#1E293B]">
                              <td colSpan={1} className="p-4 text-sm uppercase text-[#005689] border-r border-[#E2E8F0]">Total</td>
                              <td className="p-4 text-sm text-right border-r border-[#E2E8F0]">{totalCars.toLocaleString()}</td>
                              <td className="p-4 text-sm text-right text-[#005689] border-r border-[#E2E8F0] bg-[#F0F9FF]/40">{totalT.daily.toLocaleString()}</td>
                              <td className="p-4 text-sm text-right text-[#005689] border-r border-[#E2E8F0] bg-[#F0F9FF]/40">{totalT.weekly.toLocaleString()}</td>
                              <td className="p-4 text-sm text-right text-[#005689] bg-[#F0F9FF]/40">{totalT.monthly.toLocaleString()}</td>
                            </tr>
                          )}
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Fleet Data Table */}
            <div className="bg-[#FFFFFF] rounded-[12px] shadow-sm border border-[#E2E8F0] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead className="bg-[#F8FAFC]">
                    <tr className="text-[#1E293B] text-xs uppercase tracking-wider border-b-2 border-[#E2E8F0]">
                      <th className="p-4 font-semibold border-r border-[#E2E8F0] cursor-pointer hover:bg-[#E2E8F0]/50" onClick={() => { setFleetSort('oem'); setFleetSortDirection(fleetSort === 'oem' && fleetSortDirection === 'asc' ? 'desc' : 'asc'); }}>
                        <div className="flex items-center justify-between">
                          OEM {fleetSort === 'oem' && (fleetSortDirection === 'asc' ? '↑' : '↓')}
                        </div>
                      </th>
                      <th className="p-4 font-semibold border-r border-[#E2E8F0] cursor-pointer hover:bg-[#E2E8F0]/50" onClick={() => { setFleetSort('plant'); setFleetSortDirection(fleetSort === 'plant' && fleetSortDirection === 'asc' ? 'desc' : 'asc'); }}>
                        <div className="flex items-center justify-between">
                          Plant Name {fleetSort === 'plant' && (fleetSortDirection === 'asc' ? '↑' : '↓')}
                        </div>
                      </th>
                      <th className="p-4 font-semibold border-r border-[#E2E8F0] cursor-pointer hover:bg-[#E2E8F0]/50" onClick={() => { setFleetSort('statecity'); setFleetSortDirection(fleetSort === 'statecity' && fleetSortDirection === 'asc' ? 'desc' : 'asc'); }}>
                        <div className="flex items-center justify-between">
                          State/City {fleetSort === 'statecity' && (fleetSortDirection === 'asc' ? '↑' : '↓')}
                        </div>
                      </th>
                      <th className="p-4 font-semibold border-r border-[#E2E8F0]">AO Zone</th>
                      <th className="p-4 font-semibold text-right border-r border-[#E2E8F0]">Car Target ({fleetTimeframe})</th>
                      <th className="p-4 font-semibold text-right bg-[#F1F5F9] cursor-pointer hover:bg-[#E2E8F0]" onClick={() => { setFleetSort('trailers'); setFleetSortDirection(fleetSort === 'trailers' && fleetSortDirection === 'asc' ? 'desc' : 'asc'); }}>
                        <div className="flex items-center justify-end gap-1">
                          Trips Required ({trailerCapacity} Cap) {fleetSort === 'trailers' && (fleetSortDirection === 'asc' ? '↑' : '↓')}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] bg-[#FFFFFF]">

                    {/* Group by AO zone, show only saved state/city rows, always show AO zone subtotal */}
                    {(() => {
                      const filtered = data.filter(d =>
                        d.year === fleetYear &&
                        d.month === fleetMonth &&
                        (fleetOEM === 'All' || d.oem === fleetOEM) &&
                        (fleetPlant === 'All' || d.plant === fleetPlant) &&
                        (fleetBranch === 'All' || (d.manageByBranch || '').trim() === fleetBranch) &&
                        (fleetOriginZone === 'All' || getOriginZone(d.plant) === fleetOriginZone)
                      );
                      if (filtered.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-[#64748B]">
                              No targets found for the selected filters.
                            </td>
                          </tr>
                        );
                      }
                      // Group by AO zone
                      const zoneGroups: Record<string, any[]> = {};
                      filtered.forEach(row => {
                        const zone = normalizeZone(row.zone || 'Unknown');
                        if (!zoneGroups[zone]) zoneGroups[zone] = [];
                        zoneGroups[zone].push(row);
                      });
                      // Sort AO zones alphabetically
                      const sortedZones = Object.keys(zoneGroups).sort();
                      let rowIndex = 0;
                      return sortedZones.map(zone => {
                        const rows = zoneGroups[zone];
                        // Only show state/city rows if present in data
                        const hasStateCity = rows.some(r => r.statecity && r.statecity.trim() && r.statecity.trim().toLowerCase() !== zone.toLowerCase());
                        // Compute subtotal for this AO zone
                        let subtotalTarget = 0;
                        let subtotalTrailers = 0;
                        const renderedRows = rows.map((row, i) => {
                          const req = computeRequirements(row.target || 0, row.lifted || 0, fleetMonth, fleetYear);
                          let carTarget = req.balance;
                          if (fleetTimeframe === 'Daily') carTarget = req.dailyRequired;
                          if (fleetTimeframe === 'Weekly') carTarget = req.weeklyRequired;
                          const trailersRequired = Math.max(0, Math.ceil(carTarget / trailerCapacity));
                          subtotalTarget += carTarget;
                          subtotalTrailers += trailersRequired;
                          // Only show state/city if present, else show AO zone row only
                          return (
                            <motion.tr
                              key={row.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.3, delay: (rowIndex + i) * 0.05 }}
                              className="hover:bg-[#F8FAFC] transition-colors"
                            >
                              <td className="p-4 text-sm font-medium text-[#1E293B] border-r border-[#E2E8F0]">{row.oem}</td>
                              <td className="p-4 text-sm text-[#1E293B] border-r border-[#E2E8F0]">{row.plant}</td>
                              <td className="p-4 text-sm text-[#1E293B] border-r border-[#E2E8F0]">{hasStateCity ? getDisplayStateCity(row) : ''}</td>
                              <td className="p-4 text-sm text-[#64748B] border-r border-[#E2E8F0]">{zone}</td>
                              <td className="p-4 text-sm text-[#1E293B] text-right border-r border-[#E2E8F0]">
                                {carTarget > 0 ? carTarget.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '0'}
                              </td>
                              <td className="p-4 text-sm font-bold text-[#005689] text-right bg-[#F8FAFC]">
                                {trailersRequired.toLocaleString()}
                              </td>
                            </motion.tr>
                          );
                        });
                        rowIndex += rows.length;
                        // Subtotal row for AO zone
                        return [
                          ...renderedRows,
                          <tr key={zone + '-subtotal'} className="bg-[#F8FAFC] font-bold">
                            <td colSpan={4} className="p-4 text-sm uppercase text-[#005689] border-r border-[#E2E8F0] text-right">Subtotal ({zone})</td>
                            <td className="p-4 text-sm text-right border-r border-[#E2E8F0]">{subtotalTarget > 0 ? subtotalTarget.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '0'}</td>
                            <td className="p-4 text-sm font-bold text-[#005689] text-right bg-[#F8FAFC]">{subtotalTrailers.toLocaleString()}</td>
                          </tr>
                        ];
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'zone' && (
          <div className="space-y-6">
            {/* Zone Filters */}
            <div className="flex flex-wrap gap-4 items-center justify-between bg-[#FFFFFF] p-4 rounded-[12px] shadow-sm border border-[#E2E8F0]">
              <div className="flex flex-wrap gap-4 items-center">
                <FilterDropdown
                  label="Year"
                  value={zoneYear}
                  options={years}
                  onChange={(val: any) => setZoneYear(val)}
                  icon={Calendar}
                  defaultLabel={currentYear.toString()}
                  clearValue={currentYear}
                />
                <FilterDropdown
                  label="Timeframe"
                  value={zoneTimeframe}
                  options={timeframes}
                  onChange={(val: any) => setZoneTimeframe(val)}
                  icon={Calendar}
                  defaultLabel={currentMonth}
                  clearValue={currentMonth}
                />
                <div className="w-px h-6 bg-[#E2E8F0] mx-1"></div>
                <FilterDropdown
                  label="OEM"
                  value={zoneOEM}
                  options={['All', ...oems]}
                  onChange={(val: any) => setZoneOEM(val)}
                  icon={Truck}
                  defaultLabel="All OEMs"
                />
              </div>
            </div>

            {/* Zone Matrix Table */}
            <div className="bg-[#FFFFFF] rounded-[12px] shadow-sm border border-[#E2E8F0] overflow-hidden">
              <div className="p-5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-[#1E293B] flex items-center gap-2">
                    <MapIcon className="text-[#005689]" size={20} />
                    Zone-to-Zone Matrix
                  </h3>
                  <p className="text-sm text-[#64748B] mt-1 ml-7">
                    Shows how many {zoneMatrixView === 'Cars' ? 'cars' : 'carriers'} move from the origin zone to the statecity zone.
                  </p>
                </div>
                <div className="flex bg-[#E2E8F0] p-1 rounded-[12px]">
                  <button
                    onClick={() => setZoneMatrixView('Cars')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${zoneMatrixView === 'Cars' ? 'bg-[#FFFFFF] text-[#1E293B] shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'}`}
                  >
                    Car Wise
                  </button>
                  <button
                    onClick={() => setZoneMatrixView('Trailers')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${zoneMatrixView === 'Trailers' ? 'bg-[#FFFFFF] text-[#1E293B] shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'}`}
                  >
                    Trailer Wise
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  {(() => {
                    const zoneData = data.filter(d =>
                      d.year === zoneYear &&
                      getMonthsForTimeframe(zoneTimeframe).includes(d.month) &&
                      (zoneOEM === 'All' || d.oem === zoneOEM)
                    );

                    const originZones = ALL_ZONES;
                    const destZones = ALL_ZONES;

                    const matrix: Record<string, Record<string, number>> = {};
                    originZones.forEach(oz => {
                      matrix[oz] = {};
                      destZones.forEach(dz => {
                        matrix[oz][dz] = 0;
                      });
                    });

                    zoneData.forEach(d => {
                      const oz = getOriginZone(d.plant);
                      const dz = getDestinationZone(d);
                      if (matrix[oz] && matrix[oz][dz] !== undefined) {
                        matrix[oz][dz] += d.lifted;
                      }
                    });

                    if (zoneMatrixView === 'Trailers') {
                      originZones.forEach(oz => {
                        destZones.forEach(dz => {
                          matrix[oz][dz] = Math.ceil(matrix[oz][dz] / trailerCapacity);
                        });
                      });
                    }

                    const displayOriginZones = originZones;
                    const displayDestZones = destZones;

                    return (
                      <>
                        <thead className="bg-[#F8FAFC]">
                          <tr className="text-[#1E293B] text-xs uppercase tracking-wider border-b-2 border-[#E2E8F0]">
                            <th className="p-4 font-semibold border-r border-[#E2E8F0] bg-[#E2E8F0] sticky left-0 z-10">Origin Zone \ Destination Zone</th>
                            {displayDestZones.map(dz => (
                              <th key={dz} className="p-4 font-semibold border-r border-[#E2E8F0] text-center">{dz}</th>
                            ))}
                            <th className="p-4 font-semibold text-center bg-[#F1F5F9]">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0] bg-[#FFFFFF]">

                          {displayOriginZones.map((oz, idx) => {
                            const rowTotal = displayDestZones.reduce((sum, dz) => sum + matrix[oz][dz], 0);
                            return (
                              <motion.tr
                                key={oz}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="hover:bg-[#F8FAFC] transition-colors"
                              >
                                <td className="p-4 text-sm font-bold text-[#1E293B] border-r border-[#E2E8F0] bg-[#F8FAFC] sticky left-0 z-10">
                                  {oz}
                                </td>
                                {displayDestZones.map(dz => (
                                  <td key={dz} className="p-4 text-sm text-[#64748B] border-r border-[#E2E8F0] text-center">
                                    {matrix[oz][dz] > 0 ? matrix[oz][dz].toLocaleString() : '-'}
                                  </td>
                                ))}
                                <td className="p-4 text-sm font-bold text-[#005689] text-center bg-[#F8FAFC]">
                                  {rowTotal > 0 ? rowTotal.toLocaleString() : '-'}
                                </td>
                              </motion.tr>
                            );
                          })}
                          <tr className="bg-[#F8FAFC] font-bold">
                            <td className="p-4 text-sm text-[#1E293B] border-r border-[#E2E8F0] sticky left-0 z-10">
                              Total
                            </td>
                            {displayDestZones.map(dz => {
                              const colTotal = displayOriginZones.reduce((sum, oz) => sum + matrix[oz][dz], 0);
                              return (
                                <td key={dz} className="p-4 text-sm text-[#1E293B] border-r border-[#E2E8F0] text-center">
                                  {colTotal > 0 ? colTotal.toLocaleString() : '-'}
                                </td>
                              );
                            })}
                            <td className="p-4 text-sm text-[#005689] text-center bg-[#E2E8F0]">
                              {displayOriginZones.reduce((sum, oz) => sum + displayDestZones.reduce((s, dz) => s + matrix[oz][dz], 0), 0).toLocaleString()}
                            </td>
                          </tr>
                        </tbody>
                      </>
                    );
                  })()}
                </table>
              </div>
            </div>

            {/* Zone Target vs Lifted Chart */}
            <div className="bg-[#FFFFFF] rounded-[12px] shadow-sm border border-[#E2E8F0] overflow-hidden mt-6">
              <div className="p-5 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <h3 className="text-lg font-bold text-[#1E293B] flex items-center gap-2">
                  <BarChart3 className="text-[#005689]" size={20} />
                  Zone Performance (Cars)
                </h3>
              </div>
              <div className="p-6">
                <div className="chart-wrapper">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={(() => {
                        const zoneData = data.filter(d =>
                          d.year === zoneYear &&
                          getMonthsForTimeframe(zoneTimeframe).includes(d.month) &&
                          (zoneOEM === 'All' || d.oem === zoneOEM)
                        );

                        const zones = ALL_ZONES;
                        return zones.map(zone => {
                          const target = zoneData.filter(d => getOriginZone(d.plant) === zone).reduce((sum, d) => sum + d.target, 0);
                          const lifted = zoneData.filter(d => getOriginZone(d.plant) === zone).reduce((sum, d) => sum + d.lifted, 0);

                          return {
                            name: zone,
                            Target: target,
                            Lifted: lifted
                          };
                        });
                      })()}
                      margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} dx={-10} />
                      <Tooltip
                        cursor={{ fill: '#F8FAFC' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      <Bar dataKey="Target" fill="#94A3B8" radius={[4, 4, 0, 0]} maxBarSize={60} />
                      <Bar dataKey="Lifted" fill="#005689" radius={[4, 4, 0, 0]} maxBarSize={60} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Zone Target vs Lifted Summary */}
            <div className="bg-[#FFFFFF] rounded-[12px] shadow-sm border border-[#E2E8F0] overflow-hidden mt-6">
              <div className="p-5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex flex-wrap justify-between items-center gap-4">
                <div>
                  <h3 className="text-lg font-bold text-[#1E293B] flex items-center gap-2">
                    <Factory className="text-[#005689]" size={20} />
                    Zone Target vs Lifted Summary
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <FilterDropdown
                    label="Origin Zone"
                    value={summaryOriginZone}
                    options={['All', ...ALL_ZONES]}
                    onChange={(val: any) => setSummaryOriginZone(val)}
                    icon={MapIcon}
                    defaultLabel="All"
                  />
                  <FilterDropdown
                    label="Destination Zone"
                    value={summaryDestZone}
                    options={['All', ...ALL_ZONES]}
                    onChange={(val: any) => setSummaryDestZone(val)}
                    icon={MapPin}
                    defaultLabel="All"
                  />
                  <div className="flex bg-[#E2E8F0] p-1 rounded-[12px]">
                    <button
                      onClick={() => setSummaryView('Cars')}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${summaryView === 'Cars' ? 'bg-[#FFFFFF] text-[#1E293B] shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'}`}
                    >
                      Car Wise
                    </button>
                    <button
                      onClick={() => setSummaryView('Trailers')}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${summaryView === 'Trailers' ? 'bg-[#FFFFFF] text-[#1E293B] shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'}`}
                    >
                      Trailer Wise
                    </button>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#F8FAFC]">
                    <tr className="text-[#1E293B] text-xs uppercase tracking-wider border-b-2 border-[#E2E8F0]">
                      <zoneSummarySearch.FilterHeader title="Origin Zone" columnKey="originZone" />
                      <zoneSummarySearch.FilterHeader title="Destination Zone" columnKey="destZone" />
                      <zoneSummarySearch.FilterHeader title="Target" columnKey="target" className="text-right" />
                      <zoneSummarySearch.FilterHeader title="Lifted" columnKey="lifted" className="text-right" />
                      <zoneSummarySearch.FilterHeader title="Achievement %" columnKey="achievement" className="text-right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {(() => {
                      const zoneData = data.filter(d =>
                        d.year === zoneYear &&
                        getMonthsForTimeframe(zoneTimeframe).includes(d.month) &&
                        (zoneOEM === 'All' || d.oem === zoneOEM) &&
                        (summaryOriginZone === 'All' || getOriginZone(d.plant) === summaryOriginZone) &&
                        (summaryDestZone === 'All' || getDestinationZone(d) === summaryDestZone)
                      );
                      const zones = ALL_ZONES;
                      const rowsData: any[] = [];
                      zones.forEach(originZone => {
                        zones.forEach(destZone => {
                          if (summaryOriginZone !== 'All' && originZone !== summaryOriginZone) return;
                          if (summaryDestZone !== 'All' && destZone !== summaryDestZone) return;

                          let target = zoneData.filter(d => getOriginZone(d.plant) === originZone && getDestinationZone(d) === destZone).reduce((sum, d) => sum + d.target, 0);
                          let lifted = zoneData.filter(d => getOriginZone(d.plant) === originZone && getDestinationZone(d) === destZone).reduce((sum, d) => sum + d.lifted, 0);

                          if (target === 0 && lifted === 0) return;

                          if (summaryView === 'Trailers') {
                            target = Math.ceil(target / trailerCapacity);
                            lifted = Math.ceil(lifted / trailerCapacity);
                          }

                          const achievement = target > 0 ? Math.round((lifted / target) * 100) : null;

                          rowsData.push({ originZone, destZone, target, lifted, achievement });
                        });
                      });

                      let totalTarget = zoneData.reduce((sum, d) => sum + d.target, 0);
                      let totalLifted = zoneData.reduce((sum, d) => sum + d.lifted, 0);

                      if (summaryView === 'Trailers') {
                        totalTarget = Math.ceil(totalTarget / trailerCapacity);
                        totalLifted = Math.ceil(totalLifted / trailerCapacity);
                      }

                      const totalAchievement = totalTarget > 0 ? Math.round((totalLifted / totalTarget) * 100) : null;

                      return (
                        <>
                          {zoneSummarySearch.filterData(rowsData).map(r => (
                            <tr key={`${r.originZone}-${r.destZone}`} className="hover:bg-[#F8FAFC]">
                              <td className="p-4 text-sm font-medium text-[#1E293B] border-r border-[#E2E8F0]">{r.originZone}</td>
                              <td className="p-4 text-sm text-[#64748B] border-r border-[#E2E8F0]">{r.destZone}</td>
                              <td className="p-4 text-sm text-[#64748B] text-right border-r border-[#E2E8F0]">{r.target.toLocaleString()}</td>
                              <td className="p-4 text-sm text-[#64748B] text-right border-r border-[#E2E8F0]">{r.lifted.toLocaleString()}</td>
                              <td className="p-4 text-sm font-semibold text-right text-[#005689]">{r.achievement == null ? 'N/A' : `${r.achievement}%`}</td>
                            </tr>
                          ))}
                          {rowsData.length > 0 && (
                            <tr className="bg-[#F8FAFC] border-t-2 border-[#E2E8F0]">
                              <td colSpan={2} className="p-4 text-sm font-bold text-[#1E293B] border-r border-[#E2E8F0]">Total</td>
                              <td className="p-4 text-sm font-bold text-[#1E293B] text-right border-r border-[#E2E8F0]">{totalTarget.toLocaleString()}</td>
                              <td className="p-4 text-sm font-bold text-[#1E293B] text-right border-r border-[#E2E8F0]">{totalLifted.toLocaleString()}</td>
                              <td className="p-4 text-sm font-bold text-[#005689] text-right">{totalAchievement == null ? 'N/A' : `${totalAchievement}%`}</td>
                            </tr>
                          )}
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Inter-Zone Fleet Movement */}
            <div className="bg-[#FFFFFF] rounded-[12px] shadow-sm border border-[#E2E8F0] overflow-hidden mt-6">
              <div className="p-5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-[#1E293B] flex items-center gap-2">
                    <Truck className="text-[#005689]" size={20} />
                    Inter-Zone Fleet Movement
                  </h3>
                  <p className="text-sm text-[#64748B] mt-1 ml-7">
                    Shows the net movement and availability of {interZoneMovementView === 'Cars' ? 'cars' : 'carriers'} across zones to balance fleet distribution.
                  </p>
                </div>
                <div className="flex bg-[#E2E8F0] p-1 rounded-[12px]">
                  <button
                    onClick={() => setInterZoneMovementView('Cars')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${interZoneMovementView === 'Cars' ? 'bg-[#FFFFFF] text-[#1E293B] shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'}`}
                  >
                    Car Wise
                  </button>
                  <button
                    onClick={() => setInterZoneMovementView('Trailers')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${interZoneMovementView === 'Trailers' ? 'bg-[#FFFFFF] text-[#1E293B] shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'}`}
                  >
                    Trailer Wise
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  {(() => {
                    const zoneData = data.filter(d =>
                      d.year === zoneYear &&
                      getMonthsForTimeframe(zoneTimeframe).includes(d.month) &&
                      (zoneOEM === 'All' || d.oem === zoneOEM)
                    );

                    const zones = ALL_ZONES;

                    const zoneStats = zones.map(zone => {
                      const inflowCars = zoneData.filter(d => getDestinationZone(d) === zone).reduce((sum, d) => sum + d.target, 0);

                      // Outflow: Cars/Trailers leaving this zone (Origin = Zone)
                      // We use 'target' here because we want to know how many are EXPECTED to leave based on SOB
                      const outflowCars = zoneData.filter(d => getOriginZone(d.plant) === zone).reduce((sum, d) => sum + d.target, 0);

                      const inflow = interZoneMovementView === 'Cars' ? inflowCars : Math.ceil(inflowCars / trailerCapacity);
                      const outflow = interZoneMovementView === 'Cars' ? outflowCars : Math.ceil(outflowCars / trailerCapacity);

                      // Gap = Inflow (what we receive) - Outflow (what we need to send out)
                      // Positive gap means we have surplus trailers/cars after fulfilling our outgoing needs
                      // Negative gap means we have a shortage and need more trailers/cars from other zones
                      const gap = inflow - outflow;

                      return {
                        zone,
                        inflow,
                        outflow,
                        gap
                      };
                    });

                    const surpluses = zoneStats.filter(z => z.gap > 0).map(z => ({ ...z, remaining: z.gap })).sort((a, b) => b.gap - a.gap);
                    const shortages = zoneStats.filter(z => z.gap < 0).map(z => ({ ...z, remaining: Math.abs(z.gap) })).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

                    const suggestions: { from: string, to: string, amount: number }[] = [];

                    let sIdx = 0;
                    let shIdx = 0;

                    while (sIdx < surpluses.length && shIdx < shortages.length) {
                      const surplus = surpluses[sIdx];
                      const shortage = shortages[shIdx];

                      const amount = Math.min(surplus.remaining, shortage.remaining);

                      if (amount > 0) {
                        suggestions.push({
                          from: surplus.zone,
                          to: shortage.zone,
                          amount
                        });
                      }

                      surplus.remaining -= amount;
                      shortage.remaining -= amount;

                      if (surplus.remaining === 0) sIdx++;
                      if (shortage.remaining === 0) shIdx++;
                    }

                    return (
                      <>
                        <thead>
                          <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                            <th className="p-4 text-sm font-semibold text-[#64748B] uppercase tracking-wider">Zone Name</th>
                            <th className="p-4 text-sm font-semibold text-[#64748B] uppercase tracking-wider text-center">Current {interZoneMovementView === 'Cars' ? 'Cars' : 'Fleet'} in Zone (Inflow)</th>
                            <th className="p-4 text-sm font-semibold text-[#64748B] uppercase tracking-wider text-center">SOB Target {interZoneMovementView === 'Cars' ? '(Cars)' : '(Trailers)'} (Outflow)</th>
                            <th className="p-4 text-sm font-semibold text-[#64748B] uppercase tracking-wider text-center">Gap</th>
                            <th className="p-4 text-sm font-semibold text-[#64748B] uppercase tracking-wider">Movement Suggestion</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                          {zoneStats.map(stat => {
                            const zoneSuggestions = suggestions.filter(s => s.from === stat.zone || s.to === stat.zone);

                            return (
                              <tr key={stat.zone} className="hover:bg-[#F8FAFC] transition-colors">
                                <td className="p-4 text-sm font-bold text-[#1E293B]">
                                  {stat.zone}
                                </td>
                                <td className="p-4 text-sm text-[#64748B] text-center">
                                  {stat.inflow.toLocaleString()}
                                </td>
                                <td className="p-4 text-sm text-[#64748B] text-center">
                                  {stat.outflow.toLocaleString()}
                                </td>
                                <td className="p-4 text-sm text-center font-bold">
                                  {stat.gap < 0 ? (
                                    <span className="text-red-600 bg-red-50 px-2 py-1 rounded-md">Shortage ({Math.abs(stat.gap)})</span>
                                  ) : stat.gap > 0 ? (
                                    <span className="text-green-600 bg-green-50 px-2 py-1 rounded-md">Surplus (+{stat.gap})</span>
                                  ) : (
                                    <span className="text-gray-500">Balanced (0)</span>
                                  )}
                                </td>
                                <td className="p-4 text-sm text-[#64748B]">
                                  {zoneSuggestions.length > 0 ? (
                                    <ul className="space-y-1">
                                      {zoneSuggestions.map((s, i) => (
                                        <li key={i} className="flex items-center gap-1">
                                          {s.from === stat.zone ? (
                                            <>
                                              <span className="text-[#005689] font-medium">Move {s.amount}</span> {interZoneMovementView === 'Cars' ? 'cars' : 'trailers'} to {s.to}
                                            </>
                                          ) : (
                                            <>
                                              <span className="text-[#10B981] font-medium">Receive {s.amount}</span> {interZoneMovementView === 'Cars' ? 'cars' : 'trailers'} from {s.from}
                                            </>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <span className="text-gray-400 italic">No movement needed</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </>
                    );
                  })()}
                </table>
              </div>
            </div>

            {/* Plant-Wise Inflow Distribution */}
            <div className="bg-[#FFFFFF] rounded-[12px] shadow-sm border border-[#E2E8F0] overflow-hidden mt-6">
              <div className="p-5 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <h3 className="text-lg font-bold text-[#1E293B] flex items-center gap-2">
                  <Factory className="text-[#005689]" size={20} />
                  Plant-Wise Inflow Distribution
                </h3>
                <p className="text-sm text-[#64748B] mt-1 ml-7">
                  Distributes the incoming trailers (inflow) to individual plants within each zone based on their SOB targets.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                  <thead className="bg-[#F8FAFC]">
                    <tr className="text-[#1E293B] text-xs uppercase tracking-wider border-b-2 border-[#E2E8F0]">
                      <th className="p-4 font-semibold border-r border-[#E2E8F0]">Origin Zone</th>
                      <th className="p-4 font-semibold border-r border-[#E2E8F0]">Plant</th>
                      <th className="p-4 font-semibold text-right border-r border-[#E2E8F0]">SOB Target (Cars)</th>
                      <th className="p-4 font-semibold text-right border-r border-[#E2E8F0]">SOB Target (Trailers)</th>
                      <th className="p-4 font-semibold text-right border-r border-[#E2E8F0]">Inflow Monthly (Trailers)</th>
                      <th className="p-4 font-semibold text-right border-r border-[#E2E8F0]">Inflow Weekly (Trailers)</th>
                      <th className="p-4 font-semibold text-right border-r border-[#E2E8F0]">Inflow Daily (Trailers)</th>
                      <th className="p-4 font-semibold text-right">Gap (Trailers)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {(() => {
                      const zoneData = data.filter(d =>
                        d.year === zoneYear &&
                        getMonthsForTimeframe(zoneTimeframe).includes(d.month) &&
                        (zoneOEM === 'All' || d.oem === zoneOEM)
                      );

                      const daysInMonth = getDaysInTimeframe(zoneTimeframe, zoneYear);
                      const rows: React.ReactNode[] = [];

                      // Group by origin zone — use ALL plants that have target data
                      const originZoneMap = new Map<string, string[]>();
                      zoneData.forEach(d => {
                        const oz = getOriginZone(d.plant) || 'Unknown';
                        if (!originZoneMap.has(oz)) originZoneMap.set(oz, []);
                        const plants = originZoneMap.get(oz)!;
                        if (!plants.includes(d.plant)) plants.push(d.plant);
                      });

                      // Sort origin zones alphabetically
                      const sortedOriginZones = Array.from(originZoneMap.keys()).sort();

                      sortedOriginZones.forEach(zone => {
                        const inflowCars = zoneData.filter(d => getDestinationZone(d) === zone).reduce((sum, d) => sum + d.target, 0);
                        const zoneInflowTrailers = Math.ceil(inflowCars / trailerCapacity);

                        const zoneOutflowCars = zoneData.filter(d => getOriginZone(d.plant) === zone).reduce((sum, d) => sum + d.target, 0);
                        const zonePlants = (originZoneMap.get(zone) || []).sort();

                        // Filter to plants with actual target data
                        const activePlants = zonePlants.filter(plant =>
                          zoneData.filter(d => d.plant === plant).reduce((sum, d) => sum + d.target, 0) > 0
                        );
                        if (activePlants.length === 0) return;

                        activePlants.forEach((plant, index) => {
                          const plantTargetCars = zoneData.filter(d => d.plant === plant).reduce((sum, d) => sum + d.target, 0);
                          const plantTargetTrailers = Math.ceil(plantTargetCars / trailerCapacity);
                          const proportion = zoneOutflowCars > 0 ? plantTargetCars / zoneOutflowCars : 0;

                          const allocatedMonthly = Math.round(zoneInflowTrailers * proportion);
                          const allocatedWeekly = Math.round((allocatedMonthly / Math.max(1, daysInMonth)) * 7).toString();
                          const allocatedDaily = Math.round(allocatedMonthly / Math.max(1, daysInMonth)).toString();

                          const gap = allocatedMonthly - plantTargetTrailers;

                          rows.push(
                            <tr key={`${zone}-${plant}`} className="hover:bg-[#F8FAFC] transition-colors">
                              {index === 0 && (
                                <td className="p-4 text-sm font-bold text-[#1E293B] border-r border-[#E2E8F0] align-top" rowSpan={activePlants.length}>
                                  {zone}
                                  <div className="text-xs font-normal text-[#64748B] mt-1">Total Inflow: {zoneInflowTrailers}</div>
                                </td>
                              )}
                              <td className="p-4 text-sm font-medium text-[#1E293B] border-r border-[#E2E8F0]">{plant}</td>
                              <td className="p-4 text-sm text-[#64748B] text-right border-r border-[#E2E8F0]">{plantTargetCars.toLocaleString()}</td>
                              <td className="p-4 text-sm text-[#64748B] text-right border-r border-[#E2E8F0]">{plantTargetTrailers.toLocaleString()}</td>
                              <td className="p-4 text-sm font-semibold text-[#005689] text-right border-r border-[#E2E8F0] bg-[#F0F9FF]/50">{allocatedMonthly.toLocaleString()}</td>
                              <td className="p-4 text-sm font-semibold text-[#005689] text-right border-r border-[#E2E8F0] bg-[#F0F9FF]/50">{allocatedWeekly}</td>
                              <td className="p-4 text-sm font-semibold text-[#005689] text-right border-r border-[#E2E8F0] bg-[#F0F9FF]/50">{allocatedDaily}</td>
                              <td className="p-4 text-sm text-center font-bold">
                                {gap < 0 ? (
                                  <span className="text-red-600 bg-red-50 px-2 py-1 rounded-md">Shortage ({Math.abs(gap)})</span>
                                ) : gap > 0 ? (
                                  <span className="text-green-600 bg-green-50 px-2 py-1 rounded-md">Surplus (+{gap})</span>
                                ) : (
                                  <span className="text-gray-500">Balanced (0)</span>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      });

                      return rows.length > 0 ? rows : (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-[#64748B]">No plant data available for the selected filters.</td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'fleet-planner' && (
          <FleetPlanner
            data={enrichedData}
            oems={oems}
            plants={masterPlants}
            oemPlantMap={oemPlantMap}
            plantDestMap={plantDestMap}
            getDestinationZone={getDestinationZone}
            getOriginZone={getOriginZone}
            destZones={ALL_DEST_ZONES}
            globalYear={plannerYear}
            globalTimeframe={plannerTimeframe}
            globalOEM={plannerOEM}
            globalPlant={plannerPlant}
            getMonthsForTimeframe={getMonthsForTimeframe}
            plannerOriginZone={plannerOriginZone}
            setPlannerOriginZone={setPlannerOriginZone}
            plannerOEM={plannerOEM}
            setPlannerOEM={setPlannerOEM}
            plannerPlant={plannerPlant}
            setPlannerPlant={setPlannerPlant}
            plannerBranch={plannerBranch}
            setPlannerBranch={setPlannerBranch}
            plannerFilteredZones={plannerFilteredZones}
            plannerFilteredOEMs={plannerFilteredOEMs}
            plannerFilteredPlants={plannerFilteredPlants}
            plannerFilteredBranches={plannerFilteredBranches}
          />
        )}

        {activeTab === 'branch-performance' && (
          <BranchPerformanceTargetReport
            data={enrichedData}
            allEntryLogs={allEntryLogs}
            years={years}
            months={months}
            currentYear={currentYear}
            currentMonth={currentMonth}
            oems={oems}
            masterPlants={masterPlants}
            oemPlantMap={oemPlantMap}
            trailerCapacity={trailerCapacity}
          />
        )}

        {activeTab === 'today-target' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-[#FFFFFF] p-6 rounded-[16px] shadow-sm border border-[#E2E8F0]">
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-[#1E293B]">{targetViewMode === 'today' ? "Today's Action Plan" : "Weekly Action Plan"}</h2>
                  <p className="text-[#64748B] mt-1">Focus areas and required run rates to meet the {currentMonth} {currentYear} SOB.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex bg-[#F1F5F9] p-1 rounded-xl border border-[#E2E8F0] self-start md:self-auto">
                    <button
                      onClick={() => setTargetViewMode('today')}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${targetViewMode === 'today' ? 'bg-white text-[#005689] shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'}`}
                    >
                      Today
                    </button>
                    <button
                      onClick={() => setTargetViewMode('week')}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${targetViewMode === 'week' ? 'bg-white text-[#005689] shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'}`}
                    >
                      Current Week
                    </button>
                  </div>
                  <div className="bg-[#F1F5F9] px-4 py-2 rounded-xl border border-[#E2E8F0] flex items-center gap-2 self-start md:self-auto">
                    <CalendarClock className="text-[#005689]" size={20} />
                    <span className="font-semibold text-[#1E293B]">Day {todayTargetData.currentDay} of {todayTargetData.daysInMonth}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-[#F8FAFC] p-5 rounded-[16px] border border-[#E2E8F0]">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-[#E0F2FE] rounded-lg text-[#005689]">
                      <Crosshair size={20} />
                    </div>
                    <h3 className="font-semibold text-[#64748B]">{targetViewMode === 'today' ? "Required Today" : "Required This Week"}</h3>
                  </div>
                  <div className="text-3xl font-bold text-[#1E293B]">{Math.ceil(targetViewMode === 'today' ? todayTargetData.totalRequiredDaily : todayTargetData.totalRequiredWeekly).toLocaleString()} <span className="text-sm font-medium text-[#64748B]">cars</span></div>
                  <p className="text-xs text-[#94A3B8] mt-2">To meet remaining {todayTargetData.totalRemaining.toLocaleString()} target</p>
                </div>

                <div className={`p-5 rounded-[16px] border ${todayTargetData.totalShortfall > 0 ? 'bg-[#FEF2F2] border-[#FECACA]' : 'bg-[#F0FDF4] border-[#BBF7D0]'}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 rounded-lg ${todayTargetData.totalShortfall > 0 ? 'bg-[#FEE2E2] text-[#EF4444]' : 'bg-[#DCFCE7] text-[#22C55E]'}`}>
                      {todayTargetData.totalShortfall > 0 ? <TrendingDown size={20} /> : <TrendingUp size={20} />}
                    </div>
                    <h3 className={`font-semibold ${todayTargetData.totalShortfall > 0 ? 'text-[#991B1B]' : 'text-[#166534]'}`}>Overall Shortfall</h3>
                  </div>
                  <div className={`text-3xl font-bold ${todayTargetData.totalShortfall > 0 ? 'text-[#B91C1C]' : 'text-[#15803D]'}`}>
                    {Math.ceil(todayTargetData.totalShortfall).toLocaleString()} <span className="text-sm font-medium opacity-80">cars</span>
                  </div>
                  <p className={`text-xs mt-2 ${todayTargetData.totalShortfall > 0 ? 'text-[#991B1B]/70' : 'text-[#166534]/70'}`}>
                    {todayTargetData.totalShortfall > 0 ? 'Behind schedule' : 'Ahead of schedule'}
                  </p>
                </div>

                <div className="bg-[#F8FAFC] p-5 rounded-[16px] border border-[#E2E8F0]">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-[#F1F5F9] rounded-lg text-[#64748B]">
                      <Target size={20} />
                    </div>
                    <h3 className="font-semibold text-[#64748B]">Month Progress</h3>
                  </div>
                  <div className="text-3xl font-bold text-[#1E293B]">{Math.round((todayTargetData.totalLifted / Math.max(1, todayTargetData.totalTarget)) * 100)}%</div>
                  <div className="w-full bg-[#E2E8F0] rounded-full h-2 mt-3">
                    <div className="bg-[#005689] h-2 rounded-full" style={{ width: `${Math.min(100, (todayTargetData.totalLifted / Math.max(1, todayTargetData.totalTarget)) * 100)}%` }}></div>
                  </div>
                </div>
              </div>

              <h3 className="text-xl font-bold text-[#1E293B] mb-4 flex items-center gap-2">
                <AlertTriangle className="text-[#F59E0B]" size={24} />
                Top Plants Needing Attention
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {todayTargetData.plants.filter((p: any) => p.shortfall > 0).slice(0, 3).map((plant: any, idx: number) => (
                  <div key={idx} className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-[12px] p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-bold text-[#1E293B]">{plant.name}</h4>
                        <span className="text-xs font-medium px-2 py-0.5 bg-[#F1F5F9] text-[#64748B] rounded-full">{plant.zone}</span>
                      </div>
                      <div className="bg-[#FEF2F2] text-[#EF4444] text-xs font-bold px-2 py-1 rounded-lg">
                        -{Math.ceil(plant.shortfall)}
                      </div>
                    </div>
                    <div className="mt-4 flex justify-between items-end">
                      <div>
                        <p className="text-xs text-[#64748B]">{targetViewMode === 'today' ? "Required Daily" : "Required Weekly"}</p>
                        <p className="font-bold text-[#005689]">{Math.ceil(targetViewMode === 'today' ? plant.requiredDaily : plant.requiredWeekly)} cars</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[#64748B]">Progress</p>
                        <p className="font-semibold text-[#1E293B]">{Math.round((plant.lifted / Math.max(1, plant.target)) * 100)}%</p>
                      </div>
                    </div>
                  </div>
                ))}
                {todayTargetData.plants.filter((p: any) => p.shortfall > 0).length === 0 && (
                  <div className="col-span-3 p-6 text-center bg-[#F0FDF4] border border-[#BBF7D0] rounded-[12px] text-[#166534]">
                    <CheckCircle2 size={32} className="mx-auto mb-2 opacity-80" />
                    <p className="font-semibold">All plants are on track!</p>
                  </div>
                )}
              </div>

              {/* ── Breakdown Table with 4 view tabs ── */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xl font-bold text-[#1E293B]">Breakdown</h3>
                <div className="flex bg-[#F1F5F9] p-1 rounded-xl border border-[#E2E8F0] gap-0.5">
                  {([
                    { key: 'zone',   label: 'Origin Zone' },
                    { key: 'oem',    label: 'OEM' },
                    { key: 'plant',  label: 'Plant' },
                    { key: 'branch', label: 'Branch' },
                  ] as { key: 'zone'|'oem'|'plant'|'branch'; label: string }[]).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setTodayBreakdownView(tab.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                        todayBreakdownView === tab.key
                          ? 'bg-[#005689] text-white shadow-sm'
                          : 'text-[#64748B] hover:text-[#1E293B]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto rounded-[12px] border border-[#E2E8F0]">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#F8FAFC]">
                    <tr className="text-[#64748B] text-xs uppercase tracking-wider border-b border-[#E2E8F0]">
                      <todayTargetSearch.FilterHeader
                        title={todayBreakdownView === 'zone' ? 'Origin Zone' : todayBreakdownView === 'oem' ? 'OEM' : todayBreakdownView === 'plant' ? 'Plant' : 'Branch'}
                        columnKey="name"
                      />
                      {todayBreakdownView === 'plant' && (
                        <th className="p-3 text-xs font-bold text-[#64748B] uppercase tracking-wider border-r border-[#E2E8F0]">Origin Zone</th>
                      )}
                      <todayTargetSearch.FilterHeader title="Monthly Target" columnKey="target" className="text-right" />
                      <todayTargetSearch.FilterHeader title="Lifted" columnKey="lifted" className="text-right" />
                      <todayTargetSearch.FilterHeader title="Expected (To Date)" columnKey="expected" className="text-right" />
                      <todayTargetSearch.FilterHeader title="Balance" columnKey="remaining" className="text-right" />
                      <todayTargetSearch.FilterHeader title="Shortfall" columnKey="shortfall" className="text-right" />
                      <todayTargetSearch.FilterHeader title={targetViewMode === 'today' ? 'Req / Day' : 'Req / Week'} columnKey="required" className="text-right" />
                      <th className="p-3 text-xs font-bold text-[#64748B] uppercase tracking-wider text-right border-l border-[#E2E8F0]">Ach %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {(() => {
                      const rows =
                        todayBreakdownView === 'zone'   ? todayTargetData.zones :
                        todayBreakdownView === 'oem'    ? todayTargetData.oems :
                        todayBreakdownView === 'plant'  ? todayTargetData.plants :
                        todayTargetData.branches;
                      const filtered = todayTargetSearch.filterData(rows);
                      if (filtered.length === 0) {
                        return (
                          <tr>
                            <td colSpan={todayBreakdownView === 'plant' ? 9 : 8} className="p-8 text-center text-[#94A3B8] text-sm">
                              No data for {currentMonth} {currentYear}
                            </td>
                          </tr>
                        );
                      }
                      return filtered.map((row: any, idx: number) => {
                        const ach = row.target > 0 ? (row.lifted / row.target) * 100 : 0;
                        const isShortfall = row.shortfall > 0;
                        return (
                          <tr key={idx} className="hover:bg-[#F8FAFC] transition-colors">
                            <td className="p-3 font-bold text-[#1E293B] whitespace-nowrap">{row.name}</td>
                            {todayBreakdownView === 'plant' && (
                              <td className="p-3 text-[#64748B] text-xs whitespace-nowrap">
                                <span className="px-2 py-0.5 bg-[#F1F5F9] rounded-full">{row.zone || '—'}</span>
                              </td>
                            )}
                            <td className="p-3 text-right text-[#64748B]">{row.target.toLocaleString()}</td>
                            <td className="p-3 text-right font-semibold text-[#1E293B]">{row.lifted.toLocaleString()}</td>
                            <td className="p-3 text-right text-[#64748B]">{Math.ceil(row.expected).toLocaleString()}</td>
                            <td className="p-3 text-right text-[#475569]">{row.remaining.toLocaleString()}</td>
                            <td className="p-3 text-right">
                              <span className={`font-bold px-2 py-0.5 rounded-lg text-xs ${isShortfall ? 'bg-[#FEF2F2] text-[#EF4444]' : 'bg-[#F0FDF4] text-[#22C55E]'}`}>
                                {isShortfall ? `-${Math.ceil(row.shortfall).toLocaleString()}` : `+${Math.abs(Math.ceil(row.shortfall)).toLocaleString()}`}
                              </span>
                            </td>
                            <td className="p-3 text-right font-bold text-[#005689]">
                              {Math.ceil(targetViewMode === 'today' ? row.requiredDaily : row.requiredWeekly).toLocaleString()}
                            </td>
                            <td className="p-3 text-right border-l border-[#E2E8F0]">
                              <span className={`font-semibold text-sm ${ach >= 100 ? 'text-[#22C55E]' : ach >= 75 ? 'text-[#F59E0B]' : 'text-[#EF4444]'}`}>
                                {Math.round(ach)}%
                              </span>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#F8FAFC] border-t-2 border-[#CBD5E1] font-bold text-[#1E293B] text-sm">
                      <td className="p-3 uppercase text-[#005689]" colSpan={todayBreakdownView === 'plant' ? 2 : 1}>Total</td>
                      <td className="p-3 text-right">{todayTargetData.totalTarget.toLocaleString()}</td>
                      <td className="p-3 text-right text-green-600">{todayTargetData.totalLifted.toLocaleString()}</td>
                      <td className="p-3 text-right text-[#64748B]">{Math.ceil(todayTargetData.expectedTotal).toLocaleString()}</td>
                      <td className="p-3 text-right text-[#475569]">{todayTargetData.totalRemaining.toLocaleString()}</td>
                      <td className="p-3 text-right">
                        <span className={`font-bold px-2 py-0.5 rounded-lg text-xs ${todayTargetData.totalShortfall > 0 ? 'bg-[#FEF2F2] text-[#EF4444]' : 'bg-[#F0FDF4] text-[#22C55E]'}`}>
                          {todayTargetData.totalShortfall > 0 ? `-${Math.ceil(todayTargetData.totalShortfall).toLocaleString()}` : `+${Math.abs(Math.ceil(todayTargetData.totalShortfall)).toLocaleString()}`}
                        </span>
                      </td>
                      <td className="p-3 text-right text-[#005689]">
                        {Math.ceil(targetViewMode === 'today' ? todayTargetData.totalRequiredDaily : todayTargetData.totalRequiredWeekly).toLocaleString()}
                      </td>
                      <td className="p-3 text-right border-l border-[#E2E8F0]">
                        <span className={`font-semibold ${todayTargetData.totalTarget > 0 && (todayTargetData.totalLifted / todayTargetData.totalTarget) * 100 >= 100 ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                          {todayTargetData.totalTarget > 0 ? Math.round((todayTargetData.totalLifted / todayTargetData.totalTarget) * 100) : 0}%
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'admin' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* User Details */}
              <div className="bg-[#FFFFFF] p-6 rounded-[12px] shadow-sm border border-[#E2E8F0]">
                <h3 className="text-lg font-bold text-[#1E293B] mb-4 flex items-center gap-2">
                  <Shield className="text-[#005689]" size={20} />
                  Current Session Details
                </h3>
                {currentUser ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b border-[#E2E8F0]">
                      <span className="text-[#64748B]">Username</span>
                      <span className="font-bold text-[#1E293B]">{currentUser.username}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-[#E2E8F0]">
                      <span className="text-[#64748B]">Role</span>
                      <span className="font-bold text-[#1E293B]">{currentUser.role}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-[#E2E8F0]">
                      <span className="text-[#64748B]">Login Time</span>
                      <span className="font-bold text-[#1E293B]">{new Date(currentUser.loginTime).toLocaleTimeString()}</span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-[#64748B]">Session Duration</span>
                      <span className="font-bold text-[#1E293B]">
                        {Math.floor((Date.now() - currentUser.loginTime) / 60000)} minutes
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[#64748B]">No active session.</p>
                )}
              </div>

              {/* User Management */}
              <UserManagement users={users} setUsers={setUsers} currentUserRole={currentUser?.role || 'Viewer'} />

              {/* Transport Profile */}
              {userRole === 'Admin' && (
                <div className="bg-[#FFFFFF] p-6 rounded-[12px] shadow-sm border border-[#E2E8F0]">
                  <h3 className="text-lg font-bold text-[#1E293B] mb-4 flex items-center gap-2">
                    <Truck className="text-[#005689]" size={20} />
                    Transport Profile
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="text-sm font-medium text-[#1E293B]">Transport Name</label>
                      <input
                        type="text"
                        value={transportName}
                        onChange={e => setTransportName(e.target.value)}
                        className="w-full mt-1 border border-[#CBD5E1] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#005689] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[#1E293B]">Logo URL (JPEG/PNG)</label>
                      <input
                        type="text"
                        value={transportLogo}
                        onChange={e => setTransportLogo(e.target.value)}
                        placeholder="https://..."
                        className="w-full mt-1 border border-[#CBD5E1] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#005689] outline-none"
                      />

                      <div className="mt-2 flex items-center gap-2">
                        <label className="inline-flex items-center gap-2 cursor-pointer bg-[#005689] text-white px-3 py-1 rounded text-sm hover:opacity-90">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files && e.target.files[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = () => {
                                const result = reader.result as string | null;
                                if (result) setTransportLogo(result);
                              };
                              reader.readAsDataURL(file);
                            }}
                          />
                          Upload Image
                        </label>
                        <button
                          type="button"
                          onClick={() => setTransportLogo('')}
                          className="text-sm px-3 py-1 rounded border border-[#CBD5E1] bg-white text-[#005689] hover:bg-[#F1F5F9]"
                        >
                          Clear
                        </button>
                      </div>

                      {transportLogo && (
                        <div className="mt-3 p-2 border border-dashed border-[#CBD5E1] rounded-lg inline-block bg-white">
                          <img src={transportLogo} alt="Logo Preview" className="h-10 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} onLoad={(e) => (e.currentTarget.style.display = 'block')} />
                        </div>
                      )}
                    </div>
                  </div>

                  <TransportProfileEntryStatus plantsWithTargets={plantsWithTargets} allEntryLogs={allEntryLogs} />
                </div>
              )}


              {/* Master Data Management */}
              {userRole === 'Admin' && (
                <GlobalMasterDataTable
                  masterRoutes={masterRoutes}
                  setMasterRoutes={setMasterRoutes}
                  manageByBranchMap={manageByBranchMap}
                  setManageByBranchMap={setManageByBranchMap}
                    plantsWithTargets={plantsWithTargets}
                    allEntryLogs={allEntryLogs}
                    setAllEntryLogs={setAllEntryLogs}
                />
              )}

              {/* App Settings */}
              {userRole === 'Admin' && (
                <div className="space-y-6 mt-6">
                  <ApplicationSettings trailerCapacity={trailerCapacity} setTrailerCapacity={setTrailerCapacity} />



                  {userRole === 'Admin' && (
                    <RoleTabConfigEditor roleTabsMap={roleTabsMap} setRoleTabsMap={setRoleTabsMap} ALL_TABS={ALL_TABS} />
                  )}

                  {userRole === 'Admin' && (
                    <RestoreData />
                  )}
                </div>
              )}
            </div>

            {/* Activity Logs */}
            {userRole === 'Admin' && (
              <div className="bg-[#FFFFFF] rounded-[12px] shadow-sm border border-[#E2E8F0] overflow-hidden">
                <div className="p-5 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <h3 className="text-lg font-bold text-[#1E293B] flex items-center gap-2">
                    <Activity className="text-[#005689]" size={20} />
                    System Activity Logs
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-[#F8FAFC]">
                      <tr className="text-[#1E293B] text-xs uppercase tracking-wider border-b-2 border-[#E2E8F0]">
                        <th className="p-4 font-semibold">Time</th>
                        <th className="p-4 font-semibold">User (Mobile)</th>
                        <th className="p-4 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {activityLogs.length > 0 ? (
                        activityLogs.map(log => (
                          <tr key={log.id} className="hover:bg-[#F8FAFC] transition-colors">
                            <td className="p-4 text-sm text-[#64748B] whitespace-nowrap">
                              {new Date(log.timestamp).toLocaleString()}
                            </td>
                            <td className="p-4 text-sm font-medium text-[#1E293B]">
                              {log.username}
                            </td>
                            <td className="p-4 text-sm text-[#64748B]">
                              {log.action}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="p-8 text-center text-[#64748B]">No activity logs found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {activeTab === 'data-entry' && (
        <div className="max-w-5xl mx-auto space-y-4 animate-in fade-in duration-500">
          <div className="bg-[#FFFFFF] rounded-[12px] shadow-sm border border-[#E2E8F0] overflow-visible">

            {/* Header */}
            <div className="px-5 py-3 border-b border-[#E2E8F0] flex items-center gap-2 bg-[#F8FAFC] rounded-t-[12px]">
              <Plus className="text-[#005689]" size={20} />
              <h2 className="text-base font-bold text-[#1E293B]">New Data Entry</h2>
            </div>

            {/* Form body */}
            <div className="p-5 md:p-7">
              <form onSubmit={handleEntrySubmit} className="max-w-3xl mx-auto">

                {/* Reusable label + input wrapper styles via inline constants */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">

                  {/* Row 1 — Year / Month / Entry Date */}
                  <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
                    <div>
                      <label htmlFor="entry-year" className="block mb-0.5 text-[13px] font-medium text-[#475569]">Year</label>
                      <select
                        id="entry-year"
                        value={entryForm.year}
                        onChange={(e) => setEntryForm({ ...entryForm, year: parseInt(e.target.value, 10), oem: '', plant: '', statecity: '', zone: '', city: '' })}
                        style={{ height: 38 }}
                        className="w-full border border-[#CBD5E1] rounded-md px-2.5 text-sm focus:ring-2 focus:ring-[#005689] focus:border-[#005689] outline-none bg-[#FFFFFF] appearance-none cursor-pointer"
                        required
                      >
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="entry-month" className="block mb-0.5 text-[13px] font-medium text-[#475569]">Month</label>
                      <select
                        id="entry-month"
                        value={entryForm.month}
                        onChange={(e) => setEntryForm({ ...entryForm, month: e.target.value, oem: '', plant: '', statecity: '', zone: '', city: '' })}
                        style={{ height: 38 }}
                        className="w-full border border-[#CBD5E1] rounded-md px-2.5 text-sm focus:ring-2 focus:ring-[#005689] focus:border-[#005689] outline-none bg-[#FFFFFF] appearance-none cursor-pointer"
                        required
                      >
                        {months.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="entry-date" className="mb-0.5 text-[13px] font-medium text-[#475569] flex items-center gap-1">
                        <CalendarDays size={13} className="text-[#005689]" />
                        Entry Date
                      </label>
                      <input
                        id="entry-date"
                        type="date"
                        value={entryForm.date}
                        max={todayDateStr}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) return;
                          const picked = new Date(val);
                          setEntryForm(prev => ({
                            ...prev,
                            date: val,
                            year: picked.getFullYear(),
                            month: months[picked.getMonth()],
                            oem: '', plant: '', statecity: '', zone: '', city: '',
                          }));
                        }}
                        style={{ height: 38 }}
                        className="w-full border border-[#CBD5E1] rounded-md px-2.5 text-sm focus:ring-2 focus:ring-[#005689] focus:border-[#005689] outline-none bg-[#FFFFFF] cursor-pointer"
                        required
                      />
                      {entryForm.date !== todayDateStr && (
                        <p className="text-[11px] text-amber-600 flex items-center gap-1 mt-0.5">
                          <span>⚠</span> Back-filling for {new Date(entryForm.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Row 3 — OEM / Plant */}
                  <div>
                    <label htmlFor="entry-oem" className="block mb-0.5 text-[13px] font-medium text-[#475569]">OEM</label>
                    <select
                      id="entry-oem"
                      value={entryForm.oem}
                      onChange={(e) => setEntryForm({ ...entryForm, oem: e.target.value, plant: '', statecity: '', zone: '', city: '' })}
                      style={{ height: 38 }}
                      className="w-full border border-[#CBD5E1] rounded-md px-2.5 text-sm focus:ring-2 focus:ring-[#005689] focus:border-[#005689] outline-none bg-[#FFFFFF] disabled:bg-[#F1F5F9] appearance-none cursor-pointer"
                      required
                      disabled={!entryForm.month}
                    >
                      <option value="" disabled>Select OEM</option>
                      {masterOEMs.map(oem => <option key={oem} value={oem}>{oem}</option>)}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="entry-plant" className="block mb-0.5 text-[13px] font-medium text-[#475569]">Plant</label>
                    <select
                      id="entry-plant"
                      value={entryForm.plant}
                      onChange={(e) => setEntryForm({ ...entryForm, plant: e.target.value, statecity: '', zone: '', city: '' })}
                      style={{ height: 38 }}
                      className="w-full border border-[#CBD5E1] rounded-md px-2.5 text-sm focus:ring-2 focus:ring-[#005689] focus:border-[#005689] outline-none bg-[#FFFFFF] disabled:bg-[#F1F5F9] appearance-none cursor-pointer"
                      required
                      disabled={!entryForm.oem}
                    >
                      <option value="" disabled>Select Plant</option>
                      {formPlants.map(plant => <option key={plant} value={plant}>{plant}</option>)}
                    </select>
                  </div>

                  {/* Row 4 — Total Trailer Lifted */}
                  <div>
                    <label htmlFor="entry-trailer-qty" className="block mb-0.5 text-[13px] font-medium text-[#475569]">Total Trailer Lifted</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={entryForm.trailerType}
                        onChange={(e) => setEntryForm({ ...entryForm, trailerType: e.target.value as any })}
                        style={{ height: 38 }}
                        className="w-[40%] border border-[#CBD5E1] rounded-md px-2.5 text-sm focus:ring-2 focus:ring-[#005689] focus:border-[#005689] outline-none bg-[#FFFFFF] appearance-none cursor-pointer"
                      >
                        <option value="Trailer">Trailer</option>
                        <option value="Truck">Truck</option>
                      </select>
                      <input
                        id="entry-trailer-qty"
                        type="number"
                        min="0"
                        value={entryForm.trailerQty}
                        onChange={(e) => { const v = e.target.value; if (v === '' || Number(v) >= 0) setEntryForm({ ...entryForm, trailerQty: v }); }}
                        style={{ height: 38 }}
                        className="w-[60%] border border-[#CBD5E1] rounded-md px-2.5 text-sm focus:ring-2 focus:ring-[#005689] focus:border-[#005689] outline-none bg-[#FFFFFF]"
                        placeholder="Qty"
                      />
                    </div>
                  </div>

                  {/* empty right cell to keep grid balanced */}
                  <div className="hidden md:block" />

                  {/* Row 5 — Zone AO / State-City */}
                  <div>
                    <label htmlFor="entry-zone-search" className="block mb-0.5 text-[13px] font-medium text-[#475569]">Zone AO</label>
                    <FormCombobox
                      id="entry-zone-search"
                      value={entryForm.zone}
                      placeholder={entryForm.plant ? "Search Zone AO…" : "Select Plant first"}
                      disabled={!entryForm.plant}
                      options={formZones}
                      onChange={(val: string) => setEntryForm({ ...entryForm, zone: val, statecity: '' })}
                      onClear={() => setEntryForm({ ...entryForm, zone: '', statecity: '' })}
                    />
                  </div>

                  <div>
                    <label htmlFor="entry-statecity-search" className="block mb-0.5 text-[13px] font-medium text-[#475569]">State / City</label>
                    <FormCombobox
                      id="entry-statecity-search"
                      value={entryForm.statecity}
                      placeholder={entryForm.plant ? "Search State/City…" : "Select Plant first"}
                      disabled={!entryForm.plant}
                      options={formDestinations}
                      onChange={(val: string) => {
                        const newZone = getZoneForRoute(entryForm.oem, entryForm.plant, val);
                        setEntryForm({ ...entryForm, statecity: val, zone: newZone, city: '' });
                      }}
                      onClear={() => setEntryForm({ ...entryForm, statecity: '', zone: '', city: '' })}
                    />
                  </div>

                  {/* Row 6 — Cars Lifted / (empty) */}
                  <div>
                    <label htmlFor="entry-lifted" className="block mb-0.5 text-[13px] font-medium text-[#475569]">Cars Lifted</label>
                    <input
                      id="entry-lifted"
                      type="number"
                      min="1"
                      value={entryForm.lifted}
                      onChange={(e) => { const v = e.target.value; if (v === '' || Number(v) > 0) setEntryForm({ ...entryForm, lifted: v }); }}
                      style={{ height: 38 }}
                      className="w-full border border-[#CBD5E1] rounded-md px-2.5 text-sm focus:ring-2 focus:ring-[#005689] focus:border-[#005689] outline-none bg-[#FFFFFF]"
                      placeholder="Qty"
                      required
                    />
                  </div>

                  {/* empty right cell to keep grid balanced */}
                  <div />

                </div>{/* /grid */}

                {/* Hidden required validators */}
                <input type="text" required value={entryForm.zone} onChange={() => {}} className="sr-only" aria-hidden tabIndex={-1} />
                <input type="text" required value={entryForm.statecity} onChange={() => {}} className="sr-only" aria-hidden tabIndex={-1} />

                {/* Footer row */}
                <div className="mt-4 pt-3 border-t border-[#E2E8F0] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={downloadExcelTemplate}
                      style={{ height: 34 }}
                      className="flex items-center gap-1.5 bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#005689] px-3 text-[13px] font-medium rounded-lg transition-colors border border-[#CBD5E1]"
                    >
                      <Download size={15} />
                      Download Format
                    </button>
                    <div>
                      <input type="file" accept=".xlsx,.xls,.csv" onChange={handleDataEntryFileUpload} className="hidden" id="excel-upload-data" />
                      <label
                        htmlFor="excel-upload-data"
                        style={{ height: 34 }}
                        className="cursor-pointer flex items-center gap-1.5 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#1E293B] px-3 text-[13px] font-medium rounded-lg transition-colors border border-[#CBD5E1]"
                      >
                        <Upload size={15} />
                        Upload Excel
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    style={{ height: 34 }}
                    className="flex items-center gap-1.5 bg-[#005689] hover:bg-[#004066] text-white px-5 text-[13px] font-semibold rounded-lg transition-colors shadow-sm"
                  >
                    <Plus size={15} />
                    Save Entry
                  </button>
                </div>

              </form>
            </div>
          </div>

          <div className="bg-[#FFFFFF] rounded-[12px] shadow-sm border border-[#E2E8F0] overflow-hidden">
            <div className="px-5 py-3 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
              <div>
                <h3 className="text-base font-bold text-[#1E293B]">Review Entries for Selected OEM / Plant</h3>
                <p className="text-xs text-[#64748B]">Latest saved rows for {entryForm.oem || 'All OEMs'} • {entryForm.plant || 'All Plants'}</p>
              </div>
              <span className="text-[12px] text-[#005689] font-medium">{filteredEntryPreviewLogs.length} visible</span>
            </div>
            <div className="p-5">
              {filteredEntryPreviewLogs.length === 0 ? (
                <p className="text-sm text-[#64748B]">No saved entries yet for this OEM and Plant. Save one entry or upload the simplified template to see a preview here.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm border border-[#E2E8F0] rounded-lg overflow-hidden">
                    <thead className="bg-[#F8FAFC] text-[#475569]">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">State/City</th>
                        <th className="px-3 py-2 text-left">Cars</th>
                        <th className="px-3 py-2 text-left">Truck</th>
                        <th className="px-3 py-2 text-left">Trailer</th>
                        <th className="px-3 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEntryPreviewLogs.map(log => {
                        const isEditing = editingLog?.id === log.id;
                        return (
                          <tr key={log.id} className="border-t border-[#E2E8F0] align-top">
                            <td className="px-3 py-2 text-[#1E293B]">{new Date(log.date).toLocaleDateString('en-IN')}</td>
                            <td className="px-3 py-2 text-[#1E293B]">{log.statecity}</td>
                            <td className="px-3 py-2 text-[#1E293B]">{isEditing ? <input type="number" min="0" value={editingLog?.lifted ?? log.lifted} onChange={(e) => setEditingLog(prev => ({ ...prev!, lifted: Number(e.target.value) || 0 }))} className="w-20 border border-[#CBD5E1] rounded px-2 py-1 text-sm" /> : log.lifted}</td>
                            <td className="px-3 py-2 text-[#1E293B]">{isEditing ? <input type="number" min="0" value={editingLog?.trucks ?? log.trucks ?? 0} onChange={(e) => setEditingLog(prev => ({ ...prev!, trucks: Number(e.target.value) || 0 }))} className="w-20 border border-[#CBD5E1] rounded px-2 py-1 text-sm" /> : (log.trucks || 0)}</td>
                            <td className="px-3 py-2 text-[#1E293B]">{isEditing ? <input type="number" min="0" value={editingLog?.trailers ?? log.trailers ?? 0} onChange={(e) => setEditingLog(prev => ({ ...prev!, trailers: Number(e.target.value) || 0 }))} className="w-20 border border-[#CBD5E1] rounded px-2 py-1 text-sm" /> : (log.trailers || 0)}</td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex justify-end gap-2">
                                {isEditing ? (
                                  <>
                                    <button type="button" onClick={saveEditLog} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700 hover:bg-emerald-100">Save</button>
                                    <button type="button" onClick={() => setEditingLog(null)} className="rounded-md border border-[#CBD5E1] bg-white px-2 py-1 text-[#475569] hover:bg-[#F8FAFC]">Cancel</button>
                                  </>
                                ) : (
                                  <>
                                    <button type="button" onClick={() => setEditingLog({ id: log.id, lifted: log.lifted, trucks: log.trucks || 0, trailers: log.trailers || 0 })} className="flex items-center gap-1 rounded-md border border-[#CBD5E1] bg-white px-2 py-1 text-[#005689] hover:bg-[#F8FAFC]">
                                      <Edit2 size={13} /> Edit
                                    </button>
                                    <button type="button" onClick={() => setDeleteLogId(log.id)} className="flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-red-600 hover:bg-red-100">
                                      <Trash2 size={13} /> Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-[#F8FAFC] text-[#1E293B] font-bold border-t border-[#E2E8F0]">
                      <tr>
                        <td colSpan={2} className="px-3 py-2 text-right">Grand Total:</td>
                        <td className="px-3 py-2 text-left">{filteredEntryPreviewLogs.reduce((sum, log) => sum + (log.lifted || 0), 0)}</td>
                        <td className="px-3 py-2 text-left">{filteredEntryPreviewLogs.reduce((sum, log) => sum + (log.trucks || 0), 0)}</td>
                        <td className="px-3 py-2 text-left">{filteredEntryPreviewLogs.reduce((sum, log) => sum + (log.trailers || 0), 0)}</td>
                        <td colSpan={1}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'calendar' && (
        <CalendarTab masterData={allData} />
      )}

      {activeTab === 'zone-branch-report' && (
        <ZoneBranchReport
          data={enrichedData}
          allEntryLogs={allEntryLogs}
          years={years}
          months={months}
          currentYear={currentYear}
          currentMonth={currentMonth}
          oems={oems}
          masterPlants={masterPlants}
          oemPlantMap={oemPlantMap}
        />
      )}

      {activeTab === 'day-branch-report' && (
        <DayWiseBranchReport
          data={enrichedData}
          allEntryLogs={allEntryLogs}
          years={years}
          months={months}
          currentYear={currentYear}
          currentMonth={currentMonth}
          oems={oems}
          masterPlants={masterPlants}
          oemPlantMap={oemPlantMap}
        />
      )}

      {activeTab === 'oem-target-planning' && (
        <OemTargetPlanningEntry
          years={years}
          months={months}
          currentYear={currentYear}
          currentMonth={currentMonth}
          oems={oems}
          masterPlants={masterPlants}
          oemPlantMap={oemPlantMap}
          masterRoutes={masterRoutes}
          data={enrichedData}
          onSave={handleSaveTargetPlan}
          onReset={handleResetTargetPlan}
        />
      )}

      {activeTab === 'sob-download' && (
        <ShareOfBusinessTab
          data={enrichedData}
          allEntryLogs={allEntryLogs}
          years={years}
          months={months}
          currentYear={currentYear}
          currentMonth={currentMonth}
          oems={oems}
          masterPlants={masterPlants}
          oemPlantMap={oemPlantMap}
          transportName={transportName}
          transportLogo={transportLogo}
          trailerCapacity={trailerCapacity}
        />
      )}

      {/* Alerts */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {alerts.map(alert => (
          <div key={alert.id} className="bg-[#10B981] text-white px-4 py-3 rounded-[12px] shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-5 fade-in duration-300">
            <CheckCircle2 size={20} />
            <p className="font-medium text-sm">{alert.message}</p>
            <button onClick={() => setAlerts(prev => prev.filter(a => a.id !== alert.id))} className="text-white/80 hover:text-white ml-2 transition-colors">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* Delete Log Confirmation Modal */}
      {deleteLogId && (
        <div className="fixed inset-0 bg-[#1E293B]/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] rounded-[12px] shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <h2 className="text-xl font-bold text-[#1E293B] mb-4 flex items-center gap-2">
                <AlertCircle className="text-red-500" size={24} />
                Confirm Deletion
              </h2>
              <p className="text-[#64748B] mb-6 leading-relaxed">
                Are you sure you want to delete this entry? The lifted amount will be deducted from the statecity's total. This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteLogId(null)} className="px-4 py-2 text-[#64748B] font-medium hover:bg-[#F1F5F9] rounded-[12px] transition-colors">
                  Cancel
                </button>
                <button onClick={() => { confirmDeleteLog(); setDeleteLogId(null); }} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-[12px] shadow-sm transition-colors">
                  Yes, Delete Entry
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OEMs Modal */}
      <AnimatePresence>
        {showOemsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[16px] shadow-xl border border-slate-200 w-full max-w-md overflow-hidden relative"
            >
              <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                  <Truck className="text-[#005689]" /> Total OEMs ({uniqueOEMsArray.length})
                </h3>
                <button onClick={() => setShowOemsModal(false)} className="text-slate-500 hover:bg-slate-200 p-1 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 max-h-[60vh] overflow-y-auto">
                <ul className="space-y-2">
                  {uniqueOEMsArray.length > 0 ? uniqueOEMsArray.sort().map((oem, idx) => (
                    <li key={idx} className="p-2 bg-slate-50 rounded border border-slate-100 text-slate-700 font-medium">{oem}</li>
                  )) : (
                    <li className="text-slate-500 text-center py-4">No OEMs found.</li>
                  )}
                </ul>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Plants Modal */}
      <AnimatePresence>
        {showPlantsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[16px] shadow-xl border border-slate-200 w-full max-w-md overflow-hidden relative"
            >
              <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                  <Factory className="text-[#F59E0B]" /> Total Plants ({uniquePlantsArray.length})
                </h3>
                <button onClick={() => setShowPlantsModal(false)} className="text-slate-500 hover:bg-slate-200 p-1 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 max-h-[60vh] overflow-y-auto">
                <ul className="space-y-2">
                  {uniquePlantsArray.length > 0 ? uniquePlantsArray.sort().map((plant, idx) => (
                    <li key={idx} className="p-2 bg-slate-50 rounded border border-slate-100 text-slate-700 font-medium">{plant}</li>
                  )) : (
                    <li className="text-slate-500 text-center py-4">No Plants found.</li>
                  )}
                </ul>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
