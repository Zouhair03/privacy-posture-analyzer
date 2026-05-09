const { parseApk } = require('./module1/apkParser');
const { parseManifest } = require('./module1/manifestParser');
const { parseGradle } = require('./module1/gradleParser');
const { scanStorage } = require('./module1/storageScanner');
const { classifyPermissions } = require('./module2/permissionClassifier');
const { detectTrackers } = require('./module2/trackerDetector');
const { evaluateStorageRisk } = require('./module2/storageRiskEvaluator');
const { computeScore } = require('./module3/scoreCalculator');
const { buildRecommendations } = require('./module3/recommendationEngine');
const { buildReport } = require('./module3/reportBuilder');

async function analyzeApk(buffer, filename, profile, apiKey, onProgress) {
  const log = (msg) => { console.log(`[Orchestrator] ${msg}`); onProgress(msg); };

  try {
    // ── MODULE 1 — COLLECTE ──────────────────────────────────────────────
    log('📦 Extraction de l\'APK...');
    const apkData = await parseApk(buffer);

    log('📋 Analyse du AndroidManifest.xml...');
    const manifestData = await parseManifest(apkData);

    log('🔍 Lecture des dépendances Gradle...');
    const gradleData = await parseGradle(apkData);

    log('💾 Scan des patterns de stockage sensibles...');
    const storageData = await scanStorage(apkData);

    const appPrivacyData = {
      packageName: manifestData.packageName || filename.replace('.apk', ''),
      appVersion: manifestData.versionName || 'Unknown',
      appProfile: profile,
      permissions: manifestData.permissions || [],
      exportedComponents: manifestData.exportedComponents || [],
      dependencies: gradleData.dependencies || [],
      storageFindings: storageData.findings || [],
      analysisTimestamp: Date.now(),
      filename
    };

    log(`✅ Module 1 terminé — ${appPrivacyData.permissions.length} permissions, ${appPrivacyData.dependencies.length} dépendances`);

    // ── MODULE 2 — ANALYSE IA ────────────────────────────────────────────
    log('🤖 Classification des permissions (IA)...');
    const permissionResults = await classifyPermissions(appPrivacyData.permissions, profile, apiKey);

    log('🕵️ Détection des trackers...');
    const trackerResults = await detectTrackers(appPrivacyData.dependencies, apiKey);

    log('⚠️ Évaluation des risques de stockage...');
    const storageResults = await evaluateStorageRisk(appPrivacyData.storageFindings, apiKey);

    const analysisResult = {
      permissionResults,
      trackerResults,
      storageResults,
      usedFallback: permissionResults.usedFallback || false,
      analysisTimestamp: Date.now()
    };

    log('✅ Module 2 terminé — Analyse IA complète');

    // ── MODULE 3 — RAPPORT ───────────────────────────────────────────────
    log('📊 Calcul du score privacy...');
    const score = computeScore(analysisResult);

    log('💡 Génération des recommandations...');
    const recommendations = buildRecommendations(analysisResult, profile);

    log('📄 Assemblage du rapport...');
    const report = buildReport(appPrivacyData, analysisResult, score, recommendations);

    log('✅ Analyse complète !');

    return {
      appPrivacyData,
      analysisResult,
      score,
      recommendations,
      report
    };

  } catch (err) {
    log(`❌ Erreur: ${err.message}`);
    throw err;
  }
}

module.exports = { analyzeApk };
