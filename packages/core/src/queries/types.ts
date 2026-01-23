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
