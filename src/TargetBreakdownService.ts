/**
 * TargetBreakdownService.ts
 *
 * Global temporal breakdown engine for target management.
 *
 * Responsibilities
 * ─────────────────
 * 1. Accept a target value + period type (monthly | weekly) and produce an
 *    array of DailyTargetRecord rows — one per calendar day.
 * 2. Guarantee that the sum of all daily rows equals the original input exactly
 *    (remainder is added to the last day of the period).
 * 3. Provide aggregation helpers that roll daily rows up to weekly or monthly
 *    buckets — used by every dashboard widget and report so all views are
 *    mathematically consistent.
 * 4. Persist the daily rows in localStorage under a stable key derived from
 *    the parent TransportRecord id, and expose CRUD helpers.
 *
 * Storage key schema
 * ──────────────────
 *   tracker_daily_targets_v1   →  DailyTargetRecord[]
 *
 * All consumers read from this single key and aggregate upward; they never
 * store their own pre-aggregated totals.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** One calendar day of target data linked to a parent TransportRecord. */
export interface DailyTargetRecord {
  /** Stable unique id: `${parentId}::${dateStr}` */
  id: string;
  /** Foreign key → TransportRecord.id */
  parentId: string;
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** Calendar year */
  year: number;
  /** Full month name, e.g. "January" */
  month: string;
  /** ISO week number (Mon–Sun, 1-based within the month for display) */
  weekOfMonth: number;
  /** ISO week number within the year (1–53) */
  isoWeek: number;
  /** Car target for this day */
  targetCars: number;
  /** Trailer target for this day */
  targetTrailers: number;
  /** Denormalised fields for fast filtering (avoids joining back to parent) */
  oem: string;
  plant: string;
  statecity: string;
  zone: string;
}

/** Input to the breakdown engine. */
export interface BreakdownInput {
  /** The parent TransportRecord id this breakdown belongs to. */
  parentId: string;
  /** 'monthly' → distribute evenly across all days of the month.
   *  'weekly'  → distribute evenly across the 7 days of the week range. */
  periodType: 'monthly' | 'weekly';
  /** Total car target to distribute. */
  targetCars: number;
  /** Total trailer target to distribute. */
  targetTrailers: number;
  /** Full month name, e.g. "January". Required for both period types. */
  month: string;
  /** Calendar year. */
  year: number;
  /** Only for 'weekly': ISO date string of the first day of the week. */
  weekStartDate?: string;
  /** Only for 'weekly': ISO date string of the last day of the week. */
  weekEndDate?: string;
  /** Denormalised fields copied to every daily row. */
  oem: string;
  plant: string;
  statecity: string;
  zone: string;
}

/** A weekly bucket produced by aggregating daily rows. */
export interface WeeklyAggregate {
  /** Label, e.g. "W1 (01 Jan – 07 Jan)" */
  label: string;
  weekOfMonth: number;
  isoWeek: number;
  /** First date in the bucket (YYYY-MM-DD) */
  startDate: string;
  /** Last date in the bucket (YYYY-MM-DD) */
  endDate: string;
  targetCars: number;
  targetTrailers: number;
  /** Which months this week spans (useful for cross-month weeks) */
  months: string[];
}

/** A monthly bucket produced by aggregating daily rows. */
export interface MonthlyAggregate {
  year: number;
  month: string;
  targetCars: number;
  targetTrailers: number;
}

// ─── Storage key ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'tracker_daily_targets_v1';

// ─── Utility helpers ──────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Returns the 0-based month index for a full month name. */
function monthIndex(monthName: string): number {
  const idx = MONTHS.indexOf(monthName);
  if (idx === -1) throw new Error(`Unknown month: "${monthName}"`);
  return idx;
}

/** Returns the number of days in a given month/year. */
export function daysInMonth(year: number, month: string): number {
  return new Date(year, monthIndex(month) + 1, 0).getDate();
}

/** Formats a Date as YYYY-MM-DD (local time, no UTC shift). */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parses a YYYY-MM-DD string into a local Date (avoids UTC midnight shift). */
function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Returns the ISO week number within the year (1–53).
 * Uses the standard ISO 8601 definition (week starts Monday).
 */
function isoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7; // Mon=1 … Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Returns the week-of-month number (1-based) for a given date.
 * Week 1 = days 1–7, Week 2 = days 8–14, etc.
 */
function weekOfMonth(d: Date): number {
  return Math.ceil(d.getDate() / 7);
}

// ─── Core breakdown engine ────────────────────────────────────────────────────

