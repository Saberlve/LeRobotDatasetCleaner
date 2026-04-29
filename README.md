---
title: LeRobotDatasetCleaner
emoji: 💻
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
license: apache-2.0
---

# LeRobotDatasetCleaner

LeRobotDatasetCleaner is a web application for interactive exploration, visualization, and cleaning of robotics datasets, particularly those in the LeRobot format. It enables users to browse, view, and analyze episodes from large-scale robotics datasets, combining synchronized video playback with rich, interactive data graphs and powerful filtering tools for dataset curation.

## Project Overview

This tool is designed to help robotics researchers and practitioners quickly inspect, understand, and clean large, complex datasets. It fetches dataset metadata and episode data (including video and sensor/telemetry data), and provides a unified interface for:

- Navigating between organizations, datasets, and episodes
- Watching episode videos
- Exploring synchronized time-series data with interactive charts
- Analyzing action quality and identifying problematic episodes
- Visualizing robot poses in 3D using URDF models
- **Filtering and cleaning datasets by flagging problematic episodes and exporting curated subsets**
- Paginating through large datasets efficiently

## Key Features

- **Dataset & Episode Navigation:** Quickly jump between organizations, datasets, and episodes using a sidebar and navigation controls.
- **Synchronized Video & Data:** Video playback is synchronized with interactive data graphs for detailed inspection of sensor and control signals.
- **Overview Panel:** At-a-glance summary of dataset metadata, camera info, and episode details.
- **Statistics Panel:** Dataset-level statistics including episode count, total recording time, frames-per-second, and an episode-length histogram.
- **Action Insights Panel:** Data-driven analysis tools to guide training configuration — includes autocorrelation, state-action alignment, speed distribution, and cross-episode variance heatmap.
- **Filtering & Cleaning Panel:** Identify and flag problematic episodes (low movement, jerky motion, outlier length) for removal. Supports in-app export of `flagged` or `unflagged` local dataset subsets into a new LeRobot-format dataset directory, and still exposes flagged episode IDs as a ready-to-run LeRobot CLI command.
- **3D URDF Viewer:** Visualize robot joint poses frame-by-frame in an interactive 3D scene, with end-effector trail rendering. Supports SO-100, SO-101, and OpenArm bimanual robots.
- **Efficient Data Loading:** Uses parquet and JSON loading for large dataset support, with pagination, chunking, and lazy-loaded panels for fast initial load.
- **Responsive UI:** Built with React, Next.js, and Tailwind CSS for a fast, modern user experience.

## Technologies Used

- **Next.js** (App Router)
- **React**
- **Recharts** (for data visualization)
- **Three.js** + **@react-three/fiber** + **@react-three/drei** (for 3D URDF visualization)
- **urdf-loader** (for parsing URDF robot models)
- **hyparquet** (for reading Parquet files)
- **Tailwind CSS** (styling)

## Quick Start

### 1. Install Runtime Dependencies

Use Node.js 20 or newer. The Docker image and local development flow are tested with Node 20.

```bash
node -v
npm -v
```

Install project dependencies:

```bash
git clone https://github.com/Saberlve/LeRobotDatasetCleaner.git
cd LeRobotDatasetCleaner
npm ci
```

If `npm ci` is not available in your environment, use:

```bash
npm install
```

### 2. One-Command Local Dataset Startup

For a local LeRobot dataset, run the helper script with the dataset path:

```bash
DATASET_ROOT=/absolute/path/to/your/lerobot_dataset \
DATASET_ALIAS=local/my_dataset \
./run_local_v21.sh
```

Then open:

```text
http://127.0.0.1:<printed-port>/local/my_dataset/episode_0
```

The script is the recommended local launcher. It:

- installs missing npm dependencies automatically;
- validates the local Next.js install before startup;
- starts the app on `PORT`, defaulting to `3001`;
- auto-selects the next free port when the default port is occupied;
- sets `LOCAL_LEROBOT_DATASETS_JSON`, `LOCAL_DATASET_BASE_URL`, and `NEXT_PUBLIC_LOCAL_DATASET_BASE_URL` for local dataset loading.

Common examples:

```bash
# Use defaults from the script.
./run_local_v21.sh

# Open a specific local dataset.
DATASET_ROOT=/mnt/d/straighten_the_box \
DATASET_ALIAS=local/straighten_the_box \
./run_local_v21.sh

# Force a port.
PORT=3002 \
DATASET_ROOT=/mnt/d/straighten_the_box \
DATASET_ALIAS=local/straighten_the_box \
./run_local_v21.sh
```

Run `./run_local_v21.sh --help` to print all supported options.

### 3. Standard Development Server

If you only need the home page or remote Hugging Face datasets, run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The landing page supports:

- remote Hugging Face dataset search/open;
- local folder import through `/api/local-datasets/*`;
- recent local dataset shortcuts;
- filtered dataset export for `flagged` or `unflagged` episode subsets.

