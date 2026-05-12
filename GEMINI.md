# LeRobotDatasetCleaner & Thesis Site

This project is a Next.js-based interactive platform for robotics research. It serves a dual purpose: a sophisticated dataset visualization and cleaning tool for LeRobot-format datasets, and a multimedia presentation site for a robotics thesis on "Memory-Augmented VLA Systems".

## Project Overview

-   **Robotics Dataset Visualizer:** Enables exploration, synchronized video/sensor playback, and interactive cleaning (flagging/exporting) of robotics datasets.
-   **Thesis Site:** An interactive, visually rich presentation of a graduation thesis titled "Universal Memory System for Long-Horizon VLM-VLA Tasks".
-   **Key Domain:** Robotics, Vision-Language-Action (VLA) models, Robot Learning.

## Architecture & Technologies

-   **Framework:** [Next.js 15](https://nextjs.org/) (App Router) with [React 19](https://react.dev/).
-   **Styling:** [Tailwind CSS 4](https://tailwindcss.com/).
-   **3D Visualization:** [Three.js](https://threejs.org/) via `@react-three/fiber` and `@react-three/drei`. Supports URDF and MuJoCo scenes.
-   **Data Visualization:** [Recharts](https://recharts.org/) for synchronized telemetry/sensor graphs.
-   **Data Handling:** [hyparquet](https://github.com/hyparam/hyparquet) for reading Parquet files directly in the browser.
-   **Simulation:** [MuJoCo](https://mujoco.org/) WASM integration for physics-based replay.

## Directory Structure

-   `src/app/`: Next.js App Router pages.
    -   `[org]/[dataset]/[episode]/`: Core dataset visualizer routes.
    -   `evaluation/`, `method/`, `results/`, etc.: Thesis content pages.
    -   `api/`: Backend API routes for local dataset discovery and export.
-   `src/components/`:
    -   `thesis/`: UI components specific to the thesis presentation.
    -   `urdf-viewer.tsx`: 3D robot visualization.
    -   `mujoco-sim-viewer.tsx`: MuJoCo simulation playback.
    -   `episode-viewer.tsx`: Unified episode visualization logic.
-   `src/utils/`: Data processing, parquet utilities, and LeRobot format helpers.
-   `public/`: Static assets including videos, 3D models (URDF/MuJoCo), and images.
-   `data/`: Local dataset registry and configuration.

## Development & Execution

### Key Commands

-   **Start Dev Server:** `npm run dev` (defaults to port 3000).
-   **Local Dataset Visualizer:**
    ```bash
    ./run_local_v21.sh
    ```
    This script is the recommended way to view local datasets. It handles port selection and environment variables.
-   **Build:** `npm run build`
-   **Linting:** `npm run lint`
-   **Type-Check:** `npm run type-check`
-   **Testing:** `npm run test` (uses Vitest)
-   **Validation:** `npm run validate` (Runs type-check, lint, format check, and tests)

### Environment Variables

-   `DATASET_ROOT`: Absolute path to a local LeRobot dataset.
-   `DATASET_ALIAS`: Local repository ID (e.g., `local/my_dataset`).
-   `LOCAL_DATASET_BASE_URL`: Base URL for serving local dataset assets.

## Conventions

-   **TypeScript:** Strict typing is preferred. Custom types are located in `src/types/`.
-   **Components:** Functional components with Tailwind CSS for styling.
-   **Data Loading:** Heavy use of `hyparquet` for client-side parquet processing. Ensure large datasets are handled efficiently (pagination/chunking).
-   **3D Assets:** URDF models are stored in `public/urdf/`. MuJoCo scenes are in `public/mujoco/`.
-   **Internationalization:** The thesis site is primarily in Chinese (`zh-CN`).

## Visualizer Specifics

-   **Flagging:** Users can "flag" episodes as problematic. These flags are stored locally and can be used to export a cleaned dataset.
-   **Synchronization:** Video playback is synchronized with the time-series charts using `TimeContext` (`src/context/time-context.tsx`).
-   **LeRobot Versions:** Supports LeRobot dataset versions `v2.0`, `v2.1`, and `v3.0`.
