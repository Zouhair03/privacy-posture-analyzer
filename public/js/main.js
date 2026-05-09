/* ════════════════════════════════════════════════
   Privacy Posture Analyzer — Frontend Logic
   ════════════════════════════════════════════════ */

let currentReport = null;

// ── DOM REFS ──────────────────────────────────────────────────────────────
const dropZone     = document.getElementById('drop-zone');
const apkInput     = document.getElementById('apk-input');
const analyzeBtn   = document.getElementById('analyze-btn');
const profileSel   = document.getElementById('profile-select');
const apiKeyInput  = document.getElementById('api-key-input');
const selectedFile = document.getElementById('selected-file');
const fileNameDisp = document.getElementById('file-name-display');
const fileSizeDisp = document.getElementById('file-size-display');

const uploadSection   = document.getElementById('upload-section');
const progressSection = document.getElementById('progress-section');
const resultsSection  = document.getElementById('results-section');

const progressBar = document.getElementById('progress-bar');
const progressLog = document.getElementById('progress-log');

let selectedApkFile = null;

// ── FILE SELECTION ────────────────────────────────────────────────────────
dropZone.addEventListener('click', () => apkInput.click());
apkInput.addEventListener('change', e => handleFile(e.target.files[0]));

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

function handleFile(file) {
  if (!file || !file.name.endsWith('.apk')) {
    showToast('❌ Veuillez sélectionner un fichier .apk', 'error');
    return;
  }
  selectedApkFile = file;
  fileNameDisp.textContent = file.name;
  fileSizeDisp.textContent = formatBytes(file.size);
  selectedFile.classList.remove('hidden');
  analyzeBtn.disabled = false;
  analyzeBtn.querySelector('span:last-child').textContent = `Analyser ${file.name}`;
}

// ── ANALYZE ───────────────────────────────────────────────────────────────
analyzeBtn.addEventListener('click', startAnalysis);

async function startAnalysis() {
  if (!selectedApkFile) return;

  // Switch to progress view
  uploadSection.classList.add('hidden');
  progressSection.classList.remove('hidden');
  progressLog.innerHTML = '';
  progressBar.style.width = '0%';

  const formData = new FormData();
  formData.append('apk', selectedApkFile);
  formData.append('profile', profileSel.value);
  if (apiKeyInput.value.trim()) {
    formData.append('apiKey', apiKeyInput.value.trim());
  }

  try {
    // Upload APK and start job
    const res = await fetch('/api/analyze', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erreur serveur');
    }
    const { jobId } = await res.json();

    // Stream progress via SSE
    await streamProgress(jobId);

  } catch (err) {
    addLogItem(`❌ ${err.message}`, 'error');
    progressSection.classList.add('hidden');
    uploadSection.classList.remove('hidden');
    showToast(`❌ Erreur: ${err.message}`, 'error');
  }
}

function streamProgress(jobId) {
  return new Promise((resolve, reject) => {
    const source = new EventSource(`/api/job/${jobId}/stream`);
    const steps = [
      'Extraction APK', 'AndroidManifest', 'Dépendances',
      'Stockage', 'Permissions IA', 'Trackers', 'Risques stockage',
      'Score', 'Recommandations', 'Rapport'
    ];
    let stepIdx = 0;

    source.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.type === 'progress') {
        addLogItem(data.message, 'done');
        stepIdx = Math.min(stepIdx + 1, steps.length);
        progressBar.style.width = `${Math.round((stepIdx / steps.length) * 95)}%`;
      }

      if (data.type === 'done') {
        progressBar.style.width = '100%';
        addLogItem('✅ Analyse terminée !', 'done');
        source.close();
        setTimeout(() => {
          progressSection.classList.add('hidden');
          renderResults(data.result);
          resultsSection.classList.remove('hidden');
        }, 600);
        resolve();
      }

      if (data.type === 'error') {
        source.close();
        reject(new Error(data.message));
      }
    };

    source.onerror = () => {
      source.close();
      reject(new Error('Connexion SSE perdue'));
    };
  });
}

