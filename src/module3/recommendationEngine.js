const PROFILE_CHECKLIST = {
  HEALTH: [
    { id: 'health_1', label: 'Données de santé chiffrées au repos', critical: true },
    { id: 'health_2', label: 'Pas de trackers publicitaires dans une app de santé', critical: true },
    { id: 'health_3', label: 'Consentement explicite pour toute collecte de données', critical: true },
    { id: 'health_4', label: 'Politique de confidentialité conforme HIPAA/RGPD', critical: true },
    { id: 'health_5', label: 'Pas de stockage de données médicales en SharedPrefs', critical: false },
  ],
  EDUCATION: [
    { id: 'edu_1', label: 'Protection des données des mineurs (COPPA)', critical: true },
    { id: 'edu_2', label: 'Pas de publicité ciblée pour les mineurs', critical: true },
    { id: 'edu_3', label: 'Collecte minimale de données personnelles', critical: true },
    { id: 'edu_4', label: 'Données de progression stockées localement si possible', critical: false },
  ],
  FINANCE: [
    { id: 'fin_1', label: 'Chiffrement AES-256 pour toutes les données financières', critical: true },
    { id: 'fin_2', label: 'Pas de logs contenant des données de carte bancaire', critical: true },
    { id: 'fin_3', label: 'Certificate pinning activé', critical: true },
    { id: 'fin_4', label: 'Conformité PCI-DSS pour les paiements', critical: true },
    { id: 'fin_5', label: 'Timeout de session implémenté', critical: false },
  ],
  COMMERCE: [
    { id: 'com_1', label: 'Données de panier chiffrées', critical: false },
    { id: 'com_2', label: 'Opt-out des trackers publicitaires disponible', critical: true },
    { id: 'com_3', label: 'Adresse de livraison protégée', critical: true },
    { id: 'com_4', label: 'Cookies de tracking déclarés', critical: false },
  ],
  OTHER: [
    { id: 'gen_1', label: 'Principe de minimisation des données respecté', critical: true },
    { id: 'gen_2', label: 'Politique de confidentialité disponible', critical: true },
    { id: 'gen_3', label: 'Suppression des données utilisateur possible', critical: false },
    { id: 'gen_4', label: 'Communications chiffrées TLS 1.2+', critical: false },
  ]
};

function buildRecommendations(analysisResult, profile) {
  const recs = [];
  const { permissionResults, trackerResults, storageResults } = analysisResult;

  // Priority 1 — Risky permissions
  const perms = permissionResults.results || [];
  const riskyPerms = perms.filter(p => p.classification === 'risky');
  for (const p of riskyPerms.slice(0, 5)) {
    recs.push({
      priority: 'CRITIQUE',
      category: 'Permission',
      title: `Supprimer ou justifier : ${p.permission.split('.').pop()}`,
      description: p.justification,
      action: p.remediation,
      icon: '🚨'
    });
  }

  // Priority 2 — Ad trackers
  const adTrackers = (trackerResults || []).filter(t => t.isTracker && (t.category === 'ads' || t.category === 'fingerprinting'));
  for (const t of adTrackers.slice(0, 3)) {
    recs.push({
      priority: 'HAUTE',
      category: 'Tracker',
      title: `Tracker publicitaire détecté : ${t.name || t.library}`,
      description: `Catégorie : ${t.category}. Les trackers publicitaires collectent des données comportementales.`,
      action: 'Supprimer ou remplacer par une alternative respectueuse de la vie privée.',
      icon: '📡'
    });
  }

  // Priority 3 — Critical storage findings
  const criticalStorage = (storageResults || []).filter(s => s.riskLevel === 'critical' || s.riskLevel === 'high');
  for (const s of criticalStorage.slice(0, 3)) {
    recs.push({
      priority: s.riskLevel === 'critical' ? 'CRITIQUE' : 'HAUTE',
      category: 'Stockage',
      title: `Donnée sensible en clair : ${s.pattern}`,
      description: s.finding,
      action: s.remediation,
      icon: '💾'
    });
  }

  // Priority 4 — Excessive permissions
  const excessivePerms = perms.filter(p => p.classification === 'excessive');
  for (const p of excessivePerms.slice(0, 3)) {
    recs.push({
      priority: 'MOYENNE',
      category: 'Permission',
      title: `Permission excessive : ${p.permission.split('.').pop()}`,
      description: p.justification,
      action: p.remediation,
      icon: '⚠️'
    });
  }

  // Checklist
  const checklist = PROFILE_CHECKLIST[profile] || PROFILE_CHECKLIST.OTHER;

  return { recommendations: recs, checklist };
}

module.exports = { buildRecommendations };
