# Production-Grade Development Plan

This plan turns the current Tweet-AI backend scaffold into a reliable production service. It prioritizes correctness, safety, observability, and deployability before scale or advanced AI features.

## Current State

- Node.js 20+ Express backend with REST routes and Swagger docs.
- Agent orchestration loop using observe, think, plan, act, reflect, learn phases.
- Safety guardian that blocks actions above 80% of configured Twitter/X limits.
- File-backed memory store and structured file logger.
- API-key authentication using `Authorization: Bearer <token>`.
- Role-based authorization for write/action endpoints.
- Validated runtime config with production fail-fast behavior.
- Request IDs, consistent error envelopes, body validation, and memory-type validation.
- Async orchestration jobs with status tracking and idempotency-key reuse.
- Liveness and dependency-aware readiness endpoints.
- Focused tests for config, auth, validation, job idempotency, orchestration, and safety behavior.

## Newly Added Robustness Requirements

The recent implementation improved the app flow, but these additions must be hardened before live production use.

### A. Async Job Flow

Implemented now:

- `/orchestrate` queues orchestration work instead of running it synchronously.
- `GET /jobs/:id` exposes job state.
- `Idempotency-Key` prevents duplicate orchestration jobs.
- `JobRunner` records succeeded and failed outcomes.

Must harden next:

- Move job state from local JSON files to Redis/BullMQ plus durable database records.
- Add worker concurrency limits per account and globally.
- Add retry policy with exponential backoff and max attempts.
- Add dead-letter queue for permanently failed jobs.
- Add job cancellation and pause/resume controls.
- Add stale-running job detection after process crashes.
- Add idempotency-key scoping by account, route, and payload hash.
- Add payload hash mismatch detection when the same idempotency key is reused with different input.
- Add job retention policy and archival.

Acceptance criteria:

- A process crash cannot leave jobs permanently invisible or duplicated.
- A retry cannot create duplicate external Twitter/X actions.
- Operators can inspect, retry, cancel, and explain every job.
- Multi-instance workers cannot execute the same job twice.

### B. Readiness and Health

Implemented now:

- `/system-health` is a lightweight liveness endpoint.
- `/system-readiness` checks memory and job storage.

Must harden next:

- Add readiness checks for Redis, database, Twitter/X client credentials, queue worker availability, and model provider connectivity.
- Add degraded states for optional dependencies.
- Add startup dependency checks before accepting traffic.
- Add shutdown hooks that stop accepting new jobs before closing workers.

Acceptance criteria:

- The app does not receive production traffic when required dependencies are down.
- Deployments fail before serving unsafe or partially initialized behavior.

### C. Auth and Audit

Implemented now:

- Bearer API-key auth replaces trusted role headers.
- Viewer/editor/admin roles protect write and orchestration endpoints.

Must harden next:

- Store API keys hashed, not as plaintext environment strings.
- Add key IDs and rotation support.
- Add per-key rate limits.
- Add audit records in durable storage for every write, job creation, job completion, safety decision, and external action.
- Add account/workspace scoping to every request and every idempotency key.

Acceptance criteria:

- A leaked key can be revoked without redeploying the service.
- Every high-risk operation answers who, what, when, where, why, and result.

### D. Validation and Agent Contracts

Implemented now:

- Request body and memory type validation.
- Agent output contract checks inside the orchestrator.

Must harden next:

- Add explicit schemas for every route request and response.
- Add strict schemas for every agent phase input and output.
- Add max field lengths and allowed enum values.
- Add policy validation before planning and before acting.
- Reject unsafe learned memory before it enters strategic or semantic stores.

Acceptance criteria:

- Invalid user input, invalid agent output, and invalid third-party responses fail closed.
- No unsafe action can pass because of a malformed intermediate object.

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

Status: partially implemented.

Tasks:

- Keep the typed configuration module that reads environment variables once at startup.
- Keep required variable validation with clear startup errors.
- Separate local, test, staging, and production configuration.
- Keep `.env.example` with safe placeholder values.
- Keep log redaction for API keys, access tokens, cookies, auth headers, and raw private prompts.
- Add secret scanning in CI.
- Add rotation playbooks for API keys and Twitter/X credentials.

