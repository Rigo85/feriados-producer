import type { createSnapshotRepository } from '../repositories/snapshot-repository';
import type { createCacheService } from './cache-service';
import type { ScrapeResultSuccess, SyncSnapshotResult } from '../types';
import { reconcileHolidayProjection } from './reconciliation-service';

type SnapshotRepository = NonNullable<ReturnType<typeof createSnapshotRepository>>;
type CacheService = ReturnType<typeof createCacheService>;

interface SyncDependencies {
  snapshotRepository: SnapshotRepository;
  cacheService: CacheService;
}

interface SyncInput {
  runId: string;
  sourceUrl: string;
  parserVersion: string;
  maxAllowedMissingFutureHolidays: number;
  minObservedCoverageRatio: number;
  scrapeResult: ScrapeResultSuccess;
}

export async function syncSnapshot(
  dependencies: SyncDependencies,
  input: SyncInput
): Promise<SyncSnapshotResult> {
  let lockAcquired = false;

  try {
    lockAcquired = await dependencies.snapshotRepository.tryAcquireLock(4109001);
    if (!lockAcquired) {
      await dependencies.snapshotRepository.finishRun(input.runId, {
        status: 'skipped',
        errorCode: 'LOCK_NOT_ACQUIRED',
        errorMessage: 'Another producer execution is in progress',
        changed: false
      });

      return {
        changed: false,
        persisted: false,
        skipped: true
      };
    }

    const currentSnapshot = await dependencies.snapshotRepository.getCurrentSnapshot();
    const currentProjection = await dependencies.snapshotRepository.getCurrentProjection();
    const changed = !currentSnapshot || currentSnapshot.normalized_hash !== input.scrapeResult.normalizedHash;
    const baselineHolidays = await dependencies.snapshotRepository.getBaselineHolidays(input.scrapeResult.parsed.year);
    const reconciliation = reconcileHolidayProjection({
      baselineHolidays,
      observedHolidays: input.scrapeResult.parsed.holidays,
      diagnostics: input.scrapeResult.parsed.diagnostics,
      maxAllowedMissingFutureHolidays: input.maxAllowedMissingFutureHolidays,
      minObservedCoverageRatio: input.minObservedCoverageRatio
    });

    if (!reconciliation.accepted) {
      await dependencies.snapshotRepository.insertRunEvents(input.runId, reconciliation.events);

      if (dependencies.cacheService && currentSnapshot && currentProjection.length > 0) {
        await dependencies.cacheService.refreshCurrentSnapshot({
          year: currentProjection[0]!.year,
          holidays: currentProjection
        }, {
          source: 'redis',
          snapshot_id: currentSnapshot.id,
          updated_at: currentSnapshot.fetched_at
        });
      }

      await dependencies.snapshotRepository.finishRun(input.runId, {
        status: 'error',
        httpStatus: input.scrapeResult.statusCode,
        usedBrowserFallback: input.scrapeResult.usedBrowserFallback,
        changed: false,
        ...(reconciliation.rejectionCode ? { errorCode: reconciliation.rejectionCode } : {}),
        ...(reconciliation.rejectionMessage ? { errorMessage: reconciliation.rejectionMessage } : {})
      });

      return {
        changed: false,
        persisted: false,
        rejected: true,
        observedHolidayCount: reconciliation.observedCount,
        projectedHolidayCount: currentProjection.length,
        ...(reconciliation.rejectionCode ? { rejectionCode: reconciliation.rejectionCode } : {})
      };
    }

    if (!changed) {
      if (dependencies.cacheService && currentSnapshot && currentProjection.length > 0) {
        await dependencies.cacheService.refreshCurrentSnapshot({
          year: currentProjection[0]!.year,
          holidays: currentProjection
        }, {
          source: 'redis',
          snapshot_id: currentSnapshot.id,
          updated_at: currentSnapshot.fetched_at
        });
      }

      await dependencies.snapshotRepository.finishRun(input.runId, {
        status: 'success',
        httpStatus: input.scrapeResult.statusCode,
        usedBrowserFallback: input.scrapeResult.usedBrowserFallback,
        changed: false
      });

      return {
        changed: false,
        persisted: false,
        observedHolidayCount: reconciliation.observedCount,
        projectedHolidayCount: currentProjection.length
      };
    }

    const persisted = await dependencies.snapshotRepository.replaceCurrentSnapshot({
      sourceUrl: input.sourceUrl,
      parserVersion: input.parserVersion,
      contentHash: input.scrapeResult.contentHash,
      normalizedHash: input.scrapeResult.normalizedHash,
      rawHtml: input.scrapeResult.html,
      normalizedPayload: input.scrapeResult.normalizedPayload,
      holidays: input.scrapeResult.parsed.holidays,
      projectedHolidays: reconciliation.projectedHolidays
    });

    await dependencies.snapshotRepository.insertRunEvents(input.runId, reconciliation.events);

    const metadata = {
      source: 'redis' as const,
      snapshot_id: persisted.snapshotId,
      updated_at: persisted.fetchedAt
    };

    if (dependencies.cacheService) {
      await dependencies.cacheService.refreshCurrentSnapshot({
        year: input.scrapeResult.parsed.year,
        holidays: reconciliation.projectedHolidays.map((holiday) => ({
          date: holiday.date,
          year: holiday.year,
          month: holiday.month,
          day: holiday.day,
          name: holiday.name,
          scope: holiday.scope
        }))
      }, metadata);
    }

    await dependencies.snapshotRepository.finishRun(input.runId, {
      status: 'success',
      httpStatus: input.scrapeResult.statusCode,
      usedBrowserFallback: input.scrapeResult.usedBrowserFallback,
      changed: true,
      snapshotId: persisted.snapshotId
    });

    return {
      changed: true,
      persisted: true,
      snapshotId: persisted.snapshotId,
      observedHolidayCount: reconciliation.observedCount,
      projectedHolidayCount: reconciliation.projectedHolidays.length
    };
  } catch (error) {
    await dependencies.snapshotRepository.finishRun(input.runId, {
      status: 'error',
      httpStatus: input.scrapeResult.statusCode,
      usedBrowserFallback: input.scrapeResult.usedBrowserFallback,
      changed: false,
      errorCode: 'SYNC_ERROR',
      errorMessage: error instanceof Error ? error.message : 'Unknown sync error'
    });
    throw error;
  } finally {
    if (lockAcquired) {
      await dependencies.snapshotRepository.releaseLock(4109001);
    }
  }
}
