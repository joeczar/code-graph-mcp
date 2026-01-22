/**
 * TypeScript/JavaScript parser using ts-morph for entity and relationship extraction.
 * Adapted from claude-knowledge reference implementation for code-graph-mcp.
 *
 * Key differences from tree-sitter approach:
 * - Uses TypeScript compiler API via ts-morph for better type resolution
 * - Enables cross-file call resolution
 * - Supports Vue SFC files via @vue/compiler-sfc
 */

import { SyntaxKind } from 'ts-morph';
import type { SourceFile, Node, JSDoc, CallExpression } from 'ts-morph';
import { readFileSync } from 'node:fs';
import { relative, join, dirname } from 'node:path';
import { parse as parseVueSFC } from '@vue/compiler-sfc';
import type { NewEntity } from '../db/entities.js';

/**
 * Entity with additional metadata for ts-morph parsing.
 * Extended with exported flag and JSDoc content.
 */
export interface TsMorphEntity extends NewEntity {
  exported?: boolean;
  jsDocContent?: string;
}

/**
 * Relationship between entities (by name, not ID).
 *
 * Optional file path fields enable cross-file relationship resolution:
 * - When provided, allows database lookup for entities in other files
 * - When absent, falls back to local-only resolution (current file)
 */
export interface TsMorphRelationship {
  sourceName: string;
  targetName: string;
  type: 'calls' | 'imports' | 'exports' | 'extends' | 'implements';
  metadata?: Record<string, unknown>;
  /** File path where the target entity is defined (for cross-file resolution) */
  targetFilePath?: string;
  /** File path where the source entity is defined (for cross-file resolution) */
  sourceFilePath?: string;
}

/**
 * Extract TypeScript content from a Vue SFC file.
 * Supports both <script lang="ts"> and <script setup lang="ts"> syntax.
 *
 * @param filePath - Path to the Vue file
 * @returns Object with script content and syntax type, or null if no TypeScript script found
 */