Acceptance criteria:

- App fails fast when required production configuration is missing.
- Tests can run with isolated test configuration.
- No secrets appear in logs, responses, or committed files.
- Secrets can be rotated without code changes.

### 2. Real Authentication and Authorization

Status: partially implemented with Bearer API keys.

Tasks:

- Keep Bearer API-key auth for service/API access.
- Replace plaintext API key configuration with hashed key storage.
- Add key IDs, expiration, rotation, and revocation.
- Add account/workspace scoping.
- Keep role and permission checks for all write or action endpoints.
- Add durable audit logs for authenticated user, route, operation, and decision.
- Rate-limit authentication failures.

Acceptance criteria:

- Anonymous users cannot mutate memory, trigger orchestration, or execute actions.
- Authorization tests cover viewer, editor, admin, invalid token, and missing token cases.
- Audit logs identify who triggered each high-risk operation.
- Revoked credentials stop working immediately.

### 3. Request and Response Validation

Status: partially implemented.

Tasks:

- Keep validation for JSON object bodies, memory types, and idempotency keys.
- Add schema validation for all route params, query params, request bodies, and responses.
- Keep agent output validation before passing results to the next orchestration phase.
- Keep consistent error envelopes.
- Keep request size limits.
- Reject unsupported action types before orchestration.
- Add payload hashing for idempotency-key reuse.

Acceptance criteria:

- Invalid payloads return `400` with stable machine-readable errors.
- Agent output contract failures are logged and stop unsafe execution.
- Tests cover malformed bodies, invalid memory types, and invalid orchestration payloads.
- Reused idempotency keys with different payloads are rejected.

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

Status: locally implemented with file-backed jobs; production adapter still required.

Tasks:

- Keep API request/worker separation at the route contract level.
- Replace file-backed job storage with Redis/BullMQ or an equivalent production queue.
- Store job status: queued, running, succeeded, failed, canceled, delayed, dead-lettered.
- Keep idempotency keys for orchestration jobs.
- Add idempotency keys for every external action job.
- Add retry policies with exponential backoff and dead-letter queues.
- Add cancellation and pause controls per account.
- Add stale job recovery after worker crash.
- Add queue-depth metrics and backlog alerts.

Acceptance criteria:

- API returns quickly with a job id for long-running work.
- Duplicate requests do not create duplicate external actions.
- Failed jobs are visible, retryable, and auditable.
- Multi-instance workers cannot claim the same job simultaneously.

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

Status: partially implemented.

Tasks:

- Make each phase explicit and independently testable.
- Add timeouts for agent execution.
- Add circuit breakers for failing agents or integrations.
- Persist intermediate phase outputs for resume and debugging.
- Add deterministic run ids and correlation ids.
- Add policy checks before plan and before act.
- Keep agent output contract checks.
- Add phase-level failure states and resume behavior.

Acceptance criteria:

- A failed phase does not lose the full cycle context.
- Cycles can be inspected by run id.
- Timeouts and partial failures produce stable, actionable error states.
- No action phase can run unless observe, think, plan, and policy checks succeeded.

### 9. Observability

Status: partially implemented.

Tasks:

- Keep structured logs to stdout in production.
- Keep request IDs and add full correlation IDs across jobs, safety decisions, and external calls.
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
- Add dashboards for job health, safety blocks, external API failures, and model costs.

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

1. Replace file-backed jobs with Redis/BullMQ and durable job records.
2. Add payload-hash idempotency and account-scoped idempotency keys.
3. Move safety counters to Redis-backed rolling windows with atomic operations.
4. Add durable database schema for actions, audits, jobs, memory, users, accounts, and API keys.
5. Add hashed API-key storage, key IDs, revocation, and auth failure rate limits.
6. Add action executor boundaries: dry-run, human approval, idempotency, safety pre-check, audit write, external call, reconcile.
7. Build the Twitter/X client behind dry-run mode with retries, timeouts, and mocked contract tests.
8. Add metrics, dashboards, readiness checks for all dependencies, and production alerts.
9. Containerize with graceful worker shutdown and non-root runtime.
10. Add CI gates for tests, linting, dependency audit, secret scanning, and container build.
11. Run staging soak tests with dry-run actions.
12. Run production rollout with human approval before live actions.

