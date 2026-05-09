const xml2js = require('xml2js');

// Known dangerous/sensitive permissions
const PERMISSION_META = {
  'android.permission.ACCESS_FINE_LOCATION':      { level: 'dangerous', risk: 'high' },
  'android.permission.ACCESS_COARSE_LOCATION':    { level: 'dangerous', risk: 'medium' },
  'android.permission.ACCESS_BACKGROUND_LOCATION':{ level: 'dangerous', risk: 'high' },
  'android.permission.CAMERA':                    { level: 'dangerous', risk: 'high' },
  'android.permission.RECORD_AUDIO':              { level: 'dangerous', risk: 'high' },
  'android.permission.READ_CONTACTS':             { level: 'dangerous', risk: 'high' },
  'android.permission.WRITE_CONTACTS':            { level: 'dangerous', risk: 'high' },
  'android.permission.READ_CALL_LOG':             { level: 'dangerous', risk: 'high' },
  'android.permission.READ_SMS':                  { level: 'dangerous', risk: 'high' },
  'android.permission.SEND_SMS':                  { level: 'dangerous', risk: 'high' },
  'android.permission.READ_PHONE_STATE':          { level: 'dangerous', risk: 'medium' },
  'android.permission.READ_EXTERNAL_STORAGE':     { level: 'dangerous', risk: 'medium' },
  'android.permission.WRITE_EXTERNAL_STORAGE':    { level: 'dangerous', risk: 'medium' },
  'android.permission.BODY_SENSORS':              { level: 'dangerous', risk: 'high' },
  'android.permission.PROCESS_OUTGOING_CALLS':    { level: 'dangerous', risk: 'high' },
  'android.permission.USE_BIOMETRIC':             { level: 'dangerous', risk: 'high' },
  'android.permission.BLUETOOTH_SCAN':            { level: 'dangerous', risk: 'medium' },
  'android.permission.BLUETOOTH_CONNECT':         { level: 'dangerous', risk: 'medium' },
  'android.permission.INTERNET':                  { level: 'normal',    risk: 'low' },
  'android.permission.VIBRATE':                   { level: 'normal',    risk: 'low' },
  'android.permission.RECEIVE_BOOT_COMPLETED':    { level: 'normal',    risk: 'low' },
  'android.permission.FOREGROUND_SERVICE':        { level: 'normal',    risk: 'low' },
  'android.permission.WAKE_LOCK':                 { level: 'normal',    risk: 'low' },
  'android.permission.ACCESS_NETWORK_STATE':      { level: 'normal',    risk: 'low' },
  'android.permission.ACCESS_WIFI_STATE':         { level: 'normal',    risk: 'low' },
};

async function parseManifest(apkData) {
  if (!apkData.hasManifest) {
    return { packageName: null, versionName: null, permissions: [], exportedComponents: [] };
  }

  const manifestBuffer = await apkData.getFile('AndroidManifest.xml');
  if (!manifestBuffer) return emptyManifest();

  // Detect if binary AXML or text XML
  const magic = manifestBuffer.readUInt32LE(0);
  if (magic === 0x00080003) {
    // Binary AXML — parse string pool
    return parseBinaryManifest(manifestBuffer);
  } else {
    // Text XML
    return parseTextManifest(manifestBuffer.toString('utf8'));
  }
}

