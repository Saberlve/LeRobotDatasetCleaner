"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, Html } from "@react-three/drei";
import * as THREE from "three";
import type { EpisodeData } from "@/app/[org]/[dataset]/[episode]/fetch-data";
import { loadEpisodeFlatChartData } from "@/app/[org]/[dataset]/[episode]/fetch-data";
import { getDatasetVersionAndInfo } from "@/utils/versionUtils";
import type { DatasetMetadata } from "@/utils/parquetUtils";
import UrdfPlaybackBar from "@/components/urdf-playback-bar";
import { useTime } from "@/context/time-context";
import {
  G1_JOINT_NAMES,
  buildG1QposFrames,
  buildG1QposFrame,
  extractOrderedG1StateColumns,
} from "@/components/g1-mujoco-replay-helpers";
import {
  DEFAULT_G1_MUJOCO_XML_PATH,
  G1_VISUAL_ASSET_BASE_PATH,
  G1_VISUAL_MANIFEST_PATH,
  prepareMujocoVisualPoseXml,
} from "@/components/mujoco-sim-viewer-helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MujocoModule = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MjModel = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MjData = any;

const G1_QPOS_OFFSET = 7; // floating base takes first 7 values

// ─── MuJoCo geom types ───
const mjGEOM_PLANE = 0;
// const mjGEOM_HFIELD = 1;
const mjGEOM_SPHERE = 2;
const mjGEOM_CAPSULE = 3;
// const mjGEOM_ELLIPSOID = 4;
const mjGEOM_CYLINDER = 5;
const mjGEOM_BOX = 6;
const mjGEOM_MESH = 7;

type G1VisualDescriptor = {
  geomIndex: number;
  glb: string;
  meshPos: [number, number, number];
  meshQuat: [number, number, number, number];
  rgba: [number, number, number, number];
};

type G1VisualManifest = {
  visuals: G1VisualDescriptor[];
};

type LoadedVisual = {
  geomIndex: number;
  meshPos: THREE.Vector3;
  meshQuat: THREE.Quaternion;
  object: THREE.Object3D;
};

