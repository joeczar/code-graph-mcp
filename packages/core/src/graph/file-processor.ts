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

/**
 * Finds a child node matching a predicate.
 */
function findChild(
  node: SyntaxNode,
  predicate: (child: SyntaxNode) => boolean
): SyntaxNode | undefined {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && predicate(child)) return child;
  }
  return undefined;
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

    // Step 3: Extract entities and relationships
    const entities = this.extractEntities(tree.rootNode, filePath, language);
    const relationships = this.extractRelationships(tree.rootNode, language);

    // Step 4: Store in database
    const entityStore = createEntityStore(db);
    const relationshipStore = createRelationshipStore(db);

    const storedEntities: Entity[] = [];
    // Use name as key for relationship resolution.
    // Note: Names are not guaranteed unique within a file (e.g., same method name in different classes).
    // For now, we warn about collisions and use the last entity with that name.
    // A more robust solution would use qualified names or location-based keys.
    const entityNameToId = new Map<string, string>();
    const nameCollisions: string[] = [];

    // Store entities
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

    // Store relationships (resolve names to IDs)
    const storedRelationships: Relationship[] = [];
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
   * Extract relationships from AST.
   *
   * Simplified implementation - will be replaced with dedicated extractors.
   * Returns relationships with entity names (not IDs) - will be resolved later.
   */
  private extractRelationships(
    node: SyntaxNode,
    language: string
  ): PendingRelationship[] {
    const relationships: PendingRelationship[] = [];

    if (language === 'typescript' || language === 'javascript') {
      this.extractTypeScriptRelationships(node, relationships);
    } else if (language === 'ruby') {
      this.extractRubyRelationships(node, relationships);
    }

    return relationships;
  }

  /**
   * Extract TypeScript/JavaScript class inheritance relationships.
   */
  private extractTypeScriptRelationships(
    node: SyntaxNode,
    relationships: PendingRelationship[]
  ): void {
    if (node.type === 'class_declaration') {
      const nameNode = node.childForFieldName('name');
      const heritageNode = node.children.find(c => c.type === 'class_heritage');

      if (nameNode && heritageNode) {
        const extendsClause = heritageNode.children.find(
          c => c.type === 'extends_clause'
        );
        const identifier = extendsClause?.children.find(
          c => c.type === 'identifier'
        );
        if (identifier) {
          relationships.push({
            sourceName: nameNode.text,
            targetName: identifier.text,
            type: 'extends',
          });
        }
      }
    }

    forEachChild(node, child => {
      this.extractTypeScriptRelationships(child, relationships);
    });
  }

  /**
   * Extract Ruby class inheritance relationships.
   */
  private extractRubyRelationships(
    node: SyntaxNode,
    relationships: PendingRelationship[]
  ): void {
    if (node.type === 'class') {
      const nameNode = node.childForFieldName('name');
      const superclassNode = node.childForFieldName('superclass');

      if (nameNode && superclassNode) {
        const constant = findChild(superclassNode, c => c.type === 'constant');
        if (constant) {
          relationships.push({
            sourceName: nameNode.text,
            targetName: constant.text,
            type: 'extends',
          });
        }
      }
    }

    forEachChild(node, child => {
      this.extractRubyRelationships(child, relationships);
    });
  }
}
