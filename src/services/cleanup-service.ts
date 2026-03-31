import type { createSnapshotRepository } from '../repositories/snapshot-repository';
import type { CleanupResult } from '../types';

type SnapshotRepository = NonNullable<ReturnType<typeof createSnapshotRepository>>;

interface CleanupDependencies {
  snapshotRepository: SnapshotRepository;
}

interface CleanupInput {
  snapshotRetentionDays: number;
  scrapeRunRetentionDays: number;
  queryTraceRetentionDays: number;
}

export async function cleanupRetention(
  dependencies: CleanupDependencies,
  input: CleanupInput
): Promise<CleanupResult> {
  const deletedRuns = await dependencies.snapshotRepository.cleanupOldRuns(input.scrapeRunRetentionDays);
  const deletedSnapshots = await dependencies.snapshotRepository.cleanupOldSnapshots(input.snapshotRetentionDays);
  const deletedQueryTraces = await dependencies.snapshotRepository.cleanupOldQueryTraces(input.queryTraceRetentionDays);

  return {
    deletedRuns,
    deletedSnapshots,
    deletedQueryTraces
  };
}
