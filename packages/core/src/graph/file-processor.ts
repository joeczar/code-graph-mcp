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

/**
 * FileProcessor orchestrates parsing a file and storing the results in the database.
 *
 * Currently uses simplified inline extraction until dedicated extractors are implemented
 * (issues #12-16).
 */
export class FileProcessor {
  private parser: CodeParser;

  constructor() {
    this.parser = new CodeParser();
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
    const relationships = await this.extractRelationships(tree.rootNode, language, parseResult.result);

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

          // Skip relationships where we can't resolve both entities
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
   * Extract Ruby entities from AST.
   */
  private extractRubyEntities(
    node: SyntaxNode,
    filePath: string,
    language: string,
    entities: NewEntity[]
  ): void {
    const nodeTypeToEntityType: Record<string, EntityType> = {
      method: 'method',
      class: 'class',
      module: 'module',
    };

    const entityType = nodeTypeToEntityType[node.type];
    if (entityType) {
      const entity = createEntityFromNode(node, entityType, filePath, language);
      if (entity) entities.push(entity);
    }

    forEachChild(node, child => {
      this.extractRubyEntities(child, filePath, language, entities);
    });
  }

  /**
   * Extract relationships from AST using dedicated extractors.
   * Returns relationships with entity names (not IDs) - will be resolved later.
   */
  private async extractRelationships(
    node: SyntaxNode,
    language: string,
    parseResult: { tree: Tree; filePath: string; language: string; sourceCode: string }
  ): Promise<PendingRelationship[]> {
    const relationships: PendingRelationship[] = [];

    if (language === 'typescript' || language === 'javascript') {
      this.extractTypeScriptRelationships(node, relationships);
    } else if (language === 'ruby') {
      this.extractRubyRelationships(node, relationships);
    } else if (language === 'vue') {
      await this.extractVueRelationships(parseResult, relationships);
    }

    return relationships;
  }

  /**
   * Extract TypeScript/JavaScript relationships using dedicated extractor.
   */
  private extractTypeScriptRelationships(
    node: SyntaxNode,
    relationships: PendingRelationship[]
  ): void {
    const extractor = new TypeScriptRelationshipExtractor();

    // Create a ParseResult-like object for the extractor
    const parseResult = {
      tree: { rootNode: node } as Tree,
      filePath: '', // File path not needed for relationship extraction
      language: 'typescript' as const,
      sourceCode: node.text,
    };

    const extractedRelationships = extractor.extract(parseResult);

    // Convert ExtractedRelationship to PendingRelationship format
    for (const rel of extractedRelationships) {
      relationships.push({
        sourceName: rel.sourceName,
        targetName: rel.targetName,
        type: rel.type,
        ...(rel.metadata && { metadata: rel.metadata }),
      });
    }
  }

  /**
   * Extract Ruby relationships using dedicated extractor.
   */
  private extractRubyRelationships(
    node: SyntaxNode,
    relationships: PendingRelationship[]
  ): void {
    const extractor = new RubyRelationshipExtractor();
    const extractedRelationships = extractor.extract(node);

    // Convert ExtractedRelationship to PendingRelationship format
    for (const rel of extractedRelationships) {
      relationships.push({
        sourceName: rel.sourceName,
        targetName: rel.targetName,
        type: rel.type,
        ...(rel.metadata && { metadata: rel.metadata }),
      });
    }
  }

  /**
   * Extract Vue relationships using dedicated extractor.
   */
  private async extractVueRelationships(
    parseResult: { tree: Tree; filePath: string; language: string; sourceCode: string },
    relationships: PendingRelationship[]
  ): Promise<void> {
    const extractor = new VueRelationshipExtractor();
    const extractedRelationships = await extractor.extract(parseResult);

    // Convert ExtractedRelationship to PendingRelationship format
    for (const rel of extractedRelationships) {
      relationships.push({
        sourceName: rel.sourceName,
        targetName: rel.targetName,
        type: rel.type,
        ...(rel.metadata && { metadata: rel.metadata }),
      });
    }
  }
}
