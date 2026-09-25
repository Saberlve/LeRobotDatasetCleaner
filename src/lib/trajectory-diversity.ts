export type DiversityEndEffectorSample = {
  position: number[];
  gripper?: number;
};

export type DiversityTrajectoryInput = {
  episodeIndex: number;
  actions: number[][];
  states?: number[][] | null;
  /** Joint-angle trajectory used when end-effector samples are unavailable. */
  jointAngles?: number[][] | null;
  endEffector?: DiversityEndEffectorSample[] | null;
};

export type DiversityDistanceThresholds = {
  initial: number;
  behavior: number;
  combined: number;
};

export type DiversityGroup = {
  groupId: string;
  representativeEpisodeIndex: number;
  episodeIndices: number[];
  episodeCount: number;
  fraction: number;
  initialDistanceRange: [number, number] | null;
  behaviorDistanceRange: [number, number] | null;
};

export type DiversityEpisodeScore = {
  episodeIndex: number;
  initialDistance: number | null;
  behaviorDistance: number | null;
  combinedDistance: number | null;
  nearestEpisodeIndex: number | null;
  nearestInitialDistance: number | null;
  nearestBehaviorDistance: number | null;
  nearestDistance: number | null;
  redundancy: number;
  distinctiveness: number;
  diversityScore: number;
  duplicateGroupId: string;
  groupSize: number;
  isGroupRepresentative: boolean;
  marginalCoverage: number;
  selectionRank: number | null;
};

export type DiversitySelection = {
  order: number;
  episodeIndex: number;
  marginalCoverage: number;
  coverageAfter: number;
  groupId: string;
};

export type TrajectoryDiversityData = {
  analyzedEpisodes: number;
  situationGroupCount: number;
  effectiveSituations: number;
  coverageScore: number;
  largestGroupFraction: number;
  averageInitialDistance: number | null;
  averageBehaviorDistance: number | null;
  finalSelectedCount: number;
  finalSelectedCoverage: number;
  distanceThresholds: DiversityDistanceThresholds;
  resamplePoints: number;
  weights: {
    initial: number;
    behavior: number;
    action: number;
    endEffector: number;
    jointAngles: number;
  };
  excludedSignals: string[];
  groups: DiversityGroup[];
  episodes: DiversityEpisodeScore[];
  representativeSelection: DiversitySelection[];
};

type DimensionStats = { scale: number };
type PairDistance = {
  initial: number | null;
  behavior: number | null;
  combined: number | null;
};

const DEFAULT_RESAMPLE_POINTS = 32;
const INITIAL_WEIGHT = 0.5;
const BEHAVIOR_WEIGHT = 0.5;
const ACTION_WEIGHT = 0.7;
const MOTION_WEIGHT = 0.3;
const EPSILON = 1e-9;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const position = (values.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return values[lower];
  return values[lower] + (values[upper] - values[lower]) * (position - lower);
}

function makeStats(series: number[][], width: number): DimensionStats[] {
  return Array.from({ length: width }, (_, dimension) => {
    const values = series
      .map((row) => row[dimension])
      .filter(finite)
      .sort((a, b) => a - b);
    if (values.length < 2) return { scale: 1 };
    const robustRange = quantile(values, 0.95) - quantile(values, 0.05);
    const fullRange = values[values.length - 1] - values[0];
    return { scale: Math.max(robustRange, fullRange, EPSILON) };
  });
}

function resample(
  series: number[][],
  width: number,
  points: number,
): number[][] {
  if (series.length === 0) return [];
  if (points === 1) return [series[0].slice(0, width)];
  return Array.from({ length: points }, (_, point) => {
    const position = (point * (series.length - 1)) / (points - 1);
    const left = Math.floor(position);
    const right = Math.min(series.length - 1, left + 1);
    const fraction = position - left;
    return Array.from({ length: width }, (_, dimension) => {
      const a = series[left]?.[dimension];
      const b = series[right]?.[dimension];
      if (!finite(a) || !finite(b)) return Number.NaN;
      return a + (b - a) * fraction;
    });
  });
}

