const fs = require('fs');

const originalContent = `/* eslint-disable */
import React, { useMemo, useState } from 'react';
import { Plus, Edit2, Trash2, Download, Award } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
// BUG-01 FIX: Import XLSX directly instead of using window.XLSX (which is undefined)
import * as XLSX from 'xlsx';

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
  incentiveEdits: Record<string, { target: number; lifted: number; potential?: number }>;
  setIncentiveEdits: (edits: Record<string, { target: number; lifted: number; potential?: number }> | ((prev: Record<string, { target: number; lifted: number; potential?: number }>) => Record<string, { target: number; lifted: number; potential?: number }>)) => void;
  incentiveRates: Record<string, number>;
  setIncentiveRates: (rates: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  /** Separate incentive-specific target store — keyed by \`oem||year||month||recordId\` */
  incentiveTargetStore: Record<string, number>;
  setIncentiveTargetStore: (store: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  columnVisibility: { showStateCity: boolean; showZone: boolean };
  canEditIncentives: boolean;
  customTableHeaders?: Record<string, string>;
  pieSummary?: any;
  incentiveScopeFilter?: 'All' | 'Zone' | 'State/City';
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
}) => {
  const t = (s: string) => s;
  const getProp = (obj: any, key: string | number) => obj ? Reflect.get(obj, key) : undefined;
  const [dataEntryMode, setDataEntryMode] = useState<'OEM SOB Data' | 'Manual Entry'>('OEM SOB Data');
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<IncentiveRow> | null>(null);
  const [sortBy, setSortBy] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [autoCalculate, setAutoCalculate] = useState<boolean>(true);

  const calculateBalance = (t = 0, l = 0) => Math.max(0, (t || 0) - (l || 0));

  const displayRows = useMemo(() => {
    const source = dataEntryMode === 'Manual Entry' ? manualIncentiveRows : incentiveFilteredRows;
    return source.map(r => {
      const edit = getProp(incentiveEdits, r.id);
      return edit ? { ...r, target: edit.target, lifted: edit.lifted, potential: edit.potential } : r;
    });
  }, [dataEntryMode, manualIncentiveRows, incentiveFilteredRows, incentiveEdits]);

  // When scope is 'Zone', aggregate displayRows by zone so each zone appears once
  const baseRows = useMemo(() => {
    if (incentiveScopeFilter === 'Zone') {
      const map = new Map<string, any>();
      for (const r of displayRows) {
        const zoneKey = (r.zone || 'Unknown').toString();
        const existing = map.get(zoneKey) || {
          id: \`zone__\${zoneKey}\`,
          oem: r.oem,
          plant: r.plant || '',
          statecity: '',
          zone: zoneKey,
          target: 0,
          lifted: 0,
          _children: [],
        };
        existing.target += Number(r.target) || 0;
        existing.lifted += Number(r.lifted) || 0;
        existing._children.push(r);
        map.set(zoneKey, existing);
      }

      // compute aggregated incentive/potential fields using incentiveRates per child
      const out: any[] = [];
      for (const [, v] of map) {
        // Apply any zone-level edits
        const zoneEdit = getProp(incentiveEdits, v.id);
        const effectiveTarget = zoneEdit ? zoneEdit.target : v.target;
        const effectiveLifted = zoneEdit ? zoneEdit.lifted : v.lifted;

        let aggPotential = 0;
        let totalRateTimesTarget = 0;
        for (const child of v._children) {
          const rate = getProp(incentiveRates, child.id) || 0;
          const balance = calculateBalance(child.target, child.lifted);
          aggPotential += rate * balance;
          totalRateTimesTarget += rate * (Number(child.target) || 0);
        }
        const weightedRate = effectiveTarget > 0 ? (totalRateTimesTarget / effectiveTarget) : 0;
        // When autoCalculate is true, always use zone-level effective values with weighted rate
        const zonePotential = autoCalculate
          ? Math.max(0, effectiveTarget - effectiveLifted) * weightedRate
          : (zoneEdit && typeof zoneEdit.potential === 'number' ? zoneEdit.potential : aggPotential);
        out.push({ ...v, target: effectiveTarget, lifted: effectiveLifted, potential: zonePotential, incentive: weightedRate });
      }
      return out;
    }
    return displayRows;
  }, [displayRows, incentiveScopeFilter, incentiveRates, autoCalculate]);

  const getCellValue = (row: any, key: string) => {
    if (key === 'balance') return calculateBalance(row.target, row.lifted);
    if (key === 'potential') {
      // When auto-calculate is on, always derive fresh from rate × balance so typing
      // a rate instantly updates the Potential Earnings column and the charts.
      if (autoCalculate) return (getProp(incentiveRates, row.id) ?? row.incentive ?? 0) * calculateBalance(row.target, row.lifted);
      return typeof row.potential === 'number' ? row.potential : (getProp(incentiveRates, row.id) ?? row.incentive ?? 0) * calculateBalance(row.target, row.lifted);
    }
    if (key === 'incentive') return getProp(incentiveRates, row.id) ?? row.incentive ?? 0;
    return getProp(row, key);
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
      { key: 'statecity', label: 'State/City', visible: columnVisibility.showStateCity && incentiveScopeFilter !== 'Zone' },
      { key: 'zone', label: 'Zone', visible: columnVisibility.showZone },
      { key: 'target', label: customTableHeaders['Target'] || 'Target', visible: true },
      { key: 'lifted', label: customTableHeaders['Lifted'] || 'Lifted', visible: true },
      { key: 'balance', label: 'Balance', visible: true },
      { key: 'incentive', label: 'Incentive Rate', visible: true },
      { key: 'potential', label: 'Potential Earnings', visible: true },
    ];
    return headers.filter(h => h.visible);
  };

  const addManualRow = () => {
    if (!canEditIncentives) return;
    const newId = \`manual_\${Date.now()}\`;
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
    };
    setManualIncentiveRows(prev => ([...(prev || []), newRow]) as any);
    setIncentiveEdits(prev => ({ ...(prev || {}), [newId]: { target: 0, lifted: 0 } }) as Record<string, { target: number; lifted: number }>);
  };

  const startEdit = (row: any) => {
    setEditingRowId(row.id);
    setEditFormData({ ...row });
  };

  const saveEdit = () => {
    if (!editingRowId || !editFormData) return;
    setManualIncentiveRows(prev => (prev || []).map((r: any) => r.id === editingRowId ? { ...r, ...editFormData } : r));
    setEditingRowId(null);
    setEditFormData(null);
  };

  const deleteRow = (id: string) => {
    setManualIncentiveRows(prev => (prev || []).filter(r => r.id !== id));
    setIncentiveEdits(prev => { const n = { ...(prev || {}) }; Reflect.deleteProperty(n, id); return n; });
    setIncentiveRates(prev => { const n = { ...(prev || {}) }; Reflect.deleteProperty(n, id); return n; });
  };

  // Pie data
  const { achievementPie, earningsPie, achievementPercent, earningsPercent } = useMemo(() => {
    const totalTarget = sortedRows.reduce((s, r) => s + (Number(r.target) || 0), 0);
    const totalLifted = sortedRows.reduce((s, r) => s + (Number(r.lifted) || 0), 0);
    const totalPotential = sortedRows.reduce((s, r) => s + (Number(getCellValue(r, 'potential')) || 0), 0);
    // compute earnings carefully: if row has children, sum child earnings; otherwise use row-level rate
    const totalEarnings = sortedRows.reduce((s, r) => {
      if (r._children && Array.isArray(r._children)) {
        return s + r._children.reduce((cs: number, c: any) => {
          const rate = getProp(incentiveRates, c.id) ?? c.incentive ?? 0;
          return cs + (rate * Math.min(Number(c.lifted) || 0, Number(c.target) || 0));
        }, 0);
      }
      const rate = getProp(incentiveRates, r.id) ?? r.incentive ?? 0;
      return s + (rate * Math.min(Number(r.lifted) || 0, Number(r.target) || 0));
    }, 0);

    // total incentive (rate * target) across rows (or children)
    const totalIncentive = sortedRows.reduce((s, r) => {
      if (r._children && Array.isArray(r._children)) {
        return s + r._children.reduce((cs: number, c: any) => {
          const rate = getProp(incentiveRates, c.id) ?? c.incentive ?? 0;
          return cs + (rate * (Number(c.target) || 0));
        }, 0);
      }
      const rate = getProp(incentiveRates, r.id) ?? r.incentive ?? 0;
      return s + (rate * (Number(r.target) || 0));
    }, 0);

    const ach = pieSummary?.achievementPie ?? [
      { name: 'Lifted', value: totalLifted },
      { name: 'Remaining', value: Math.max(0, totalTarget - totalLifted) },
    ];
    const earn = pieSummary?.earningsPie ?? [
      { name: 'Earnings', value: totalEarnings },
      { name: 'Remaining', value: Math.max(0, totalIncentive - totalEarnings) },
    ];
    const achPct = totalTarget > 0 ? Math.round((totalLifted / totalTarget) * 100) : 0;
    const earnPct = totalIncentive > 0 ? Math.round((totalEarnings / totalIncentive) * 100) : 0;
    return { achievementPie: ach, earningsPie: earn, achievementPercent: achPct, earningsPercent: earnPct };
  }, [sortedRows, incentiveRates, pieSummary, autoCalculate]);

  const COLORS_ACH = ['#2563EB', '#E6EEF8'];
  const COLORS_EARN = ['#16A34A', '#E8F8EE'];

  const exportToExcel = () => {
    try {
      const exportData = sortedRows.map(r => ({
        OEM: r.oem,
        Plant: r.plant,
        StateCity: r.statecity,
        Zone: r.zone,
        Target: r.target,
        Lifted: r.lifted,
        Balance: calculateBalance(r.target, r.lifted),
        Rate: getCellValue(r, 'incentive'),
        Potential: getCellValue(r, 'potential'),
      }));
      // BUG-01 FIX: Use imported XLSX directly, not window.XLSX
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Report');
      XLSX.writeFile(wb, \`incentive_report_\${incentiveOEM}_\${incentiveYear}.xlsx\`);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{t('Data Entry Method')}</h3>
            <div className="flex gap-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="radio" name="dataEntryMode" value="OEM SOB Data" checked={dataEntryMode === 'OEM SOB Data'} onChange={() => setDataEntryMode('OEM SOB Data')} className="w-5 h-5 accent-blue-600" />
                <span className="text-sm">{t('OEM SOB Data')}</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="radio" name="dataEntryMode" value="Manual Entry" checked={dataEntryMode === 'Manual Entry'} onChange={() => setDataEntryMode('Manual Entry')} className="w-5 h-5 accent-blue-600" />
                <span className="text-sm">{t('Manual Entry')}</span>
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {canEditIncentives && (
              <button onClick={addManualRow} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                <Plus size={14} /> Add Row
              </button>
            )}
            <button onClick={exportToExcel} disabled={sortedRows.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
              <Download size={14} /> Export Excel
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-3 shadow-sm flex items-center gap-3">
            <div style={{ width: 160, height: 120 }}>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={achievementPie} dataKey="value" nameKey="name" innerRadius={30} outerRadius={48} paddingAngle={2}>
                    {achievementPie.map((_: any, i: number) => <Cell key={i} fill={getProp(COLORS_ACH, i % COLORS_ACH.length)} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div className="text-sm font-medium">{t('Achievement')}</div>
              <div className="text-2xl font-bold">{achievementPercent}%</div>
              <div className="text-xs text-slate-600 mt-1">{t('Lifted: ')}{(sortedRows.reduce((s, r) => s + (Number(r.lifted) || 0), 0) || 0).toLocaleString()} cars</div>
              <div className="text-xs text-slate-600">{t('Total: ')}{(sortedRows.reduce((s, r) => s + (Number(r.target) || 0), 0) || 0).toLocaleString()} cars</div>
            </div>
          </div>

          <div className="bg-white rounded-lg p-3 shadow-sm flex items-center gap-3">
            <div style={{ width: 160, height: 120 }}>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={earningsPie} dataKey="value" nameKey="name" innerRadius={30} outerRadius={48} paddingAngle={2}>
                    {earningsPie.map((_: any, i: number) => <Cell key={i} fill={getProp(COLORS_EARN, i % COLORS_EARN.length)} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div className="text-sm font-medium">{t('Earnings')}</div>
              <div className="text-2xl font-bold">{earningsPercent}%</div>
              <div className="text-xs text-slate-600 mt-1">{t('Earned: ₹')}{(sortedRows.reduce((s, r) => {
                if (r._children && Array.isArray(r._children)) {
                  return s + r._children.reduce((cs: number, c: any) => {
                    const rate = getProp(incentiveRates, c.id) ?? c.incentive ?? 0;
                    return cs + (rate * Math.min(Number(c.lifted) || 0, Number(c.target) || 0));
                  }, 0);
                }
                const rate = getProp(incentiveRates, r.id) ?? r.incentive ?? 0;
                return s + (rate * Math.min(Number(r.lifted) || 0, Number(r.target) || 0));
              }, 0) || 0).toLocaleString()}</div>
              <div className="text-xs text-slate-600">{t('Potential: ₹')}{(sortedRows.reduce((s, r) => s + (Number(getCellValue(r, 'potential')) || 0), 0) || 0).toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <input type="checkbox" id="autoCalcToggle" checked={autoCalculate} onChange={e => setAutoCalculate(e.target.checked)} className="w-4 h-4 accent-blue-600" />
            <label htmlFor="autoCalcToggle" className="text-sm font-medium text-slate-700">{t('Auto Calculate Potential Earnings')}</label>
          </div>
        </div>

        <div className="overflow-x-auto">
          {sortedRows.length === 0 ? (
            <div className="p-12 text-center">
              <Award className="mx-auto text-slate-300 mb-4" size={48} />
              <h3 className="text-lg font-medium text-slate-900">{t('No Data Available')}</h3>
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[1200px]">
              <thead className="bg-slate-50">
                <tr className="text-slate-900 text-xs uppercase tracking-wider border-b-2 border-slate-200">
                  {getHeaders().map(h => (
                    <th key={h.key} onClick={() => setSortBy(prev => prev?.key === h.key ? { key: h.key, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { key: h.key, direction: 'asc' })} className="p-4 font-semibold border-r border-slate-200 cursor-pointer select-none">
                      {h.label}
                    </th>
                  ))}
                  {dataEntryMode === 'Manual Entry' && canEditIncentives && <th className="p-4 font-semibold text-center">{t('Actions')}</th>}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {sortedRows.map((row, idx) => {
                  const balance = calculateBalance(row.target, row.lifted);
                  const potential = (getProp(incentiveRates, row.id) ?? row.incentive ?? 0) * balance;
                  const isEditing = editingRowId === row.id;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50 even:bg-slate-50/30">
                      {dataEntryMode === 'OEM SOB Data' && <td className="p-4 text-sm font-medium text-slate-900 border-r border-slate-200">{row.oem}</td>}

                      <td className="p-4 text-sm font-medium text-slate-900 border-r border-slate-200">{isEditing ? <input value={editFormData?.plant ?? ''} onChange={e => setEditFormData(prev => prev ? { ...prev, plant: e.target.value } : prev)} className="w-full" /> : row.plant}</td>

                      {columnVisibility.showStateCity && incentiveScopeFilter !== 'Zone' && <td className="p-4 text-sm text-slate-700 border-r border-slate-200">{isEditing ? <input value={editFormData?.statecity ?? ''} onChange={e => {
                        setEditFormData(prev => prev ? { ...prev, statecity: e.target.value } : prev);
                        if (autoCalculate) {
                          const target = getProp(incentiveEdits, row.id)?.target ?? row.target;
                          const lifted = getProp(incentiveEdits, row.id)?.lifted ?? row.lifted;
                          const balance = Math.max(0, target - lifted);
                          const rate = getProp(incentiveRates, row.id) ?? row.incentive ?? 0;
                          const newPotential = balance * rate;
                          setIncentiveEdits(prev => ({
                            ...(prev || {}),
                            [row.id]: {
                              ...(getProp(prev, row.id) || { target: row.target, lifted: row.lifted }),
                              potential: newPotential
                            }
                          }));
                        }
                      }} className="w-full" /> : row.statecity}</td>}

                      {columnVisibility.showZone && <td className="p-4 text-sm text-slate-700 border-r border-slate-200">{isEditing ? <input value={editFormData?.zone ?? ''} onChange={e => {
                        setEditFormData(prev => prev ? { ...prev, zone: e.target.value } : prev);
                        if (autoCalculate) {
                          const target = getProp(incentiveEdits, row.id)?.target ?? row.target;
                          const lifted = getProp(incentiveEdits, row.id)?.lifted ?? row.lifted;
                          const balance = Math.max(0, target - lifted);
                          const rate = getProp(incentiveRates, row.id) ?? row.incentive ?? 0;
                          const newPotential = balance * rate;
                          setIncentiveEdits(prev => ({
                            ...(prev || {}),
                            [row.id]: {
                              ...(getProp(prev, row.id) || { target: row.target, lifted: row.lifted }),
                              potential: newPotential
                            }
                          }));
                        }
                      }} className="w-full" /> : row.zone}</td>}


                      <td className="p-4 text-sm text-right border-r border-slate-200 bg-slate-50/50">
                        {canEditIncentives ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <input
                              type="number"
                              min={0}
                              value={row.target}
                              title={row._hasIncentiveTarget ? 'Incentive-specific target (separate from SOB)' : 'SOB target — edit to set a separate incentive target'}
                              onChange={e => {
                                const newTarget = parseInt(e.target.value) || 0;
                                // Save to the dedicated incentive target store — never touches SOB data
                                const storeKey = \`\${row.oem}||\${row.year}||\${row.month}||\${row.id}\`;
                                setIncentiveTargetStore(prev => ({ ...(prev || {}), [storeKey]: newTarget }));
                                // Also update incentiveEdits so the UI reflects the change immediately
                                const currentLifted = (getProp(incentiveEdits, row.id)?.lifted ?? row.lifted) || 0;
                                const balance = Math.max(0, newTarget - currentLifted);
                                const rate = getProp(incentiveRates, row.id) ?? row.incentive ?? 0;
                                const newPotential = autoCalculate ? (balance * rate) : (getProp(incentiveEdits, row.id)?.potential ?? undefined);
                                setIncentiveEdits(prev => ({
                                  ...(prev || {}),
                                  [row.id]: {
                                    ...(getProp(prev, row.id) || { target: row.target, lifted: row.lifted }),
                                    target: newTarget,
                                    ...(newPotential !== undefined && { potential: newPotential })
                                  }
                                }));
                              }}
                              className="w-24 text-right"
                            />
                            {row._hasIncentiveTarget && (
                              <span className="text-[10px] text-amber-600 font-semibold">{t('incentive target')}</span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-end gap-0.5">
                            <span>{row.target}</span>
                            {row._hasIncentiveTarget && (
                              <span className="text-[10px] text-amber-600 font-semibold">{t('incentive target')}</span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="p-4 text-sm text-right border-r border-slate-200 bg-slate-50/50">
                        {canEditIncentives ? (
                          <input type="number" min={0} value={row.lifted} onChange={e => {
                            const newLifted = parseInt(e.target.value) || 0;
                            const currentTarget = (getProp(incentiveEdits, row.id)?.target ?? row.target) || 0;
                            const balance = Math.max(0, currentTarget - newLifted);
                            const rate = getProp(incentiveRates, row.id) ?? row.incentive ?? 0;
                            const newPotential = autoCalculate ? (balance * rate) : (getProp(incentiveEdits, row.id)?.potential ?? undefined);
                            setIncentiveEdits(prev => ({
                              ...(prev || {}),
                              [row.id]: {
                                ...(getProp(prev, row.id) || { target: row.target, lifted: row.lifted }),
                                lifted: newLifted,
                                ...(newPotential !== undefined && { potential: newPotential })
                              }
                            }));
                          }} className="w-24 text-right" />
                        ) : (
                          row.lifted
                        )}
                      </td>

                      <td className="p-4 text-sm text-right border-r border-slate-200 bg-slate-50/50">{balance.toLocaleString()}</td>


                      <td className="p-4 text-right border-r border-slate-200 bg-slate-50/50">
                        {canEditIncentives ? (
                          <input type="number" min={0} value={getProp(incentiveRates, row.id) ?? row.incentive ?? ''} onChange={e => {
                            const newRate = parseFloat(e.target.value) || 0;
                            setIncentiveRates(prev => ({ ...(prev || {}), [row.id]: newRate }) as Record<string, number>);
                            if (autoCalculate) {
                              const target = getProp(incentiveEdits, row.id)?.target ?? row.target;
                              const lifted = getProp(incentiveEdits, row.id)?.lifted ?? row.lifted;
                              const balance = Math.max(0, target - lifted);
                              const newPotential = balance * newRate;
                              setIncentiveEdits(prev => ({
                                ...(prev || {}),
                                [row.id]: {
                                  ...(getProp(prev, row.id) || { target: row.target, lifted: row.lifted }),
                                  potential: newPotential
                                }
                              }));
                            }
                          }} className="w-24 text-right" />
                        ) : (
                          <div className="text-sm font-medium">{Number(getProp(incentiveRates, row.id) ?? row.incentive ?? 0).toFixed(2)}</div>
                        )}
                      </td>

                      <td className="p-4 text-sm font-bold text-blue-600 text-right border-r border-slate-200">
                        {canEditIncentives ? (
                          <input
                            type="number"
                            min={0}
                            value={getCellValue(row, 'potential') ?? ''}
                            onChange={e => setIncentiveEdits(prev => ({ ...(prev || {}), [row.id]: { ...(getProp(prev, row.id) || { target: row.target, lifted: row.lifted, potential: typeof row.potential === 'number' ? row.potential : (getProp(incentiveRates, row.id) ?? row.incentive ?? 0) * calculateBalance(row.target, row.lifted) }), potential: parseFloat(e.target.value) || 0 } }))}
                            className="w-32 text-right font-bold text-blue-600"
                          />
                        ) : (
                          <>₹{(getCellValue(row, 'potential') || 0).toLocaleString()}</>
                        )}
                      </td>

                      {dataEntryMode === 'Manual Entry' && canEditIncentives && (
                        <td className="p-4 text-center border-r border-slate-200">
                          <div className="flex justify-center gap-2">
                            {isEditing ? (
                              <>
                                <button onClick={saveEdit} className="p-2 text-green-600">{t('Save')}</button>
                                <button onClick={() => { setEditingRowId(null); setEditFormData(null); }} className="p-2 text-gray-600">{t('Cancel')}</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => startEdit(row)} className="p-2 text-blue-600"><Edit2 size={16} /></button>
                                <button onClick={() => deleteRow(row.id)} className="p-2 text-red-600"><Trash2 size={16} /></button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
`;

fs.writeFileSync('src/IncentivePlannerTab.tsx', originalContent);
