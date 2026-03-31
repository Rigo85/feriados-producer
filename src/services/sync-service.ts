import type { createSnapshotRepository } from '../repositories/snapshot-repository';
import type { createCacheService } from './cache-service';
import type { ScrapeResultSuccess, SyncSnapshotResult } from '../types';

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
    const changed = !currentSnapshot || currentSnapshot.normalized_hash !== input.scrapeResult.normalizedHash;

    if (!changed) {
      if (dependencies.cacheService && currentSnapshot) {
        await dependencies.cacheService.refreshCurrentSnapshot(input.scrapeResult.normalizedPayload, {
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
        persisted: false
      };
    }

    const persisted = await dependencies.snapshotRepository.replaceCurrentSnapshot({
      sourceUrl: input.sourceUrl,
      parserVersion: input.parserVersion,
      contentHash: input.scrapeResult.contentHash,
      normalizedHash: input.scrapeResult.normalizedHash,
      rawHtml: input.scrapeResult.html,
      normalizedPayload: input.scrapeResult.normalizedPayload,
      holidays: input.scrapeResult.parsed.holidays
    });

    const metadata = {
      source: 'redis' as const,
      snapshot_id: persisted.snapshotId,
      updated_at: persisted.fetchedAt
    };

    if (dependencies.cacheService) {
      await dependencies.cacheService.refreshCurrentSnapshot(input.scrapeResult.normalizedPayload, metadata);
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
      snapshotId: persisted.snapshotId
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