// ─── MuJoCo Scene ───
function MujocoScene({
  mujocoRef,
  modelRef,
  dataRef,
  qposFrame,
  physicsEnabled,
}: {
  mujocoRef: React.MutableRefObject<MujocoModule | null>;
  modelRef: React.MutableRefObject<MjModel | null>;
  dataRef: React.MutableRefObject<MjData | null>;
  qposFrame: Float64Array;
  physicsEnabled: boolean;
}) {
  const { scene } = useThree();
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const visualsRef = useRef<LoadedVisual[]>([]);
  const [loading, setLoading] = useState(true);
  const [visualProgress, setVisualProgress] = useState({ loaded: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // Initialize MuJoCo model and Three.js meshes
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    let cancelled = false;
    const mujocoRoot = new THREE.Group();
    mujocoRoot.rotation.x = -Math.PI / 2;
    mujocoRoot.name = "mujoco-z-up-root";
    scene.add(mujocoRoot);

    const init = async () => {
      try {
        // Load MuJoCo WASM module
        const loadMujoco = (await import("@mujoco/mujoco")).default;
        const mujoco: MujocoModule = await loadMujoco();
        mujocoRef.current = mujoco;

        // Keep the original G1 body/geom assembly for exact visual poses, but
        // rewrite mesh geoms to tiny invisible boxes so MuJoCo never loads or
        // compiles the heavy STL visual assets in the browser.
        const xmlResponse = await fetch(DEFAULT_G1_MUJOCO_XML_PATH);
        const xmlText = prepareMujocoVisualPoseXml(await xmlResponse.text());

        // Create model and data
        const model = mujoco.MjModel.from_xml_string(xmlText);
        const data = new mujoco.MjData(model);
        modelRef.current = model;
        dataRef.current = data;

        // Create Three.js meshes for each geom
        const meshes: THREE.Mesh[] = [];

        for (let i = 0; i < model.ngeom; i++) {
          const geomType = model.geom_type[i];
          const size = [
            model.geom_size[i * 3],
            model.geom_size[i * 3 + 1],
            model.geom_size[i * 3 + 2],
          ];
          const rgba = [
            model.geom_rgba[i * 4],
            model.geom_rgba[i * 4 + 1],
            model.geom_rgba[i * 4 + 2],
            model.geom_rgba[i * 4 + 3],
          ];

          let geometry: THREE.BufferGeometry | null = null;

          if (geomType === mjGEOM_MESH) {
            // Full-resolution visual meshes are rendered from GLB assets.
            // Keep MuJoCo mesh geoms in the model for exact geom_xpos/xmat,
            // but skip their duplicate Three.js geometry.
            geometry = null;
          } else if (geomType === mjGEOM_BOX) {
            geometry = new THREE.BoxGeometry(
              size[0] * 2,
              size[1] * 2,
              size[2] * 2,
            );
          } else if (geomType === mjGEOM_SPHERE) {
            geometry = new THREE.SphereGeometry(size[0], 16, 16);
          } else if (geomType === mjGEOM_CAPSULE) {
            geometry = new THREE.CapsuleGeometry(size[0], size[1] * 2, 4, 16);
          } else if (geomType === mjGEOM_CYLINDER) {
            geometry = new THREE.CylinderGeometry(
              size[0],
              size[0],
              size[1] * 2,
              16,
            );
          } else if (geomType === mjGEOM_PLANE) {
            // Skip plane (ground is handled separately)
            geometry = null;
          }

          if (!geometry) {
            meshes.push(null as unknown as THREE.Mesh);
            continue;
          }

          const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(rgba[0], rgba[1], rgba[2]),
            transparent: rgba[3] < 1,
            opacity: rgba[3],
            metalness: 0.3,
            roughness: 0.5,
          });

          const mesh = new THREE.Mesh(geometry, material);
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          mujocoRoot.add(mesh);
          meshes.push(mesh);
        }

        meshesRef.current = meshes;

        // Set initial pose from keyframe
        if (model.nkey > 0) {
          mujoco.mj_resetDataKeyframe(model, data, 0);
        }
        mujoco.mj_forward(model, data);

        // Initial sync
        syncGeomsToThreeJs(model, data, meshes);

        setLoading(false);

        void loadG1VisualMeshes({
          data,
          root: mujocoRoot,
          visualsRef,
          isCancelled: () => cancelled,
          onProgress: (loaded, total) => {
            if (!cancelled) setVisualProgress({ loaded, total });
          },
        });
      } catch (err) {
        console.error("Failed to initialize MuJoCo:", err);
        setError(String(err));
        setLoading(false);
      }
    };

    void init();

    return () => {
      cancelled = true;
      // Cleanup meshes
      for (const mesh of meshesRef.current) {
        if (mesh) {
          scene.remove(mesh);
          mesh.removeFromParent();
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      }
      meshesRef.current = [];
      for (const visual of visualsRef.current) {
        visual.object.removeFromParent();
        disposeObject3D(visual.object);
      }
      visualsRef.current = [];
      scene.remove(mujocoRoot);

      // Cleanup MuJoCo
      if (dataRef.current) {
        dataRef.current.delete();
        dataRef.current = null;
      }
      if (modelRef.current) {
        modelRef.current.delete();
        modelRef.current = null;
      }
    };
  }, [mujocoRef, modelRef, dataRef, scene]);

  // Sync geom poses from MuJoCo to Three.js each frame
  useFrame(() => {
    const model = modelRef.current;
    const data = dataRef.current;
    const mujoco = mujocoRef.current;
    if (!model || !data || !mujoco || meshesRef.current.length === 0) return;

    // Update full qpos, including the floating base position and yaw.
    const qpos = data.qpos;
    for (let i = 0; i < qposFrame.length && i < model.nq; i++) {
      qpos[i] = qposFrame[i];
    }

    // Run forward kinematics or physics step
    if (physicsEnabled) {
      // Use PD control tracking: set ctrl to target positions
      for (
        let i = 0;
        i < qposFrame.length - G1_QPOS_OFFSET && i < model.nq - G1_QPOS_OFFSET;
        i++
      ) {
        if (i < model.nu) {
          data.ctrl[i] = qposFrame[G1_QPOS_OFFSET + i];
        }
      }
      mujoco.mj_step(model, data);
    } else {
      mujoco.mj_forward(model, data);
    }

    // Sync geoms to Three.js
    syncGeomsToThreeJs(model, data, meshesRef.current);
    syncVisualsToMuJoCo(data, visualsRef.current);
  });

  if (loading) {
    return (
      <Html center>
        <div className="text-white text-lg">
          <div>Loading MuJoCo WASM...</div>
          <div className="text-sm text-slate-400 mt-2">
            This may take a few seconds
          </div>
        </div>
      </Html>
    );
  }
  if (error) {
    return (
      <Html center>
        <div className="text-red-400">Failed to load MuJoCo: {error}</div>
      </Html>
    );
  }
  if (
    visualProgress.total > 0 &&
    visualProgress.loaded < visualProgress.total
  ) {
    return (
      <Html position={[0, 1.35, 0]} center>
        <div className="rounded bg-slate-950/80 px-3 py-1 text-sm text-slate-200">
          Loading G1 visual mesh {visualProgress.loaded}/{visualProgress.total}
        </div>
      </Html>
    );
  }
  return null;
}

