const { callLlm } = require('./llmClient');

const SEVERITY_RISK = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' };

const STATIC_REMEDIATION = {
  critical: 'Ne jamais stocker en clair. Utiliser Android Keystore + AES-256 encryption.',
  high:     'Chiffrer avec EncryptedSharedPreferences ou SQLCipher. Effacer après usage.',
  medium:   'Évaluer si ce stockage est nécessaire. Appliquer des permissions restrictives.',
  low:      'Bonne pratique : minimiser la rétention des données.'
};

async function evaluateStorageRisk(findings, apiKey) {
  if (!findings || findings.length === 0) return [];

  // Try LLM for nuanced analysis
  if (apiKey && findings.length > 0) {
    const sample = findings.slice(0, 20);
    const systemPrompt = `Tu es un expert privacy Android. Réponds UNIQUEMENT en JSON valide.`;
    const userPrompt = `Findings de stockage détectés dans un APK:
${sample.map(f => `- [${f.severity}] ${f.location} — "${f.pattern}" dans "${f.filename}"`).join('\n')}

Pour chaque finding, évalue le risque réel:
{
  "results": [
    {
      "location": "string",
      "pattern": "string",
      "riskLevel": "low|medium|high|critical",
      "finding": "description du risque (max 80 chars)",
      "remediation": "action corrective (max 100 chars)"
    }
  ]
}`;
    const llmRes = await callLlm(systemPrompt, userPrompt, apiKey);
    if (llmRes && llmRes.results) return llmRes.results;
  }

  // Static fallback
  return findings.map(f => ({
    location: f.location,
    pattern: f.pattern,
    riskLevel: SEVERITY_RISK[f.severity] || 'medium',
    finding: `Pattern "${f.pattern}" détecté dans ${f.location} (${f.filename})`,
    remediation: STATIC_REMEDIATION[f.severity] || STATIC_REMEDIATION.medium
  }));
}

module.exports = { evaluateStorageRisk };
