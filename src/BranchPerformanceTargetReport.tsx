import React, { useState, useMemo } from 'react';
import { Calendar, Target, CarFront, AlertCircle, BarChart3, Trophy, Star, Clock, Hourglass } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
// BUG-06 FIX: Removed unused getDestinationZone import
import { INITIAL_MANAGE_BY_BRANCH_MAP, getOriginZone, computeRequirements, breakTargetIntoWeeks } from './App';

export interface TargetRecord {
  id?: string;
  month?: string;
  year?: number | string;
  oem?: string;
  plant?: string;
  statecity?: string;
  zone?: string;
  target?: number;
  lifted?: number;
  weeklyBreakdown?: any[];
  targetLevel?: string;
  originZone?: string;
  manageByBranch?: string;
}

export interface LogRecord {
  id?: string;
  date?: string;
  month?: string;
  year?: number | string;
  oem?: string;
  plant?: string;
  statecity?: string;
  city?: string;
  zone?: string;
  originZone?: string;
  lifted?: number;
  manageByBranch?: string;
}

interface BranchPerformanceProps {
  data: TargetRecord[];
  allEntryLogs: LogRecord[];
  years: number[];
  months: string[];
  currentYear: number;
  currentMonth: string;
  oems: string[];
  masterPlants: string[];
  oemPlantMap?: Record<string, string[]>;
  trailerCapacity?: number;
}