## Robust++ Release Gates

Do not mark the system production-ready until every gate below is true.

### Functional Gates

- `POST /orchestrate` never performs external actions inline.
- Every external action is represented by a durable action record.
- Every action has an idempotency key, safety decision, actor, account, run id, job id, and external provider response.
- Job retries cannot duplicate tweets, likes, replies, follows, reposts, or deletes.
- A worker crash during any phase can be recovered or safely marked failed.
- Human approval can be required per account, campaign, action type, or risk score.

### Safety Gates

- Safety counters are atomic across multiple API and worker instances.
- Emergency stop blocks all queued and future external actions.
- Account pause blocks only the selected account.
- Limits are enforced by action type and time window.
- Safety decisions are logged before every external action attempt.
- Safety test coverage includes boundary, burst, concurrency, reset, pause, and emergency-stop cases.

### Reliability Gates

- Required dependencies are checked at startup and readiness.
- Queue backlog, failed jobs, and dead-letter counts are visible and alerted.
- Database migrations are automated and reversible.
- All outbound calls have timeouts, retries where safe, and circuit breakers.
- Graceful shutdown drains or requeues in-flight work.
- Backups and restore drills are tested.

### Security Gates

- API keys are hashed at rest and include key IDs.
- Production credentials are not stored in `.env` files on servers.
- Auth failures are rate-limited and alerted.
- Logs redact secrets and private prompt material.
- Audit logs are append-only or tamper-evident.
- Dependency and secret scans pass in CI.

### Observability Gates

- Logs include request id, correlation id, job id, run id, account id, and action id where applicable.
- Metrics include API latency, error rate, queue depth, job latency, safety blocks, external API errors, and model cost.
- Dashboards exist for API health, workers, queues, safety, jobs, and external providers.
- Alerts route to the responsible operator with runbook links.

### Testing Gates

- Unit tests cover config, auth, validation, safety, jobs, orchestrator contracts, and error mapping.
- Integration tests cover Redis, database, queue processing, and storage adapters.
- Contract tests cover Twitter/X client success, rate limit, auth failure, timeout, retryable errors, and non-retryable errors.
- End-to-end dry-run tests cover the full observe-think-plan-act-reflect-learn workflow.
- Chaos tests simulate worker crash, Redis outage, database outage, Twitter/X outage, and model provider timeout.

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

# ADVANCED AUTONOMOUS COGNITION REQUIREMENTS

The system must not operate as a workflow engine.

The system must operate as a cognitive system.

Every agent must possess:

- Objectives
- Beliefs
- Confidence levels
- Uncertainty levels
- Memory
- Reflection capability
- Learning capability
- Hypothesis generation capability

Agents should create hypotheses.

Example:

Hypothesis:
"AI founders currently engage more with controversial technical takes than tutorials."

Confidence:
62%

Evidence:
Trend observations.

The system should actively attempt to validate or invalidate hypotheses.

------------------------------------------------

# WORLD MODEL

The platform must maintain an evolving internal representation of Twitter.

The model should understand:

- Communities
- Sub-communities
- Influencers
- Emerging creators
- Content clusters
- Behavior clusters
- Topic relationships
- Engagement relationships
- Influence relationships
- Opinion relationships
- Trend propagation pathways

The system should continuously update this world model.

------------------------------------------------

# TWITTER GRAPH INTELLIGENCE

Construct a graph.

Nodes:

- Users
- Tweets
- Topics
- Communities
- Keywords
- Hashtags

Edges:

- Replies
- Mentions
- Quotes
- Likes
- Reposts
- Co-occurrences

Calculate:

- Influence score
- Authority score
- Community score
- Virality score
- Momentum score
- Trust score
- Emergence score
- Decay score

------------------------------------------------

# CONTENT DNA SYSTEM

Every tweet must be decomposed.

Analyze:

- Opening style
- Sentence length
- Tone
- Emotion
- Topic
- Call to action
- Structure
- Formatting
- Hook style
- Learning value
- Novelty
- Controversy

