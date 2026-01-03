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

When your node starts, it uses a multi-phase bootstrap strategy to find peers. By default, it skips directly to DHT discovery, which is simple and works everywhere. If you want faster initial discovery on your network, you can opt into IPv4 scanning.

**Phase 1: Cached Peers** - If peer caching is enabled, the node will first try to reconnect to peers it has seen before. On startup, if any of these cached peers are still online, connection happens instantly without waiting for discovery. This is only used if you explicitly enable PEER_CACHE_ENABLED. Cached peers older than 24 hours are automatically pruned as stale.

**Phase 2: IPv4 Address Space Scan (Optional)** - If you enable ENABLE_IPV4_SCAN, the node will perform an intelligent scan of the IPv4 address space looking for other Hypermind nodes on your configured port. Instead of scanning sequentially (which would take forever), it uses a Feistel cipher to generate a randomized enumeration of addresses, with each node getting a unique scan order to distribute the search load evenly. This scan times out after a configurable duration before moving on. This feature is disabled by default and must be explicitly enabled if you want it.

**Phase 3: DHT Discovery** - The node joins the Hyperswarm DHT under the topic 'hypermind-lklynet-v1' and waits for peers. This always works eventually and is the default discovery mechanism for all nodes. It may take longer on initial startup without the optional IPv4 scan, but it is completely reliable.


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
| `ENABLE_IPV4_SCAN` | `false` | Enable IPv4 address space scanning for peer discovery. Disabled by default. Set to `true` to scan the entire IPv4 Network for Hypermind nodes. Most users should leave this disabled and rely on DHT discovery. |
| `SCAN_PORT` | `3000` | The port to scan on remote IPv4 addresses when IPv4 scanning is enabled. This should match the port other nodes are listening on. |
| `BOOTSTRAP_TIMEOUT` | `10000` | Time in milliseconds to spend scanning the IPv4 address space before giving up and using DHT discovery. Only used if ENABLE_IPV4_SCAN is true. Set to 0 to skip scanning and go straight to DHT. |
| `PEER_CACHE_ENABLED` | `false` | Enable or disable the peer cache feature. Set to `true` to cache discovered peers for faster reconnection on restart. Cache is disabled by default. |
| `PEER_CACHE_PATH` | `./peers.json` | Path to the JSON file where discovered peers are cached (only used if PEER_CACHE_ENABLED is true). |
| `PEER_CACHE_MAX_AGE` | `86400` | Maximum age in seconds for cached peers before they are considered stale and removed. Default is 24 hours. Only applies when cache is enabled. |
| `BOOTSTRAP_PEER_IP` | (unset) | Debug mode: Set this to an IPv4 address to skip all bootstrap phases and connect directly to that peer. Useful for testing and scenarios where you know peer addresses in advance. |

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

**Q: Should I enable IPv4 scanning?**
A: Probably not. DHT discovery works fine and doesn't require any special configuration. IPv4 scanning is there if you want extremely slow initial peer discovery or if you hate your IP's reputation, but it is not necessary for the network to function. Most deployments should just leave it disabled and let DHT do its thing.

**Q: Why did you make this?**
A: The homelab must grow. ¯\\_(ツ)_/¯