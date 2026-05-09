# 🔒 Privacy Posture Analyzer — Web Edition

> Audit de privacy des APKs Android via une application web.  
> Architecture MASVS chap. 1, 2, 11, 12 — Projet académique.

---

## Démarrage rapide

### Prérequis
- **Node.js** v18+ ([télécharger](https://nodejs.org))

### Installation

```bash
# 1. Aller dans le dossier web
cd privacy-web

# 2. Installer les dépendances
npm install

# 3. (Optionnel) Configurer la clé OpenAI pour l'analyse IA
cp .env.example .env
# Éditer .env et mettre votre clé : OPENAI_API_KEY=sk-...

# 4. Lancer le serveur
node server.js
```

### Accès
Ouvrir **http://localhost:3000** dans le navigateur.

---

## Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| 📦 Upload APK | Drag & drop ou sélection de fichier `.apk` |
| 🔐 Permissions | Classification : Nécessaire / Excessive / Risqué |
| 📡 Trackers | Détection de 20+ SDKs de tracking connus |
| 💾 Stockage | Scan de patterns sensibles (tokens, passwords…) |
| 📊 Score global | Pondéré : 40% permissions / 35% trackers / 25% stockage |
| 💡 Recommandations | Priorisées CRITIQUE / HAUTE / MOYENNE |
| ✅ Checklist | Par profil : Santé, Finance, Éducation, Commerce |
| ⬇️ Export | JSON (machine-readable) + HTML (rapport complet) |

---

## Architecture des 3 modules

```
APK (fichier .apk)
    │
    ▼
Module 1 — Collecte
    ├── apkParser.js        → Extraire le contenu via JSZip
    ├── manifestParser.js   → Permissions + composants exportés (XML + AXML binaire)
    ├── gradleParser.js     → Dépendances et librairies
    └── storageScanner.js   → Patterns sensibles dans les fichiers
    │
    ▼
Module 2 — Analyse IA
    ├── permissionClassifier.js   → LLM GPT-4o-mini ou fallback statique
    ├── trackerDetector.js        → Base locale + LLM pour libs inconnues
    └── storageRiskEvaluator.js   → Évaluation des risques
    │
    ▼
Module 3 — Rapport
    ├── scoreCalculator.js        → Score pondéré (40/35/25)
    ├── recommendationEngine.js   → Recommandations + checklist profil
    └── reportBuilder.js          → Assemblage rapport JSON/HTML
```

---

## Sans clé OpenAI

Le projet fonctionne **sans clé API** grâce à une base de règles statiques :
- 25+ permissions Android classifiées manuellement
- 20+ trackers connus (format Exodus Privacy)
- Remédiation prédéfinie par niveau de risque

---

## Avec clé OpenAI

Ajouter `OPENAI_API_KEY=sk-...` dans le fichier `.env` pour activer :
- Classification contextuelle des permissions selon le profil d'app
- Détection des librairies inconnues
- Analyse nuancée des risques de stockage

---

## Stack technique

| Couche | Technologie |
|---|---|
| Backend | Node.js + Express |
| Upload | Multer |
| APK parsing | JSZip |
| XML parsing | xml2js + AXML parser custom |
| LLM | OpenAI GPT-4o-mini (temperature=0) |
| Frontend | HTML + CSS + Vanilla JS |
| Temps réel | Server-Sent Events (SSE) |
| Export PDF | — (export HTML disponible) |

---

## Lancer le projet (commande rapide)

```bash
cd "c:\Users\amjad\Desktop\Privacy Posture Analyzer\privacy-web"
node server.js
```

Puis ouvrir : **http://localhost:3000**

---

*Privacy Posture Analyzer v1.0 Web — Architecture MASVS chap. 1,2,11,12*
