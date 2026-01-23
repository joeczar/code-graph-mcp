import type { Entity, EntityStore } from '../db/entities.js';
import type { RelationshipStore, RelationshipType } from '../db/relationships.js';

/**
 * Dependency relationship types to traverse for cycle detection.
 * Does NOT include 'contains' which is structural, not a dependency.
 */
const DEPENDENCY_TYPES: RelationshipType[] = [
  'calls',
  'imports',
  'extends',
  'implements',
];

/**
 * A cycle in the dependency graph represented as an ordered list of entities.
 * The cycle goes from the first entity through the chain and back to the first entity.
 */
export interface DependencyCycle {
  /** Entities forming the cycle, ordered from first to last in the chain */
  entities: Entity[];
  /** The relationship types forming the cycle (same length as entities) */
  relationshipTypes: RelationshipType[];
}

/**
 * Result of circular dependency analysis.
 */
export interface CircularDependencyResult {
  /** Whether any cycles were found */
  hasCycles: boolean;
  /** All detected cycles */
  cycles: DependencyCycle[];
  /** Summary statistics */
  summary: {
    /** Total number of cycles found */
    totalCycles: number;
    /** Number of unique entities involved in cycles */
    entitiesInCycles: number;
    /** Shortest cycle length (0 if no cycles) */
    shortestCycle: number;
    /** Longest cycle length (0 if no cycles) */
    longestCycle: number;
  };
}

/**
 * State for DFS traversal tracking visited nodes and recursion stack.
 */
interface TraversalState {
  /** All visited entity IDs (to avoid reprocessing) */
  visited: Set<string>;
  /** Current recursion stack entity IDs (to detect back edges) */
  recursionStack: Set<string>;
  /** Current path being explored (entity IDs) */
  currentPath: string[];
  /** Current path relationship types */
  currentRelTypes: RelationshipType[];
  /** Detected cycles */
  cycles: DependencyCycle[];
  /** Set of cycle signatures to prevent duplicate cycles */
  seenCycleSignatures: Set<string>;
}

/**
 * Create a canonical signature for a cycle to detect duplicates.
 * Normalizes by rotating to start with the smallest entity ID.
 */
function getCycleSignature(entityIds: string[]): string {
  if (entityIds.length === 0) return '';

  // Find the index of the smallest entity ID
  let minIndex = 0;
  for (let i = 1; i < entityIds.length; i++) {
    const currentId = entityIds[i];
    const minId = entityIds[minIndex];
    if (currentId !== undefined && minId !== undefined && currentId < minId) {
      minIndex = i;
    }
  }

  // Rotate the array to start with the smallest ID
  const rotated = [
    ...entityIds.slice(minIndex),
    ...entityIds.slice(0, minIndex),
  ];

  return rotated.join('->');
}

/**
 * DFS traversal to find cycles starting from a given entity.
 */
function dfs(
  entityId: string,
  entityStore: EntityStore,
  relationshipStore: RelationshipStore,
  state: TraversalState,
  maxCycles: number
): void {
  // Stop if we've found enough cycles
  if (maxCycles > 0 && state.cycles.length >= maxCycles) {
    return;
  }

  state.visited.add(entityId);
  state.recursionStack.add(entityId);
  state.currentPath.push(entityId);

  // Find outgoing dependencies (where this entity depends on something)
  const relationships = relationshipStore.findBySource(entityId);

  for (const rel of relationships) {
    // Only traverse dependency relationships
    if (!DEPENDENCY_TYPES.includes(rel.type)) {
      continue;
    }

    // Stop early if we've found enough cycles
    if (maxCycles > 0 && state.cycles.length >= maxCycles) {
      break;
    }

    const targetId = rel.targetId;

    // Skip self-referential relationships (A -> A)
    // These are not meaningful cycles and are often false positives
    if (targetId === entityId) {
      continue;
    }

    // Back edge found - we have a cycle!
    if (state.recursionStack.has(targetId)) {
      // Extract the cycle from currentPath
      const cycleStartIndex = state.currentPath.indexOf(targetId);
      if (cycleStartIndex !== -1) {
        const cycleIds = state.currentPath.slice(cycleStartIndex);

        // Create cycle signature and check for duplicates
        const signature = getCycleSignature(cycleIds);
        if (!state.seenCycleSignatures.has(signature)) {
          state.seenCycleSignatures.add(signature);

          // Build the cycle with relationship types
          const relTypes = state.currentRelTypes.slice(cycleStartIndex);
          relTypes.push(rel.type); // Add the back edge relationship type

          // Get full entities for the cycle
          const cycleEntities: Entity[] = [];
          for (const id of cycleIds) {
            const entity = entityStore.findById(id);
            if (entity) {
              cycleEntities.push(entity);
            }
          }

          if (cycleEntities.length === cycleIds.length) {
            state.cycles.push({
              entities: cycleEntities,
              relationshipTypes: relTypes,
            });
          }
        }
      }
    } else if (!state.visited.has(targetId)) {
      // Continue DFS to unvisited node
      state.currentRelTypes.push(rel.type);
      dfs(targetId, entityStore, relationshipStore, state, maxCycles);
      state.currentRelTypes.pop();
    }
  }

  // Backtrack
  state.currentPath.pop();
  state.recursionStack.delete(entityId);
}

