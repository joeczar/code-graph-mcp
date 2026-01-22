/**
 * Project-wide TypeScript/JavaScript parser using ts-morph.
 * Enables cross-file relationship resolution across an entire codebase.
 *
 * This parser creates a ts-morph Project instance containing all TypeScript/JavaScript
 * files, allowing accurate resolution of imports, function calls, and class relationships
 * across file boundaries.
 */

import { Project } from 'ts-morph';
import { relative } from 'node:path';
import { globbySync } from 'globby';
import {
  extractEntities,
  extractRelationships,
  buildEntityLookupMap,
  extractVueScript,
  type TsMorphEntity,
  type TsMorphRelationship,
} from './ts-morph-parser.js';

/**
 * Progress callback for reporting parsing progress.
 * Called at each phase of parsing to allow callers to track progress.
 *
 * @param phase - Current phase: 'scan', 'load', 'entities', 'relationships'
 * @param current - Current item number (0-indexed during phase, or count at end)
 * @param total - Total items in this phase
 * @param message - Human-readable progress message
 */
export type ProgressCallback = (
  phase: 'scan' | 'load' | 'entities' | 'relationships',
  current: number,
  total: number,
  message: string
) => void;

export interface ProjectParseOptions {
  /**
   * Root directory to parse (absolute path)
   */
  projectPath: string;

  /**
   * Glob patterns to exclude (e.g., ['**\/node_modules/**', '**\/__tests__/**'])
   * Defaults to common exclusions
   */
  exclude?: string[];

  /**
   * Optional progress callback for reporting parsing progress.
   * Called at each phase: scan, load, entities, relationships.
   */
  onProgress?: ProgressCallback;
}

export interface ProjectParseResult {
  /**
   * Project root path
   */
  projectPath: string;

  /**
   * All extracted entities across the project
   */
  entities: TsMorphEntity[];

  /**
   * All extracted relationships across the project
   */
  relationships: TsMorphRelationship[];

  /**
   * Statistics about the parse operation
   */
  stats: {
    filesScanned: number;
    vueFilesProcessed: number;
    entitiesByType: Record<string, number>;
    relationshipsByType: Record<string, number>;
  };
}

/**
 * Default exclusion patterns for project parsing
 */
const DEFAULT_EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/__tests__/**',
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/*.test.tsx',
  '**/*.spec.tsx',
  '**/*.test.js',
  '**/*.spec.js',
  '**/*.d.ts',
];

/**
 * Find all TypeScript, JavaScript, and Vue files in a directory using globby.
 *
 * @param dir - Directory to search
 * @param exclude - Glob patterns to exclude
 * @returns Array of absolute file paths
 */
function findSourceFiles(dir: string, exclude: string[]): string[] {
  return globbySync('**/*.{ts,tsx,js,jsx,vue}', {
    cwd: dir,
    absolute: true,
    ignore: exclude,
    gitignore: true, // Respect .gitignore patterns
  });
}

/**
 * Parse an entire TypeScript/JavaScript project with cross-file resolution.
 *
 * This creates a single ts-morph Project instance containing all source files,
 * enabling accurate resolution of:
 * - Import statements across files
 * - Function calls to imported functions
 * - Class inheritance and interface implementations
 * - Method calls on imported classes
 *
 * @param options - Project parse options
 * @returns Parse result with entities and relationships
 *
 * @example
 * ```ts
 * const result = await parseProject({
 *   projectPath: '/path/to/project',
 *   exclude: ['**\/node_modules/**', '**\/__tests__/**'],
 * });
 * console.log(`Found ${result.entities.length} entities`);
 * ```
 */
export function parseProject(
  options: ProjectParseOptions,
): ProjectParseResult {
  const { projectPath, exclude = DEFAULT_EXCLUDE_PATTERNS, onProgress } = options;

  // Phase 1: Scan - report scanning start
  onProgress?.('scan', 0, 0, 'Scanning for source files...');

  // Create ts-morph Project for cross-file analysis
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
  });

  // Find all source files
  const sourceFiles = findSourceFiles(projectPath, exclude);

  // Report scan complete
  onProgress?.('scan', sourceFiles.length, sourceFiles.length, `Found ${String(sourceFiles.length)} source files`);

  // Track Vue file mappings (virtual path -> original relative path)
  const vueFileMapping = new Map<string, string>();
  let vueFilesProcessed = 0;

  // Phase 2: Load - add files to the project
  const totalFiles = sourceFiles.length;
  for (let i = 0; i < sourceFiles.length; i++) {
    const file = sourceFiles[i];
    if (!file) continue;

    const relativePath = relative(projectPath, file);
    onProgress?.('load', i + 1, totalFiles, `Loading ${relativePath}`);

    try {
      if (file.endsWith('.vue')) {
        const vueScript = extractVueScript(file);
        if (vueScript) {
          // Create virtual TypeScript file for ts-morph
          const virtualPath = `${file}.ts`;
          project.createSourceFile(virtualPath, vueScript.content);
          vueFileMapping.set(virtualPath, relativePath);
          vueFilesProcessed++;
        }
      } else {
        project.addSourceFileAtPath(file);
      }
    } catch (error) {
      console.warn(`[TsMorphProjectParser] Failed to add ${file}:`, error);
    }
  }

  // Phase 3: Extract entities
  const allEntities: TsMorphEntity[] = [];
  const projectSourceFiles = project.getSourceFiles();
  const totalSourceFiles = projectSourceFiles.length;

  for (let i = 0; i < projectSourceFiles.length; i++) {
    const sourceFile = projectSourceFiles[i];
    if (!sourceFile) continue;

    const sourceFilePath = sourceFile.getFilePath();
    const originalVuePath = vueFileMapping.get(sourceFilePath);
    const displayPath = originalVuePath ?? relative(projectPath, sourceFilePath);

    onProgress?.('entities', i + 1, totalSourceFiles, `Extracting entities from ${displayPath}`);

    const entities = extractEntities(
      sourceFile,
      projectPath,
      originalVuePath,
    );
    allEntities.push(...entities);
  }

  // Build entity lookup map for call resolution
  const entityLookupMap = buildEntityLookupMap(allEntities);

  // Phase 4: Extract relationships with cross-file resolution
  const allRelationships: TsMorphRelationship[] = [];

  for (let i = 0; i < projectSourceFiles.length; i++) {
    const sourceFile = projectSourceFiles[i];
    if (!sourceFile) continue;

    const sourceFilePath = sourceFile.getFilePath();
    const originalVuePath = vueFileMapping.get(sourceFilePath);
    const displayPath = originalVuePath ?? relative(projectPath, sourceFilePath);

    onProgress?.('relationships', i + 1, totalSourceFiles, `Extracting relationships from ${displayPath}`);

    const relationships = extractRelationships(
      sourceFile,
      projectPath,
      entityLookupMap,
      originalVuePath,
    );
    allRelationships.push(...relationships);
  }

  // Calculate statistics
  const entitiesByType: Record<string, number> = {};
  for (const entity of allEntities) {
    entitiesByType[entity.type] = (entitiesByType[entity.type] ?? 0) + 1;
  }

  const relationshipsByType: Record<string, number> = {};
  for (const relationship of allRelationships) {
    relationshipsByType[relationship.type] = (relationshipsByType[relationship.type] ?? 0) + 1;
  }

  return {
    projectPath,
    entities: allEntities,
    relationships: allRelationships,
    stats: {
      filesScanned: sourceFiles.length,
      vueFilesProcessed,
      entitiesByType,
      relationshipsByType,
    },
  };
}
