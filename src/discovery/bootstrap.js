const fs = require('fs');
const net = require('net');
const { createFeistelGenerator, ipv4ToString } = require('./feistel');
const {
  SCAN_PORT,
  BOOTSTRAP_TIMEOUT,
  PEER_CACHE_ENABLED,
  PEER_CACHE_PATH,
  PEER_CACHE_MAX_AGE,
  BOOTSTRAP_PEER_IP,
} = require('../config/constants');

/**
 * Bootstrap coordinator for Hypermind peer discovery.
 * 
 * Trys:
 * 1. Load and retry cached peers (fast, zero network overhead)
 * 2. Scan IPv4 address space via Feistel-permuted addresses until first peer found
 * 3. Fall back to Hyperswarm DHT discovery after BOOTSTRAP_TIMEOUT expires
 * 
 * Peer cache is stored as versioned JSON
 */

/**
 * Load peer cache from disk, validate format, and prune stale entries.
 * @returns {Array<Object>} Array of {ip, port, id, lastSeen} objects
 */
function loadPeerCache() {
  if (!PEER_CACHE_ENABLED) {
    return [];
  }

  try {
    if (!fs.existsSync(PEER_CACHE_PATH)) {
      return [];
    }

    const data = JSON.parse(fs.readFileSync(PEER_CACHE_PATH, 'utf8'));

    // Support versioned format
    const peers = data.version ? data.peers : data;

    if (!Array.isArray(peers)) {
      console.warn(`[bootstrap] Invalid cache format, skipping`);
      return [];
    }

    // Prune stale entries
    const now = Date.now();
    const fresh = peers.filter((p) => {
      const age = (now - (p.lastSeen || 0)) / 1000;
      return age < PEER_CACHE_MAX_AGE;
    });

    if (fresh.length < peers.length) {
      console.log(`[bootstrap] Pruned ${peers.length - fresh.length} stale peers from cache`);
    }

    return fresh;
  } catch (err) {
    console.warn(`[bootstrap] Failed to load cache: ${err.message}`);
    return [];
  }
}

/**
 * Save peer cache to disk in versioned format.
 * @param {Array<Object>} peers - Array of peer objects
 */