// ─── Sync MuJoCo geom poses to Three.js meshes ───
function syncGeomsToThreeJs(
  model: MjModel,
  data: MjData,
  meshes: THREE.Mesh[],
) {
  const tempPos = new THREE.Vector3();
  const tempQuat = new THREE.Quaternion();
  const tempMat = new THREE.Matrix4();

  for (let i = 0; i < model.ngeom; i++) {
    const mesh = meshes[i];
    if (!mesh) continue;

    // Read geom world position
    tempPos.set(
      data.geom_xpos[i * 3],
      data.geom_xpos[i * 3 + 1],
      data.geom_xpos[i * 3 + 2],
    );

    // Read geom world rotation matrix (3x3, row-major)
    const xmat = data.geom_xmat;
    const base = i * 9;
    tempMat.set(
      xmat[base + 0],
      xmat[base + 1],
      xmat[base + 2],
      0,
      xmat[base + 3],
      xmat[base + 4],
      xmat[base + 5],
      0,
      xmat[base + 6],
      xmat[base + 7],
      xmat[base + 8],
      0,
      0,
      0,
      0,
      1,
    );
    tempQuat.setFromRotationMatrix(tempMat);

    mesh.position.copy(tempPos);
    mesh.quaternion.copy(tempQuat);
  }
}

async function loadG1VisualMeshes({
  root,
  data,
  visualsRef,
  isCancelled,
  onProgress,
}: {
  root: THREE.Group;
  data: MjData;
  visualsRef: React.MutableRefObject<LoadedVisual[]>;
  isCancelled: () => boolean;
  onProgress: (loaded: number, total: number) => void;
}) {
  try {
    const response = await fetch(G1_VISUAL_MANIFEST_PATH);
    if (!response.ok) {
      throw new Error(`Failed to load ${G1_VISUAL_MANIFEST_PATH}`);
    }
    const manifest = (await response.json()) as G1VisualManifest;
    const visuals = manifest.visuals ?? [];
    onProgress(0, visuals.length);

    const { GLTFLoader } =
      await import("three/examples/jsm/loaders/GLTFLoader.js");
    const loader = new GLTFLoader();

    for (const [index, visual] of visuals.entries()) {
      if (isCancelled()) return;
      await nextAnimationFrame();

      const gltf = await loader.loadAsync(
        `${G1_VISUAL_ASSET_BASE_PATH}/${visual.glb}`,
      );
      if (isCancelled()) {
        disposeObject3D(gltf.scene);
        return;
      }

      const object = gltf.scene;
      applyVisualMaterial(object, visual.rgba);
      root.add(object);
      const loadedVisual = {
        geomIndex: visual.geomIndex,
        meshPos: new THREE.Vector3(...visual.meshPos),
        meshQuat: mujocoQuatToThree(visual.meshQuat),
        object,
      };
      visualsRef.current.push(loadedVisual);
      syncVisualsToMuJoCo(data, [loadedVisual]);
      onProgress(index + 1, visuals.length);
    }

    syncVisualsToMuJoCo(data, visualsRef.current);
  } catch (err) {
    console.error("Failed to load G1 visual meshes:", err);
    onProgress(0, 0);
  }
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function applyVisualMaterial(
  object: THREE.Object3D,
  rgba: [number, number, number, number],
) {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(rgba[0], rgba[1], rgba[2]),
    transparent: rgba[3] < 1,
    opacity: rgba[3],
    metalness: 0.25,
    roughness: 0.55,
  });

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.material = material;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

