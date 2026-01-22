import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import type { Tree } from 'web-tree-sitter';
import { CodeParser } from '../parser/parser.js';
import { type Entity, type NewEntity, createEntityStore } from '../db/entities.js';
import {
  type Relationship,
  type NewRelationship,
  createRelationshipStore,
} from '../db/relationships.js';
import { TypeScriptRelationshipExtractor } from '../parser/extractors/typescript-relationships.js';
import { RubyRelationshipExtractor } from '../parser/extractors/ruby-relationships.js';
import { VueRelationshipExtractor } from '../parser/extractors/vue-relationships.js';
import { RubyExtractor } from '../parser/extractors/ruby.js';
import { RubyLSPParser, RubyLSPNotAvailableError } from '../parser/ruby-lsp-parser.js';

type SyntaxNode = Tree['rootNode'];

type EntityType = NewEntity['type'];

/**
 * Relationship with entity names instead of database IDs.
 * Names are resolved to IDs during storage.
 */
type PendingRelationship = Omit<NewRelationship, 'sourceId' | 'targetId'> & {
  sourceName: string;
  targetName: string;
};

/**
 * Converts an extracted relationship to a pending relationship.
 */
function toPendingRelationship(rel: {
  sourceName: string;
  targetName: string;
  type: PendingRelationship['type'];
  metadata?: Record<string, unknown>;
}): PendingRelationship {
  return {
    sourceName: rel.sourceName,
    targetName: rel.targetName,
    type: rel.type,
    ...(rel.metadata && { metadata: rel.metadata }),
  };
}

/**
 * Creates an entity from an AST node if it has a name field.
 */
function createEntityFromNode(
  node: SyntaxNode,
  type: EntityType,
  filePath: string,
  language: string
): NewEntity | null {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return null;

  return {
    type,
    name: nameNode.text,
    filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    language,
  };
}

/**
 * Iterates over all children of a node, calling the callback for each.
 */
function forEachChild(node: SyntaxNode, callback: (child: SyntaxNode) => void): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) callback(child);
  }
}


export interface ProcessFileOptions {
  filePath: string;
  db: Database.Database;
}

export interface ProcessFileResult {
  filePath: string;
  fileHash: string;
  language: string;
  entities: Entity[];
  relationships: Relationship[];
  success: boolean;
  error?: string;
}

export interface FileProcessorOptions {
  /** Enable Ruby LSP integration for cross-file method resolution (optional) */
  useRubyLSP?: boolean;
  /** Path to Ruby executable (defaults to 'ruby') */
  rubyPath?: string;
}

/**
 * FileProcessor orchestrates parsing a file and storing the results in the database.
 *
 * Currently uses simplified inline extraction until dedicated extractors are implemented
 * (issues #12-16).
 */
export class FileProcessor {
  private parser: CodeParser;
  private rubyLSPParser: RubyLSPParser | null = null;
  private useRubyLSP: boolean;

  constructor(options: FileProcessorOptions = {}) {
    this.parser = new CodeParser();
    this.useRubyLSP = options.useRubyLSP ?? false;

    if (this.useRubyLSP) {
      this.rubyLSPParser = new RubyLSPParser(
        options.rubyPath ? { rubyPath: options.rubyPath } : {}
      );
    }
  }

