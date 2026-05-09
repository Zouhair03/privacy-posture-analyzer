const JSZip = require('jszip');

async function parseApk(buffer) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (err) {
    throw new Error(`APK invalide ou corrompu: ${err.message}`);
  }

  const files = Object.keys(zip.files);

  return {
    zip,
    files,
    hasManifest: files.includes('AndroidManifest.xml'),
    hasDex: files.some(f => f.endsWith('.dex')),
    hasResources: files.includes('resources.arsc'),
    fileCount: files.length,

    async getFile(name) {
      const entry = zip.files[name];
      if (!entry) return null;
      return entry.async('nodebuffer');
    },

    async getTextFile(name) {
      const entry = zip.files[name];
      if (!entry) return null;
      return entry.async('string');
    },

    getFileList() {
      return files;
    }
  };
}

module.exports = { parseApk };
