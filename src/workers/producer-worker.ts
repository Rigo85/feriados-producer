import { CronJob } from 'cron';
import type { Logger } from 'pino';

import { runScrape } from '../services/scrape-service';
import { cleanupRetention } from '../services/cleanup-service';
import { syncSnapshot } from '../services/sync-service';
import type { EnvConfig, ScrapeResult } from '../types';
import type { createSnapshotRepository } from '../repositories/snapshot-repository';
import type { createCacheService } from '../services/cache-service';

type SnapshotRepository = ReturnType<typeof createSnapshotRepository>;
type CacheService = ReturnType<typeof createCacheService>;

interface ProducerDependencies {
  env: EnvConfig;
  logger: Logger;
  snapshotRepository: SnapshotRepository;
  cacheService: CacheService;
  runScrapeFn?: typeof runScrape;
}

export function createProducerWorker(dependencies: ProducerDependencies) {
  const logger = dependencies.logger;
  const env = dependencies.env;
  const runScrapeFn = dependencies.runScrapeFn || runScrape;
  let currentExecution: Promise<ScrapeResult> | null = null;
  let currentJob: CronJob | null = null;

  async function executeInternal(trigger: string): Promise<ScrapeResult> {
    logger.info({ trigger }, 'starting producer run');
    const run = dependencies.snapshotRepository
      ? await dependencies.snapshotRepository.insertRunStart(trigger)
      : null;

    try {
      const result = await runScrapeFn({
        sourceUrl: env.holidaysSourceUrl,
        timeoutMs: env.httpTimeoutMs,
        maxRetries: env.httpMaxRetries,
        usePlaywrightFallback: env.usePlaywrightFallback
      });

      if (!result.ok && dependencies.snapshotRepository && run) {
        await dependencies.snapshotRepository.finishRun(run.id, {
          status: 'error',
          httpStatus: result.statusCode,
          usedBrowserFallback: result.usedBrowserFallback,
          changed: false,
          errorCode: result.errorCode,
          errorMessage: 'Scrape failed before persistence'
        });
      }

      if (result.ok && dependencies.snapshotRepository && run) {
        const syncResult = await syncSnapshot({
          snapshotRepository: dependencies.snapshotRepository,
          cacheService: dependencies.cacheService
        }, {
          runId: run.id,
          sourceUrl: env.holidaysSourceUrl,
          parserVersion: env.parserVersion,
          scrapeResult: result
        });

        if (!syncResult.skipped) {
          syncResult.cleanup = await cleanupRetention({
            snapshotRepository: dependencies.snapshotRepository
          }, {
            snapshotRetentionDays: env.snapshotRetentionDays,
            scrapeRunRetentionDays: env.scrapeRunRetentionDays,
            queryTraceRetentionDays: env.queryTraceRetentionDays
          });
        }

        result.sync = syncResult;
      }

      logger.info(
        {
          trigger,
          ok: result.ok,
          statusCode: result.statusCode,
          usedBrowserFallback: result.usedBrowserFallback,
          sync: result.ok ? (result.sync || null) : null
        },
        'producer run finished'
      );

      return result;
    } catch (error) {
      if (dependencies.snapshotRepository && run) {
        await dependencies.snapshotRepository.finishRun(run.id, {
          status: 'error',
          changed: false,
          errorCode: 'SCRAPE_ERROR',
          errorMessage: error instanceof Error ? error.message : 'Unknown scrape error'
        }).catch((finishError: unknown) => {
          logger.error({ err: finishError, trigger, run_id: run.id }, 'failed to persist scrape run error');
        });
      }
      logger.error({ err: error, trigger }, 'producer run failed');
      throw error;
    }
  }

  function execute(trigger: string): Promise<ScrapeResult> {
    if (currentExecution) {
      logger.warn({ trigger }, 'producer execution already in progress');
      return currentExecution;
    }

    const execution = executeInternal(trigger).finally(() => {
      if (currentExecution === execution) {
        currentExecution = null;
      }
    });
    currentExecution = execution;
    return execution;
  }

  function start(): CronJob {
    currentJob = new CronJob(
      env.producerCron,
      () => {
        void execute('cron').catch((error: unknown) => {
          logger.error({ err: error }, 'cron execution failed');
        });
      },
      null,
      false,
      env.timezone
    );

    currentJob.start();
    logger.info({ cron: env.producerCron, timezone: env.timezone }, 'producer cron started');
    return currentJob;
  }

  async function stop(): Promise<void> {
    if (currentJob) {
      currentJob.stop();
      currentJob = null;
    }

    if (currentExecution) {
      await currentExecution.catch(() => {});
    }
  }

  return {
    execute,
    start,
    stop
  };
}
