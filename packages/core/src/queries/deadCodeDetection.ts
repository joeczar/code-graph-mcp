import type { Entity, EntityStore, EntityType } from '../db/entities.js';
import type { RelationshipStore, RelationshipType } from '../db/relationships.js';

/**
 * Confidence level for dead code detection.
 *
 * - high: Entity has no incoming relationships and is not exported
 * - medium: Entity has no incoming relationships but IS exported (might be used externally)
 * - low: Entity is excluded from analysis but may still warrant inspection
 */
export type DeadCodeConfidence = 'high' | 'medium' | 'low';

/**
 * Represents a potentially unused entity in the codebase.
 */
export interface UnusedEntity {
  /** The potentially unused entity */
  entity: Entity;
  /** Number of outgoing calls (helps understand if it's a leaf function) */
  outgoingCount: number;
  /** Confidence that this entity is truly unused */
  confidence: DeadCodeConfidence;
  /** Human-readable reason why this entity is flagged */
  reason: string;
}

/**
 * Summary statistics for dead code analysis.
 */
export interface DeadCodeSummary {
  /** Total number of potentially unused entities found */
  totalUnused: number;
  /** Breakdown by entity type */
  byType: Partial<Record<EntityType, number>>;
  /** Breakdown by confidence level */
  byConfidence: Record<DeadCodeConfidence, number>;
}

/**
 * Result of dead code detection analysis.
 */
export interface DeadCodeResult {
  /** List of potentially unused entities */
  unusedEntities: UnusedEntity[];
  /** Summary statistics */
  summary: DeadCodeSummary;
}

/**
 * Options for configuring dead code detection behavior.
 */
export interface DeadCodeOptions {
  /**
   * Minimum confidence level to include in results.
   * Entities with lower confidence are excluded.
   * @default 'high'
   */
  minConfidence?: DeadCodeConfidence;

  /**
   * Whether to include entities from test files.
   * @default false
   */
  includeTests?: boolean;

  /**
   * Entity types to analyze.
   * @default ['function', 'class', 'method']
   */
  entityTypes?: EntityType[];

  /**
   * Maximum number of results to return.
   * @default undefined (no limit)
   */
  maxResults?: number;
}

/**
 * Relationship types that indicate an entity is being used.
 * Does NOT include 'contains' which is structural, not a dependency.
 * Does NOT include 'imports' because importing doesn't mean usage.
 */
const USAGE_RELATIONSHIP_TYPES: RelationshipType[] = [
  'calls',
  'extends',
  'implements',
];

/**
 * File patterns that indicate test files.
 * Entities in these files are excluded unless includeTests is true.
 */
const TEST_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /_test\.[jt]sx?$/,
  /_spec\.[jt]sx?$/,
  /__tests__\//,
  /\/test\//,
  /\/tests\//,
];

/**
 * File patterns that indicate entry points.
 * These files are always excluded from dead code detection.
 */
const ENTRY_POINT_PATTERNS = [
  /\/index\.[jt]sx?$/,
  /\/main\.[jt]sx?$/,
  /\/app\.[jt]sx?$/,
  /\/__init__\.py$/,
];

/**
 * Method names that are lifecycle hooks or special methods.
 * These are excluded from dead code detection.
 */
const LIFECYCLE_METHODS = new Set([
  // JavaScript/TypeScript
  'constructor',
  // React
  'componentDidMount',
  'componentDidUpdate',
  'componentWillUnmount',
  'shouldComponentUpdate',
  'getDerivedStateFromProps',
  'getSnapshotBeforeUpdate',
  'componentDidCatch',
  'render',
  // Angular
  'ngOnInit',
  'ngOnDestroy',
  'ngOnChanges',
  'ngDoCheck',
  'ngAfterContentInit',
  'ngAfterContentChecked',
  'ngAfterViewInit',
  'ngAfterViewChecked',
  // Vue
  'setup',
  'created',
  'mounted',
  'updated',
  'unmounted',
  'beforeCreate',
  'beforeMount',
  'beforeUpdate',
  'beforeUnmount',
]);

/**
 * Check if a file path matches test file patterns.
 */
