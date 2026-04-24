export const DEFAULT_G1_MUJOCO_XML_PATH = "/mujoco/g1/g1.xml";
export const G1_VISUAL_MANIFEST_PATH = "/mujoco/g1/visual-manifest.json";
export const G1_VISUAL_ASSET_BASE_PATH = "/mujoco/g1/visual-glb";
export const MUJOCO_ASSET_VFS_DIR = "/mujoco/g1/assets";
export const G1_MUJOCO_ASSET_BASE_PATH = "/mujoco/g1";

export function extractMujocoMeshFilenames(xmlText: string) {
  const filenames = new Set<string>();
  const meshFilePattern = /<mesh\b[^>]*\bfile=["']([^"']+)["'][^>]*>/g;

  for (const match of xmlText.matchAll(meshFilePattern)) {
    const rawPath = match[1]?.trim();
    if (!rawPath) continue;
    const filename = rawPath.split(/[\\/]/).pop();
    if (filename) filenames.add(filename);
  }

  return Array.from(filenames);
}

export function rewriteMujocoMeshdir(
  xmlText: string,
  meshdir = MUJOCO_ASSET_VFS_DIR,
) {
  if (!/\bmeshdir=["'][^"']*["']/.test(xmlText)) return xmlText;
  return xmlText.replace(/\bmeshdir=["'][^"']*["']/, `meshdir="${meshdir}"`);
}

export function extractMujocoMeshdir(xmlText: string) {
  const match = xmlText.match(/\bmeshdir=["']([^"']*)["']/);
  return match?.[1] || "assets";
}

export function prepareMujocoVisualPoseXml(xmlText: string) {
  return xmlText
    .replace(/<mesh\b[^>]*\/>/g, "")
    .replace(/<geom\b[^>]*\bmesh=["'][^"']+["'][^>]*\/>/g, (tag) => {
      const attrs = stripMujocoGeomMeshAttributes(tag)
        .replace(/^<geom\b/, "")
        .replace(/\/>$/, "")
        .trim();
      const prefix = attrs ? ` ${attrs}` : "";
      return `<geom${prefix} type="box" size="0.001 0.001 0.001" rgba="0 0 0 0" contype="0" conaffinity="0" />`;
    });
}

function stripMujocoGeomMeshAttributes(tag: string) {
  return [
    "mesh",
    "type",
    "size",
    "rgba",
    "material",
    "contype",
    "conaffinity",
    "density",
    "group",
  ].reduce(
    (current, attribute) =>
      current.replace(new RegExp(`\\s+${attribute}=(["'])[^"']*\\1`, "g"), ""),
    tag,
  );
}