/**
 * Distributes `total` evenly across `count` slots.
 * Returns an array of integers that sum to exactly `total`.
 * The remainder (total % count) is added to the LAST slot.
 */
function distributeEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  const slots = Array(count).fill(base) as number[];
  // Add remainder to the last slot so the sum is exact
  slots[slots.length - 1] += remainder;
  return slots;
}

/**
 * Builds the full array of DailyTargetRecord rows for a monthly target.
 *
 * Algorithm:
 *   1. Determine the number of days D in the month.
 *   2. base = floor(targetCars / D), remainder = targetCars % D.
 *   3. Each day gets `base` cars; the last day of the month gets `base + remainder`.
 *   4. Same logic applied independently to targetTrailers.
 */
function breakdownMonthly(input: BreakdownInput): DailyTargetRecord[] {
  const { parentId, year, month, targetCars, targetTrailers, oem, plant, statecity, zone } = input;
  const mIdx = monthIndex(month);
  const days = daysInMonth(year, month);

  const carSlots = distributeEvenly(targetCars, days);
  const trailerSlots = distributeEvenly(targetTrailers, days);

  return carSlots.map((cars, i) => {
    const d = new Date(year, mIdx, i + 1);
    const dateStr = toDateStr(d);
    return {
      id: `${parentId}::${dateStr}`,
      parentId,
      date: dateStr,
      year,
      month,
      weekOfMonth: weekOfMonth(d),
      isoWeek: isoWeekNumber(d),
      targetCars: cars,
      targetTrailers: trailerSlots[i],
      oem, plant, statecity, zone,
    };
  });
}

/**
 * Builds DailyTargetRecord rows for a weekly target.
 *
 * Algorithm:
 *   1. Enumerate every calendar day from weekStartDate to weekEndDate (inclusive).
 *   2. Distribute targetCars evenly across those days (remainder → last day).
 *   3. If the week spans two months, each day is tagged with its own month name
 *      so cross-month aggregation works correctly.
 */
function breakdownWeekly(input: BreakdownInput): DailyTargetRecord[] {
  const { parentId, year, targetCars, targetTrailers, oem, plant, statecity, zone } = input;

  if (!input.weekStartDate || !input.weekEndDate) {
    throw new Error('weekStartDate and weekEndDate are required for weekly breakdown');
  }

  const start = parseDate(input.weekStartDate);
  const end = parseDate(input.weekEndDate);

  // Collect all days in the range
  const days: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const carSlots = distributeEvenly(targetCars, days.length);
  const trailerSlots = distributeEvenly(targetTrailers, days.length);

  return days.map((d, i) => {
    const dateStr = toDateStr(d);
    const dayMonth = MONTHS[d.getMonth()];
    const dayYear = d.getFullYear();
    return {
      id: `${parentId}::${dateStr}`,
      parentId,
      date: dateStr,
      year: dayYear,
      month: dayMonth,
      weekOfMonth: weekOfMonth(d),
      isoWeek: isoWeekNumber(d),
      targetCars: carSlots[i],
      targetTrailers: trailerSlots[i],
      oem, plant, statecity, zone,
    };
  });
}

/**
 * Main entry point.
 * Accepts a BreakdownInput and returns the computed DailyTargetRecord[].
 * Does NOT write to storage — call `saveBreakdown` for that.
 */
export function computeBreakdown(input: BreakdownInput): DailyTargetRecord[] {
  if (input.periodType === 'monthly') return breakdownMonthly(input);
  if (input.periodType === 'weekly') return breakdownWeekly(input);
  throw new Error(`Unknown periodType: "${(input as any).periodType}"`);
}

// ─── Storage layer ────────────────────────────────────────────────────────────

function loadAll(): DailyTargetRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DailyTargetRecord[]) : [];
  } catch {
    return [];
  }
}

