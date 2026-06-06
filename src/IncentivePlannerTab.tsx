/* eslint-disable i18next/no-literal-string, security/detect-object-injection */
import React, { useMemo, useState } from 'react';
import { Plus, Edit2, Trash2, Download, Award } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
// BUG-01 FIX: Import XLSX directly instead of using window.XLSX (which is undefined)
import * as XLSX from 'xlsx';
import { useLocalStorage } from './useSyncedStorage';

interface IncentiveRow {
  id: string;
  oem?: string;
  year?: number;
  month?: string;
  plant: string;
  statecity: string;
  zone: string;
  target: number;
  lifted: number;
  manual?: boolean;
}

interface IncentivePlannerProps {
  incentiveOEM: string;
  incentiveYear: number;
  incentiveTimeframe: string;
  incentiveFilteredRows: any[];
  manualIncentiveRows: any[];
  setManualIncentiveRows: (rows: any[] | ((prev: any[]) => any[])) => void;
  incentiveEdits: Record<string, { target: number; lifted: number; potential?: number; startDate?: string; endDate?: string }>;
  setIncentiveEdits: (edits: Record<string, { target: number; lifted: number; potential?: number; startDate?: string; endDate?: string }> | ((prev: Record<string, { target: number; lifted: number; potential?: number; startDate?: string; endDate?: string }>) => Record<string, { target: number; lifted: number; potential?: number; startDate?: string; endDate?: string }>)) => void;
  incentiveRates: Record<string, number>;
  setIncentiveRates: (rates: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  /** Separate incentive-specific target store — keyed by `oem||year||month||recordId` */
  incentiveTargetStore: Record<string, number>;
  setIncentiveTargetStore: (store: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  columnVisibility: { showStateCity: boolean; showZone: boolean };
  canEditIncentives: boolean;
  customTableHeaders?: Record<string, string>;
  pieSummary?: any;
  incentiveScopeFilter?: 'All' | 'AO Zone Wise' | 'State Wise';
  incentiveBaseRows?: any[];
}

export const IncentivePlannerTab: React.FC<IncentivePlannerProps> = ({
  incentiveOEM,
  incentiveYear,
  incentiveTimeframe,
  incentiveFilteredRows,
  manualIncentiveRows,
  setManualIncentiveRows,
  incentiveEdits,
  setIncentiveEdits,
  incentiveRates,
  setIncentiveRates,
  incentiveTargetStore,
  setIncentiveTargetStore,
  columnVisibility,
  canEditIncentives,
  customTableHeaders = {},
  pieSummary,
  incentiveScopeFilter = 'All',
  incentiveBaseRows = [],
}) => {
  const [dataEntryMode, setDataEntryMode] = useState<'OEM SOB Data' | 'Manual Entry'>('OEM SOB Data');
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>(null);
  const [sortBy, setSortBy] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [autoCalculate, setAutoCalculate] = useState(true);

  // Date Range Tracker States
  const [trackerStartDate, setTrackerStartDate] = useLocalStorage<string>('incentive_tracker_start', '');
  const [trackerEndDate, setTrackerEndDate] = useLocalStorage<string>('incentive_tracker_end', '');

  // Dropdown options based on already saved data
  const editPlantOptions = useMemo(() => Array.from(new Set(incentiveBaseRows.map(r => r.plant))).filter(Boolean).sort(), [incentiveBaseRows]);
  
  const editStateOptions = useMemo(() => {
    if (!editFormData?.plant) return [];
    const allRows = [...incentiveBaseRows, ...manualIncentiveRows];
    return Array.from(new Set(allRows.filter(r => r.plant === editFormData.plant).map(r => r.statecity))).filter(Boolean).sort();
  }, [incentiveBaseRows, manualIncentiveRows, editFormData?.plant]);

  const editZoneOptions = useMemo(() => {
    const allRows = [...incentiveBaseRows, ...manualIncentiveRows];
    let base = allRows;
    if (editFormData?.statecity) {
      base = base.filter(r => r.statecity === editFormData.statecity);
    } else if (editFormData?.plant && incentiveScopeFilter !== 'AO Zone Wise') {
      base = base.filter(r => r.plant === editFormData.plant);
    }
    return Array.from(new Set(base.map(r => r.zone))).filter(Boolean).sort();
  }, [incentiveBaseRows, manualIncentiveRows, editFormData?.plant, editFormData?.statecity, incentiveScopeFilter]);

  const calculateBalance = (t = 0, l = 0) => Math.max(0, (t || 0) - (l || 0));

  const displayRows = useMemo(() => {
    let source = dataEntryMode === 'Manual Entry' ? manualIncentiveRows : incentiveFilteredRows.filter((r: any) => !r.manual);
    // Don't filter out by scope here for Manual Entry, we handle it in baseRows to allow subtotalling
    return source.map(r => {
      const edit = incentiveEdits[r.id];
      return edit ? { ...r, target: edit.target, lifted: edit.lifted, potential: edit.potential, startDate: edit.startDate, endDate: edit.endDate } : r;
    });
  }, [dataEntryMode, manualIncentiveRows, incentiveFilteredRows, incentiveEdits]);

  // When scope is 'AO Zone Wise', handle OEM subtotaling and Manual Entry subtotals vs direct totals
  const baseRows = useMemo(() => {
    if (incentiveScopeFilter === 'AO Zone Wise') {
      const map = new Map<string, any>();
      for (const r of displayRows) {
        const zoneKey = (r.zone || 'Unknown').toString();
        const plantKey = (r.plant || 'Unknown').toString();
        const groupKey = `${plantKey}__${zoneKey}`;
        const isDirectZone = dataEntryMode === 'Manual Entry' && r.scope === 'AO Zone Wise';
        
        if (!map.has(groupKey)) {
          map.set(groupKey, {
            id: isDirectZone ? r.id : `zone__${groupKey}`,
            oem: r.oem,
            plant: plantKey,
            statecity: '',
            zone: zoneKey,
            target: isDirectZone ? (Number(r.target) || 0) : 0,
            lifted: isDirectZone ? (Number(r.lifted) || 0) : 0,
            _children: [],
            _hasDirect: isDirectZone,
            ...(isDirectZone && r.manual ? { manual: true, scope: 'AO Zone Wise' } : {})
          });
        }
        
        const existing = map.get(groupKey);
        
        if (isDirectZone) {
          // If we found a direct zone entry, it overrides any subtotaling
          existing.id = r.id;
          existing.target = Number(r.target) || 0;
          existing.lifted = Number(r.lifted) || 0;
          existing.startDate = r.startDate || '';
          existing.endDate = r.endDate || '';
          existing._hasDirect = true;
          existing.manual = true;
          existing.scope = 'AO Zone Wise';
        } else if (!existing._hasDirect) {
          // Only subtotal if we haven't found a direct zone entry for this zone
          existing.target += Number(r.target) || 0;
          existing.lifted += Number(r.lifted) || 0;
          existing._children.push(r);
        }
      }

      const out: any[] = [];
      for (const [, v] of map) {
        if (v._hasDirect) {
          // Direct entry takes its own potential
          const bal = calculateBalance(v.target, v.lifted);
          const rate = incentiveRates[v.id] || 0;
          const directPotential = autoCalculate ? (bal * rate) : (typeof v.potential === 'number' ? v.potential : (bal * rate));
          out.push({ ...v, potential: directPotential, incentive: rate });
        } else {
          // Subtotal entry
          const zoneEdit = incentiveEdits[v.id];
          const effectiveTarget = zoneEdit ? zoneEdit.target : v.target;
          const effectiveLifted = zoneEdit ? zoneEdit.lifted : v.lifted;
          const effectiveStartDate = zoneEdit?.startDate ?? v.startDate ?? '';
          const effectiveEndDate = zoneEdit?.endDate ?? v.endDate ?? '';

          let aggPotential = 0;
          let totalRateTimesTarget = 0;
          for (const child of v._children) {
            const rate = incentiveRates[child.id] || 0;
            const balance = calculateBalance(child.target, child.lifted);
            aggPotential += rate * balance;
            totalRateTimesTarget += rate * (Number(child.target) || 0);
          }
          const weightedRate = effectiveTarget > 0 ? (totalRateTimesTarget / effectiveTarget) : 0;
          
          // Use explicitly typed zone rate if it exists, otherwise weighted
          const explicitZoneRate = incentiveRates[v.id];
          const finalRate = explicitZoneRate !== undefined ? explicitZoneRate : weightedRate;
          
          const zonePotential = autoCalculate
            ? Math.max(0, effectiveTarget - effectiveLifted) * finalRate
            : (zoneEdit && typeof zoneEdit.potential === 'number' ? zoneEdit.potential : aggPotential);
            
          out.push({ ...v, target: effectiveTarget, lifted: effectiveLifted, potential: zonePotential, incentive: finalRate, startDate: effectiveStartDate, endDate: effectiveEndDate });
        }
      }
      return out;
    }
    
    // For State Wise, only show State Wise entries in Manual Mode
    if (dataEntryMode === 'Manual Entry' && incentiveScopeFilter !== 'All') {
      return displayRows.filter(r => (r.scope || 'State Wise') === incentiveScopeFilter);
    }
    return displayRows;
  }, [displayRows, incentiveScopeFilter, dataEntryMode, incentiveRates, autoCalculate, incentiveEdits]);

  const getRowStatus = (target: number, lifted: number) => {
    if (target === 0 && lifted === 0) return { label: '-', class: 'text-slate-500 bg-slate-100 border-slate-200', val: -1 };
    if (lifted > target) {
      const extra = lifted - target;
      return { label: `+${extra} car${extra > 1 ? 's' : ''} more than target`, class: 'text-purple-700 bg-purple-100 border-purple-200', val: 4 };
    }
    if (lifted === target && target > 0) return { label: 'Excellent', class: 'text-green-700 bg-green-100 border-green-200', val: 3 };
    
    const liftedPct = target > 0 ? (lifted / target) : 0;
    if (liftedPct >= 0.8) return { label: 'Keep it up', class: 'text-blue-700 bg-blue-100 border-blue-200', val: 2 };
    
    const timeRemainingPct = totalDays > 0 ? (balanceDays / totalDays) : 1;
    const balanceTarget = Math.max(0, target - lifted);
    
    if (
      (liftedPct < 0.5 && timeRemainingPct < 0.5) || 
      (balanceDays > 0 && balanceDays < balanceTarget) || 
      (balanceDays <= 7 && lifted < target)
    ) {
      return { label: 'Need to focus', class: 'text-red-700 bg-red-100 border-red-200', val: 0 };
    }
    
    return { label: 'In Progress', class: 'text-amber-700 bg-amber-100 border-amber-200', val: 1 };
  };

  const getCellValue = (row: any, key: string) => {
    const target = Number(row.target) || 0;
    const lifted = Number(row.lifted) || 0;
    const rate = typeof row.incentive === 'number' ? row.incentive : (incentiveRates[row.id] || 0);

    if (key === 'balance') return calculateBalance(target, lifted);
    if (key === 'potential') return typeof row.potential === 'number' ? row.potential : rate * calculateBalance(target, lifted);
    if (key === 'incentive') return rate;
    if (key === 'status') return getRowStatus(target, lifted).val;
    if (key === 'targetIncentive') return Math.min(target, lifted) * rate;
    if (key === 'extraIncentive') return Math.max(0, lifted - target) * rate;
    if (key === 'totalIncentive') return (Math.min(target, lifted) * rate) + (Math.max(0, lifted - target) * rate);
    return row[key];
  };

  const sortedRows = useMemo(() => {
    const rows = [...baseRows];
    if (!sortBy) return rows;
    const { key, direction } = sortBy;
    rows.sort((a: any, b: any) => {
      const va = getCellValue(a, key);
      const vb = getCellValue(b, key);
      if (typeof va === 'number' && typeof vb === 'number') return direction === 'asc' ? va - vb : vb - va;
      return direction === 'asc' ? String(va ?? '').localeCompare(String(vb ?? '')) : String(vb ?? '').localeCompare(String(va ?? ''));
    });
    return rows;
  }, [baseRows, sortBy, incentiveRates, autoCalculate]);

  const getHeaders = () => {
    const headers = [
      { key: 'oem', label: 'OEM', visible: dataEntryMode === 'OEM SOB Data' },
      { key: 'plant', label: 'Plant', visible: true },
      { key: 'statecity', label: 'State Wise', visible: columnVisibility.showStateCity && incentiveScopeFilter !== 'AO Zone Wise' },
      { key: 'zone', label: 'AO Zone Wise', visible: columnVisibility.showZone },
      { key: 'target', label: customTableHeaders['Target'] || 'Target', visible: true },
      { key: 'lifted', label: customTableHeaders['Lifted'] || 'Lifted', visible: true },
      { key: 'balance', label: 'Balance', visible: true },
      { key: 'incentive', label: 'Incentive Rate', visible: true },
      { key: 'targetIncentive', label: 'Target Incentive', visible: true },
      { key: 'extraIncentive', label: 'Excess Incentive', visible: true },
      { key: 'totalIncentive', label: 'Total Earnings', visible: true },
      { key: 'potential', label: 'Potential Earnings', visible: true },
      { key: 'status', label: 'Status', visible: true },
    ];
    return headers.filter(h => h.visible);
  };

  const addManualRow = () => {
    if (!canEditIncentives) return;
    const newId = `manual_${Date.now()}`;
    const newRow: any = {
      id: newId,
      oem: incentiveOEM,
      year: incentiveYear,
      month: incentiveTimeframe,
      plant: '',
      statecity: '',
      zone: '',
      target: 0,
      lifted: 0,
      manual: true,
      scope: incentiveScopeFilter === 'All' ? 'State Wise' : incentiveScopeFilter,
    };
    setManualIncentiveRows(prev => ([...(prev || []), newRow]) as any);
    setIncentiveEdits(prev => ({ ...(prev || {}), [newId]: { target: 0, lifted: 0 } }) as Record<string, { target: number; lifted: number }>);
    startEdit(newRow);
  };

  const startEdit = (row: any) => {
    setEditingRowId(row.id);
    setEditFormData({ 
      ...row,
      target: row.target,
      lifted: row.lifted,
      incentive: row.incentive ?? incentiveRates[row.id] ?? 0
    });
  };

  const saveEdit = () => {
    if (!editingRowId || !editFormData) return;
    
    if (editFormData.manual) {
      if (!editFormData.plant) {
        alert("Please select a Plant.");
        return;
      }
      if (incentiveScopeFilter === 'AO Zone Wise' && !editFormData.zone) {
        alert("Please select an AO Zone.");
        return;
      }
      if (incentiveScopeFilter !== 'AO Zone Wise' && !editFormData.statecity) {
        alert("Please select a State Wise option.");
        return;
      }

      // Prevent duplicates
      const isDuplicate = manualIncentiveRows.some(r => 
        r.id !== editingRowId && 
        r.scope === editFormData.scope && 
        r.plant === editFormData.plant && 
        (editFormData.scope === 'AO Zone Wise' ? r.zone === editFormData.zone : r.statecity === editFormData.statecity)
      );

      if (isDuplicate) {
        alert(`An entry for ${editFormData.plant} - ${editFormData.scope === 'AO Zone Wise' ? editFormData.zone : editFormData.statecity} already exists. Please edit that row instead.`);
        return;
      }
      
      setManualIncentiveRows(prev => (prev || []).map((r: any) => r.id === editingRowId ? { ...r, ...editFormData } : r));
    } else {
      // OEM SOB Data
      const storeKey = `${editFormData.oem}||${editFormData.year}||${editFormData.month}||${editFormData.id}`;
      setIncentiveTargetStore(prev => ({ ...(prev || {}), [storeKey]: editFormData.target }));
      
      const bal = Math.max(0, editFormData.target - editFormData.lifted);
      const rate = editFormData.incentive;
      const newPotential = autoCalculate ? (bal * rate) : (incentiveEdits[editingRowId]?.potential ?? undefined);
      
      setIncentiveEdits(prev => ({
        ...(prev || {}),
        [editingRowId]: {
          ...(prev?.[editingRowId] || { target: editFormData.target, lifted: editFormData.lifted }),
          target: editFormData.target,
          lifted: editFormData.lifted,
          ...(newPotential !== undefined && { potential: newPotential })
        }
      }));
    }

    // Incentive rate is common
    setIncentiveRates(prev => ({ ...(prev || {}), [editingRowId]: editFormData.incentive }) as Record<string, number>);

    setEditingRowId(null);
    setEditFormData(null);
  };

  const deleteRow = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this row?")) return;
    
    const rowToDelete = manualIncentiveRows.find(r => r.id === id);
    if (rowToDelete && !rowToDelete.plant && !rowToDelete.zone && !rowToDelete.statecity) {
      // Clean up ALL corrupted empty rows
      setManualIncentiveRows(prev => (prev || []).filter(r => r.plant || r.zone || r.statecity));
    } else {
      setManualIncentiveRows(prev => (prev || []).filter(r => r.id !== id));
    }
    
    setIncentiveEdits(prev => { const n = { ...(prev || {}) }; delete n[id]; return n; });
    setIncentiveRates(prev => { const n = { ...(prev || {}) }; delete n[id]; return n; });
  };

  // Pie data
  const { achievementPie, earningsPie, achievementPercent, earningsPercent } = useMemo(() => {
    const totalTarget = sortedRows.reduce((s, r) => s + (Number(r.target) || 0), 0);
    const totalLifted = sortedRows.reduce((s, r) => s + (Number(r.lifted) || 0), 0);
    const totalEarnings = sortedRows.reduce((s, r) => {
      const rate = r.incentive ?? incentiveRates[r.id] ?? 0;
      return s + (rate * Math.min(Number(r.lifted) || 0, Number(r.target) || 0));
    }, 0);

    const totalIncentive = sortedRows.reduce((s, r) => {
      const rate = r.incentive ?? incentiveRates[r.id] ?? 0;
      return s + (rate * (Number(r.target) || 0));
    }, 0);

    const ach = [
      { name: 'Lifted', value: totalLifted },
      { name: 'Remaining', value: Math.max(0, totalTarget - totalLifted) },
    ];
    const earn = [
      { name: 'Earnings', value: totalEarnings },
      { name: 'Remaining', value: Math.max(0, totalIncentive - totalEarnings) },
    ];
    const achPct = totalTarget > 0 ? Math.round((totalLifted / totalTarget) * 100) : 0;
    const earnPct = totalIncentive > 0 ? Math.round((totalEarnings / totalIncentive) * 100) : 0;
    return { achievementPie: ach, earningsPie: earn, achievementPercent: achPct, earningsPercent: earnPct };
  }, [sortedRows, incentiveRates, pieSummary, autoCalculate]);

  const { totalDays, balanceDays, elapsedDays, daysPie, daysPercent } = useMemo(() => {
    if (!trackerStartDate || !trackerEndDate) return { totalDays: 0, balanceDays: 0, elapsedDays: 0, daysPie: [], daysPercent: 0 };
    const start = new Date(trackerStartDate);
    const end = new Date(trackerEndDate);
    const today = new Date();
    today.setHours(0,0,0,0);
    start.setHours(0,0,0,0);
    end.setHours(0,0,0,0);

    const msPerDay = 1000 * 60 * 60 * 24;
    const total = Math.max(0, Math.round((end.getTime() - start.getTime()) / msPerDay) + 1);
    
    let balance = 0;
    if (today < start) {
      balance = total;
    } else if (today > end) {
      balance = 0;
    } else {
      balance = Math.max(0, Math.round((end.getTime() - today.getTime()) / msPerDay) + 1);
    }
    
    const elapsed = Math.max(0, total - balance);
    const pie = [
      { name: 'Elapsed', value: elapsed },
      { name: 'Remaining', value: balance }
    ];
    
    const pct = total > 0 ? Math.round((elapsed / total) * 100) : 0;
    
    return { totalDays: total, balanceDays: balance, elapsedDays: elapsed, daysPie: pie, daysPercent: pct };
  }, [trackerStartDate, trackerEndDate]);

  const COLORS_ACH = ['#2563EB', '#E6EEF8'];
  const COLORS_EARN = ['#16A34A', '#E8F8EE'];
  const COLORS_DAYS = ['#8B5CF6', '#F3E8FF'];

  const exportToExcel = () => {
    try {
      const headers = getHeaders();
      const exportData = sortedRows.map(r => {
        const rowData: any = {};
        if (headers.find(h => h.key === 'oem')) rowData['OEM'] = r.oem;
        if (headers.find(h => h.key === 'plant')) rowData['Plant'] = r.plant;
        if (headers.find(h => h.key === 'statecity')) rowData['State/City'] = r.statecity;
        if (headers.find(h => h.key === 'zone')) rowData['Zone'] = r.zone;
        rowData['Target'] = r.target;
        rowData['Lifted'] = r.lifted;
        rowData['Balance'] = calculateBalance(r.target, r.lifted);
        rowData['Incentive Rate'] = getCellValue(r, 'incentive');
        rowData['Target Incentive'] = getCellValue(r, 'targetIncentive');
        rowData['Excess Incentive'] = getCellValue(r, 'extraIncentive');
        rowData['Total Earnings'] = getCellValue(r, 'totalIncentive');
        rowData['Potential Earnings'] = getCellValue(r, 'potential');
        rowData['Status'] = getRowStatus(r.target, r.lifted).label;
        return rowData;
      });

      if (sortedRows.length > 0) {
        // Calculate totals
        const totalTarget = sortedRows.reduce((s, r) => s + (Number(r.target) || 0), 0);
        const totalLifted = sortedRows.reduce((s, r) => s + (Number(r.lifted) || 0), 0);
        const totalBalance = Math.max(0, totalTarget - totalLifted);
        const totalRateAmount = sortedRows.reduce((s, r) => {
          const rate = typeof r.incentive === 'number' ? r.incentive : (incentiveRates[r.id] || 0);
          return s + (rate * Math.min(Number(r.lifted) || 0, Number(r.target) || 0));
        }, 0);
        const totalPotential = sortedRows.reduce((s, r) => s + (Number(getCellValue(r, 'potential')) || 0), 0);

        const totalRow: any = {};
        const firstKey = Object.keys(exportData[0])[0];
        if (firstKey) totalRow[firstKey] = 'GRAND TOTAL';
        
        totalRow['Target'] = totalTarget;
        totalRow['Lifted'] = totalLifted;
        totalRow['Balance'] = totalBalance;
        totalRow['Incentive Rate'] = totalRateAmount;
        totalRow['Target Incentive'] = sortedRows.reduce((s, r) => s + (Number(getCellValue(r, 'targetIncentive')) || 0), 0);
        totalRow['Excess Incentive'] = sortedRows.reduce((s, r) => s + (Number(getCellValue(r, 'extraIncentive')) || 0), 0);
        totalRow['Total Earnings'] = sortedRows.reduce((s, r) => s + (Number(getCellValue(r, 'totalIncentive')) || 0), 0);
        totalRow['Potential Earnings'] = totalPotential;
        
        // Push empty row for spacing then totals
        exportData.push({});
        exportData.push(totalRow);
      }

      const ws = XLSX.utils.json_to_sheet(exportData);
      
      // Auto-size columns slightly
      if (exportData.length > 0) {
        const columns = Object.keys(exportData[0]);
        ws['!cols'] = columns.map(k => ({ wch: Math.max(k.length + 5, 18) }));
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Report');
      XLSX.writeFile(wb, `incentive_report_${incentiveOEM}_${incentiveYear}.xlsx`);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6 print:m-0 print:p-0 print:space-y-6">
      <div className="hidden print:block text-2xl font-bold text-slate-900 text-center border-b pb-4 border-slate-200">
        Incentive Planner Report - {incentiveOEM} {incentiveYear}
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 print:border-none print:shadow-none print:p-0">
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Data Entry Method</h3>
            <div className="flex gap-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="radio" name="dataEntryMode" value="OEM SOB Data" checked={dataEntryMode === 'OEM SOB Data'} onChange={() => setDataEntryMode('OEM SOB Data')} className="w-5 h-5 accent-blue-600" />
                <span className="text-sm">OEM SOB Data</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="radio" name="dataEntryMode" value="Manual Entry" checked={dataEntryMode === 'Manual Entry'} onChange={() => setDataEntryMode('Manual Entry')} className="w-5 h-5 accent-blue-600" />
                <span className="text-sm">Manual Entry</span>
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {canEditIncentives && dataEntryMode === 'Manual Entry' && (
              <button 
                onClick={addManualRow} 
                disabled={!!editingRowId}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={14} /> Add Row
              </button>
            )}
            <button onClick={() => window.print()} disabled={sortedRows.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              <Download size={14} /> Export PDF
            </button>
            <button onClick={exportToExcel} disabled={sortedRows.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
              <Download size={14} /> Export Excel
            </button>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 print:grid-cols-3 gap-4 print:gap-2 print:mb-2 print:break-inside-avoid">
          <div className="bg-white rounded-lg p-3 print:p-1.5 shadow-sm print:shadow-none print:border print:border-slate-200 flex items-center gap-3 print:gap-1">
            <div className="shrink-0 print:scale-75 print:origin-left print:-mr-6">
              <PieChart width={100} height={100}>
                <Pie data={achievementPie} dataKey="value" nameKey="name" innerRadius={30} outerRadius={45} paddingAngle={2}>
                  {achievementPie.map((_: any, i: number) => <Cell key={i} fill={COLORS_ACH[i % COLORS_ACH.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </div>
            <div>
              <div className="text-sm print:text-[10px] font-medium">Achievement</div>
              <div className="text-2xl print:text-lg font-bold">{achievementPercent}%</div>
              <div className="text-xs print:text-[9px] text-slate-600 mt-1">Lifted: {(sortedRows.reduce((s, r) => s + (Number(r.lifted) || 0), 0) || 0).toLocaleString()} cars</div>
              <div className="text-xs print:text-[9px] text-slate-600">Total: {(sortedRows.reduce((s, r) => s + (Number(r.target) || 0), 0) || 0).toLocaleString()} cars</div>
            </div>
          </div>

          <div className="bg-white rounded-lg p-3 print:p-1.5 shadow-sm print:shadow-none print:border print:border-slate-200 flex items-center gap-3 print:gap-1">
            <div className="shrink-0 print:scale-75 print:origin-left print:-mr-6">
              <PieChart width={100} height={100}>
                <Pie data={earningsPie} dataKey="value" nameKey="name" innerRadius={30} outerRadius={45} paddingAngle={2}>
                  {earningsPie.map((_: any, i: number) => <Cell key={i} fill={COLORS_EARN[i % COLORS_EARN.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </div>
            <div>
              <div className="text-sm print:text-[10px] font-medium">Earnings</div>
              <div className="text-2xl print:text-lg font-bold">{earningsPercent}%</div>
              <div className="text-xs print:text-[9px] text-slate-600 mt-1">Earned: ₹{(sortedRows.reduce((s, r) => {
                const rate = r.incentive ?? incentiveRates[r.id] ?? 0;
                return s + (rate * Math.min(Number(r.lifted) || 0, Number(r.target) || 0));
              }, 0) || 0).toLocaleString()}</div>
              <div className="text-xs print:text-[9px] text-slate-600">Potential: ₹{(sortedRows.reduce((s, r) => s + (Number(getCellValue(r, 'potential')) || 0), 0) || 0).toLocaleString()}</div>
            </div>
          </div>

          <div className="bg-white rounded-lg p-3 print:p-1.5 shadow-sm print:shadow-none print:border print:border-slate-200 flex items-center gap-3 print:gap-1">
            <div className="shrink-0 print:scale-75 print:origin-left print:-mr-6">
              {totalDays > 0 ? (
                <PieChart width={100} height={100}>
                  <Pie data={daysPie} dataKey="value" nameKey="name" innerRadius={30} outerRadius={45} paddingAngle={2}>
                    {daysPie.map((_: any, i: number) => <Cell key={i} fill={COLORS_DAYS[i % COLORS_DAYS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              ) : (
                <div className="w-[100px] h-[100px] flex items-center justify-center text-[10px] text-slate-400 text-center px-2 border border-dashed border-slate-200 rounded-full bg-slate-50">Select dates</div>
              )}
            </div>
            
            <div className="flex-1 min-w-0 flex items-center justify-between gap-4 print:gap-2">
              <div className="flex flex-col">
                <span className="text-sm print:text-[10px] font-medium text-slate-700">Remaining</span>
                <span className="text-3xl print:text-lg font-bold text-purple-700 leading-none my-1 flex items-baseline gap-1">
                  {totalDays > 0 ? balanceDays : '-'}
                  {totalDays > 0 && <span className="text-lg print:text-[10px] font-medium text-purple-600/80">days</span>}
                </span>
                <span className="text-xs print:text-[9px] text-slate-500">Total days: {totalDays}</span>
              </div>

              <div className="flex flex-col gap-2 w-32 print:hidden">
                <input 
                  type="date" 
                  value={trackerStartDate} 
                  onChange={e => setTrackerStartDate(e.target.value)}
                  className="w-full border border-slate-300 p-1.5 rounded outline-none focus:border-purple-500 text-xs"
                  title="Start Date"
                />
                <input 
                  type="date" 
                  value={trackerEndDate} 
                  onChange={e => setTrackerEndDate(e.target.value)}
                  className="w-full border border-slate-300 p-1.5 rounded outline-none focus:border-purple-500 text-xs"
                  title="End Date"
                />
              </div>
              <div className="hidden print:flex flex-col gap-1 w-24">
                <div className="text-[9px] text-slate-500 border border-slate-200 rounded px-1 py-0.5 text-center bg-slate-50">{trackerStartDate || 'Start Date'}</div>
                <div className="text-[9px] text-slate-500 border border-slate-200 rounded px-1 py-0.5 text-center bg-slate-50">{trackerEndDate || 'End Date'}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto print:overflow-visible">
          {sortedRows.length === 0 ? (
            <div className="p-12 text-center print:hidden">
              <Award className="mx-auto text-slate-300 mb-4" size={48} />
              <h3 className="text-lg font-medium text-slate-900">No Data Available</h3>
            </div>
          ) : (
            <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-[1200px] print:min-w-0 print:text-[10px]">
              <thead className="bg-slate-50 print:bg-slate-100">
                <tr className="text-slate-900 text-xs uppercase tracking-wider border-b-2 border-slate-200 print:text-[9px]">
                  {getHeaders().map(h => (
                    <th key={h.key} onClick={() => setSortBy(prev => prev?.key === h.key ? { key: h.key, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { key: h.key, direction: 'asc' })} className="p-4 font-semibold border-r border-slate-200 cursor-pointer select-none print:p-2">
                      {h.label}
                    </th>
                  ))}
                  {canEditIncentives && <th className="p-4 font-semibold text-center print:hidden">Actions</th>}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {sortedRows.map((row) => {
                  const balance = calculateBalance(row.target, row.lifted);
                  const isEditing = editingRowId === row.id;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50 even:bg-slate-50/30 print:break-inside-avoid">
                      {dataEntryMode === 'OEM SOB Data' && <td className="p-4 text-sm font-medium text-slate-900 border-r border-slate-200 print:p-2">{row.oem}</td>}

                      <td className="p-4 text-sm font-medium text-slate-900 border-r border-slate-200 print:p-2">
                        {isEditing ? (
                          <select
                            value={editFormData?.plant ?? ''}
                            onChange={e => setEditFormData(prev => prev ? { ...prev, plant: e.target.value, statecity: '', zone: '' } : prev)}
                            className="w-full border border-slate-300 p-1.5 rounded outline-none focus:border-blue-500"
                          >
                            <option value="" disabled>Select Plant...</option>
                            {editPlantOptions.map(p => <option key={p as string} value={p as string}>{p as string}</option>)}
                          </select>
                        ) : row.plant}
                      </td>

                      {columnVisibility.showStateCity && incentiveScopeFilter !== 'AO Zone Wise' && (
                        <td className="p-4 text-sm text-slate-700 border-r border-slate-200 print:p-2">
                          {isEditing ? (
                            <select
                              value={editFormData?.statecity ?? ''}
                              onChange={e => setEditFormData(prev => prev ? { ...prev, statecity: e.target.value, zone: '' } : prev)}
                              className="w-full border border-slate-300 p-1.5 rounded outline-none focus:border-blue-500"
                              disabled={!editFormData?.plant}
                            >
                              <option value="" disabled>Select State Wise...</option>
                              {editStateOptions.map(s => <option key={s as string} value={s as string}>{s as string}</option>)}
                            </select>
                          ) : row.statecity}
                        </td>
                      )}

                      {columnVisibility.showZone && (
                        <td className="p-4 text-sm text-slate-700 border-r border-slate-200 print:p-2">
                          {isEditing ? (
                            <select
                              value={editFormData?.zone ?? ''}
                              onChange={e => setEditFormData(prev => prev ? { ...prev, zone: e.target.value } : prev)}
                              className="w-full border border-slate-300 p-1.5 rounded outline-none focus:border-blue-500"
                              disabled={!editFormData?.plant}
                            >
                              <option value="" disabled>Select AO Zone...</option>
                              {editZoneOptions.map(z => <option key={z as string} value={z as string}>{z as string}</option>)}
                            </select>
                          ) : row.zone}
                        </td>
                      )}

                      <td className="p-4 text-sm text-right border-r border-slate-200 bg-slate-50/50 print:p-2">
                        {canEditIncentives ? (
                          <>
                            <div className="flex flex-col items-end gap-0.5 print:hidden">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min={0}
                                  value={editFormData?.target ?? ''}
                                  title={row._hasIncentiveTarget ? 'Incentive-specific target (separate from SOB)' : 'SOB target — edit to set a separate incentive target'}
                                  onChange={e => setEditFormData(prev => prev ? { ...prev, target: parseInt(e.target.value) || 0 } : prev)}
                                  className="w-24 text-right border border-slate-300 p-1.5 rounded focus:border-blue-500 outline-none"
                                />
                              ) : (
                                <span>{row.target}</span>
                              )}
                              {row._hasIncentiveTarget && <span className="text-[10px] text-amber-600 font-semibold">incentive target</span>}
                            </div>
                            <div className="hidden print:flex flex-col items-end gap-0.5">
                              <span>{row.target}</span>
                              {row._hasIncentiveTarget && <span className="text-[10px] text-amber-600 font-semibold">incentive target</span>}
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-end gap-0.5">
                            <span>{row.target}</span>
                            {row._hasIncentiveTarget && <span className="text-[10px] text-amber-600 font-semibold">incentive target</span>}
                          </div>
                        )}
                      </td>

                      <td className="p-4 text-sm text-right border-r border-slate-200 bg-slate-50/50 print:p-2">
                        {canEditIncentives ? (
                          <>
                            <div className="flex flex-col items-end print:hidden">
                              {isEditing ? (
                                <input type="number" min={0} value={editFormData?.lifted ?? ''} onChange={e => setEditFormData(prev => prev ? { ...prev, lifted: parseInt(e.target.value) || 0 } : prev)} className="w-24 text-right border border-slate-300 p-1.5 rounded focus:border-blue-500 outline-none" />
                              ) : (
                                <span>{row.lifted}</span>
                              )}
                            </div>
                            <span className="hidden print:inline">{row.lifted}</span>
                          </>
                        ) : row.lifted}
                      </td>

                      <td className="p-4 text-sm text-right border-r border-slate-200 bg-slate-50/50 print:p-2">{balance.toLocaleString()}</td>

                      <td className="p-4 text-right border-r border-slate-200 bg-slate-50/50 print:p-2">
                        {canEditIncentives ? (
                          <>
                            <div className="flex flex-col items-end print:hidden">
                              {isEditing ? (
                                <input type="number" min={0} step="0.01" value={editFormData?.incentive ?? ''} onChange={e => setEditFormData(prev => prev ? { ...prev, incentive: parseFloat(e.target.value) || 0 } : prev)} className="w-24 text-right border border-slate-300 p-1.5 rounded focus:border-blue-500 outline-none" />
                              ) : (
                                <span className="text-sm font-medium">{Number(row.incentive ?? incentiveRates[row.id] ?? 0).toFixed(2)}</span>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="text-sm font-medium print:hidden">{Number(row.incentive ?? incentiveRates[row.id] ?? 0).toFixed(2)}</div>
                        )}
                        <div className="hidden print:block text-sm font-medium">{Number(row.incentive ?? incentiveRates[row.id] ?? 0).toFixed(2)}</div>
                      </td>

                      <td className="p-4 text-sm font-bold text-green-600 text-right border-r border-slate-200 print:p-2 bg-green-50/10">
                        ₹{(getCellValue(row, 'targetIncentive') || 0).toLocaleString()}
                      </td>

                      <td className="p-4 text-sm font-bold text-purple-600 text-right border-r border-slate-200 print:p-2 bg-purple-50/10">
                        ₹{(getCellValue(row, 'extraIncentive') || 0).toLocaleString()}
                      </td>

                      <td className="p-4 text-sm font-bold text-[#005689] text-right border-r border-slate-200 print:p-2 bg-blue-50/30">
                        ₹{(getCellValue(row, 'totalIncentive') || 0).toLocaleString()}
                      </td>

                      <td className="p-4 text-sm font-bold text-blue-600 text-right border-r border-slate-200 print:p-2">
                        ₹{(getCellValue(row, 'potential') || 0).toLocaleString()}
                      </td>

                      <td className="p-4 text-sm font-medium border-r border-slate-200 bg-slate-50/50 text-center print:p-2">
                        <div className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold border ${getRowStatus(row.target, row.lifted).class} whitespace-nowrap shadow-sm print:shadow-none print:border-none`}>
                          {getRowStatus(row.target, row.lifted).label}
                        </div>
                      </td>

                      {canEditIncentives && (
                        <td className="p-4 text-center border-r border-slate-200 print:hidden">
                          <div className="flex justify-center gap-2">
                            {isEditing ? (
                              <>
                                <button onClick={saveEdit} className="p-2 text-green-600 hover:bg-green-50 rounded" title="Save">Save</button>
                                <button onClick={() => { setEditingRowId(null); setEditFormData(null); }} className="p-2 text-gray-600 hover:bg-gray-100 rounded" title="Cancel">Cancel</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => startEdit(row)} className="p-2 text-blue-600 hover:bg-blue-50 rounded" title="Edit row"><Edit2 size={16} /></button>
                                {row.manual && (
                                  <button onClick={() => deleteRow(row.id)} className="p-2 text-red-600 hover:bg-red-50 rounded" title="Delete row"><Trash2 size={16} /></button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                <tr className="print:break-inside-avoid">
                  <td colSpan={getHeaders().findIndex(h => h.key === 'target')} className="p-4 text-right border-r border-slate-300 uppercase tracking-wider text-xs print:p-2">
                    Grand Total
                  </td>
                  <td className="p-4 text-right border-r border-slate-300 print:p-2">
                    {(sortedRows.reduce((s, r) => s + (Number(r.target) || 0), 0) || 0).toLocaleString()}
                  </td>
                  <td className="p-4 text-right border-r border-slate-300 print:p-2">
                    {(sortedRows.reduce((s, r) => s + (Number(r.lifted) || 0), 0) || 0).toLocaleString()}
                  </td>
                  <td className="p-4 text-right border-r border-slate-300 print:p-2">
                    {Math.max(0, sortedRows.reduce((s, r) => s + (Number(r.target) || 0), 0) - sortedRows.reduce((s, r) => s + (Number(r.lifted) || 0), 0)).toLocaleString()}
                  </td>
                  <td className="p-4 text-right border-r border-slate-300 text-green-700 print:p-2">
                    ₹{(sortedRows.reduce((s, r) => {
                      const rate = typeof r.incentive === 'number' ? r.incentive : (incentiveRates[r.id] || 0);
                      return s + (rate * Math.min(Number(r.lifted) || 0, Number(r.target) || 0));
                    }, 0) || 0).toLocaleString()}
                  </td>
                  <td className="p-4 text-right border-r border-slate-300 text-green-700 print:p-2 bg-green-50/10">
                    ₹{(sortedRows.reduce((s, r) => s + (Number(getCellValue(r, 'targetIncentive')) || 0), 0) || 0).toLocaleString()}
                  </td>
                  <td className="p-4 text-right border-r border-slate-300 text-purple-700 print:p-2 bg-purple-50/10">
                    ₹{(sortedRows.reduce((s, r) => s + (Number(getCellValue(r, 'extraIncentive')) || 0), 0) || 0).toLocaleString()}
                  </td>
                  <td className="p-4 text-right border-r border-slate-300 text-[#005689] print:p-2 bg-blue-50/30">
                    ₹{(sortedRows.reduce((s, r) => s + (Number(getCellValue(r, 'totalIncentive')) || 0), 0) || 0).toLocaleString()}
                  </td>
                  <td className="p-4 text-right border-r border-slate-300 text-blue-700 print:p-2">
                    ₹{(sortedRows.reduce((s, r) => s + (Number(getCellValue(r, 'potential')) || 0), 0) || 0).toLocaleString()}
                  </td>
                  <td className="p-4 border-r border-slate-300 print:p-2"></td>
                  {dataEntryMode === 'Manual Entry' && canEditIncentives && <td className="p-4 border-r border-slate-300 print:hidden"></td>}
                </tr>
              </tfoot>
            </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
