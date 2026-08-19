export const LOCAL_DATASETS_ENV = "LOCAL_LEROBOT_DATASETS_JSON";

function isLocalRepoShape(repoId: string): boolean {
  return /^local\/[^/]+$/.test(repoId);
}

export function isLocalDatasetRepoId(repoId: string): boolean {
  return isLocalRepoShape(repoId);
}

export function getLocalDatasetBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "";
  }

  const configuredBaseUrl =
    process.env.NEXT_PUBLIC_LOCAL_DATASET_BASE_URL ||
    process.env.LOCAL_DATASET_BASE_URL;

  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  return `http://127.0.0.1:${process.env.PORT || "3000"}`;
}

export function buildLocalDatasetUrl(
  repoId: string,
  assetPath: string,
): string {
  const trimmedPath = assetPath.replace(/^\/+/, "");
  const baseUrl = getLocalDatasetBaseUrl();
  const routePath = `/api/local-datasets/${repoId}/${trimmedPath}`;
  return baseUrl ? `${baseUrl}${routePath}` : routePath;
}
