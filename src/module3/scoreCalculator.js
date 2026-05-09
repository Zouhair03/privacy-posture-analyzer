function computeScore(analysisResult) {
  const { permissionResults, trackerResults, storageResults } = analysisResult;

  // ── PERMISSIONS SCORE (40%) ───────────────────────────────────────────
  let scorePerms = 100;
  const perms = permissionResults.results || [];
  for (const p of perms) {
    if (p.classification === 'risky')     scorePerms -= 15;
    else if (p.classification === 'sensitive') scorePerms -= 8;
    else if (p.classification === 'excessive') scorePerms -= 5;
  }
  scorePerms = Math.max(0, Math.min(100, scorePerms));

  // ── TRACKERS SCORE (35%) ──────────────────────────────────────────────
  let scoreTrackers = 100;
  const trackers = (trackerResults || []).filter(t => t.isTracker);
  const adTrackers = trackers.filter(t => t.category === 'ads' || t.category === 'fingerprinting');
  const analyticsTrackers = trackers.filter(t => t.category === 'analytics');
  scoreTrackers -= adTrackers.length * 20;
  scoreTrackers -= analyticsTrackers.length * 10;
  scoreTrackers = Math.max(0, Math.min(100, scoreTrackers));

  // ── STORAGE SCORE (25%) ───────────────────────────────────────────────
  let scoreStorage = 100;
  const storages = storageResults || [];
  for (const s of storages) {
    if (s.riskLevel === 'critical') scoreStorage -= 25;
    else if (s.riskLevel === 'high')     scoreStorage -= 15;
    else if (s.riskLevel === 'medium')   scoreStorage -= 8;
    else if (s.riskLevel === 'low')      scoreStorage -= 3;
  }
  scoreStorage = Math.max(0, Math.min(100, scoreStorage));

  // ── GLOBAL SCORE (weighted) ───────────────────────────────────────────
  const global = Math.round(scorePerms * 0.40 + scoreTrackers * 0.35 + scoreStorage * 0.25);

  let level, color;
  if (global >= 80) { level = 'BON';      color = '#10b981'; }
  else if (global >= 50) { level = 'MOYEN';   color = '#f59e0b'; }
  else               { level = 'CRITIQUE'; color = '#ef4444'; }

  return {
    global,
    permissions: scorePerms,
    trackers: scoreTrackers,
    storage: scoreStorage,
    level,
    color,
    counts: {
      riskyPerms:    perms.filter(p => p.classification === 'risky').length,
      excessivePerms: perms.filter(p => p.classification === 'excessive').length,
      totalTrackers: trackers.length,
      adTrackers:    adTrackers.length,
      criticalFindings: storages.filter(s => s.riskLevel === 'critical').length
    }
  };
}

module.exports = { computeScore };
