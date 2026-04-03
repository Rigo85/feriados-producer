import test from 'node:test';
import assert from 'node:assert/strict';

import { reconcileHolidayProjection } from '../../src/services/reconciliation-service';

const baseline = [
  {
    date: '2026-01-01',
    year: 2026,
    month: 1,
    day: 1,
    name: 'Año Nuevo',
    scope: 'national' as const,
    notes: 'Inamovible',
    sourceLabel: 'seed_2026_table'
  },
  {
    date: '2026-04-02',
    year: 2026,
    month: 4,
    day: 2,
    name: 'Semana Santa',
    scope: 'national' as const,
    notes: null,
    sourceLabel: 'seed_2026_table'
  },
  {
    date: '2026-04-03',
    year: 2026,
    month: 4,
    day: 3,
    name: 'Semana Santa',
    scope: 'national' as const,
    notes: null,
    sourceLabel: 'seed_2026_table'
  },
  {
    date: '2026-05-01',
    year: 2026,
    month: 5,
    day: 1,
    name: 'Día del Trabajo',
    scope: 'national' as const,
    notes: null,
    sourceLabel: 'seed_2026_table'
  }
];

test('merges the seeded past holidays with the observed upcoming holidays', () => {
  const result = reconcileHolidayProjection({
    baselineHolidays: baseline,
    observedHolidays: [
      {
        date: '2026-04-02',
        year: 2026,
        month: 4,
        day: 2,
        name: 'Semana Santa',
        scope: 'national'
      },
      {
        date: '2026-04-03',
        year: 2026,
        month: 4,
        day: 3,
        name: 'Semana Santa',
        scope: 'national'
      },
      {
        date: '2026-05-01',
        year: 2026,
        month: 5,
        day: 1,
        name: 'Día del Trabajo',
        scope: 'national'
      }
    ],
    diagnostics: {
      selectedUpcomingMode: 'desktop',
      desktopRowCount: 2,
      mobileRowCount: 0
    },
    maxAllowedMissingFutureHolidays: 2,
    minObservedCoverageRatio: 0.75
  });

  assert.equal(result.accepted, true);
  assert.equal(result.projectedHolidays.length, 4);
  assert.equal(result.projectedHolidays[0]?.date, '2026-01-01');
  assert.equal(result.projectedHolidays[0]?.sourceOfTruth, 'baseline');
  assert.equal(result.projectedHolidays[1]?.sourceOfTruth, 'gobpe');
});

test('rejects suspiciously partial observations against the seeded future baseline', () => {
  const result = reconcileHolidayProjection({
    baselineHolidays: baseline,
    observedHolidays: [
      {
        date: '2026-04-02',
        year: 2026,
        month: 4,
        day: 2,
        name: 'Semana Santa',
        scope: 'national'
      }
    ],
    diagnostics: {
      selectedUpcomingMode: 'none',
      desktopRowCount: 0,
      mobileRowCount: 0
    },
    maxAllowedMissingFutureHolidays: 2,
    minObservedCoverageRatio: 0.75
  });

  assert.equal(result.accepted, false);
  assert.equal(result.rejectionCode, 'FULL_LIST_MISSING');
  assert.equal(result.events.at(-1)?.code, 'PROMOTION_REJECTED');
});
