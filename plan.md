# Production-Grade Development Plan

This plan turns the current Tweet-AI backend scaffold into a reliable production service. It prioritizes correctness, safety, observability, and deployability before scale or advanced AI features.

## Current State

- Node.js 20+ Express backend with REST routes and Swagger docs.
- Agent orchestration loop using observe, think, plan, act, reflect, learn phases.
- Safety guardian that blocks actions above 80% of configured Twitter/X limits.
- File-backed memory store and structured file logger.
- Basic role middleware using `x-role`.
- Focused tests for orchestration and safety behavior.

## Production Principles

- Safety is a hard dependency, not a best-effort feature.
- External actions must be idempotent, auditable, rate-limited, and retry-safe.
- All user input, API payloads, agent outputs, and third-party responses must be validated.
- Runtime behavior must be observable through logs, metrics, traces, alerts, and health checks.
- Secrets, credentials, tokens, and account state must never be committed or logged.
- The API process should remain stateless; durable state belongs in managed stores.
- Every risky behavior needs tests before rollout.

## Phase 1: Production Blockers

### 1. Configuration and Secrets

Tasks:

- Add a typed configuration module that reads environment variables once at startup.
- Validate required variables with clear startup errors.
- Separate local, test, staging, and production configuration.
- Add `.env.example` with safe placeholder values.
- Ensure logs never include API keys, access tokens, cookies, auth headers, or raw private prompts.

Acceptance criteria:

- App fails fast when required production configuration is missing.
- Tests can run with isolated test configuration.
- No secrets appear in logs, responses, or committed files.

### 2. Real Authentication and Authorization

Tasks:

- Replace `x-role` trust with real authentication.
- Use JWT, session auth, or API keys depending on deployment needs.
- Add role and permission checks for all write or action endpoints.
- Add audit logs for authenticated user, route, operation, and decision.
- Rate-limit authentication failures.

Acceptance criteria:

- Anonymous users cannot mutate memory, trigger orchestration, or execute actions.
- Authorization tests cover viewer, editor, admin, invalid token, and missing token cases.
- Audit logs identify who triggered each high-risk operation.

### 3. Request and Response Validation

Tasks:

- Add schema validation for all route params, query params, and request bodies.
- Validate agent outputs before passing them to the next orchestration phase.
- Return consistent error envelopes.
- Add request size limits.
- Reject unknown memory types and unsupported action types before orchestration.

Acceptance criteria:

- Invalid payloads return `400` with stable machine-readable errors.
- Agent output contract failures are logged and stop unsafe execution.
- Tests cover malformed bodies, invalid memory types, and invalid orchestration payloads.

### 4. Durable Persistence

Tasks:

- Keep file storage only for local development and tests.
- Add production adapters for durable storage:
  - Redis for distributed rate limits, queues, locks, and short-lived cache.
  - Postgres or another durable database for actions, memory, users, accounts, audits, and job state.
  - Google Sheets only for reporting/export, not as the source of truth.
- Add migrations and schema ownership.
- Add optimistic concurrency or locking for writes that affect limits and action state.

Acceptance criteria:

- Multiple API/worker instances can run without corrupting state.
- Memory, action history, safety counters, and audits survive process restarts.
- Tests verify storage adapter contracts.

### 5. Reliable Safety Guardian

Tasks:

- Move safety counters from process memory to Redis or durable shared storage.
- Implement per-account and per-action-class limits.
- Track daily, hourly, rolling 15-minute, and burst windows using real expiry.
- Add account suspension, manual pause, emergency stop, and maintenance mode.
- Require safety approval immediately before every external Twitter/X action.
- Record every allow/block decision with the triggering context.

Acceptance criteria:

- Safety limits work across multiple processes.
- Counters reset according to actual time windows.
- Blocked actions are queued or rejected consistently.
- Tests cover boundary conditions, concurrent checks, resets, and emergency stop.

## Phase 2: Reliable Execution

### 6. Queue-Based Orchestration

Tasks:

- Split API requests from background workers.
- Add a job queue for orchestration cycles and external actions.
- Store job status: queued, running, succeeded, failed, canceled, delayed.
- Add idempotency keys for action jobs.
- Add retry policies with exponential backoff and dead-letter queues.
- Add cancellation and pause controls per account.

Acceptance criteria:

- API returns quickly with a job id for long-running work.
- Duplicate requests do not create duplicate external actions.
- Failed jobs are visible, retryable, and auditable.

### 7. Twitter/X Integration

Tasks:

- Build a dedicated Twitter/X client module.
- Centralize auth, retries, timeout handling, rate-limit headers, and error mapping.
- Use least-privilege permissions.
- Support dry-run mode for staging.
- Store external IDs for every created tweet, reply, like, repost, or follow.
- Reconcile local action state with Twitter/X responses.

Acceptance criteria:

- No route or agent calls Twitter/X directly.
- All external calls pass through safety, idempotency, logging, and error handling.
- Integration tests can run against mocked Twitter/X responses.

### 8. Orchestrator Hardening

Tasks:

- Make each phase explicit and independently testable.
- Add timeouts for agent execution.
- Add circuit breakers for failing agents or integrations.
- Persist intermediate phase outputs for resume and debugging.
- Add deterministic run ids and correlation ids.
- Add policy checks before plan and before act.

Acceptance criteria:

- A failed phase does not lose the full cycle context.
- Cycles can be inspected by run id.
- Timeouts and partial failures produce stable, actionable error states.

### 9. Observability

Tasks:

