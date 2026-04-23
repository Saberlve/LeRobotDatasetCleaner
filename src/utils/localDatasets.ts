export const LOCAL_DATASETS_ENV = "LOCAL_LEROBOT_DATASETS_JSON";

function isLocalRepoShape(repoId: string): boolean {
  return /^local\/[^/]+$/.test(repoId);
}

export function isLocalDatasetRepoId(repoId: string): boolean {
  return isLocalRepoShape(repoId);
}

export function getLocalDatasetBaseUrl(): string {
  return (
    process.env.LOCAL_DATASET_BASE_URL ||
    process.env.NEXT_PUBLIC_LOCAL_DATASET_BASE_URL ||
    "http://127.0.0.1:3000"
  );
}

export function buildLocalDatasetUrl(repoId: string, assetPath: string): string {
  const trimmedPath = assetPath.replace(/^\/+/, "");
  return `${getLocalDatasetBaseUrl()}/api/local-datasets/${repoId}/${trimmedPath}`;
}