async function parseTextManifest(xmlString) {
  try {
    const parser = new xml2js.Parser({ explicitArray: true, mergeAttrs: false });
    const result = await parser.parseStringPromise(xmlString);
    const manifest = result.manifest || result['ns2:manifest'] || result;

    const attrs = manifest.$ || {};
    const packageName = attrs.package || null;
    const versionName = attrs['android:versionName'] || attrs['platformBuildVersionName'] || null;

    // Extract permissions
    const permissions = [];
    const uses_permissions = manifest['uses-permission'] || [];
    for (const perm of uses_permissions) {
      const name = (perm.$ || {})['android:name'];
      if (name) {
        const meta = PERMISSION_META[name] || { level: 'unknown', risk: 'unknown' };
        permissions.push({
          name,
          protectionLevel: meta.level,
          riskLevel: meta.risk,
          isCustom: !name.startsWith('android.permission.')
        });
      }
    }

    // Extract exported components
    const exportedComponents = [];
    const componentTypes = ['activity', 'service', 'receiver', 'provider'];
    const appNode = (manifest.application || [{}])[0];

    for (const type of componentTypes) {
      const components = appNode[type] || [];
      for (const comp of components) {
        const a = comp.$ || {};
        const isExported = a['android:exported'] === 'true';
        const hasIntentFilter = !!(comp['intent-filter'] && comp['intent-filter'].length > 0);
        if (isExported || hasIntentFilter) {
          exportedComponents.push({
            name: a['android:name'] || 'Unknown',
            type: type.toUpperCase(),
            isExported,
            hasPermission: !!(a['android:permission']),
            intentFilters: extractIntentFilters(comp['intent-filter'] || [])
          });
        }
      }
    }

    return { packageName, versionName, permissions, exportedComponents };
  } catch {
    return emptyManifest();
  }
}

function extractIntentFilters(filters) {
  const actions = [];
  for (const f of filters) {
    const acts = f.action || [];
    for (const a of acts) {
      const name = (a.$ || {})['android:name'];
      if (name) actions.push(name);
    }
  }
  return actions;
}

function parseBinaryManifest(buffer) {
  // Extract string pool from binary AXML
  const strings = extractAxmlStrings(buffer);
  if (!strings) return emptyManifest();

  // Extract permissions: strings matching android.permission.*
  const permNames = strings.filter(s => s && s.startsWith('android.permission.') && s.length > 20);
  const permissions = [...new Set(permNames)].map(name => {
    const meta = PERMISSION_META[name] || { level: 'unknown', risk: 'unknown' };
    return { name, protectionLevel: meta.level, riskLevel: meta.risk, isCustom: false };
  });

  // Try to find package name (typically a reverse domain string)
  const packageName = strings.find(s => s && /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/.test(s)) || null;

  return { packageName, versionName: null, permissions, exportedComponents: [] };
}

function extractAxmlStrings(buffer) {
  try {
    // AXML magic: 0x00080003
    if (buffer.readUInt32LE(0) !== 0x00080003) return null;

    let offset = 8;
    while (offset < buffer.length - 8) {
      const chunkType = buffer.readUInt16LE(offset);
      const headerSize = buffer.readUInt16LE(offset + 2);
      const chunkSize = buffer.readUInt32LE(offset + 4);

      if (chunkType === 0x0001) { // STRING_POOL_TYPE
        const stringCount = buffer.readUInt32LE(offset + 8);
        const flags = buffer.readUInt32LE(offset + 16);
        const stringsStart = buffer.readUInt32LE(offset + 20);
        const isUtf8 = (flags & 0x100) !== 0;

        const offsetsBase = offset + headerSize;
        const stringsBase = offset + stringsStart;
        const strings = [];

        for (let i = 0; i < stringCount; i++) {
          try {
            const strOffset = buffer.readUInt32LE(offsetsBase + i * 4);
            const strStart = stringsBase + strOffset;

            if (isUtf8) {
              let pos = strStart;
              // UTF-16 char count (may be 1 or 2 bytes)
              let charLen = buffer.readUInt8(pos);
              pos += (charLen & 0x80) ? 2 : 1;
              // Byte count (may be 1 or 2 bytes)
              let byteLen = buffer.readUInt8(pos);
              pos += (byteLen & 0x80) ? 2 : 1;
              byteLen &= 0x7F;
              strings.push(buffer.toString('utf8', pos, pos + byteLen));
            } else {
              const charLen = buffer.readUInt16LE(strStart);
              if (charLen > 0 && charLen < 1000) {
                strings.push(buffer.toString('utf16le', strStart + 2, strStart + 2 + charLen * 2));
              }
            }
          } catch { strings.push(''); }
        }
        return strings;
      }

      if (chunkSize <= 0 || chunkSize > buffer.length) break;
      offset += chunkSize;
    }
    return null;
  } catch { return null; }
}

function emptyManifest() {
  return { packageName: null, versionName: null, permissions: [], exportedComponents: [] };
}

module.exports = { parseManifest };