export function extractVueScript(
  filePath: string,
): { content: string; isSetupSyntax: boolean } | null {
  try {
    const fileContent = readFileSync(filePath, 'utf-8');
    const { descriptor, errors } = parseVueSFC(fileContent, {
      filename: filePath,
    });

    // Log parse errors if any
    if (errors.length > 0) {
      console.warn(`Failed to parse Vue file: ${filePath}`, {
        errors: errors.map((e: { message: string }) => e.message),
      });
      return null;
    }

    // Check <script setup> first (modern Vue 3 pattern)
    if (descriptor.scriptSetup?.lang === 'ts') {
      return {
        content: descriptor.scriptSetup.content,
        isSetupSyntax: true,
      };
    }

    // Fall back to regular <script>
    if (descriptor.script?.lang === 'ts') {
      return {
        content: descriptor.script.content,
        isSetupSyntax: false,
      };
    }

    // No TypeScript script found
    return null;
  } catch (error) {
    console.warn(`Error extracting script from Vue file: ${filePath}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Extract entities from a source file.
 *
 * @param sourceFile - ts-morph SourceFile to extract from
 * @param basePath - Base path for relative file paths
 * @param originalFilePath - Optional original file path (for Vue files, overrides sourceFile path)
 */
export function extractEntities(
  sourceFile: SourceFile,
  basePath: string,
  originalFilePath?: string,
): TsMorphEntity[] {
  const entities: TsMorphEntity[] = [];
  const filePath =
    originalFilePath ?? relative(basePath, sourceFile.getFilePath());

  // Add file as an entity
  entities.push({
    type: 'file',
    name: filePath,
    filePath,
    startLine: 1,
    endLine: sourceFile.getEndLineNumber(),
    language: 'typescript',
    exported: true,
  });

  // Functions
  sourceFile.getFunctions().forEach((fn) => {
    const name = fn.getName();
    if (name) {
      const entity: TsMorphEntity = {
        type: 'function',
        name,
        filePath,
        startLine: fn.getStartLineNumber(),
        endLine: fn.getEndLineNumber(),
        language: 'typescript',
        exported: fn.isExported(),
      };

      const jsDocContent = extractJsDocContent(fn);
      if (jsDocContent) {
        entity.jsDocContent = jsDocContent;
      }

      entities.push(entity);
    }
  });

  // Classes
  sourceFile.getClasses().forEach((cls) => {
    const name = cls.getName();
    if (name) {
      const classEntity: TsMorphEntity = {
        type: 'class',
        name,
        filePath,
        startLine: cls.getStartLineNumber(),
        endLine: cls.getEndLineNumber(),
        language: 'typescript',
        exported: cls.isExported(),
      };

      const classJsDocContent = extractJsDocContent(cls);
      if (classJsDocContent) {
        classEntity.jsDocContent = classJsDocContent;
      }

      entities.push(classEntity);

      // Class methods as separate entities
      cls.getMethods().forEach((method) => {
        const methodName = method.getName();
        const methodEntity: TsMorphEntity = {
          type: 'method',
          name: `${name}.${methodName}`,
          filePath,
          startLine: method.getStartLineNumber(),
          endLine: method.getEndLineNumber(),
          language: 'typescript',
          exported: cls.isExported(),
        };

        const methodJsDocContent = extractJsDocContent(method);
        if (methodJsDocContent) {
          methodEntity.jsDocContent = methodJsDocContent;
        }

        entities.push(methodEntity);
      });
    }
  });

  // Type aliases
  sourceFile.getTypeAliases().forEach((typeAlias) => {
    const name = typeAlias.getName();
    const entity: TsMorphEntity = {
      type: 'type',
      name,
      filePath,
      startLine: typeAlias.getStartLineNumber(),
      endLine: typeAlias.getEndLineNumber(),
      language: 'typescript',
      exported: typeAlias.isExported(),
    };

    const jsDocContent = extractJsDocContent(typeAlias);
    if (jsDocContent) {
      entity.jsDocContent = jsDocContent;
    }

    entities.push(entity);
  });

  // Interfaces (stored as type entities for simplicity)
  sourceFile.getInterfaces().forEach((iface) => {
    const name = iface.getName();
    const entity: TsMorphEntity = {
      type: 'type',
      name,
      filePath,
      startLine: iface.getStartLineNumber(),
      endLine: iface.getEndLineNumber(),
      language: 'typescript',
      exported: iface.isExported(),
      metadata: { interfaceType: true },
    };

    const jsDocContent = extractJsDocContent(iface);
    if (jsDocContent) {
      entity.jsDocContent = jsDocContent;
    }

    entities.push(entity);
  });

  // Variable declarations (especially arrow functions)
  sourceFile.getVariableDeclarations().forEach((decl) => {
    const name = decl.getName();
    const initializer = decl.getInitializer();
    const isArrowFn = initializer?.getKind() === SyntaxKind.ArrowFunction;

    const entity: TsMorphEntity = {
      type: isArrowFn ? 'function' : 'variable',
      name,
      filePath,
      startLine: decl.getStartLineNumber(),
      endLine: decl.getEndLineNumber(),
      language: 'typescript',
      exported: decl.isExported(),
    };

    // Extract JSDoc from parent VariableStatement (where JSDoc is attached)
    const variableStatement = decl.getVariableStatement();
    if (variableStatement) {
      const jsDocContent = extractJsDocContent(variableStatement);
      if (jsDocContent) {
        entity.jsDocContent = jsDocContent;
      }
    }

    entities.push(entity);
  });

  return entities;
}

/**
 * Extract import map from a source file for call resolution.
 * Uses ts-morph's module resolution when available, falls back to path guessing.
 *
 * @param sourceFile - ts-morph SourceFile to extract imports from
 * @param basePath - Base path for relative file resolution
 * @returns Map where key=imported symbol name, value=source file path
 */
export function extractImportMap(
  sourceFile: SourceFile,
  basePath: string,
): Map<string, string> {
  const importMap = new Map<string, string>();
  const currentFilePath = relative(basePath, sourceFile.getFilePath());

  sourceFile.getImportDeclarations().forEach((imp) => {
    // Try ts-morph's module resolution first (most accurate)
    const moduleSpecifierSourceFile = imp.getModuleSpecifierSourceFile();

    let targetPath: string;
    if (moduleSpecifierSourceFile) {
      // ts-morph resolved the import - use the actual file path
      targetPath = relative(basePath, moduleSpecifierSourceFile.getFilePath());
    } else {
      // Fall back to manual path resolution for unresolved imports
      const moduleSpecifier = imp.getModuleSpecifierValue();
      const isRelative = moduleSpecifier.startsWith('.');

      if (!isRelative) {
        // Skip external imports (node_modules, etc.)
        return;
      }

      // Resolve relative path and guess .ts extension
      const resolvedPath = join(
        dirname(currentFilePath),
        moduleSpecifier,
      ).replace(/\\/g, '/');
      targetPath = `${resolvedPath}.ts`;
    }

    // Named imports
    imp.getNamedImports().forEach((named) => {
      const importedName = named.getName();
      if (importedName) {
        importMap.set(importedName, targetPath);
      }
    });

    // Default imports
    const defaultImport = imp.getDefaultImport();
    if (defaultImport) {
      const importedName = defaultImport.getText();
      if (importedName) {
        importMap.set(importedName, targetPath);
      }
    }
  });

  return importMap;
}

/**
 * Build a lookup map of entities by name for fast call resolution.
 * Groups entities by their simple name (not full ID) to enable quick lookups.
 *
 * @param entities - Array of all entities
 * @returns Map where key=entity name, value=array of matching entities
 */
export function buildEntityLookupMap(
  entities: TsMorphEntity[],
): Map<string, TsMorphEntity[]> {
  const lookupMap = new Map<string, TsMorphEntity[]>();

  for (const entity of entities) {
    // Skip file entities - we only care about code entities
    if (entity.type === 'file') {
      continue;
    }

    const existing = lookupMap.get(entity.name) ?? [];
    existing.push(entity);
    lookupMap.set(entity.name, existing);
  }

  return lookupMap;
}

/**
 * Find the best matching entity from candidates based on context.
 * Prioritizes: same file > same package > exported > first match
 *
 * @param candidates - Array of potential entity matches
 * @param currentFile - Current file path for context
 * @param isImported - Whether this symbol was explicitly imported
 * @returns Best matching entity or null if no good match
 */
export function findBestMatch(
  candidates: TsMorphEntity[],
  currentFile: string,
  isImported: boolean,
): TsMorphEntity | null {
  if (candidates.length === 0) {
    return null;
  }

  // If only one candidate, use it
  if (candidates.length === 1) {
    return candidates[0] ?? null;
  }

  // Scoring: same file (100) > same package (50) > exported (25) > first (0)
  let bestScore = -1;
  let bestMatch: TsMorphEntity | null = null;

  for (const candidate of candidates) {
    let score = 0;

    // Prefer entities in the same file (unless explicitly imported)
    if (!isImported && candidate.filePath === currentFile) {
      score += 100;
    }

    // Prefer exported entities (more likely to be imported)
    if (candidate.exported) {
      score += 25;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch ?? candidates[0] ?? null;
}

/**
 * Resolve a call expression to its actual definition entity name and file path.
 * Uses multi-pass resolution strategy to minimize orphaned relationships.
 *
 * Pass 1: ts-morph type system resolution
 * Pass 2: Import-aware lookup (check if symbol was imported)
 * Pass 3: Entity lookup map (find matching entities in codebase)
 * Pass 4: Return null for unresolvable (external/dynamic calls)
 *
 * @param call - CallExpression to resolve
 * @param currentFilePath - Current file path (relative to basePath)
 * @param basePath - Base path for package
 * @param entityLookupMap - Map of entity names to entities (for Pass 3)
 * @param importMap - Map of imported symbols to file paths (for Pass 2)
 * @returns Object with entity name and file path, or null if unresolvable
 */
function resolveCallTarget(
  call: CallExpression,
  currentFilePath: string,
  basePath: string,
  entityLookupMap: Map<string, TsMorphEntity[]>,
  importMap: Map<string, string>,
): { name: string; filePath: string } | null {
  // Get the expression being called using ts-morph's typed API
  const expression = call.getExpression();
  const calledName = expression.getText();

  // PASS 1: Try to resolve using ts-morph type system
  try {
    const definitions =
      expression.getType().getSymbol()?.getDeclarations() ?? [];

    if (definitions.length > 0) {
      const def = definitions[0];
      if (!def) return null;

      const defSourceFile = def.getSourceFile();
      const defFilePath = relative(basePath, defSourceFile.getFilePath());

      // Extract entity name from definition
      let defName: string | undefined;
      if (def.isKind(SyntaxKind.FunctionDeclaration)) {
        defName = def.getName();
      } else if (def.isKind(SyntaxKind.MethodDeclaration)) {
        const methodName = def.getName();
        const parentClass = def.getParentIfKind(SyntaxKind.ClassDeclaration);
        const className = parentClass?.getName();
        if (className && methodName) {
          defName = `${className}.${methodName}`;
        }
      } else if (def.isKind(SyntaxKind.VariableDeclaration)) {
        defName = def.getName();
      } else if (def.isKind(SyntaxKind.ClassDeclaration)) {
        defName = def.getName();
      }

      if (defName) {
        // Skip if definition is outside the package (e.g., node_modules)
        // relative() returns paths starting with '..' for files outside basePath
        if (defFilePath.startsWith('..')) {
          // External dependency - don't create relationship
          return null;
        }

        // Verify this entity exists in our entity map
        const candidates = entityLookupMap.get(defName);
        if (candidates?.some((e) => e.filePath === defFilePath)) {
          return { name: defName, filePath: defFilePath };
        }
      }
    }
  } catch (error) {
    // Type resolution failed - fall through to next pass
    // This is expected for dynamic calls, external libraries, etc.
    // Log at debug level for troubleshooting resolution issues
    if (process.env['DEBUG_CODE_GRAPH']) {
      console.debug(
        `[resolveCallTarget] Pass 1 failed for "${calledName}" in ${currentFilePath}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // PASS 2: Check import map for this symbol
  const importedFromPath = importMap.get(calledName);
  if (importedFromPath) {
    // Look up entities in the imported file
    const candidates = entityLookupMap.get(calledName);
    if (candidates) {
      // Find entity in the imported file - try all possible path variations
      // to handle cases where import './bar' could be bar.ts or bar/index.ts
      const possiblePaths = [
        importedFromPath,
        importedFromPath.replace(/\.ts$/, '/index.ts'),
        importedFromPath.replace(/\.ts$/, ''),
      ];
      const match = candidates.find((e) => possiblePaths.includes(e.filePath));
      if (match) {
        return { name: match.name, filePath: match.filePath };
      }
      return null;
    }
  }

  // PASS 3: Entity lookup map fallback
  // Skip method calls and property access (e.g., "obj.method", "this.helper")
  if (calledName.includes('.')) {
    return null; // Cannot resolve - skip this relationship
  }

  // Look up the called name in entity map
  const candidates = entityLookupMap.get(calledName);
  if (candidates && candidates.length > 0) {
    // Use findBestMatch to select most likely candidate
    const bestMatch = findBestMatch(candidates, currentFilePath, false);
    if (bestMatch) {
      return { name: bestMatch.name, filePath: bestMatch.filePath };
    }
  }

  // PASS 4: Unresolvable - return null (don't create synthetic names)
  // This handles:
  // - External library calls (console.log, JSON.stringify)
  // - Dynamic calls (variables containing function references)
  // - Method calls we couldn't resolve
  return null;
}

/**
 * Extract relationships from a source file.
 *
 * @param sourceFile - ts-morph SourceFile to extract from
 * @param basePath - Base path for relative file paths
 * @param entityLookupMap - Map of entity names to entities for call resolution
 * @param originalFilePath - Original file path (for Vue files mapped to virtual .ts)
 */
export function extractRelationships(
  sourceFile: SourceFile,
  basePath: string,
  entityLookupMap: Map<string, TsMorphEntity[]>,
  originalFilePath?: string,
): TsMorphRelationship[] {
  const relationships: TsMorphRelationship[] = [];
  const filePath =
    originalFilePath ?? relative(basePath, sourceFile.getFilePath());

  // Build import map for this file
  const importMap = extractImportMap(sourceFile, basePath);

  // Call relationships - find all function calls
  sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((call) => {
    // Find the containing function/method
    let containingFn: Node | undefined = call;
    while (
      containingFn &&
      !containingFn.isKind(SyntaxKind.FunctionDeclaration) &&
      !containingFn.isKind(SyntaxKind.MethodDeclaration) &&
      !containingFn.isKind(SyntaxKind.ArrowFunction)
    ) {
      containingFn = containingFn.getParent();
    }

    let sourceName = filePath;
    if (containingFn) {
      if (containingFn.isKind(SyntaxKind.FunctionDeclaration)) {
        const fnName = containingFn.getName();
        if (fnName) {
          sourceName = fnName;
        }
      } else if (containingFn.isKind(SyntaxKind.MethodDeclaration)) {
        const methodName = containingFn.getName();
        const parentClass = containingFn.getParentIfKind(
          SyntaxKind.ClassDeclaration,
        );
        const className = parentClass?.getName();
        if (className && methodName) {
          sourceName = `${className}.${methodName}`;
        }
      } else if (containingFn.isKind(SyntaxKind.ArrowFunction)) {
        // Get name from parent variable declaration
        const varDecl = containingFn.getParentIfKind(
          SyntaxKind.VariableDeclaration,
        );
        const varName = varDecl?.getName();
        if (varName) {
          sourceName = varName;
        }
      }
    }

    // Resolve the called function to its definition
    const target = resolveCallTarget(
      call,
      filePath,
      basePath,
      entityLookupMap,
      importMap,
    );

    // Skip unresolvable calls (e.g., method calls, property access)
    if (target === null) {
      return;
    }

    // Only set targetFilePath for cross-file calls (when target is in a different file)
    const relationship: TsMorphRelationship = {
      sourceName,
      targetName: target.name,
      type: 'calls',
    };

    if (target.filePath !== filePath) {
      relationship.targetFilePath = target.filePath;
    }

    relationships.push(relationship);
  });

  // Class extends relationships
  sourceFile.getClasses().forEach((cls) => {
    const className = cls.getName();
    const extendsClause = cls.getExtends();

    if (className && extendsClause) {
      const baseClassName = extendsClause.getText();
      relationships.push({
        sourceName: className,
        targetName: baseClassName,
        type: 'extends',
      });
    }

    // Implements relationships
    cls.getImplements().forEach((impl) => {
      const interfaceName = impl.getText();
      if (className) {
        relationships.push({
          sourceName: className,
          targetName: interfaceName,
          type: 'implements',
        });
      }
    });
  });

  return relationships;
}

/**
 * Extract JSDoc content from a declaration node.
 * Returns null if no JSDoc exists or content is empty.
 *
 * @param node - ts-morph declaration node with JSDoc
 * @returns Formatted JSDoc content or null
 */
export function extractJsDocContent(node: {
  getJsDocs(): JSDoc[];
}): string | null {
  const jsDocs = node.getJsDocs();
  if (jsDocs.length === 0) {
    return null;
  }

  // Use first JSDoc block (standard pattern)
  const jsDoc = jsDocs[0];
  if (!jsDoc) return null;

  const description = jsDoc.getDescription().trim();
  const tags = jsDoc.getTags();

  // Skip empty JSDoc
  if (!description && tags.length === 0) {
    return null;
  }

  // Format: description + tags
  const tagLines = tags.map((tag) => {
    const tagName = tag.getTagName();
    const comment = tag.getCommentText() ?? '';
    return `@${tagName} ${comment}`.trim();
  });

  return [description, ...tagLines].filter(Boolean).join('\n');
}