  /**
   * Process a single file: parse, extract entities/relationships, store in DB.
   */
  async processFile(options: ProcessFileOptions): Promise<ProcessFileResult> {
    const { filePath, db } = options;

    // Step 1: Parse file (this also reads the file content)
    const parseResult = await this.parser.parseFile(filePath);
    if (!parseResult.success) {
      return {
        filePath,
        fileHash: '',
        language: '',
        entities: [],
        relationships: [],
        success: false,
        error: parseResult.error.message,
      };
    }

    const { tree, language, sourceCode } = parseResult.result;

    // Step 2: Calculate hash from parsed source code
    const fileHash = createHash('sha256').update(sourceCode).digest('hex');

    // Step 3: Calculate total lines in file
    const totalLines = sourceCode.split('\n').length;

    // Step 4: Extract entities and relationships
    const entities = this.extractEntities(tree.rootNode, filePath, language);
    const relationships = await this.extractRelationships(
      tree.rootNode,
      language,
      tree,
      sourceCode,
      filePath
    );

    // Step 5: Store in database
    const entityStore = createEntityStore(db);
    const relationshipStore = createRelationshipStore(db);

    const storedEntities: Entity[] = [];
    const storedRelationships: Relationship[] = [];

    // Use name as key for relationship resolution.
    // Note: Names are not guaranteed unique within a file (e.g., same method name in different classes).
    // For now, we warn about collisions and use the last entity with that name.
    // A more robust solution would use qualified names or location-based keys.
    const entityNameToId = new Map<string, string>();
    const nameCollisions: string[] = [];

    try {
      // Wrap database operations in a transaction for atomicity
      const transaction = db.transaction(() => {
        // Create File entity first
        const fileEntity: NewEntity = {
          type: 'file',
          name: filePath,
          filePath,
          startLine: 1,
          endLine: totalLines,
          language,
          metadata: { contentHash: fileHash },
        };
        const storedFileEntity = entityStore.create(fileEntity);
        storedEntities.push(storedFileEntity);

        // Store code entities
        for (const entity of entities) {
          const stored = entityStore.create(entity);
          storedEntities.push(stored);
          if (entityNameToId.has(entity.name)) {
            nameCollisions.push(entity.name);
          }
          entityNameToId.set(entity.name, stored.id);
        }

        // Log warning for name collisions (indicates potential data quality issues)
        if (nameCollisions.length > 0) {
          console.warn(
            `[FileProcessor] Name collisions detected in ${filePath}: ${nameCollisions.join(', ')}. ` +
            'Relationships may be incorrectly resolved.'
          );
        }

        // Store code relationships (resolve names to IDs)
        for (const rel of relationships) {
          const sourceId = entityNameToId.get(rel.sourceName);
          const targetId = entityNameToId.get(rel.targetName);

          // Skip relationships where we can't resolve both entities within this file.
          // This is acceptable for now since cross-file resolution is future work.
          // Common cases that are skipped:
          // - Calls to external functions/methods (e.g., console.log, Array.map)
          // - Imports from external modules (e.g., 'node:fs', './other-file')
          // - References to undefined entities in the current file
          if (!sourceId || !targetId) {
            continue;
          }

          const stored = relationshipStore.create({
            sourceId,
            targetId,
            type: rel.type,
            ...(rel.metadata && { metadata: rel.metadata }),
          });
          storedRelationships.push(stored);
        }

        // Create contains relationships from File to all code entities
        // storedEntities[0] is the file entity, the rest are code entities
        for (const codeEntity of storedEntities.slice(1)) {
          const containsRel = relationshipStore.create({
            sourceId: storedFileEntity.id,
            targetId: codeEntity.id,
            type: 'contains',
          });
          storedRelationships.push(containsRel);
        }
      });

      transaction();
    } catch (error) {
      return {
        filePath,
        fileHash,
        language,
        entities: [],
        relationships: [],
        success: false,
        error: `Database transaction failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    return {
      filePath,
      fileHash,
      language,
      entities: storedEntities,
      relationships: storedRelationships,
      success: true,
    };
  }

  /**
   * Extract entities from AST.
   *
   * Simplified implementation - will be replaced with dedicated extractors.
   */
  private extractEntities(
    node: SyntaxNode,
    filePath: string,
    language: string
  ): NewEntity[] {
    const entities: NewEntity[] = [];

    // TypeScript/JavaScript extraction
    if (language === 'typescript' || language === 'javascript') {
      this.extractTypeScriptEntities(node, filePath, language, entities);
    }
    // Ruby extraction
    else if (language === 'ruby') {
      this.extractRubyEntities(node, filePath, language, entities);
    }

    return entities;
  }

  /**
   * Extract TypeScript/JavaScript entities from AST.
   */
  private extractTypeScriptEntities(
    node: SyntaxNode,
    filePath: string,
    language: string,
    entities: NewEntity[]
  ): void {
    const nodeTypeToEntityType: Record<string, EntityType> = {
      function_declaration: 'function',
      class_declaration: 'class',
      method_definition: 'method',
    };

    const entityType = nodeTypeToEntityType[node.type];
    if (entityType) {
      const entity = createEntityFromNode(node, entityType, filePath, language);
      if (entity) entities.push(entity);
    }

    forEachChild(node, child => {
      this.extractTypeScriptEntities(child, filePath, language, entities);
    });
  }

  /**
   * Extract Ruby entities from AST using dedicated RubyExtractor.
   */
  private extractRubyEntities(
    node: SyntaxNode,
    filePath: string,
    language: string,
    entities: NewEntity[]
  ): void {
    const extractor = new RubyExtractor({ filePath });
    const extracted = extractor.extract(node);
    entities.push(...extracted);
  }

  /**
   * Extract relationships from AST using dedicated extractors.
   * Returns relationships with entity names (not IDs) - will be resolved later.
   */
  private async extractRelationships(
    node: SyntaxNode,
    language: string,
    tree: Tree,
    sourceCode: string,
    filePath: string
  ): Promise<PendingRelationship[]> {
    const relationships: PendingRelationship[] = [];

    if (language === 'typescript' || language === 'javascript') {
      this.extractTypeScriptRelationships(tree, sourceCode, filePath, relationships);
    } else if (language === 'ruby') {
      await this.extractRubyRelationships(node, filePath, relationships);
    } else if (language === 'vue') {
      await this.extractVueRelationships(tree, sourceCode, filePath, relationships);
    }

    return relationships;
  }

  /**
   * Extract TypeScript/JavaScript relationships using dedicated extractor.
   */
  private extractTypeScriptRelationships(
    tree: Tree,
    sourceCode: string,
    filePath: string,
    relationships: PendingRelationship[]
  ): void {
    const extractor = new TypeScriptRelationshipExtractor();
    const parseResult = {
      tree,
      filePath,
      language: 'typescript' as const,
      sourceCode,
    };

    const extracted = extractor.extract(parseResult);
    relationships.push(...extracted.map(toPendingRelationship));
  }

  /**
   * Extract Ruby relationships using dedicated extractor.
   * Optionally enhances with Ruby LSP data for cross-file resolution.
   */
  private async extractRubyRelationships(
    node: SyntaxNode,
    filePath: string,
    relationships: PendingRelationship[]
  ): Promise<void> {
    // Always extract tree-sitter relationships
    const extractor = new RubyRelationshipExtractor();
    const extracted = extractor.extract(node);
    relationships.push(...extracted.map(toPendingRelationship));

    // Optionally enhance with Ruby LSP relationships (cross-file method resolution)
    if (this.useRubyLSP && this.rubyLSPParser) {
      try {
        const lspResult = await this.rubyLSPParser.parse([filePath]);
        relationships.push(...lspResult.relationships.map(toPendingRelationship));
      } catch (error) {
        if (error instanceof RubyLSPNotAvailableError) {
          // Fall back to tree-sitter only - warn since user explicitly enabled this feature
          console.warn('[FileProcessor] Ruby LSP not available, falling back to tree-sitter only. Install gem: gem install ruby-lsp');
        } else {
          // Log other errors but continue processing
          console.warn(
            `[FileProcessor] Ruby LSP failed for ${filePath}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  }

  /**
   * Extract Vue relationships using dedicated extractor.
   */
  private async extractVueRelationships(
    tree: Tree,
    sourceCode: string,
    filePath: string,
    relationships: PendingRelationship[]
  ): Promise<void> {
    const extractor = new VueRelationshipExtractor();
    const parseResult = {
      tree,
      filePath,
      language: 'vue' as const,
      sourceCode,
    };

    const extracted = await extractor.extract(parseResult);
    relationships.push(...extracted.map(toPendingRelationship));
  }
}
