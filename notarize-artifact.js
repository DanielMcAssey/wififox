const { notarize } = require('electron-notarize');
const fs = require('fs');
const process = require('process');
const pkgJson = require('./electron-builder.json');

exports.default = async function notarizingArtifacts(context) {
  const { file, target, packager } = context;

  // Only notarize on Mac, dont notarize dmg or zip files or MAS files (which have no target)
  if (packager.platform.nodeName !== 'darwin' || !target || file.endsWith('.blockmap') || target.name === 'zip' || target.name === 'dmg') {
    return;
  }

  await fs.promises.access(file);

  if (process.env.APPLE_ID && process.env.APPLE_ID_PASSWORD && process.env.TEAM_ID) {
    console.log(`Notarizing ${file} with user & password`);

    return await notarize({
      tool: 'notarytool',
      appBundleId: pkgJson.appId,
      appPath: file,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
      teamId: process.env.TEAM_ID
    });
  } else if (process.env.API_KEY_FILE && process.env.API_KEY_ID && process.env.API_KEY_ISSUER_ID) {
    console.log(`Notarizing ${file} with API key`);

    return await notarize({
      tool: 'notarytool',
      appBundleId: pkgJson.appId,
      appPath: file,
      appleApiKey: process.env.API_KEY_FILE,
      appleApiKeyId: process.env.API_KEY_ID,
      appleApiIssuer: process.env.API_KEY_ISSUER_ID
    });
  }

  console.log(`Skipping notarization of ${file}`);
};
