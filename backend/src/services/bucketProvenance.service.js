import crypto from 'crypto';
import logger from '../config/logger.js';

class BucketProvenanceService {
  constructor() {
    this.artifacts = new Map();
    this.initialized = false;
  }

  initialize() {
    this.initialized = true;
    logger.info('[BucketProvenance] Initialized');
  }

  computeHash(data) {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  createArtifactReference({ type, entity_type, entity_id, data, metadata = {} }) {
    const content_hash = this.computeHash(data);
    const artifact_id = `BUK-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    const artifact = {
      artifact_id,
      type,
      entity_type,
      entity_id: entity_id?.toString(),
      content_hash,
      data,
      metadata: {
        ...metadata,
        created_at: new Date().toISOString(),
        immutable: true,
      },
      version: 1,
      parent_artifact_id: null,
      chain: [{
        version: 1,
        content_hash,
        timestamp: new Date().toISOString(),
        action: 'CREATED',
      }],
    };

    this.artifacts.set(artifact_id, artifact);
    return artifact;
  }

  createVersionedArtifact({ parent_artifact_id, data, metadata = {}, action = 'UPDATED' }) {
    const parent = this.artifacts.get(parent_artifact_id);
    if (!parent) throw new Error(`Parent artifact ${parent_artifact_id} not found`);

    const content_hash = this.computeHash(data);
    const newVersion = parent.version + 1;

    const artifact = {
      ...parent,
      data,
      content_hash,
      version: newVersion,
      metadata: {
        ...parent.metadata,
        ...metadata,
        updated_at: new Date().toISOString(),
      },
      chain: [
        ...parent.chain,
        {
          version: newVersion,
          content_hash,
          timestamp: new Date().toISOString(),
          action,
          previous_hash: parent.content_hash,
        },
      ],
    };

    this.artifacts.set(artifact.artifact_id, artifact);
    return artifact;
  }

  getArtifact(artifact_id) {
    return this.artifacts.get(artifact_id) || null;
  }

  verifyArtifact(artifact_id) {
    const artifact = this.artifacts.get(artifact_id);
    if (!artifact) return { valid: false, reason: 'not_found' };

    const computedHash = this.computeHash(artifact.data);
    const hashValid = computedHash === artifact.content_hash;

    let chainValid = true;
    for (let i = 1; i < artifact.chain.length; i++) {
      if (artifact.chain[i].previous_hash !== artifact.chain[i - 1].content_hash) {
        chainValid = false;
        break;
      }
    }

    return {
      valid: hashValid && chainValid,
      artifact_id,
      content_hash_valid: hashValid,
      chain_valid: chainValid,
      version: artifact.version,
      chain_length: artifact.chain.length,
    };
  }

  getArtifactsByEntity(entity_type, entity_id) {
    const results = [];
    for (const [, artifact] of this.artifacts) {
      if (artifact.entity_type === entity_type && artifact.entity_id === entity_id?.toString()) {
        results.push(artifact);
      }
    }
    return results;
  }

  getArtifactsByType(type) {
    const results = [];
    for (const [, artifact] of this.artifacts) {
      if (artifact.type === type) results.push(artifact);
    }
    return results;
  }

  getStats() {
    return {
      total_artifacts: this.artifacts.size,
      initialized: this.initialized,
      by_type: [...this.artifacts.values()].reduce((acc, a) => {
        acc[a.type] = (acc[a.type] || 0) + 1;
        return acc;
      }, {}),
    };
  }
}

export default new BucketProvenanceService();
