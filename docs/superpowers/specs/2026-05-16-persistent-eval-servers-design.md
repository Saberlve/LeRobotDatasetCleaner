# Persistent Evaluation Model Servers Design

## Summary

This design separates model-server lifecycle management from task-launch lifecycle management for evaluation workflows. `simpler` and `rmbench` each get an independently managed, long-lived model server with its own port, runtime state, and logs. Task launches no longer start or stop the policy server implicitly.

The required behavior is:
- `simpler` and `rmbench` servers can run at the same time.
- Each benchmark uses a different configured port.
- Users start and stop each benchmark's model server explicitly from the frontend.
- Starting a task without its corresponding model server returns an error and instructs the user to start that server first.
- Stopping a task does not stop the persistent model server.

## Goals

- Add explicit, persistent model-server controls for `simpler` and `rmbench`.
- Ensure `simpler` and `rmbench` use different ports and isolated runtime state.
- Prevent task launch when the corresponding model server is not running.
- Preserve the existing task launch flow as much as possible outside the server lifecycle split.

## Non-Goals

- Building a generic benchmark-agnostic orchestration framework.
- Auto-starting a model server when a task launch is requested.
- Changing checkpoint selection UX.
- Refactoring all evaluation runtime management into a new shared subsystem in this iteration.

## Current State

Today, the `simpler` launch flow starts the policy server inside `scripts/run_simpler_launch.sh`, waits for readiness, then launches the client task process. On exit, the script tears down both the task process and the policy server. The frontend only exposes task launch and stop controls, so server lifecycle is tightly coupled to individual task runs.

This structure blocks persistent reuse of a single policy server across multiple task launches and does not leave room for `simpler` and `rmbench` to be managed independently.

## Proposed Architecture

### 1. Split server lifecycle from task lifecycle

Introduce a dedicated server-management layer for evaluation model servers. This layer owns:
- server start
- server stop
- server status polling
- runtime metadata persistence
- log file locations
- readiness detection

Task-launch services remain responsible for benchmark-specific client/task execution only. Before starting a task, they query the corresponding server status and fail fast if the server is not running.

### 2. Maintain benchmark-specific server managers

Implement separate runtime management for:
- `simpler`
- `rmbench`

Each benchmark has:
- its own configured port
- its own runtime directory or runtime state namespace
- its own active-process record
- its own status file
- its own launcher/server logs

This keeps the change small and predictable while satisfying the requirement that both servers can run at once.

### 3. Keep benchmark-specific task runners

`simpler` task launching continues to use its existing task script path and runtime conventions, but the script no longer starts `serve_policy.py`. Instead it receives host/port for an already-running model server.

`rmbench` follows the same contract on its side: task launching depends on an already-running benchmark-specific model server and refuses to run otherwise.

## Runtime Model

### Server state model

Each benchmark server exposes a status model containing at least:
- `status`: `idle | starting | running | stopping | failed | stopped`
- `pid`
- `port`
- `startedAt`
- `updatedAt`
- `checkpointPath`
- `logFiles`
- `errorMessage`

A benchmark server is considered usable for task launch only when status is `running` and the tracked process is still alive.

### Runtime persistence

Store runtime state separately per benchmark, for example under benchmark-specific runtime roots such as:
- `.../runtime/evaluation/simpler-server/`
- `.../runtime/evaluation/rmbench-server/`

Each runtime root persists files analogous to:
- `active-server.json`
- `status.json`
- `latest-server.json` if needed for restart/status recovery
- `launcher.log`
- `server.log`

Task runtime state remains separate from server runtime state.

## Port Configuration

Use benchmark-specific environment variables so ports are explicit and stable:
- `SIMPLER_MODEL_SERVER_PORT`
- `RMBENCH_MODEL_SERVER_PORT`

Requirements:
- both must resolve to different ports
- startup fails with a clear error if the configured port is unavailable
- task-launch responses should surface a clear message if the dependent server is not running on its configured port

Port separation is a hard requirement because `simpler` and `rmbench` may run concurrently.

## Backend API Design

### Simpler server management

Add:
- `GET /api/evaluation/simpler/server/status`
- `POST /api/evaluation/simpler/server/start`
- `POST /api/evaluation/simpler/server/stop`

