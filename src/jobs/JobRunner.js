export class JobRunner {
  constructor({ jobStore, orchestrator, logger }) {
    this.jobStore = jobStore;
    this.orchestrator = orchestrator;
    this.logger = logger;
  }

  start(job) {
    setImmediate(() => {
      this.run(job.id).catch((error) => {
        this.logger.error('job.unhandled_failure', { jobId: job.id, error: error.message });
      });
    });
  }

  async run(jobId) {
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
        error: error.message
      });
    }
  }
}
