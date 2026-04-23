# G1 MuJoCo Replay Design

## Goal

Replace the current split `3D Replay` / `Sim Replay` experience with one stable `Replay` tab for G1 datasets. The new replay must:

- load reliably without freezing the page
- play episode trajectory data on a G1 MuJoCo model
- support play/pause, scrub, reset, and episode switching
- run in browser environments with or without NVIDIA GPUs
- degrade clearly when MuJoCo or WebGL initialization fails

This scope does not include policy tracking, text-to-motion generation, dual-panel SONIC UI, or advanced physics controls.

## Why The Current Sim Replay Fails

The existing `src/components/mujoco-sim-viewer.tsx` assumes MuJoCo assets exist at `/mujoco/g1/g1.xml` and `/mujoco/g1/assets/*`, but this repository currently only contains URDF assets under `public/urdf/...`. As a result, the current Sim Replay path cannot complete initialization and can stall in a broken loading state.

The current implementation also mixes together:

- MuJoCo runtime initialization
- mesh loading
- episode data loading
- frame playback
- tab-level UI concerns

That coupling makes failure handling weak and increases the risk of lockups during tab entry or episode changes.

## User Experience

### Navigation

- Remove the separate `Sim Replay` tab.
- Rename `3D Replay` to `Replay`.
- Show `Replay` only for G1-capable datasets.
- Keep the existing left sidebar episode list and keyboard shortcuts:
  - `Space`: play/pause
  - `ArrowUp` / `ArrowDown`: previous/next episode

### Replay Layout

The `Replay` tab contains:

- one main MuJoCo viewport
- one compact bottom control bar
- one small status area for episode/frame information

Controls are limited to:

- play/pause
- frame scrubber
- reset to frame `0`
- current frame / total frames
- current episode id

The replay page will not expose:

- policy toggles
- physics toggles
- dual reference/simulation panes
- large joint-mapping editing UI

### Failure And Degradation

If MuJoCo assets fail to load, MuJoCo WASM fails to initialize, or WebGL setup fails:

- do not leave the page in infinite loading
- show a clear visible error state
- optionally fall back to the existing URDF replay component in-page

The fallback remains internal to the `Replay` tab. It is not exposed as a separate tab.

## Compatibility

The replay must work in environments with and without NVIDIA GPUs.

Implementation constraint:

- use browser-side MuJoCo WASM plus browser rendering
- do not depend on CUDA, native MuJoCo binaries, or server-side GPU support

Expected behavior:

- with hardware acceleration available, rendering is smoother
- without NVIDIA GPU, replay still functions through the browser's normal graphics stack
- if browser WebGL support is unavailable, fail clearly and fall back when possible

## Architecture

### New Focused Viewer

Create a focused G1-only MuJoCo replay component, tentatively:

- `src/components/g1-mujoco-replay.tsx`

Responsibilities:

- initialize MuJoCo once
- load G1 XML and mesh assets
- maintain MuJoCo model/data references
- load and cache episode trajectory data
- translate current frame into `qpos`
- drive playback with `requestAnimationFrame`
- expose clear loading, ready, and error states

Responsibilities explicitly excluded:

- tab management
- sidebar pagination
- dataset-wide stats or filtering logic

### Episode Viewer Integration

`src/app/[org]/[dataset]/[episode]/episode-viewer.tsx` will:

- replace the current `urdf` / `sim` split with one `replay` tab
- keep sidebar behavior unchanged
- pass the current dataset and episode context to the replay component
- preserve keyboard control routing for the replay tab

### Asset Layout

Add a new public asset root:

- `public/mujoco/g1/g1.xml`
- `public/mujoco/g1/assets/*`

The XML must reference mesh assets in a way that the browser-side MuJoCo loader can mirror into its virtual filesystem before model creation.

## Data Flow

### Initialization

On first entry into `Replay`:

1. load dataset metadata if needed
2. initialize MuJoCo WASM
3. load G1 XML and mesh assets into MuJoCo virtual filesystem
4. create `MjModel` and `MjData`
5. render the initial pose

Initialization is one-time per mounted replay instance. Episode switches must not reconstruct the full runtime unless initialization itself failed.

### Episode Loading

For the active episode:

1. obtain flat chart data for the episode
2. cache it by episode id
3. derive frame count from chart rows
4. map dataset state columns into the G1 joint order expected by MuJoCo

Episode changes must:

- stop playback
- reset frame to `0`
- reuse the existing MuJoCo runtime
- only swap the trajectory buffer

### Playback

Playback logic will:

- keep the current frame index in React state plus a mutable ref
- advance frames with `requestAnimationFrame`
- write joint positions into `data.qpos`
- call `mj_forward`
- synchronize rendered geometry transforms from MuJoCo state

Reset returns the replay to frame `0` without reloading assets.

## Joint Mapping

The first implementation is G1-only and uses a deterministic mapping path.

Rules:

- use `observation.state...` columns from episode flat chart data
- map them to the known G1 joint order used by the viewer
- if a required column is missing, report an explicit mapping error instead of silently playing corrupted motion

The replay UI will not expose manual joint remapping in this iteration.

## Stability Rules

To prevent the current freeze behavior:

- separate MuJoCo initialization from episode-data fetching
- never do async asset fetches inside the per-frame render loop
- keep mesh/model/data construction out of episode-switch paths
- ensure every async path resolves to one of:
  - ready
  - recoverable fallback
  - visible error
- clean up `requestAnimationFrame`, model, and data objects on unmount

## Testing Strategy

Add focused tests for logic that can be validated without a real browser MuJoCo runtime.

### Unit Tests

Add tests for:

- G1 joint-column extraction and validation
- replay tab visibility gating
- replay tab label and active-tab routing
- failure-state rendering where initialization rejects

### Manual Verification

Manual checks are required for:

- G1 Replay tab opens without freezing
- first frame renders successfully
- play/pause works
- scrubber updates pose correctly
- reset returns to frame `0`
- episode switching reuses runtime and loads the new trajectory
- browser without NVIDIA GPU still runs replay
- forced MuJoCo failure shows fallback or error instead of infinite loading

## Out Of Scope

- policy inference
- text generation or Kimodo-style motion generation
- SONIC dual-panel layout
- physics on/off toggles
- non-G1 MuJoCo support
- server-side native MuJoCo execution
