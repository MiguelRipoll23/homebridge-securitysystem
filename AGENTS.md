# AGENTS.md — Architecture & Development Rules

This document defines the architecture, naming conventions, and rules that all contributors and AI agents must follow when working on this codebase.

---

## Project Overview

`homebridge-securitysystem` is a Homebridge v2 accessory plugin (not a platform plugin) that exposes a fully-featured security system to HomeKit. It is written in TypeScript with ESM modules.

The plugin:
- Exposes one `SecuritySystem` HAP service plus up to 22 optional switch/sensor accessories.
- Uses an event-driven architecture: core state changes emit domain events; side-effect services (audio, webhook, command) listen and react.
- Uses an abstract `Condition` class hierarchy to encapsulate all blocking-logic decisions.
- Provides an optional Hono HTTP server for remote control.

---

## Source Layout

```
src/
  @types/            Third-party type declarations
  conditions/        Abstract Condition base + concrete condition classes
  constants/         Compile-time constants (no logic)
  handlers/          Stateful handlers wired by security-system.ts
  interfaces/        TypeScript interfaces (plain object shapes)
  services/          Stateful services (audio, webhook, command, storage, server, event bus)
  tests/             Vitest test suites
  types/             TypeScript enums and type aliases
  utils/             Pure utility functions
  index.ts           Homebridge plugin entry point
  security-system.ts Root AccessoryPlugin class
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
| Service class | `-service.ts` | `audio-service.ts` |
| Handler class | `-handler.ts` | `state-handler.ts` |
| Condition class | `-condition.ts` | `double-knock-condition.ts` |
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
- Suffix matches the layer: `...Service`, `...Handler`, `...Condition`.

### Enum Members

- UPPER_SNAKE_CASE (e.g. `SecurityState.TRIGGERED`).

### Interface Names

- PascalCase, no `I` prefix.
- Suffix: `...Interface` is not used in the filename's export — the filename carries it.

---

## Architecture: Event-Driven Side Effects

The core state machine (`StateHandler`, `TripHandler`, `SwitchHandler`) never calls side-effect services directly. Instead it emits domain events via `EventBusService`:

```
StateHandler → bus.emit(EventType.CURRENT_CHANGED, payload)
                         ↓              ↓              ↓
                  AudioService   WebhookService  CommandService
```

Each side-effect service calls `attachToBus(bus)` during construction in `security-system.ts`.

**New side effects must follow this pattern** — never add direct calls from handlers to services.

Events and their payload types are defined in `src/types/event-type.ts`. The mapping from event to payload is in `src/types/event-payload-map-type.ts`.

---

## Architecture: Condition System

All trip-blocking decisions use the `Condition` abstract base class:

```typescript
abstract class Condition {
  abstract readonly name: string;
  abstract evaluate(context: ConditionContext): boolean;
}
```

`evaluate` returns `true` to **block** the action, `false` to **allow** it.

Conditions are instantiated once inside `TripHandler` and evaluated in order. To add a new blocking rule, create a new file in `conditions/`, extend `Condition`, and add it to `TripHandler`.

---

## Architecture: Circular Dependency Resolution

`StateHandler` ↔ `TripHandler` and `StateHandler` ↔ `SwitchHandler` are mutually dependent. This is resolved with **setter injection**:

1. Construct all handlers independently.
2. Wire them with `setHandlers()` / `setStateHandler()` after all instances exist.

Do not introduce `new` calls between these classes at construction time.

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

---

## Testing

- Framework: **Vitest** (`npm test`).
- Test files live in `src/tests/` and are named `<subject>.test.ts`.
- Tests cover: conditions (all blocking paths), handler logic, and event-driven interactions.
- Mock only what is strictly necessary. Prefer structural mocks over full mock libraries.
- Do not test private methods directly — test through the public API.

---

## Adding a New Feature

1. **Types/interfaces first** — create files in `types/` or `interfaces/` before writing logic.
2. **Condition** — if the feature blocks a trip, add a `Condition` subclass.
3. **Service** — if the feature is a side effect, implement `attachToBus(bus)` and wire in `security-system.ts`.
4. **Handler** — if the feature changes state-machine logic, modify the relevant handler.
5. **Tests** — add a test covering the happy path and the main blocking/edge case.
6. **No abbreviations** — all new identifiers must be fully spelled out.