Create content genetics.

Identify:

- Winning DNA
- Failing DNA
- Neutral DNA

Track evolution over time.

------------------------------------------------

# VIRALITY RESEARCH ENGINE

Reverse engineer viral tweets.

Extract:

- Structure
- Topic
- Psychology
- Emotion
- Timing
- Community
- Engagement velocity
- Growth rate
- Influencer interactions

Discover hidden patterns.

Store pattern signatures.

------------------------------------------------

# MEMETIC EVOLUTION SYSTEM

Treat ideas as evolving organisms.

Every content idea should have:

- Birth
- Growth
- Mutation
- Death

Track:

- Idea lifespan
- Mutation success
- Community adoption
- Cross-community spread

Generate improved descendants of successful ideas.

------------------------------------------------

# ATTENTION MARKET MODEL

Treat Twitter as a marketplace of attention.

Estimate:

- Attention cost
- Attention reward
- Competition intensity
- Noise level
- Crowding score

Avoid overcrowded conversations when expected value is low.

------------------------------------------------

# STRATEGIC THINKING ENGINE

Before any action:

Generate multiple strategies.

Example:

Strategy A:
Reply to trend.

Strategy B:
Create original tweet.

Strategy C:
Quote influencer.

Strategy D:
Wait.

Score all strategies.

- Expected value
- Risk
- Opportunity
- Cost

Choose dynamically.

------------------------------------------------

# SELF CRITIC AGENT

Every action must be challenged.

Before execution ask:

- Why is this a good idea?
- Why might this fail?
- Why might this appear spammy?
- What assumptions exist?
- What evidence supports them?
- Should we wait?
- Should we do nothing?

The system must be capable of deciding inactivity is optimal.

------------------------------------------------

# ACTION ECONOMICS

Every action has cost.

- Like Cost
- Reply Cost
- Quote Cost
- Tweet Cost
- Follow Cost
- Reputation Cost
- Rate Limit Cost
- Opportunity Cost

Track all costs.

Use expected value calculations.

------------------------------------------------

# REPUTATION MODEL

Maintain internal reputation scores.

- Platform Reputation
- Community Reputation
- Influencer Reputation
- Topic Reputation
- Content Reputation
- Action Reputation

Protect reputation aggressively.

------------------------------------------------

# SOCIAL PSYCHOLOGY ENGINE

Analyze:

- Curiosity
- Status
- Fear
- Trust
- Humor
- Identity
- Belonging
- Controversy
- Novelty
- Authority

Detect which psychological triggers drive engagement.

------------------------------------------------

# EMERGENT COMMUNITY DETECTION

Automatically discover:

- New communities
- New trends
- New influencers
- New topic clusters

Without predefined categories.

Use clustering algorithms.

Allow communities to emerge naturally.

------------------------------------------------

# DECISION MEMORY

Store every decision.

Fields:

- Situation
- Decision
- Alternatives considered
- Reasoning
- Confidence
- Outcome
- Lesson
- Future recommendation

Create institutional memory.

------------------------------------------------

# AUTONOMOUS RESEARCH AGENT

Continuously ask:

- What do we not know?
- What assumptions are weak?
- What communities are underexplored?
- What opportunities remain undiscovered?

Generate research tasks automatically.

------------------------------------------------

# META LEARNING SYSTEM

Track:

- Which strategies learn fastest
- Which agents learn fastest
- Which memory sources are most useful
- Which decisions consistently outperform

Optimize the learning process itself.

------------------------------------------------

# BEHAVIORAL DRIFT DETECTION

Detect when:

- Engagement drops
- Communities shift
- Topics evolve
- Strategies stop working

Automatically adapt.

------------------------------------------------

# LONG TERM STRATEGIC PLANNING

Maintain:

- Daily goals
- Weekly goals
- Monthly goals
- Quarterly goals

Align all agent actions with long-term objectives.

------------------------------------------------

# AUTONOMOUS EXECUTIVE AGENT

Highest-level agent.

Responsibilities:

- Observe entire system
- Resolve agent conflicts
- Allocate resources
- Prioritize goals
- Approve major strategy changes

Acts as the CEO of all agents.
