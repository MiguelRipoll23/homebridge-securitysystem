# AGENTS.md — Architecture & Development Rules

This document defines the architecture, naming conventions, and rules that all contributors and AI agents must follow when working on this codebase.

---

## Project Overview

`homebridge-securitysystem` is a Homebridge accessory plugin (not a platform plugin) that exposes a fully-featured security system to HomeKit. It is written in TypeScript with ESM modules.

The plugin:
- Exposes one `SecuritySystem` HAP service plus a configurable set of optional switch/sensor accessories (trip, mode, arming-lock, and audio switches; motion sensors).
- Uses an event-driven architecture: core state changes emit domain events; side-effect services (audio, webhook, command, MQTT) listen and react.
- Uses an abstract `Condition` class hierarchy to encapsulate all blocking-logic decisions.
- Provides an optional Hono HTTP server (zod-validated routes with OpenAPI and Scalar docs) for remote control.
- Optionally publishes status updates over MQTT.

---

## Source Layout

```
src/
  @types/            Third-party type declarations
  conditions/        Abstract Condition base + concrete condition classes
  constants/         Compile-time constants (no logic)
  handlers/          Stateful handlers wired by security-system.ts
  homekit/           HomeKit service construction + characteristic registration
  interfaces/        TypeScript interfaces (plain object shapes)
  schemas/           Zod schemas for HTTP server request/response validation
  services/          Stateful services (audio, webhook, command, MQTT, storage, server, event bus)
  tests/             Vitest test suites
  timers/            Centralised timer/interval ownership (TimerManager)
  types/             TypeScript enums and type aliases
  utils/             Pure utility functions
  index.ts                    Homebridge plugin entry point
  security-system.ts          Root security-system class (hosts services on a PlatformAccessory)
  security-system-platform.ts Dynamic platform plugin (DynamicPlatformPlugin)
```

---

## Layer Rules

| Layer | What belongs here | What does NOT belong |
|---|---|---|
| `types/` | Enums, type aliases | Logic, classes |
| `interfaces/` | Plain object shape interfaces | Logic, classes, enums |
| `constants/` | `const` objects, literal values | Logic, mutable state |
| `utils/` | Pure functions with no side effects | Classes, state, I/O |
| `conditions/` | Classes extending `Condition` | Handlers, services |
| `schemas/` | Zod schemas for HTTP validation | Logic, I/O |
| `timers/` | Timer/interval ownership (`TimerManager`) | Timer logic embedded in handlers |
| `homekit/` | HomeKit service construction, characteristic registration | State-machine logic |
| `services/` | Stateful singleton classes, I/O | Embedded types, enums, interfaces |
| `handlers/` | State-machine logic classes | Embedded types, enums, interfaces |

**Types, enums, and interfaces must never be defined inside a service or handler file.** Always create a separate file in `types/` or `interfaces/` and import it.

---

## File Naming Conventions

All filenames use **kebab-case** with a mandatory suffix describing their kind:

| Kind | Suffix | Example |
|---|---|---|
| Enum or type alias | `-type.ts` | `security-state-type.ts` |
| Interface | `-interface.ts` | `system-state-interface.ts` |
| Constant object | `-constant.ts` | `homekit-constant.ts` |
| Utility functions | `-util.ts` | `state-util.ts` |
| Zod schema | `-schema.ts` | `error-schema.ts` |
| Service class | `-service.ts` | `audio-service.ts` |
| Handler class | `-handler.ts` | `state-handler.ts` |
| Condition class | `-condition.ts` | `double-knock-condition.ts` |
| HomeKit registrar class | `-registrar.ts` | `homekit-registrar.ts` |
| Factory function | `-factory.ts` | `service-factory.ts` |
| Timer manager class | `-manager.ts` | `timer-manager.ts` |
| Platform class | `-platform.ts` | `security-system-platform.ts` |
| Test suite | `.test.ts` | `conditions.test.ts` |

---

## Naming Conventions

### No Abbreviations

**Variable names, parameter names, and type names must not use abbreviations.**

This rule applies everywhere: source files, test files, and any new code.

Forbidden examples and their correct replacements:

| Forbidden | Use instead |
|---|---|
| `s`, `st` for state | `state` |
| `o`, `opts` for options | `options` |
| `v` for value | `value` |
| `req` for request | `request` |
| `res` for response | `response` |
| `c` for context | `context` |
| `e` for error | `error` |
| `cb` for callback | `callback` |
| `fn` for function | the actual semantic name |
| `svc` for service | `service` |
| `char` for characteristic | `characteristic` |
| `Char` for Characteristic constructor | `Characteristic` |
| `Svc` for Service constructor | `Service` |
| `proc` for process | `process` |
| `dir` for directory | `directory` |
| `msg` for message | `message` |
| `buf` for buffer | `buffer` |
| `idx` for index | `index` |
| `len` for length | `length` |
| `num` for number | `number` or a semantic name |
| `str` for string | the semantic name |
| `tmp` for temporary | the semantic name |
| `args` for arguments | `arguments` (or a semantic name) |

**Exception:** loop variables `i`, `j`, `k` in tight numeric loops where the name carries no domain meaning are acceptable. All other names must be descriptive.

### Class Names

- PascalCase, no abbreviations.
- Suffix matches the layer: `...Service`, `...Handler`, `...Condition`, `...Registrar`, `...Manager`.

### Enum Members

- UPPER_SNAKE_CASE (e.g. `SecurityState.TRIGGERED`).

### Interface Names

- PascalCase, no `I` prefix.
- Suffix: `...Interface` is not used in the filename's export — the filename carries it.

---

## Architecture: Event-Driven Side Effects

