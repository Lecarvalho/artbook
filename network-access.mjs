// Opt-in access from other devices on the home network. Off by default: Artbook normally answers only this computer.
// When enabled, requests from other devices must carry the access key (once via ?key=, then a cookie).
import { networkInterfaces } from 'node:os';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';

const PRIVATE_V4 = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./];
export const isPrivateV4 = address => PRIVATE_V4.some(pattern => pattern.test(address));

// This computer's addresses on private (home/office) networks.
export function lanAddresses(interfaces = networkInterfaces()) {
  return Object.values(interfaces).flat().filter(i => i && i.family === 'IPv4' && !i.internal && isPrivateV4(i.address)).map(i => i.address);
}

const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/;
// Host header check (DNS-rebinding guard): loopback always; this computer's private LAN addresses only in network mode.
export function allowedHost(host, { network = false, addresses = [] } = {}) {
  if (LOOPBACK_HOST.test(host || '')) return true;
  if (!network) return false;
  const match = (host || '').match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  return !!match && addresses.includes(match[1]);
}

export const isLoopbackClient = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);

const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function cookieKey(cookieHeader = '') {
  return cookieHeader.split(';').map(part => part.trim().split('=')).find(([name]) => name === 'artbook_key')?.[1] || null;
}
export const keyMatches = (candidate, key) => same(candidate, key);

// A stable random key kept next to the library so bookmarked links keep working across restarts.
export async function loadAccessKey(dataDir) {
  const file = join(dataDir, 'access-key.txt');
  try { const key = (await readFile(file, 'utf8')).trim(); if (/^[\w-]{20,}$/.test(key)) return key; } catch {}
  const key = randomBytes(18).toString('base64url');
  await writeFile(file, key + '\n');
  return key;
}

// Addresses worth showing to the user: skip virtual adapters (WSL, Hyper-V, Docker, VMs) and VPN tunnels.
const VIRTUAL = /vEthernet|WSL|Hyper-V|Default Switch|VirtualBox|VMware|Docker|NordLynx|VPN|WireGuard|TAP|Tailscale|ZeroTier|Loopback/i;
export function displayLanAddresses(interfaces = networkInterfaces()) {
  const preferred = Object.entries(interfaces).filter(([name]) => !VIRTUAL.test(name)).flatMap(([, list]) => list)
    .filter(i => i && i.family === 'IPv4' && !i.internal && isPrivateV4(i.address)).map(i => i.address);
  return preferred.length ? preferred : lanAddresses(interfaces);
}
