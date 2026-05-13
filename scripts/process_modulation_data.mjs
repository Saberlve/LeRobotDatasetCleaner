import fs from 'fs';
import path from 'path';

const MOD_DIR = '/mnt/d/share/docs/graduate/data/analysis_modulator/20000/analysis_output/memory_modulation';
const 门控交叉注意力_DIR = '/mnt/d/share/docs/graduate/data/new_dataloader_analysis_delta_alpha_0p5/28000/analysis_output/memory_delta';
const OUTPUT_FILE = 'public/data/modulation_analysis.json';

const N_LAYERS = 18;

// Utility for mean and std
function stats(arr) {
  if (!arr || arr.length === 0) return { mean: 0, std: 0 };
  const n = arr.length;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(arr.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / n);
  return { mean, std };
}

function getCapturedWidth(data, key) {
  const meta = data.meta || {};
  const requested = parseInt(meta.num_steps_captured || data[key][0].length);
  return Math.max(0, Math.min(requested, data[key][0].length));
}

function loadEpisodeAverageMatrix(baseDir, key) {
  if (!fs.existsSync(baseDir)) {
    console.warn(`Warning: Directory ${baseDir} not found.`);
    return null;
  }

  const episodes = fs.readdirSync(baseDir).filter(f => f.startsWith('episode_'));
  const episodeMatrices = [];
  let skipped = 0;

  for (const ep of episodes) {
    const metricsDir = path.join(baseDir, ep, 'metrics');
    if (!fs.existsSync(metricsDir)) continue;

    const files = fs.readdirSync(metricsDir).filter(f => f.endsWith('_meta.json'));
    const stepMatrices = [];

    for (const file of files) {
      const filePath = path.join(metricsDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (!(key in data)) continue;

        const width = getCapturedWidth(data, key);
        if (width === 0) continue;

        // Extract [N_LAYERS, width]
        const arr = data[key].map(row => row.slice(0, width));
        if (arr.length !== N_LAYERS) continue;
        stepMatrices.push(arr);
      } catch (e) {
        continue;
      }
    }

    if (stepMatrices.length === 0) {
      skipped++;
      continue;
    }

    // Average across steps in this episode
    const minWidth = Math.min(...stepMatrices.map(m => m[0].length));
    const epAvg = Array.from({ length: N_LAYERS }, (_, l) => {
      return Array.from({ length: minWidth }, (_, s) => {
        const sum = stepMatrices.reduce((acc, m) => acc + m[l][s], 0);
        return sum / stepMatrices.length;
      });
    });
    episodeMatrices.push(epAvg);
  }

  if (episodeMatrices.length === 0) return null;

  const minWidth = Math.min(...episodeMatrices.map(m => m[0].length));
  
  // Mean and Std across episodes
  const meanMatrix = Array.from({ length: N_LAYERS }, (_, l) => {
    return Array.from({ length: minWidth }, (_, s) => {
      const vals = episodeMatrices.map(m => m[l][s]);
      return stats(vals).mean;
    });
  });

  const stdMatrix = Array.from({ length: N_LAYERS }, (_, l) => {
    return Array.from({ length: minWidth }, (_, s) => {
      const vals = episodeMatrices.map(m => m[l][s]);
      return stats(vals).std;
    });
  });

  // layer_mean: stack.mean(axis=2).mean(axis=0) 
  // i.e., average across denoise steps, then average across episodes
  const episodeLayerMeans = episodeMatrices.map(ep => {
    return ep.map(row => row.reduce((a, b) => a + b, 0) / row.length);
  });

  const layerStats = Array.from({ length: N_LAYERS }, (_, l) => {
    const vals = episodeLayerMeans.map(ep => ep[l]);
    return stats(vals);
  });

  return {
    mean_matrix: meanMatrix,
    std_matrix: stdMatrix,
    layer_mean: layerStats.map(s => s.mean),
    layer_std: layerStats.map(s => s.std),
    n_episodes: episodeMatrices.length,
    n_denoise: minWidth,
    skipped_episodes: skipped,
  };
}

function processAll() {
  console.log('Processing Modulation Data (Fig 3-9, 3-14)...');
  const modData = loadEpisodeAverageMatrix(MOD_DIR, 'mod_only_ratio_map');
  const modNormData = loadEpisodeAverageMatrix(MOD_DIR, 'mod_only_norm_map');
  const deltaData = loadEpisodeAverageMatrix(MOD_DIR, 'delta_ratio_map');

  console.log('Processing 门控交叉注意力 Data (Fig 3-12, 3-13)...');
  const gcaData = loadEpisodeAverageMatrix(门控交叉注意力_DIR, 'effective_delta_ratio_map');

  if (!modData || !modNormData || !deltaData) {
    console.error('Failed to load Modulator data.');
    return;
  }

  // Figure 3-9: Layerwise Stats
  const figure_3_9 = Array.from({ length: N_LAYERS }, (_, l) => ({
    layer: l + 1,
    delta_ratio_mean: deltaData.layer_mean[l],
    delta_ratio_std: deltaData.layer_std[l],
    mod_only_ratio_mean: modData.layer_mean[l],
    mod_only_ratio_std: modData.layer_std[l],
    mod_only_norm_mean: modNormData.layer_mean[l],
    mod_only_norm_std: modNormData.layer_std[l],
  }));

  // Figure 3-12: 门控交叉注意力 Heatmap [denoise_step, layer]
  let figure_3_12 = null;
  if (gcaData) {
    figure_3_12 = Array.from({ length: gcaData.n_denoise }, (_, s) => {
      return Array.from({ length: N_LAYERS }, (_, l) => gcaData.mean_matrix[l][s]);
    });
  }

  // Figure 3-13: 门控交叉注意力 vs Modulator Comparison
  let figure_3_13 = null;
  if (gcaData) {
    figure_3_13 = Array.from({ length: N_LAYERS }, (_, l) => ({
      layer: l + 1,
      gca_mean: gcaData.layer_mean[l],
      gca_std: gcaData.layer_std[l],
      mod_mean: modData.layer_mean[l],
      mod_std: modData.layer_std[l],
    }));
  }

  // Figure 3-14: Modulator Heatmap [denoise_step, layer]
  const figure_3_14 = Array.from({ length: modData.n_denoise }, (_, s) => {
    return Array.from({ length: N_LAYERS }, (_, l) => modData.mean_matrix[l][s]);
  });

  const output = {
    figure_3_9,
    figure_3_12,
    figure_3_13,
    figure_3_14,
    meta: {
      mod_episodes: modData.n_episodes,
      gca_episodes: gcaData ? gcaData.n_episodes : 0,
    }
  };

  if (!fs.existsSync(path.dirname(OUTPUT_FILE))) {
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  }
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Successfully generated ${OUTPUT_FILE}`);
}

processAll();
