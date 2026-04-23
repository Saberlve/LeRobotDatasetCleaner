type MujocoRuntime = {
  FS: {
    mkdirTree: (path: string) => void;
    writeFile: (path: string, data: unknown) => void;
  };
  MjModel: {
    from_xml_string: (xml: string) => {
      ngeom: number;
      nq: number;
      delete: () => void;
    };
  };
  MjData: (model: unknown) => {
    qpos: Float64Array;
    delete: () => void;
  };
  mj_forward: (model: unknown, data: { qpos: Float64Array }) => void;
};

export default async function loadMujoco(): Promise<MujocoRuntime> {
  return {
    FS: {
      mkdirTree: () => {},
      writeFile: () => {},
    },
    MjModel: {
      from_xml_string: () => ({ ngeom: 0, nq: 36, delete: () => {} }),
    },
    MjData: () => ({
      qpos: new Float64Array(36),
      delete: () => {},
    }),
    mj_forward: () => {},
  };
}
