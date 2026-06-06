export type TargetPlanRecordLike = {
  oem?: string;
  plant?: string;
  month?: string;
  year?: number;
  entryType?: string;
  targetLevel?: string;
};

export type TargetPlanValidationResult = {
  isValid: boolean;
  error?: string;
  existingEntryType?: string;
  existingRecords: TargetPlanRecordLike[];
};

const normalizeEntryType = (entryType?: string) => {
  const value = (entryType || '').trim();
  if (!value) return 'Unknown';
  return value
    .replace('Weekly', 'Week Wise')
    .replace('Monthly', 'AO Zone Wise');
};

export const validateTargetPlanSave = (
  existingRecords: TargetPlanRecordLike[],
  params: {
    oem: string;
    plant: string;
    month: string;
    year: number;
    requestedEntryType?: string;
  }
): TargetPlanValidationResult => {
  const filtered = existingRecords.filter(record =>
    record.oem === params.oem &&
    record.month === params.month &&
    record.year === params.year
  );

  if (filtered.length === 0) {
    return { isValid: true, existingRecords: filtered };
  }

  const distinctEntryTypes = Array.from(new Set(filtered.map(record => normalizeEntryType(record.entryType))));

  const lockedEntryType = distinctEntryTypes.length > 0 ? distinctEntryTypes[0] : undefined;

  return {
    isValid: true,
    existingEntryType: lockedEntryType,
    existingRecords: filtered,
  };
};
