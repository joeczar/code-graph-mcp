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
  const { projectPath, exclude = DEFAULT_EXCLUDE_PATTERNS } = options;

  // Create ts-morph Project for cross-file analysis
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
  });

  // Find all source files
  const sourceFiles = findSourceFiles(projectPath, exclude);

  // Track Vue file mappings (virtual path -> original relative path)
  const vueFileMapping = new Map<string, string>();
  let vueFilesProcessed = 0;

  // Add files to the project
  for (const file of sourceFiles) {
    try {
      if (file.endsWith('.vue')) {
        const vueScript = extractVueScript(file);
        if (vueScript) {
          // Create virtual TypeScript file for ts-morph
          const virtualPath = `${file}.ts`;
          project.createSourceFile(virtualPath, vueScript.content);
          vueFileMapping.set(virtualPath, relative(projectPath, file));
          vueFilesProcessed++;
        }
      } else {
        project.addSourceFileAtPath(file);
      }
    } catch (error) {
      console.warn(`[TsMorphProjectParser] Failed to add ${file}:`, error);
    }
  }

  // First pass: Extract all entities
  const allEntities: TsMorphEntity[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const sourceFilePath = sourceFile.getFilePath();
    const originalVuePath = vueFileMapping.get(sourceFilePath);

    const entities = extractEntities(
      sourceFile,
      projectPath,
      originalVuePath,
    );
    allEntities.push(...entities);
  }

  // Build entity lookup map for call resolution
  const entityLookupMap = buildEntityLookupMap(allEntities);

  // Second pass: Extract relationships with cross-file resolution
  const allRelationships: TsMorphRelationship[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const sourceFilePath = sourceFile.getFilePath();
    const originalVuePath = vueFileMapping.get(sourceFilePath);

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
