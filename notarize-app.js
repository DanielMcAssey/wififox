const { notarize } = require('electron-notarize');
const fs = require('fs');
const process = require('process');
const pkgJson = require('./electron-builder.json');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  // Only notarize on Mac
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  await fs.promises.access(appPath);

  if (process.env.APPLE_ID && process.env.APPLE_ID_PASSWORD && process.env.TEAM_ID) {
    console.log(`Notarizing ${appPath} with user & password`);

    return await notarize({
      tool: 'notarytool',
      appBundleId: pkgJson.appId,
      appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
      teamId: process.env.TEAM_ID
    });
  } else if (process.env.API_KEY_FILE && process.env.API_KEY_ID && process.env.API_KEY_ISSUER_ID) {
    console.log(`Notarizing ${appPath} with API key`);

    return await notarize({
      tool: 'notarytool',
      appBundleId: pkgJson.appId,
      appPath,
      appleApiKey: process.env.API_KEY_FILE,
      appleApiKeyId: process.env.API_KEY_ID,
      appleApiIssuer: process.env.API_KEY_ISSUER_ID
    });
  }

  console.log('Skipping notarization');
};