function syncVisualsToMuJoCo(data: MjData, visuals: LoadedVisual[]) {
  const tempPos = new THREE.Vector3();
  const tempQuat = new THREE.Quaternion();
  const meshPos = new THREE.Vector3();
  const tempMat = new THREE.Matrix4();

  for (const visual of visuals) {
    const geomIndex = visual.geomIndex;
    tempPos.set(
      data.geom_xpos[geomIndex * 3],
      data.geom_xpos[geomIndex * 3 + 1],
      data.geom_xpos[geomIndex * 3 + 2],
    );

    const xmat = data.geom_xmat;
    const base = geomIndex * 9;
    tempMat.set(
      xmat[base + 0],
      xmat[base + 1],
      xmat[base + 2],
      0,
      xmat[base + 3],
      xmat[base + 4],
      xmat[base + 5],
      0,
      xmat[base + 6],
      xmat[base + 7],
      xmat[base + 8],
      0,
      0,
      0,
      0,
      1,
    );
    tempQuat.setFromRotationMatrix(tempMat);

    meshPos.copy(visual.meshPos).applyQuaternion(tempQuat);
    visual.object.position.copy(tempPos).add(meshPos);
    visual.object.quaternion.copy(tempQuat).multiply(visual.meshQuat);
  }
}

function mujocoQuatToThree([w, x, y, z]: [number, number, number, number]) {
  return new THREE.Quaternion(x, y, z, w).normalize();
}

function disposeObject3D(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      material.dispose();
    }
  });
}

// ─── Playback driver ───
function PlaybackDriver({
  playing,
  fps,
  totalFrames,
  frameRef,
  setFrame,
  playbackRate,
}: {
  playing: boolean;
  fps: number;
  totalFrames: number;
  frameRef: React.MutableRefObject<number>;
  setFrame: React.Dispatch<React.SetStateAction<number>>;
  playbackRate: number;
}) {
  const elapsed = useRef(0);
  const last = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let raf: number;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = (now - last.current) / 1000;
      last.current = now;
      if (dt > 0 && dt < 0.5) {
        elapsed.current += dt * playbackRate;
        const fd = Math.floor(elapsed.current * fps);
        if (fd > 0) {
          elapsed.current -= fd / fps;
          frameRef.current = (frameRef.current + fd) % totalFrames;
          setFrame(frameRef.current);
        }
      }
    };
    last.current = performance.now();
    elapsed.current = 0;
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, fps, totalFrames, frameRef, setFrame, playbackRate]);
  return null;
}

