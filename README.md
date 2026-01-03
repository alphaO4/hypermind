<p align="center">
  <img src="hypermind2.svg" width="150" alt="Hypermind Logo" />
</p>

# Hypermind

### The High-Availability Solution to a Problem That Doesn't Exist.

**Hypermind** is a completely decentralized, Peer-to-Peer deployment counter.

It solves the critical infrastructure challenge of knowing exactly how many other people are currently wasting 50MB of RAM running this specific container.

---

## What is this?

You have a server rack in your basement. You have 128GB of RAM. You have deployed the Arr stack, Home Assistant, Pi-hole, and a dashboard to monitor them all. **But you crave more.**

You need a service that:

1. Does absolutely nothing useful.
2. Uses "Decentralized" and "P2P" in the description.
3. Makes a number go up on a screen.

**Enter Hypermind.**

There is no central server. There is no database. There is only **The Swarm**.

## How it works (The Over-Engineering)

We utilize the **Hyperswarm** DHT (Distributed Hash Table) to achieve a singular, trivial goal of **Counting.**

1. **Discovery:** Your node screams into the digital void (`hypermind-lklynet-v1`) to find friends.
2. **Gossip:** Nodes connect and whisper "I exist" to each other.
3. **Consensus:** Each node maintains a list of peers seen in the last 2.5 seconds.

If you turn your container off, you vanish from the count. If everyone turns it off, the network ceases to exist. If you turn it back on, you are the Creator of the Universe (Population: 1).

### Peer Bootstrap Strategy

When your node starts, it uses a three-phase bootstrap strategy to find peers faster than waiting for DHT discovery alone:

**Phase 1: Cached Peers** - If peer caching is enabled, on first run there are none, but after the node finds a peer, it saves that peer's address to a local cache file. On subsequent restarts, it attempts to reconnect to these known peers immediately. This makes restarts nearly instant if any cached peer is still online. Caching is disabled by default but can be enabled with the PEER_CACHE_ENABLED environment variable.

**Phase 2: IPv4 Address Space Scan** - If cached peers are unavailable, the node performs a smart scan of the IPv4 address space looking for other Hypermind instances listening on the configured port. Rather than scanning sequentially (which would take weeks), it uses a Feistel cipher with a random seed to generate a deterministic but randomized enumeration of all 4 billion addresses. Each node gets a unique scan order, distributing the search load evenly across the network. This phase times out after a configurable duration (default 10 seconds) before falling back to DHT.

**Phase 3: DHT Fallback** - After the scan timeout, the node joins the Hyperswarm DHT and waits for peers to discover it or for it to discover peers through the DHT. This always works eventually, but may take a bit longer on first startup.

When peer caching is enabled, peer information is stored in a versioned JSON cache file for long-term persistence across restarts, and cached peers older than 24 hours are automatically pruned to avoid stale entries.


## Deployment

### Docker (The Fast Way)

Since you're probably pasting this into Portainer anyway:

```bash
docker run -d \
  --name hypermind \
  --network host \
  --restart unless-stopped \
  -e PORT=3000 \
  ghcr.io/lklynet/hypermind:latest

```

> **⚠️ CRITICAL NETWORK NOTE:**
> Use `--network host`. This is a P2P application that needs to punch through NATs. If you bridge it, the DHT usually fails, and you will be the loneliest node in the multiverse.
>
> If you need to change the port (default 3000), update the `PORT` environment variable. Since `--network host` is used, this port will be opened directly on the host.

### Docker Compose (The Classy Way)

Add this to your `docker-compose.yml` to permanently reserve system resources for no reason:

```yaml
services:
  hypermind:
    image: ghcr.io/lklynet/hypermind:latest
    container_name: hypermind
    network_mode: host
    restart: unless-stopped
    environment:
      - PORT=3000

```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | The port the web dashboard listens on. Since `--network host` is used, this port opens directly on the host. |
| `MAX_PEERS` | `10000` | Maximum number of peers to track in the swarm. Unless you're expecting the entire internet to join, the default is probably fine. |
| `SCAN_PORT` | `3000` | The port to scan on remote IPv4 addresses when looking for bootstrap peers. This should match the port other nodes are listening on. |
| `BOOTSTRAP_TIMEOUT` | `10000` | Time in milliseconds to spend scanning the IPv4 address space before giving up and using DHT discovery. Set to 0 to skip scanning entirely and go straight to DHT. |
| `PEER_CACHE_ENABLED` | `false` | Enable or disable the peer cache feature. Set to `true` to cache discovered peers for faster reconnection on restart. Cache is disabled by default. |
| `PEER_CACHE_PATH` | `./peers.json` | Path to the JSON file where discovered peers are cached (only used if PEER_CACHE_ENABLED is true). |
| `PEER_CACHE_MAX_AGE` | `86400` | Maximum age in seconds for cached peers before they are considered stale and removed. Default is 24 hours. Only applies when cache is enabled. |
| `BOOTSTRAP_PEER_IP` | (unset) | Debug mode: Set this to an IPv4 address to skip all bootstrap phases and connect directly to that peer. Useful for testing and docker-compose scenarios where you know peer addresses in advance. |

## Usage

Open your browser to: `http://localhost:3000`

The dashboard updates in **Realtime** via Server-Sent Events.

**You will see:**

* **Active Nodes:** The total number of people currently running this joke.
* **Direct Connections:** The number of peers your node is actually holding hands with.

## Local Development

Want to contribute? Why? It already does nothing perfectly. But here is how anyway:

```bash
# Install dependencies
npm install

# Run the beast
npm start

```

### Simulating Friends (Local Testing)

You can run multiple instances locally to simulate popularity:

```bash
# Terminal 1 (You)
PORT=3000 npm start

# Terminal 2 (Your imaginary friend)
PORT=3001 npm start

```

They should discover each other via DHT, and the number will become 2. Dopamine achieved.

### Fast Bootstrap Testing

For testing scenarios where you want to skip the IPv4 scan and immediately use DHT discovery:

```bash
BOOTSTRAP_TIMEOUT=0 npm start
```

Or if you know the exact IP of another node (useful in docker-compose or test environments):

```bash
BOOTSTRAP_PEER_IP=192.168.1.100 npm start
```

This connects directly to that peer, skipping all bootstrap phases. If the connection fails, it falls back to normal bootstrap automatically.

---

### FAQ

**Q: Is this crypto mining?**
A: No. We respect your GPU too much.

**Q: Does this store data?**
A: No. It has the memory span of a goldfish (approx. 2.5 seconds).

**Q: Why did you make this?**
A: The homelab must grow. ¯\\_(ツ)_/¯