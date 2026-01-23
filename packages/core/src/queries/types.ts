import type { Entity } from '../db/entities.js';

/**
 * An entity affected by changes to the source file, with depth information.
 */
export interface AffectedEntity {
  /** The entity that depends on something in the source file */
  entity: Entity;
  /** How many hops away from the source entities (0 = direct dependency) */
  depth: number;
}

/**
 * Result of blast radius analysis for a file.
 */
export interface BlastRadiusResult {
  /** The file being analyzed */
  sourceFile: string;
  /** All entities defined in the source file */
  sourceEntities: Entity[];
  /** Entities that transitively depend on the source file */
  affectedEntities: AffectedEntity[];
  /** Summary statistics */
  summary: {
    /** Total number of entities that could be affected */
    totalAffected: number;
    /** Maximum depth of the dependency chain */
    maxDepth: number;
    /** Number of direct dependents (depth 0) */
    directDependents: number;
  };
}

/**
 * Confidence level for unused entity detection
 */
export type UnusedEntityConfidence = 'high' | 'medium' | 'low';

/**
 * An entity that appears to be unused in the codebase
 */
export interface UnusedEntity {
  /** The potentially unused entity */
  entity: Entity;
  /** Confidence level that this entity is truly unused */
  confidence: UnusedEntityConfidence;
  /** Human-readable reason why this entity is flagged as unused */
  reason: string;
}

/**
 * Options for finding dead code
 */
export interface FindDeadCodeOptions {
  /** Minimum confidence level to include (default: 'medium') */
  minConfidence?: UnusedEntityConfidence;
  /** Filter by specific entity type */
  entityType?: string;
  /** Maximum number of results to return */
  limit?: number;
}

/**
 * Result of dead code detection
 */
export interface FindDeadCodeResult {
  /** All unused entities grouped by confidence */
  unusedByConfidence: {
    high: UnusedEntity[];
    medium: UnusedEntity[];
    low: UnusedEntity[];
  };
  /** Summary statistics */
  summary: {
    /** Total number of unused entities */
    totalUnused: number;
    /** Count by confidence level */
    countByConfidence: {
      high: number;
      medium: number;
      low: number;
    };
  };
}
