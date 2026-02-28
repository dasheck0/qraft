# AGENTS.md — Coding Agent Reference for `qraft`

`qraft` is a TypeScript CLI tool (published as the `qraft` npm package) that scaffolds structured
project setups from GitHub template repositories. Source lives in `src/`, compiles to `dist/`
via `tsc`, and is executed from `bin/qraft.js`.

---

## 1. Build, Lint & Test Commands

### Install dependencies
```bash
npm ci
```

### Build (compile TypeScript → `dist/`)
```bash
npm run build          # one-shot compile
npm run dev            # watch mode
npm run clean          # remove dist/
```

### Type-check (without emitting)
```bash
npx tsc --noEmit
```
> tsconfig.json enforces `strict`, `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`, and
> `exactOptionalPropertyTypes`. All violations are errors.

### Lint
```bash
npm run lint           # currently a no-op placeholder – no ESLint configured yet
```

### Tests
```bash
npm test                          # run all tests (jest)
npm run test:watch                # watch mode
npm run test:coverage             # with coverage report → coverage/

# Run a SINGLE test file
npx jest src/core/boxManager.test.ts

# Run a SINGLE test by name pattern (matches describe/it strings)
npx jest --testNamePattern "should detect box state correctly"

# Run tests in a specific directory
npx jest src/core/
```

Test framework: **Jest** with **ts-jest** preset. Config in `jest.config.js`.  
Tests live alongside source files with `.test.ts` or `.spec.ts` suffixes, or inside
`__tests__/` folders.

### Pre-publish gate
```bash
npm run prepublishOnly   # clean → build → test (same as CI)
```

### Commit message hook
`lefthook` enforces **Conventional Commits** via `commitlint` on every commit:
```
feat: add cache eviction strategy
fix: handle empty registry list
chore: release v1.2.0
docs: update README examples
```

---

## 2. Project Structure

```
src/
  cli.ts              # Entry point; wires commander commands
  commands/           # One file per CLI command (create, copy, list, update, …)
  core/               # Domain logic (BoxManager, RegistryManager, CacheManager, …)
  interactive/        # Inquirer-based prompts, manifest builder, progress indicators
  types/              # Shared TypeScript interfaces (index.ts)
  utils/              # Cross-cutting utilities (config, gitignoreManager, manifestUtils, …)
bin/
  qraft.js            # Thin shell wrapper; executed by npx / global install
dist/                 # Compiled output (git-ignored)
```

---

## 3. TypeScript Style Guidelines

### Strict mode — always honoured
`tsconfig.json` sets `strict: true` plus:
- `noImplicitAny` — never use implicit `any`; annotate or use `unknown`
- `noUnusedLocals` / `noUnusedParameters` — remove unused symbols
- `exactOptionalPropertyTypes` — use `field?: T` only when `undefined` is a meaningful value
- `noImplicitReturns` — every code path must return

### Imports
- Use Node built-ins via the `* as` namespace form:
  ```ts
  import * as fs from 'fs-extra';
  import * as path from 'path';
  import * as os from 'os';
  ```
- Named imports for third-party and internal modules:
  ```ts
  import { Octokit } from '@octokit/rest';
  import { BoxManager } from './core/boxManager';
  import { BoxInfo, BoxReference } from '../types';
  ```
- Barrel file for types: all shared interfaces live in `src/types/index.ts` and are imported
  from `'../types'` (not `'../types/index'`).
- Group imports: Node built-ins → third-party → internal (no blank lines required, but keep
  them in this logical order for readability).

### Naming conventions
| Concept | Convention | Example |
|---|---|---|
| Classes | `PascalCase` | `BoxManager`, `RegistryManager` |
| Interfaces | `PascalCase`, no `I` prefix | `BoxInfo`, `BoxReference` |
| Functions / methods | `camelCase` | `parseBoxReference`, `copyBox` |
| Private class members | `camelCase` (no underscore) | `private configManager` |
| Constants / enum values | `camelCase` for local, `UPPER_SNAKE` acceptable for module-level | |
| Files | `camelCase` matching the primary export | `boxManager.ts`, `registryManager.ts` |
| Test files | Same name + `.test.ts` suffix | `boxManager.test.ts` |

### Classes & architecture
- One primary export per file; the file name matches the class name.
- Prefer **classes** for stateful domain objects (`BoxManager`, `CacheManager`, etc.) and
  **standalone exported functions** for pure utilities (`createCommand`, `listCommand`).
- Use **private** visibility for internal helpers; expose only the minimal public surface.
- Lazy-initialise expensive dependencies (e.g. `RegistryManager`, `CacheManager`) with a
  `private async initializeManagers()` guard pattern.

### Types
- Define every public API shape as an `interface` in `src/types/index.ts`.
- Add JSDoc `/** … */` comments with `@param` / `@returns` on all public methods.
- Avoid `any`; use `unknown` with type-narrowing or precise union types.
- Use `Record<string, T>` instead of plain object index signatures where keys are strings.

### Async / await
- All async operations use `async/await`; avoid raw `.then()` chains.
- Always type the return of async functions: `Promise<BoxOperationResult>`.

---

## 4. Error Handling

- **Catch at the boundary** (CLI command handler), not deep in domain logic.
- Domain methods throw `Error` with descriptive messages; callers catch and either re-throw
  with context or convert to a structured result object (`BoxOperationResult`).
- Re-wrap unknown caught values:
  ```ts
  throw new Error(`Failed to sync manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);
  ```
- CLI action handlers follow this pattern:
  ```ts
  .action(async (args, options) => {
    try {
      await someCommand(boxManager, args, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });
  ```
- Non-fatal side effects (e.g. manifest storage after a successful copy) use `console.warn`
  and continue rather than failing the parent operation.

---

## 5. Testing Conventions

- **Jest + ts-jest**; tests run in `node` environment.
- Use `describe` blocks to group by class / function, nested `describe` blocks for method names.
- Mock all external I/O at the module level with `jest.mock(...)` before imports.
- Mock `@octokit/rest` to avoid ES-module issues:
  ```ts
  jest.mock('@octokit/rest', () => ({
    Octokit: jest.fn().mockImplementation(() => ({ rest: { … } }))
  }));
  ```
- Use real `fs-extra` and `os.tmpdir()` for filesystem tests; create a temp dir in
  `beforeEach` and clean up in `afterEach`:
  ```ts
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'my-test-'));
  // afterEach: await fs.remove(tempDir);
  ```
- `jest.config.js` sets `clearMocks: true` and `restoreMocks: true` globally — no need to
  call these manually.
- Name tests in plain English: `'should detect box state correctly'`.

---

## 6. Output & User-Facing Code

- Use `chalk` for all coloured terminal output (`chalk.red`, `chalk.blue.bold`, `chalk.gray`).
- Use `inquirer` for interactive prompts.
- Use `commander` for CLI argument / option parsing.
- Verbose output is gated behind `process.env.QRAFT_VERBOSE === 'true'`.

---

## 7. Git & Release Workflow

- **Conventional Commits** are enforced by `commitlint` + `lefthook` on the `commit-msg` hook.
- CI runs on Node 20.x (`ubuntu-latest`); must pass `npm test` and `npm run build`.
- Releases are triggered by commits prefixed with `chore: release` on `master`.
- Do **not** commit `dist/`, `coverage/`, or `*.tgz` — all are git-ignored.