/**
 * Detect circular dependencies in the codebase.
 *
 * Uses depth-first search with back-edge detection to find all cycles
 * in the dependency graph.
 *
 * @param entityStore - Entity storage interface
 * @param relationshipStore - Relationship storage interface
 * @param startEntityName - Optional entity name to start search from (finds cycles involving this entity)
 * @param maxCycles - Maximum number of cycles to find (0 = unlimited, default: 100)
 * @returns Analysis result with all detected cycles and statistics
 *
 * @example
 * ```typescript
 * // Find all cycles in the codebase
 * const result = findCircularDependencies(entityStore, relationshipStore);
 * console.log(`Found ${result.cycles.length} cycles`);
 *
 * // Find cycles involving a specific entity
 * const result = findCircularDependencies(entityStore, relationshipStore, 'MyClass');
 * ```
 */
export function findCircularDependencies(
  entityStore: EntityStore,
  relationshipStore: RelationshipStore,
  startEntityName?: string,
  maxCycles = 100
): CircularDependencyResult {
  const state: TraversalState = {
    visited: new Set(),
    recursionStack: new Set(),
    currentPath: [],
    currentRelTypes: [],
    cycles: [],
    seenCycleSignatures: new Set(),
  };

  // Get starting entities
  let startEntities: Entity[];
  if (startEntityName) {
    startEntities = entityStore.findByName(startEntityName);
    if (startEntities.length === 0) {
      return {
        hasCycles: false,
        cycles: [],
        summary: {
          totalCycles: 0,
          entitiesInCycles: 0,
          shortestCycle: 0,
          longestCycle: 0,
        },
      };
    }
  } else {
    // Start from all entities
    startEntities = entityStore.getAll();
  }

  // Run DFS from each starting entity
  for (const entity of startEntities) {
    if (!state.visited.has(entity.id)) {
      dfs(entity.id, entityStore, relationshipStore, state, maxCycles);
    }

    // Stop if we've found enough cycles
    if (maxCycles > 0 && state.cycles.length >= maxCycles) {
      break;
    }
  }

  // Filter cycles to only include those involving the start entity (if specified)
  let resultCycles = state.cycles;
  if (startEntityName) {
    resultCycles = state.cycles.filter((cycle) =>
      cycle.entities.some((e) => e.name === startEntityName)
    );
  }

  // Calculate statistics
  const uniqueEntityIds = new Set<string>();
  let shortestCycle = 0;
  let longestCycle = 0;

  for (const cycle of resultCycles) {
    for (const entity of cycle.entities) {
      uniqueEntityIds.add(entity.id);
    }
    const cycleLength = cycle.entities.length;
    if (shortestCycle === 0 || cycleLength < shortestCycle) {
      shortestCycle = cycleLength;
    }
    if (cycleLength > longestCycle) {
      longestCycle = cycleLength;
    }
  }

  return {
    hasCycles: resultCycles.length > 0,
    cycles: resultCycles,
    summary: {
      totalCycles: resultCycles.length,
      entitiesInCycles: uniqueEntityIds.size,
      shortestCycle,
      longestCycle,
    },
  };
}
