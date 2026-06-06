import React, { useState, useMemo, useEffect } from "react";
import {
  Calendar,
  Target,
  CarFront,
  AlertCircle,
  BarChart3,
  Clock,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  LabelList,
  PieChart,
  Pie,
  ComposedChart,
} from "recharts";
// FIX 1: Import normalizeZone so zone values are deduplicated (e.g. "West MH" â†’ "West - MH")
import { normalizeZone } from "./App";

// â”€â”€â”€ Searchable / Selectable Dropdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface SearchableSelectProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder = "Select...",
}) => {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(search.toLowerCase())
  );

  // Close on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Focus search input when opened
  React.useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: "relative", minWidth: 160 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </label>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setSearch(""); }}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "7px 10px",
          background: "#fff",
          border: "1.5px solid #cbd5e1",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          color: value && value !== "All" ? "#0b1b42" : "#94a3b8",
          gap: 6,
          transition: "border-color 0.15s",
          outline: "none",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "#3b82f6")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value || placeholder}
        </span>
        {/* Chevron icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 9999,
            background: "#fff",
            border: "1.5px solid #e2e8f0",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            overflow: "hidden",
            minWidth: 180,
          }}
        >
          {/* Search box */}
          <div style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              style={{
                width: "100%",
                padding: "5px 8px",
                border: "1.5px solid #e2e8f0",
                borderRadius: 6,
                fontSize: 12,
                outline: "none",
                color: "#0b1b42",
                background: "#f8fafc",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#3b82f6")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
            />
          </div>

          {/* Option list */}
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: "4px 0",
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            {filtered.length === 0 ? (
              <li style={{ padding: "10px 14px", fontSize: 12, color: "#94a3b8" }}>No results</li>
            ) : (
              filtered.map((opt) => (
                <li
                  key={opt}
                  onClick={() => { onChange(opt); setOpen(false); setSearch(""); }}
                  style={{
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: opt === value ? 700 : 500,
                    color: opt === value ? "#1d4ed8" : "#1e293b",
                    background: opt === value ? "#eff6ff" : "transparent",
                    cursor: "pointer",
                    borderLeft: opt === value ? "3px solid #3b82f6" : "3px solid transparent",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (opt !== value) (e.currentTarget as HTMLLIElement).style.background = "#f8fafc";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLLIElement).style.background = opt === value ? "#eff6ff" : "transparent";
                  }}
                >
                  {opt}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ZoneBranchReportProps {
  data: any[];
  allEntryLogs: any[];
  years: number[];
  months: string[];
  currentYear: number;
  currentMonth: string;
  oems: string[];
  masterPlants: string[];
  oemPlantMap?: Record<string, string[]>;
}

const COLORS = [
  "#0f4a8e",
  "#2e8b57",
  "#d32f2f",
  "#f57c00",
  "#1976d2",
  "#388e3c",
  "#d84315",
];
const ZONE_COLORS: Record<string, string> = {
  "NORTH ZONE": "#1976d2",
  "WEST ZONE": "#388e3c",
  "SOUTH ZONE": "#f57c00",
  "EAST ZONE": "#d32f2f",
  "North": "#1976d2",
  "West": "#388e3c",
  "South": "#f57c00",
  "East": "#d32f2f",
  "Export": "#e91e63",
  "MP": "#9c27b0",
};

// Generate color for any zone name
const getZoneColor = (zoneName: string): string => {
  return ZONE_COLORS[zoneName] || ZONE_COLORS[zoneName.toLowerCase()] || "#0b1b42";
};

export const ZoneBranchReport: React.FC<ZoneBranchReportProps> = ({
  data,
  allEntryLogs,
  years,
  months,
  currentYear,
  currentMonth,
  oems,
  masterPlants,
  oemPlantMap = {},
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<string>(
    currentYear.toString(),
  );
  const [selectedZone, setSelectedZone] = useState<string>("All");
  const [selectedCity, setSelectedCity] = useState<string>("All");
  const [selectedBranchName, setSelectedBranchName] = useState<string>("All");
  const [selectedOEM, setSelectedOEM] = useState<string>("All");
  const [selectedPlant, setSelectedPlant] = useState<string>("All");

  // Filter Data
  const filteredData = useMemo(() => {
    let fd = data.filter(
      (d) =>
        (!d.month || d.month === selectedMonth) &&
        (!d.year || d.year.toString() === selectedYear),
    );

    if (selectedOEM !== "All") {
      fd = fd.filter((d) => d.oem === selectedOEM);
    }
    if (selectedPlant !== "All") {
      fd = fd.filter((d) => d.plant === selectedPlant);
    }
    if (selectedZone !== "All") {
      fd = fd.filter((d) =>
        normalizeZone(d.zone || "Unknown").trim() === selectedZone
      );
    }
    if (selectedCity !== "All") {
      fd = fd.filter(
        (d) =>
          (d.statecity || "Unknown").toUpperCase() ===
          selectedCity.toUpperCase(),
      );
    }
    if (selectedBranchName !== "All") {
      fd = fd.filter(
        (d) =>
          (d.manageByBranch || "Unknown").toUpperCase() ===
          selectedBranchName.toUpperCase(),
      );
    }

    return fd;
  }, [
    data,
    selectedMonth,
    selectedYear,
    selectedOEM,
    selectedPlant,
    selectedZone,
    selectedBranchName,
  ]);

  // Total working days (dummy calc based on month)
  const daysInMonth = useMemo(() => {
    return new Date(
      parseInt(selectedYear),
      months.indexOf(selectedMonth) + 1,
      0,
    ).getDate();
  }, [selectedYear, selectedMonth, months]);

  // BUG-10 FIX: Use actual calendar days â€” consistent with computeRequirements in App.tsx
  const totalWorkingDays = daysInMonth;
  const currentDate = new Date();
  const currentDay =
    currentDate.getFullYear() === parseInt(selectedYear) &&
    months[currentDate.getMonth()] === selectedMonth
      ? currentDate.getDate()
      : daysInMonth;
  const passedWorkingDays = Math.max(1, currentDay);
  // For past months, remainingWorkingDays should be 0 (not clamped to 1)
  const isPastMonth =
    parseInt(selectedYear) < currentDate.getFullYear() ||
    (parseInt(selectedYear) === currentDate.getFullYear() &&
      months.indexOf(selectedMonth) < currentDate.getMonth());
  const remainingWorkingDays = isPastMonth ? 0 : Math.max(1, daysInMonth - currentDay + 1);

  const kpis = useMemo(() => {
    let t = 0;
    let l = 0;
    // Target from filteredData (target records)
    filteredData.forEach((d) => { t += d.target || 0; });
    // Lifted from allEntryLogs (actual lifting logs) â€” filtered by same criteria
    const logsList = Array.isArray(allEntryLogs) ? allEntryLogs : [];
    logsList.forEach((log) => {
      if (log.month !== selectedMonth) return;
      if (log.year !== parseInt(selectedYear)) return;
      if (selectedOEM !== "All" && log.oem !== selectedOEM) return;
      if (selectedPlant !== "All" && log.plant !== selectedPlant) return;
      if (selectedBranchName !== "All" && (log.manageByBranch || "").toUpperCase() !== selectedBranchName.toUpperCase()) return;
      l += Number(log.lifted) || 0;
    });
    const b = Math.max(0, t - l);
    const a = t > 0 ? (l / t) * 100 : 0;
    const req = remainingWorkingDays > 0 ? b / remainingWorkingDays : 0;
    return { target: t, lifted: l, balance: b, ach: a, req: Math.ceil(req) };
  }, [filteredData, allEntryLogs, selectedMonth, selectedYear, selectedOEM, selectedPlant, selectedBranchName, remainingWorkingDays]);

  // Zone Summary & Branch details
  const tableData = useMemo(() => {
    const zoneMap = new Map<
      string,
      {
        target: number;
        lifted: number;
        cities: Map<string, { target: number; lifted: number; branch: string }>;
      }
    >();

    filteredData.forEach((d) => {
      // FIX 1: Use normalizeZone so "West MH"/"West GJ" etc. all map to "West - MH"/"West - GJ"
      // preventing duplicate zone rows in the summary table
      let zone = normalizeZone(d.zone || "Unknown");

      const city = d.statecity || "Unknown";
       if (!zoneMap.has(zone))
        zoneMap.set(zone, { target: 0, lifted: 0, cities: new Map() });
      const zRow = zoneMap.get(zone)!;
      zRow.target += d.target || 0;
      zRow.lifted += d.lifted || 0;

      if (!zRow.cities.has(city)) 
        zRow.cities.set(city, { target: 0, lifted: 0, branch: d.manageByBranch || "Unknown" });
      const bRow = zRow.cities.get(city)!;
      bRow.target += d.target || 0;
      bRow.lifted += d.lifted || 0;
    });

    const result: Array<{
      zone: string;
      target: number;
      lifted: number;
      balance: number;
      ach: number;
      req: number;
      cities: Array<{ city: string; target: number; lifted: number; balance: number; ach: number; req: number }>;
    }> = [];
    zoneMap.forEach((zVal, zKey) => {
      const zBalance = Math.max(0, zVal.target - zVal.lifted);
      const zAch = zVal.target > 0 ? (zVal.lifted / zVal.target) * 100 : 0;
      const zReq = zBalance / remainingWorkingDays;

      const cities = Array.from(zVal.cities.entries()).map(
        ([cKey, cVal]) => {
          const bBalance = Math.max(0, cVal.target - cVal.lifted);
          const bAch = cVal.target > 0 ? (cVal.lifted / cVal.target) * 100 : 0;
          const bReq = bBalance / remainingWorkingDays;
          return {
            city: cKey,
            branch: cVal.branch,
            target: cVal.target,
            lifted: cVal.lifted,
            balance: bBalance,
            ach: bAch,
            req: Math.ceil(bReq),
          };
        },
      );
      // Sort cities by target descending
      cities.sort((a, b) => b.target - a.target);

      result.push({
        zone: zKey,
        target: zVal.target,
        lifted: zVal.lifted,
        balance: zBalance,
        ach: zAch,
        req: Math.ceil(zReq),
        cities,
      });
    });

    // BUG-04 FIX: Use actual zone names (matching masterData values) not uppercase "NORTH ZONE" etc.
    const order = ["North", "West - GJ", "West - MH", "West", "South", "East", "Export", "MP", "Central", "Domestic"];
    result.sort((a, b) => {
      const idxA = order.indexOf(a.zone);
      const idxB = order.indexOf(b.zone);
      if (idxA === -1 && idxB === -1) return a.zone.localeCompare(b.zone);
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });

    return result;
  }, [filteredData, remainingWorkingDays]);

  // Available AO Zones for the Zone filter dropdown
  const availableZones = useMemo(() => {
    let fd = data;
    if (selectedOEM !== "All") fd = fd.filter((d) => d.oem === selectedOEM);
    if (selectedPlant !== "All") fd = fd.filter((d) => d.plant === selectedPlant);
    if (selectedBranchName !== "All") fd = fd.filter((d) => (d.manageByBranch || "").toUpperCase() === selectedBranchName.toUpperCase());
    const zones = new Set<string>();
    fd.forEach((d) => { if (d.zone) zones.add(normalizeZone(d.zone || "Unknown").trim()); });
    return Array.from(zones).sort();
  }, [data, selectedOEM, selectedPlant, selectedBranchName]);

  const availableCities = useMemo(() => {
    let fd = data;
    if (selectedOEM !== "All") fd = fd.filter((d) => d.oem === selectedOEM);
    if (selectedPlant !== "All") fd = fd.filter((d) => d.plant === selectedPlant);
    if (selectedZone !== "All") fd = fd.filter((d) => (d.zone || "Unknown").trim() === selectedZone);
    if (selectedBranchName !== "All") fd = fd.filter((d) => (d.manageByBranch || "").toUpperCase() === selectedBranchName.toUpperCase());
    const cities = new Set<string>();
    fd.forEach(d => { if (d.statecity) cities.add(d.statecity); });
    return Array.from(cities).sort();
  }, [data, selectedOEM, selectedPlant, selectedZone, selectedBranchName]);
 
  const availableBranches = useMemo(() => {
    let fd = data;
    if (selectedOEM !== "All") fd = fd.filter((d) => d.oem === selectedOEM);
    if (selectedPlant !== "All") fd = fd.filter((d) => d.plant === selectedPlant);
    if (selectedZone !== "All") fd = fd.filter((d) => (d.zone || "Unknown").trim() === selectedZone);
    if (selectedCity !== "All") fd = fd.filter((d) => (d.statecity || "Unknown").toUpperCase() === selectedCity.toUpperCase());
    const branches = new Set<string>();
    fd.forEach(d => { if (d.manageByBranch) branches.add(d.manageByBranch); });
    return Array.from(branches).sort();
  }, [data, selectedOEM, selectedPlant, selectedZone, selectedCity]);

  // OEM options â€” narrowed by Branch selection
  const availableOEMs = useMemo(() => {
    let fd = data;
    if (selectedBranchName !== "All") fd = fd.filter((d) => (d.manageByBranch || "").toUpperCase() === selectedBranchName.toUpperCase());
    return Array.from(new Set(fd.map(d => d.oem).filter(Boolean))).sort();
  }, [data, selectedBranchName]);

  // Plant options â€” narrowed by OEM and Branch selections
  const availablePlants = useMemo(() => {
    let fd = data;
    if (selectedOEM !== "All") fd = fd.filter((d) => d.oem === selectedOEM);
    if (selectedBranchName !== "All") fd = fd.filter((d) => (d.manageByBranch || "").toUpperCase() === selectedBranchName.toUpperCase());
    return Array.from(new Set(fd.map(d => d.plant).filter(Boolean))).sort();
  }, [data, selectedOEM, selectedBranchName]);

  // When Branch changes, auto-reset OEM/Plant/Zone/City if no longer valid
  React.useEffect(() => {
    if (selectedBranchName === "All") return;
    if (selectedOEM !== "All" && !availableOEMs.includes(selectedOEM)) setSelectedOEM("All");
    if (selectedPlant !== "All" && !availablePlants.includes(selectedPlant)) setSelectedPlant("All");
  }, [selectedBranchName]);

  const chartData = tableData.map((d) => ({
    name: d.zone,
    Target: d.target,
    Lifted: d.lifted,
    Balance: d.balance,
  }));

  const pieData = tableData
    .filter((d) => d.balance > 0)
    .map((d) => ({
      name: d.zone,
      value: d.balance,
    }));

  // â”€â”€ Real daily trend data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Daily Target  = total monthly target Ã· days in month (remainder on last day)
  // Daily Lifted  = sum of allEntryLogs entries for that calendar date,
  //                 filtered by the same OEM / Plant / Zone / City / Branch
  //                 filters currently active in the report.
  const dailyData = useMemo(() => {
    const yearNum = parseInt(selectedYear);
    const monthIdx = months.indexOf(selectedMonth); // 0-based

    // Build a lookup: dateStr (YYYY-MM-DD) â†’ total lifted from entry logs
    // Apply the same dimension filters as filteredData (OEM, Plant, Zone, City, Branch)
    const liftedByDate: Record<string, number> = {};
    const logsList = Array.isArray(allEntryLogs) ? allEntryLogs : [];

    logsList.forEach((log) => {
      // Match month + year
      if (log.month !== selectedMonth) return;
      if (log.year !== yearNum) return;

      // Apply active filters
      if (selectedOEM !== "All" && log.oem !== selectedOEM) return;
      if (selectedPlant !== "All" && log.plant !== selectedPlant) return;

      // Zone filter: match via filteredData's zone field (log doesn't carry zone directly,
      // so we cross-reference against filteredData's oem+plant+statecity)
      if (selectedZone !== "All") {
        const matchingRecord = data.find(
          (d) =>
            d.oem === log.oem &&
            d.plant === log.plant &&
            d.statecity === log.statecity &&
            (d.zone || "Unknown").trim() === selectedZone,
        );
        if (!matchingRecord) return;
      }

      if (
        selectedCity !== "All" &&
        (log.statecity || "").toUpperCase() !== selectedCity.toUpperCase()
      )
        return;

      if (
        selectedBranchName !== "All" &&
        (log.manageByBranch || "").toUpperCase() !==
          selectedBranchName.toUpperCase()
      )
        return;

      // Normalise date to YYYY-MM-DD
      let dateStr = "";
      if (log.date) {
        // Already ISO format
        if (/^\d{4}-\d{2}-\d{2}/.test(log.date)) {
          dateStr = log.date.substring(0, 10);
        } else {
          // Try parsing other formats
          const parsed = new Date(log.date);
          if (!isNaN(parsed.getTime())) {
            dateStr = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
          }
        }
      }
      if (!dateStr) return;

      liftedByDate[dateStr] = (liftedByDate[dateStr] || 0) + (Number(log.lifted) || 0);
    });

    // Total monthly target from filteredData
    const totalTarget = kpis.target;

    // Distribute target evenly across all days; remainder goes to the last day
    const base = daysInMonth > 0 ? Math.floor(totalTarget / daysInMonth) : 0;
    const remainder = totalTarget - base * daysInMonth;

    // For the current month only show days up to today; for past/future months show all days
    const today = new Date();
    const isCurrentMonth =
      today.getFullYear() === yearNum &&
      today.getMonth() === monthIdx;
    const lastDay = isCurrentMonth ? today.getDate() : daysInMonth;

    const res = [];
    for (let day = 1; day <= lastDay; day++) {
      const dailyTarget = base + (day === daysInMonth ? remainder : 0);
      const dateStr = `${yearNum}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dailyLifted = liftedByDate[dateStr] || 0;

      res.push({
        name: `${day}-${selectedMonth.substring(0, 3)}`,
        DailyTarget: dailyTarget,
        DailyLifted: dailyLifted,
        DailyBalance: Math.max(0, dailyTarget - dailyLifted),
      });
    }
    return res;
  }, [
    allEntryLogs,
    kpis.target,
    daysInMonth,
    selectedYear,
    selectedMonth,
    selectedOEM,
    selectedPlant,
    selectedZone,
    selectedCity,
    selectedBranchName,
    data,
    months,
  ]);

  return (
    <div className="w-full bg-[#f8f9fa] min-h-screen">
      {/* Header */}
      <div className="bg-[#0b1b42] text-white p-4 flex justify-between items-center shadow-md">
        <h1 className="text-2xl font-bold tracking-wider">
          AO ZONE & STATE/CITY WISE CARS LIFTING & BALANCE REPORT
        </h1>
        <div className="flex items-center gap-2 text-sm font-medium bg-[#1a2f63] px-3 py-1.5 rounded-md">
          <Calendar size={16} />
          <span>
            Date :{" "}
            {new Date().toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Global Filters */}
        <div className="flex flex-wrap gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          {/* Combine Month and Year in UI for simplicity, filtering by selectedMonth */}
          <SearchableSelect
            label="Month"
            value={selectedMonth}
            onChange={(val) => setSelectedMonth(val)}
            options={months}
            placeholder="Select Month"
          />

          <SearchableSelect
            label="OEM"
            value={selectedOEM}
            onChange={(val) => {
              setSelectedOEM(val);
              setSelectedPlant("All");
              setSelectedZone("All");
              setSelectedCity("All");
              setSelectedBranchName("All");
            }}
            options={["All", ...availableOEMs]}
            placeholder="All OEMs"
          />

          <SearchableSelect
            label="Plant"
            value={selectedPlant}
            onChange={(val) => {
              setSelectedPlant(val);
              setSelectedZone("All");
              setSelectedCity("All");
              setSelectedBranchName("All");
            }}
            options={["All", ...availablePlants]}
            placeholder="All Plants"
          />

          <SearchableSelect
            label="AO Zone"
            value={selectedZone}
            onChange={(val) => {
              setSelectedZone(val);
              setSelectedCity("All");
              setSelectedBranchName("All");
            }}
            options={["All", ...availableZones]}
            placeholder="All Zones"
          />

          <SearchableSelect
            label="State/City"
            value={selectedCity}
            onChange={(val) => {
              setSelectedCity(val);
              setSelectedBranchName("All");
            }}
            options={["All", ...availableCities]}
            placeholder="All State/Cities"
          />
 
          <SearchableSelect
            label="Branch Name"
            value={selectedBranchName}
            onChange={(val) => {
              setSelectedBranchName(val);
              setSelectedOEM("All");
              setSelectedPlant("All");
              setSelectedZone("All");
              setSelectedCity("All");
            }}
            options={["All", ...availableBranches]}
            placeholder="All Branches"
          />
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Total Monthly Target */}
          <div className="bg-white border-t-4 border-t-blue-600 rounded-xl shadow-sm border border-slate-100 p-4 flex flex-col items-center justify-center relative">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center h-8">
              Total Monthly Target
            </span>
            <div className="flex items-center gap-3">
              <Target size={32} className="text-blue-600 stroke-[1.5]" />
              <div className="flex flex-col">
                <span className="text-3xl font-black text-[#0b1b42]">
                  {kpis.target.toLocaleString()}
                </span>
              </div>
            </div>
            <span className="text-xs text-slate-400 mt-1 font-medium">
              Cars
            </span>
          </div>

          {/* Total Lifted */}
          <div className="bg-white border-t-4 border-t-green-500 rounded-xl shadow-sm border border-slate-100 p-4 flex flex-col items-center justify-center relative">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center h-8">
              Total Lifted (Till Date)
            </span>
            <div className="flex items-center gap-3">
              <CarFront size={36} className="text-green-500 stroke-[1.5]" />
              <div className="flex flex-col">
                <span className="text-3xl font-black text-green-600">
                  {kpis.lifted.toLocaleString()}
                </span>
              </div>
            </div>
            <span className="text-xs text-slate-400 mt-1 font-medium">
              Cars
            </span>
          </div>

          {/* Total Balance */}
          <div className="bg-white border-t-4 border-t-red-500 rounded-xl shadow-sm border border-slate-100 p-4 flex flex-col items-center justify-center relative">
            <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-2 text-center h-8">
              Total Balance (Pending)
            </span>
            <div className="flex items-center gap-3">
              <AlertCircle size={32} className="text-red-500 stroke-[1.5]" />
              <div className="flex flex-col">
                <span className="text-3xl font-black text-red-600">
                  {kpis.balance.toLocaleString()}
                </span>
              </div>
            </div>
            <span className="text-xs text-slate-400 mt-1 font-medium">
              Cars
            </span>
          </div>

          {/* Achievement % */}
          <div className="bg-white border-t-4 border-t-[#0b1b42] rounded-xl shadow-sm border border-slate-100 p-4 flex flex-col items-center justify-center relative">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center h-8">
              Overall Achievement %
            </span>
            <div className="flex items-center gap-3">
              <BarChart3 size={32} className="text-[#0b1b42] stroke-[1.5]" />
              <div className="flex flex-col">
                <span className="text-3xl font-black text-[#0b1b42]">
                  {Math.round(kpis.ach)}%
                </span>
              </div>
            </div>
            <span className="text-xs text-slate-400 mt-1 font-medium invisible">
              _
            </span>
          </div>

          {/* Working Days */}
          <div className="bg-white border-t-4 border-t-slate-400 rounded-xl shadow-sm border border-slate-100 p-4 flex flex-col items-center justify-center relative">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center h-8">
              Total Working Days
            </span>
            <div className="flex items-center gap-3">
              <Calendar size={32} className="text-slate-400 stroke-[1.5]" />
              <div className="flex flex-col">
                <span className="text-3xl font-black text-[#0b1b42]">
                  {totalWorkingDays}
                </span>
              </div>
            </div>
            <span className="text-xs text-slate-400 mt-1 font-medium">
              Days
            </span>
          </div>

          {/* Required Per Day */}
          <div className="bg-white border-t-4 border-t-[#0b1b42] rounded-xl shadow-sm border border-slate-100 p-4 flex flex-col items-center justify-center relative">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center h-8">
              Required Per Day
              <br />
              <span className="text-[9px] lowercase">(Balance / Days)</span>
            </span>
            <div className="flex items-center gap-3">
              <Clock size={32} className="text-[#0b1b42] stroke-[1.5]" />
              <div className="flex flex-col">
                <span className="text-3xl font-black text-[#0b1b42]">
                  {kpis.req.toLocaleString()}
                </span>
              </div>
            </div>
            <span className="text-xs text-slate-400 mt-1 font-medium">
              Cars
            </span>
          </div>
        </div>

        {/* Main Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Column: Tables */}
          <div className="space-y-4">
            {/* Zone Wise Summary Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-[#0b1b42] text-white p-2 px-4 text-sm font-bold tracking-wide uppercase">
                AO Zone Wise Summary
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-center">
                  <thead>
                    <tr className="bg-slate-100 text-[#0b1b42] font-semibold text-[11px] uppercase tracking-wider border-b border-slate-200">
                      <th className="py-3 px-2 text-left bg-slate-50">AO Zone</th>
                      <th className="py-3 px-2 border-l border-white">
                        Monthly Target
                        <br />
                        (Cars)
                      </th>
                      <th className="py-3 px-2 border-l border-white">
                        Lifted
                        <br />
                        (Till Date)
                      </th>
                      <th className="py-3 px-2 border-l border-white">
                        Balance
                        <br />
                        (Pending)
                      </th>
                      <th className="py-3 px-2 border-l border-white">
                        Achievement %
                      </th>
                      <th className="py-3 px-2 border-l border-white">
                        Required
                        <br />
                        Per Day
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((row) => (
                      <tr
                        key={row.zone}
                        className="border-b border-slate-100 font-medium"
                      >
                        <td className="py-3 px-2 text-left font-bold text-[#0b1b42] whitespace-nowrap bg-slate-50/50">
                          {row.zone}
                        </td>
                        <td className="py-3 px-2 text-[#0b1b42]">
                          {row.target.toLocaleString()}
                        </td>
                        <td className="py-3 px-2 text-green-600 font-bold">
                          {row.lifted.toLocaleString()}
                        </td>
                        <td className="py-3 px-2 text-red-500 font-bold">
                          {row.balance.toLocaleString()}
                        </td>
                        <td className="py-3 px-2 text-green-600">
                          {Math.round(row.ach)}%
                        </td>
                        <td className="py-3 px-2 text-[#0b1b42]">
                          {row.req.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-black text-[#0b1b42] border-t-2 border-slate-300">
                      <td className="py-3 px-2 text-left uppercase text-blue-800">
                        TOTAL
                      </td>
                      <td className="py-3 px-2 text-blue-800">
                        {kpis.target.toLocaleString()}
                      </td>
                      <td className="py-3 px-2 text-green-600">
                        {kpis.lifted.toLocaleString()}
                      </td>
                      <td className="py-3 px-2 text-red-500">
                        {kpis.balance.toLocaleString()}
                      </td>
                      <td className="py-3 px-2 text-blue-800">
                        {Math.round(kpis.ach)}%
                      </td>
                      <td className="py-3 px-2 text-blue-800">
                        {kpis.req.toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Branch Wise Details Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-[#0b1b42] text-white p-2 px-4 text-sm font-bold tracking-wide uppercase transition-all">
                State/City Wise Details
              </div>
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-sm text-center border-collapse">
                  <thead className="sticky top-0 bg-white z-10 shadow-sm border-b border-slate-200">
                    <tr className="bg-slate-100 text-[#0b1b42] font-semibold text-[11px] uppercase tracking-wider">
                      <th
                        rowSpan={2}
                        className="py-3 px-2 text-left w-24 bg-slate-50 border-r border-slate-200"
                      >
                        AO Zone
                      </th>
                      <th
                        rowSpan={2}
                        className="py-3 px-2 text-left w-32 border-r border-slate-200"
                      >
                        State/City
                      </th>
                      <th
                        rowSpan={2}
                        className="py-3 px-2 border-r border-slate-200"
                      >
                        Monthly Target
                        <br />
                        (Cars)
                      </th>
                      <th
                        colSpan={3}
                        className="py-2 px-2 border-b border-r border-slate-200"
                      >
                        Till Date (
                        {new Date()
                          .toLocaleDateString("en-GB")
                          .replace(/\//g, "-")}
                        )
                      </th>
                      <th rowSpan={2} className="py-3 px-2">
                        Required Per Day
                        <br />
                        (Balance / Days)
                      </th>
                    </tr>
                    <tr className="bg-slate-50 text-[10px] text-[#0b1b42] font-bold">
                      <th className="py-2 px-2 border-r border-slate-200">
                        Lifted (Cars)
                      </th>
                      <th className="py-2 px-2 border-r border-slate-200">
                        Balance (Cars)
                      </th>
                      <th className="py-2 px-2 border-r border-slate-200">
                        Achievement %
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((zRow) => {
                      // Filter out pseudo-city entries that are actually zone-level placeholders:
                      // these appear when a target was saved AO Zone Wise (statecity = zone name,
                      // "Domestic", "Export", "All Destinations", etc.)
                      const ZONE_PLACEHOLDERS = new Set([
                        'domestic', 'export', 'all destinations', 'all regions',
                        zRow.zone.toLowerCase(),
                        (zRow.zone + ' zone').toLowerCase(),
                      ]);
                      const realCities = zRow.cities.filter(
                        (c: any) => !ZONE_PLACEHOLDERS.has((c.city || '').toLowerCase().trim())
                      );
                      const hasRealCities = realCities.length > 0;

                      return (
                        <React.Fragment key={zRow.zone}>
                          {hasRealCities ? (
                            // â”€â”€ State/City rows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                            realCities.map((cRow: any, cIdx: number) => (
                              <tr
                                key={cRow.city}
                                className="border-b border-slate-100/60 hover:bg-slate-50/50"
                              >
                                {cIdx === 0 && (
                                  <td
                                    rowSpan={realCities.length}
                                    className="py-2 px-2 text-left font-bold text-[10px] leading-tight uppercase border-r border-slate-200"
                                    style={{ color: getZoneColor(zRow.zone) }}
                                  >
                                    {zRow.zone}
                                  </td>
                                )}
                                <td className="py-2 px-2 text-left font-medium text-[#1e293b] text-xs border-r border-slate-200 uppercase">
                                  {cRow.city}
                                </td>
                                <td className="py-2 px-2 text-[#475569] border-r border-slate-200 font-medium">
                                  {cRow.target.toLocaleString()}
                                </td>
                                <td className="py-2 px-2 text-green-600 font-bold border-r border-slate-200">
                                  {cRow.lifted.toLocaleString()}
                                </td>
                                <td className="py-2 px-2 text-red-500 font-bold border-r border-slate-200">
                                  {cRow.balance.toLocaleString()}
                                </td>
                                <td className="py-2 px-2 text-[#0b1b42] font-medium border-r border-slate-200">
                                  {Math.round(cRow.ach)}%
                                </td>
                                <td className="py-2 px-2 text-[#0b1b42] font-bold">
                                  {cRow.req.toLocaleString()}
                                </td>
                              </tr>
                            ))
                          ) : (
                            // â”€â”€ AO Zone Wise subtotal row (no city breakdown) â”€
                            <tr className="border-b border-slate-200 bg-slate-50/70">
                              <td
                                className="py-2 px-2 text-left font-bold text-[10px] leading-tight uppercase border-r border-slate-200"
                                style={{ color: getZoneColor(zRow.zone) }}
                              >
                                {zRow.zone}
                              </td>
                              <td className="py-2 px-2 text-left text-[11px] text-slate-400 italic border-r border-slate-200">
                                â€” Zone Total â€”
                              </td>
                              <td className="py-2 px-2 text-[#475569] border-r border-slate-200 font-bold">
                                {zRow.target.toLocaleString()}
                              </td>
                              <td className="py-2 px-2 text-green-600 font-bold border-r border-slate-200">
                                {zRow.lifted.toLocaleString()}
                              </td>
                              <td className="py-2 px-2 text-red-500 font-bold border-r border-slate-200">
                                {zRow.balance.toLocaleString()}
                              </td>
                              <td className="py-2 px-2 text-[#0b1b42] font-medium border-r border-slate-200">
                                {Math.round(zRow.ach)}%
                              </td>
                              <td className="py-2 px-2 text-[#0b1b42] font-bold">
                                {zRow.req.toLocaleString()}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    <tr className="bg-slate-50 font-black text-[#0b1b42] border-t-2 border-slate-300">
                      <td
                        colSpan={2}
                        className="py-3 px-2 text-left uppercase text-blue-800 border-r border-slate-200"
                      >
                        TOTAL
                      </td>
                      <td className="py-3 px-2 text-blue-800 border-r border-slate-200">
                        {kpis.target.toLocaleString()}
                      </td>
                      <td className="py-3 px-2 text-green-600 border-r border-slate-200">
                        {kpis.lifted.toLocaleString()}
                      </td>
                      <td className="py-3 px-2 text-red-500 border-r border-slate-200">
                        {kpis.balance.toLocaleString()}
                      </td>
                      <td className="py-3 px-2 text-blue-800 border-r border-slate-200">
                        {Math.round(kpis.ach)}%
                      </td>
                      <td className="py-3 px-2 text-blue-800">
                        {kpis.req.toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column: Charts */}
          <div className="space-y-4">
            {/* Zone Wise Lifted VS Balance */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="bg-[#0b1b42] text-white p-2 px-4 text-sm font-bold tracking-wide uppercase text-center">
                Zone Wise Lifted VS Balance
              </div>
              <div className="p-4 flex-1">
                <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#E2E8F0"
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }}
                    />
                    <YAxis
                      yAxisId="left"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      label={{
                        value: "Cars",
                        angle: -90,
                        position: "insideLeft",
                        offset: 0,
                        style: { fontSize: 10, fill: "#64748b" },
                      }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      label={{
                        value: "Balance (Cars)",
                        angle: 90,
                        position: "insideRight",
                        offset: 0,
                        style: { fontSize: 10, fill: "#64748b" },
                      }}
                    />
                    <RechartsTooltip
                      cursor={{ fill: "rgba(0,0,0,0.05)" }}
                      contentStyle={{
                        borderRadius: "8px",
                        border: "none",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                      }}
                    />
                    <Legend
                      wrapperStyle={{
                        fontSize: "11px",
                        fontWeight: 600,
                        paddingTop: "10px",
                      }}
                      iconType="square"
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="Target"
                      name="Monthly Target"
                      fill="#0f4a8e"
                      barSize={35}
                    >
                      <LabelList
                        dataKey="Target"
                        position="top"
                        style={{
                          fontSize: "10px",
                          fill: "#0f4a8e",
                          fontWeight: 600,
                        }}
                        formatter={(v: any) => Number(v || 0).toLocaleString()}
                      />
                    </Bar>
                    <Bar
                      yAxisId="left"
                      dataKey="Lifted"
                      name="Lifted (Till Date)"
                      fill="#2e8b57"
                      barSize={35}
                    >
                      <LabelList
                        dataKey="Lifted"
                        position="top"
                        style={{
                          fontSize: "10px",
                          fill: "#2e8b57",
                          fontWeight: 600,
                        }}
                        formatter={(v: any) => Number(v || 0).toLocaleString()}
                      />
                    </Bar>
                    <Line
                      yAxisId="right"
                      type="linear"
                      dataKey="Balance"
                      name="Balance (Pending)"
                      stroke="#d32f2f"
                      strokeWidth={2}
                      dot={{ r: 4, strokeWidth: 2, fill: "white" }}
                    >
                      <LabelList
                        dataKey="Balance"
                        position="top"
                        offset={10}
                        style={{
                          fontSize: "11px",
                          fill: "#d32f2f",
                          fontWeight: 700,
                        }}
                        formatter={(v: any) => Number(v || 0).toLocaleString()}
                      />
                    </Line>
                  </ComposedChart>
                </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Daily Trend */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="bg-[#0b1b42] text-white p-2 px-4 text-sm font-bold tracking-wide uppercase text-center">
                Daily Trend â€“ All Zones ({selectedMonth}-{selectedYear})
              </div>
              <div className="p-4 flex-1">
                <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={dailyData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#E2E8F0"
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      minTickGap={20}
                    />
                    <YAxis
                      yAxisId="left"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      label={{
                        value: "Cars",
                        angle: 0,
                        position: "top",
                        offset: 10,
                        style: { fontSize: 10, fill: "#64748b" },
                      }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      label={{
                        value: "Balance (Cars)",
                        angle: 0,
                        position: "top",
                        offset: 10,
                        style: { fontSize: 10, fill: "#64748b" },
                      }}
                    />
                    <RechartsTooltip
                      cursor={{ fill: "rgba(0,0,0,0.05)" }}
                      contentStyle={{
                        borderRadius: "8px",
                        border: "none",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                      }}
                    />
                    <Legend
                      wrapperStyle={{
                        fontSize: "11px",
                        fontWeight: 600,
                        paddingTop: "10px",
                      }}
                      iconType="circle"
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="DailyTarget"
                      name="Daily Target"
                      stroke="#0f4a8e"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    >
                      <LabelList
                        dataKey="DailyTarget"
                        position="top"
                        offset={5}
                        style={{ fontSize: "10px", fill: "#0f4a8e" }}
                      />
                    </Line>
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="DailyLifted"
                      name="Daily Lifted"
                      stroke="#2e8b57"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    >
                      <LabelList
                        dataKey="DailyLifted"
                        position="bottom"
                        offset={5}
                        style={{ fontSize: "10px", fill: "#2e8b57" }}
                      />
                    </Line>
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="DailyBalance"
                      name="Daily Balance"
                      stroke="#d32f2f"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    >
                      <LabelList
                        dataKey="DailyBalance"
                        position="top"
                        offset={5}
                        style={{ fontSize: "10px", fill: "#d32f2f" }}
                      />
                    </Line>
                  </ComposedChart>
                </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Bottom Summary & Donut */}
            <div className="grid grid-cols-3 gap-4">
              {/* Summary Mini Table */}
              <div className="col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="bg-[#0b1b42] text-white p-2 px-4 text-xs font-bold tracking-wide uppercase text-center">
                  Summary (Till Date)
                </div>
                <div className="flex-1 p-4 flex flex-col justify-center gap-4">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                    <span className="text-sm font-semibold text-slate-600">
                      Total Target
                    </span>
                    <span className="text-lg font-black text-[#0f4a8e]">
                      {kpis.target.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                    <span className="text-sm font-semibold text-slate-600">
                      Total Lifted
                    </span>
                    <span className="text-lg font-black text-[#2e8b57]">
                      {kpis.lifted.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-slate-600">
                      Total Balance
                    </span>
                    <span className="text-lg font-black text-[#d32f2f]">
                      {kpis.balance.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Balance Distribution Donut */}
              <div className="col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="bg-[#0b1b42] text-white p-2 px-4 text-xs font-bold tracking-wide uppercase text-center">
                  Balance Distribution By Zone
                </div>
                <div className="flex-1 p-2 flex items-center">
                  <div className="w-[180px] h-[180px] relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                          stroke="none"
                        >
                          {pieData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={
                                getZoneColor(entry.name) ||
                                COLORS[index % COLORS.length]
                              }
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(val: any) => Number(val || 0).toLocaleString()}
                          contentStyle={{
                            fontSize: "12px",
                            borderRadius: "8px",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-xl font-black text-[#0b1b42]">
                        {kpis.balance.toLocaleString()}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500">
                        Cars
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 pl-4 flex flex-col gap-2">
                    {pieData.map((entry) => {
                      const pct =
                        kpis.balance > 0
                          ? (entry.value / kpis.balance) * 100
                          : 0;
                      return (
                        <div
                          key={entry.name}
                          className="flex items-center gap-2"
                        >
                          <div
                            className="w-3 h-3 rounded-sm"
                            style={{
                              backgroundColor:
                                getZoneColor(entry.name),
                            }}
                          ></div>
                          <span className="text-xs font-bold text-[#0b1b42] tracking-tight whitespace-nowrap">
                            {entry.name} - {entry.value.toLocaleString()} (
                            {Math.round(pct)}%)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-4 text-[10px] text-slate-500 font-medium">
          Note: Balance is calculated as Monthly Target - Lifted (Till Date) |
          Required Per Day = Balance / Remaining Working Days
        </div>
      </div>
    </div>
  );
};

