const spawn = require('child_process').spawn

const spawnArp = () => {
  const process = spawn('arp', ['-a'])
  let buffer = '';
  process.stdout.on('data', (data) => {
    buffer += data
  });

  return new Promise((resolve, reject) => {
    process.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('arp exited with code ' + code));
      }
      resolve(buffer);
    })
  })
}

const listLinuxMACs = async (gatewayIP) => {
  const buffer = await spawnArp();
  const lines = buffer.split('\n').slice(2)
  return lines
      .map(line => {
        const parts = line.split(' ').filter(x => x.length > 0);
        if (parts[0] === gatewayIP) {
            return undefined;
        }

        return parts.length === 5 ? parts[2] : parts[1];
      })
      .filter(mac => !!mac);
}

const listWindowsMACs = async (gatewayIP, targetIP) => {
  const buffer = (await spawnArp()).trim();
  const groups = buffer.split('Interface: ')
      .filter(group => group.length > 0)
      .map(group => {
        return group.trim();
      });

  const foundLines = [];
  for (const group of groups) {
      const groupLines = group.split('\r\n');
      if (groupLines.length > 0 && groupLines[0].startsWith(targetIP)) {
          foundLines.push(...groupLines.slice(1));
      }
  }

  return foundLines
      .filter(line => line.length > 0)
      .map(line => {
        if (line.length === 0) {
          return;
        }

        const parts = line.split(' ').filter(x => x.length > 0);
        if (parts[0] === gatewayIP) {
            return undefined;
        }

        return parts[1].replace(/-/g, ':');
      })
      .filter(mac => !!mac);
}

const listDarwinMACs = async (gatewayIP) => {
  const buffer = await spawnArp()
  const lines = buffer.split('\n').slice(0, -1)
  return lines
      .map(line => {
        const parts = line.split(' ').filter(x => x.length > 0);
        if (parts[1].slice(1, -1) === gatewayIP) {
            return undefined;
        }
        return parts[3].replace(/^0:/g, '00:').replace(/:0:/g, ':00:').replace(/:0$/g, ':00').replace(/:([^:]{1}):/g, ':0$1:')
      })
      .filter(mac => mac && mac !== '(incomplete)')
}

module.exports.listMACs = (gatewayIP, targetIP) => {
  if (process.platform.indexOf('linux') === 0) {
    return listLinuxMACs(gatewayIP);
  } else if (process.platform.indexOf('win') === 0) {
    return listWindowsMACs(gatewayIP, targetIP);
  } else if (process.platform.indexOf('darwin') === 0) {
    return listDarwinMACs(gatewayIP);
  }
}
