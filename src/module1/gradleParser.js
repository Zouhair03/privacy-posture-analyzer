// Known tracker SDKs (supplemental to CSV)
const KNOWN_TRACKERS = {
  'com.google.android.gms.ads':       { isTracker: true,  category: 'ads' },
  'com.google.firebase.analytics':    { isTracker: true,  category: 'analytics' },
  'com.facebook.ads':                 { isTracker: true,  category: 'ads' },
  'com.appsflyer':                    { isTracker: true,  category: 'analytics' },
  'com.adjust.sdk':                   { isTracker: true,  category: 'analytics' },
  'io.branch.sdk':                    { isTracker: true,  category: 'analytics' },
  'com.mixpanel.android':             { isTracker: true,  category: 'analytics' },
  'com.amplitude.api':                { isTracker: true,  category: 'analytics' },
  'com.mopub':                        { isTracker: true,  category: 'ads' },
  'com.chartboost':                   { isTracker: true,  category: 'ads' },
  'com.moat.analytics':               { isTracker: true,  category: 'analytics' },
  'com.segment.analytics':            { isTracker: true,  category: 'analytics' },
  'com.flurry.android':               { isTracker: true,  category: 'analytics' },
  'com.onesignal':                    { isTracker: false, category: 'push' },
  'com.google.firebase.crashlytics':  { isTracker: false, category: 'crash' },
  'com.bugsnag.android':              { isTracker: false, category: 'crash' },
  'retrofit2':                        { isTracker: false, category: 'networking' },
  'com.squareup.okhttp3':             { isTracker: false, category: 'networking' },
  'com.google.dagger':                { isTracker: false, category: 'utility' },
  'org.jetbrains.kotlin':             { isTracker: false, category: 'language' },
  'androidx':                         { isTracker: false, category: 'ui' },
  'com.google.android.material':      { isTracker: false, category: 'ui' },
};

async function parseGradle(apkData) {
  const dependencies = [];

  // Try to find build.gradle files inside APK (unlikely but some decoded APKs have them)
  const gradleFiles = apkData.getFileList().filter(f =>
    f.includes('build.gradle') || f.includes('build.gradle.kts')
  );

  for (const gf of gradleFiles) {
    const content = await apkData.getTextFile(gf);
    if (content) {
      const found = extractDepsFromGradle(content);
      dependencies.push(...found);
    }
  }

  // Also infer from dex class names / META-INF
  const metaFiles = apkData.getFileList().filter(f => f.startsWith('META-INF/') && f.endsWith('.MF'));
  for (const mf of metaFiles) {
    const content = await apkData.getTextFile(mf);
    if (content) {
      const libs = inferLibsFromManifest(content);
      dependencies.push(...libs);
    }
  }

  // Remove duplicates
  const seen = new Set();
  const unique = dependencies.filter(d => {
    const key = `${d.groupId}:${d.artifactId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { dependencies: unique };
}

function extractDepsFromGradle(content) {
  const deps = [];
  // Match: implementation 'group:artifact:version' or implementation("group:artifact:version")
  const regex = /(?:implementation|api|compileOnly|runtimeOnly)\s*[("']+([^"'\s]+):([^"'\s]+):([^"'\s)]+)/g;
  let m;
  while ((m = regex.exec(content)) !== null) {
    deps.push({ groupId: m[1], artifactId: m[2], version: m[3] });
  }
  return deps;
}

function inferLibsFromManifest(content) {
  // Extract Created-By or other metadata
  return [];
}

module.exports = { parseGradle };