- Replace file-only logging with structured logs to stdout in production.
- Add request ids and correlation ids.
- Add metrics:
  - request rate, latency, and error rate
  - orchestration success/failure counts
  - queue depth and job latency
  - safety allow/block counts
  - external API rate-limit usage
  - token and model cost
- Add health endpoints:
  - liveness
  - readiness
  - dependency checks
- Add alerts for safety bypass attempts, high failure rate, queue backlog, and auth failures.

Acceptance criteria:

- Operators can answer what happened, when, why, and who triggered it.
- Readiness fails when required dependencies are unavailable.
- Alerts exist for conditions that threaten safety or availability.

## Phase 3: Quality and Maintainability

### 10. Testing Strategy

Tasks:

- Add unit tests for config, auth, validation, safety, storage adapters, and agent contracts.
- Add route tests using an HTTP test client.
- Add integration tests for queue, Redis, and database adapters.
- Add contract tests for Twitter/X client behavior.
- Add regression tests for every discovered production incident.
- Add coverage thresholds for critical modules.

Acceptance criteria:

- `npm test` runs reliably on a clean checkout.
- Critical safety and action paths have high confidence coverage.
- CI blocks merges when tests fail.

### 11. Code Quality

Tasks:

- Add ESLint and Prettier or another consistent formatter/linter setup.
- Add `npm run lint`, `npm run format:check`, and `npm run test:ci`.
- Add dependency auditing in CI.
- Add clear module boundaries:
  - routes only handle HTTP
  - services coordinate use cases
  - clients handle external APIs
  - repositories handle persistence
  - agents handle domain reasoning
- Add ADRs for major architecture choices.

Acceptance criteria:

- CI enforces tests, linting, formatting, and dependency checks.
- New features follow the same structure without route-level business logic.

### 12. API Design

Tasks:

- Version the API under `/v1`.
- Keep OpenAPI in sync with real route behavior.
- Add pagination for list endpoints.
- Add stable error codes.
- Add response schemas for every route.
- Add request examples for common workflows.

Acceptance criteria:

- Generated OpenAPI docs accurately match implemented routes.
- Clients can handle errors programmatically.
- Large responses are paginated.

## Phase 4: Deployment and Operations

### 13. Containerization

Tasks:

- Add a production Dockerfile using a non-root user.
- Add `.dockerignore`.
- Add graceful shutdown handling for HTTP server and workers.
- Add startup checks for config and dependency readiness.
- Pin Node version.

Acceptance criteria:

- Container starts, serves health checks, and shuts down cleanly.
- No development-only files or secrets are included in the image.

### 14. CI/CD

Tasks:

- Add a CI pipeline for install, lint, test, build, audit, and container build.
- Add staging deployment before production.
- Require manual approval for production rollout.
- Add rollback procedure.
- Add migration checks before deployment.

Acceptance criteria:

- Every change is tested before merge.
- Production deploys are repeatable and reversible.

### 15. Runtime Operations

Tasks:

- Create runbooks for:
  - safety shutdown
  - Twitter/X API outage
  - queue backlog
  - database failure
  - leaked credential rotation
  - bad agent behavior
- Add backup and restore procedures.
- Add retention policies for logs, audits, and memory.
- Add operational dashboards.

Acceptance criteria:

- On-call operators can respond without reading source code first.
- Backups are tested through restore drills.

## Phase 5: AI and Product Maturity

### 16. Model and Prompt Governance

Tasks:

- Store prompt versions and model choices.
- Log model inputs and outputs with redaction.
- Add evaluation datasets for strategy, content quality, and safety compliance.
- Add human approval gates for high-risk actions.
- Track token usage and cost per account.

Acceptance criteria:

- Prompt or model changes are measurable and reversible.
- Unsafe or low-confidence actions require human review.

### 17. Learning System

Tasks:

- Separate raw events, derived insights, and long-term memory.
- Add quality scores to reflections and learned outcomes.
- Prevent low-quality or unsafe outputs from entering strategic memory.
- Add memory pruning, deduplication, and retention.
- Add retrieval tests for representative workflows.

Acceptance criteria:

- Memory improves decisions without accumulating untrusted noise.
- Learned behavior can be explained and audited.

### 18. Analytics and Reporting

Tasks:

- Build analytics from durable action and outcome data.
- Export curated reporting views to Google Sheets.
- Track content performance, engagement quality, safety blocks, and growth trends.
- Add account-level and campaign-level reporting.

Acceptance criteria:

- Reports are reproducible from source-of-truth data.
- Reporting failures do not block safety or execution.

## Recommended Near-Term Implementation Order

1. Add config validation and `.env.example`.
2. Add request validation and consistent error responses.
3. Add real auth and authorization tests.
4. Move safety counters to Redis-backed storage.
5. Add queue-based orchestration and idempotency.
6. Add durable database schema for actions, audits, jobs, memory, users, and accounts.
7. Build the Twitter/X client behind dry-run mode.
8. Add production logging, metrics, readiness checks, and alerts.
9. Containerize and add CI gates.
10. Run a staged rollout with human approval before live actions.

## Definition of Production Ready

The system is production ready only when:

- It can run multiple instances safely.
- It cannot execute external actions without authentication, authorization, safety approval, and audit logging.
- It survives process restarts without losing state.
- It validates all external input and agent output.
- It exposes health, metrics, logs, and alerts.
- It has automated tests for critical paths.
- It supports dry-run, pause, emergency stop, and rollback.
- It has documented runbooks for common failures.
