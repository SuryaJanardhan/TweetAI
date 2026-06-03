import type { LoggerLike } from '../types.js';
import type { JobRecord, JobStore } from './JobStore.js';

interface OrchestratorLike {
  loop(context?: unknown): Promise<unknown>;
}

interface JobRunnerDependencies {
  jobStore: JobStore;
  orchestrator: OrchestratorLike;
  logger: LoggerLike;
}

export class JobRunner {
  jobStore: JobStore;
  orchestrator: OrchestratorLike;
  logger: LoggerLike;

  constructor({ jobStore, orchestrator, logger }: JobRunnerDependencies) {
    this.jobStore = jobStore;
    this.orchestrator = orchestrator;
    this.logger = logger;
  }

  start(job: JobRecord): void {
    setImmediate(() => {
      this.run(job.id).catch((error) => {
        this.logger.error('job.unhandled_failure', {
          jobId: job.id,
          error: error instanceof Error ? error.message : 'Unknown job failure'
        });
      });
    });
  }

  async run(jobId: string): Promise<void> {
    const job = await this.jobStore.markRunning(jobId);
    await this.logger.info('job.started', { jobId, type: job.type, requestId: job.requestId });

    try {
      if (job.type !== 'orchestration') {
        throw new Error(`Unsupported job type: ${job.type}`);
      }

      const result = await this.orchestrator.loop(job.payload);
      await this.jobStore.markSucceeded(jobId, result);
      await this.logger.info('job.succeeded', { jobId, type: job.type, requestId: job.requestId });
    } catch (error) {
      await this.jobStore.markFailed(jobId, error);
      await this.logger.error('job.failed', {
        jobId,
        type: job.type,
        requestId: job.requestId,
        error: error instanceof Error ? error.message : 'Unknown job failure'
      });
    }
  }
}