function valueDistance(
  a: number[] | undefined,
  b: number[] | undefined,
  stats: DimensionStats[],
): number | null {
  if (!a || !b) return null;
  let sum = 0;
  let count = 0;
  for (let dimension = 0; dimension < stats.length; dimension++) {
    if (!finite(a[dimension]) || !finite(b[dimension])) continue;
    const delta = (a[dimension] - b[dimension]) / stats[dimension].scale;
    sum += delta * delta;
    count++;
  }
  return count > 0 ? Math.sqrt(sum / count) : null;
}

function seriesDistance(
  a: number[][],
  b: number[][],
  stats: DimensionStats[],
): number | null {
  const count = Math.min(a.length, b.length);
  const distances: number[] = [];
  for (let point = 0; point < count; point++) {
    const distance = valueDistance(a[point], b[point], stats);
    if (distance !== null) distances.push(distance);
  }
  if (distances.length === 0) return null;
  return (
    distances.reduce((sum, distance) => sum + distance, 0) / distances.length
  );
}

function weightedDistance(
  values: Array<[number | null, number]>,
): number | null {
  const available = values.filter(
    (entry): entry is [number, number] => entry[0] !== null,
  );
  if (available.length === 0) return null;
  const totalWeight = available.reduce((sum, entry) => sum + entry[1], 0);
  return (
    available.reduce((sum, entry) => sum + entry[0] * entry[1], 0) / totalWeight
  );
}

