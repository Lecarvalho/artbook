import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allowedHost, lanAddresses, cookieKey, keyMatches, loadAccessKey, isPrivateV4 } from '../network-access.mjs';
import { makeApp } from '../server.mjs';

test('host, address, cookie and key helpers', async t => {
  assert.equal(allowedHost('127.0.0.1:4317'), true);
  assert.equal(allowedHost('192.168.1.5:4317'), false, 'LAN hosts are refused unless network mode is on');
  assert.equal(allowedHost('192.168.1.5:4317', { network: true, addresses: ['192.168.1.5'] }), true);
  assert.equal(allowedHost('192.168.1.9:4317', { network: true, addresses: ['192.168.1.5'] }), false, 'only this computer’s own addresses');
  assert.equal(allowedHost('evil.example:4317', { network: true, addresses: ['192.168.1.5'] }), false, 'names are refused (DNS rebinding)');
  assert.deepEqual(lanAddresses({ eth: [{ family: 'IPv4', internal: false, address: '192.168.0.20' }, { family: 'IPv4', internal: false, address: '8.8.8.8' }], lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }] }), ['192.168.0.20']);
  assert.equal(isPrivateV4('172.20.1.1'), true); assert.equal(isPrivateV4('172.40.1.1'), false);
  assert.equal(cookieKey('a=1; artbook_key=abc; b=2'), 'abc');
  assert.equal(keyMatches('abc', 'abc'), true); assert.equal(keyMatches('abd', 'abc'), false); assert.equal(keyMatches(null, 'abc'), false);
  const dir = await mkdtemp(join(tmpdir(), 'artbook-key-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = await loadAccessKey(dir);
  assert.match(key, /^[\w-]{20,}$/);
  assert.equal(await loadAccessKey(dir), key, 'the key is stable across restarts');
  assert.equal((await readFile(join(dir, 'access-key.txt'), 'utf8')).trim(), key);
});

test('network mode accepts this computer’s LAN address as host; local mode refuses it', async t => {
  const dirs = [];
  const start = async options => {
    const dir = await mkdtemp(join(tmpdir(), 'artbook-net-')); dirs.push(dir);
    const server = await makeApp({ dataDir: dir, ...options });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return server;
  };
  const get = (server, host) => new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port: server.address().port, path: '/api/styles', headers: { Host: host } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject));
  const local = await start({});
  const shared = await start({ network: true, accessKey: 'k'.repeat(24), addresses: () => ['192.168.1.5'] });
  t.after(async () => { for (const s of [local, shared]) await new Promise(r => s.close(r)); for (const d of dirs) await rm(d, { recursive: true, force: true }); });
  assert.equal(await get(local, `192.168.1.5:${local.address().port}`), 403);
  assert.equal(await get(shared, `192.168.1.5:${shared.address().port}`), 200, 'loopback clients need no key');
  assert.equal(await get(shared, `192.168.1.9:${shared.address().port}`), 403);
});

test('only real network adapters are shown in the share link', async () => {
  const { displayLanAddresses } = await import('../network-access.mjs');
  const v4 = address => [{ family: 'IPv4', internal: false, address }];
  assert.deepEqual(displayLanAddresses({ 'vEthernet (WSL)': v4('172.19.64.1'), NordLynx: v4('10.5.0.2'), Ethernet: v4('192.168.1.20') }), ['192.168.1.20']);
  assert.deepEqual(displayLanAddresses({ 'vEthernet (WSL)': v4('172.19.64.1') }), ['172.19.64.1'], 'falls back to any private address');
});