function savePeerCache(peers) {
  if (!PEER_CACHE_ENABLED) {
    return;
  }

  try {
    const data = {
      version: 1,
      timestamp: Date.now(),
      peers: peers.slice(0, 100), // Keep only 100 most recent
    };

    fs.writeFileSync(PEER_CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[bootstrap] Saved ${peers.length} peers to cache`);
  } catch (err) {
    console.warn(`[bootstrap] Failed to save cache: ${err.message}`);
  }
}

/**
 * Attempt TCP connection to a peer with short timeout.
 * @param {string} ip - IPv4 address
 * @param {number} port - Port number
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<net.Socket|null>} Connected socket or null on failure
 */
async function tryConnectToPeer(ip, port, timeout = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, ip, () => {
      resolve(socket);
    });

    socket.setTimeout(timeout);
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
    socket.on('error', (err) => {
      socket.destroy();
      resolve(null);
    });
  });
}

/**
 * Retry cached peers from previous runs.
 * @returns {Promise<{ip: string, port: number, id: string}|null>} Connected peer or null
 */
async function retryCachedPeers() {
  const cached = loadPeerCache();

  if (cached.length === 0) {
    console.log(`[bootstrap] No cached peers available`);
    return null;
  }

  console.log(`[bootstrap] Attempting to reconnect to ${cached.length} cached peers...`);

  for (const peer of cached) {
    console.log(`[bootstrap] Trying cached peer ${peer.ip}:${peer.port}`);
    const socket = await tryConnectToPeer(peer.ip, peer.port, 500);

    if (socket) {
      socket.destroy();
      console.log(`[bootstrap] Successfully reconnected to cached peer ${peer.ip}`);
      return peer;
    }
  }

  console.log(`[bootstrap] All cached peers unreachable`);
  return null;
}

/**
 * Scan IPv4 address space via Feistel-permuted addresses.
 * Attempts TCP connection to each address on SCAN_PORT until first success.
 * 
 * @param {number} seed - Seed for Feistel permutation
 * @param {number} timeout - Overall timeout for scan (milliseconds)
 * @returns {Promise<{ip: string, port: number}|null>} First peer found or null
 */
async function scanIPv4Space(seed, timeout) {
  const generator = createFeistelGenerator(seed);
  const startTime = Date.now();
  let attempts = 0;
  const maxAttempts = 100000; // Limit to prevent infinite loops in testing

  console.log(
    `[bootstrap] Starting IPv4 scan on port ${SCAN_PORT} with ${timeout}ms timeout...`
  );

  while (attempts < maxAttempts) {
    if (Date.now() - startTime > timeout) {
      console.log(
        `[bootstrap] IPv4 scan timeout after ${attempts} attempts (${(
          (attempts / 0x100000000) *
          100
        ).toFixed(4)}% coverage)`
      );
      return null;
    }

    const { value: address } = generator.next();
    const ip = ipv4ToString(address);

    // Skip loopback, private, and multicast ranges for production scan
    // For testing/local dev, you might want to enable these
    if (shouldSkipAddress(ip)) {
      attempts++;
      continue;
    }

    attempts++;

    // Only attempt every Nth address to avoid overwhelming the network
    if (attempts % 100 !== 0) continue;

    const socket = await tryConnectToPeer(ip, SCAN_PORT, 500);

    if (socket) {
      socket.destroy();
      console.log(`[bootstrap] Found peer at ${ip}:${SCAN_PORT} after ${attempts} attempts`);
      return { ip, port: SCAN_PORT };
    }

    // Log progress every 10k addresses
    if (attempts % 10000 === 0) {
      const progress = (attempts / 0x100000000) * 100;
      const elapsed = (Date.now() - startTime) / 1000;
      console.log(`[bootstrap] Scan progress: ${progress.toFixed(4)}% (${elapsed.toFixed(1)}s)`);
    }
  }

  return null;
}

/**
 * Determine if an IPv4 address should be skipped during scan.
 * Skips reserved ranges to avoid unnecessary noise.
 * 
 * @param {string} ip - IPv4 address
 * @returns {boolean} true if address should be skipped
 */
function shouldSkipAddress(ip) {
  const parts = ip.split('.').map(Number);

  // Loopback (127.0.0.0/8)
  if (parts[0] === 127) return true;

  // Private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;

  // Link-local (169.254.0.0/16)
  if (parts[0] === 169 && parts[1] === 254) return true;

  // Multicast (224.0.0.0/4)
  if (parts[0] >= 224 && parts[0] <= 239) return true;

  // Reserved/experimental (240.0.0.0/4)
  if (parts[0] >= 240) return true;

  return false;
}

/**
 * Main bootstrap orchestrator: cached peers → IPv4 scan → DHT fallback.
 * 
 * This function coordinates the three-phase bootstrap strategy and is meant to be called
 * before swarm.start(). It returns immediately (non-blocking) but logs progress.
 * 
 * @param {number} seed - Random seed for Feistel permutation (e.g., process entropy)
 * @returns {Promise<void>}
 */
async function bootstrapPeers(seed) {
  console.log(`[bootstrap] Starting peer bootstrap with seed: ${seed.toString(16)}`);

  // Debug phase: Direct peer IP (skip cache and scan)
  if (BOOTSTRAP_PEER_IP) {
    console.log(`[bootstrap] DEBUG MODE: Attempting direct connection to ${BOOTSTRAP_PEER_IP}:${SCAN_PORT}`);
    const socket = await tryConnectToPeer(BOOTSTRAP_PEER_IP, SCAN_PORT, 2000);
    if (socket) {
      socket.destroy();
      console.log(`[bootstrap] Bootstrap complete: connected to debug peer ${BOOTSTRAP_PEER_IP}`);
      return { ip: BOOTSTRAP_PEER_IP, port: SCAN_PORT };
    }
    console.log(`[bootstrap] DEBUG: Failed to connect to ${BOOTSTRAP_PEER_IP}, falling back to normal bootstrap`);
  }

  // Phase 1: Retry cached peers
  const cachedPeer = await retryCachedPeers();
  if (cachedPeer) {
    console.log(`[bootstrap] Bootstrap complete: using cached peer ${cachedPeer.ip}`);
    return cachedPeer;
  }

  // Phase 2: Scan IPv4 space
  const scannedPeer = await scanIPv4Space(seed, BOOTSTRAP_TIMEOUT);
  if (scannedPeer) {
    // Save successful peer to cache for next time
    const peer = {
      ...scannedPeer,
      id: null, // Will be populated after successful handshake
      lastSeen: Date.now(),
    };
    savePeerCache([peer]);
    console.log(`[bootstrap] Bootstrap complete: found peer via IPv4 scan`);
    return peer;
  }

  // Phase 3: Fall back to DHT (Hyperswarm handles this automatically)
  console.log(`[bootstrap] No peers found via scan, falling back to DHT discovery`);
  return null;
}

module.exports = {
  bootstrapPeers,
  loadPeerCache,
  savePeerCache,
  retryCachedPeers,
  scanIPv4Space,
  tryConnectToPeer,
  shouldSkipAddress,
};