function saveAll(records: DailyTargetRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

/**
 * Persists a computed breakdown.
 * Replaces any existing rows for the same parentId so re-saving a target
 * is always idempotent.
 */
export function saveBreakdown(rows: DailyTargetRecord[]): void {
  if (rows.length === 0) return;
  const parentId = rows[0].parentId;
  const existing = loadAll().filter(r => r.parentId !== parentId);
  saveAll([...existing, ...rows]);
}

/**
 * Convenience: compute + persist in one call.
 * Returns the computed rows so callers can use them immediately.
 */
export function computeAndSave(input: BreakdownInput): DailyTargetRecord[] {
  const rows = computeBreakdown(input);
  saveBreakdown(rows);
  return rows;
}

/**
 * Removes all daily rows for a given parentId.
 * Call this when a TransportRecord is deleted.
 */
export function deleteBreakdown(parentId: string): void {
  const remaining = loadAll().filter(r => r.parentId !== parentId);
  saveAll(remaining);
}

/**
 * Removes daily rows for multiple parentIds at once.
 */
export function deleteBreakdowns(parentIds: string[]): void {
  const set = new Set(parentIds);
  const remaining = loadAll().filter(r => !set.has(r.parentId));
  saveAll(remaining);
}

// ─── Query helpers ────────────────────────────────────────────────────────────

export interface DailyQueryFilter {
  parentId?: string;
  oem?: string;
  plant?: string;
  statecity?: string;
  zone?: string;
  year?: number;
  month?: string;
  /** Inclusive start date YYYY-MM-DD */
  fromDate?: string;
  /** Inclusive end date YYYY-MM-DD */
  toDate?: string;
}

/** Returns all daily rows matching the given filter. */
export function queryDaily(filter: DailyQueryFilter = {}): DailyTargetRecord[] {
  return loadAll().filter(r => {
    if (filter.parentId && r.parentId !== filter.parentId) return false;
    if (filter.oem && r.oem !== filter.oem) return false;
    if (filter.plant && r.plant !== filter.plant) return false;
    if (filter.statecity && r.statecity !== filter.statecity) return false;
    if (filter.zone && r.zone !== filter.zone) return false;
    if (filter.year !== undefined && r.year !== filter.year) return false;
    if (filter.month && r.month !== filter.month) return false;
    if (filter.fromDate && r.date < filter.fromDate) return false;
    if (filter.toDate && r.date > filter.toDate) return false;
    return true;
  });
}

// ─── Aggregation helpers ──────────────────────────────────────────────────────

/**
 * Aggregates daily rows into weekly buckets.
 *
 * Weeks are grouped by isoWeek number. Each bucket carries a human-readable
 * label, the date range, and the summed targets.
 *
 * Cross-month weeks: a day is included in the bucket regardless of which month
 * it belongs to, so the weekly total is always the sum of its constituent days.
 */
export function aggregateToWeekly(rows: DailyTargetRecord[]): WeeklyAggregate[] {
  const buckets = new Map<number, {
    dates: string[];
    months: Set<string>;
    targetCars: number;
    targetTrailers: number;
    weekOfMonth: number;
  }>();

  for (const r of rows) {
    const key = r.isoWeek;
    if (!buckets.has(key)) {
      buckets.set(key, { dates: [], months: new Set(), targetCars: 0, targetTrailers: 0, weekOfMonth: r.weekOfMonth });
    }
    const b = buckets.get(key)!;
    b.dates.push(r.date);
    b.months.add(r.month);
    b.targetCars += r.targetCars;
    b.targetTrailers += r.targetTrailers;
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([isoWeek, b]) => {
      const sorted = b.dates.slice().sort();
      const startDate = sorted[0];
      const endDate = sorted[sorted.length - 1];
      const startD = parseDate(startDate);
      const endD = parseDate(endDate);
      const fmt = (d: Date) =>
        d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      return {
        label: `W${b.weekOfMonth} (${fmt(startD)} – ${fmt(endD)})`,
        weekOfMonth: b.weekOfMonth,
        isoWeek,
        startDate,
        endDate,
        targetCars: b.targetCars,
        targetTrailers: b.targetTrailers,
        months: Array.from(b.months),
      };
    });
}

/**
 * Aggregates daily rows into monthly buckets.
 * Useful for cross-month weekly targets where a single week's rows span two months.
 */
export function aggregateToMonthly(rows: DailyTargetRecord[]): MonthlyAggregate[] {
  const buckets = new Map<string, MonthlyAggregate>();

  for (const r of rows) {
    const key = `${r.year}-${r.month}`;
    if (!buckets.has(key)) {
      buckets.set(key, { year: r.year, month: r.month, targetCars: 0, targetTrailers: 0 });
    }
    const b = buckets.get(key)!;
    b.targetCars += r.targetCars;
    b.targetTrailers += r.targetTrailers;
  }

  return Array.from(buckets.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month);
  });
}

/**
 * Returns the total target cars and trailers for a given filter.
 * This is the single source of truth for any "total target" figure in the UI.
 */
export function getTotalTarget(filter: DailyQueryFilter): { targetCars: number; targetTrailers: number } {
  const rows = queryDaily(filter);
  return rows.reduce(
    (acc, r) => ({ targetCars: acc.targetCars + r.targetCars, targetTrailers: acc.targetTrailers + r.targetTrailers }),
    { targetCars: 0, targetTrailers: 0 },
  );
}

