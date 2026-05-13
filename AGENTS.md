# Repository Guidelines

## Project Structure & Module Organization

This is a Next.js 15 / React 19 TypeScript app for inspecting and cleaning LeRobot datasets. Routes live in `src/app`, reusable UI in `src/components`, server-side dataset utilities in `src/server`, shared types in `src/types`, and helpers in `src/lib` and `src/utils`. Tests are colocated in `__tests__` folders under `src`. Static robot, URDF, MuJoCo, and media assets live in `public/`; additional CAD/robot model files are in `ARX_Model/`.

## Build, Test, and Development Commands

- `npm run dev`: start the standard Next.js development server, usually on `localhost:3000`.
- `./run_local_v21.sh`: recommended launcher for local LeRobot datasets; set `DATASET_ROOT`, `DATASET_ALIAS`, and optionally `PORT`.
- `npm run build`: create a production Next.js build.
- `npm run type-check`: run TypeScript checks for app and test configs.
- `npm run test`: run Vitest once.
- `npm run validate`: run type checking, linting, format check, and tests.

## Coding Style & Naming Conventions

Use TypeScript and React function components. Follow the existing file naming style: kebab-case for component and helper files such as `filtering-panel.tsx`, and `.test.ts` or `.test.tsx` for tests. Prefer the `@/` alias for imports from `src`. Formatting is handled by Prettier 3. ESLint extends `next/core-web-vitals` and `next/typescript`; `any` is only a warning, but prefer explicit domain types from `src/types`.

## Testing Guidelines

Vitest is configured in `vitest.config.ts` with a Node environment and includes `src/**/__tests__/**/*.test.ts(x)`. Add tests near the code they cover, especially for dataset parsing, filtering/export behavior, and visualizer helper logic. Use React Testing Library for component behavior. Run targeted tests with `npx vitest run path/to/file.test.tsx`.

## Commit & Pull Request Guidelines

Recent history uses short messages, sometimes with conventional prefixes such as `docs:` and `chore:`. Prefer concise imperative messages like `fix: preserve local dataset aliases` or `test: cover export selection`. Pull requests should include a behavior summary, validation commands, linked issues or context, and screenshots or recordings for UI changes.

## Configuration & Asset Notes

Do not commit private datasets or machine-specific paths. Use environment variables documented in `README.md`, especially `LOCAL_LEROBOT_DATASETS_JSON`, `LOCAL_DATASET_BASE_URL`, and `NEXT_PUBLIC_LOCAL_DATASET_BASE_URL`. Keep large binary assets under existing asset directories and avoid renaming robot model files unless loader references are updated.