export const BranchPerformanceTargetReport: React.FC<BranchPerformanceProps> = ({
  data, allEntryLogs, months, currentYear, currentMonth, trailerCapacity = 6.5
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  // selectedYear is read-only — no year picker in this report, always uses currentYear
  const selectedYear = currentYear.toString();
  const [selectedOEM, setSelectedOEM] = useState<string>('All');
  const [selectedPlant, setSelectedPlant] = useState<string>('All');
  const [selectedBranch, setSelectedBranch] = useState<string>('All');
  const [selectedOriginZone, setSelectedOriginZone] = useState<string>('All');

  // Base filter for populating dropdown options (does NOT include branch — branch dropdown derives from this)
  const filteredDataForDropdowns = useMemo(() => {
    return data.filter(d => 
      (!d.month || d.month === selectedMonth) && 
      (!d.year || d.year.toString() === selectedYear) &&
      (selectedOEM === 'All' || d.oem === selectedOEM) &&
      (selectedPlant === 'All' || d.plant === selectedPlant) &&
      (selectedOriginZone === 'All' || getOriginZone(d.plant || '') === selectedOriginZone)
    );
  }, [data, selectedMonth, selectedYear, selectedOEM, selectedPlant, selectedOriginZone]);

  // Full filter including branch — used for ALL data display (charts, tables, KPIs)
  const filteredData = useMemo(() => {
    if (selectedBranch === 'All') return filteredDataForDropdowns;
    return filteredDataForDropdowns.filter(d => {
      const branch = (d.manageByBranch || INITIAL_MANAGE_BY_BRANCH_MAP[d.oem]?.[d.plant] || d.statecity || d.zone || 'Unknown').toUpperCase();
      return branch === selectedBranch;
    });
  }, [filteredDataForDropdowns, selectedBranch]);

  const allBranches = useMemo(() => {
    return Array.from(new Set(filteredDataForDropdowns.map(d => {
      const branch = d.manageByBranch || INITIAL_MANAGE_BY_BRANCH_MAP[d.oem]?.[d.plant] || d.statecity || d.zone || 'Unknown';
      return branch.toUpperCase();
    }))).filter(Boolean).sort();
  }, [filteredDataForDropdowns]);

  // OEM options — narrowed by Branch and OriginZone selections
  const oemOptions = useMemo(() => {
    let base = data.filter(d => (!d.month || d.month === selectedMonth) && (!d.year || d.year.toString() === selectedYear));
    if (selectedBranch !== 'All') base = base.filter(d => (d.manageByBranch || INITIAL_MANAGE_BY_BRANCH_MAP[d.oem]?.[d.plant] || '').toUpperCase() === selectedBranch);
    if (selectedOriginZone !== 'All') base = base.filter(d => getOriginZone(d.plant || '') === selectedOriginZone);
    return Array.from(new Set(base.map(d => d.oem).filter(Boolean))).sort();
  }, [data, selectedMonth, selectedYear, selectedBranch, selectedOriginZone]);

  // Plant options — narrowed by OEM and Branch selections
  const plantOptions = useMemo(() => {
    let base = data.filter(d => (!d.month || d.month === selectedMonth) && (!d.year || d.year.toString() === selectedYear));
    if (selectedOEM !== 'All') base = base.filter(d => d.oem === selectedOEM);
    if (selectedBranch !== 'All') base = base.filter(d => (d.manageByBranch || INITIAL_MANAGE_BY_BRANCH_MAP[d.oem]?.[d.plant] || '').toUpperCase() === selectedBranch);
    if (selectedOriginZone !== 'All') base = base.filter(d => getOriginZone(d.plant || '') === selectedOriginZone);
    return Array.from(new Set(base.map(d => d.plant).filter(Boolean))).sort();
  }, [data, selectedMonth, selectedYear, selectedOEM, selectedBranch, selectedOriginZone]);

  const originZoneOptions = useMemo(() => {
    let base = data.filter(d => (!d.month || d.month === selectedMonth) && (!d.year || d.year.toString() === selectedYear));
    if (selectedOEM !== 'All') base = base.filter(d => d.oem === selectedOEM);
    if (selectedPlant !== 'All') base = base.filter(d => d.plant === selectedPlant);
    if (selectedBranch !== 'All') base = base.filter(d => (d.manageByBranch || INITIAL_MANAGE_BY_BRANCH_MAP[d.oem]?.[d.plant] || '').toUpperCase() === selectedBranch);
    return Array.from(new Set(base.map(d => getOriginZone(d.plant || '')))).filter(z => z && z !== 'Unknown').sort();
  }, [data, selectedMonth, selectedYear, selectedOEM, selectedPlant, selectedBranch]);

  React.useEffect(() => {
    if (selectedOriginZone !== 'All' && !originZoneOptions.includes(selectedOriginZone)) {
      setSelectedOriginZone('All');
    }
  }, [originZoneOptions, selectedOriginZone]);

  React.useEffect(() => {
    if (selectedBranch !== 'All' && !allBranches.includes(selectedBranch)) {
      setSelectedBranch('All');
    }
  }, [allBranches, selectedBranch]);

  // When Branch changes, auto-reset OEM/Plant/Zone if no longer valid
  React.useEffect(() => {
    if (selectedBranch === 'All') return;
    if (selectedOEM !== 'All' && !oemOptions.includes(selectedOEM)) setSelectedOEM('All');
    if (selectedPlant !== 'All' && !plantOptions.includes(selectedPlant)) setSelectedPlant('All');
  }, [selectedBranch]);

  // Main Target Data — uses filteredData (already branch-filtered)
  const targetData = useMemo(() => {
    return filteredData;
  }, [filteredData]);

  const derivedOriginZone = useMemo(() => {
    if (selectedOriginZone !== 'All') return selectedOriginZone.toUpperCase();
    if (selectedBranch === 'All' || targetData.length === 0) return 'ALL ORIGIN ZONES';
    const match = targetData.find(d => {
      const branch = d.manageByBranch || INITIAL_MANAGE_BY_BRANCH_MAP[d.oem]?.[d.plant] || d.statecity || d.zone || 'Unknown';
      return branch.toUpperCase() === selectedBranch;
    });
    const originZone = getOriginZone(match?.plant || '');
    return originZone && originZone !== 'Unknown' ? originZone.toUpperCase() : 'UNKNOWN ZONE';
  }, [selectedOriginZone, selectedBranch, targetData]);

  const rankContextType = useMemo(() => {
    if (selectedBranch !== 'All') return 'branch';
    if (selectedOriginZone !== 'All') return 'originZone';
    if (selectedPlant !== 'All') return 'plant';
    if (selectedOEM !== 'All') return 'oem';
    return 'overall';
  }, [selectedBranch, selectedOriginZone, selectedPlant, selectedOEM]);

  const rankContextLabel = useMemo(() => {
    if (rankContextType === 'branch') return selectedBranch;
    if (rankContextType === 'originZone') return selectedOriginZone;
    if (rankContextType === 'plant') return selectedPlant;
    if (rankContextType === 'oem') return selectedOEM;
    return 'Overall';
  }, [rankContextType, selectedBranch, selectedOriginZone, selectedPlant, selectedOEM]);

  const rankValue = useMemo(() => {
    const groups: Record<string, { target: number; actual: number }> = {};

    const keyForRecord = (record: TargetRecord | LogRecord) => {
      const branch = (record as any).manageByBranch || INITIAL_MANAGE_BY_BRANCH_MAP[record.oem]?.[record.plant] || record.statecity || record.zone || 'Unknown';
      if (rankContextType === 'branch') return branch.toUpperCase();
      if (rankContextType === 'originZone') return getOriginZone(record.plant || '').toUpperCase();
      if (rankContextType === 'plant') return (record.plant || 'Unknown').toUpperCase();
      if (rankContextType === 'oem') return (record.oem || 'Unknown').toUpperCase();
      return getOriginZone(record.plant || '').toUpperCase();
    };

    filteredData.forEach((d: TargetRecord) => {
      const key = keyForRecord(d);
      if (!key) return;
      if (!groups[key]) groups[key] = { target: 0, actual: 0 };
      groups[key].target += d.target || 0;
    });

    const relevantLogs = allEntryLogs.filter((log: LogRecord) => {
      if (log.year.toString() !== selectedYear) return false;
      if (log.month !== selectedMonth) return false;
      if (selectedOEM !== 'All' && log.oem !== selectedOEM) return false;
      if (selectedPlant !== 'All' && log.plant !== selectedPlant) return false;
      if (selectedOriginZone !== 'All' && getOriginZone(log.plant || '') !== selectedOriginZone) return false;
      
      // ADD BRANCH FILTER - MISSING BEFORE
      const branch = log.manageByBranch || INITIAL_MANAGE_BY_BRANCH_MAP[log.oem]?.[log.plant] || log.statecity || log.city || 'Unknown';
      if (selectedBranch !== 'All' && branch.toUpperCase() !== selectedBranch) return false;
      
      return true;
    });

    relevantLogs.forEach((log: LogRecord) => {
      const key = keyForRecord(log);
      if (!key) return;
      if (!groups[key]) groups[key] = { target: 0, actual: 0 };
      groups[key].actual += log.lifted || 0;
    });

    const ranked = Object.entries(groups)
      .map(([key, value]) => ({ key, target: value.target, actual: value.actual, achievement: value.target > 0 ? (value.actual / value.target) * 100 : 0 }))
      .filter(group => group.target > 0 || group.actual > 0)
      .sort((a, b) => b.achievement - a.achievement || b.actual - a.actual);

    const selectedKey = rankContextLabel.toUpperCase();
    const selectedIndex = ranked.findIndex(item => item.key === selectedKey);
    if (selectedIndex >= 0) return selectedIndex + 1;
    return 0;
  }, [filteredData, allEntryLogs, selectedYear, selectedMonth, selectedOEM, selectedPlant, selectedOriginZone, rankContextType, rankContextLabel]);

  const totalMonthlyTarget = targetData.reduce((acc, d) => acc + (d.target || 0), 0);

  // Time metrics — use computeRequirements for accurate date-based calculations
  const daysInMonth = new Date(parseInt(selectedYear), months.indexOf(selectedMonth) + 1, 0).getDate();
  const currentDate = new Date();
  const isCurrentMonth = currentDate.getFullYear() === parseInt(selectedYear) && months[currentDate.getMonth()] === selectedMonth;
  const currentDay = isCurrentMonth ? currentDate.getDate() : daysInMonth;

  // computeRequirements gives us balance-based daily/weekly required from today
  const req = computeRequirements(totalMonthlyTarget, 0, selectedMonth, parseInt(selectedYear));
  const _remainingWorkingDays = req.remainingDays; // kept for potential future use

  // Daily target shown in the table = monthly ÷ daysInMonth (historical pace for table rows)
  const dailyTargetExpected = Math.ceil(totalMonthlyTarget / Math.max(1, daysInMonth));

  // Logs
  const liftingLogs = useMemo(() => {
    return allEntryLogs.filter(log => {
      if (log.year.toString() !== selectedYear) return false;
      if (log.month !== selectedMonth) return false;
      if (selectedOEM !== 'All' && log.oem !== selectedOEM) return false;
      if (selectedPlant !== 'All' && log.plant !== selectedPlant) return false;
      if (selectedOriginZone !== 'All' && getOriginZone(log.plant || '') !== selectedOriginZone) return false;
      
      const branch = log.manageByBranch || INITIAL_MANAGE_BY_BRANCH_MAP[log.oem]?.[log.plant] || log.statecity || log.city || 'Unknown';
      if (selectedBranch !== 'All' && branch.toUpperCase() !== selectedBranch) return false;
      return true;
    });
  }, [allEntryLogs, selectedYear, selectedMonth, selectedOEM, selectedPlant, selectedOriginZone, selectedBranch]);

  // Aggregate daily data
  const dailyDataRows = useMemo(() => {
    const rows = [];
    let cumulativeLifted = 0;
    
    for (let i = 1; i <= daysInMonth; i++) {
        const dStr = `${String(selectedYear)}-${String(months.indexOf(selectedMonth) + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        // Normalize log date to YYYY-MM-DD for comparison (handles ISO and other formats)
        const dayLogs = liftingLogs.filter(l => {
          if (!l.date) return false;
          let logDate = l.date;
          if (!/^\d{4}-\d{2}-\d{2}/.test(logDate)) {
            const parsed = new Date(logDate);
            if (!isNaN(parsed.getTime())) {
              logDate = `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`;
            }
          }
          return logDate.substring(0, 10) === dStr;
        });
        let liftedToday = dayLogs.reduce((acc, l) => acc + (l.lifted || 0), 0);
        cumulativeLifted += liftedToday;
        
        rows.push({
            dayNum: i,
            dateStr: `${i}-${selectedMonth.substring(0,3)}`,
            fullDateStr: `${i}-${selectedMonth.substring(0,3)}-${selectedYear}`,
            target: dailyTargetExpected,
            actual: liftedToday,
            pending: Math.max(0, dailyTargetExpected - liftedToday),
            achievement: dailyTargetExpected > 0 ? (liftedToday / dailyTargetExpected) * 100 : 0,
            mtdLifted: cumulativeLifted
        });
    }
    return rows;
  }, [daysInMonth, selectedYear, selectedMonth, liftingLogs, dailyTargetExpected]);

  const totalMonthlyLifted = dailyDataRows[daysInMonth - 1]?.mtdLifted || 0;
  const overallPending = Math.max(0, totalMonthlyTarget - totalMonthlyLifted);
  const overallAch = totalMonthlyTarget > 0 ? (totalMonthlyLifted / totalMonthlyTarget) * 100 : (totalMonthlyLifted > 0 ? 100 : 0);
  // Balance-based required per day: remaining balance ÷ remaining days from today
  const balanceReq = computeRequirements(totalMonthlyTarget, totalMonthlyLifted, selectedMonth, parseInt(selectedYear));
  const reqPerDay = Math.ceil(balanceReq.dailyRequired);
  // Cap reqPerWeek at the actual balance — it can never exceed total pending cars
  const reqPerWeek = Math.min(Math.ceil(balanceReq.weeklyRequired), overallPending);

  // Last 7 days
  const last7Days = useMemo(() => {
     let endIndex = currentDay - 1;
     let startIndex = Math.max(0, endIndex - 6);
     return dailyDataRows.slice(startIndex, endIndex + 1);
  }, [dailyDataRows, currentDay]);

  const last7Target = last7Days.reduce((a, b) => a + b.target, 0);
  const last7Lifted = last7Days.reduce((a, b) => a + b.actual, 0);

   // --- Additional summary tables data ---
   const plantStats = useMemo(() => {
      const map: Record<string, { plant: string; target: number; actual: number }> = {};

      // accumulate targets from filteredData (branch-filtered)
      filteredData.forEach((d: TargetRecord) => {
         const p = (d.plant || 'Unknown').toString();
         const key = p.toUpperCase();
         if (!map[key]) map[key] = { plant: p, target: 0, actual: 0 };
         map[key].target += d.target || 0;
      });

      // accumulate actuals from liftingLogs
      liftingLogs.forEach((l: LogRecord) => {
         const p = (l.plant || 'Unknown').toString();
         const key = p.toUpperCase();
         if (!map[key]) map[key] = { plant: p, target: 0, actual: 0 };
         map[key].actual += l.lifted || 0;
      });

      return Object.values(map).map(v => ({
         plant: v.plant,
         target: v.target,
         actual: v.actual,
         balance: Math.max(0, v.target - v.actual),
         achievement: v.target > 0 ? (v.actual / v.target) * 100 : 0
      })).sort((a, b) => b.achievement - a.achievement);
   }, [filteredData, liftingLogs]);

   // Rank Card data (by plant) according to selected context (origin zone / oem / plant)
   const rankCardData = useMemo(() => {
      // show plants ranked by achievement within current filters (strictly by achievement)
      return plantStats.map((p, idx) => ({
         sNo: idx + 1,
         plant: p.plant,
         rank: idx + 1,
         achievement: p.achievement,
         medal: idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : ''
      }));
   }, [plantStats]);

   // Ranking Badge Format (top 3 branches) — always visible (based on current filtered data)
   const top3Branches = useMemo(() => {
      const map: Record<string, { branch: string; target: number; actual: number }> = {};
      filteredData.forEach((d: TargetRecord) => {
         const branch = d.manageByBranch || INITIAL_MANAGE_BY_BRANCH_MAP[d.oem]?.[d.plant] || d.statecity || d.zone || 'Unknown';
         const key = branch.toUpperCase();
         if (!map[key]) map[key] = { branch, target: 0, actual: 0 };
         map[key].target += d.target || 0;
      });
      liftingLogs.forEach((l: LogRecord) => {
         const branch = l.manageByBranch || INITIAL_MANAGE_BY_BRANCH_MAP[l.oem]?.[l.plant] || l.statecity || l.city || 'Unknown';
         const key = branch.toUpperCase();
         if (!map[key]) map[key] = { branch, target: 0, actual: 0 };
         map[key].actual += l.lifted || 0;
      });

      const ranked = Object.values(map)
         .map(v => ({ branch: v.branch, target: v.target, actual: v.actual, achievement: v.target > 0 ? (v.actual / v.target) * 100 : (v.actual > 0 ? 100 : 0) }))
         .filter(i => i.target > 0 || i.actual > 0)
         .sort((a, b) => b.achievement - a.achievement || b.actual - a.actual)
         .slice(0, 3);
      return ranked;
   }, [filteredData, liftingLogs]);

   // OEM Plant Score Card (plants with aggregates)
   const oemPlantScore = useMemo(() => {
      return plantStats; // plantStats already aggregated by plant and respects filters
   }, [plantStats]);

   // Zone wise summary (group by origin zone)
   const zoneSummary = useMemo(() => {
      const map: Record<string, { zone: string; target: number; actual: number }> = {};
      const zoneForRecord = (rec: TargetRecord | LogRecord) => {
         return (rec.originZone && rec.originZone !== '') ? rec.originZone : (getOriginZone(rec.plant || '') || rec.zone || 'Unknown');
      };

      filteredData.forEach((d: TargetRecord) => {
         const z = zoneForRecord(d) || 'UNKNOWN';
         const key = z.toUpperCase();
         if (!map[key]) map[key] = { zone: z, target: 0, actual: 0 };
         map[key].target += d.target || 0;
      });
      liftingLogs.forEach((l: LogRecord) => {
         const z = zoneForRecord(l) || 'UNKNOWN';
         const key = z.toUpperCase();
         if (!map[key]) map[key] = { zone: z, target: 0, actual: 0 };
         map[key].actual += l.lifted || 0;
      });
      return Object.values(map).map(v => ({ zone: v.zone, target: v.target, actual: v.actual, balance: Math.max(0, v.target - v.actual), achievement: v.target > 0 ? (v.actual / v.target) * 100 : 0 })).sort((a,b)=>b.achievement-a.achievement);
   }, [filteredData, liftingLogs]);

  // Weekly Breakdown — uses breakTargetIntoWeeks for consistent calendar-based calculation.
  // If any targetData record has explicit weeklyBreakdown (saved in Weekly mode), those
  // exact values are used. Otherwise the monthly target is split proportionally:
  //   W1: days 1-7, W2: 8-14, W3: 15-21, W4: 22-end
  const weeklyBreakdown = useMemo(() => {
    const wDayBounds = [
      { start: 0,  days: 7,             label: 'Week 1 (1-7)' },
      { start: 7,  days: 7,             label: 'Week 2 (8-14)' },
      { start: 14, days: 7,             label: 'Week 3 (15-21)' },
      { start: 21, days: daysInMonth - 21, label: `Week 4 (22-${daysInMonth})` },
    ];

    // Aggregate explicit weekly targets from all targetData records
    const explicitTargets: Record<number, number> = {};
    const explicitLabels: Record<number, string> = {};
    let hasExplicit = false;

    targetData.forEach(d => {
      if (d.weeklyBreakdown && Array.isArray(d.weeklyBreakdown) && d.weeklyBreakdown.length > 0) {
        hasExplicit = true;
        d.weeklyBreakdown.forEach((wb: any, idx: number) => {
          const wn = idx + 1;
          explicitTargets[wn] = (explicitTargets[wn] || 0) + (wb.cars || 0);
          if (!explicitLabels[wn]) explicitLabels[wn] = wb.dateRange || `Week ${wn}`;
        });
      } else {
        // Fallback: auto-breakdown this specific record's target so it's not lost in the overall weekly sum
        const autoW = breakTargetIntoWeeks(d.target || 0, selectedMonth, parseInt(selectedYear));
        explicitTargets[1] = (explicitTargets[1] || 0) + autoW.w1;
        explicitTargets[2] = (explicitTargets[2] || 0) + autoW.w2;
        explicitTargets[3] = (explicitTargets[3] || 0) + autoW.w3;
        explicitTargets[4] = (explicitTargets[4] || 0) + autoW.w4;
      }
    });

    // Auto-calculate using breakTargetIntoWeeks when no explicit breakdown
    const autoWeeks = breakTargetIntoWeeks(totalMonthlyTarget, selectedMonth, parseInt(selectedYear));
    const autoTargets = [autoWeeks.w1, autoWeeks.w2, autoWeeks.w3, autoWeeks.w4];

    return wDayBounds.map((wb, i) => {
      const wTarget = hasExplicit ? (explicitTargets[i + 1] || 0) : autoTargets[i];
      const slice = dailyDataRows.slice(wb.start, wb.start + wb.days);
      const wActual = slice.reduce((a, b) => a + b.actual, 0);
      const wPend = Math.max(0, wTarget - wActual);
      return {
        name: hasExplicit ? (explicitLabels[i + 1] || wb.label) : wb.label,
        target: wTarget,
        actual: wActual,
        pending: wPend,
        ach: wTarget > 0 ? (wActual / wTarget) * 100 : (wActual > 0 ? 100 : 0),
      };
    });
  }, [dailyDataRows, daysInMonth, targetData, totalMonthlyTarget, selectedMonth, selectedYear]);

  // Today specific (using last element of current progression)
  const todayRow = dailyDataRows[currentDay - 1] || dailyDataRows[0];
  const yesterdayRow = currentDay > 1 ? dailyDataRows[currentDay - 2] : null;
  const currentWeekIndex = Math.min(3, Math.floor((currentDay - 1) / 7));
  const currentWeekSummary = weeklyBreakdown[currentWeekIndex] || { target: 0, actual: 0, pending: 0, ach: 0 };

  // BUG-08 FIX: Ageing buckets now derived from real daily data instead of hardcoded mock percentages.
  // Groups pending cars by how many days ago they were due (based on dailyDataRows shortfall).
  const ageing = (() => {
    let bucket_0_2 = 0, bucket_3_5 = 0, bucket_6_10 = 0, bucket_10_plus = 0;
    const today = new Date();
    dailyDataRows.forEach(row => {
      if (row.pending <= 0) return;
      const dayDate = new Date(parseInt(selectedYear), months.indexOf(selectedMonth), row.dayNum);
      const daysAgo = Math.floor((today.getTime() - dayDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysAgo < 0) return; // skip future days
      if (daysAgo <= 2)       bucket_0_2    += row.pending;
      else if (daysAgo <= 5)  bucket_3_5    += row.pending;
      else if (daysAgo <= 10) bucket_6_10   += row.pending;
      else                    bucket_10_plus += row.pending;
    });
    return { '0_2': bucket_0_2, '3_5': bucket_3_5, '6_10': bucket_6_10, '10_plus': bucket_10_plus };
  })();

  // Top 5 Destinations
  const destStats = useMemo(() => {
    const stats: Record<string, number> = {};
    liftingLogs.forEach(l => {
       const d = (l.statecity || 'Unknown').toUpperCase();
       stats[d] = (stats[d] || 0) + (l.lifted || 0);
    });
    return Object.entries(stats).sort((a,b) => b[1] - a[1]).slice(0, 5).map(([dest, lifted]) => ({dest, lifted}));
  }, [liftingLogs]);

  // Historical data (last 4 months)
  const histData = useMemo(() => {
    const list = [];
    let curMonthIdx = months.indexOf(selectedMonth);
    let curYr = parseInt(selectedYear);
    
    for(let i=3; i>=0; i--) {
       let mIdx = curMonthIdx - i;
       let yr = curYr;
       if (mIdx < 0) {
           mIdx += 12;
           yr -= 1;
       }
       const mName = months[mIdx];
       // Compute target and lifted for this historical month
       const hTargetData = data.filter(d => 
          d.month === mName && d.year === yr &&
          (selectedOEM === 'All' || d.oem === selectedOEM) &&
          (selectedPlant === 'All' || d.plant === selectedPlant) &&
          (selectedBranch === 'All' || (d.manageByBranch || d.statecity || d.zone || '').toUpperCase() === selectedBranch)
       );
       const hTgt = hTargetData.reduce((acc, d) => acc + (d.target || 0), 0);
       
       const hLogs = allEntryLogs.filter(l => 
          l.month === mName && l.year === yr &&
          (selectedOEM === 'All' || l.oem === selectedOEM) &&
          (selectedPlant === 'All' || l.plant === selectedPlant) &&
          (selectedBranch === 'All' || (l.manageByBranch || l.statecity || l.city || '').toUpperCase() === selectedBranch)
       );
       const hActual = hLogs.reduce((acc, l) => acc + (l.lifted || 0), 0);
       
       list.push({
          monthStr: `${mName.substring(0,3)}-${yr}`,
          Target: hTgt,
          Actual: hActual
       });
    }
    return list;
  }, [months, selectedMonth, selectedYear, data, allEntryLogs, selectedOEM, selectedPlant, selectedBranch]);

  // Gauge Data
  const gaugeData = [
    { name: 'Achieved', value: Math.min(overallAch, 100), color: overallAch >= 90 ? '#22c55e' : (overallAch >= 75 ? '#f59e0b' : '#ef4444') },
    { name: 'Remaining', value: Math.max(0, 100 - overallAch), color: '#f1f5f9' },
  ];
  
  // Custom Needle for Gauge
  const RADIAN = Math.PI / 180;
  const cx = 150;
  const cy = 130;
  const iR = 80;  // inner radius — used in gauge Pie
  const oR = 110; // outer radius — used in gauge Pie
  const needleAngle = 180 - (Math.min(overallAch, 100) * 1.8);
  const xba = cx + 5 * Math.cos((needleAngle - 90) * RADIAN);
  const yba = cy - 5 * Math.sin((needleAngle - 90) * RADIAN);
  const xbb = cx + 5 * Math.cos((needleAngle + 90) * RADIAN);
  const ybb = cy - 5 * Math.sin((needleAngle + 90) * RADIAN);
  const xp = cx + iR * Math.cos(needleAngle * RADIAN);
  const yp = cy - iR * Math.sin(needleAngle * RADIAN);
  const needlePath = `M${xba} ${yba} L${xbb} ${ybb} L${xp} ${yp} Z`;

  // Score Calculations
  // Target Achievement Score (50% weightage): Ratio of lifted to target
  const scoreTarget = Math.min(100, overallAch);
  
  // BUG-09 FIX: Removed Math.max(50, ...) floor that was artificially inflating scores.
  // Dispatch Timeliness Score (25% weightage): based on today's daily achievement, no artificial floor.
  const todayDailyAch = todayRow?.achievement || 0;
  const scoreDispatch = Math.min(100, Math.max(0, todayDailyAch));
  
  // Trailer Utilization Score (25% weightage)
  const scoreTrailer = Math.min(100, overallAch);
  
  const pointsTrailer = (scoreTrailer * 0.25).toFixed(2);
  const pointsDispatch = (scoreDispatch * 0.25).toFixed(2);
  const pointsTarget = (scoreTarget * 0.50).toFixed(2);
  const totalScore = (parseFloat(pointsTrailer) + parseFloat(pointsDispatch) + parseFloat(pointsTarget)).toFixed(2);
  const scoreLabel = parseFloat(totalScore) > 90 ? 'VERY GOOD' : parseFloat(totalScore) > 75 ? 'GOOD' : parseFloat(totalScore) > 50 ? 'AVERAGE' : 'POOR';

  return (
    <div className="w-full bg-[#f4f7f9] min-h-screen pb-10">
      {/* Header */}
      <div className="bg-[#002060] text-white p-4 flex justify-between items-center shadow-md">
        <h1 className="text-xl md:text-2xl font-bold tracking-wider">BRANCH PERFORMANCE & TARGET REPORT</h1>
        <div className="flex items-center gap-2 text-sm font-medium bg-white/10 px-3 py-1.5 rounded-md border border-white/20">
          <Calendar size={16} />
          <span>Date : {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/\//g, '-')}</span>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-[1600px] mx-auto">
        {/* Filters */}
        <div className="flex flex-wrap gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
           <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 mb-1 uppercase">Month</label>
              <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-[#002060] outline-none">
                {months.map(m => (
                  <option key={m} value={m}>{m}-{selectedYear}</option>
                ))}
              </select>
           </div>
           <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 mb-1 uppercase">OEM</label>
              <select value={selectedOEM} onChange={e => {setSelectedOEM(e.target.value); setSelectedPlant('All');}} className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-[#002060] outline-none">
                <option value="All">All OEMs</option>
                {oemOptions.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
           </div>
           <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 mb-1 uppercase">Plant</label>
              <select value={selectedPlant} onChange={e => setSelectedPlant(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-[#002060] outline-none">
                <option value="All">All Plants</option>
                {plantOptions.map(p => (
                   <option key={p} value={p}>{p}</option>
                ))}
              </select>
           </div>
           <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 mb-1 uppercase">Branch Name</label>
              <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-[#002060] outline-none">
                <option value="All">All Branches</option>
                {allBranches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
           </div>
           <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 mb-1 uppercase">Origin Zone</label>
              <select value={selectedOriginZone} onChange={e => setSelectedOriginZone(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-[#002060] outline-none">
                <option value="All">All Origin Zones</option>
                {originZoneOptions.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
           </div>
        </div>

        {/* Top Cards Row */}
        <div className="flex flex-col xl:flex-row gap-4">
            
            {/* Branch Details Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-w-[280px]">
                <div className="bg-[#002060] text-white p-2 px-4 text-sm font-bold tracking-wide flex items-center gap-2">
                    <Trophy size={16} /> BRANCH DETAILS
                </div>
                <div className="p-4 flex flex-col gap-3 text-sm font-semibold text-slate-700">
                    <div>
                        <div className="text-[10px] uppercase text-slate-400 font-bold">Branch Name</div>
                        <div className="text-[#002060] text-lg font-black uppercase">{selectedBranch === 'All' ? 'ALL BRANCHES' : selectedBranch}</div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase text-slate-400 font-bold">AO Zone</div>
                        <div className="uppercase font-bold">{derivedOriginZone}</div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase text-slate-400 font-bold">Plant / OEM</div>
                        <div className="uppercase font-bold">{selectedPlant === 'All' ? 'ALL' : selectedPlant} / {selectedOEM === 'All' ? 'ALL' : selectedOEM}</div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase text-slate-400 font-bold">Reporting Date</div>
                        <div className="uppercase font-bold text-slate-600">{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/\//g, '-')}</div>
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div className="flex-1 grid grid-cols-2 md:grid-cols-6 gap-3">
                {/* Daily Target — shows balance-based required per day (0 when target already met) */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col items-center justify-center border-t-4 border-t-blue-500">
                  <div className="flex items-center gap-2 mb-3">
                     <Target size={18} className="text-[#002060]"/>
                     <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">TOTAL TARGET</span>
                  </div>
                  <span className="text-4xl font-bold text-[#002060] mb-1">{totalMonthlyTarget.toLocaleString()}</span>
                  <span className="text-xs text-slate-400 font-semibold">Cars</span>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col items-center justify-center border-t-4 border-t-green-500">
                  <div className="flex items-center gap-2 mb-3">
                     <CarFront size={18} className="text-green-600"/>
                     <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">TOTAL LIFTED</span>
                  </div>
                  <span className="text-4xl font-bold text-green-600 mb-1">{totalMonthlyLifted.toLocaleString()}</span>
                  <span className="text-xs text-slate-400 font-semibold">Cars</span>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col items-center justify-center border-t-4 border-t-red-500">
                  <div className="flex items-center gap-2 mb-3">
                     <Hourglass size={18} className="text-red-500"/>
                     <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">PENDING CARS</span>
                  </div>
                  <span className="text-4xl font-bold text-red-500 mb-1">{overallPending.toLocaleString()}</span>
                  <span className="text-xs text-slate-400 font-semibold">Cars</span>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col items-center justify-center border-t-4 border-t-[#002060]">
                  <div className="flex items-center gap-2 mb-3">
                     <BarChart3 size={18} className="text-[#002060]"/>
                     <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">ACHIEVEMENT %</span>
                  </div>
                  <span className="text-3xl font-bold text-[#002060] mb-1">{Math.round(overallAch)}%</span>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col items-center justify-center border-t-4 border-t-blue-300">
                  <div className="flex items-center gap-2 mb-3">
                     <Trophy size={18} className="text-blue-500"/>
                     <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">RANK IN BRANCH</span>
                  </div>
                  <span className="text-4xl font-bold text-[#002060] mb-1 flex items-center gap-1">
                    <span>🏆</span>
                    <span>
                      {selectedBranch === 'All' && selectedOEM === 'All' && selectedPlant === 'All' && selectedOriginZone === 'All'
                        ? '1'
                        : rankValue > 0 ? `${rankValue}` : '--'}
                    </span>
                  </span>
                  <span className="text-xs text-slate-400 font-semibold uppercase">
                    {selectedBranch === 'All'
                      ? (top3Branches[0]?.branch || 'ALL BRANCHES')
                      : selectedBranch}
                  </span>
                </div>

                {totalMonthlyTarget === 0 ? (
                  <div className="bg-slate-50 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center p-4 relative overflow-hidden">
                    <span className="text-xs text-slate-400 font-semibold">No Score Data</span>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center p-2 relative overflow-hidden">
                    <div className="absolute top-0 w-full h-8 bg-slate-50 flex items-center justify-center gap-2 border-b border-slate-200">
                       <Star size={14} className="text-[#002060] fill-[#002060]"/> 
                       <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">SCORE</span>
                    </div>
                    <div className="mt-8 flex flex-col items-center">
                       <span className="text-2xl font-black text-green-700">{totalScore} <span className="text-lg text-slate-500 font-medium">/ 100</span></span>
                       <span className="text-[11px] font-bold text-green-600 mt-2 tracking-wide">{scoreLabel}</span>
                    </div>
                  </div>
                )}
            </div>
        </div>

        {/* Row 2: Target vs Actual, Gauge, Line Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            
            {/* Target vs Actual Summary */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
               <div className="bg-[#002060] text-white p-2 px-4 text-xs font-bold tracking-wide uppercase">TARGET VS ACTUAL SUMMARY</div>
               <table className="w-full text-sm text-left">
                  <thead>
                     <tr className="bg-slate-50 border-b border-slate-200 text-[#002060]">
                        <th className="p-3 font-bold border-r border-slate-200">Particulars</th>
                        <th className="p-3 font-bold text-center border-r border-slate-200">Yesterday</th>
                        <th className="p-3 font-bold text-center border-r border-slate-200">Weekly</th>
                        <th  className="p-3 font-bold text-center">Monthly</th>
                     </tr>
                  </thead>
                  <tbody>
                     <tr className="border-b border-slate-100">
                        <td className="p-3 border-r border-slate-200 font-semibold text-slate-600">Target (Cars)</td>
                        <td className="p-3 text-[#002060] font-bold text-center border-r border-slate-200">{dailyTargetExpected.toLocaleString()}</td>
                        <td className="p-3 text-[#002060] font-bold text-center border-r border-slate-200">{currentWeekSummary.target.toLocaleString()}</td>
                        <td className="p-3 text-[#002060] font-bold text-center">{totalMonthlyTarget.toLocaleString()}</td>
                     </tr>
                     <tr className="border-b border-slate-100">
                        <td className="p-3 border-r border-slate-200 font-semibold text-slate-600">Actual (Cars)</td>
                        <td className="p-3 text-green-600 font-bold text-center border-r border-slate-200">{yesterdayRow?.actual.toLocaleString()||0}</td>
                        <td className="p-3 text-green-600 font-bold text-center border-r border-slate-200">{currentWeekSummary.actual.toLocaleString()}</td>
                        <td className="p-3 text-green-600 font-bold text-center">{totalMonthlyLifted.toLocaleString()}</td>
                     </tr>
                     <tr className="border-b border-slate-100">
                        <td className="p-3 border-r border-slate-200 font-semibold text-slate-600">Pending (Cars)</td>
                        <td className="p-3 text-red-500 font-bold text-center border-r border-slate-200">{Math.max(0, dailyTargetExpected - (yesterdayRow?.actual || 0)).toLocaleString()}</td>
                        <td className="p-3 text-red-500 font-bold text-center border-r border-slate-200">{currentWeekSummary.pending.toLocaleString()}</td>
                        <td className="p-3 text-red-500 font-bold text-center">{overallPending.toLocaleString()}</td>
                     </tr>
                     <tr className="border-b border-slate-100">
                        <td className="p-3 border-r border-slate-200 font-semibold text-slate-600">Achievement (%)</td>
                        <td className="p-3 text-[#1e293b] font-bold text-center border-r border-slate-200">{Math.round(dailyTargetExpected>0 ? ((yesterdayRow?.actual || 0)/dailyTargetExpected)*100 : 0)}%</td>
                        <td className="p-3 text-[#1e293b] font-bold text-center border-r border-slate-200">{Math.round(currentWeekSummary.ach)}%</td>
                        <td className="p-3 text-[#1e293b] font-bold text-center">{Math.round(overallAch)}%</td>
                     </tr>
                     <tr>
                        <td className="p-3 border-r border-slate-200 font-semibold text-slate-600">Required Per Day (Balance)</td>
                        <td className="p-3 text-[#1e293b] font-bold text-center border-r border-slate-200">-</td>
                        <td className="p-3 text-[#1e293b] font-bold text-center border-r border-slate-200">{Math.ceil(currentWeekSummary.pending / 7)}</td>
                        <td className="p-3 text-[#1e293b] font-bold text-center">{reqPerDay}</td>
                     </tr>
                  </tbody>
               </table>
            </div>

            {/* Gauge Chart */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
               <div className="bg-[#002060] text-white p-2 px-4 text-xs font-bold tracking-wide uppercase text-center">TARGET ACHIEVEMENT (%)</div>
               <div className="p-2 flex-grow flex flex-col items-center justify-center relative" style={{ minHeight: 180 }}>
                  <div className="w-[300px] h-[160px] relative">
                     <ResponsiveContainer width="100%" height="100%">
                         <PieChart>
                             <Pie data={gaugeData} cx={150} cy={140} startAngle={180} endAngle={0} innerRadius={iR} outerRadius={oR} dataKey="value" stroke="none">
                                {gaugeData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                             </Pie>
                         </PieChart>
                     </ResponsiveContainer>
                     <svg width="300" height="160" style={{position:'absolute', top:0, left:0, pointerEvents:'none'}}>
                         <path d={needlePath} fill="#1e293b" />
                         <circle cx={cx} cy={cy} r={8} fill="#1e293b" />
                     </svg>
                     <div className="absolute bottom-1 w-full text-center">
                         <div className="text-3xl font-black text-[#002060]">{Math.round(overallAch)}%</div>
                         <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Achievement</div>
                     </div>
                     <div className="absolute left-6 bottom-5 text-sm font-bold text-slate-600">0</div>
                     <div className="absolute top-2 left-[142px] text-sm font-bold text-slate-600">50</div>
                     <div className="absolute right-6 bottom-5 text-sm font-bold text-slate-600">100</div>
                  </div>
               </div>
            </div>

            {/* Line Chart */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
               <div className="bg-[#002060] text-white p-2 px-4 text-xs font-bold tracking-wide uppercase text-center">PERIOD WISE PERFORMANCE TREND</div>
               {last7Days.length === 0 ? (
                 <div className="flex items-center justify-center flex-1 p-6">
                   <p className="text-sm text-slate-500 font-medium">No data available for display</p>
                 </div>
               ) : (
                 <div className="p-4 flex-grow" style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={last7Days} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0"/>
                        <XAxis dataKey="dateStr" tickLine={false} axisLine={false} tick={{fontSize: 10, fill: '#64748b', fontWeight: 600}} dy={10} minTickGap={5}/>
                        <YAxis tickLine={false} axisLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                        <RechartsTooltip cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 600, top: -10 }} />
                        <Line type="monotone" dataKey="target" name="Target" stroke="#002060" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
                        <Line type="monotone" dataKey="actual" name="Actual" stroke="#16a34a" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
                      </LineChart>
                    </ResponsiveContainer>
                 </div>
               )}
            </div>
        </div>

        {/* Row 3: Monthly Overview, Daily Perf, KPI Score */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            
            {/* Monthly Performance Overview */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
               <div className="bg-[#002060] text-white p-2 px-4 text-xs font-bold tracking-wide uppercase text-center">MONTHLY PERFORMANCE OVERVIEW</div>
               {totalMonthlyTarget === 0 ? (
                 <div className="flex items-center justify-center flex-1 p-6">
                   <p className="text-sm text-slate-500 font-medium">No data available for display</p>
                 </div>
               ) : (
               <table className="w-full text-[13px] text-center">
                  <thead>
                     <tr className="bg-slate-50 border-b border-slate-200 text-[#002060]">
                        <th className="p-2.5 font-bold border-r border-slate-200">Particulars</th>
                        <th className="p-2.5 font-bold border-r border-slate-200">Target</th>
                        <th className="p-2.5 font-bold border-r border-slate-200">Actual</th>
                        <th className="p-2.5 font-bold border-r border-slate-200">Achievement %</th>
                        <th className="p-2.5 font-bold">Pending</th>
                     </tr>
                  </thead>
                  <tbody>
                     {weeklyBreakdown.map(wk => (
                        <tr key={wk.name} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="p-2.5 border-r border-slate-200 font-semibold text-slate-700">{wk.name}</td>
                            <td className="p-2.5 border-r border-slate-200 text-[#002060]">{wk.target.toLocaleString()}</td>
                            <td className="p-2.5 border-r border-slate-200 font-bold text-green-600">{wk.actual.toLocaleString()}</td>
                            <td className={`p-2.5 border-r border-slate-200 font-bold ${wk.ach >= 90 ? 'text-green-600' : 'text-red-500'}`}>{Math.round(wk.ach)}%</td>
                            <td className="p-2.5 font-bold text-red-500">{wk.pending.toLocaleString()}</td>
                        </tr>
                     ))}
                     <tr className="bg-slate-50 border-t-2 border-slate-200">
                        <td className="p-3 border-r border-slate-200 font-bold text-[#002060]">Total (Till Date)</td>
                        <td className="p-3 border-r border-slate-200 font-bold text-[#002060]">{totalMonthlyTarget.toLocaleString()}</td>
                        <td className="p-3 border-r border-slate-200 font-bold text-green-600">{totalMonthlyLifted.toLocaleString()}</td>
                        <td className="p-3 border-r border-slate-200 font-bold text-[#002060]">{Math.round(overallAch)}%</td>
                        <td className="p-3 font-bold text-red-500">{overallPending.toLocaleString()}</td>
                     </tr>
                  </tbody>
               </table>
               )}
            </div>

            {/* Daily Performance */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
               <div className="bg-[#002060] text-white p-2 px-4 text-xs font-bold tracking-wide uppercase text-center">DAILY PERFORMANCE (LAST 7 DAYS)</div>
               {last7Days.length === 0 ? (
                 <div className="flex items-center justify-center flex-1 p-6">
                   <p className="text-sm text-slate-500 font-medium">No data available for display</p>
                 </div>
               ) : (
               <table className="w-full text-[13px] text-center">
                  <thead>
                     <tr className="bg-slate-50 border-b border-slate-200 text-[#002060]">
                        <th className="p-2.5 font-bold border-r border-slate-200">Date</th>
                        <th className="p-2.5 font-bold border-r border-slate-200">Target</th>
                        <th className="p-2.5 font-bold border-r border-slate-200">Actual</th>
                        <th className="p-2.5 font-bold border-r border-slate-200">Achievement %</th>
                        <th className="p-2.5 font-bold">Pending</th>
                     </tr>
                  </thead>
                  <tbody>
                     {last7Days.map(d => (
                         <tr key={d.dateStr} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="p-2 border-r border-slate-200 font-semibold text-slate-700">{d.fullDateStr}</td>
                            <td className="p-2 border-r border-slate-200 text-[#002060]">{d.target.toLocaleString()}</td>
                            <td className={`p-2 border-r border-slate-200 font-bold ${d.actual >= d.target ? 'text-green-600' : 'text-slate-700'}`}>{d.actual.toLocaleString()}</td>
                            <td className={`p-2 border-r border-slate-200 font-bold ${d.achievement >= 100 ? 'text-green-600' : 'text-red-500'}`}>{Math.round(d.achievement)}%</td>
                            <td className="p-2 font-bold text-red-500">{d.pending}</td>
                         </tr>
                     ))}
                  </tbody>
               </table>
               )}
            </div>

            {/* KPI Score Breakup */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative min-h-[220px]">
               <div className="bg-[#002060] text-white p-2 px-4 text-xs font-bold tracking-wide uppercase text-center">KPI SCORE BREAKUP (100 POINTS)</div>
               
               {targetData.length === 0 || totalMonthlyTarget === 0 ? (
                 <div className="flex items-center justify-center flex-1 text-center p-6">
                   <div>
                     <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-2" />
                     <p className="text-sm font-semibold text-slate-700">No data available for selected period</p>
                     <p className="text-xs text-slate-500 mt-1">Please enter target & lifting data to see KPI scores</p>
                   </div>
                 </div>
               ) : (
                 <>
                   <div className="overflow-x-auto flex-grow">
                     <table className="w-full text-[13px] text-left min-w-[300px]">
                        <thead>
                           <tr className="bg-slate-50 border-b border-slate-200 text-[#002060]">
                              <th className="p-2 font-bold border-r border-slate-200 w-[140px]">KPI</th>
                              <th className="p-2 font-bold border-r border-slate-200 text-center w-[70px]">Weightage</th>
                              <th className="p-2 font-bold border-r border-slate-200 text-center w-[90px]">Achievement</th>
                              <th className="p-2 font-bold text-center">Score</th>
                           </tr>
                        </thead>
                        <tbody>
                           <tr className="border-b border-slate-100">
                              <td className="p-2 border-r border-slate-200 font-semibold text-slate-700">Target Achievement</td>
                              <td className="p-2 border-r border-slate-200 text-center text-[#1e293b]">50</td>
                              <td className="p-2 border-r border-slate-200 text-center font-semibold text-[#1e293b]">{Math.round(overallAch)}%</td>
                              <td className="p-2 text-center font-bold text-[#002060]">{pointsTarget}</td>
                           </tr>
                           <tr className="border-b border-slate-100">
                              <td className="p-2 border-r border-slate-200 font-semibold text-slate-700">Trailer Utilization</td>
                              <td className="p-2 border-r border-slate-200 text-center text-[#1e293b]">25</td>
                              <td className="p-2 border-r border-slate-200 text-center font-semibold text-[#1e293b]">{Math.round(scoreTrailer)}%</td>
                              <td className="p-2 text-center font-bold text-[#002060]">{pointsTrailer}</td>
                           </tr>
                           <tr className="border-b border-slate-100">
                              <td className="p-2 border-r border-slate-200 font-semibold text-slate-700">Dispatch Timeliness</td>
                              <td className="p-2 border-r border-slate-200 text-center text-[#1e293b]">25</td>
                              <td className="p-2 border-r border-slate-200 text-center font-semibold text-[#1e293b]">{Math.round(scoreDispatch)}%</td>
                              <td className="p-2 text-center font-bold text-[#002060]">{pointsDispatch}</td>
                           </tr>
                        </tbody>
                     </table>
                     
                     {/* Visual bars */}
                     <div className="px-4 py-3 pb-4">
                        <div className="flex w-full h-4 rounded-full overflow-hidden bg-slate-100 relative">
                           <div className="bg-[#005689]" style={{width: `${parseFloat(pointsTarget)}%`}}></div>
                           <div className="bg-green-500 absolute" style={{width: `${parseFloat(pointsTrailer)}%`, left: '50%'}}></div>
                           <div className="bg-blue-400 absolute" style={{width: `${parseFloat(pointsDispatch)}%`, left: '75%'}}></div>
                        </div>
                     </div>
                   </div>
                   
                   <div className="p-3 bg-slate-50 flex items-center justify-between border-t border-slate-200 mt-auto">
                        <div className="text-sm font-bold text-[#002060] uppercase">TOTAL SCORE</div>
                        <div className="text-sm font-bold text-[#002060] text-center ml-10">100</div>
                        <div className="text-lg font-black text-green-700 flex items-center pr-2">{totalScore} <span className="text-sm font-bold text-slate-400 ml-1">/ 100</span></div>
                   </div>
                 </>
               )}
            </div>
        </div>

        {/* Row 4: Ageing, Trailer Util, Top Destinations, History */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
               <div className="bg-[#002060] text-white p-2 px-4 text-xs font-bold tracking-wide uppercase text-center">PENDING CARS AGEING ANALYSIS</div>
               {overallPending === 0 ? (
                 <div className="flex items-center justify-center flex-1 p-6">
                   <p className="text-sm text-slate-500 font-medium">No pending cars - All targets achieved!</p>
                 </div>
               ) : (
               <table className="w-full text-[13px] text-center">
                  <thead>
                     <tr className="bg-slate-50 border-b border-slate-200 text-[#002060]">
                        <th className="p-2 font-bold border-r border-slate-200">Ageing (Days)</th>
                        <th className="p-2 font-bold">No. of Cars</th>
                     </tr>
                  </thead>
                  <tbody>
                     <tr className="border-b border-slate-100">
                        <td className="p-3 border-r border-slate-200 font-semibold text-slate-700">0 - 2 Days</td>
                        <td className="p-3 font-black text-[#1e293b]">{ageing['0_2']}</td>
                     </tr>
                     <tr className="border-b border-slate-100">
                        <td className="p-3 border-r border-slate-200 font-semibold text-slate-700">3 - 5 Days</td>
                        <td className="p-3 font-black text-[#1e293b]">{ageing['3_5']}</td>
                     </tr>
                     <tr className="border-b border-slate-100">
                        <td className="p-3 border-r border-slate-200 font-semibold text-slate-700">6 - 10 Days</td>
                        <td className="p-3 font-black text-[#1e293b]">{ageing['6_10']}</td>
                     </tr>
                     <tr className="border-b border-slate-100">
                        <td className="p-3 border-r border-slate-200 font-semibold text-slate-700">10+ Days</td>
                        <td className="p-3 font-black text-[#1e293b]">{ageing['10_plus']}</td>
                     </tr>
                     <tr className="bg-slate-50 border-t-2 border-slate-200">
                        <td className="p-3 border-r border-slate-200 font-bold text-[#002060]">Total Pending</td>
                        <td className="p-3 font-black text-red-500">{overallPending}</td>
                     </tr>
                  </tbody>
               </table>
               )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
               <div className="bg-[#002060] text-white p-2 px-4 text-xs font-bold tracking-wide uppercase text-center">TRAILER UTILIZATION</div>
               
               {targetData.length === 0 || totalMonthlyTarget === 0 ? (
                 <div className="flex items-center justify-center flex-1 p-6">
                   <p className="text-sm text-slate-500 font-medium">No data to display</p>
                 </div>
               ) : (
                 <table className="w-full text-[13px] text-center h-full flex flex-col">
                    <thead>
                       <tr className="bg-slate-50 border-b border-slate-200 text-[#002060] table w-full table-fixed">
                          <th className="p-2 font-bold border-r border-slate-200 w-1/2">Particulars</th>
                          <th className="p-2 font-bold w-1/2">Trailers</th>
                       </tr>
                    </thead>
                    <tbody className="flex-1 flex flex-col">
                       <tr className="border-b border-slate-100 table w-full table-fixed">
                          <td className="p-3 border-r border-slate-200 font-semibold text-slate-700 text-left w-1/2">Target Trailers</td>
                          <td className="p-3 font-black text-[#1e293b] w-1/2">{Math.ceil(totalMonthlyTarget / trailerCapacity).toLocaleString()}</td>
                       </tr>
                       <tr className="border-b border-slate-100 table w-full table-fixed">
                          <td className="p-3 border-r border-slate-200 font-semibold text-slate-700 text-left w-1/2">Lifted Trailers</td>
                          <td className="p-3 font-black text-green-600 w-1/2">{Math.round(totalMonthlyLifted / trailerCapacity).toLocaleString()}</td>
                       </tr>
                       <tr className="border-b border-slate-100 table w-full table-fixed">
                          <td className="p-3 border-r border-slate-200 font-semibold text-slate-700 text-left w-1/2">Utilization %</td>
                          <td className="p-3 font-black text-green-600 text-xl w-1/2">{totalMonthlyTarget > 0 ? Math.round((totalMonthlyLifted / totalMonthlyTarget) * 100) : '0.00'}%</td>
                       </tr>
                       <tr className="table w-full table-fixed">
                          <td className="p-3 border-r border-slate-200 font-semibold text-slate-700 text-left w-1/2">Pending Trailers</td>
                          <td className="p-3 font-black text-red-500 w-1/2">{Math.ceil(Math.max(0, totalMonthlyTarget - totalMonthlyLifted) / trailerCapacity).toLocaleString()}</td>
                       </tr>
                    </tbody>
                 </table>
               )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
               <div className="bg-[#002060] text-white p-2 px-4 text-xs font-bold tracking-wide uppercase text-center">TOP 5 DESTINATION WISE LIFTING</div>
               {destStats.length === 0 ? (
                 <div className="flex items-center justify-center flex-1 p-6">
                   <p className="text-sm text-slate-500 font-medium">No lifting data available</p>
                 </div>
               ) : (
               <table className="w-full text-[13px] text-center flex flex-col h-full">
                  <thead>
                     <tr className="bg-slate-50 border-b border-slate-200 text-[#002060] table w-full table-fixed">
                        <th className="p-2 font-bold border-r border-slate-200 text-left">Destination</th>
                        <th className="p-2 font-bold w-1/3">Lifted Cars</th>
                     </tr>
                  </thead>
                  <tbody className="flex-1">
                     {destStats.map((st) => (
                         <tr key={st.dest} className="border-b border-slate-100 table w-full table-fixed">
                            <td className="p-2.5 border-r border-slate-200 font-semibold text-slate-700 text-left truncate" title={st.dest}>{st.dest}</td>
                            <td className="p-2.5 font-bold text-[#1e293b] w-1/3">{st.lifted}</td>
                         </tr>
                     ))}
                     {Array.from({length: Math.max(0, 5 - destStats.length)}).map((_, i) => (
                         <tr key={`empty-${i}`} className="border-b border-slate-100 table w-full table-fixed">
                            <td className="p-2.5 border-r border-slate-200 font-semibold text-slate-300 text-left">-</td>
                            <td className="p-2.5 font-bold text-slate-300 w-1/3">-</td>
                         </tr>
                     ))}
                     <tr className="bg-slate-50 border-t-2 border-slate-200 table w-full table-fixed mt-auto">
                        <td className="p-3 border-r border-slate-200 font-bold text-[#002060] text-left">Total</td>
                        <td className="p-3 font-bold text-green-600 w-1/3">{destStats.reduce((a,b)=>a+b.lifted,0)}</td>
                     </tr>
                  </tbody>
               </table>
               )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
               <div className="bg-[#002060] text-white p-2 px-4 text-xs font-bold tracking-wide uppercase text-center">PERFORMANCE SUMMARY</div>
               <div className="p-4 flex flex-col gap-4 text-sm font-bold flex-1 justify-center relative">
                   <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                       <span className="flex items-center gap-2 text-slate-600"><Target size={14} className="text-[#002060]"/> Monthly Target</span>
                       <span className="text-[#1e293b]">{totalMonthlyTarget.toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                       <span className="flex items-center gap-2 text-slate-600"><CarFront size={14} className="text-[#002060]"/> Monthly Lifted</span>
                       <span className="text-[#1e293b]">{totalMonthlyLifted.toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                       <span className="flex items-center gap-2 text-slate-600"><BarChart3 size={14} className="text-[#002060]"/> Achievement %</span>
                       <span className="text-green-600">{Math.round(overallAch)}%</span>
                   </div>
                   <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                       <span className="flex items-center gap-2 text-slate-600"><Hourglass size={14} className="text-red-500"/> Total Pending</span>
                       <span className="text-red-500">{overallPending.toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between items-center">
                       <span className="flex items-center gap-2 text-slate-600"><Clock size={14} className="text-[#002060]"/> Required Per Day</span>
                       <span className="text-[#1e293b]">{reqPerDay}</span>
                   </div>
                   <div className="flex justify-between items-center">
                       <span className="flex items-center gap-2 text-slate-600"><Clock size={14} className="text-[#002060]"/> Required Per Week</span>
                       <span className="text-[#1e293b]">{reqPerWeek}</span>
                   </div>
               </div>
            </div>

                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col lg:col-span-1">
                      <div className="bg-[#002060] text-white p-2 px-4 text-xs font-bold tracking-wide uppercase text-center relative border-b border-t-[3px] border-t-white">
                            PERFORMANCE HISTORY (MONTH WISE)
                      </div>
                      {histData.length === 0 ? (
                        <div className="flex items-center justify-center flex-1 p-6">
                          <p className="text-sm text-slate-500 font-medium">No historical data available</p>
                        </div>
                      ) : (
                      <div className="p-4 flex-grow" style={{ height: 300 }}>
                           <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={histData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }} maxBarSize={40}>
                                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0"/>
                                 <XAxis dataKey="monthStr" tickLine={false} axisLine={false} tick={{fontSize: 9, fill: '#64748b', fontWeight: 600}} dy={5}/>
                                 <YAxis width={40} tickLine={false} axisLine={false} tickFormatter={(val)=>val >= 1000 ? `${(val/1000).toFixed(0)}K` : val} tick={{fontSize: 9, fill: '#64748b'}} />
                                 <RechartsTooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                 <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: '10px', fontWeight: 600 }} iconType="square" />
                                 <Bar dataKey="Actual" name="Actual" fill="#16a34a" />
                                 <Bar dataKey="Target" name="Target" fill="#005689" />
                              </BarChart>
                           </ResponsiveContainer>
                      </div>
                      )}
                  </div>

            </div>

            {/* New Summary Tables Row */}
            <div className="mt-6 space-y-4">
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Rank Card */}
                  {rankCardData.length === 0 ? (
                    <div className="bg-slate-50 rounded-xl border-2 border-dashed border-slate-300 overflow-hidden flex flex-col">
                       <div className="bg-slate-100 text-slate-400 p-2 px-4 text-xs font-bold tracking-wide uppercase">RANK CARD</div>
                       <div className="p-6 flex items-center justify-center">
                          <span className="text-sm text-slate-400 font-medium">No ranking data available</span>
                       </div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                       <div className="bg-[#002060] text-white p-2 px-4 text-xs font-bold tracking-wide uppercase">RANK CARD</div>
                       <div className="p-3">
                          <table className="w-full text-sm">
                             <thead>
                                <tr className="bg-slate-50 text-[#002060]">
                                   <th className="p-2 text-left">S.No</th>
                                   <th className="p-2 text-left">Plant Name</th>
                                   <th className="p-2 text-left">Rank</th>
                                </tr>
                             </thead>
                             <tbody>
                                {rankCardData.slice(0, 10).map(r => (
                                   <tr key={r.plant} className="border-b">
                                      <td className="p-2">{r.sNo}</td>
                                      <td className="p-2 font-semibold">{r.plant}</td>
                                      <td className="p-2">{r.medal ? r.medal : `#${r.rank}`}</td>
                                   </tr>
                                ))}
                             </tbody>
                          </table>
                       </div>
                    </div>
                  )}

                  {/* Ranking Badge Format */}
                  {top3Branches.length === 0 ? (
                    <div className="bg-slate-50 rounded-xl border-2 border-dashed border-slate-300 overflow-hidden">
                       <div className="bg-slate-100 text-slate-400 p-2 px-4 text-xs font-bold tracking-wide uppercase">RANKING BADGE FORMAT (TOP 3 BRANCHES)</div>
                       <div className="p-6 text-center">
                          <span className="text-sm text-slate-400 font-medium">No branch ranking data available</span>
                       </div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                       <div className="bg-[#002060] text-white p-2 px-4 text-xs font-bold tracking-wide uppercase">RANKING BADGE FORMAT (TOP 3 BRANCHES)</div>
                       <div className="p-6 flex flex-wrap items-center justify-around gap-6">
                          {top3Branches.map((b, i) => (
                             <div key={b.branch} className="flex flex-col items-center justify-center gap-2 w-40">
                                <div className="text-5xl leading-none">{i===0? '🥇': i===1? '🥈': '🥉'}</div>
                                <div className="mt-1 font-bold text-center text-lg truncate">{b.branch}</div>
                                <div className="text-sm text-slate-500 text-center">Ach: {Math.round(b.achievement)}%</div>
                                <div className="text-sm text-[#002060] font-semibold">#{i+1}</div>
                             </div>
                          ))}
                       </div>
                    </div>
                  )}

                  {/* OEM Plant Score Card */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                     <div className="bg-[#002060] text-white p-2 px-4 text-xs font-bold tracking-wide uppercase">OEM PLANT SCORE CARD</div>
                     <div className="p-3 overflow-x-auto">
                        <table className="w-full text-sm">
                           <thead>
                              <tr className="bg-slate-50 text-[#002060]">
                                 <th className="p-2 text-left">Plant</th>
                                 <th className="p-2 text-right">Target</th>
                                 <th className="p-2 text-right">Lifted</th>
                                 <th className="p-2 text-right">Balance</th>
                                 <th className="p-2 text-right">Achievement %</th>
                              </tr>
                           </thead>
                           <tbody>
                              {oemPlantScore.map(p => (
                                 <tr key={p.plant} className="border-b hover:bg-slate-50">
                                    <td className="p-2 font-semibold">{p.plant}</td>
                                    <td className="p-2 text-right">{p.target.toLocaleString()}</td>
                                    <td className="p-2 text-right text-green-600">{p.actual.toLocaleString()}</td>
                                    <td className="p-2 text-right text-red-500">{p.balance.toLocaleString()}</td>
                                    <td className="p-2 text-right">{Math.round(p.achievement)}%</td>
                                 </tr>
                              ))}
                              {oemPlantScore.length === 0 && <tr><td colSpan={5} className="p-3 text-center text-slate-400">No data</td></tr>}
                           </tbody>
                        </table>
                     </div>
                  </div>
               </div>

               {/* Zone wise summary */}
               <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-[#002060] text-white p-2 px-4 text-xs font-bold tracking-wide uppercase">ZONE WISE SUMMARY</div>
                  <div className="p-3 overflow-x-auto">
                     <table className="w-full text-sm">
                        <thead>
                           <tr className="bg-slate-50 text-[#002060]"><th className="p-2 text-left">Zone</th><th className="p-2 text-right">Target</th><th className="p-2 text-right">Lifted</th><th className="p-2 text-right">Balance</th><th className="p-2 text-right">Achievement %</th></tr>
                        </thead>
                        <tbody>
                           {zoneSummary.map(z => (
                              <tr key={z.zone} className="border-b hover:bg-slate-50">
                                 <td className="p-2 font-semibold">{z.zone}</td>
                                 <td className="p-2 text-right">{z.target.toLocaleString()}</td>
                                 <td className="p-2 text-right text-green-600">{z.actual.toLocaleString()}</td>
                                 <td className="p-2 text-right text-red-500">{z.balance.toLocaleString()}</td>
                                 <td className="p-2 text-right">{Math.round(z.achievement)}%</td>
                              </tr>
                           ))}
                           {zoneSummary.length === 0 && <tr><td colSpan={5} className="p-3 text-center text-slate-400">No data</td></tr>}
                        </tbody>
                     </table>
                  </div>
               </div>

            </div>

         </div>
      </div>
   );
};