The core state machine (`StateHandler`, `TripHandler`, `SwitchHandler`) never calls the bus-attached side-effect services directly. Instead it emits domain events via `EventBusService`:

```
StateHandler → bus.emit(EventType.CURRENT_CHANGED, payload)
                         ↓              ↓              ↓              ↓
                  AudioService   WebhookService  CommandService  MqttService
```

`AudioService` and `StorageService` are constructor-injected into the handlers that need them; `WebhookService`, `CommandService`, and `MqttService` are purely event-driven and call `attachToBus(bus)` during construction in `security-system.ts`.

**New side effects must follow this pattern** — never add direct calls from handlers to services. The MQTT client is disconnected on shutdown via an `api.on('shutdown', ...)` hook wired in `security-system.ts`.

Events and their payload types are defined in `src/types/event-type.ts`. The mapping from event to payload is in `src/types/event-payload-map-type.ts`.

---

## Architecture: Condition System

All trip-blocking decisions use the `Condition` abstract base class:

```typescript
abstract class Condition {
  abstract readonly name: string;
  protected _failureReason: string | undefined;
  get failureReason(): string | undefined;
  protected clearFailureReason(): void;
  abstract evaluate(context: ConditionContext): boolean;
}
```

`evaluate` returns `true` to **block** the action, `false` to **allow** it. Implementations must call `this.clearFailureReason()` at the top of `evaluate()` and set `this._failureReason` before returning `true`; callers read it via `failureReason` to surface the blocking reason to the user.

The context is the `ConditionContext` interface in `src/interfaces/condition-context-interface.ts` (`state`, `services`, `options`, `value`, `origin`, `log`).

Conditions are instantiated once inside `TripHandler` and evaluated in order: `NotArmedCondition`, `ArmingInProgressCondition`, `DoubleKnockCondition`, `AlreadyTriggeredCondition`, `TriggerAlreadyRunningCondition`. To add a new blocking rule, create a new file in `conditions/`, extend `Condition`, and add it to the list in `TripHandler`.

---

## Architecture: Handler Wiring & Dependency Resolution

Handlers are constructed in a fixed order in `security-system.ts` so no two handlers hold constructor references to each other:

1. `SensorHandler` (leaf — no handler dependencies)
2. `StateHandler` (depends on `SensorHandler`)
3. `SwitchHandler` (one-way constructor dependency on `StateHandler`)
4. `TripHandler` (depends on `SensorHandler`; no `StateHandler` reference)

Coordination between `StateHandler` ↔ `TripHandler` and `StateHandler` ↔ `SwitchHandler` is done through the event bus rather than setter injection:

- `switchHandler.subscribeToStateEvents(bus)` registers listeners for `RESET_MODE_SWITCHES` / `UPDATE_MODE_SWITCHES`.
- `security-system.ts` subscribes to `TRIGGER_FIRED` (calls `stateHandler.setCurrentState(TRIGGERED, origin)`) and `TRIP_CANCELLED` (falls back to OFF or `stateHandler.resetTimers()`).

Do not introduce constructor cycles or setter injection between handlers — wire cross-handler coordination through the bus.

---

## Code Style Rules

### File Length
Maximum **400 lines** per file. Split into smaller focused files if the limit is reached.

### Inline Guards
Use early-return guard clauses rather than deep nesting:
```typescript
if (!value) {
  return false;
}
```

### Imports
- Use `import type` for types and interfaces that are not needed at runtime.
- Always use `.js` extensions on relative imports (required for ESM).

### Async
- Use `async`/`await`. Avoid `.then()` chains except when fire-and-forget is intentional.

### Error Handling
- Validate only at system boundaries (config parsing, HTTP input, external storage).
- Do not add defensive null-checks for values guaranteed by the type system.

### Timers
State-machine timers and intervals (arm, trigger, pause, double-knock, reset, tripped/triggered sensor polling) are owned by `TimerManager` (`src/timers/timer-manager.ts`). Handlers call its `set...Timer()` / `clear...Timer()` methods instead of creating raw timer handles, and never store timer handles in `SystemState`. Short-lived one-off delays (sensor pulses, HTTP-side trip deferral) may use raw `setTimeout`.

---

## Testing

- Package manager is **pnpm** (`pnpm-lock.yaml`).
- Framework: **Vitest** (`pnpm test`).
- Lint with **Oxlint** (`pnpm run lint`); typecheck with `pnpm run typecheck` (`tsc --noEmit`); build with `pnpm run build`.
- Test files live in `src/tests/` and are named `<subject>.test.ts`.
- Tests cover: conditions (all blocking paths), handler logic, and event-driven interactions.
- Mock only what is strictly necessary. Prefer structural mocks over full mock libraries.
- Do not test private methods directly — test through the public API.
- The HTTP server exposes its Hono app via `get app` for integration tests.

---

## Adding a New Feature

1. **Types/interfaces first** — create files in `types/` or `interfaces/` before writing logic.
2. **Condition** — if the feature blocks a trip, add a `Condition` subclass and register it in `TripHandler`.
3. **Timer** — if the feature needs delays or polling, add methods to `TimerManager` rather than raw `setTimeout`/`setInterval` calls.
4. **Service** — if the feature is a side effect, implement `attachToBus(bus)` and wire it in `security-system.ts`. If it holds a connection (e.g. MQTT), clean it up on `api.on('shutdown')`.
5. **HTTP endpoint** — if the feature is exposed over the server, add a zod schema in `schemas/` and a route in `server-service.ts`.
6. **Handler** — if the feature changes state-machine logic, modify the relevant handler and coordinate via the event bus.
7. **Tests** — add a test covering the happy path and the main blocking/edge case.
8. **No abbreviations** — all new identifiers must be fully spelled out.
