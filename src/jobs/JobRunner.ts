import { Redis } from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { isRedisConnected } from '../redis/index.js';
import { loadConfig } from '../config.js';
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

  private queueConnection: Redis | null = null;
  private workerConnection: Redis | null = null;
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor({ jobStore, orchestrator, logger }: JobRunnerDependencies) {
    this.jobStore = jobStore;
    this.orchestrator = orchestrator;
    this.logger = logger;

    if (isRedisConnected()) {
      const redisUrl = loadConfig().redisUrl!;
      this.queueConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
      this.workerConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });

      this.queue = new Queue('orchestration-jobs', { connection: this.queueConnection as any });
      this.worker = new Worker(
        'orchestration-jobs',
        async (bullJob) => {
          const { jobId } = bullJob.data;
          await this.run(jobId);
        },
        {
          connection: this.workerConnection as any,
          concurrency: 2
        }
      );

      this.worker.on('error', (err) => {
        this.logger.error('bullmq.worker_error', { error: err.message });
      });

      this.worker.on('failed', (bullJob, err) => {
        this.logger.error('bullmq.worker_failed', {
          jobId: bullJob?.data?.jobId,
          error: err.message
        });
      });
    }
  }

  start(job: JobRecord): void {
    if (this.queue) {
      this.queue
        .add('orchestration', { jobId: job.id }, { jobId: job.id })
        .then(() => {
          this.logger.info('job.enqueued_bullmq', { jobId: job.id });
        })
        .catch((error) => {
          this.logger.error('job.enqueue_bullmq_failed', {
            jobId: job.id,
            error: error instanceof Error ? error.message : 'Queue error'
          });
          this.startLocalFallback(job);
        });
    } else {
      this.startLocalFallback(job);
    }
  }

  private startLocalFallback(job: JobRecord): void {
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

  async shutdown(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
    if (this.queue) {
      await this.queue.close();
    }
    if (this.queueConnection) {
      await this.queueConnection.quit();
    }
    if (this.workerConnection) {
      await this.workerConnection.quit();
    }
  }
}
