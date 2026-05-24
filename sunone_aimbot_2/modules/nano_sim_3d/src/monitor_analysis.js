export function analyzeSamples(scenario, samples) {
  const valid = samples.filter((sample) => Number.isFinite(sample.errorPx));
  const errors = valid.map((sample) => sample.errorPx);
  const scores = valid.map((sample) => sample.score).filter(Number.isFinite);
  const jumps = valid.map((sample) => sample.detectionJumpPx ?? 0);
  const sizes = valid.map((sample) => sample.targetSizePx).filter((value) => Number.isFinite(value) && value > 0);
  const avgTargetSizePx = average(sizes);
  const avgErrorPx = average(errors);
  const p90ErrorPx = percentile(errors, 0.9);
  const maxErrorPx = Math.max(0, ...errors);
  const avgScore = average(scores);
  const maxDetectionJumpPx = Math.max(0, ...jumps);
  const normalizedAvgError = avgTargetSizePx > 0 ? avgErrorPx / avgTargetSizePx : 0;
  const normalizedP90Error = avgTargetSizePx > 0 ? p90ErrorPx / avgTargetSizePx : 0;

  const recommendations = [];
  let classification = "clean";

  if (maxDetectionJumpPx > avgTargetSizePx * 2.0 && normalizedP90Error > 1.0) {
    classification = "reacquire_slow";
    recommendations.push("Add discontinuity/reacquire mode for large detection jumps.");
    recommendations.push("Reset or bleed controller velocity/integral on reacquire.");
    recommendations.push("Allow a short high-authority reacquire phase, then fade back to precision control.");
  } else if (["strafe", "zigzag"].includes(scenario) && normalizedAvgError > 0.35) {
    classification = "tracking_lag";
    recommendations.push("Add target velocity feed-forward or short lead prediction.");
    recommendations.push("Increase acceleration only while error is consistently moving away from center.");
    recommendations.push("Log target_vx/target_vy and controller velocity to separate target lag from controller lag.");
  } else if (normalizedAvgError > 0.25) {
    classification = "under_converged";
    recommendations.push("Tune proportional/velocity response against target size-normalized error.");
    recommendations.push("Check whether actuator Hz and render FPS are being confused in logs.");
  }

  return {
    scenario,
    samples: valid.length,
    classification,
    avgErrorPx,
    p90ErrorPx,
    maxErrorPx,
    avgTargetSizePx,
    avgScore,
    maxDetectionJumpPx,
    normalizedAvgError,
    normalizedP90Error,
    recommendations
  };
}

export function formatAnalysis(analysis) {
  const lines = [
    `${analysis.scenario}: ${analysis.classification}`,
    `  samples=${analysis.samples} avg_error=${analysis.avgErrorPx.toFixed(2)}px p90=${analysis.p90ErrorPx.toFixed(2)}px max=${analysis.maxErrorPx.toFixed(2)}px`,
    `  avg_size=${analysis.avgTargetSizePx.toFixed(2)}px avg_score=${analysis.avgScore.toFixed(1)} jump_max=${analysis.maxDetectionJumpPx.toFixed(2)}px`
  ];
  for (const recommendation of analysis.recommendations) {
    lines.push(`  - ${recommendation}`);
  }
  return lines.join("\n");
}

function average(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, p) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}
