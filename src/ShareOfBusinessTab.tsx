import React, { useState, useMemo } from 'react';
import { Download, FileText, Filter, Calendar } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
// BUG-06 FIX: Removed unused getDestinationZone import
// BUG-07 FIX: Import shared CAPACITY from App instead of re-declaring it
import { breakTargetIntoWeeks } from './App'; // Import shared constants
import masterData from './masterData.json';

interface ShareOfBusinessTabProps {
  data: any[];
  allEntryLogs?: any[];
  years: number[];
  months: string[];
  currentYear: number;
  currentMonth: string;
  oems: string[];
  masterPlants: string[];
  oemPlantMap?: Record<string, string[]>;
  transportName?: string;
  transportLogo?: string;
  trailerCapacity?: number;
}

export const ShareOfBusinessTab: React.FC<ShareOfBusinessTabProps> = ({ 
  data, allEntryLogs = [], years, months, currentYear, currentMonth, oems, masterPlants, oemPlantMap = {},
  transportName = 'STPL', transportLogo = '', trailerCapacity = 6.5
}) => {
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  const [selectedOEM, setSelectedOEM] = useState<string>('All');
  const [selectedPlant, setSelectedPlant] = useState<string>('All');
  const [sobType, setSobType] = useState<string>('Domestic');
  const [liftingType, setLiftingType] = useState<string>('Car');
  const [targetType, setTargetType] = useState<string>('Both');
  const [carrierType, setCarrierType] = useState<string>('Carrier');
  const [tripsPerTrailer, setTripsPerTrailer] = useState<number>(1);
  const [sobView, setSobView] = useState<string>('week');

  const filteredPlants = useMemo(() => {
    if (selectedOEM === 'All') return masterPlants;
    return oemPlantMap[selectedOEM] || [];
  }, [selectedOEM, masterPlants, oemPlantMap]);

  const filteredData = useMemo(() => {
    return data.filter(d => 
      d.year.toString() === selectedYear &&
      d.month === selectedMonth &&
      (selectedOEM === 'All' || d.oem === selectedOEM) &&
      (selectedPlant === 'All' || d.plant === selectedPlant)
    );
  }, [data, selectedYear, selectedMonth, selectedOEM, selectedPlant]);

  // Compute actual lifted per week from allEntryLogs for the selected month/year/OEM/plant
  // Week boundaries: W1=1-7, W2=8-14, W3=15-21, W4=22-end
  const weeklyLiftedFromLogs = useMemo(() => {
    const result: Record<string, { w1: number; w2: number; w3: number; w4: number; total: number; oem: string; plant: string; zone: string; region: string }> = {};
    const logs = Array.isArray(allEntryLogs) ? allEntryLogs : [];
    logs.forEach(log => {
      if (log.year?.toString() !== selectedYear) return;
      if (log.month !== selectedMonth) return;
      if (selectedOEM !== 'All' && log.oem !== selectedOEM) return;
      if (selectedPlant !== 'All' && log.plant !== selectedPlant) return;

      // Determine day of month from log.date
      let day = 0;
      if (log.date) {
        const d = new Date(log.date);
        if (!isNaN(d.getTime())) day = d.getDate();
      }
      if (day === 0) return;

      const week = day <= 7 ? 'w1' : day <= 14 ? 'w2' : day <= 21 ? 'w3' : 'w4';
      const lifted = Number(log.lifted) || 0;

      // Match to zone+region key using the same logic as aggregatedData
      // Use oem+plant+statecity to find the zone/region
      const matchedRecord = data.find(d =>
        d.oem === log.oem &&
        d.plant === log.plant &&
        (d.statecity === log.statecity || !log.statecity)
      );
      let zone = matchedRecord?.zone || log.zone || 'Other';
      const region = log.statecity || matchedRecord?.statecity || 'Unknown';

      // Migrate old log zone names to current masterData zone names
      const currentMasterRecord = masterData.find((m: any) => m.oem === log.oem && m.plant === log.plant && m.stateCity === region);
      if (currentMasterRecord && currentMasterRecord.zoneAO) {
        zone = currentMasterRecord.zoneAO;
      }

      const key = `${log.oem}-${log.plant}-${zone}-${region}`;

      if (!result[key]) result[key] = { w1: 0, w2: 0, w3: 0, w4: 0, total: 0, oem: log.oem, plant: log.plant, zone, region };
      result[key][week] += lifted;
      result[key].total += lifted;
    });
    return result;
  }, [allEntryLogs, selectedYear, selectedMonth, selectedOEM, selectedPlant, data]);

  // Aggregate by Zone and Region
  const aggregatedData = useMemo(() => {
    const map = new Map<string, any>();
    const processedLogKeys = new Set<string>();
    
    // 1. Pre-populate map with all master data for the selected OEM/Plant
    masterData.forEach((m: any) => {
      // Filter by selected OEM and Plant (if not 'All')
      if (selectedOEM !== 'All' && m.oem !== selectedOEM) return;
      if (selectedPlant !== 'All' && m.plant !== selectedPlant) return;

      const zone = m.zoneAO || m.originZone || 'Other';
      const stateCity = m.stateCity || 'Unknown';
      
      const ZONE_PLACEHOLDERS = new Set(['all destinations', 'all regions']);
      if (ZONE_PLACEHOLDERS.has(stateCity.trim().toLowerCase())) return;

      const isExport = zone.toLowerCase().includes('export') || stateCity.toLowerCase().includes('export');
      const isMarket = !isExport && (zone.toLowerCase().includes('market') || stateCity.toLowerCase().includes('market'));
      
      if (sobType === 'Domestic' && (isExport || isMarket)) return;
      if (sobType === 'Export' && !isExport) return;
      if (sobType === 'Market' && !isMarket) return;

      const modesToProcess = liftingType === 'All' ? ['Car', 'Trip', 'Trailer'] : [liftingType];

      modesToProcess.forEach(mode => {
        const key = `${m.oem}-${m.plant}-${zone}-${stateCity}-${mode}`;
        if (!map.has(key)) {
          map.set(key, {
            zone,
            region: stateCity,
            mode,
            target: 0,
            lifted: 0,
            weeksTarget: { w1: 0, w2: 0, w3: 0, w4: 0 },
            weeksLifted: { w1: 0, w2: 0, w3: 0, w4: 0 },
            hasExplicitBreakdown: false,
            hasActualLiftedData: false,
            isZoneLevelRecord: false,
          });
        }
      });
    });

    // 2. Update map with actual saved targets
    filteredData.forEach(d => {
      let zone = (d.zone && d.zone !== 'Unknown') ? d.zone : 'Other';
      const stateCity = d.statecity || 'Unknown';

      // Migrate old database zone names to current masterData zone names
      const currentMasterRecord = masterData.find((m: any) => m.oem === d.oem && m.plant === d.plant && m.stateCity === stateCity);
      if (currentMasterRecord && currentMasterRecord.zoneAO) {
        zone = currentMasterRecord.zoneAO;
      }

      const ZONE_PLACEHOLDERS = new Set(['all destinations', 'all regions']);
      if (ZONE_PLACEHOLDERS.has(stateCity.trim().toLowerCase())) return;

      const isZoneLevelRecord = d.targetLevel === 'AO Zone Wise';
      
      const isExport = zone.toLowerCase().includes('export') || stateCity.toLowerCase().includes('export');
      const isMarket = !isExport && (zone.toLowerCase().includes('market') || stateCity.toLowerCase().includes('market'));
      
      if (sobType === 'Domestic' && (isExport || isMarket)) return;
      if (sobType === 'Export' && !isExport) return;
      if (sobType === 'Market' && !isMarket) return;
      
      const region = stateCity;
      // Get actual weekly lifted from logs for this specific OEM/plant/zone+region
      const logKey = `${d.oem}-${d.plant}-${zone}-${region}`;
      const isFirstTimeProcessingLogsForThisKey = !processedLogKeys.has(logKey);
      const actualLifted = isFirstTimeProcessingLogsForThisKey ? weeklyLiftedFromLogs[logKey] : undefined;
      processedLogKeys.add(logKey);

      const modesToProcess = liftingType === 'All' ? ['Car', 'Trip', 'Trailer'] : [liftingType];

      modesToProcess.forEach(mode => {
        let targetVal = d.target || 0;
        // Use actual total lifted from logs; fall back to d.lifted if no log data
        let liftedVal = 0;
        if (actualLifted) {
          liftedVal = actualLifted.total;
        } else if (isFirstTimeProcessingLogsForThisKey) {
          liftedVal = d.lifted || 0;
        }

        if (mode === 'Trip') {
          targetVal = targetVal / trailerCapacity;
          liftedVal = liftedVal / trailerCapacity;
        } else if (mode === 'Trailer') {
          targetVal = (targetVal / trailerCapacity) / Math.max(1, tripsPerTrailer);
          liftedVal = (liftedVal / trailerCapacity) / Math.max(1, tripsPerTrailer);
        }

        const key = `${zone}-${region}-${mode}`;
        if (!map.has(key)) {
          map.set(key, {
            zone,
            region,
            mode,
            target: 0,
            lifted: 0,
            weeksTarget: { w1: 0, w2: 0, w3: 0, w4: 0 },
            weeksLifted: { w1: 0, w2: 0, w3: 0, w4: 0 },
            hasExplicitBreakdown: false,
            hasActualLiftedData: false,
            isZoneLevelRecord,
          });
        }
        
        const row = map.get(key);
        row.target += targetVal;
        row.lifted += liftedVal;

        // Weekly lifted — use ACTUAL log data (exact per-week) if available
        if (actualLifted) {
          const scale = mode === 'Car' ? 1 : mode === 'Trip' ? (1 / trailerCapacity) : (1 / trailerCapacity) / Math.max(1, tripsPerTrailer);
          row.weeksLifted.w1 += mode === 'Car' ? actualLifted.w1 : Math.ceil(actualLifted.w1 * scale);
          row.weeksLifted.w2 += mode === 'Car' ? actualLifted.w2 : Math.ceil(actualLifted.w2 * scale);
          row.weeksLifted.w3 += mode === 'Car' ? actualLifted.w3 : Math.ceil(actualLifted.w3 * scale);
          row.weeksLifted.w4 += mode === 'Car' ? actualLifted.w4 : Math.ceil(actualLifted.w4 * scale);
          row.hasActualLiftedData = true;
        }

        // Weekly target — use explicit breakdown if saved, else proportional
        if (d.weeklyBreakdown && Array.isArray(d.weeklyBreakdown) && d.weeklyBreakdown.length > 0) {
          row.hasExplicitBreakdown = true;
          d.weeklyBreakdown.forEach((wb: any, idx: number) => {
            const wk = `w${Math.min(idx + 1, 4)}` as 'w1'|'w2'|'w3'|'w4';
            let cars = typeof wb.cars === 'number' ? wb.cars : parseInt(wb.cars || '0', 10) || 0;
            if (mode === 'Trip') cars = cars / trailerCapacity;
            else if (mode === 'Trailer') cars = (cars / trailerCapacity) / Math.max(1, tripsPerTrailer);
            row.weeksTarget[wk] += mode === 'Car' ? cars : Math.ceil(cars);
          });
        }
      });
    });

    // Add logs that didn't have corresponding targets
    Object.keys(weeklyLiftedFromLogs).forEach(logKey => {
      if (!processedLogKeys.has(logKey)) {
        const logData = weeklyLiftedFromLogs[logKey];
        const { zone, region } = logData;
        const modesToProcess = liftingType === 'All' ? ['Car', 'Trip', 'Trailer'] : [liftingType];

        modesToProcess.forEach(mode => {
          const scale = mode === 'Car' ? 1 : mode === 'Trip' ? (1 / trailerCapacity) : (1 / trailerCapacity) / Math.max(1, tripsPerTrailer);
          const liftedVal = mode === 'Car' ? logData.total : logData.total * scale;
          
          const key = `${zone}-${region}-${mode}`;
          if (!map.has(key)) {
            map.set(key, {
              zone,
              region,
              mode,
              target: 0,
              lifted: 0,
              weeksTarget: { w1: 0, w2: 0, w3: 0, w4: 0 },
              weeksLifted: { w1: 0, w2: 0, w3: 0, w4: 0 },
              hasExplicitBreakdown: false,
              hasActualLiftedData: true,
              isZoneLevelRecord: false,
            });
          }
          
          const row = map.get(key);
          row.lifted += liftedVal;
          row.weeksLifted.w1 += mode === 'Car' ? logData.w1 : Math.ceil(logData.w1 * scale);
          row.weeksLifted.w2 += mode === 'Car' ? logData.w2 : Math.ceil(logData.w2 * scale);
          row.weeksLifted.w3 += mode === 'Car' ? logData.w3 : Math.ceil(logData.w3 * scale);
          row.weeksLifted.w4 += mode === 'Car' ? logData.w4 : Math.ceil(logData.w4 * scale);
          row.hasActualLiftedData = true;
        });
      }
    });

    const list = Array.from(map.values());
    list.forEach(r => {
      if (r.mode === 'Trip' || r.mode === 'Trailer') {
        r.target = Math.ceil(r.target);
        r.lifted = Math.ceil(r.lifted);
      }
    });

    // Sort by zone, then region, then mode
    list.sort((a, b) => {
      const zoneCmp = a.zone.localeCompare(b.zone);
      if (zoneCmp !== 0) return zoneCmp;
      const regCmp = a.region.localeCompare(b.region);
      if (regCmp !== 0) return regCmp;
      return a.mode.localeCompare(b.mode);
    });

    return list;
  }, [filteredData, sobType, liftingType, tripsPerTrailer, weeklyLiftedFromLogs]);

  

  // Derive data based on selected SOB View mode
  const viewAggregatedData = useMemo(() => {
    // Group aggregatedData rows, carrying weekly breakdown through the grouping.
    // Key insight: when grouping, we must accumulate weeksTarget/weeksLifted alongside
    // target/lifted, and track whether ANY row in the group has explicit breakdown data.
    type GroupRow = {
      zone: string;
      region: string;
      target: number;
      lifted: number;
      weeksTarget: { w1: number; w2: number; w3: number; w4: number };
      weeksLifted: { w1: number; w2: number; w3: number; w4: number };
      hasExplicitBreakdown: boolean;
      hasActualLiftedData: boolean;
    };
    const grouped: Record<string, GroupRow> = {};

    aggregatedData.forEach(r => {
      // Zone-level records must NOT appear in state/city views
      const isStateCityView = sobView === 'zone-city-week' || sobView === 'zone-city' || sobView === 'state-week' || sobView === 'city';
      if (isStateCityView && r.isZoneLevelRecord) return;

      let key = '';
      if (sobView === 'zone') key = r.zone;
      else if (sobView === 'zone-week') key = r.zone;
      else if (sobView === 'zone-city') key = `${r.zone}||${r.region}`;
      else if (sobView === 'zone-city-week') key = `${r.zone}||${r.region}`;
      else if (sobView === 'state-week') key = r.region;
      else if (sobView === 'city') key = r.region;
      else if (sobView === 'week') key = 'WEEKS';
      else key = r.zone;

      if (!grouped[key]) {
        grouped[key] = {
          zone: (sobView === 'state-week' || sobView === 'city') ? '' : r.zone,
          region: (sobView === 'zone' || sobView === 'zone-week') ? '' : r.region,
          target: 0,
          lifted: 0,
          weeksTarget: { w1: 0, w2: 0, w3: 0, w4: 0 },
          weeksLifted: { w1: 0, w2: 0, w3: 0, w4: 0 },
          hasExplicitBreakdown: false,
          hasActualLiftedData: false,
        };
      }

      const g = grouped[key];
      g.target += r.target;
      g.lifted += r.lifted;

      // For lifted weeks: use actual log data if this row has it, else use zeros
      // NEVER spread proportionally — only show what was actually lifted per week
      if (r.hasActualLiftedData) {
        g.weeksLifted.w1 += r.weeksLifted.w1;
        g.weeksLifted.w2 += r.weeksLifted.w2;
        g.weeksLifted.w3 += r.weeksLifted.w3;
        g.weeksLifted.w4 += r.weeksLifted.w4;
        g.hasActualLiftedData = true;
      }
      // If no actual data for this row, weeksLifted stays 0 for this row's contribution

      // For target weeks: use explicit breakdown or proportional
      const rowWeeksT = r.hasExplicitBreakdown
        ? r.weeksTarget
        : calculateWeeks(r.target || 0, 'target');

      g.weeksTarget.w1 += rowWeeksT.w1;
      g.weeksTarget.w2 += rowWeeksT.w2;
      g.weeksTarget.w3 += rowWeeksT.w3;
      g.weeksTarget.w4 += rowWeeksT.w4;

      if (r.hasExplicitBreakdown) g.hasExplicitBreakdown = true;
    });

    const result: any[] = [];

    if (sobView === 'week') {
      // Week view: show a single Grand Total row with week breakdown
      // No Domestic/Export split — just the overall weekly breakdown for the selected OEM/Plant
      const total: GroupRow = {
        zone: '', region: '', target: 0, lifted: 0,
        weeksTarget: { w1: 0, w2: 0, w3: 0, w4: 0 },
        weeksLifted: { w1: 0, w2: 0, w3: 0, w4: 0 },
        hasExplicitBreakdown: false,
        hasActualLiftedData: false,
      };

      aggregatedData.forEach(r => {
        const rowWeeksT = r.hasExplicitBreakdown ? r.weeksTarget : calculateWeeks(r.target || 0, 'target');
        total.target += r.target;
        total.lifted += r.lifted;
        total.weeksTarget.w1 += rowWeeksT.w1; total.weeksTarget.w2 += rowWeeksT.w2;
        total.weeksTarget.w3 += rowWeeksT.w3; total.weeksTarget.w4 += rowWeeksT.w4;
        // Only add actual lifted per week — never spread proportionally
        if (r.hasActualLiftedData) {
          total.weeksLifted.w1 += r.weeksLifted.w1; total.weeksLifted.w2 += r.weeksLifted.w2;
          total.weeksLifted.w3 += r.weeksLifted.w3; total.weeksLifted.w4 += r.weeksLifted.w4;
          total.hasActualLiftedData = true;
        }
        if (r.hasExplicitBreakdown) total.hasExplicitBreakdown = true;
      });

      const weeksT = total.hasExplicitBreakdown ? total.weeksTarget : calculateWeeks(total.target, 'target');
      const weeksL = total.hasActualLiftedData ? total.weeksLifted : { w1: 0, w2: 0, w3: 0, w4: 0 };
      result.push({ ...total, weeksTarget: weeksT, weeksLifted: weeksL });
      return result;
    }

    Object.values(grouped).forEach(g => {
      const weeksT = g.hasExplicitBreakdown ? g.weeksTarget : calculateWeeks(g.target || 0, 'target');
      // For lifted: use actual accumulated log data — never spread proportionally
      // If hasActualLiftedData, weeksLifted already has the correct per-week values
      // If no actual data at all, show zeros (don't fabricate weekly distribution)
      const weeksL = g.hasActualLiftedData ? g.weeksLifted : { w1: 0, w2: 0, w3: 0, w4: 0 };
      result.push({ ...g, weeksTarget: weeksT, weeksLifted: weeksL });
    });

    // sort by zone/region
    result.sort((a, b) => {
      const zcmp = (a.zone || '').localeCompare(b.zone || '');
      if (zcmp !== 0) return zcmp;
      return (a.region || '').localeCompare(b.region || '');
    });

    return result;
  }, [aggregatedData, sobView]);

  const daysInMonth = useMemo(() => {
    return new Date(parseInt(selectedYear), months.indexOf(selectedMonth) + 1, 0).getDate();
  }, [selectedYear, selectedMonth, months]);

  // Determine whether to show week breakdown columns for the selected view.
  // Show weeks for explicit week views; do NOT show for pure zone or city views.
  const showWeeks = useMemo(() => {
    return sobView === 'week' || sobView === 'zone-week' || sobView === 'zone-city-week';
  }, [sobView]);

  // Wrapper: delegates to the shared breakTargetIntoWeeks utility from App.tsx
  // For lifted values we use the same proportional formula (no explicit breakdown for lifted)
  function calculateWeeks(total: number, _type: 'target' | 'lifted') {
    const result = breakTargetIntoWeeks(total, selectedMonth, parseInt(selectedYear));
    return { w1: result.w1, w2: result.w2, w3: result.w3, w4: result.w4 };
  }

  const getAch = (lifted: number, target: number) => {
    if (target === 0) return 0;
    return Math.round((lifted / target) * 100);
  };

  const getAchColor = (ach: number, isSubtotal: boolean = false) => {
    if (isSubtotal) {
      if (ach >= 100) return 'text-green-800';
      if (ach >= 85) return 'text-green-800';
      if (ach >= 70) return 'text-yellow-800';
      return 'text-red-800';
    }
    if (ach >= 100) return 'text-green-600';
    if (ach >= 85) return 'text-green-600';
    if (ach >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getPerformance = (ach: number) => {
    if (ach >= 100) return 'Excellent';
    if (ach >= 85) return 'Good';
    if (ach >= 70) return 'Average';
    return 'Poor';
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.table_to_sheet(document.getElementById('sob-table'));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SOB Target Tracker");
    XLSX.writeFile(wb, `SOB_Tracker_${selectedMonth}_${selectedYear}.xlsx`);
  };

  const exportToPDF = async () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    
    let logoWidth = 0;
    if (transportLogo) {
      try {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = transportLogo;
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
        if (img.width > 0) {
           // Try to retain aspect ratio somewhat, bounding to 20x10 max
           const aspect = img.width / img.height;
           const targetH = 10;
           const targetW = targetH * aspect;
           const finalW = Math.min(targetW, 40);
           doc.addImage(img, 'JPEG', 14, 10, finalW, targetH);
           logoWidth = finalW + 5;
        }
      } catch (e) {}
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`${transportName}`, 14 + logoWidth, 18);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`OEM SOB Target Tracker - ${selectedMonth} ${selectedYear}`, 14, 26);
    
    const oemStr = selectedOEM === 'All' ? 'All OEMs' : selectedOEM;
    const plantStr = selectedPlant === 'All' ? 'All Plants' : selectedPlant;
    doc.text(`OEM & Plant: ${oemStr} / ${plantStr}`, 14, 32);
    
    doc.text(`Total Target: ${grandTotal.target}   |   Lifted: ${grandTotal.lifted}   |   Achievement: ${getAch(grandTotal.lifted, grandTotal.target)}%`, 14, 38);
    
    // Convert table to PDF and apply nice styling for totals/subtotals
    autoTable(doc, {
      html: '#sob-table',
      startY: 42,
      styles: { fontSize: 7, halign: 'center', cellPadding: 1.5, lineColor: [200, 200, 200], lineWidth: 0.1 },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      theme: 'grid',
      didParseCell: (data) => {
        // Highlight Subtotals and Totals
        try {
          const raw = data.row.raw as HTMLTableRowElement;
          const rowClass = (raw && typeof raw === 'object' && 'className' in raw) ? (raw.className as string) : '';
          const firstCell = data.row.cells[0]?.text?.[0] || '';
          if (rowClass.includes('subtotal-row') || firstCell.includes('SUBTOTAL')) {
            data.cell.styles.fillColor = [226, 232, 240]; // bg-slate-200
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [30, 41, 59]; // text-slate-800
          }
          if (rowClass.includes('total-row') || firstCell.includes('GRAND TOTAL')) {
            data.cell.styles.fillColor = [219, 234, 254]; // bg-blue-100
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [30, 58, 138]; // text-blue-900
          }
        } catch (e) {}
      }
    });
    
    doc.save(`SOB_Tracker_${transportName.replace(/\s+/g,'_')}_${selectedMonth}_${selectedYear}.pdf`);
  };

  const grandTotal = aggregatedData.reduce((acc, curr) => {
    acc.target += curr.target;
    acc.lifted += curr.lifted;
    return acc;
  }, { target: 0, lifted: 0 });

  // Prefer stored weekly aggregates if any record provides them; otherwise compute proportional weeks
  const aggregatedWeeksTarget = aggregatedData.reduce((acc: any, curr: any) => {
    if (curr.weeksTarget) {
      acc.w1 += curr.weeksTarget.w1 || 0;
      acc.w2 += curr.weeksTarget.w2 || 0;
      acc.w3 += curr.weeksTarget.w3 || 0;
      acc.w4 += curr.weeksTarget.w4 || 0;
    }
    return acc;
  }, { w1: 0, w2: 0, w3: 0, w4: 0 });

  const aggregatedWeeksLifted = aggregatedData.reduce((acc: any, curr: any) => {
    if (curr.weeksLifted) {
      acc.w1 += curr.weeksLifted.w1 || 0;
      acc.w2 += curr.weeksLifted.w2 || 0;
      acc.w3 += curr.weeksLifted.w3 || 0;
      acc.w4 += curr.weeksLifted.w4 || 0;
    }
    return acc;
  }, { w1: 0, w2: 0, w3: 0, w4: 0 });

  const grandWeeksTarget = (aggregatedWeeksTarget.w1 + aggregatedWeeksTarget.w2 + aggregatedWeeksTarget.w3 + aggregatedWeeksTarget.w4) > 0 ? aggregatedWeeksTarget : calculateWeeks(grandTotal.target, 'target');
  const grandWeeksLifted = (aggregatedWeeksLifted.w1 + aggregatedWeeksLifted.w2 + aggregatedWeeksLifted.w3 + aggregatedWeeksLifted.w4) > 0 ? aggregatedWeeksLifted : calculateWeeks(grandTotal.lifted, 'lifted');

  // We need number of columns spanned by each week:
  const colsPerWeek = targetType === 'Both' ? 3 : (targetType === 'Target' ? 1 : 2); // default Lifting shows Lifting and Ach% -> Wait, Target type Lifting shows Lifting & Ach% or just Lifting? Usually just Lifting. Or let's say Lifting = Lifting + Ach%. Let's say Lifting = 2, Target = 1.
  // Actually, targetType = 'Target' -> Shows Target
  // targetType = 'Lifting' -> Shows Lifting, Ach %
  // targetType = 'Both' -> Shows Target, Lifting, Ach %
  
  const showTarget = targetType === 'Both' || targetType === 'Target';
  const showLifting = targetType === 'Both' || targetType === 'Lifting';
  const colsSpan = (showTarget ? 1 : 0) + (showLifting ? 2 : 0);

  // Render Rows with Subtotals
  const renderRows = () => {
    if (viewAggregatedData.length === 0) {
      return (
        <tr>
          <td colSpan={18} className="p-8 border border-[#E2E8F0] text-center text-[#64748B]">No records found for the selected filters</td>
        </tr>
      );
    }

    const rows: React.ReactNode[] = [];
    let currentZone = '';
    let zoneTotal = { target: 0, lifted: 0 };

    const addSubtotalRow = (zone: string, zTotal: { target: number, lifted: number }) => {
      const wT = calculateWeeks(zTotal.target, 'target');
      const wL = calculateWeeks(zTotal.lifted, 'lifted');
      // Number of leading cols depends on view
      const leadingCols =
        (sobView !== 'city' && sobView !== 'state-week' && sobView !== 'week' ? 1 : 0) +
        (sobView !== 'zone' && sobView !== 'zone-week' && sobView !== 'week' ? 1 : 0) +
        (liftingType === 'All' ? 1 : 0);
      rows.push(
        <tr key={`subtotal-${zone}`} className="subtotal-row font-bold border-t border-b border-indigo-200"
            style={{ background: 'linear-gradient(90deg,#e0e7ff 0%,#f0f4ff 100%)' }}>
          <td colSpan={leadingCols} className="p-3 border border-indigo-200 text-center text-indigo-900 uppercase text-xs tracking-wider font-black">
            {zone} — Subtotal
          </td>
          {showWeeks ? (
            <>
              {showTarget && <td className="p-2.5 border border-indigo-200 text-center text-indigo-800 font-bold">{wT.w1}</td>}
              {showLifting && <td className="p-2.5 border border-indigo-200 text-center text-emerald-700 font-bold">{wL.w1}</td>}
              {showLifting && <td className={`p-2.5 border border-indigo-200 text-center font-bold ${getAchColor(getAch(wL.w1, wT.w1), true)}`}>{getAch(wL.w1, wT.w1)}%</td>}
              {showTarget && <td className="p-2.5 border border-indigo-200 text-center text-indigo-800 font-bold">{wT.w2}</td>}
              {showLifting && <td className="p-2.5 border border-indigo-200 text-center text-emerald-700 font-bold">{wL.w2}</td>}
              {showLifting && <td className={`p-2.5 border border-indigo-200 text-center font-bold ${getAchColor(getAch(wL.w2, wT.w2), true)}`}>{getAch(wL.w2, wT.w2)}%</td>}
              {showTarget && <td className="p-2.5 border border-indigo-200 text-center text-indigo-800 font-bold">{wT.w3}</td>}
              {showLifting && <td className="p-2.5 border border-indigo-200 text-center text-emerald-700 font-bold">{wL.w3}</td>}
              {showLifting && <td className={`p-2.5 border border-indigo-200 text-center font-bold ${getAchColor(getAch(wL.w3, wT.w3), true)}`}>{getAch(wL.w3, wT.w3)}%</td>}
              {showTarget && <td className="p-2.5 border border-indigo-200 text-center text-indigo-800 font-bold">{wT.w4}</td>}
              {showLifting && <td className="p-2.5 border border-indigo-200 text-center text-emerald-700 font-bold">{wL.w4}</td>}
              {showLifting && <td className={`p-2.5 border border-indigo-200 text-center font-bold ${getAchColor(getAch(wL.w4, wT.w4), true)}`}>{getAch(wL.w4, wT.w4)}%</td>}
              {showTarget && <td className="p-2.5 border border-indigo-200 text-center text-indigo-900 font-black">{zTotal.target}</td>}
              {showLifting && <td className="p-2.5 border border-indigo-200 text-center text-emerald-800 font-black">{zTotal.lifted}</td>}
              {showLifting && <td className={`p-2.5 border border-indigo-200 text-center font-black ${getAchColor(getAch(zTotal.lifted, zTotal.target), true)}`}>{getAch(zTotal.lifted, zTotal.target)}%</td>}
            </>
          ) : (
            <>
              {showTarget && <td className="p-2.5 border border-indigo-200 text-center text-indigo-900 font-black">{zTotal.target}</td>}
              {showLifting && <td className="p-2.5 border border-indigo-200 text-center text-emerald-800 font-black">{zTotal.lifted}</td>}
              {showLifting && <td className={`p-2.5 border border-indigo-200 text-center font-black ${getAchColor(getAch(zTotal.lifted, zTotal.target), true)}`}>{getAch(zTotal.lifted, zTotal.target)}%</td>}
            </>
          )}
          <td className={`p-2.5 border border-indigo-200 text-center font-bold ${getAchColor(getAch(zTotal.lifted, zTotal.target), true)}`}>
            {getPerformance(getAch(zTotal.lifted, zTotal.target))}
          </td>
        </tr>
      );
    };

    viewAggregatedData.forEach((row, idx) => {
      const groupingKey = row.zone || row.region || '';
      // Skip row if State/City equals Zone AO (case-insensitive, trimmed)
      if (
        row.zone && row.region &&
        row.zone.trim().toLowerCase() === row.region.trim().toLowerCase()
      ) {
        return;
      }
      if (currentZone && currentZone !== groupingKey) {
        // Show subtotal for zone+city views (multiple state/city rows per zone)
        if (sobView === 'zone-city-week' || sobView === 'zone-city') addSubtotalRow(currentZone, zoneTotal);
        zoneTotal = { target: 0, lifted: 0 };
      }
      currentZone = groupingKey;
      zoneTotal.target += row.target;
      zoneTotal.lifted += row.lifted;

      const weeksTarget = row.weeksTarget || calculateWeeks(row.target, 'target');
      const weeksLifted = row.weeksLifted || calculateWeeks(row.lifted, 'lifted');
      const isEven = idx % 2 === 0;

      rows.push(
        <tr key={idx} className={`transition-colors hover:bg-blue-50/60 ${isEven ? 'bg-white' : 'bg-slate-50/50'}`}>
          {/* Zone AO — hidden for state/city-only views AND week-only view */}
          {sobView !== 'city' && sobView !== 'state-week' && sobView !== 'week' && (
          <td className="p-3 border border-slate-200 font-bold text-[#1e3a8a] text-center text-sm whitespace-nowrap">
            {row.zone || ''}
          </td>
          )}
          {/* State/City — hidden for zone-only views AND week-only view */}
          {sobView !== 'zone' && sobView !== 'zone-week' && sobView !== 'week' && (
            <td className="p-3 border border-slate-200 text-slate-700 text-center text-sm">
              {row.region || ''}
            </td>
          )}
          {liftingType === 'All' && (
            <td className="p-3 border border-slate-200 text-center">
              <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                {row.mode || ''}
              </span>
            </td>
          )}
          {showWeeks ? (
            <>
              {showTarget && <td className="p-2.5 border border-slate-200 text-center text-slate-700 text-sm">{weeksTarget.w1}</td>}
              {showLifting && <td className="p-2.5 border border-slate-200 text-center text-emerald-700 font-semibold text-sm">{weeksLifted.w1}</td>}
              {showLifting && <td className={`p-2.5 border border-slate-200 text-center font-semibold text-sm ${getAchColor(getAch(weeksLifted.w1, weeksTarget.w1))}`}>{getAch(weeksLifted.w1, weeksTarget.w1)}%</td>}
              {showTarget && <td className="p-2.5 border border-slate-200 text-center text-slate-700 text-sm">{weeksTarget.w2}</td>}
              {showLifting && <td className="p-2.5 border border-slate-200 text-center text-emerald-700 font-semibold text-sm">{weeksLifted.w2}</td>}
              {showLifting && <td className={`p-2.5 border border-slate-200 text-center font-semibold text-sm ${getAchColor(getAch(weeksLifted.w2, weeksTarget.w2))}`}>{getAch(weeksLifted.w2, weeksTarget.w2)}%</td>}
              {showTarget && <td className="p-2.5 border border-slate-200 text-center text-slate-700 text-sm">{weeksTarget.w3}</td>}
              {showLifting && <td className="p-2.5 border border-slate-200 text-center text-emerald-700 font-semibold text-sm">{weeksLifted.w3}</td>}
              {showLifting && <td className={`p-2.5 border border-slate-200 text-center font-semibold text-sm ${getAchColor(getAch(weeksLifted.w3, weeksTarget.w3))}`}>{getAch(weeksLifted.w3, weeksTarget.w3)}%</td>}
              {showTarget && <td className="p-2.5 border border-slate-200 text-center text-slate-700 text-sm">{weeksTarget.w4}</td>}
              {showLifting && <td className="p-2.5 border border-slate-200 text-center text-emerald-700 font-semibold text-sm">{weeksLifted.w4}</td>}
              {showLifting && <td className={`p-2.5 border border-slate-200 text-center font-semibold text-sm ${getAchColor(getAch(weeksLifted.w4, weeksTarget.w4))}`}>{getAch(weeksLifted.w4, weeksTarget.w4)}%</td>}
              {showTarget && <td className="p-2.5 border border-slate-200 text-center bg-blue-50 font-bold text-blue-900">{row.target}</td>}
              {showLifting && <td className="p-2.5 border border-slate-200 text-center bg-emerald-50 font-bold text-emerald-800">{row.lifted}</td>}
              {showLifting && <td className={`p-2.5 border border-slate-200 text-center font-bold bg-slate-50 ${getAchColor(getAch(row.lifted, row.target))}`}>{getAch(row.lifted, row.target)}%</td>}
            </>
          ) : (
            <>
              {showTarget && <td className="p-3 border border-slate-200 text-center font-semibold text-blue-900">{row.target}</td>}
              {showLifting && <td className="p-3 border border-slate-200 text-center font-semibold text-emerald-700">{row.lifted}</td>}
              {showLifting && <td className={`p-3 border border-slate-200 text-center font-bold ${getAchColor(getAch(row.lifted, row.target))}`}>{getAch(row.lifted, row.target)}%</td>}
            </>
          )}
          <td className={`p-3 border border-slate-200 text-center`}>
            <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold ${
              getAch(row.lifted, row.target) >= 85 ? 'bg-emerald-100 text-emerald-800' :
              getAch(row.lifted, row.target) >= 70 ? 'bg-amber-100 text-amber-800' :
              'bg-red-100 text-red-700'
            }`}>
              {getPerformance(getAch(row.lifted, row.target))}
            </span>
          </td>
        </tr>
      );
    });

    if (currentZone && (sobView === 'zone-city-week' || sobView === 'zone-city')) {
      addSubtotalRow(currentZone, zoneTotal);
    }

    return rows;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#FFFFFF] p-6 rounded-2xl shadow-sm border border-[#E2E8F0]">
        <div>
          <h2 className="text-2xl font-bold text-[#1E293B]">OEM SOB Target Tracker</h2>
        </div>
        <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl font-semibold">
          {selectedMonth} {selectedYear}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#FFFFFF] p-6 rounded-[12px] shadow-sm border border-[#E2E8F0] grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm text-[#64748B]">Year</label>
          <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="p-2 border border-[#E2E8F0] rounded-lg bg-[#F8FAFC]">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-[#64748B]">Month</label>
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="p-2 border border-[#E2E8F0] rounded-lg bg-[#F8FAFC]">
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-[#64748B]">OEM</label>
          <select value={selectedOEM} onChange={(e) => { setSelectedOEM(e.target.value); setSelectedPlant('All'); }} className="p-2 border border-[#E2E8F0] rounded-lg bg-[#F8FAFC]">
            <option value="All">All OEMs</option>
            {oems.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-[#64748B]">Plant</label>
          <select value={selectedPlant} onChange={(e) => setSelectedPlant(e.target.value)} className="p-2 border border-[#E2E8F0] rounded-lg bg-[#F8FAFC]">
            <option value="All">All Plants</option>
            {filteredPlants.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-[#64748B]">SOB Type</label>
          <select value={sobType} onChange={(e) => setSobType(e.target.value)} className="p-2 border border-[#E2E8F0] rounded-lg bg-[#F8FAFC]">
            <option value="All">All</option>
            <option value="Domestic">Domestic</option>
            <option value="Export">Export</option>
            <option value="Market">Market</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-[#64748B]">Lifting Type</label>
          <select value={liftingType} onChange={(e) => setLiftingType(e.target.value)} className="p-2 border border-[#E2E8F0] rounded-lg bg-[#F8FAFC]">
            <option value="Car">Car</option>
            <option value="Trip">Trip</option>
            <option value="Trailer">Trailer</option>
            <option value="All">All</option>
          </select>
        </div>
        {liftingType === 'Trailer' && (
          <div className="flex flex-col gap-1">
            <label className="text-sm text-[#64748B]">Trips / Trailer</label>
            <input type="number" min={1} value={tripsPerTrailer} onChange={(e) => setTripsPerTrailer(Math.max(1, parseInt(e.target.value) || 1))} className="p-2 border border-[#E2E8F0] rounded-lg bg-[#F8FAFC]" />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-sm text-[#64748B]">Target Type</label>
          <select value={targetType} onChange={(e) => setTargetType(e.target.value)} className="p-2 border border-[#E2E8F0] rounded-lg bg-[#F8FAFC]">
            <option value="Lifting">Lifting</option>
            <option value="Target">Target</option>
            <option value="Both">Both</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-[#64748B]">Carrier Type</label>
          <select value={carrierType} onChange={(e) => setCarrierType(e.target.value)} className="p-2 border border-[#E2E8F0] rounded-lg bg-[#F8FAFC]">
            <option value="Carrier">Carrier</option>
            <option value="Bike">Bike</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-[#64748B]">SOB View</label>
          <select value={sobView} onChange={(e) => setSobView(e.target.value)} className="p-2 border border-[#E2E8F0] rounded-lg bg-[#F8FAFC]">
            <option value="zone">Zone-wise</option>
            <option value="zone-week">Zone & Week-wise</option>
            <option value="zone-city">Zone & State/City Wise</option>
            <option value="zone-city-week">Zone + State/City + Week-wise</option>
            <option value="week">Week-wise</option>
            <option value="state-week">State/City + Week-wise</option>
            <option value="city">City-wise</option>
          </select>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { 
            title: 'Transport Name', 
            value: <div className="flex items-center gap-2">
                     {transportLogo ? (
                       <img src={transportLogo} alt={`${transportName} Logo`} className="h-8 rounded object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                     ) : (
                       <div className="h-8 w-24 bg-[#E6EEF8] flex items-center justify-center text-sm text-[#64748B]">No Logo</div>
                     )}
                     <span>{transportName}</span>
                   </div> 
          },
          { title: 'OEM With Plant', value: selectedOEM !== 'All' ? `${selectedOEM} - ${selectedPlant}` : 'All' },
          { title: 'Total Target', value: grandTotal.target.toLocaleString() },
          { title: 'Achievement', value: `${getAch(grandTotal.lifted, grandTotal.target)}%`, color: getAchColor(getAch(grandTotal.lifted, grandTotal.target)) }
        ].map((card, idx) => (
          <div key={idx} className="bg-[#FFFFFF] p-5 rounded-[18px] shadow-sm border border-[#E2E8F0]">
            <h4 className="text-[#64748B] text-sm mb-2">{card.title}</h4>
            <div className={`text-2xl font-bold ${card.color || 'text-[#1E293B]'}`}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center p-2 mb-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
         <h3 className="text-lg font-extrabold text-[#1E293B] uppercase tracking-widest">{selectedMonth} {selectedYear} DATA</h3>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table id="sob-table" className="w-full text-sm text-left border-collapse min-w-[1400px]">
             <thead>
                <tr>
                   {/* Week-wise view: single total row — no label column needed */}
                   {/* Zone AO — hidden for state/city-only views AND week-only view */}
                   {sobView !== 'city' && sobView !== 'state-week' && sobView !== 'week' && (
                   <th rowSpan={2} className="p-3 border border-indigo-900/40 text-center text-xs font-bold uppercase tracking-wider text-white whitespace-nowrap"
                       style={{ background: 'linear-gradient(135deg,#1e3a5f 0%,#0f4a8e 100%)' }}>
                     Zone AO
                   </th>
                   )}
                   {/* State/City — hidden for pure zone views, shown for zone-city and zone-city-week */}
                   {sobView !== 'zone' && sobView !== 'zone-week' && sobView !== 'week' && (
                     <th rowSpan={2} className="p-3 border border-indigo-900/40 text-center text-xs font-bold uppercase tracking-wider text-white whitespace-nowrap"
                         style={{ background: 'linear-gradient(135deg,#1e3a5f 0%,#0f4a8e 100%)' }}>
                       State / City
                     </th>
                   )}
                   {liftingType === 'All' && (
                     <th rowSpan={2} className="p-3 border border-indigo-900/40 text-center text-xs font-bold uppercase tracking-wider text-white whitespace-nowrap"
                         style={{ background: 'linear-gradient(135deg,#1e3a5f 0%,#0f4a8e 100%)' }}>
                       Type
                     </th>
                   )}
                   {showWeeks ? (
                     <>
                       {[
                         `Week 1 (01–07)`,
                         `Week 2 (08–14)`,
                         `Week 3 (15–21)`,
                         `Week 4 (22–${daysInMonth})`,
                         `Grand Total`,
                       ].map((label, i) => (
                         <th key={i} colSpan={colsSpan}
                             className="p-3 border border-indigo-900/40 text-center text-xs font-bold uppercase tracking-wider text-white"
                             style={{ background: i % 2 === 0 ? 'linear-gradient(135deg,#1e40af 0%,#1d4ed8 100%)' : 'linear-gradient(135deg,#1e3a5f 0%,#0f4a8e 100%)' }}>
                           {label}
                         </th>
                       ))}
                     </>
                   ) : (
                     <th colSpan={colsSpan}
                         className="p-3 border border-indigo-900/40 text-center text-xs font-bold uppercase tracking-wider text-white"
                         style={{ background: 'linear-gradient(135deg,#1e40af 0%,#1d4ed8 100%)' }}>
                       Monthly Total
                     </th>
                   )}
                   <th rowSpan={2} className="p-3 border border-indigo-900/40 text-center text-xs font-bold uppercase tracking-wider text-white whitespace-nowrap"
                       style={{ background: 'linear-gradient(135deg,#1e3a5f 0%,#0f4a8e 100%)' }}>
                     Performance
                   </th>
                </tr>
                <tr>
                   {[...Array(showWeeks ? 5 : 1)].map((_, idx) => (
                      <React.Fragment key={idx}>
                         {showTarget && (
                           <th className="p-2.5 border border-indigo-900/30 text-center text-[11px] font-semibold text-blue-100 bg-[#1e3a8a]">
                             Target
                           </th>
                         )}
                         {showLifting && (
                           <th className="p-2.5 border border-indigo-900/30 text-center text-[11px] font-semibold text-emerald-200 bg-[#1e3a8a]">
                             Lifting
                           </th>
                         )}
                         {showLifting && (
                           <th className="p-2.5 border border-indigo-900/30 text-center text-[11px] font-semibold text-amber-200 bg-[#1e3a8a]">
                             Ach %
                           </th>
                         )}
                      </React.Fragment>
                   ))}
                </tr>
             </thead>
             <tbody>
                {renderRows()}

                {/* Grand Total row — hidden in week view (only 1 data row, no need for duplicate total) */}
                {sobView !== 'week' && (
                <tr className="total-row font-bold text-sm border-t-2 border-blue-300"
                    style={{ background: 'linear-gradient(90deg,#dbeafe 0%,#eff6ff 100%)' }}>
                  <td colSpan={
                    (sobView !== 'city' && sobView !== 'state-week' && sobView !== 'week' ? 1 : 0) +
                    (sobView !== 'zone' && sobView !== 'zone-week' && sobView !== 'week' ? 1 : 0) +
                    (liftingType === 'All' ? 1 : 0)
                  } className="p-3 border border-blue-200 text-center text-blue-900 font-black uppercase tracking-wider text-xs">
                    Grand Total                  </td>
                    {showWeeks ? (
                      <>
                        {showTarget && <td className="p-3 border border-blue-200 text-center text-blue-900 font-bold">{grandWeeksTarget.w1}</td>}
                        {showLifting && <td className="p-3 border border-blue-200 text-center text-emerald-700 font-bold">{grandWeeksLifted.w1}</td>}
                        {showLifting && <td className={`p-3 border border-blue-200 text-center font-bold ${getAchColor(getAch(grandWeeksLifted.w1, grandWeeksTarget.w1))}`}>{getAch(grandWeeksLifted.w1, grandWeeksTarget.w1)}%</td>}
                        {showTarget && <td className="p-3 border border-blue-200 text-center text-blue-900 font-bold">{grandWeeksTarget.w2}</td>}
                        {showLifting && <td className="p-3 border border-blue-200 text-center text-emerald-700 font-bold">{grandWeeksLifted.w2}</td>}
                        {showLifting && <td className={`p-3 border border-blue-200 text-center font-bold ${getAchColor(getAch(grandWeeksLifted.w2, grandWeeksTarget.w2))}`}>{getAch(grandWeeksLifted.w2, grandWeeksTarget.w2)}%</td>}
                        {showTarget && <td className="p-3 border border-blue-200 text-center text-blue-900 font-bold">{grandWeeksTarget.w3}</td>}
                        {showLifting && <td className="p-3 border border-blue-200 text-center text-emerald-700 font-bold">{grandWeeksLifted.w3}</td>}
                        {showLifting && <td className={`p-3 border border-blue-200 text-center font-bold ${getAchColor(getAch(grandWeeksLifted.w3, grandWeeksTarget.w3))}`}>{getAch(grandWeeksLifted.w3, grandWeeksTarget.w3)}%</td>}
                        {showTarget && <td className="p-3 border border-blue-200 text-center text-blue-900 font-bold">{grandWeeksTarget.w4}</td>}
                        {showLifting && <td className="p-3 border border-blue-200 text-center text-emerald-700 font-bold">{grandWeeksLifted.w4}</td>}
                        {showLifting && <td className={`p-3 border border-blue-200 text-center font-bold ${getAchColor(getAch(grandWeeksLifted.w4, grandWeeksTarget.w4))}`}>{getAch(grandWeeksLifted.w4, grandWeeksTarget.w4)}%</td>}
                        {showTarget && <td className="p-3 border border-blue-200 text-center text-blue-900 font-black text-base">{grandTotal.target}</td>}
                        {showLifting && <td className="p-3 border border-blue-200 text-center text-emerald-700 font-black text-base">{grandTotal.lifted}</td>}
                        {showLifting && <td className={`p-3 border border-blue-200 text-center font-black text-base ${getAchColor(getAch(grandTotal.lifted, grandTotal.target))}`}>{getAch(grandTotal.lifted, grandTotal.target)}%</td>}
                      </>
                    ) : (
                      <>
                        {showTarget && <td className="p-3 border border-blue-200 text-center text-blue-900 font-black text-base">{grandTotal.target}</td>}
                        {showLifting && <td className="p-3 border border-blue-200 text-center text-emerald-700 font-black text-base">{grandTotal.lifted}</td>}
                        {showLifting && <td className={`p-3 border border-blue-200 text-center font-black text-base ${getAchColor(getAch(grandTotal.lifted, grandTotal.target))}`}>{getAch(grandTotal.lifted, grandTotal.target)}%</td>}
                      </>
                    )}
                  <td className={`p-3 border border-blue-200 text-center font-bold ${getAchColor(getAch(grandTotal.lifted, grandTotal.target))}`}>
                    {getPerformance(getAch(grandTotal.lifted, grandTotal.target))}
                  </td>
                </tr>
                )}
             </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mt-6">
        <button onClick={exportToPDF} className="flex items-center gap-2 bg-[#dc2626] hover:bg-[#b91c1c] text-white px-5 py-2.5 rounded-xl font-medium transition-colors shadow-sm">
          <FileText size={18} />
          Export PDF
        </button>
        <button onClick={exportToExcel} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors shadow-sm">
          <Download size={18} />
          Export Excel
        </button>
      </div>

      <div className="text-center text-sm font-semibold text-[#005689] mt-8 pt-4 border-t border-[#E2E8F0]">
        OEM SOB Monthly Report - {selectedMonth.toUpperCase()} {selectedYear}
      </div>
    </div>
  );
};