### RMBench server management

Add:
- `GET /api/evaluation/rmbench/server/status`
- `POST /api/evaluation/rmbench/server/start`
- `POST /api/evaluation/rmbench/server/stop`

### Task launch precondition

Update benchmark task-launch endpoints so they reject requests when the corresponding model server is not running.

Expected behavior:
- `simpler` task launch returns an error such as `Simpler Server 未运行，请先启动 Simpler Server。`
- `rmbench` task launch returns an analogous RMBench-specific message
- no server auto-start is attempted

Recommended status code: `409 Conflict`, since the request is structurally valid but the system state does not permit execution.

## Script and Service Changes

### Simpler

Refactor `scripts/run_simpler_launch.sh` so it no longer starts `scripts/serve_policy.py`. The script should:
- assume a ready model server already exists
- consume the configured host/port via environment variables
- continue launching only the task/client side of the workflow
- stop only the task/client process tree during task shutdown

Add a dedicated simpler-server launcher path, either via:
- a new script, or
- a dedicated server-side spawn path in TypeScript

The dedicated simpler-server launcher is responsible for readiness waiting and server log management.

### RMBench

Mirror the same lifecycle split on the RMBench side:
- dedicated RMBench server start/stop/status path
- task runner depends on an existing RMBench server
- task stop does not kill the RMBench server

## Frontend Design

Extend the evaluation launch workspace with two independent server-control cards:
- `Simpler Server`
- `RMBench Server`

Each card shows:
- current server status
- configured port
- start button
- stop button
- relevant error message if present
- optional latest log snippet or link target if existing UI patterns support it

Existing task-launch controls remain in place.

Behavioral rules:
- users can start one server without starting the other
- users can run both servers at the same time
- clicking task launch without the required server running displays the backend error in the task panel
- clicking task stop only affects the active task run

## Error Handling

The system must report clear benchmark-specific failures for:
- server already running
- server not running when stop is requested
- configured port unavailable
- spawn failure
- readiness timeout
- task launch attempted without a running server
- stale pid/state files detected during reconciliation

Recovery behavior should mirror the existing runtime-state reconciliation style where possible: stale active-process files are cleared when the process no longer exists.

## Testing Strategy

### Backend tests

Add coverage for:
- starting `simpler` server writes runtime state, tracks pid, and exposes configured port
- starting `rmbench` server does the same independently
- `simpler` and `rmbench` can both report `running` simultaneously with different ports
- stopping one server does not affect the other
- task launch is rejected when the corresponding server is not running
- task launch succeeds into the expected starting state when the corresponding server is running
- stale runtime files are reconciled correctly

### Frontend tests

Add coverage for:
- rendering both server-control cards
- polling and displaying `simpler` server status
- polling and displaying `rmbench` server status
- disabled/enabled button states during start/stop requests
- surfacing the backend error when a task is launched without the required server
- preserving existing task-launch interactions when the corresponding server is already running

## Risks and Mitigations

- Risk: lifecycle logic diverges between `simpler` and `rmbench`.
  Mitigation: keep the runtime shape and API shape parallel even if implementation remains benchmark-specific.

- Risk: task shutdown still kills the shared server accidentally.
  Mitigation: explicitly separate process ownership and add tests asserting task stop does not stop the server.

- Risk: status drift from stale pid files.
  Mitigation: reuse process reconciliation on every start/status/stop call.

- Risk: port collisions from misconfiguration.
  Mitigation: validate configured ports early and fail with explicit messages.

## Implementation Outline

1. Add benchmark-specific server runtime types and persistence helpers.
2. Add benchmark-specific start/stop/status server services and API routes.
3. Refactor `simpler` task launch to require an existing model server instead of spawning one.
4. Apply the same contract to `rmbench` task launching.
5. Extend the frontend with independent `simpler` and `rmbench` server controls.
6. Add backend and frontend regression coverage for independent persistent servers and task precondition failures.

## Open Decisions Resolved

The following product decisions are fixed for this implementation:
- `simpler` and `rmbench` use different ports.
- both servers may run concurrently.
- task launch does not auto-start the model server.
- task launch must fail with a clear prompt when the required server is not running.