// ═══════════════════════════════════════
// ─── Main Mujoco Sim Viewer ───
// ═══════════════════════════════════════
export default function MujocoSimViewer({
  data,
  org,
  dataset,
  episodeChangerRef,
  playToggleRef,
  showPhysicsToggle = true,
}: {
  data: EpisodeData;
  org?: string;
  dataset?: string;
  episodeChangerRef?: React.RefObject<((ep: number) => void) | undefined>;
  playToggleRef?: React.RefObject<(() => void) | undefined>;
  showPhysicsToggle?: boolean;
}) {
  const { playbackRate } = useTime();
  const { datasetInfo } = data;
  const fps = datasetInfo.fps || 30;
  const repoId = org && dataset ? `${org}/${dataset}` : null;

  const mujocoRef = useRef<MujocoModule | null>(null);
  const modelRef = useRef<MjModel | null>(null);
  const dataRef = useRef<MjData | null>(null);

  // Episode selection & chart data
  const [selectedEpisode, setSelectedEpisode] = useState(data.episodeId);
  const [chartData, setChartData] = useState(data.flatChartData);
  const [episodeLoading, setEpisodeLoading] = useState(false);
  const chartDataCache = useRef<Record<number, Record<string, number>[]>>({
    [data.episodeId]: data.flatChartData,
  });

  const datasetInfoRef = useRef<{
    version: string;
    info: DatasetMetadata;
  } | null>(null);

  const ensureDatasetInfo = useCallback(async () => {
    if (!repoId) return null;
    if (datasetInfoRef.current) return datasetInfoRef.current;
    const { version, info } = await getDatasetVersionAndInfo(repoId);
    const payload = { version, info: info as unknown as DatasetMetadata };
    datasetInfoRef.current = payload;
    return payload;
  }, [repoId]);

  const handleEpisodeChange = useCallback(
    (epId: number) => {
      setSelectedEpisode(epId);
      setFrame(0);
      frameRef.current = 0;
      setPlaying(false);

      if (chartDataCache.current[epId]) {
        setChartData(chartDataCache.current[epId]);
        return;
      }

      if (!repoId) return;
      setEpisodeLoading(true);
      ensureDatasetInfo()
        .then((payload) => {
          if (!payload) return null;
          return loadEpisodeFlatChartData(
            repoId,
            payload.version,
            payload.info,
            epId,
          );
        })
        .then((result) => {
          if (!result) return;
          chartDataCache.current[epId] = result;
          setChartData(result);
        })
        .catch((err) => console.error("Failed to load episode:", err))
        .finally(() => setEpisodeLoading(false));
    },
    [ensureDatasetInfo, repoId],
  );

  useEffect(() => {
    if (episodeChangerRef) episodeChangerRef.current = handleEpisodeChange;
  }, [episodeChangerRef, handleEpisodeChange]);

  const totalFrames = chartData.length;

  // Find G1 state columns and their indices
  const stateColumns = useMemo(() => {
    if (totalFrames === 0) return [];
    try {
      return extractOrderedG1StateColumns(chartData[0]);
    } catch (err) {
      console.warn("Failed to map G1 state columns:", err);
      return [];
    }
  }, [chartData, totalFrames]);

  // Playback
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef(0);
  const [physicsEnabled, setPhysicsEnabled] = useState(false);

  const handleFrameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = parseInt(e.target.value);
      setFrame(f);
      frameRef.current = f;
    },
    [],
  );

  const handlePlayPause = useCallback(() => {
    setPlaying((prev) => {
      if (!prev) frameRef.current = frame;
      return !prev;
    });
  }, [frame]);

  const handleReset = useCallback(() => {
    setPlaying(false);
    setFrame(0);
    frameRef.current = 0;
  }, []);

  useEffect(() => {
    if (playToggleRef) playToggleRef.current = handlePlayPause;
  }, [playToggleRef, handlePlayPause]);

  const qposFrames = useMemo(() => {
    if (totalFrames === 0 || stateColumns.length === 0) {
      return [];
    }
    return buildG1QposFrames(chartData, stateColumns, fps);
  }, [chartData, fps, stateColumns, totalFrames]);

  const qposFrame = useMemo(() => {
    if (qposFrames.length === 0) {
      return buildG1QposFrame({}, []);
    }
    return qposFrames[Math.min(frame, qposFrames.length - 1)];
  }, [frame, qposFrames]);

  if (data.flatChartData.length === 0) {
    return (
      <div className="text-slate-400 p-8 text-center">
        No trajectory data available.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 3D Viewport */}
      <div className="flex-1 min-h-0 bg-slate-950 rounded-lg overflow-hidden border border-slate-700 relative">
        {episodeLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/70">
            <span className="text-white text-lg animate-pulse">
              Loading episode {selectedEpisode}…
            </span>
          </div>
        )}
        <Canvas
          camera={{
            position: [1.5, 1.0, 1.5],
            fov: 45,
            near: 0.01,
            far: 100,
          }}
        >
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 5, 4]} intensity={1.5} />
          <directionalLight position={[-2, 3, -2]} intensity={0.6} />
          <hemisphereLight args={["#b1e1ff", "#666666", 0.5]} />
          <MujocoScene
            mujocoRef={mujocoRef}
            modelRef={modelRef}
            dataRef={dataRef}
            qposFrame={qposFrame}
            physicsEnabled={physicsEnabled}
          />
          <Grid
            args={[10, 10]}
            cellSize={0.5}
            cellThickness={0.5}
            cellColor="#334155"
            sectionSize={2}
            sectionThickness={1}
            sectionColor="#475569"
            fadeDistance={20}
            position={[0, 0, 0]}
          />
          <OrbitControls target={[0, 0.5, 0]} />
          <PlaybackDriver
            playing={playing}
            fps={fps}
            totalFrames={totalFrames}
            frameRef={frameRef}
            setFrame={setFrame}
            playbackRate={playbackRate}
          />
        </Canvas>
      </div>

      {/* Controls */}
      <div className="bg-slate-800/90 border-t border-slate-700 p-3 space-y-3 shrink-0">
        <UrdfPlaybackBar
          frame={frame}
          totalFrames={totalFrames}
          fps={fps}
          playing={playing}
          onPlayPause={handlePlayPause}
          trailEnabled={false}
          onTrailToggle={() => {}}
          onFrameChange={handleFrameChange}
        />

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="rounded border border-slate-600 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:border-orange-500 hover:text-orange-300"
          >
            Reset
          </button>
          <span className="text-xs text-slate-500">
            MuJoCo G1 replay · {stateColumns.length}/{G1_JOINT_NAMES.length}{" "}
            state values mapped
          </span>
        </div>

        {showPhysicsToggle && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={physicsEnabled}
                onChange={(e) => setPhysicsEnabled(e.target.checked)}
                className="rounded"
              />
              Physics Enabled (PD Tracking)
            </label>
            <span className="text-xs text-slate-500">
              {physicsEnabled
                ? "Robot follows trajectory with physics simulation"
                : "Pure kinematic replay (no physics)"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
