export function isSO101Robot(robotType: string | null): boolean {
  if (!robotType) return false;
  const lower = robotType.toLowerCase();
  return (
    lower.includes("so100") ||
    lower.includes("so101") ||
    lower === "so_follower"
  );
}

export function isOpenArmRobot(robotType: string | null): boolean {
  if (!robotType) return false;
  return robotType.toLowerCase().includes("openarm");
}

export function isG1Robot(robotType: string | null): boolean {
  if (!robotType) return false;
  const lower = robotType.toLowerCase();
  return lower.includes("g1") || lower.includes("unitree");
}

export function isAconeRobot(robotType: string | null): boolean {
  if (!robotType) return false;
  const lower = robotType.toLowerCase();
  return lower.includes("acone") || lower.includes("ac one");
}

export function hasReplaySupport(robotType: string | null): boolean {
  return isG1Robot(robotType) || isAconeRobot(robotType);
}

export function hasURDFSupport(robotType: string | null): boolean {
  return (
    isSO101Robot(robotType) ||
    isOpenArmRobot(robotType) ||
    isG1Robot(robotType) ||
    isAconeRobot(robotType)
  );
}
