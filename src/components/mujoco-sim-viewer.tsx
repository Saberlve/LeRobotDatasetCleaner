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
import { CHART_CONFIG } from "@/utils/constants";
import {
  G1_JOINT_NAMES,
  buildG1QposFrame,
  extractOrderedG1StateColumns,
} from "@/components/g1-mujoco-replay-helpers";

const SERIES_DELIM = CHART_CONFIG.SERIES_NAME_DELIMITER;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MujocoModule = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MjModel = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MjData = any;

const G1_QPOS_OFFSET = 7; // floating base takes first 7 values

// Map: joint name -> qpos index
const JOINT_NAME_TO_QPOS_IDX: Record<string, number> = {};
G1_JOINT_NAMES.forEach((name, i) => {
  JOINT_NAME_TO_QPOS_IDX[name] = G1_QPOS_OFFSET + i;
});

// ─── MuJoCo geom types ───
const mjGEOM_PLANE = 0;
// const mjGEOM_HFIELD = 1;
const mjGEOM_SPHERE = 2;
const mjGEOM_CAPSULE = 3;
// const mjGEOM_ELLIPSOID = 4;
const mjGEOM_CYLINDER = 5;
const mjGEOM_BOX = 6;
const mjGEOM_MESH = 7;

// ─── MuJoCo Scene ───
function MujocoScene({
  mujocoRef,
  modelRef,
  dataRef,
  jointValues,
  physicsEnabled,
}: {
  mujocoRef: React.MutableRefObject<MujocoModule | null>;
  modelRef: React.MutableRefObject<MjModel | null>;
  dataRef: React.MutableRefObject<MjData | null>;
  jointValues: Float64Array;
  physicsEnabled: boolean;
}) {
  const { scene } = useThree();
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // Initialize MuJoCo model and Three.js meshes
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      try {
        // Load MuJoCo WASM module
        const loadMujoco = (await import("@mujoco/mujoco")).default;
        const mujoco: MujocoModule = await loadMujoco();
        mujocoRef.current = mujoco;

        // Set up virtual file system for meshes
        mujoco.FS.mkdirTree("/mujoco/g1/assets");

        // List of mesh files needed
        const meshFiles = [
          "pelvis.STL",
          "pelvis_contour_link.STL",
          "left_hip_pitch_link.STL",
          "left_hip_roll_link.STL",
          "left_hip_yaw_link.STL",
          "left_knee_link.STL",
          "left_ankle_pitch_link.STL",
          "left_ankle_roll_link.STL",
          "right_hip_pitch_link.STL",
          "right_hip_roll_link.STL",
          "right_hip_yaw_link.STL",
          "right_knee_link.STL",
          "right_ankle_pitch_link.STL",
          "right_ankle_roll_link.STL",
          "waist_yaw_link_rev_1_0.STL",
          "waist_roll_link_rev_1_0.STL",
          "torso_link_rev_1_0.STL",
          "logo_link.STL",
          "head_link.STL",
          "left_shoulder_pitch_link.STL",
          "left_shoulder_roll_link.STL",
          "left_shoulder_yaw_link.STL",
          "left_elbow_link.STL",
          "left_wrist_roll_link.STL",
          "left_wrist_pitch_link.STL",
          "left_wrist_yaw_link.STL",
          "left_rubber_hand.STL",
          "right_shoulder_pitch_link.STL",
          "right_shoulder_roll_link.STL",
          "right_shoulder_yaw_link.STL",
          "right_elbow_link.STL",
          "right_wrist_roll_link.STL",
          "right_wrist_pitch_link.STL",
          "right_wrist_yaw_link.STL",
          "right_rubber_hand.STL",
        ];

        // Load mesh files into virtual file system
        await Promise.all(
          meshFiles.map(async (filename) => {
            const response = await fetch(`/mujoco/g1/assets/${filename}`);
            if (!response.ok) {
              console.warn(`Failed to load mesh: ${filename}`);
              return;
            }
            const buffer = await response.arrayBuffer();
            mujoco.FS.writeFile(
              `/mujoco/g1/assets/${filename}`,
              new Uint8Array(buffer),
            );
          }),
        );

        // Load XML
        const xmlResponse = await fetch("/mujoco/g1/g1.xml");
        let xmlText = await xmlResponse.text();
        // Point meshdir to virtual file system
        xmlText = xmlText.replace(
          'meshdir="assets"',
          'meshdir="/mujoco/g1/assets"',
        );

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
            // Mesh geom - load from STL via MuJoCo mesh data
            const meshId = model.geom_dataid[i];
            if (meshId >= 0) {
              geometry = createMeshGeometry(model, meshId);
            }
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

          scene.add(mesh);
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
      } catch (err) {
        console.error("Failed to initialize MuJoCo:", err);
        setError(String(err));
        setLoading(false);
      }
    };

    void init();

    return () => {
      // Cleanup meshes
      for (const mesh of meshesRef.current) {
        if (mesh) {
          scene.remove(mesh);
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      }
      meshesRef.current = [];

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

    // Update qpos from joint values
    const qpos = data.qpos;
    for (
      let i = 0;
      i < jointValues.length && i < model.nq - G1_QPOS_OFFSET;
      i++
    ) {
      qpos[G1_QPOS_OFFSET + i] = jointValues[i];
    }

    // Run forward kinematics or physics step
    if (physicsEnabled) {
      // Use PD control tracking: set ctrl to target positions
      for (
        let i = 0;
        i < jointValues.length && i < model.nq - G1_QPOS_OFFSET;
        i++
      ) {
        if (i < model.nu) {
          data.ctrl[i] = jointValues[i];
        }
      }
      mujoco.mj_step(model, data);
    } else {
      mujoco.mj_forward(model, data);
    }

    // Sync geoms to Three.js
    syncGeomsToThreeJs(model, data, meshesRef.current);
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
  return null;
}

// ─── Create mesh geometry from MuJoCo mesh data ───
function createMeshGeometry(
  model: MjModel,
  meshId: number,
): THREE.BufferGeometry {
  const vertadr = model.mesh_vertadr[meshId];
  const vertnum = model.mesh_vertnum[meshId];
  const faceadr = model.mesh_faceadr[meshId];
  const facenum = model.mesh_facenum[meshId];

  const vertices: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  // Read vertices
  for (let i = 0; i < vertnum; i++) {
    vertices.push(
      model.mesh_vert[(vertadr + i) * 3],
      model.mesh_vert[(vertadr + i) * 3 + 1],
      model.mesh_vert[(vertadr + i) * 3 + 2],
    );
  }

  // Read normals
  const normaladr = model.mesh_normaladr[meshId];
  const normalnum = model.mesh_normalnum[meshId];
  if (normalnum > 0) {
    for (let i = 0; i < normalnum; i++) {
      normals.push(
        model.mesh_normal[(normaladr + i) * 3],
        model.mesh_normal[(normaladr + i) * 3 + 1],
        model.mesh_normal[(normaladr + i) * 3 + 2],
      );
    }
  }

  // Read faces
  for (let i = 0; i < facenum; i++) {
    indices.push(
      model.mesh_face[(faceadr + i) * 3],
      model.mesh_face[(faceadr + i) * 3 + 1],
      model.mesh_face[(faceadr + i) * 3 + 2],
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  if (normals.length > 0) {
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3),
    );
  } else {
    geometry.computeVertexNormals();
  }
  geometry.setIndex(indices);

  return geometry;
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

// ─── Playback driver ───
function PlaybackDriver({
  playing,
  fps,
  totalFrames,
  frameRef,
  setFrame,
}: {
  playing: boolean;
  fps: number;
  totalFrames: number;
  frameRef: React.MutableRefObject<number>;
  setFrame: React.Dispatch<React.SetStateAction<number>>;
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
        elapsed.current += dt;
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
  }, [playing, fps, totalFrames, frameRef, setFrame]);
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

  // Compute joint values for current frame
  const jointValues = useMemo(() => {
    if (totalFrames === 0 || stateColumns.length === 0) {
      return new Float64Array(G1_JOINT_NAMES.length);
    }
    const row = chartData[Math.min(frame, totalFrames - 1)];
    return buildG1QposFrame(row, stateColumns).slice(G1_QPOS_OFFSET);
  }, [chartData, frame, stateColumns, totalFrames]);

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
            jointValues={jointValues}
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
