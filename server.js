require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { analyzeApk } = require('./src/orchestrator');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.apk') || file.mimetype === 'application/vnd.android.package-archive') {
      cb(null, true);
    } else {
      cb(new Error('Only .apk files are allowed'));
    }
  }
});

// SSE job store
const jobs = new Map();

app.post('/api/analyze', upload.single('apk'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No APK file uploaded' });

  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const { profile = 'OTHER', apiKey } = req.body;

  jobs.set(jobId, { status: 'running', progress: [], result: null, error: null });

  // Run analysis asynchronously
  analyzeApk(req.file.buffer, req.file.originalname, profile, apiKey || process.env.GEMINI_API_KEY, (step) => {
    const job = jobs.get(jobId);
    if (job) job.progress.push(step);
  }).then(result => {
    const job = jobs.get(jobId);
    if (job) { job.status = 'done'; job.result = result; }
  }).catch(err => {
    const job = jobs.get(jobId);
    if (job) { job.status = 'error'; job.error = err.message; }
  });

  res.json({ jobId });
});

app.get('/api/job/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// SSE progress stream
app.get('/api/job/:id/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let lastIdx = 0;
  const interval = setInterval(() => {
    const job = jobs.get(req.params.id);
    if (!job) { clearInterval(interval); res.end(); return; }

    while (lastIdx < job.progress.length) {
      res.write(`data: ${JSON.stringify({ type: 'progress', message: job.progress[lastIdx] })}\n\n`);
      lastIdx++;
    }

    if (job.status === 'done') {
      res.write(`data: ${JSON.stringify({ type: 'done', result: job.result })}\n\n`);
      clearInterval(interval);
      res.end();
      setTimeout(() => jobs.delete(req.params.id), 60000);
    } else if (job.status === 'error') {
      res.write(`data: ${JSON.stringify({ type: 'error', message: job.error })}\n\n`);
      clearInterval(interval);
      res.end();
    }
  }, 300);

  req.on('close', () => clearInterval(interval));
});

// CHATBOT ENDPOINT
app.post('/api/chat', async (req, res) => {
  const { report, message, apiKey } = req.body;
  if (!report || !message) return res.status(400).json({ error: 'Missing report or message' });

  try {
    const { chatWithReport } = require('./src/module2/llmClient');
    const responseText = await chatWithReport(report, message, apiKey || process.env.GEMINI_API_KEY);
    res.json({ text: responseText });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Failed to chat with AI' });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

app.listen(PORT, () => {
  console.log(`\n🔒 Privacy Posture Analyzer`);
  console.log(`   Running at http://localhost:${PORT}\n`);
});