/**
 * Returns the daily target for a specific date.
 * Returns { targetCars: 0, targetTrailers: 0 } if no breakdown exists for that date.
 */
export function getDailyTarget(
  filter: Omit<DailyQueryFilter, 'fromDate' | 'toDate'>,
  date: string,
): { targetCars: number; targetTrailers: number } {
  return getTotalTarget({ ...filter, fromDate: date, toDate: date });
}

// ─── Integration helper ───────────────────────────────────────────────────────

/**
 * Builds a BreakdownInput from a TransportRecord-like object.
 *
 * For 'Monthly' entryType → periodType = 'monthly', uses the record's month/year.
 * For 'Weekly' entryType  → periodType = 'weekly', uses the first weeklyBreakdown
 *   entry's dateRange to derive start/end dates (falls back to monthly if parsing fails).
 *
 * Call this from the target save handlers (handleAddTargetExt, handleSaveTargetPlan)
 * immediately after writing to tracker_data_v7.
 */
export function buildBreakdownInput(record: {
  id: string;
  oem: string;
  plant: string;
  statecity: string;
  zone: string;
  target: number;
  targetTrailers?: number;
  month: string;
  year: number;
  entryType?: string;
  weeklyBreakdown?: { dateRange: string; cars: number; trailers: number }[];
}): BreakdownInput[] {
  const base = {
    parentId: record.id,
    oem: record.oem,
    plant: record.plant,
    statecity: record.statecity,
    zone: record.zone,
    month: record.month,
    year: record.year,
  };

  // Weekly entryType: produce one BreakdownInput per week row
  if (record.entryType === 'Weekly' && record.weeklyBreakdown?.length) {
    const inputs: BreakdownInput[] = [];

    for (const wb of record.weeklyBreakdown) {
      // dateRange formats seen in the codebase:
      //   "2026-01-01 to 2026-01-07"   (ISO, from legacy form)
      //   "(1st - 7th)"                (ordinal, from OemTargetPlanningEntry)
      const parsed = parseDateRange(wb.dateRange, record.year, record.month);

      if (parsed) {
        inputs.push({
          ...base,
          // Use a sub-id so each week's rows have a unique parentId namespace
          parentId: `${record.id}::wk::${wb.dateRange}`,
          periodType: 'weekly',
          targetCars: wb.cars,
          targetTrailers: wb.trailers,
          weekStartDate: parsed.start,
          weekEndDate: parsed.end,
        });
      } else {
        // Fallback: treat the week as a mini-monthly spread across its car count
        // by distributing proportionally within the month
        inputs.push({
          ...base,
          parentId: `${record.id}::wk::${wb.dateRange}`,
          periodType: 'monthly',
          targetCars: wb.cars,
          targetTrailers: wb.trailers,
        });
      }
    }

    return inputs;
  }

  // Standard / Percentage Based / default → monthly distribution
  return [{
    ...base,
    periodType: 'monthly',
    targetCars: record.target,
    targetTrailers: record.targetTrailers ?? 0,
  }];
}

/**
 * Attempts to parse a dateRange string into { start, end } ISO date strings.
 *
 * Handles two formats:
 *   ISO:     "2026-01-01 to 2026-01-07"
 *   Ordinal: "(1st - 7th)" or "(22nd - End)" within a known month/year
 */
function parseDateRange(
  dateRange: string,
  year: number,
  month: string,
): { start: string; end: string } | null {
  // Format 1: ISO dates separated by " to "
  const isoMatch = dateRange.match(/(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return { start: isoMatch[1], end: isoMatch[2] };

  // Format 2: ordinal day numbers like "(1st - 7th)" or "(22nd - End)"
  const ordMatch = dateRange.match(/\(?\s*(\d+)\w*\s*[-–]\s*(\d+|\bEnd\b)\s*\)?/i);
  if (ordMatch) {
    const mIdx = MONTHS.indexOf(month);
    if (mIdx === -1) return null;
    const days = daysInMonth(year, month);
    const startDay = parseInt(ordMatch[1], 10);
    const endDay = ordMatch[2].toLowerCase() === 'end' ? days : parseInt(ordMatch[2], 10);
    if (isNaN(startDay) || isNaN(endDay)) return null;
    const start = toDateStr(new Date(year, mIdx, startDay));
    const end = toDateStr(new Date(year, mIdx, Math.min(endDay, days)));
    return { start, end };
  }

  return null;
}