function isTestFile(filePath: string): boolean {
  return TEST_FILE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Check if a file path is an entry point.
 */
function isEntryPoint(filePath: string): boolean {
  return ENTRY_POINT_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Check if an entity is a lifecycle method that should be excluded.
 */
function isLifecycleMethod(entity: Entity): boolean {
  if (entity.type !== 'method') {
    return false;
  }
  return LIFECYCLE_METHODS.has(entity.name);
}

/**
 * Check if an entity is exported.
 */
function isExported(entity: Entity): boolean {
  return entity.metadata?.['exported'] === true;
}

/**
 * Get confidence level order for comparison.
 */
function getConfidenceOrder(confidence: DeadCodeConfidence): number {
  switch (confidence) {
    case 'high':
      return 2;
    case 'medium':
      return 1;
    case 'low':
      return 0;
  }
}

/**
 * Check if a confidence level meets the minimum threshold.
 */
function meetsConfidenceThreshold(
  confidence: DeadCodeConfidence,
  minConfidence: DeadCodeConfidence
): boolean {
  return getConfidenceOrder(confidence) >= getConfidenceOrder(minConfidence);
}

/**
 * Detect potentially unused (dead) code in the codebase.
 *
 * Analyzes entities to find those with zero incoming usage relationships
 * (calls, extends, implements). Excludes entry points, test files (optionally),
 * lifecycle methods, and exported entities (with reduced confidence).
 *
 * @param entityStore - Entity storage interface
 * @param relationshipStore - Relationship storage interface
 * @param options - Configuration options
 * @returns Analysis result with potentially unused entities and statistics
 *
 * @example
 * ```typescript
 * const result = findDeadCode(entityStore, relationshipStore, {
 *   minConfidence: 'high',
 *   includeTests: false,
 * });
 * console.log(`Found ${result.summary.totalUnused} potentially unused entities`);
 * ```
 */
export function findDeadCode(
  entityStore: EntityStore,
  relationshipStore: RelationshipStore,
  options: DeadCodeOptions = {}
): DeadCodeResult {
  const {
    minConfidence = 'high',
    includeTests = false,
    entityTypes = ['function', 'class', 'method'],
    maxResults,
  } = options;

  const unusedEntities: UnusedEntity[] = [];
  const byType: Partial<Record<EntityType, number>> = {};
  const byConfidence: Record<DeadCodeConfidence, number> = {
    high: 0,
    medium: 0,
    low: 0,
  };

  // Get all entities of the specified types
  for (const entityType of entityTypes) {
    const entities = entityStore.findByType(entityType);

    for (const entity of entities) {
      // Skip entry points
      if (isEntryPoint(entity.filePath)) {
        continue;
      }

      // Skip test files unless requested
      if (!includeTests && isTestFile(entity.filePath)) {
        continue;
      }

      // Skip lifecycle methods
      if (isLifecycleMethod(entity)) {
        continue;
      }

      // Check for incoming usage relationships
      const incomingRelationships = relationshipStore.findByTarget(entity.id);
      const usageRelationships = incomingRelationships.filter(rel =>
        USAGE_RELATIONSHIP_TYPES.includes(rel.type)
      );

      // If the entity has any usage relationships, it's not dead code
      if (usageRelationships.length > 0) {
        continue;
      }

      // Count outgoing calls for context
      const outgoingRelationships = relationshipStore.findBySource(entity.id);
      const outgoingCount = outgoingRelationships.filter(
        rel => rel.type === 'calls'
      ).length;

      // Determine confidence level and reason
      let confidence: DeadCodeConfidence;
      let reason: string;

      if (isExported(entity)) {
        confidence = 'medium';
        reason = 'No incoming calls, but exported (might be used externally)';
      } else {
        confidence = 'high';
        reason = 'No incoming calls and not exported';
      }

      // Check if this meets the confidence threshold
      if (!meetsConfidenceThreshold(confidence, minConfidence)) {
        continue;
      }

      unusedEntities.push({
        entity,
        outgoingCount,
        confidence,
        reason,
      });

      // Update statistics
      byType[entity.type] = (byType[entity.type] ?? 0) + 1;
      byConfidence[confidence]++;

      // Check max results limit
      if (maxResults !== undefined && unusedEntities.length >= maxResults) {
        break;
      }
    }

    // Check max results limit (outer loop)
    if (maxResults !== undefined && unusedEntities.length >= maxResults) {
      break;
    }
  }

  // Sort by confidence (high first) then by file path
  unusedEntities.sort((a, b) => {
    const confidenceDiff =
      getConfidenceOrder(b.confidence) - getConfidenceOrder(a.confidence);
    if (confidenceDiff !== 0) {
      return confidenceDiff;
    }
    return a.entity.filePath.localeCompare(b.entity.filePath);
  });

  return {
    unusedEntities,
    summary: {
      totalUnused: unusedEntities.length,
      byType,
      byConfidence,
    },
  };
}
