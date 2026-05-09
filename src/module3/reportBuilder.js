function buildReport(appPrivacyData, analysisResult, score, recommendations) {
  const { permissionResults, trackerResults, storageResults, usedFallback } = analysisResult;
  const { recommendations: recs, checklist } = recommendations;

  return {
    meta: {
      packageName:  appPrivacyData.packageName,
      appVersion:   appPrivacyData.appVersion,
      appProfile:   appPrivacyData.appProfile,
      filename:     appPrivacyData.filename,
      analysisDate: new Date(appPrivacyData.analysisTimestamp).toISOString(),
      generatedBy:  'Privacy Posture Analyzer v1.0 — Web Edition',
      usedFallback,
      aiSummary:    permissionResults.aiSummary || null
    },
    score,
    summary: {
      totalPermissions:   appPrivacyData.permissions.length,
      riskyPermissions:   score.counts.riskyPerms,
      excessivePerms:     score.counts.excessivePerms,
      totalTrackers:      (trackerResults || []).length,
      activeTrackers:     score.counts.totalTrackers,
      adTrackers:         score.counts.adTrackers,
      storageFindings:    (storageResults || []).length,
      criticalFindings:   score.counts.criticalFindings,
      exportedComponents: appPrivacyData.exportedComponents.length
    },
    permissions:  permissionResults.results || [],
    trackers:     trackerResults || [],
    storage:      storageResults || [],
    exportedComponents: appPrivacyData.exportedComponents,
    recommendations: recs,
    checklist
  };
}

module.exports = { buildReport };
