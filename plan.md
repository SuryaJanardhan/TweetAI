# Project: TweetAI (Autonomous Agentic Social Growth Platform)

## Vision
Build an autonomous, production-grade social intelligence platform that continuously analyzes trending topics, formulates strategies, generates concise content, publishes to Twitter (X), and reflects on performance to adapt its behaviour. 

Unlike a standard content generator, TweetAI is an intelligent closed-loop cognitive system that executes autonomous decisions based on rolling safety budgets, previous performance logs, and real-time environment signals.

---

## Core Cognitive Objectives
Every day, the system autonomically answers:
1. **What is happening?** (Identify emerging trends in technology and industry)
2. **What content should be published?** (Generate targeted, concise Twitter posts)
3. **Can we publish safely?** (Check sliding rate-limit and safety windows in Redis)
4. **What worked previously?** (Read past episodic memories and feedback logs)
5. **How should strategy adapt?** (Self-reflect on post performance and tune future outputs)

---

## Production Architecture

```
                 +---------------------------------------+
                 |            External Clients           |
                 +---------------------------------------+
                                     |  (Bearer Auth)
                                     v
                 +---------------------------------------+
                 |          Express API Server           |
                 +---------------------------------------+
                                     |
                                     v
                 +---------------------------------------+
                 |             Job Store                 |
                 +---------------------------------------+
                                     |
                                     v
                 +---------------------------------------+
                 |             Job Runner                |
                 |      (BullMQ Queue / Worker)          |
                 +---------------------------------------+
                                     |
                  +------------------+------------------+
                  |                                     |
                  v                                     v
        +-------------------+                 +-------------------+
        |  PostgreSQL Pool  |                 |    Redis Pool     |
        |  (Memory & Jobs)  |                 |  (Queues & TTLs)  |
        +-------------------+                 +-------------------+
                  |                                     |
          (JSON Fallback)                          (Rate Limits)
                  v                                     v
        +-------------------+                 +-------------------+
        |  Local JSON Files |                 |  Safety Windows   |
        +-------------------+                 +-------------------+
```

### 1. Data & Persistence Layer
* **PostgreSQL (`pg.Pool`)**: Production-grade storage for durability and ACID compliance. Stores:
  * `jobs`: Async task scheduling, status (`pending`, `running`, `succeeded`, `failed`), and idempotency keys.
  * `memory`: Episodic memories and logs of previous strategy runs.
  * `audit_logs`: Detailed operational and access records.
* **JSON File Fallback**: In non-production or local fallback scenarios, if PostgreSQL is offline, the services seamlessly fallback to local filesystem storage to preserve developer experience.
* **Automatic Migrations (`src/db/migrate.ts`)**: Automated table definition and index creation on system initialization.

### 2. Job Queue & Task Management
* **BullMQ & Redis**: Offloads CPU-intensive cognitive loops to background workers.
* **Idempotent Scheduling**: Prevents duplicate executions of the same cognitive cycle using strict client-provided idempotency keys.
* **Graceful Fallback**: Instantly falls back to local async process loop (`setImmediate`) if Redis is unavailable.

### 3. Cognitive Loop & Modular Agents
* **Orchestrator (`src/core/Orchestrator.ts`)**: Drives the core cycle `Observe -> Formulate -> Write -> Safety Check -> Publish -> Reflect`.
* **StrategyAgent (`src/agents/StrategyAgent.ts`)**: Examines context and defines the content positioning strategy.
* **WriterAgent (`src/agents/WriterAgent.ts`)**: Drafts, edits, and refines high-quality tweets based on the active strategy.
* **ReflectionAgent (`src/agents/ReflectionAgent.ts`)**: Self-evaluates completed loops to record lessons and adapt subsequent cycles.
* **TwitterSafetyGuardianAgent (`src/agents/TwitterSafetyGuardianAgent.ts`)**: Intercepts publishing jobs to enforce strict rolling safety buffers:
  * **Daily Limit**: 100 actions
  * **Hourly Limit**: 10 actions
  * **15-Minute Limit**: 10 actions
  * **1-Minute Burst**: 10 actions
  * **Buffer Safety Margin**: Automatically reserves a 20% safety margin off the raw API caps.
  * **Atomic Tracking**: Uses atomic Redis TTL counters to handle distributed scaling safely.

### 4. Dual LLM Provider Engine
To guarantee zero-downtime, the system utilizes a cascading provider fallback strategy:
1. **Google Gemini (Primary)**: Powered by `@google/genai` for high-reasoning strategy and drafting.
2. **Groq SDK (Secondary Fallback)**: Automatically catches errors, rate-limits, or key expirations from Gemini, instantly rerouting queries to Groq.
3. **Mock Stubs**: Local development falls back to mock responses if both API keys are absent.

### 5. Publishing Layer
* **Twitter API v2 (`twitter-api-v2`)**: Integrates authentic OAuth 1.0a / 2.0 publisher connections.
* **Simulated Dry-Run Mode**: Default safety mode for local testing; simulates successful tweets without consuming Twitter rate limits.

---

## Production Security & Environments
* **Access Control**: Enforces Express middleware Bearer Auth matching SHA-256 hashed API keys (`viewer`, `editor`, `admin`).
* **Environment Validation**:
  * **Production Mode**: Mandates existence of valid `DATABASE_URL`, `REDIS_URL`, `TWITTER_*` API keys, and at least one LLM Key (`GEMINI_API_KEY` or `GROQ_API_KEY`).
  * **Development Mode**: Generates default API tokens and sets up mock fallbacks if secrets are missing.
* **Clean Shut Down**: Registers SIGTERM/SIGINT handlers to close PostgreSQL pools, local BullMQ worker loops, and Redis clients safely, avoiding resource leaks.

---

## Verification & Testing
* **Test Isolation**: Employs a custom, isolated test cleanup runner (`src/utils/testHelpers.ts`) to truncate PostgreSQL tables and flush Redis safety/queue states before and after each test case.
* **Robust Execution**: High-concurrency test suite runs and terminates cleanly in under 3 seconds.
