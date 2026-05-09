// Sensitive data patterns to detect in file names and content
const SENSITIVE_PATTERNS = [
  { pattern: /password|passwd|pwd/i,         label: 'Mot de passe',           severity: 'critical' },
  { pattern: /secret_?key|api_?key|apikey/i, label: 'Clé API secrète',        severity: 'critical' },
  { pattern: /token|auth_token|access_token/i,label: 'Token d\'authentification',severity: 'high' },
  { pattern: /email|e-mail/i,                label: 'Email utilisateur',       severity: 'medium' },
  { pattern: /ssn|social_security/i,         label: 'Numéro sécurité sociale', severity: 'critical' },
  { pattern: /credit_card|card_number/i,     label: 'Numéro carte bancaire',   severity: 'critical' },
  { pattern: /private_?key|rsa_key/i,        label: 'Clé privée cryptographique', severity: 'critical' },
  { pattern: /shared_?pref.*password/i,      label: 'SharedPrefs + password',  severity: 'critical' },
  { pattern: /cleartext|plain_?text/i,       label: 'Données en clair',        severity: 'high' },
  { pattern: /gps|latitude|longitude/i,      label: 'Coordonnées GPS',         severity: 'medium' },
  { pattern: /imei|device_id/i,              label: 'Identifiant appareil',     severity: 'high' },
];

// File patterns that indicate sensitive storage locations
const STORAGE_FILE_PATTERNS = [
  { pattern: /\.db$/i,           location: 'SQLite Database' },
  { pattern: /shared_prefs/i,    location: 'SharedPreferences' },
  { pattern: /\.xml$/i,          location: 'XML File' },
  { pattern: /\.json$/i,         location: 'JSON File' },
  { pattern: /\.key$/i,          location: 'Key File' },
  { pattern: /keystore/i,        location: 'Keystore' },
];

async function scanStorage(apkData) {
  const findings = [];
  const files = apkData.getFileList();

  for (const filename of files) {
    // Check filename for sensitive patterns
    for (const sp of STORAGE_FILE_PATTERNS) {
      if (sp.pattern.test(filename)) {
        for (const dp of SENSITIVE_PATTERNS) {
          if (dp.pattern.test(filename)) {
            findings.push({
              location: sp.location,
              filename,
              pattern: dp.label,
              severity: dp.severity,
              rawValue: filename.slice(0, 80)
            });
          }
        }
        break;
      }
    }

    // Scan file content for sensitive patterns (text files only, limit size)
    if (isTextFile(filename)) {
      try {
        const content = await apkData.getTextFile(filename);
        if (content && content.length < 500000) {
          for (const dp of SENSITIVE_PATTERNS) {
            const match = dp.pattern.exec(content);
            if (match) {
              const locationMatch = STORAGE_FILE_PATTERNS.find(s => s.pattern.test(filename));
              findings.push({
                location: locationMatch ? locationMatch.location : 'Resource File',
                filename,
                pattern: dp.label,
                severity: dp.severity,
                rawValue: content.substring(Math.max(0, match.index - 20), match.index + 50).trim().slice(0, 80)
              });
            }
          }
        }
      } catch { /* skip unreadable files */ }
    }
  }

  // Deduplicate
  const seen = new Set();
  const unique = findings.filter(f => {
    const key = `${f.filename}:${f.pattern}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { findings: unique };
}

function isTextFile(filename) {
  return /\.(xml|json|txt|properties|yaml|yml|gradle|java|kt|smali|html|js|css)$/i.test(filename);
}

module.exports = { scanStorage };
