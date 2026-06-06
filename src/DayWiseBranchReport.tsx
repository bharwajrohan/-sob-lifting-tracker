import React, { useState, useMemo } from 'react';
import { Calendar, Target, CarFront, AlertCircle, BarChart3, Clock } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Cell, LabelList, ComposedChart } from 'recharts';
// BUG-06 FIX: Removed unused getDestinationZone import
import { INITIAL_MANAGE_BY_BRANCH_MAP } from './App';

interface DayWiseBranchReportProps {
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

export const DayWiseBranchReport: React.FC<DayWiseBranchReportProps> = ({
  data, allEntryLogs, years, months, currentYear, currentMonth, oems, masterPlants, oemPlantMap = {}
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [selectedOEM, setSelectedOEM] = useState<string>('All');
  const [selectedPlant, setSelectedPlant] = useState<string>('All');
  const [selectedZone, setSelectedZone] = useState<string>('All');
  const [selectedBranch, setSelectedBranch] = useState<string>('All');

  // Filter Branches based on current filters to populate dropdown
  const filteredDataForDropdowns = useMemo(() => {
    return data.filter(d => 
      (!d.month || d.month === selectedMonth) && 
      (!d.year || d.year.toString() === selectedYear) &&
      (selectedOEM === 'All' || d.oem === selectedOEM) &&
      (selectedPlant === 'All' || d.plant === selectedPlant)
    );
  }, [data, selectedMonth, selectedYear, selectedOEM, selectedPlant]);

  // OEM options — narrowed by Branch selection
  const oemOptions = useMemo(() => {
    let base = data.filter(d => (!d.month || d.month === selectedMonth) && (!d.year || d.year.toString() === selectedYear));
    if (selectedBranch !== 'All') base = base.filter(d => ((d as any).manageByBranch || INITIAL_MANAGE_BY_BRANCH_MAP[d.oem]?.[d.plant] || '').toUpperCase() === selectedBranch);
    return Array.from(new Set(base.map(d => d.oem).filter(Boolean))).sort();
  }, [data, selectedMonth, selectedYear, selectedBranch]);

  // Plant options — narrowed by OEM and Branch selections
  const plantOptions = useMemo(() => {
    let base = data.filter(d => (!d.month || d.month === selectedMonth) && (!d.year || d.year.toString() === selectedYear));
    if (selectedOEM !== 'All') base = base.filter(d => d.oem === selectedOEM);
    if (selectedBranch !== 'All') base = base.filter(d => ((d as any).manageByBranch || INITIAL_MANAGE_BY_BRANCH_MAP[d.oem]?.[d.plant] || '').toUpperCase() === selectedBranch);
    return Array.from(new Set(base.map(d => d.plant).filter(Boolean))).sort();
  }, [data, selectedMonth, selectedYear, selectedOEM, selectedBranch]);

  // Zone label helper — exact match only to prevent "Northeast" → "NORTH ZONE" bug
  const toZoneLabel = (z: string): string => {
    const upper = z.toUpperCase().trim();
    if (upper === 'NORTH') return 'NORTH ZONE';
    if (upper === 'SOUTH') return 'SOUTH ZONE';
    if (upper === 'EAST') return 'EAST ZONE';
    if (upper === 'WEST' || upper === 'WEST - MH' || upper === 'WEST - GJ') return 'WEST ZONE';
    return upper + ' ZONE';
  };

  const allZones = useMemo(() => Array.from(new Set(filteredDataForDropdowns.map(d => toZoneLabel(d.zone || "Unknown")))).filter(z => z !== 'UNKNOWN ZONE').sort(), [filteredDataForDropdowns]);

  const allBranches = useMemo(() => {
    const items = filteredDataForDropdowns
      .filter(d => {
        if (selectedZone !== 'All') return toZoneLabel(d.zone || "Unknown") === selectedZone;
        return true;
      })
      .filter(d => (d.statecity && d.statecity.toString().trim()) || (d.zone && d.zone.toString().trim()))
      .map(d => {
        const branch = (d as any).manageByBranch || INITIAL_MANAGE_BY_BRANCH_MAP[d.oem]?.[d.plant] || d.statecity || d.zone || 'Unknown';
        return branch.toUpperCase();
      });
    return Array.from(new Set(items)).filter(Boolean).sort();
  }, [filteredDataForDropdowns, selectedZone]);

  // If selected branch is not in options, default to ALL
  React.useEffect(() => {
    if (selectedBranch !== 'All' && !allBranches.includes(selectedBranch)) {
      setSelectedBranch('All');
    }
  }, [allBranches, selectedBranch]);

  // When Branch changes, auto-reset OEM/Plant if no longer valid
  React.useEffect(() => {
    if (selectedBranch === 'All') return;
    if (selectedOEM !== 'All' && !oemOptions.includes(selectedOEM)) setSelectedOEM('All');
    if (selectedPlant !== 'All' && !plantOptions.includes(selectedPlant)) setSelectedPlant('All');
  }, [selectedBranch]);

  // Compute Target Data with support for global (no statecity/zone) targets.
  const { totalMonthlyTarget, specificTargets, globalTargets } = useMemo(() => {
    const specific = filteredDataForDropdowns.filter(d => {
      const branch = (d as any).manageByBranch || INITIAL_MANAGE_BY_BRANCH_MAP[d.oem]?.[d.plant] || d.statecity || d.zone || 'Unknown';
      const zoneMatch = (selectedZone === 'All' || toZoneLabel(d.zone || "Unknown") === selectedZone);
      // treat records with no statecity/zone as global (not specific)
      const isGlobal = !(d.statecity && d.statecity.toString().trim()) && !(d.zone && d.zone.toString().trim());
      return zoneMatch && !isGlobal && (selectedBranch === 'All' || branch.toUpperCase() === selectedBranch);
    });

    const globals = filteredDataForDropdowns.filter(d => {
      return !(d.statecity && d.statecity.toString().trim()) && !(d.zone && d.zone.toString().trim());
    });

    // Sum specific targets
    const specificSum = specific.reduce((acc, d) => acc + (d.target || 0), 0);
    const globalSum = globals.reduce((acc, d) => acc + (d.target || 0), 0);

    return { totalMonthlyTarget: specificSum + globalSum, specificTargets: specific, globalTargets: globals };
  }, [filteredDataForDropdowns, selectedZone, selectedBranch]);

  // Compute Days
  const daysInMonth = new Date(parseInt(selectedYear), months.indexOf(selectedMonth) + 1, 0).getDate();
  const currentDate = new Date();
  const isCurrentMonth = currentDate.getFullYear() === parseInt(selectedYear) && months[currentDate.getMonth()] === selectedMonth;
  const currentDay = isCurrentMonth ? currentDate.getDate() : daysInMonth;
  
  // BUG-10 FIX: Use actual calendar days (same as computeRequirements in App.tsx) instead of
  // the inaccurate daysInMonth-4 approximation that was off for months with 5 Sundays.
  const totalWorkingDays = daysInMonth; // calendar days — consistent with BranchPerformanceTargetReport
  const passedWorkingDays = Math.max(1, currentDay);
  const remainingWorkingDays = Math.max(1, daysInMonth - currentDay + 1);

  // Determine branch-level monthly target. If a specific target exists for the selected branch
  // use it; otherwise allocate global (no-statecity/zone) targets proportionally based on lifts.
  const branchMonthlyTarget = useMemo(() => {
    if (selectedBranch === 'All') return totalMonthlyTarget;
    const specificSum = specificTargets.reduce((acc, d) => acc + (d.target || 0), 0);
    const globalSum = globalTargets.reduce((acc, d) => acc + (d.target || 0), 0);

    // If there's nothing global, return only specific
    if (!globalSum) return specificSum;

    // Compute lifted totals across branches for allocation
    const liftedByBranch: Record<string, number> = {};
    let totalLifted = 0;
    allEntryLogs.forEach(log => {
      if (log.year.toString() !== selectedYear) return;
      if (log.month !== selectedMonth) return;
      if (selectedOEM !== 'All' && log.oem !== selectedOEM) return;
      if (selectedPlant !== 'All' && log.plant !== selectedPlant) return;
      const branchName = (log.manageByBranch || INITIAL_MANAGE_BY_BRANCH_MAP[log.oem]?.[log.plant] || log.statecity || log.city || 'Unknown').toUpperCase();
      liftedByBranch[branchName] = (liftedByBranch[branchName] || 0) + (log.lifted || 0);
      totalLifted += (log.lifted || 0);
    });

    const selectedBranchUpper = selectedBranch.toUpperCase();
    const liftedForThis = liftedByBranch[selectedBranchUpper] || 0;

    let allocated = 0;
    if (totalLifted > 0) {
      allocated = Math.round(globalSum * (liftedForThis / totalLifted));
    } else {
      // fallback equal split among known branches
      const branchCount = Math.max(1, allBranches.length);
      allocated = Math.round(globalSum / branchCount);
    }

    return specificSum + allocated;
  }, [selectedBranch, totalMonthlyTarget, specificTargets, globalTargets, allEntryLogs, selectedYear, selectedMonth, selectedOEM, selectedPlant, allBranches]);

  const tPerDay = Math.ceil(branchMonthlyTarget / Math.max(1, daysInMonth));

  // Compute Lifting Logs
  const liftingLogs = useMemo(() => {
    return allEntryLogs.filter(log => {
      if (log.year.toString() !== selectedYear) return false;
      if (log.month !== selectedMonth) return false;
      if (selectedOEM !== 'All' && log.oem !== selectedOEM) return false;
      if (selectedPlant !== 'All' && log.plant !== selectedPlant) return false;
      
      const branch = log.manageByBranch || INITIAL_MANAGE_BY_BRANCH_MAP[log.oem]?.[log.plant] || log.statecity || log.city || 'Unknown';
      if (selectedBranch !== 'All' && branch.toUpperCase() !== selectedBranch) return false;
      
      if (selectedZone !== 'All') {
        const foundTarget = data.find(d => d.oem === log.oem && d.plant === log.plant && (d.statecity === log.statecity || d.zone === log.zone));
        if (toZoneLabel(((foundTarget || log).zone || "Unknown")) !== selectedZone) return false;
      }
      return true;
    });
  }, [allEntryLogs, selectedYear, selectedMonth, selectedOEM, selectedPlant, selectedBranch, selectedZone, data]);

  const dailyDataRows = useMemo(() => {
    const rows = [];
    let cumulativeTarget = 0;
    let cumulativeLifted = 0;

    for (let i = 1; i <= daysInMonth; i++) {
        // Date formats mapping "2025-05-01" or whatever format in log.date. 
        // We will match by exact date string if possible, or build it.
        const dStr = `${String(selectedYear)}-${String(months.indexOf(selectedMonth) + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        
        // Find logs for this date. (Assuming entry forms save `date` as YYYY-MM-DD or we can just parse)
        // Some systems save just day, or save YYYY-MM-DD. Let's try matching YYYY-MM-DD.
        const dayLogs = liftingLogs.filter(l => l.date === dStr);
        let liftedToday = dayLogs.reduce((acc, l) => acc + (l.lifted || 0), 0);
        
        // Let's add mock if no data but totalMonthlyTarget > 0 for visualization.
        // We shouldn't add mock if we have real forms, but since we may not have data yet,
        // IF we have no real data for the branch, we show 0.
        // Wait, the user wants it to look like the chart. Let's just use real data.
        
        cumulativeTarget += tPerDay;
        cumulativeLifted += liftedToday;

        const dailyAch = tPerDay > 0 ? (liftedToday / tPerDay) * 100 : (liftedToday > 0 ? 100 : 0);
        const mtdAch = cumulativeTarget > 0 ? (cumulativeLifted / cumulativeTarget) * 100 : (cumulativeLifted > 0 ? 100 : 0);

        rows.push({
            dateStr: `${i}-${selectedMonth.substring(0,3)}-${selectedYear}`,
            dayNum: i,
            dailyTarget: tPerDay,
            dailyLifted: liftedToday,
            // Positive = behind (shortfall), Negative = ahead (surplus)
            dailyBalance: tPerDay - liftedToday,
            chartBalance: Math.max(0, tPerDay - liftedToday),
            dailyAch: dailyAch,
            mtdTarget: cumulativeTarget,
            mtdLifted: cumulativeLifted,
            // Positive = behind, Negative = ahead
            mtdBalance: cumulativeTarget - cumulativeLifted,
            mtdAch: mtdAch,
        });
    }
    return rows;
  }, [daysInMonth, selectedYear, selectedMonth, liftingLogs, tPerDay]);

  const latestLifted = dailyDataRows[daysInMonth - 1]?.mtdLifted || 0;
  const balance = Math.max(0, branchMonthlyTarget - latestLifted);
  const overallAch = branchMonthlyTarget > 0 ? (latestLifted / branchMonthlyTarget) * 100 : 0;
  const reqPerDay = balance / remainingWorkingDays;

  // Chart Data only up to currentDay if current month, else all month
  const chartData = isCurrentMonth ? dailyDataRows.slice(0, currentDay) : dailyDataRows;

  // Totals for table footer
  const totalDailyTarget = chartData.reduce((acc, d) => acc + d.dailyTarget, 0);
  const totalDailyLifted = chartData.reduce((acc, d) => acc + d.dailyLifted, 0);
  const totalDailyBalance = chartData.reduce((acc, d) => acc + d.dailyBalance, 0);
  const avgDailyAch = totalDailyTarget > 0 ? (totalDailyLifted / totalDailyTarget) * 100 : 0;

  return (
    <div className="w-full bg-[#f8f9fa] min-h-screen pb-10">
      {/* Header */}
      <div className="bg-[#0b1b42] text-white p-4 flex justify-between items-center shadow-md">
        <h1 className="text-2xl font-bold tracking-wider">BRANCH WISE CARS LIFTING & BALANCE REPORT</h1>
        <div className="flex items-center gap-2 text-sm font-medium bg-[#1a2f63] px-3 py-1.5 rounded-md">
          <Calendar size={16} />
          <span>Date : {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/\//g, '-')}</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Top Filters */}
        <div className="flex flex-wrap gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
           <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 mb-1 uppercase">Month</label>
              <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none w-40">
                {months.map(m => (
                  <option key={m} value={m}>{m}-{selectedYear}</option>
                ))}
              </select>
           </div>
           
           <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 mb-1 uppercase">OEM</label>
              <select value={selectedOEM} onChange={e => {setSelectedOEM(e.target.value); setSelectedPlant('All');}} className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none w-40">
                <option value="All">All OEMs</option>
                {oemOptions.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
           </div>
           
           <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 mb-1 uppercase">Plant</label>
              <select value={selectedPlant} onChange={e => setSelectedPlant(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none w-40">
                <option value="All">All Plants</option>
                {plantOptions.map(p => (
                   <option key={p} value={p}>{p}</option>
                ))}
              </select>
           </div>

           <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 mb-1 uppercase">Zone</label>
              <select value={selectedZone} onChange={e => {setSelectedZone(e.target.value); setSelectedBranch('All');}} className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none w-40">
                <option value="All">All Zones</option>
                {allZones.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
           </div>

           <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 mb-1 uppercase">Branch / City</label>
              <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none w-40">
                <option value="All">All Branches</option>
                {allBranches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
           </div>
        </div>

        {/* Top Cards Section */}
        <div className="flex flex-col lg:flex-row gap-4">
            
            {/* Branch Details Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-w-[280px]">
                <div className="bg-[#0b1b42] text-white p-2 px-4 text-sm font-bold tracking-wide uppercase">Branch Details</div>
                <div className="p-4 flex flex-col gap-3 text-sm font-semibold text-slate-700">
                    <div className="grid grid-cols-2">
                        <span>Branch Name</span>
                        <span className="text-blue-700 uppercase">: {selectedBranch === 'All' ? 'ALL BRANCHES' : selectedBranch}</span>
                    </div>
                    <div className="grid grid-cols-2">
                        <span>Zone</span>
                        <span className="text-[#0b1b42] uppercase">: {selectedZone === 'All' ? 'ALL ZONES' : selectedZone}</span>
                    </div>
                    <div className="grid grid-cols-2">
                        <span>Plant / OEM</span>
                        <span className="text-[#0b1b42] uppercase">: {selectedPlant === 'All' ? 'ALL' : selectedPlant} / {selectedOEM === 'All' ? 'ALL' : selectedOEM}</span>
                    </div>
                    <div className="grid grid-cols-2">
                        <span>Report Date</span>
                        <span className="text-[#0b1b42] uppercase">: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/\//g, '-')}</span>
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-4">
                {/* Monthly Target */}
                <div className="bg-white border-t-4 border-t-blue-600 rounded-xl shadow-sm border border-slate-100 p-4 flex flex-col items-center justify-center relative min-h-[140px]">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center h-8 flex items-center gap-1"><Target size={14} className="text-blue-600"/> MONTHLY TARGET</span>
                  <div className="flex flex-col items-center">
                    <span className="text-[32px] leading-none text-[#0b1b42]">{totalMonthlyTarget.toLocaleString()}</span>
                  </div>
                  <span className="text-xs text-slate-400 mt-2 font-medium">Cars</span>
                </div>

                {/* Total Lifted */}
                <div className="bg-white border-t-4 border-t-green-500 rounded-xl shadow-sm border border-slate-100 p-4 flex flex-col items-center justify-center relative">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center h-8 flex items-center gap-1"><CarFront size={16} className="text-green-500"/> TOTAL LIFTED</span>
                  <div className="flex flex-col items-center">
                      <span className="text-[32px] leading-none text-green-600">{latestLifted.toLocaleString()}</span>
                  </div>
                  <span className="text-xs text-slate-400 mt-2 font-medium">Cars</span>
                </div>

                {/* Balance */}
                <div className="bg-white border-t-4 border-t-red-500 rounded-xl shadow-sm border border-slate-100 p-4 flex flex-col items-center justify-center relative">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center h-8 flex items-center gap-1"><AlertCircle size={16} className="text-red-500"/> BALANCE (PENDING)</span>
                  <div className="flex flex-col items-center">
                      <span className="text-[32px] leading-none text-red-600">{balance.toLocaleString()}</span>
                  </div>
                  <span className="text-xs text-slate-400 mt-2 font-medium">Cars</span>
                </div>

                {/* Achievement */}
                <div className="bg-white border-t-4 border-t-[#0b1b42] rounded-xl shadow-sm border border-slate-100 p-4 flex flex-col items-center justify-center relative">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center h-8 flex items-center gap-1"><BarChart3 size={16} className="text-[#0b1b42]"/> ACHIEVEMENT %</span>
                  <div className="flex flex-col items-center">
                      <span className="text-[32px] leading-none text-[#0f4a8e]">{Math.round(overallAch)}%</span>
                  </div>
                  <span className="text-xs text-slate-400 mt-2 font-medium invisible">_</span>
                </div>

                {/* Required Per Day */}
                <div className="bg-white border-t-4 border-t-slate-400 rounded-xl shadow-sm border border-slate-100 p-4 flex flex-col items-center justify-center relative">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center h-8 flex justify-center"><Clock size={16} className="text-slate-500 mr-1"/> REQUIRED PER DAY</span>
                  <div className="flex flex-col items-center">
                      <span className="text-[32px] leading-none text-[#0b1b42]">{Math.ceil(reqPerDay).toLocaleString()}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-2 font-medium tracking-tight h-4 text-center">(For Remaining Days)</span>
                </div>
            </div>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="bg-[#0b1b42] text-white p-2 px-4 text-sm font-bold tracking-wide uppercase text-center">DAILY CARS LIFTING & BALANCE DETAILS</div>
             <div className="overflow-x-auto max-h-[500px]">
                 <table className="w-full text-sm text-center border-collapse">
                   <thead className="sticky top-0 bg-white z-10 shadow-sm border-b border-slate-200">
                     <tr className="bg-slate-100 text-[#0b1b42] font-bold text-[11px] uppercase tracking-wider">
                       <th rowSpan={2} className="py-3 px-2 border-r border-slate-200 bg-slate-50 w-28">Date</th>
                       <th rowSpan={2} className="py-3 px-2 border-r border-slate-200 text-[#0f4a8e]">Daily Target<br />(Cars)</th>
                       <th rowSpan={2} className="py-3 px-2 border-r border-slate-200 font-bold">Cars Lifted<br />(Cars)</th>
                       <th rowSpan={2} className="py-3 px-2 border-r border-slate-200 font-bold">Balance<br />(Cars)</th>
                       <th rowSpan={2} className="py-3 px-2 border-r border-slate-200">Achievement %</th>
                       <th colSpan={4} className="py-2 px-2 border-b border-slate-200 bg-slate-50 text-[#0f4a8e]">MONTH TO DATE (TILL DATE)</th>
                     </tr>
                     <tr className="bg-slate-50 text-[11px] text-[#0b1b42] font-semibold border-b border-slate-200">
                       <th className="py-2 px-2 border-r border-slate-200">Target (Cars)</th>
                       <th className="py-2 px-2 border-r border-slate-200">Lifted (Cars)</th>
                       <th className="py-2 px-2 border-r border-slate-200">Balance (Cars)</th>
                       <th className="py-2 px-2">Achievement %</th>
                     </tr>
                   </thead>
                   <tbody>
                     {chartData.map((row) => (
                       <tr key={row.dateStr} className="border-b border-slate-100 hover:bg-slate-50 font-medium">
                         <td className="py-2 px-2 text-[#475569] font-semibold bg-slate-50/50 border-r border-slate-200">{row.dateStr}</td>
                         <td className="py-2 px-2 text-[#0b1b42] border-r border-slate-200">{row.dailyTarget.toLocaleString()}</td>
                         {/* Cars Lifted — green if met/exceeded target */}
                         <td className={`py-2 px-2 font-bold border-r border-slate-200 ${row.dailyLifted >= row.dailyTarget ? 'text-green-600' : 'text-red-500'}`}>
                           {row.dailyLifted.toLocaleString()}
                         </td>
                         {/* Daily Balance: negative value = surplus (ahead) → green with + prefix
                                           positive value = shortfall (behind) → red with - prefix */}
                         <td className={`py-2 px-2 font-bold border-r border-slate-200 ${row.dailyBalance <= 0 ? 'text-green-600' : 'text-red-500'}`}>
                           {row.dailyBalance < 0
                             ? `+${Math.abs(row.dailyBalance).toLocaleString()}`
                             : row.dailyBalance > 0
                               ? `-${row.dailyBalance.toLocaleString()}`
                               : '0'}
                         </td>
                         {/* Achievement % — integer */}
                         <td className={`py-2 px-2 font-bold border-r border-slate-200 ${row.dailyAch >= 100 ? 'text-green-600' : 'text-red-500'}`}>
                           {Math.round(row.dailyAch)}%
                         </td>

                         <td className="py-2 px-2 text-[#0b1b42] font-bold border-r border-slate-200 bg-slate-50/50">{row.mtdTarget.toLocaleString()}</td>
                         <td className={`py-2 px-2 font-bold border-r border-slate-200 bg-slate-50/50 ${row.mtdLifted >= row.mtdTarget ? 'text-green-600' : 'text-red-500'}`}>
                           {row.mtdLifted.toLocaleString()}
                         </td>
                         {/* MTD Balance: negative = surplus → green with +, positive = shortfall → red with - */}
                         <td className={`py-2 px-2 font-bold border-r border-slate-200 bg-slate-50/50 ${row.mtdBalance <= 0 ? 'text-green-600' : 'text-red-500'}`}>
                           {row.mtdBalance < 0
                             ? `+${Math.abs(row.mtdBalance).toLocaleString()}`
                             : row.mtdBalance > 0
                               ? `-${row.mtdBalance.toLocaleString()}`
                               : '0'}
                         </td>
                         {/* MTD Achievement % — integer */}
                         <td className={`py-2 px-2 font-bold bg-slate-50/50 ${row.mtdAch >= 100 ? 'text-green-600' : 'text-red-500'}`}>
                           {Math.round(row.mtdAch)}%
                         </td>
                       </tr>
                     ))}
                     <tr className="bg-slate-100 font-bold text-[12px] uppercase tracking-wide border-t-2 border-slate-300">
                       <td className="py-3 px-2 text-[#0f4a8e] border-r border-slate-200">TOTAL / AVG</td>
                       <td className="py-3 px-2 text-[#0f4a8e] border-r border-slate-200">{totalDailyTarget.toLocaleString()}</td>
                       <td className="py-3 px-2 text-[#0f4a8e] border-r border-slate-200">{totalDailyLifted.toLocaleString()}</td>
                       {/* Total balance: negative = net surplus, positive = net shortfall */}
                       <td className={`py-3 px-2 border-r border-slate-200 ${totalDailyBalance <= 0 ? 'text-green-600' : 'text-red-500'}`}>
                         {totalDailyBalance < 0
                           ? `+${Math.abs(totalDailyBalance).toLocaleString()}`
                           : totalDailyBalance > 0
                             ? `-${totalDailyBalance.toLocaleString()}`
                             : '0'}
                       </td>
                       <td className={`py-3 px-2 border-r border-slate-200 ${avgDailyAch >= 100 ? 'text-green-600' : 'text-red-500'}`}>{Math.round(avgDailyAch)}%</td>
                       
                       <td className="py-3 px-2 text-[#0f4a8e] border-r border-slate-200"></td>
                       <td className="py-3 px-2 text-[#0f4a8e] border-r border-slate-200"></td>
                       <td className="py-3 px-2 border-r border-slate-200"></td>
                       <td className="py-3 px-2"></td>
                     </tr>
                   </tbody>
                 </table>
             </div>
        </div>

        {/* Bottom Section */}
        <div className="flex flex-col lg:flex-row gap-4">
            
            {/* Monthly Summary Left */}
            <div className="w-full lg:w-[350px] bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
               <div className="bg-[#0f4a8e] text-white p-2 px-4 text-xs font-bold tracking-wide uppercase text-center border-b border-t-[3px] border-t-white">MONTHLY SUMMARY</div>
               <table className="w-full text-sm font-semibold text-[#0b1b42] text-left">
                  <thead>
                     <tr className="border-b border-slate-200 text-[#0f4a8e]">
                        <th className="p-3 bg-slate-50 border-r border-slate-200 text-[11px] uppercase">Particulars</th>
                        <th className="p-3 bg-slate-50 text-[11px] uppercase text-center">Cars</th>
                     </tr>
                  </thead>
                  <tbody>
                     <tr className="border-b border-slate-100">
                        <td className="p-3 border-r border-slate-200">Monthly Target</td>
                        <td className="p-3 text-[#0f4a8e] font-black text-center">{totalMonthlyTarget.toLocaleString()}</td>
                     </tr>
                     <tr className="border-b border-slate-100">
                        <td className="p-3 border-r border-slate-200">Total Lifted (Till Date)</td>
                        <td className="p-3 text-green-600 font-black text-center">{latestLifted.toLocaleString()}</td>
                     </tr>
                     <tr className="border-b border-slate-100">
                        <td className="p-3 border-r border-slate-200">Balance (Pending)</td>
                        <td className="p-3 text-red-500 font-black text-center">{balance.toLocaleString()}</td>
                     </tr>
                     <tr className="border-b border-slate-100">
                        <td className="p-3 border-r border-slate-200">Achievement %</td>
                        <td className="p-3 text-[#0f4a8e] font-black text-center">{Math.round(overallAch)}%</td>
                     </tr>
                     <tr className="border-b border-slate-100">
                        <td className="p-3 border-r border-slate-200">Working Days in Month</td>
                        <td className="p-3 text-[#0b1b42] font-black text-center">{totalWorkingDays}</td>
                     </tr>
                     <tr className="border-b border-slate-100">
                        <td className="p-3 border-r border-slate-200">Days Completed</td>
                        <td className="p-3 text-[#0b1b42] font-black text-center">{passedWorkingDays}</td>
                     </tr>
                     <tr className="border-b border-slate-100">
                        <td className="p-3 border-r border-slate-200">Days Remaining</td>
                        <td className="p-3 text-[#0b1b42] font-black text-center">{remainingWorkingDays}</td>
                     </tr>
                     <tr>
                        <td className="p-3 border-r border-slate-200">Required Per Day (Balance / Days)</td>
                        <td className="p-3 text-[#0f4a8e] font-black text-center">{Math.ceil(reqPerDay).toLocaleString()}</td>
                     </tr>
                  </tbody>
               </table>
            </div>

            {/* Daily Trend Chart Right */}
            <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
               <div className="bg-[#0f4a8e] text-white p-2 px-4 text-xs font-bold tracking-wide uppercase text-center border-b border-t-[3px] border-t-white">DAILY CARS LIFTED VS BALANCE TREND</div>
               <div className="p-4 flex-1" style={{ height: 320 }}>
                 <ResponsiveContainer width="100%" height="100%">
                   <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                     <XAxis dataKey="dateStr" axisLine={false} tickLine={false} tickFormatter={(val) => val.split('-').slice(0,2).join('-')} tick={{ fontSize: 10, fill: '#1e293b', fontWeight: 600 }} dy={10} minTickGap={10}/>
                     <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} 
                            label={{ value: 'Cars', angle: -90, position: 'insideLeft', offset: 0, style: { fontSize: 10, fill: '#64748b' } }}/>
                     <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} 
                            label={{ value: 'Balance (Cars)', angle: 90, position: 'insideRight', offset: 0, style: { fontSize: 10, fill: '#64748b' } }}/>
                     <RechartsTooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                     
                     <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 600, paddingTop: '10px' }} iconType="square" />
                     
                     <Bar yAxisId="left" dataKey="dailyTarget" name="Daily Target" fill="#0f4a8e" barSize={25} />
                     <Bar yAxisId="left" dataKey="dailyLifted" name="Cars Lifted" barSize={25}>
                       {chartData.map((entry, index) => (
                         <Cell key={`cell-${index}`} fill={entry.dailyLifted >= entry.dailyTarget ? '#2e8b57' : '#d32f2f'} />
                       ))}
                       <LabelList dataKey="dailyLifted" position="top" style={{ fontSize: '10px', fill: '#1e293b', fontWeight: 600 }} formatter={(v: any) => typeof v === 'number' ? v.toLocaleString() : v} />
                     </Bar>
                     
                     <Line yAxisId="right" type="linear" dataKey="chartBalance" name="Balance" stroke="#d32f2f" strokeWidth={3} dot={{ r: 5, strokeWidth: 2, fill: '#d32f2f', stroke: 'white' }}>
                       <LabelList dataKey="chartBalance" position="top" offset={10} style={{ fontSize: '11px', fill: '#d32f2f', fontWeight: 700 }} formatter={(v: any) => typeof v === 'number' ? v.toLocaleString() : v} />
                     </Line>
                   </ComposedChart>
                 </ResponsiveContainer>
               </div>
            </div>

        </div>
      </div>
    </div>
  );
};