function distanceThreshold(values: number[], episodeCount: number): number {
  if (values.length === 0 || episodeCount < 3) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return quantile(sorted, 0.9);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function meanOrNull(values: number[]): number | null {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function rangeOrNull(values: number[]): [number, number] | null {
  return values.length > 0 ? [Math.min(...values), Math.max(...values)] : null;
}

export function computeTrajectoryDiversity(
  inputs: DiversityTrajectoryInput[],
  resamplePoints = DEFAULT_RESAMPLE_POINTS,
): TrajectoryDiversityData {
  const episodes = inputs
    .slice()
    .sort((a, b) => a.episodeIndex - b.episodeIndex);
  const stateWidth = episodes.reduce(
    (width, episode) =>
      Math.max(width, ...(episode.states ?? []).map((row) => row.length)),
    0,
  );
  const actionWidth = episodes.reduce(
    (width, episode) =>
      Math.max(width, ...episode.actions.map((row) => row.length)),
    0,
  );
  const jointAngleWidth = episodes.reduce(
    (width, episode) =>
      Math.max(
        width,
        ...(episode.jointAngles ?? episode.states ?? []).map(
          (row) => row.length,
        ),
      ),
    0,
  );
  const hasGripper = episodes.some((episode) =>
    (episode.endEffector ?? []).some((sample) => finite(sample.gripper)),
  );
  const endEffectorWidth = hasGripper ? 4 : 3;
  const initialRows = episodes.map((episode) => episode.states?.[0] ?? []);
  const actionSeries = episodes.map((episode) =>
    resample(episode.actions, actionWidth, resamplePoints),
  );
  const jointAngleSeries = episodes.map((episode) =>
    resample(
      episode.jointAngles ?? episode.states ?? [],
      jointAngleWidth,
      resamplePoints,
    ),
  );
  const endEffectorSeries = episodes.map((episode) => {
    const rows = (episode.endEffector ?? []).map((sample) => [
      ...sample.position,
      ...(hasGripper ? [sample.gripper ?? Number.NaN] : []),
    ]);
    return resample(rows, endEffectorWidth, resamplePoints);
  });
  const initialStats = makeStats(initialRows, stateWidth);
  const actionStats = makeStats(actionSeries.flat(), actionWidth);
  const endEffectorStats = makeStats(
    endEffectorSeries.flat(),
    endEffectorWidth,
  );
  const jointAngleStats = makeStats(jointAngleSeries.flat(), jointAngleWidth);

  const pairMatrix: PairDistance[][] = episodes.map(() =>
    episodes.map(() => ({ initial: null, behavior: null, combined: null })),
  );
  const initialValues: number[] = [];
  const behaviorValues: number[] = [];
  const combinedValues: number[] = [];
  for (let left = 0; left < episodes.length; left++) {
    for (let right = left + 1; right < episodes.length; right++) {
      const initial = valueDistance(
        initialRows[left],
        initialRows[right],
        initialStats,
      );
      const action = seriesDistance(
        actionSeries[left],
        actionSeries[right],
        actionStats,
      );
      const endEffector = seriesDistance(
        endEffectorSeries[left],
        endEffectorSeries[right],
        endEffectorStats,
      );
      const jointAngles = seriesDistance(
        jointAngleSeries[left],
        jointAngleSeries[right],
        jointAngleStats,
      );
      // EEF is the preferred geometric signal. A pair with missing or
      // invalid EEF data falls back to its joint-angle trajectory instead of
      // silently reducing behavior distance to actions only.
      const motion = endEffector ?? jointAngles;
      const behavior = weightedDistance([
        [action, ACTION_WEIGHT],
        [motion, MOTION_WEIGHT],
      ]);
      const combined = weightedDistance([
        [initial, INITIAL_WEIGHT],
        [behavior, BEHAVIOR_WEIGHT],
      ]);
      const distance = { initial, behavior, combined };
      pairMatrix[left][right] = distance;
      pairMatrix[right][left] = distance;
      if (initial !== null) initialValues.push(initial);
      if (behavior !== null) behaviorValues.push(behavior);
      if (combined !== null) combinedValues.push(combined);
    }
  }

  const nearest = episodes.map((_, index) => {
    let nearestIndex: number | null = null;
    let nearestDistance: PairDistance | null = null;
    for (let candidate = 0; candidate < episodes.length; candidate++) {
      if (candidate === index) continue;
      const distance = pairMatrix[index][candidate];
      if (distance.combined === null) continue;
      if (
        nearestDistance === null ||
        distance.combined < nearestDistance.combined! - EPSILON ||
        (Math.abs(distance.combined - nearestDistance.combined!) <= EPSILON &&
          episodes[candidate].episodeIndex <
            episodes[nearestIndex!].episodeIndex)
      ) {
        nearestIndex = candidate;
        nearestDistance = distance;
      }
    }
    return { nearestIndex, nearestDistance };
  });
  const nearestDistances = nearest
    .map((entry) => entry.nearestDistance)
    .filter((distance): distance is PairDistance => distance !== null);
  const thresholdFor = (key: keyof PairDistance) =>
    distanceThreshold(
      nearestDistances
        .map((distance) => distance[key])
        .filter((value): value is number => value !== null),
      episodes.length,
    );
  const distanceThresholds: DiversityDistanceThresholds = {
    initial: thresholdFor("initial"),
    behavior: thresholdFor("behavior"),
    combined: thresholdFor("combined"),
  };
  const isDuplicatePair = (distance: PairDistance): boolean =>
    distance.initial !== null &&
    distance.behavior !== null &&
    distance.initial <= distanceThresholds.initial + EPSILON &&
    distance.behavior <= distanceThresholds.behavior + EPSILON;

  const parent = episodes.map((_, index) => index);
  const membersByRoot = new Map<number, number[]>(
    episodes.map((_, index): [number, number[]] => [index, [index]]),
  );
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const candidatePairs: Array<{
    left: number;
    right: number;
    distance: number;
  }> = [];
  for (let left = 0; left < episodes.length; left++) {
    for (let right = left + 1; right < episodes.length; right++) {
      const distance = pairMatrix[left][right];
      if (isDuplicatePair(distance)) {
        candidatePairs.push({ left, right, distance: distance.combined ?? 0 });
      }
    }
  }
  candidatePairs.sort(
    (a, b) =>
      a.distance - b.distance ||
      episodes[a.left].episodeIndex - episodes[b.left].episodeIndex ||
      episodes[a.right].episodeIndex - episodes[b.right].episodeIndex,
  );
  for (const { left, right } of candidatePairs) {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) continue;
    const leftMembers = membersByRoot.get(leftRoot)!;
    const rightMembers = membersByRoot.get(rightRoot)!;
    if (
      !leftMembers.every((leftMember) =>
        rightMembers.every((rightMember) =>
          isDuplicatePair(pairMatrix[leftMember][rightMember]),
        ),
      )
    ) {
      continue;
    }
    const root = Math.min(leftRoot, rightRoot);
    const absorbed = Math.max(leftRoot, rightRoot);
    parent[absorbed] = root;
    membersByRoot.set(
      root,
      [...leftMembers, ...rightMembers].sort((a, b) => a - b),
    );
    membersByRoot.delete(absorbed);
  }
  const groupMembers = [...membersByRoot.values()].sort(
    (left, right) =>
      episodes[left[0]].episodeIndex - episodes[right[0]].episodeIndex,
  );
  const groupIdByIndex = new Map<number, string>();
  const groups: DiversityGroup[] = groupMembers.map((members, groupIndex) => {
    const groupId = `group-${String(groupIndex + 1).padStart(2, "0")}`;
    members.forEach((member) => groupIdByIndex.set(member, groupId));
    const representative = members.reduce((best, candidate) => {
      const total = members.reduce(
        (sum, member) => sum + (pairMatrix[candidate][member].combined ?? 0),
        0,
      );
      const bestTotal = members.reduce(
        (sum, member) => sum + (pairMatrix[best][member].combined ?? 0),
        0,
      );
      return total < bestTotal - EPSILON ? candidate : best;
    }, members[0]);
    const membersExceptRepresentative = members.filter(
      (member) => member !== representative,
    );
    const initialRange = rangeOrNull(
      membersExceptRepresentative
        .map((member) => pairMatrix[representative][member].initial)
        .filter((value): value is number => value !== null),
    );
    const behaviorRange = rangeOrNull(
      membersExceptRepresentative
        .map((member) => pairMatrix[representative][member].behavior)
        .filter((value): value is number => value !== null),
    );
    return {
      groupId,
      representativeEpisodeIndex: episodes[representative].episodeIndex,
      episodeIndices: members.map((member) => episodes[member].episodeIndex),
      episodeCount: members.length,
      fraction: episodes.length > 0 ? members.length / episodes.length : 0,
      initialDistanceRange: initialRange,
      behaviorDistanceRange: behaviorRange,
    };
  });

  const maxPairDistance =
    combinedValues.length > 0 ? Math.max(...combinedValues) : 0;
  const normalizedDistance = (distance: number | null): number =>
    distance === null || maxPairDistance <= EPSILON
      ? distance === null
        ? 0
        : 0
      : clamp01(distance / maxPairDistance);
  const selectedIndices: number[] = [];
  const selectionByIndex = new Map<number, DiversitySelection>();
  const marginalByIndex = new Map<number, number>();
  if (episodes.length > 0) {
    selectedIndices.push(0);
    selectionByIndex.set(0, {
      order: 1,
      episodeIndex: episodes[0].episodeIndex,
      marginalCoverage: 1,
      coverageAfter: groups.length > 0 ? 1 / groups.length : 1,
      groupId: groupIdByIndex.get(0)!,
    });
    marginalByIndex.set(0, 1);
  }
  const remaining = new Set(episodes.slice(1).map((_, index) => index + 1));
  const selectionThreshold = distanceThresholds.combined;
  while (remaining.size > 0 && selectedIndices.length < episodes.length) {
    let bestIndex: number | null = null;
    let bestDistance = -Infinity;
    for (const candidate of remaining) {
      const distances = selectedIndices
        .map((selected) => pairMatrix[candidate][selected].combined)
        .filter((value): value is number => value !== null);
      const candidateDistance =
        distances.length > 0 ? Math.min(...distances) : 0;
      if (
        bestIndex === null ||
        candidateDistance > bestDistance + EPSILON ||
        (Math.abs(candidateDistance - bestDistance) <= EPSILON &&
          episodes[candidate].episodeIndex < episodes[bestIndex].episodeIndex)
      ) {
        bestIndex = candidate;
        bestDistance = candidateDistance;
      }
    }
    if (bestIndex === null || bestDistance <= selectionThreshold + EPSILON)
      break;
    selectedIndices.push(bestIndex);
    remaining.delete(bestIndex);
    const coveredGroups = new Set(
      selectedIndices.map((index) => groupIdByIndex.get(index)),
    );
    const selection = {
      order: selectedIndices.length,
      episodeIndex: episodes[bestIndex].episodeIndex,
      marginalCoverage: normalizedDistance(bestDistance),
      coverageAfter: groups.length > 0 ? coveredGroups.size / groups.length : 1,
      groupId: groupIdByIndex.get(bestIndex)!,
    };
    selectionByIndex.set(bestIndex, selection);
    marginalByIndex.set(bestIndex, selection.marginalCoverage);
  }
  const finalSelected = selectedIndices.length > 0 ? selectedIndices : [];
  for (const candidate of episodes.keys()) {
    if (marginalByIndex.has(candidate)) continue;
    const distances = finalSelected
      .map((selected) => pairMatrix[candidate][selected].combined)
      .filter((value): value is number => value !== null);
    marginalByIndex.set(
      candidate,
      normalizedDistance(distances.length > 0 ? Math.min(...distances) : null),
    );
  }

  const scoreRows: DiversityEpisodeScore[] = episodes.map((episode, index) => {
    const nearestInfo = nearest[index];
    const nearestDistance = nearestInfo.nearestDistance?.combined ?? null;
    const distinctiveness =
      nearestInfo.nearestIndex === null
        ? 1
        : normalizedDistance(nearestDistance);
    const redundancy = 1 - distinctiveness;
    const marginalCoverage = marginalByIndex.get(index) ?? 0;
    return {
      episodeIndex: episode.episodeIndex,
      initialDistance: nearestInfo.nearestDistance?.initial ?? null,
      behaviorDistance: nearestInfo.nearestDistance?.behavior ?? null,
      combinedDistance: nearestDistance,
      nearestEpisodeIndex:
        nearestInfo.nearestIndex === null
          ? null
          : episodes[nearestInfo.nearestIndex].episodeIndex,
      nearestInitialDistance: nearestInfo.nearestDistance?.initial ?? null,
      nearestBehaviorDistance: nearestInfo.nearestDistance?.behavior ?? null,
      nearestDistance,
      redundancy,
      distinctiveness,
      diversityScore:
        Math.round((distinctiveness + marginalCoverage) * 50 * 100) / 100,
      duplicateGroupId: groupIdByIndex.get(index)!,
      groupSize:
        groups.find((group) => group.groupId === groupIdByIndex.get(index))
          ?.episodeCount ?? 1,
      isGroupRepresentative:
        groups.find((group) => group.groupId === groupIdByIndex.get(index))
          ?.representativeEpisodeIndex === episode.episodeIndex,
      marginalCoverage,
      selectionRank: selectionByIndex.get(index)?.order ?? null,
    };
  });

  const effectiveSituations =
    groups.length === 0
      ? 0
      : Math.exp(
          -groups.reduce((entropy, group) => {
            const probability = group.fraction;
            return entropy + probability * Math.log(probability);
          }, 0),
        );
  const finalCoveredGroups = new Set(
    selectedIndices.map((index) => groupIdByIndex.get(index)),
  );
  return {
    analyzedEpisodes: episodes.length,
    situationGroupCount: groups.length,
    effectiveSituations,
    coverageScore:
      episodes.length > 0 ? (effectiveSituations / episodes.length) * 100 : 0,
    largestGroupFraction:
      groups.length > 0
        ? Math.max(...groups.map((group) => group.fraction))
        : 0,
    averageInitialDistance: meanOrNull(initialValues),
    averageBehaviorDistance: meanOrNull(behaviorValues),
    finalSelectedCount: selectedIndices.length,
    finalSelectedCoverage:
      groups.length > 0 ? finalCoveredGroups.size / groups.length : 0,
    distanceThresholds,
    resamplePoints,
    weights: {
      initial: INITIAL_WEIGHT,
      behavior: BEHAVIOR_WEIGHT,
      action: ACTION_WEIGHT,
      endEffector: MOTION_WEIGHT,
      jointAngles: MOTION_WEIGHT,
    },
    excludedSignals: [
      "object pose",
      "potato chip/cup relative position",
      "VLM image embedding",
    ],
    groups,
    episodes: scoreRows,
    representativeSelection: [...selectionByIndex.values()].sort(
      (left, right) => left.order - right.order,
    ),
  };
}