function addLogItem(msg, type = '') {
  const div = document.createElement('div');
  div.className = `log-item ${type}`;
  div.textContent = msg;
  progressLog.appendChild(div);
  progressLog.scrollTop = progressLog.scrollHeight;
}

// ── RENDER RESULTS ────────────────────────────────────────────────────────
function renderResults(data) {
  currentReport = data;
  const { report, appPrivacyData } = data;
  const { score, meta, summary, permissions, trackers, storage, recommendations, checklist } = report;

  // App info
  document.getElementById('result-package').textContent = meta.packageName || appPrivacyData.filename || 'Unknown';
  document.getElementById('result-version').textContent = meta.appVersion !== 'Unknown' ? `v${meta.appVersion}` : '';
  document.getElementById('result-profile').textContent = meta.appProfile;

  // AI Summary
  const aiBox = document.getElementById('ai-summary-box');
  const aiText = document.getElementById('ai-summary-text');
  if (!meta.usedFallback && meta.aiSummary) {
    aiText.textContent = meta.aiSummary;
    aiBox.classList.remove('hidden');
  } else {
    aiBox.classList.add('hidden');
  }

  // Score gauge animation
  animateGauge(score.global, score.level, score.color);

  // Show Chat Widget
  if (!meta.usedFallback) {
    document.getElementById('chat-widget').classList.remove('hidden');
  }

  // Sub-score bars
  animateBar('perms-fill', 'perms-value', score.permissions);
  animateBar('trackers-fill', 'trackers-value', score.trackers);
  animateBar('storage-fill', 'storage-value', score.storage);

  // Stat grid
  renderStatGrid(summary);

  // Tab counts
  document.getElementById('tc-perms').textContent    = permissions.length;
  document.getElementById('tc-trackers').textContent  = trackers.filter(t => t.isTracker).length;
  document.getElementById('tc-storage').textContent   = storage.length;
  document.getElementById('tc-recs').textContent      = recommendations.length;

  // Fallback notice
  if (meta.usedFallback) {
    const notice = document.createElement('div');
    notice.className = 'fallback-notice';
    notice.innerHTML = '⚠️ Analyse statique utilisée (pas de clé Gemini). Ajoutez une clé API pour une classification IA plus précise.';
    document.querySelector('.export-bar').before(notice);
  }

  // Render tab content
  renderPermissions(permissions);
  renderTrackers(trackers);
  renderStorage(storage);
  renderRecommendations(recommendations);
  renderChecklist(checklist, meta.appProfile);
}

// ── SCORE GAUGE ───────────────────────────────────────────────────────────
function animateGauge(value, level, color) {
  const fill = document.getElementById('gauge-fill');
  const num  = document.getElementById('gauge-number');
  const lvl  = document.getElementById('gauge-level');

  // Arc length = 283 (half circle)
  const offset = 283 - (283 * value / 100);
  fill.style.stroke = color;
  fill.style.strokeDashoffset = offset;
  lvl.style.fill = color;
  lvl.textContent = level;

  // Animate number
  let current = 0;
  const step = value / 60;
  const interval = setInterval(() => {
    current = Math.min(current + step, value);
    num.textContent = Math.round(current);
    if (current >= value) clearInterval(interval);
  }, 16);
}

function animateBar(fillId, valueId, score) {
  const fill = document.getElementById(fillId);
  const val  = document.getElementById(valueId);
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  setTimeout(() => { fill.style.width = `${score}%`; }, 100);
  val.textContent = score;
  val.style.color = color;
}