### Optional GUI Folder Picker Setup

Local folder picking works best when a native picker is available.

Ubuntu/WSL:

```bash
sudo apt-get update
sudo apt-get install -y zenity python3-tk
```

KDE Linux:

```bash
sudo apt-get install -y kdialog
```

If no GUI picker is available, paste the dataset path manually in the app.

### Local Dataset Requirements

The local dataset directory should be a LeRobot-format dataset with metadata under `meta/` and episode data under `data/`. Supported versions are:

- `v2.0`
- `v2.1`
- `v3.0`

Local repo aliases must use the `local/<name>` format. The `<name>` part may contain letters, numbers, `.`, `_`, and `-`.

To export a filtered local dataset:

1. Open a local dataset in the visualizer.
2. Flag episodes in the Filtering panel or with the `f` shortcut.
3. Choose `flagged` or `unflagged`.
4. Pick an existing output parent directory and enter a new dataset name.
5. Open the exported dataset from the success link shown in the Filtering panel.

## Environment Variables

| Variable                               | Required                             | Purpose                                                                                                       |
| -------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `PORT`                                 | No                                   | Next.js port. `run_local_v21.sh` defaults to `3001`; `npm run dev` defaults to `3000`.                        |
| `DATASET_ROOT`                         | For `run_local_v21.sh` local startup | Absolute path to the local LeRobot dataset.                                                                   |
| `DATASET_ALIAS`                        | For `run_local_v21.sh` local startup | Local repo id, for example `local/straighten_the_box`.                                                        |
| `LOCAL_LEROBOT_DATASETS_JSON`          | No                                   | JSON object mapping local repo ids to dataset roots, for example `{"local/demo":"/mnt/d/demo"}`.              |
| `LOCAL_DATASET_BASE_URL`               | No                                   | Server-side base URL for local dataset asset requests.                                                        |
| `NEXT_PUBLIC_LOCAL_DATASET_BASE_URL`   | No                                   | Browser-side base URL for local dataset asset requests. Defaults to `LOCAL_DATASET_BASE_URL` in the launcher. |
| `LOCAL_DATASET_REGISTRY_PATH`          | No                                   | Path to the recent/imported local dataset registry JSON file.                                                 |
| `DATASET_URL`                          | No                                   | Remote dataset host base URL. Defaults to `https://huggingface.co/datasets`.                                  |
| `REPO_ID`                              | No                                   | Optional startup redirect repo id, for example `lerobot/pusht`.                                               |
| `EPISODES`                             | No                                   | Optional whitespace-separated episode allowlist used by startup redirect and data loading.                    |
| `MAX_EPISODE_POINTS`                   | No                                   | Max sampled points per episode chart.                                                                         |
| `MAX_FRAMES_OVERVIEW_EPISODES`         | No                                   | Max episodes sampled by the Frames overview.                                                                  |
| `MAX_CROSS_EPISODE_SAMPLE`             | No                                   | Max episodes sampled by cross-episode action analysis.                                                        |
| `MAX_CROSS_EPISODE_FRAMES_PER_EPISODE` | No                                   | Max frames per sampled episode for cross-episode action analysis.                                             |

## Troubleshooting

- Immediate exit with no UI: reinstall dependencies with `npm ci` or `npm install`.
- `Next.js dependencies are missing or corrupted.`: remove `node_modules` and reinstall dependencies.
- `PORT <n> is already in use`: either stop the conflicting process or run with another port, for example `PORT=3002 ./run_local_v21.sh`.
- Native SWC crash during startup: reinstall dependencies so `@next/swc-linux-x64-gnu` is restored.
- Folder picker does nothing on WSL/Linux: install `zenity`, `kdialog`, or `python3-tk`, or paste the path manually.
- Local dataset opens but assets fail to load: make sure `LOCAL_DATASET_BASE_URL` and `NEXT_PUBLIC_LOCAL_DATASET_BASE_URL` point to the same running app port.

## Development Commands

```bash
# Build for production
npm run build

# Start production server
npm run start

# Run linter
npm run lint

# Format code
npm run format
```

## Docker Deployment

This application can be deployed using Docker with npm.

### Build the Docker image

```bash
docker build -t lerobot-visualizer .
```

### Run the container

```bash
docker run -p 7860:7860 lerobot-visualizer
```

The application will be available at [http://localhost:7860](http://localhost:7860).

### Run with custom environment variables

```bash
docker run -p 7860:7860 -e DATASET_URL=your-url lerobot-visualizer
```

## Contributing

Contributions, bug reports, and feature requests are welcome! Please open an issue or submit a pull request.

### Acknowledgement

The app was orignally created by [@Mishig25](https://github.com/mishig25) and taken from this PR [#1055](https://github.com/huggingface/lerobot/pull/1055)
