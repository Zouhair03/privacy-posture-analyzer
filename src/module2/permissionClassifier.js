const { callLlm } = require('./llmClient');

// Static fallback classification database
const STATIC_DB = {
  'android.permission.ACCESS_FINE_LOCATION':       { classification: 'risky',     justification: 'Localisation GPS précise très intrusive', remediation: 'Utiliser ACCESS_COARSE_LOCATION si la précision exacte n\'est pas requise' },
  'android.permission.ACCESS_BACKGROUND_LOCATION': { classification: 'risky',     justification: 'Tracking de localisation en arrière-plan', remediation: 'Supprimer si non essentiel, demander justification explicite' },
  'android.permission.CAMERA':                     { classification: 'sensitive',  justification: 'Accès à la caméra — données visuelles privées', remediation: 'Justifier l\'usage dans la politique de confidentialité' },
  'android.permission.RECORD_AUDIO':               { classification: 'risky',     justification: 'Accès au microphone — risque d\'écoute', remediation: 'Activer seulement pendant l\'usage actif, désactiver sinon' },
  'android.permission.READ_CONTACTS':              { classification: 'risky',     justification: 'Accès aux contacts personnels', remediation: 'Utiliser le Contact Picker au lieu de la permission complète' },
  'android.permission.READ_SMS':                   { classification: 'risky',     justification: 'Lecture des SMS — données très sensibles', remediation: 'Éviter absolument sauf cas OTP justifié' },
  'android.permission.SEND_SMS':                   { classification: 'risky',     justification: 'Envoi de SMS sans consentement possible', remediation: 'Éviter, utiliser Intent ACTION_SENDTO à la place' },
  'android.permission.READ_CALL_LOG':              { classification: 'risky',     justification: 'Journal d\'appels — données très personnelles', remediation: 'Supprimer si non essentiel à la fonctionnalité core' },
  'android.permission.READ_PHONE_STATE':           { classification: 'excessive', justification: 'Donne accès à l\'IMEI et identifiants uniques', remediation: 'Utiliser une alternative non liée au hardware' },
  'android.permission.READ_EXTERNAL_STORAGE':      { classification: 'sensitive', justification: 'Lecture de tous les fichiers sur l\'appareil', remediation: 'Utiliser Storage Access Framework avec accès limité' },
  'android.permission.WRITE_EXTERNAL_STORAGE':     { classification: 'sensitive', justification: 'Écriture sur le stockage partagé', remediation: 'Utiliser app-specific directories (getFilesDir)' },
  'android.permission.BODY_SENSORS':               { classification: 'risky',     justification: 'Données de santé très sensibles (rythme cardiaque, etc.)', remediation: 'Justifier explicitement, mentionner dans la politique de confidentialité' },
  'android.permission.PROCESS_OUTGOING_CALLS':     { classification: 'risky',     justification: 'Interception des appels sortants', remediation: 'Permission dépréciée, supprimer' },
  'android.permission.BLUETOOTH_SCAN':             { classification: 'sensitive', justification: 'Scan Bluetooth peut révéler la position', remediation: 'Demander seulement si la fonctionnalité Bluetooth est core' },
  'android.permission.INTERNET':                   { classification: 'necessary', justification: 'Accès réseau requis pour les fonctionnalités de base', remediation: 'Chiffrer toutes les communications avec TLS 1.2+' },
  'android.permission.VIBRATE':                    { classification: 'necessary', justification: 'Vibration pour notifications', remediation: 'Aucune action requise' },
  'android.permission.RECEIVE_BOOT_COMPLETED':     { classification: 'excessive', justification: 'Démarrage automatique — impact performance et vie privée', remediation: 'Justifier le besoin ou supprimer' },
  'android.permission.WAKE_LOCK':                  { classification: 'necessary', justification: 'Empêche l\'appareil de dormir', remediation: 'Libérer le WakeLock dès que possible' },
  'android.permission.ACCESS_NETWORK_STATE':       { classification: 'necessary', justification: 'Vérifie l\'état de la connexion', remediation: 'Aucune action requise' },
  'android.permission.FOREGROUND_SERVICE':         { classification: 'necessary', justification: 'Service visible par l\'utilisateur', remediation: 'Aucune action requise' },
};

const UNKNOWN_DEFAULT = {
  classification: 'excessive',
  justification: 'Permission non reconnue — analyse manuelle recommandée',
  remediation: 'Vérifier si cette permission est vraiment nécessaire'
};

async function classifyPermissions(permissions, profile, apiKey) {
  if (!permissions || permissions.length === 0) {
    return { results: [], usedFallback: true };
  }

  // Try LLM first (max 50 permissions per call)
  const chunks = chunkArray(permissions, 40);
  const allResults = [];
  let aiSummary = null;
  let usedFallback = !apiKey;

  if (apiKey) {
    for (const chunk of chunks) {
      const systemPrompt = `Tu es un expert sécurité Android. Réponds UNIQUEMENT en JSON valide, sans texte avant ni après.`;
      const userPrompt = `Profil de l'app: ${profile}
Permissions déclarées: ${chunk.map(p => p.name).join(', ')}

Pour chaque permission, retourne:
{
  "aiSummary": "Un résumé dynamique de 2 à 3 phrases (max) évaluant la posture globale de vie privée de cette application en fonction de ce domaine et de ces permissions.",
  "results": [
    {
      "permission": "nom.permission",
      "classification": "necessary|excessive|risky|sensitive",
      "justification": "string (max 80 chars)",
      "remediation": "string (max 100 chars)"
    }
  ]
}`;
      const llmResult = await callLlm(systemPrompt, userPrompt, apiKey);
      if (llmResult && llmResult.results && Array.isArray(llmResult.results)) {
        allResults.push(...llmResult.results);
        if (llmResult.aiSummary && !aiSummary) aiSummary = llmResult.aiSummary;
      } else {
        usedFallback = true;
        allResults.push(...staticClassify(chunk));
      }
    }
  } else {
    allResults.push(...staticClassify(permissions));
  }

  return { results: allResults, usedFallback, aiSummary };
}

function staticClassify(permissions) {
  return permissions.map(p => {
    const db = STATIC_DB[p.name] || UNKNOWN_DEFAULT;
    return {
      permission: p.name,
      classification: db.classification,
      justification: db.justification,
      remediation: db.remediation
    };
  });
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

module.exports = { classifyPermissions };