// ── STAT GRID ─────────────────────────────────────────────────────────────
function renderStatGrid(summary) {
  const grid = document.getElementById('stat-grid');
  const stats = [
    { label: 'Permissions', value: summary.totalPermissions, color: '' },
    { label: 'Risquées', value: summary.riskyPermissions, color: summary.riskyPermissions > 0 ? '#ef4444' : '#10b981' },
    { label: 'Trackers actifs', value: summary.activeTrackers, color: summary.activeTrackers > 0 ? '#f59e0b' : '#10b981' },
    { label: 'Trackers pubs', value: summary.adTrackers, color: summary.adTrackers > 0 ? '#ef4444' : '#10b981' },
    { label: 'Findings', value: summary.storageFindings, color: summary.criticalFindings > 0 ? '#ef4444' : '#10b981' },
    { label: 'Critiques', value: summary.criticalFindings, color: summary.criticalFindings > 0 ? '#ef4444' : '#10b981' },
  ];
  grid.innerHTML = stats.map(s => `
    <div class="stat-card">
      <span class="stat-number" style="color:${s.color || 'var(--text-1)'}">${s.value}</span>
      <span class="stat-label">${s.label}</span>
    </div>
  `).join('');
}

// ── PERMISSIONS TABLE ─────────────────────────────────────────────────────
function renderPermissions(permissions) {
  const tbody = document.getElementById('perms-tbody');
  if (!permissions.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">🎉</div><p class="empty-text">Aucune permission détectée</p></div></td></tr>`;
    return;
  }

  // Sort: risky > sensitive > excessive > necessary
  const order = { risky: 0, sensitive: 1, excessive: 2, necessary: 3, unknown: 4 };
  permissions.sort((a, b) => (order[a.classification] ?? 4) - (order[b.classification] ?? 4));

  tbody.innerHTML = permissions.map(p => {
    const short = p.permission.split('.').pop();
    return `
    <tr>
      <td>
        <span class="perm-name">${escHtml(short)}</span>
        <span class="perm-short">${escHtml(p.permission)}</span>
      </td>
      <td>${classBadge(p.classification)}</td>
      <td style="color:var(--text-2);font-size:0.82rem">${escHtml(p.justification || '—')}</td>
      <td style="font-size:0.82rem;color:var(--cyan)">${escHtml(p.remediation || '—')}</td>
    </tr>`;
  }).join('');
}

// ── TRACKERS PANEL ────────────────────────────────────────────────────────
function renderTrackers(trackers) {
  const panel = document.getElementById('trackers-panel');
  if (!trackers.length) {
    panel.innerHTML = `<div class="empty-state"><div class="empty-icon">🛡️</div><p class="empty-text">Aucune dépendance analysée</p></div>`;
    return;
  }
  const sorted = [...trackers].sort((a, b) => (b.isTracker ? 1 : 0) - (a.isTracker ? 1 : 0));
  panel.innerHTML = `<div class="tracker-grid">${sorted.map(t => `
    <div class="tracker-card ${t.isTracker ? 'is-tracker' : 'not-tracker'}">
      <div class="tracker-name">${escHtml(t.name || t.library)}</div>
      <div class="tracker-lib">${escHtml(t.library)}</div>
      <div class="tracker-meta">
        <span class="badge ${t.isTracker ? 'badge-tracker' : 'badge-safe'}">${t.isTracker ? '📡 Tracker' : '✅ Sûr'}</span>
        <span class="tracker-category">${escHtml(t.category || 'other')}</span>
        <span class="tracker-source">${escHtml(t.source || '')}</span>
      </div>
    </div>`).join('')}</div>`;
}

// ── STORAGE TABLE ─────────────────────────────────────────────────────────
function renderStorage(storageResults) {
  const tbody = document.getElementById('storage-tbody');
  if (!storageResults.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">🔒</div><p class="empty-text">Aucun pattern sensible détecté</p></div></td></tr>`;
    return;
  }
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  storageResults.sort((a, b) => (order[a.riskLevel] ?? 3) - (order[a.riskLevel] ?? 3));
  tbody.innerHTML = storageResults.map(s => `
    <tr>
      <td style="font-family:'JetBrains Mono',monospace;font-size:0.78rem">${escHtml(s.location)}</td>
      <td><span style="color:var(--yellow)">${escHtml(s.pattern)}</span></td>
      <td><span class="badge badge-${s.riskLevel}">${s.riskLevel.toUpperCase()}</span></td>
      <td style="font-size:0.82rem;color:var(--cyan)">${escHtml(s.remediation || '—')}</td>
    </tr>`).join('');
}

