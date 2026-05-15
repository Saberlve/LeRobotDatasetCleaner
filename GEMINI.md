# LeRobotDatasetCleaner & Thesis Site

This project is a Next.js-based integrated research platform for robotics. It serves as a sophisticated dataset visualization and cleaning tool for LeRobot-format datasets and as a multimedia presentation site for a robotics thesis on "Memory-Augmented VLA Systems".

## Project Overview

- **Robotics Dataset Visualizer:** Enables exploration, synchronized video/sensor playback, and interactive cleaning (flagging/exporting) of robotics datasets (ACONE, etc.).
- **Thesis Site:** An interactive presentation titled "Universal Memory System for Long-Horizon VLM-VLA Tasks", featuring storyboards, analysis, and results.
- **Evaluation Workspace:** Integration for replaying evaluation videos from SimplerEnv and RMBench, and comparing memory-policy training runs.
- **Key Domain:** Robotics, Vision-Language-Action (VLA) models, Robot Learning, Memory Systems.

## Architecture & Technologies

- **Framework:** [Next.js 15](https://nextjs.org/) (App Router) with [React 19](https://react.dev/).
- **Styling:** [Tailwind CSS 4](https://tailwindcss.com/).
- **3D Visualization:** [Three.js](https://threejs.org/) via `@react-three/fiber` and `@react-three/drei`. Supports URDF and MuJoCo scenes.
- **Simulation:** [MuJoCo](https://mujoco.org/) WASM integration for physics-based replay.
- **Data Handling:** [hyparquet](https://github.com/hyparam/hyparquet) for high-performance Parquet reading directly in the browser.
- **Data Visualization:** [Recharts](https://recharts.org/) for synchronized telemetry/sensor graphs.

## Directory Structure

- `src/app/`: Next.js App Router pages.
  - `[org]/[dataset]/[episode]/`: Core dataset visualizer routes.
  - `evaluation/`, `method/`, `results/`, etc.: Thesis content pages.
  - `api/`: Backend API routes for local dataset discovery, registration, and export.
- `src/components/`:
  - `thesis/`: UI components for the thesis presentation.
  - `urdf-viewer.tsx`: 3D robot visualization using URDF.
  - `mujoco-sim-viewer.tsx`: MuJoCo simulation playback.
  - `episode-viewer.tsx`: Unified episode visualization logic.
- `src/utils/`:
  - `parquetUtils.ts`: Core logic for reading LeRobot Parquet files.
  - `constants.ts`: Shared constants for thresholds, padding, and config.
- `public/`: Static assets including videos, 3D models (URDF/MuJoCo), and images.
- `data/`: Local dataset registry and configuration.

## Development & Execution

### Key Commands

- **Start Dev Server:** `npm run dev` (defaults to port 3000).
- **Local Dataset Visualizer:**
  ```bash
  ./run_local_v21.sh
  ```
  Recommended way to view local datasets. Handles port selection and required environment variables (`DATASET_ROOT`, `DATASET_ALIAS`).
- **Validation Suite:** `npm run validate` (Runs type-check, lint, format check, and tests).
- **Type-Check:** `npm run type-check` (Checks both app and test source sets).
- **Testing:** `npm run test` (Uses Vitest).

### Environment Variables

- `DATASET_ROOT`: Absolute path to a local LeRobot dataset.
- `DATASET_ALIAS`: Local repository ID (e.g., `local/my_dataset`).
- `LOCAL_DATASET_BASE_URL`: Base URL for serving local dataset assets.
- `NEXT_PUBLIC_LOCAL_DATASET_BASE_URL`: Publicly accessible version of the base URL.

## Conventions & Standards

- **TypeScript:** Strict typing is mandatory. Custom types are located in `src/types/`. Avoid `any`.
- **Styling:** Tailwind CSS 4. Adhere to the "Brand Tone": off-white canvas (`bg-[#fdfcfb]`), ink-brown text (`text-[#2c2421]`), and muted clay accents.
- **Component Design:** Prefer functional components. Heavy use of `TimeContext` (`src/context/time-context.tsx`) for synchronizing video, 3D, and charts.
- **Data Processing:** Minimize main thread blocking when processing large Parquet files. Use efficient chunking/pagination as seen in `parquetUtils.ts`.
- **LeRobot Versions:** Supports `v2.0`, `v2.1`, and `v3.0`. Refer to `EXCLUDED_COLUMNS` in `src/utils/constants.ts` when handling version-specific data columns.
- **Internationalization:** Thesis content is primarily in Chinese (`zh-CN`).

## Visualizer Specifics

- **Flagging:** Interactive flagging of problematic episodes. Flags are persisted via the local API.
- **Synchronization:** Video playback is the master clock for the `TimeContext`. Charts and 3D viewers must subscribe to this context to stay in sync.
- **Local Registry:** Local datasets are registered in `data/local_datasets_registry.json`.
