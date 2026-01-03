const { MAX_PEERS, PEER_TIMEOUT } = require("../config/constants");

class PeerManager {
    constructor() {
        this.seenPeers = new Map();
        this.mySeq = 0;
    }

    addOrUpdatePeer(id, seq, key) {
        const stored = this.seenPeers.get(id);
        const wasNew = !stored;

        this.seenPeers.set(id, {
            seq,
            lastSeen: Date.now(),
            key,
        });

        return wasNew;
    }

    canAcceptPeer(id) {
        if (this.seenPeers.has(id)) return true;
        return this.seenPeers.size < MAX_PEERS;
    }

    getPeer(id) {
        return this.seenPeers.get(id);
    }

    removePeer(id) {
        return this.seenPeers.delete(id);
    }

    hasPeer(id) {
        return this.seenPeers.has(id);
    }

    cleanupStalePeers() {
        const now = Date.now();
        let removed = 0;

        for (const [id, data] of this.seenPeers) {
            if (now - data.lastSeen > PEER_TIMEOUT) {
                this.seenPeers.delete(id);
                removed++;
            }
        }

        return removed;
    }

    get size() {
        return this.seenPeers.size;
    }

    incrementSeq() {
        return ++this.mySeq;
    }

    getSeq() {
        return this.mySeq;
    }

    /**
     * Serialize peers for cache persistence.
     * Returns array of {id, seq, lastSeen, ip, port} suitable for JSON storage.
     * @returns {Array<Object>}
     */
    toJSON() {
        const result = [];
        for (const [id, data] of this.seenPeers) {
            result.push({
                id,
                seq: data.seq,
                lastSeen: data.lastSeen,
                ip: data.ip || null,
                port: data.port || null,
                key: data.key ? data.key.toString('hex') : null,
            });
        }
        return result;
    }

    /**
     * Deserialize peers from cache.
     * Restores peer state from previously saved JSON data.
     * @param {Array<Object>} data - Array of peer objects from cache
     */
    fromJSON(data) {
        if (!Array.isArray(data)) return;
        for (const peer of data) {
            this.seenPeers.set(peer.id, {
                seq: peer.seq || 0,
                lastSeen: peer.lastSeen || Date.now(),
                ip: peer.ip,
                port: peer.port,
                key: peer.key ? Buffer.from(peer.key, 'hex') : null,
            });
        }
    }

    /**
     * Prune stale peers older than maxAge seconds.
     * Typically called on cache load to remove outdated entries.
     * @param {number} maxAge - Maximum age in seconds
     * @returns {number} Number of peers removed
     */
    prune(maxAge) {
        const now = Date.now();
        let removed = 0;
        for (const [id, data] of this.seenPeers) {
            const age = (now - data.lastSeen) / 1000;
            if (age > maxAge) {
                this.seenPeers.delete(id);
                removed++;
            }
        }
        return removed;
    }
}

module.exports = { PeerManager };