// ── RECOMMENDATIONS ───────────────────────────────────────────────────────
function renderRecommendations(recs) {
  const list = document.getElementById('recs-list');
  if (!recs.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🎉</div><p class="empty-text">Aucune recommandation critique</p></div>`;
    return;
  }
  list.innerHTML = recs.map(r => `
    <div class="rec-card">
      <div class="rec-icon">${r.icon}</div>
      <div>
        <div class="rec-priority ${r.priority}">${r.priority} — ${escHtml(r.category)}</div>
        <div class="rec-title">${escHtml(r.title)}</div>
        <div class="rec-desc">${escHtml(r.description)}</div>
        <div class="rec-action">→ ${escHtml(r.action)}</div>
      </div>
    </div>`).join('');
}

// ── CHECKLIST ─────────────────────────────────────────────────────────────
function renderChecklist(checklist, profile) {
  const panel = document.getElementById('checklist-panel');
  panel.innerHTML = `
    <div class="checklist-panel">
      <div class="checklist-title">✅ Checklist Privacy — Profil ${profile}</div>
      ${checklist.map(item => `
        <div class="checklist-item" id="ci-${item.id}" onclick="toggleCheck('${item.id}')">
          <div class="check-box" id="cb-${item.id}"></div>
          <div>
            <div class="check-label">${escHtml(item.label)}</div>
            ${item.critical ? '<div class="check-critical">⚠ CRITIQUE</div>' : ''}
          </div>
        </div>`).join('')}
    </div>`;
}

function toggleCheck(id) {
  const item = document.getElementById(`ci-${id}`);
  const box  = document.getElementById(`cb-${id}`);
  item.classList.toggle('checked');
  box.textContent = item.classList.contains('checked') ? '✓' : '';
}

// ── TABS ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
  });
});

// ── EXPORTS ───────────────────────────────────────────────────────────────
document.getElementById('export-json').addEventListener('click', () => {
  if (!currentReport) return;
  downloadFile(
    JSON.stringify(currentReport.report, null, 2),
    `privacy-report-${Date.now()}.json`,
    'application/json'
  );
});

document.getElementById('export-html').addEventListener('click', () => {
  if (!currentReport) return;
  const html = generateHtmlReport(currentReport.report);
  downloadFile(html, `privacy-report-${Date.now()}.html`, 'text/html');
});

document.getElementById('new-analysis').addEventListener('click', () => {
  document.getElementById('results-section').classList.add('hidden');
  document.getElementById('hero-section').classList.remove('hidden');
  document.getElementById('upload-section').classList.remove('hidden');
  document.getElementById('chat-widget').classList.add('hidden');
  document.getElementById('chat-window').classList.add('hidden');
  currentReport = null;
  
  const fileInput = document.getElementById('apk-input');
  analyzeBtn.disabled = true;
  analyzeBtn.querySelector('span:last-child').textContent = 'Analyser l\'APK';
  apkInput.value = '';
  document.querySelector('.fallback-notice')?.remove();
  
  // Reset tabs
  document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
  document.querySelectorAll('.tab-panel').forEach((p, i) => p.classList.toggle('hidden', i !== 0));
});

// ── HTML REPORT GENERATOR ─────────────────────────────────────────────────
function generateHtmlReport(report) {
  const { meta, score, summary, permissions, trackers, storage, recommendations } = report;
  const scoreColor = score.global >= 80 ? '#10b981' : score.global >= 50 ? '#f59e0b' : '#ef4444';

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"/>
<title>Rapport Privacy — ${escHtml(meta.packageName || 'App')}</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0a0f1e;color:#f0f4ff;margin:0;padding:32px;}
  h1{font-size:2rem;margin-bottom:4px}
  h2{font-size:1.2rem;border-bottom:1px solid #1e2235;padding-bottom:8px;margin-top:32px}
  .meta{color:#94a3b8;font-size:.85rem;margin-bottom:32px}
  .score-box{background:#141b2d;border-radius:12px;padding:24px;display:inline-block;margin-bottom:24px}
  .score-num{font-size:4rem;font-weight:900;color:${scoreColor};line-height:1}
  .score-lvl{color:${scoreColor};font-size:1.2rem;font-weight:700}
  .sub{display:flex;gap:24px;margin-top:12px}
  .sub span{color:#94a3b8;font-size:.85rem}
  table{width:100%;border-collapse:collapse;font-size:.85rem;margin-top:12px}
  th{background:#141b2d;padding:10px 14px;text-align:left;color:#94a3b8;font-size:.75rem;text-transform:uppercase}
  td{padding:10px 14px;border-bottom:1px solid #1e2235;vertical-align:top}
  .badge{padding:2px 8px;border-radius:99px;font-size:.72rem;font-weight:700}
  .risky{background:rgba(239,68,68,.15);color:#ef4444}
  .sensitive{background:rgba(245,158,11,.15);color:#f59e0b}
  .excessive{background:rgba(139,92,246,.15);color:#a78bfa}
  .necessary{background:rgba(16,185,129,.12);color:#10b981}
  .critical{background:rgba(239,68,68,.15);color:#ef4444}
  .high{background:rgba(245,158,11,.15);color:#f59e0b}
  .tracker-yes{color:#ef4444} .tracker-no{color:#10b981}
  .rec{background:#141b2d;border-radius:8px;padding:16px;margin-bottom:10px}
  .rec-p{font-weight:700;font-size:.72rem;letter-spacing:.5px;margin-bottom:4px}
  .CRITIQUE{color:#ef4444} .HAUTE{color:#f59e0b} .MOYENNE{color:#a78bfa}
</style></head><body>
<h1>🔒 Rapport Privacy Posture</h1>
<div class="meta">
  Package: <strong>${escHtml(meta.packageName || '—')}</strong> |
  Profil: <strong>${meta.appProfile}</strong> |
  Date: ${new Date(meta.analysisDate).toLocaleString('fr-FR')} |
  Généré par: ${meta.generatedBy}
</div>

<div class="score-box">
  <div class="score-num">${score.global}</div>
  <div class="score-lvl">${score.level}</div>
  <div class="sub">
    <span>Permissions: ${score.permissions}/100</span>
    <span>Trackers: ${score.trackers}/100</span>
    <span>Stockage: ${score.storage}/100</span>
  </div>
</div>

<h2>🔐 Permissions (${permissions.length})</h2>
<table><thead><tr><th>Permission</th><th>Classification</th><th>Justification</th><th>Remédiation</th></tr></thead>
<tbody>${permissions.map(p=>`<tr>
  <td style="font-family:monospace;font-size:.78rem">${escHtml(p.permission)}</td>
  <td><span class="badge ${p.classification}">${p.classification.toUpperCase()}</span></td>
  <td>${escHtml(p.justification||'—')}</td>
  <td style="color:#00d4ff">${escHtml(p.remediation||'—')}</td>
</tr>`).join('')}</tbody></table>

<h2>📡 Trackers (${trackers.filter(t=>t.isTracker).length} actifs)</h2>
<table><thead><tr><th>Librairie</th><th>Tracker</th><th>Catégorie</th><th>Confiance</th></tr></thead>
<tbody>${trackers.map(t=>`<tr>
  <td style="font-family:monospace;font-size:.78rem">${escHtml(t.library)}</td>
  <td class="${t.isTracker?'tracker-yes':'tracker-no'}">${t.isTracker?'⚠ OUI':'✓ NON'}</td>
  <td>${escHtml(t.category||'—')}</td>
  <td>${escHtml(t.confidence||'—')}</td>
</tr>`).join('')}</tbody></table>

<h2>💾 Stockage (${storage.length} findings)</h2>
<table><thead><tr><th>Localisation</th><th>Pattern</th><th>Risque</th><th>Remédiation</th></tr></thead>
<tbody>${storage.map(s=>`<tr>
  <td style="font-family:monospace;font-size:.78rem">${escHtml(s.location)}</td>
  <td>${escHtml(s.pattern)}</td>
  <td><span class="badge ${s.riskLevel}">${s.riskLevel.toUpperCase()}</span></td>
  <td style="color:#00d4ff">${escHtml(s.remediation||'—')}</td>
</tr>`).join('')}</tbody></table>

<h2>💡 Recommandations (${recommendations.length})</h2>
${recommendations.map(r=>`<div class="rec">
  <div class="rec-p ${r.priority}">${r.priority} — ${escHtml(r.category)}</div>
  <div style="font-weight:700;margin-bottom:4px">${r.icon} ${escHtml(r.title)}</div>
  <div style="color:#94a3b8;font-size:.85rem;margin-bottom:6px">${escHtml(r.description)}</div>
  <div style="color:#00d4ff;font-size:.82rem;border-left:2px solid #00d4ff;padding-left:8px">→ ${escHtml(r.action)}</div>
</div>`).join('')}
</body></html>`;
}

// ── HELPERS ───────────────────────────────────────────────────────────────
function classBadge(cls) {
  const map = {
    risky:     '🚨 Risqué',
    sensitive: '⚠️ Sensible',
    excessive: '📌 Excessif',
    necessary: '✅ Nécessaire',
    unknown:   '❓ Inconnu'
  };
  return `<span class="badge badge-${cls || 'unknown'}">${map[cls] || cls}</span>`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function showToast(msg, type = '') {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    background:${type === 'error' ? '#ef4444' : '#10b981'};color:white;
    padding:12px 20px;border-radius:8px;font-size:.9rem;font-weight:600;
    box-shadow:0 4px 20px rgba(0,0,0,0.4);
    animation:fadeIn 0.3s ease;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ── CHATBOT WIDGET ─────────────────────────────────────────────────────────
const chatWidget = document.getElementById('chat-widget');
const chatToggleBtn = document.getElementById('chat-toggle-btn');
const chatWindow = document.getElementById('chat-window');
const chatCloseBtn = document.getElementById('chat-close-btn');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');

chatToggleBtn.addEventListener('click', () => {
  chatWindow.classList.toggle('hidden');
});

chatCloseBtn.addEventListener('click', () => {
  chatWindow.classList.add('hidden');
});

chatSendBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});

async function sendChatMessage() {
  const msg = chatInput.value.trim();
  if (!msg || !currentReport) return;

  // Add user message
  appendChatMsg(msg, 'user-msg');
  chatInput.value = '';
  chatInput.disabled = true;
  chatSendBtn.disabled = true;

  // Add loading
  const loadingId = 'loading-' + Date.now();
  appendChatMsg('...', 'ai-msg', loadingId);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        report: currentReport.report,
        message: msg,
        apiKey: document.getElementById('api-key-input') ? document.getElementById('api-key-input').value.trim() : ''
      })
    });
    
    document.getElementById(loadingId).remove();
    
    if (!res.ok) throw new Error('Erreur API Chat');
    const data = await res.json();
    appendChatMsg(data.text, 'ai-msg');
  } catch (err) {
    if(document.getElementById(loadingId)) document.getElementById(loadingId).remove();
    appendChatMsg('Désolé, une erreur s\'est produite.', 'ai-msg');
  } finally {
    chatInput.disabled = false;
    chatSendBtn.disabled = false;
    chatInput.focus();
  }
}

function appendChatMsg(text, type, id = null) {
  const div = document.createElement('div');
  div.className = `chat-msg ${type}`;
  if (id) div.id = id;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
