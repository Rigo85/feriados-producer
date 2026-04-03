import type {
  BaselineHolidayRecord,
  HolidayRecord,
  ProjectedHolidayRecord,
  ReconciliationResult,
  RunEvent
} from '../types';

interface ReconciliationInput {
  baselineHolidays: BaselineHolidayRecord[];
  observedHolidays: HolidayRecord[];
  diagnostics: {
    selectedUpcomingMode: 'desktop' | 'mobile' | 'none';
    desktopRowCount: number;
    mobileRowCount: number;
  };
  maxAllowedMissingFutureHolidays: number;
  minObservedCoverageRatio: number;
}

function sortByDate<T extends { date: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.date.localeCompare(right.date));
}

function dedupeObserved(items: HolidayRecord[]): HolidayRecord[] {
  const byDate = new Map<string, HolidayRecord>();

  for (const item of sortByDate(items)) {
    byDate.set(item.date, item);
  }

  return Array.from(byDate.values());
}

function buildProjectedHolidays(
  baselineHolidays: BaselineHolidayRecord[],
  observedHolidays: HolidayRecord[],
  anchorDate: string | null
): ProjectedHolidayRecord[] {
  if (!anchorDate) {
    return sortByDate(observedHolidays).map((holiday) => ({
      ...holiday,
      sourceOfTruth: 'gobpe'
    }));
  }

  const projected: ProjectedHolidayRecord[] = [];

  for (const holiday of sortByDate(baselineHolidays)) {
    if (holiday.date < anchorDate) {
      projected.push({
        date: holiday.date,
        year: holiday.year,
        month: holiday.month,
        day: holiday.day,
        name: holiday.name,
        scope: holiday.scope,
        sourceOfTruth: 'baseline'
      });
    }
  }

  for (const holiday of sortByDate(observedHolidays)) {
    projected.push({
      ...holiday,
      sourceOfTruth: 'gobpe'
    });
  }

  return projected;
}

export function reconcileHolidayProjection(input: ReconciliationInput): ReconciliationResult {
  const observedHolidays = dedupeObserved(input.observedHolidays);
  const baselineHolidays = sortByDate(input.baselineHolidays);
  const events: RunEvent[] = [];

  if (observedHolidays.length === 0) {
    return {
      accepted: false,
      projectedHolidays: buildProjectedHolidays(baselineHolidays, observedHolidays, null),
      anchorDate: null,
      expectedRemainingCount: 0,
      observedCount: 0,
      missingFutureCount: 0,
      coverageRatio: 0,
      events,
      rejectionCode: 'NO_OBSERVED_HOLIDAYS',
      rejectionMessage: 'The scrape did not produce any observable holidays'
    };
  }

  const anchorDate = observedHolidays[0]!.date;

  if (baselineHolidays.length === 0) {
    events.push({
      level: 'warn',
      code: 'BASELINE_NOT_FOUND',
      message: `No baseline holidays are available for year ${observedHolidays[0]!.year}`,
      scope: 'national'
    });

    return {
      accepted: true,
      projectedHolidays: buildProjectedHolidays([], observedHolidays, anchorDate),
      anchorDate,
      expectedRemainingCount: observedHolidays.length,
      observedCount: observedHolidays.length,
      missingFutureCount: 0,
      coverageRatio: 1,
      events
    };
  }

  const baselineByDate = new Map<string, BaselineHolidayRecord>(
    baselineHolidays.map((holiday) => [holiday.date, holiday])
  );
  const observedByDate = new Map<string, HolidayRecord>(
    observedHolidays.map((holiday) => [holiday.date, holiday])
  );
  const expectedRemaining = baselineHolidays.filter((holiday) => holiday.date >= anchorDate);
  const missingFutureHolidays = expectedRemaining.filter((holiday) => !observedByDate.has(holiday.date));
  const coverageRatio = expectedRemaining.length === 0
    ? 1
    : observedHolidays.length / expectedRemaining.length;

  for (const holiday of observedHolidays) {
    const baselineHoliday = baselineByDate.get(holiday.date);

    if (!baselineHoliday) {
      events.push({
        level: 'info',
        code: 'NEW_HOLIDAY_OBSERVED',
        message: `Source introduced a holiday not present in the seeded baseline: ${holiday.name}`,
        holidayDate: holiday.date,
        scope: holiday.scope
      });
      continue;
    }

    if (baselineHoliday.name !== holiday.name) {
      events.push({
        level: 'warn',
        code: 'HOLIDAY_NAME_CHANGED',
        message: `Source renamed ${holiday.date} from "${baselineHoliday.name}" to "${holiday.name}"`,
        holidayDate: holiday.date,
        scope: holiday.scope,
        details: {
          baseline_name: baselineHoliday.name,
          observed_name: holiday.name
        }
      });
    }
  }

  for (const holiday of missingFutureHolidays) {
    events.push({
      level: 'warn',
      code: 'FUTURE_HOLIDAY_REMOVED_BY_SOURCE',
      message: `Source no longer lists ${holiday.date} (${holiday.name}) in the upcoming holidays feed`,
      holidayDate: holiday.date,
      scope: holiday.scope
    });
  }

  const structuralListMissing = input.diagnostics.selectedUpcomingMode === 'none' && expectedRemaining.length > observedHolidays.length;
  const excessiveMissingFutures = missingFutureHolidays.length > input.maxAllowedMissingFutureHolidays
    && coverageRatio < input.minObservedCoverageRatio;

  if (structuralListMissing || excessiveMissingFutures) {
    return {
      accepted: false,
      projectedHolidays: buildProjectedHolidays(baselineHolidays, observedHolidays, anchorDate),
      anchorDate,
      expectedRemainingCount: expectedRemaining.length,
      observedCount: observedHolidays.length,
      missingFutureCount: missingFutureHolidays.length,
      coverageRatio,
      events: [
        ...events,
        {
          level: 'error',
          code: 'PROMOTION_REJECTED',
          message: 'Observed holiday feed looks partial or structurally inconsistent and will not be promoted',
          scope: 'national',
          details: {
            expected_remaining_count: expectedRemaining.length,
            observed_count: observedHolidays.length,
            missing_future_count: missingFutureHolidays.length,
            coverage_ratio: coverageRatio,
            selected_upcoming_mode: input.diagnostics.selectedUpcomingMode,
            desktop_row_count: input.diagnostics.desktopRowCount,
            mobile_row_count: input.diagnostics.mobileRowCount
          }
        }
      ],
      rejectionCode: structuralListMissing ? 'FULL_LIST_MISSING' : 'PARTIAL_SOURCE_REJECTED',
      rejectionMessage: structuralListMissing
        ? 'The source did not expose the upcoming holidays list'
        : 'The source omitted too many future holidays compared to the seeded baseline'
    };
  }

  return {
    accepted: true,
    projectedHolidays: buildProjectedHolidays(baselineHolidays, observedHolidays, anchorDate),
    anchorDate,
    expectedRemainingCount: expectedRemaining.length,
    observedCount: observedHolidays.length,
    missingFutureCount: missingFutureHolidays.length,
    coverageRatio,
    events
  };
}
