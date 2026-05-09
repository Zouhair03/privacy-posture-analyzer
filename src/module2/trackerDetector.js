const { callLlm } = require('./llmClient');

// Exodus Privacy format — known trackers
const TRACKER_DB = {
  'com.google.android.gms.ads':        { isTracker: true,  category: 'ads',         confidence: 'high', name: 'Google Ads' },
  'com.google.firebase.analytics':     { isTracker: true,  category: 'analytics',   confidence: 'high', name: 'Firebase Analytics' },
  'com.google.android.gms.analytics':  { isTracker: true,  category: 'analytics',   confidence: 'high', name: 'Google Analytics' },
  'com.facebook.ads':                  { isTracker: true,  category: 'ads',         confidence: 'high', name: 'Facebook Audience Network' },
  'com.facebook.appevents':            { isTracker: true,  category: 'analytics',   confidence: 'high', name: 'Facebook App Events' },
  'com.appsflyer':                     { isTracker: true,  category: 'analytics',   confidence: 'high', name: 'AppsFlyer' },
  'com.adjust.sdk':                    { isTracker: true,  category: 'analytics',   confidence: 'high', name: 'Adjust' },
  'io.branch.sdk':                     { isTracker: true,  category: 'analytics',   confidence: 'high', name: 'Branch.io' },
  'com.mixpanel.android':              { isTracker: true,  category: 'analytics',   confidence: 'high', name: 'Mixpanel' },
  'com.amplitude.api':                 { isTracker: true,  category: 'analytics',   confidence: 'high', name: 'Amplitude' },
  'com.mopub':                         { isTracker: true,  category: 'ads',         confidence: 'high', name: 'MoPub' },
  'com.chartboost':                    { isTracker: true,  category: 'ads',         confidence: 'high', name: 'Chartboost' },
  'com.flurry.android':                { isTracker: true,  category: 'analytics',   confidence: 'high', name: 'Flurry' },
  'com.moat.analytics':                { isTracker: true,  category: 'fingerprinting', confidence: 'high', name: 'Moat Analytics' },
  'com.segment.analytics':             { isTracker: true,  category: 'analytics',   confidence: 'high', name: 'Segment.io' },
  'com.tiktok.sdk':                    { isTracker: true,  category: 'analytics',   confidence: 'high', name: 'TikTok SDK' },
  'com.singular.sdk':                  { isTracker: true,  category: 'analytics',   confidence: 'high', name: 'Singular' },
  'com.comscore.android':              { isTracker: true,  category: 'analytics',   confidence: 'high', name: 'comScore' },
  'net.hockeyapp.android':             { isTracker: false, category: 'crash',       confidence: 'high', name: 'HockeyApp' },
  'com.google.firebase.crashlytics':   { isTracker: false, category: 'crash',       confidence: 'high', name: 'Firebase Crashlytics' },
  'com.bugsnag.android':               { isTracker: false, category: 'crash',       confidence: 'high', name: 'Bugsnag' },
  'com.onesignal':                     { isTracker: false, category: 'push',        confidence: 'high', name: 'OneSignal' },
  'com.google.firebase.messaging':     { isTracker: false, category: 'push',        confidence: 'high', name: 'Firebase Cloud Messaging' },
};

async function detectTrackers(dependencies, apiKey) {
  const results = [];
  const unknown = [];

  for (const dep of dependencies) {
    const key = dep.groupId;
    // Check local DB
    const matched = Object.keys(TRACKER_DB).find(k => key.startsWith(k) || dep.artifactId.startsWith(k));
    if (matched) {
      results.push({
        library: `${dep.groupId}:${dep.artifactId}`,
        version: dep.version,
        ...TRACKER_DB[matched],
        source: 'csv_local'
      });
    } else {
      unknown.push(dep);
    }
  }

  // LLM fallback for unknown libs
  if (apiKey && unknown.length > 0) {
    const chunk = unknown.slice(0, 30);
    const systemPrompt = `Tu es un expert privacy Android. Réponds UNIQUEMENT en JSON valide.`;
    const userPrompt = `Dépendances inconnues: ${chunk.map(d => `${d.groupId}:${d.artifactId}`).join(', ')}

Pour chaque lib, indique:
{
  "results": [
    {
      "library": "group:artifact",
      "isTracker": true|false,
      "category": "ads|analytics|fingerprinting|crash|push|networking|utility|other",
      "confidence": "high|medium|low",
      "name": "Nom lisible"
    }
  ]
}`;
    const llmRes = await callLlm(systemPrompt, userPrompt, apiKey);
    if (llmRes && llmRes.results) {
      results.push(...llmRes.results.map(r => ({ ...r, source: 'llm' })));
    } else {
      // Static fallback for unknown
      for (const dep of unknown) {
        results.push({
          library: `${dep.groupId}:${dep.artifactId}`,
          version: dep.version,
          isTracker: false,
          category: 'other',
          confidence: 'low',
          name: dep.artifactId,
          source: 'fallback'
        });
      }
    }
  }

  return results;
}

module.exports = { detectTrackers };
