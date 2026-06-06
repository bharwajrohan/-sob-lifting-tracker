import React, { useState, useEffect, useMemo } from 'react';
import { Calendar as CalendarIcon, Trash2, ChevronLeft, ChevronRight, Plus, X, Flag, Save, Settings, Download } from 'lucide-react';
import { useLocalStorage } from './useSyncedStorage';
import { useIndexedDB } from './hooks/useIndexedDB';
import { getOriginZone } from './App';

const getLocalDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function generateDefaultWeeks(year: number, month: number): WeeklyPlan[] {
  const weeks: WeeklyPlan[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  let currentWeekStart = 1;
  let weekNum = 1;

  while (currentWeekStart <= daysInMonth) {
    let currentWeekEnd = currentWeekStart;
    while (currentWeekEnd <= daysInMonth) {
      const date = new Date(year, month, currentWeekEnd);
      if (date.getDay() === 0) { // Sunday
        break;
      }
      currentWeekEnd++;
    }
    
    if (currentWeekEnd > daysInMonth) {
      currentWeekEnd = daysInMonth;
    }

    const startStr = getLocalDateStr(new Date(year, month, currentWeekStart));
    const endStr = getLocalDateStr(new Date(year, month, currentWeekEnd));

    const nth = (d: number) => {
      if (d > 3 && d < 21) return 'TH';
      switch (d % 10) {
        case 1:  return "ST";
        case 2:  return "ND";
        case 3:  return "RD";
        default: return "TH";
      }
    };

    weeks.push({
      id: `${year}-${month}-${weekNum}`,
      name: `${weekNum}${nth(weekNum)} WEEK PLAN`,
      startDate: startStr,
      endDate: endStr,
      workingDays: '',
      targetPct: '',
    });

    currentWeekStart = currentWeekEnd + 1;
    weekNum++;
  }
  
  return weeks;
}

interface DailyEntry {
  target: number | '';
  lifted: number | '';
  notes: string;
}

interface WeeklyPlan {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  workingDays: number | '';
  targetPct: number | '';
  notes?: string;
}

interface PlanningConfig {
  totalSob: number | '';
  completedSob: number | '';
  capacity: number | '';
  trips: number | '';
  workingDays: number | '';
  offDays: number | '';
  sobDate: string;
  leftBalanceManual: number | '';
}

interface Holiday {
  date: string;
  name: string;
  type: 'National' | 'State' | 'Local';
  region?: string;
}

const holidaysList: Holiday[] = [
  { date: '01-01', name: 'New Year', type: 'National' },
  { date: '01-14', name: 'Makar Sankranti / Pongal', type: 'National' },
  { date: '01-26', name: 'Republic Day', type: 'National' },
  { date: '04-14', name: 'Ambedkar Jayanti / Baisakhi', type: 'National' },
  { date: '05-01', name: 'Labour Day / Maharashtra Day', type: 'National' },
  { date: '08-15', name: 'Independence Day', type: 'National' },
  { date: '10-02', name: 'Gandhi Jayanti', type: 'National' },
  { date: '12-25', name: 'Christmas', type: 'National' },

  { date: '2026-02-14', name: 'Maha Shivaratri', type: 'National' },
  { date: '2026-03-03', name: 'Holi', type: 'National' },
  { date: '2026-03-19', name: 'Ugadi / Gudi Padwa', type: 'State', region: 'Karnataka, AP, Telangana, Maharashtra' },
  { date: '2026-03-20', name: 'Eid al-Fitr', type: 'National' },
  { date: '2026-03-28', name: 'Rama Navami', type: 'National' },
  { date: '2026-03-31', name: 'Mahavir Jayanti', type: 'National' },
  { date: '2026-04-03', name: 'Good Friday', type: 'National' },
  { date: '2026-05-01', name: 'Buddha Purnima', type: 'National' },
  { date: '2026-05-27', name: 'Eid al-Adha', type: 'National' },
  { date: '2026-06-26', name: 'Muharram', type: 'National' },
  { date: '2026-08-26', name: 'Eid e Milad', type: 'National' },
  { date: '2026-08-28', name: 'Raksha Bandhan', type: 'National' },
  { date: '2026-09-04', name: 'Janmashtami', type: 'National' },
  { date: '2026-09-14', name: 'Ganesh Chaturthi', type: 'National' },
  { date: '2026-10-18', name: 'Maha Navami', type: 'National' },
  { date: '2026-10-19', name: 'Dussehra', type: 'National' },
  { date: '2026-11-08', name: 'Diwali', type: 'National' },
  { date: '2026-11-09', name: 'Diwali (Day 2) / Karnataka Rajyotsava', type: 'State', region: 'Karnataka, Gujarat, etc.' },
  { date: '2026-11-10', name: 'Bhai Dooj', type: 'National' },
  { date: '2026-11-14', name: 'Chhath Puja', type: 'State', region: 'Bihar, UP, Jharkhand' },
  { date: '2026-11-24', name: 'Guru Nanak Jayanti', type: 'National' },

  { date: '2025-02-26', name: 'Maha Shivaratri', type: 'National' },
  { date: '2025-03-14', name: 'Holi', type: 'National' },
  { date: '2025-03-30', name: 'Ugadi / Gudi Padwa', type: 'State', region: 'Karnataka, AP, Telangana, Maharashtra' },
  { date: '2025-03-31', name: 'Eid al-Fitr', type: 'National' },
  { date: '2025-04-06', name: 'Rama Navami', type: 'National' },
  { date: '2025-04-10', name: 'Mahavir Jayanti', type: 'National' },
  { date: '2025-04-18', name: 'Good Friday', type: 'National' },
  { date: '2025-05-12', name: 'Buddha Purnima', type: 'National' },
  { date: '2025-06-07', name: 'Eid al-Adha', type: 'National' },
  { date: '2025-07-06', name: 'Muharram', type: 'National' },
  { date: '2025-08-09', name: 'Raksha Bandhan', type: 'National' },
  { date: '2025-08-16', name: 'Janmashtami', type: 'National' },
  { date: '2025-08-27', name: 'Ganesh Chaturthi', type: 'National' },
  { date: '2025-09-05', name: 'Eid e Milad', type: 'National' },
  { date: '2025-10-01', name: 'Maha Navami', type: 'National' },
  { date: '2025-10-02', name: 'Dussehra', type: 'National' },
  { date: '2025-10-20', name: 'Diwali', type: 'National' },
  { date: '2025-10-21', name: 'Diwali (Day 2) / Karnataka Rajyotsava', type: 'State', region: 'Karnataka, Gujarat, etc.' },
  { date: '2025-10-23', name: 'Bhai Dooj', type: 'National' },
  { date: '2025-10-27', name: 'Chhath Puja', type: 'State', region: 'Bihar, UP, Jharkhand' },
  { date: '2025-11-05', name: 'Guru Nanak Jayanti', type: 'National' },
];

export const CalendarTab: React.FC<{ masterData?: any[] }> = ({ masterData = [] }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthKey = `${year}_${month}`;

  const [filterOriginZone, setFilterOriginZone] = useState<string>('All');
  const [filterOEM, setFilterOEM] = useState<string>('All');
  const [filterPlant, setFilterPlant] = useState<string>('All');
  const [filterBranch, setFilterBranch] = useState<string>('All');

  const monthData = useMemo(() => {
    const mName = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month];
    const dataList = Array.isArray(masterData) ? masterData : [];
    return dataList.filter(d => Number(d.year) === year && String(d.month).toLowerCase() === mName.toLowerCase());
  }, [masterData, year, month]);

  const uniqueOriginZones = useMemo(() => Array.from(new Set(monthData.map((d: any) => d.originZone || getOriginZone(d.plant || '')).filter(Boolean))).sort(), [monthData]);
  const uniqueOEMs = useMemo(() => Array.from(new Set(monthData.filter(d => filterOriginZone === 'All' || (d.originZone || getOriginZone(d.plant || '')) === filterOriginZone).map((d: any) => d.oem).filter(Boolean))).sort(), [monthData, filterOriginZone]);
  const uniquePlants = useMemo(() => Array.from(new Set(monthData.filter(d => filterOriginZone === 'All' || (d.originZone || getOriginZone(d.plant || '')) === filterOriginZone).filter(d => filterOEM === 'All' || d.oem === filterOEM).map((d: any) => d.plant).filter(Boolean))).sort(), [monthData, filterOriginZone, filterOEM]);
  const uniqueBranches = useMemo(() => Array.from(new Set(monthData.filter(d => filterOriginZone === 'All' || (d.originZone || getOriginZone(d.plant || '')) === filterOriginZone).filter(d => filterOEM === 'All' || d.oem === filterOEM).filter(d => filterPlant === 'All' || d.plant === filterPlant).map((d: any) => d.manageByBranch).filter(Boolean))).sort(), [monthData, filterOriginZone, filterOEM, filterPlant]);

  const handleOriginZoneChange = (e: React.ChangeEvent<HTMLSelectElement>) => { setFilterOriginZone(e.target.value); setFilterOEM('All'); setFilterPlant('All'); setFilterBranch('All'); };
  const handleOEMChange = (e: React.ChangeEvent<HTMLSelectElement>) => { setFilterOEM(e.target.value); setFilterPlant('All'); setFilterBranch('All'); };
  const handlePlantChange = (e: React.ChangeEvent<HTMLSelectElement>) => { setFilterPlant(e.target.value); setFilterBranch('All'); };
  const handleBranchChange = (e: React.ChangeEvent<HTMLSelectElement>) => { setFilterBranch(e.target.value); };

  const [dailyData, setDailyData] = useLocalStorage<Record<string, DailyEntry>>(`tracker_cal_daily_${monthKey}`, {});
  const [config, setConfig] = useLocalStorage<PlanningConfig>(`tracker_cal_cfg_${monthKey}`, {
    totalSob: '',
    completedSob: '',
    capacity: 6,
    trips: 1,
    workingDays: '',
    offDays: '',
    sobDate: getLocalDateStr(new Date()),
    leftBalanceManual: ''
  });
  
  const [weeks, setWeeks] = useLocalStorage<WeeklyPlan[]>(`tracker_cal_weeks_${monthKey}`, generateDefaultWeeks(year, month));

  const [entryLogs] = useIndexedDB<{date: string, lifted: number, originZone?: string, oem?: string, plant?: string, statecity?: string}[]>('tracker_entryLogs_v7', []);
  const globalLiftedByDate = useMemo(() => {
    const acc: Record<string, number> = {};
    const logsList = Array.isArray(entryLogs) ? entryLogs : [];
    logsList.filter((log: any) => {
      if (filterOriginZone !== 'All' && (log.originZone || getOriginZone(log.plant || '')) !== filterOriginZone) return false;
      if (filterOEM !== 'All' && log.oem !== filterOEM) return false;
      if (filterPlant !== 'All' && log.plant !== filterPlant) return false;
      if (filterBranch !== 'All' && log.manageByBranch !== filterBranch) return false;
      return true;
    }).forEach(log => {
      if (log.date && log.lifted) {
        try {
          let d = new Date(log.date);
          if (isNaN(d.getTime())) {
            const datePart = log.date.split(',')[0].split(' ')[0];
            const parts = datePart.split(/[\/\-]/);
            if (parts.length === 3) {
              const p0 = Number(parts[0]);
              const p1 = Number(parts[1]);
              const p2 = Number(parts[2]);
              if (p2 > 2000) {
                if (p1 > 12) {
                  d = new Date(p2, p0 - 1, p1);
                } else {
                  d = new Date(p2, p1 - 1, p0);
                }
              }
            }
          }

          if (!isNaN(d.getTime())) {
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            acc[dateStr] = (acc[dateStr] || 0) + Number(log.lifted);
          }
        } catch (e) {
          console.error('Date parse error', e);
        }
      }
    });
    return acc;
  }, [entryLogs, filterOriginZone, filterOEM, filterPlant, filterBranch]);

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const startingDayIndex = firstDay === 0 ? 6 : firstDay - 1;
  const prevMonthDays = new Date(year, month, 0).getDate();

  interface CalendarCell {
    day: number;
    isCurrentMonth: boolean;
    dateStr: string;
    holiday?: any;
    isSunday?: boolean;
    isOff?: boolean;
  }
  const calendarCells: CalendarCell[] = [];
  let autoOffDaysCount = 0;

  for (let i = 0; i < 42; i++) {
    if (i < startingDayIndex) {
      calendarCells.push({ 
        day: prevMonthDays - startingDayIndex + i + 1, 
        isCurrentMonth: false, 
        dateStr: getLocalDateStr(new Date(year, month - 1, prevMonthDays - startingDayIndex + i + 1))
      });
    } else if (i < startingDayIndex + daysInMonth) {
      const d = i - startingDayIndex + 1;
      const dateObj = new Date(year, month, d);
      const isSunday = dateObj.getDay() === 0;
      const mmdd = `${String(month+1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const ymd = `${year}-${mmdd}`;
      const holiday = holidaysList.find(h => h.date === mmdd || h.date === ymd);
      const isOff = isSunday || !!holiday;
      
      if (isOff) autoOffDaysCount++;

      calendarCells.push({ 
        day: d, 
        isCurrentMonth: true,
        dateStr: getLocalDateStr(dateObj),
        holiday,
        isSunday,
        isOff
      });
    } else {
      const d = i - startingDayIndex - daysInMonth + 1;
      calendarCells.push({ 
        day: d, 
        isCurrentMonth: false,
        dateStr: getLocalDateStr(new Date(year, month + 1, d))
      });
    }
  }

  const activeOffDays = config.offDays !== '' ? Number(config.offDays) : autoOffDaysCount;
  const autoWorkingDays = daysInMonth - activeOffDays;
  const activeWorkingDays = config.workingDays !== '' ? Number(config.workingDays) : autoWorkingDays;

  const currentMonthHolidays = useMemo(() => {
    return holidaysList.filter(h => {
      const isFixed = h.date.length === 5;
      if (isFixed) {
        const [m] = h.date.split('-');
        return Number(m) === month + 1;
      } else {
        const [y, m] = h.date.split('-');
        return Number(y) === year && Number(m) === month + 1;
      }
    }).sort((a, b) => {
      const getDay = (dateStr: string) => Number(dateStr.split('-').pop());
      return getDay(a.date) - getDay(b.date);
    });
  }, [year, month]);

  const capacity = Number(config.capacity) || 6;
  const trips = Number(config.trips) || 1;

  const autoTotalCarsTarget = useMemo(() => {
    return monthData.filter(d => {
      if (filterOriginZone !== 'All' && (d.originZone || getOriginZone(d.plant || '')) !== filterOriginZone) return false;
      if (filterOEM !== 'All' && d.oem !== filterOEM) return false;
      if (filterPlant !== 'All' && d.plant !== filterPlant) return false;
      if (filterBranch !== 'All' && d.manageByBranch !== filterBranch) return false;
      return true;
    }).reduce((sum, d) => {
      let recTarget = Number(d.target) || 0;
      if (recTarget === 0 && Array.isArray(d.weeklyBreakdown) && d.weeklyBreakdown.length > 0) {
        recTarget = d.weeklyBreakdown.reduce((acc: number, wb: any) => acc + (Number(wb.cars) || 0), 0);
      }
      return sum + recTarget;
    }, 0);
  }, [monthData, filterOriginZone, filterOEM, filterPlant, filterBranch]);

  const totalSob = (config.totalSob !== '' && Number(config.totalSob) > 0) ? Number(config.totalSob) : autoTotalCarsTarget;
  const autoDailyTargetRounded = activeWorkingDays > 0 ? Math.ceil(totalSob / activeWorkingDays) : 0;

  const handleDailyChange = (dateStr: string, field: keyof DailyEntry, value: any) => {
    setDailyData(prev => ({
      ...prev,
      [dateStr]: {
        ...(prev[dateStr] || { target: '', lifted: '', notes: '' }),
        [field]: value === '' ? '' : (field === 'notes' ? value : Number(value))
      }
    }));
  };

  const handleConfigChange = (field: keyof PlanningConfig, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleWeekChange = (id: string, field: keyof WeeklyPlan, value: any) => {
    if (field === 'targetPct' && value !== '') {
      let numVal = Number(value);
      if (numVal < 0) numVal = 0;
      
      const otherWeeksPct = weeks.filter(w => w.id !== id).reduce((acc, w) => acc + (w.targetPct !== '' ? Number(w.targetPct) : 0), 0);
      if (numVal + otherWeeksPct > 100) {
        numVal = 100 - otherWeeksPct;
      }
      value = numVal;
    }
    setWeeks(prev => prev.map(w => w.id === id ? { ...w, [field]: value } : w));
  };

  const addWeek = () => {
    const newId = Date.now().toString();
    setWeeks(prev => [...prev, { id: newId, name: `${prev.length + 1}TH WEEK PLAN`, startDate: '', endDate: '', workingDays: '', targetPct: '', notes: '' }]);
  };

  const removeWeek = (id: string) => {
    setWeeks(prev => prev.filter(w => w.id !== id));
  };

  const clearAllData = () => {
    if (window.confirm('Are you sure you want to clear all calendar and planning data?')) {
      setDailyData({});
      setConfig({ totalSob: '', completedSob: '', capacity: 6, trips: 1, workingDays: '', offDays: '', sobDate: getLocalDateStr(new Date()), leftBalanceManual: '' });
      setWeeks(generateDefaultWeeks(year, month));
    }
  };

  const totalTrailerMonth = (capacity > 0 && trips > 0) ? Math.ceil(totalSob / (capacity * trips)) : 0;
  const totalLoadsRequired = capacity > 0 ? (totalSob / capacity) : 0;
  const avgLoadCarrier = activeWorkingDays > 0 ? Math.round(totalLoadsRequired / activeWorkingDays).toString() : "0";
  const avgLiftedCar = activeWorkingDays > 0 ? Math.round(totalSob / activeWorkingDays).toString() : "0";
  const autoDailyTargetFraction = activeWorkingDays > 0 ? (totalSob / activeWorkingDays) : 0;

  let monthTarget = 0;
  let monthLifted = 0;
  
  let liftedTillDate = 0;
  let remainingWorkingDays = 0;
  
  calendarCells.filter(c => c.isCurrentMonth).forEach(c => {
    const entry = dailyData[c.dateStr] || { target: '', lifted: '', notes: '' };
    const effTgt = entry.target !== '' ? (Number(entry.target) || 0) : (!c.isOff ? autoDailyTargetRounded : 0);
    const effLft = entry.lifted !== '' ? (Number(entry.lifted) || 0) : (globalLiftedByDate[c.dateStr] || 0);

    monthTarget += effTgt;
    monthLifted += effLft;

    if (c.dateStr <= config.sobDate) {
      liftedTillDate += effLft;
    }
    
    if (c.dateStr > config.sobDate && !c.isOff) {
      remainingWorkingDays++;
    }
  });

  const actualCompletedSob = config.completedSob !== '' ? (Number(config.completedSob) || 0) : monthLifted;

  const autoLeftBalance = Math.max(0, totalSob - liftedTillDate);
  const leftBalance = config.leftBalanceManual !== '' ? (Number(config.leftBalanceManual) || 0) : autoLeftBalance;
  const perDayLiftedBalance = remainingWorkingDays > 0 ? Math.round(leftBalance / remainingWorkingDays).toString() : "0";

  const carRemaining = Math.max(0, totalSob - actualCompletedSob); // Shortfall amount
  const carrierTotalMonth = (capacity > 0 && trips > 0) ? Math.ceil(totalSob / (capacity * trips)) : 0;
  const carrierLiftedMonth = (capacity > 0 && trips > 0) ? Math.ceil(actualCompletedSob / (capacity * trips)) : 0;
  const carrierRemaining = Math.max(0, carrierTotalMonth - carrierLiftedMonth);

  const processedWeeksRaw = useMemo(() => {
    return weeks.map(week => {
      let lCars = 0;
      let actDays = 0;
      let autoWeekWorkDays = 0;

      if (week.startDate && week.endDate) {
        const [sy, sm, sd] = week.startDate.split('-').map(Number);
        const [ey, em, ed] = week.endDate.split('-').map(Number);
        const start = new Date(sy, sm - 1, sd);
        const end = new Date(ey, em - 1, ed);
        
        if (end.getTime() >= start.getTime()) {
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            if (d.getFullYear() === year && d.getMonth() === month) {
              actDays++;
              
              const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              const entry = dailyData[ds] || { target: '', lifted: '' };
              const cell = calendarCells.find(c => c.dateStr === ds);
              let isOff = false;
              if (cell) {
                isOff = cell.isOff ?? false;
              } else {
                const isSunday = d.getDay() === 0;
                const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const ymd = `${d.getFullYear()}-${mmdd}`;
                const holiday = holidaysList.find(h => h.date === mmdd || h.date === ymd);
                isOff = isSunday || !!holiday;
              }
              
              if (!isOff) autoWeekWorkDays++;
              
              const lVal = entry.lifted !== '' ? Number(entry.lifted) : (globalLiftedByDate[ds] || 0);
              lCars += lVal;
            }
          }
        }
      }

      return {
        ...week,
        actDays,
        autoWeekWorkDays,
        lCars
      };
    });
  }, [weeks, dailyData, globalLiftedByDate, calendarCells, year, month]);

  const processedWeeks = useMemo(() => {
    const totalAutoWeekWorkDays = processedWeeksRaw.reduce((acc, w) => acc + w.autoWeekWorkDays, 0) || 1;
    let remainingActiveWorkDays = activeWorkingDays;
    let remainingTotalSob = totalSob;

    return processedWeeksRaw.map((week, idx) => {
      let effWorkDays = 0;
      if (idx === processedWeeksRaw.length - 1) {
        effWorkDays = remainingActiveWorkDays;
      } else {
        effWorkDays = Math.round((week.autoWeekWorkDays / totalAutoWeekWorkDays) * activeWorkingDays);
        remainingActiveWorkDays -= effWorkDays;
      }

      let tCars = 0;
      if (week.targetPct !== '') {
        tCars = Math.round(totalSob * ((Number(week.targetPct) || 0) / 100));
      } else {
        tCars = Math.round(effWorkDays * autoDailyTargetFraction);
      }
      
      // Ensure we don't accidentally add more target cars than what's remaining.
      if (tCars > remainingTotalSob) {
        tCars = remainingTotalSob > 0 ? remainingTotalSob : 0;
      }
      
      // If it's the last week, give it exactly the remaining balance to fix rounding issues
      if (idx === processedWeeksRaw.length - 1) {
        tCars = remainingTotalSob > 0 ? remainingTotalSob : 0;
      }
      
      remainingTotalSob -= tCars;

      const tCarrier = capacity > 0 ? Math.ceil(tCars / capacity) : 0;
      const lCarrier = capacity > 0 ? Math.ceil(week.lCars / capacity) : 0;
      const bCar = tCars - week.lCars;
      const bCarrier = tCarrier - lCarrier;
      const pct = tCars > 0 ? (week.lCars / tCars) * 100 : (week.lCars > 0 ? 100 : 0);

      return {
        ...week,
        effWorkDays,
        tCars,
        tCarrier,
        lCarrier,
        bCar,
        bCarrier,
        pct
      };
    });
  }, [processedWeeksRaw, activeWorkingDays, totalSob, autoDailyTargetFraction, capacity]);

  const todayStr = getLocalDateStr(new Date());

  return (
    <div className="bg-[#F8FAFC] min-h-screen p-4 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <CalendarIcon className="text-blue-600" />
            Interactive Planning Dashboard
          </h2>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        <div className="xl:w-[55%] flex flex-col gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex justify-center items-center bg-slate-50 p-4 border-b border-slate-200">
              <div className="flex border-2 border-slate-800 rounded-lg overflow-hidden bg-white">
                <select 
                  value={year} 
                  onChange={(e) => setCurrentDate(new Date(parseInt(e.target.value), month, 1))}
                  className="px-4 py-2 font-bold text-xl border-r-2 border-slate-800 bg-[#FDEFE7] text-slate-800 focus:outline-none cursor-pointer hover:bg-[#fcdbc7]"
                >
                  {Array.from({length: 10}, (_, i) => new Date().getFullYear() - 5 + i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <select 
                  value={month} 
                  onChange={(e) => setCurrentDate(new Date(year, parseInt(e.target.value), 1))}
                  className="px-4 py-2 font-bold text-xl bg-[#FDEFE7] text-slate-800 uppercase min-w-[140px] text-center focus:outline-none cursor-pointer hover:bg-[#fcdbc7]"
                >
                  {Array.from({length: 12}, (_, i) => i).map(m => (
                    <option key={m} value={m}>
                      {new Date(2000, m, 1).toLocaleString('default', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[650px]">
                <div className="grid grid-cols-7 border-b border-t border-slate-800 text-center bg-[#FDE047]">
                  {['MON', 'TUE', 'WED', 'THU', 'FRI'].map((d) => (
                    <div key={d} className="font-bold py-2 border-l border-slate-800 text-slate-800">{d}</div>
                  ))}
                  {['SAT', 'SUN'].map((d, i) => (
                    <div key={d} className={`font-bold py-2 border-l border-slate-800 ${i === 1 ? 'bg-[#FEF08A] text-red-600' : 'text-slate-800'}`}>{d}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 border-l border-slate-800">
                  {calendarCells.map((c, i) => {
                    const entry = dailyData[c.dateStr] || { target: '', lifted: '', notes: '' };
                    const isToday = c.dateStr === todayStr;

                    const effTgt = entry.target !== '' ? entry.target : (c.isCurrentMonth && !c.isOff ? autoDailyTargetRounded : '');
                    const effLft = entry.lifted !== '' ? entry.lifted : (globalLiftedByDate[c.dateStr] || '');
                    
                    const isHoliday = !!c.holiday;
                    let bgColor = !c.isCurrentMonth ? 'bg-slate-50 opacity-60' : (c.isSunday || isHoliday ? 'bg-orange-50/40' : 'bg-white');

                    return (
                      <div key={i} className={`relative border-b border-r border-slate-800 min-h-[110px] flex flex-col ${bgColor} ${isToday ? 'ring-2 ring-inset ring-blue-500 bg-blue-50/30' : ''} p-1 hover:bg-slate-50 transition-colors group`}>
                        <div className="flex justify-between items-start mb-1 h-4">
                          <div className="flex flex-col gap-0.5 max-w-[70%]">
                            {isHoliday && (
                              <div className="text-[9px] font-bold text-red-600 leading-tight flex items-center pr-1" title={c.holiday?.name}>
                                <Flag size={10} className="mr-0.5 shrink-0" />
                                <span className="line-clamp-1">{c.holiday?.name}</span>
                              </div>
                            )}
                          </div>
                          <div className={`font-bold px-1 text-right text-lg ${(c.isSunday || isHoliday) ? 'text-red-500' : 'text-slate-800'} ${!c.isCurrentMonth && 'text-slate-400'}`}>
                            {c.day.toString().padStart(2, '0')}
                          </div>
                        </div>
                        
                        <div className="flex-1 flex flex-col justify-end gap-1">
                          {c.isCurrentMonth && (
                            <>
                              <div className="flex justify-between items-center group-hover:bg-slate-100 rounded px-1 transition-colors">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Tgt</span>
                                <input 
                                  type="text"
                                  className={`w-12 h-6 text-[11px] text-right border rounded-sm p-0 pr-1 font-bold tracking-tight focus:outline-none focus:border-blue-500 focus:bg-white ${entry.target === '' && autoDailyTargetRounded > 0 && !c.isOff ? 'text-slate-400 bg-slate-50 border-dashed border-slate-300 placeholder:text-slate-400' : 'text-slate-800 border-slate-300 bg-white focus:ring-1 focus:ring-blue-500'}`}
                                  title={entry.target === '' && autoDailyTargetRounded > 0 && !c.isOff ? "Auto-calculated target (Total SOB / Working Days)" : "Target Cars"}
                                  value={entry.target !== '' ? entry.target : ''}
                                  placeholder={entry.target === '' && autoDailyTargetRounded > 0 && !c.isOff ? String(effTgt) : '-'}
                                  onChange={(e) => handleDailyChange(c.dateStr, 'target', e.target.value)}
                                />
                              </div>
                              <div className="flex justify-between items-center group-hover:bg-slate-100 rounded px-1 transition-colors">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Lft</span>
                                <input 
                                  type="text"
                                  className={`w-12 h-6 text-[11px] text-right border rounded-sm p-0 pr-1 font-bold tracking-tight focus:outline-none focus:border-blue-500 focus:bg-white ${entry.lifted === '' && globalLiftedByDate[c.dateStr] ? 'text-blue-600 bg-blue-50 border-dashed border-blue-300 placeholder:text-blue-600' : (Number(effLft) > 0 ? 'text-green-700 bg-green-50 border-green-300 focus:ring-1 focus:ring-blue-500' : 'text-slate-800 border-slate-300 bg-white focus:ring-1 focus:ring-blue-500')}`}
                                  title={entry.lifted === '' && globalLiftedByDate[c.dateStr] ? "Auto-synced from daily entry logs" : "Lifted Cars"}
                                  value={entry.lifted !== '' ? entry.lifted : ''}
                                  placeholder={entry.lifted === '' && globalLiftedByDate[c.dateStr] ? String(effLft) : '-'}
                                  onChange={(e) => handleDailyChange(c.dateStr, 'lifted', e.target.value)}
                                />
                              </div>
                            </>
                          )}
                          <input 
                            type="text" 
                            value={entry.notes}
                            placeholder="Notes..."
                            onChange={(e) => handleDailyChange(c.dateStr, 'notes', e.target.value)}
                            className="w-full text-[10px] border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none bg-transparent px-1 mt-auto italic text-slate-600 placeholder:text-slate-300"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="xl:w-[45%] flex flex-col gap-6">
          <div className="flex flex-col gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-[#FDEFE7] text-center font-bold py-2 border-b border-slate-800 text-slate-800 uppercase tracking-wider text-sm">Total days</div>
              
              <table className="w-full text-sm border-collapse rounded-b-xl overflow-hidden">
                <tbody>
                  <tr>
                    <td className="bg-[#86EFAC] font-bold p-2 border-r border-slate-800 text-xs text-slate-800 w-1/4">WORKING DAY</td>
                    <td className="p-2 bg-white text-center font-bold text-slate-800 text-lg w-1/4 border-r border-slate-800">
                      {autoWorkingDays}
                    </td>
                    <td className="bg-[#86EFAC] font-bold p-2 border-r border-slate-800 text-xs text-slate-800 w-1/4">OFF DAY</td>
                    <td className="p-0 bg-white text-center font-bold text-red-600 text-lg w-1/4">
                      <input type="number" value={config.offDays} onChange={e => handleConfigChange('offDays', e.target.value)} className={`w-full h-full p-2 text-center font-bold focus:outline-none focus:bg-blue-50 ${config.offDays === '' ? 'text-red-700 italic' : 'text-red-600'}`} placeholder={autoOffDaysCount.toString()} title="Edit override, leave blank for auto" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="font-bold text-slate-800">Weekly Execution Plan</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="px-2 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-500 shadow-sm" value={filterOriginZone} onChange={handleOriginZoneChange}>
              <option value="All">All Origin Zones</option>
              {uniqueOriginZones.map((z: unknown) => <option key={z as string} value={z as string}>{z as string}</option>)}
            </select>
            <select className="px-2 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-500 shadow-sm" value={filterOEM} onChange={handleOEMChange}>
              <option value="All">All OEMs</option>
              {uniqueOEMs.map((o: unknown) => <option key={o as string} value={o as string}>{o as string}</option>)}
            </select>
            <select className="px-2 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-500 shadow-sm" value={filterPlant} onChange={handlePlantChange}>
              <option value="All">All Plants</option>
              {uniquePlants.map((p: unknown) => <option key={p as string} value={p as string}>{p as string}</option>)}
            </select>
            <select className="px-2 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-500 shadow-sm max-w-[150px] truncate" value={filterBranch} onChange={handleBranchChange}>
              <option value="All">All Branches</option>
              {uniqueBranches.map((b: unknown) => <option key={b as string} value={b as string}>{b as string}</option>)}
            </select>
          </div>
        </div>
        
        <div className="overflow-x-auto p-4 max-w-full">
          <table className="w-full text-sm border-collapse border border-slate-800 min-w-[1100px]">
              <thead>
                <tr className="bg-slate-200 border-b-2 border-slate-800">
                  <th className="p-2 border-r border-slate-800 font-bold text-left w-[140px]">Week Plan</th>
                  <th className="p-2 border-r border-slate-800 font-bold w-[120px]">Start Date</th>
                  <th className="p-2 border-r border-slate-800 font-bold w-[120px]">End Date</th>
                  <th className="p-2 border-r border-slate-800 font-bold w-[60px]">Total<br/>Days</th>
                  <th className="p-2 border-r border-slate-800 font-bold w-[70px]">Work<br/>Days</th>
                  <th className="p-2 border-r border-slate-800 font-bold w-[60px] text-[10px]">Target<br/>PCT %</th>
                  <th className="p-2 border-r border-slate-800 bg-[#FDE047] font-bold w-[70px]">Target<br/>Cars</th>
                  <th className="p-2 border-r border-slate-800 bg-[#86EFAC] font-bold w-[70px]">Lifted<br/>Car</th>
                  <th className="p-2 border-r border-slate-800 font-bold w-[70px]">Bal.<br/>Car</th>
                  <th className="p-2 border-r border-slate-800 font-bold w-[90px]">Achiev. %</th>
                  <th className="p-2 border-r border-slate-800 font-bold w-[150px]">Notes</th>
                </tr>
              </thead>
              <tbody>
                {processedWeeks.map((week, idx) => {
                  return (
                    <tr key={week.id} className="border-b border-slate-800 hover:bg-slate-50 bg-white">
                      <td className="p-2 border-r border-slate-800 text-slate-800 font-bold">
                        {week.name}
                      </td>
                      <td className="p-2 border-r border-slate-800 text-slate-700 text-xs font-semibold text-center">
                        {week.startDate}
                      </td>
                      <td className="p-2 border-r border-slate-800 text-slate-700 text-xs font-semibold text-center">
                        {week.endDate}
                      </td>
                      <td className="p-2 border-r border-slate-800 text-center font-bold text-slate-600 bg-slate-50">{week.actDays > 0 ? week.actDays : '-'}</td>
                      <td className="p-2 border-r border-slate-800 text-center font-bold text-slate-800">
                        {week.effWorkDays}
                      </td>
                      <td className="p-0 border-r border-slate-800">
                        <input type="number" className="w-full p-2 bg-slate-50 text-center font-bold focus:bg-blue-100 focus:outline-none placeholder:text-slate-300 text-slate-700" value={week.targetPct} onChange={e => handleWeekChange(week.id, 'targetPct', e.target.value)} placeholder="-" title="Percentage of Total SOB Target" />
                      </td>
                      
                      <td className="p-2 border-r border-slate-800 text-center font-bold bg-[#FEF9C3]">{week.tCars > 0 ? week.tCars : '-'}</td>
                      
                      <td className="p-2 border-r border-slate-800 text-center font-bold text-green-700 bg-[#DCFCE7] shadow-inner">{week.lCars > 0 ? week.lCars : '-'}</td>
                      
                      <td className={`p-2 border-r border-slate-800 text-center font-bold ${week.lCars > week.tCars ? 'text-green-600 bg-green-50' : (week.tCars > week.lCars ? 'text-red-600 bg-red-50' : 'text-slate-600')}`}>
                        {week.lCars > week.tCars ? `+${week.lCars - week.tCars}` : (week.tCars > week.lCars ? (week.tCars - week.lCars) : '-')}
                      </td>
                      
                      <td className="p-2 border-r border-slate-800 text-center font-bold">
                        <div className="flex items-center justify-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${week.pct >= 100 ? 'bg-green-100 text-green-800' : week.pct > 50 ? 'bg-yellow-100 text-yellow-800' : week.pct > 0 ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-500'}`}>
                            {Math.round(week.pct)}%
                          </span>
                        </div>
                      </td>
                      <td className="p-0 border-r border-slate-800">
                        <input type="text" className="w-full p-2 bg-slate-50 focus:bg-blue-100 focus:outline-none placeholder:text-slate-300 text-slate-700 text-xs" value={week.notes || ''} onChange={e => handleWeekChange(week.id, 'notes', e.target.value)} placeholder="Notes..." />
                      </td>
                    </tr>
                  );
                })}
                {processedWeeks.length > 0 && (
                  (() => {
                    const gtDays = processedWeeks.reduce((acc, w) => acc + w.actDays, 0);
                    const gtWorkDays = processedWeeks.reduce((acc, w) => acc + w.effWorkDays, 0);
                    const gtTCars = processedWeeks.reduce((acc, w) => acc + w.tCars, 0);
                    const gtLCars = processedWeeks.reduce((acc, w) => acc + w.lCars, 0);
                    const gtBCars = processedWeeks.reduce((acc, w) => acc + w.bCar, 0);
                    const gtPct = gtTCars > 0 ? (gtLCars / gtTCars) * 100 : (gtLCars > 0 ? 100 : 0);

                    const gtTargetPct = processedWeeks.reduce((acc, w) => acc + (w.targetPct !== '' ? Number(w.targetPct) : 0), 0);

                    return (
                      <tr className="bg-slate-200 border-t-2 border-b-2 border-slate-800 h-10">
                        <td colSpan={3} className="p-2 border-r border-slate-800 text-right font-black uppercase text-slate-800 tracking-wider">
                          Grand Total
                        </td>
                        <td className="p-2 border-r border-slate-800 text-center font-black text-slate-800">
                          {gtDays > 0 ? gtDays : '-'}
                        </td>
                        <td className="p-2 border-r border-slate-800 text-center font-black text-slate-800">
                          {gtWorkDays > 0 ? gtWorkDays : '-'}
                        </td>
                        <td className="p-2 border-r border-slate-800 text-center font-black text-slate-800 bg-slate-300">
                          {gtTargetPct > 0 ? gtTargetPct + '%' : '-'}
                        </td>
                        <td className="p-2 border-r border-slate-800 text-center font-black bg-[#FEF9C3]">
                          {gtTCars > 0 ? gtTCars : '-'}
                        </td>
                        <td className="p-2 border-r border-slate-800 text-center font-black text-green-700 bg-[#DCFCE7] shadow-inner">
                          {gtLCars > 0 ? gtLCars : '-'}
                        </td>
                        <td className={`p-2 border-r border-slate-800 text-center font-black ${gtLCars > gtTCars ? 'text-green-700 bg-green-100' : (gtTCars > gtLCars ? 'text-red-700 bg-red-100' : 'text-slate-700')}`}>
                          {gtLCars > gtTCars ? `+${gtLCars - gtTCars}` : (gtTCars > gtLCars ? (gtTCars - gtLCars) : '-')}
                        </td>
                        <td className="p-2 border-r border-slate-800 text-center font-black">
                          {Math.round(gtPct)}%
                        </td>
                        <td className="p-2 border-r border-slate-800"></td>
                      </tr>
                    );
                  })()
                )}
                {weeks.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-slate-500 italic">No weekly plans created. Click "Add Week" to start planning.</td>
                  </tr>
                )}
              </tbody>
            </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-800">Monthly Holiday List</h3>
          </div>
        </div>
        
        <div className="p-4">
          {currentMonthHolidays.length > 0 ? (
            <table className="w-full text-sm border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="p-3 border-r border-slate-200 font-bold text-left w-32">Date</th>
                  <th className="p-3 border-r border-slate-200 font-bold text-left">Festival Name</th>
                  <th className="p-3 font-bold text-left">State Celebrate (Type)</th>
                </tr>
              </thead>
              <tbody>
                {currentMonthHolidays.map((holiday, idx) => {
                  const day = holiday.date.split('-').pop();
                  const dateStr = `${day} ${new Date(year, month).toLocaleString('default', { month: 'short' })}`;
                  return (
                    <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50">
                      <td className="p-3 border-r border-slate-200 font-medium">{dateStr}</td>
                      <td className="p-3 border-r border-slate-200 text-slate-800">{holiday.name}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${holiday.type === 'National' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>
                          {holiday.type}{holiday.region ? ` (${holiday.region})` : ''}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center p-6 text-slate-500 italic border border-slate-200 rounded-lg bg-slate-50">
              No holidays this month.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
