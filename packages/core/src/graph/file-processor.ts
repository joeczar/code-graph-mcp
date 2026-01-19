import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Tree } from 'web-tree-sitter';
import { CodeParser, type ParseResult } from '../parser/parser.js';
import { type Entity, type NewEntity, createEntityStore } from '../db/entities.js';
import {
  type Relationship,
  type NewRelationship,
  createRelationshipStore,
} from '../db/relationships.js';

// SyntaxNode type is not exported, we'll use Tree['rootNode']
type SyntaxNode = Tree['rootNode'];

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

    // Step 1: Read file and calculate hash
    let sourceCode: string;
    let fileHash: string;
    try {
      sourceCode = await readFile(filePath, 'utf-8');
      fileHash = createHash('sha256').update(sourceCode).digest('hex');
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      return {
        filePath,
        fileHash: '',
        language: '',
        entities: [],
        relationships: [],
        success: false,
        error: `Failed to read file: ${nodeErr.message}`,
      };
    }

    // Step 2: Parse file
    const parseResult = await this.parser.parseFile(filePath);
    if (!parseResult.success) {
      return {
        filePath,
        fileHash,
        language: '',
        entities: [],
        relationships: [],
        success: false,
        error: parseResult.error.message,
      };
    }

    const { tree, language } = parseResult.result;

    // Step 3: Extract entities and relationships
    const entities = this.extractEntities(tree.rootNode, filePath, language);
    const relationships = this.extractRelationships(
      tree.rootNode,
      filePath,
      language
    );

    // Step 4: Store in database
    const entityStore = createEntityStore(db);
    const relationshipStore = createRelationshipStore(db);

    const storedEntities: Entity[] = [];
    const entityNameToId = new Map<string, string>();

    // Store entities
    for (const entity of entities) {
      const stored = entityStore.create(entity);
      storedEntities.push(stored);
      entityNameToId.set(entity.name, stored.id);
    }

    // Store relationships (resolve names to IDs)
    const storedRelationships: Relationship[] = [];
    for (const rel of relationships) {
      const sourceId = entityNameToId.get(rel.sourceId);
      const targetId = entityNameToId.get(rel.targetId);

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
    // Extract function declarations
    if (node.type === 'function_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        entities.push({
          type: 'function',
          name: nameNode.text,
          filePath,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          language,
        });
      }
    }

    // Extract class declarations
    if (node.type === 'class_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        entities.push({
          type: 'class',
          name: nameNode.text,
          filePath,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          language,
        });
      }
    }

    // Extract method definitions
    if (node.type === 'method_definition') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        entities.push({
          type: 'method',
          name: nameNode.text,
          filePath,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          language,
        });
      }
    }

    // Recurse into children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.extractTypeScriptEntities(child, filePath, language, entities);
      }
    }
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
    // Extract method definitions
    if (node.type === 'method') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        entities.push({
          type: 'function',
          name: nameNode.text,
          filePath,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          language,
        });
      }
    }

    // Extract class definitions
    if (node.type === 'class') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        entities.push({
          type: 'class',
          name: nameNode.text,
          filePath,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          language,
        });
      }
    }

    // Extract module definitions
    if (node.type === 'module') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        entities.push({
          type: 'module',
          name: nameNode.text,
          filePath,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          language,
        });
      }
    }

    // Recurse into children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.extractRubyEntities(child, filePath, language, entities);
      }
    }
  }

  /**
   * Extract relationships from AST.
   *
   * Simplified implementation - will be replaced with dedicated extractors.
   * Returns relationships with entity names (not IDs) - will be resolved later.
   */
  private extractRelationships(
    node: SyntaxNode,
    filePath: string,
    language: string
  ): Array<Omit<NewRelationship, 'sourceId' | 'targetId'> & { sourceId: string; targetId: string }> {
    const relationships: Array<Omit<NewRelationship, 'sourceId' | 'targetId'> & { sourceId: string; targetId: string }> = [];

    // TypeScript/JavaScript relationships
    if (language === 'typescript' || language === 'javascript') {
      this.extractTypeScriptRelationships(node, filePath, relationships);
    }
    // Ruby relationships
    else if (language === 'ruby') {
      this.extractRubyRelationships(node, filePath, relationships);
    }

    return relationships;
  }

  /**
   * Extract TypeScript/JavaScript relationships.
   * For now, just extracts class inheritance and imports.
   */
  private extractTypeScriptRelationships(
    node: SyntaxNode,
    filePath: string,
    relationships: Array<Omit<NewRelationship, 'sourceId' | 'targetId'> & { sourceId: string; targetId: string }>
  ): void {
    // Extract class inheritance
    if (node.type === 'class_declaration') {
      const nameNode = node.childForFieldName('name');
      const heritageNode = node.childForFieldName('heritage');

      if (nameNode && heritageNode) {
        const extendsClause = heritageNode.children.find(
          (child: SyntaxNode) => child.type === 'extends_clause'
        );
        if (extendsClause) {
          const superClass = extendsClause.children.find(
            (child: SyntaxNode) => child.type === 'identifier'
          );
          if (superClass) {
            relationships.push({
              sourceId: nameNode.text,
              targetId: superClass.text,
              type: 'extends',
            });
          }
        }
      }
    }

    // Recurse into children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.extractTypeScriptRelationships(child, filePath, relationships);
      }
    }
  }

  /**
   * Extract Ruby relationships.
   * For now, just extracts class inheritance.
   */
  private extractRubyRelationships(
    node: SyntaxNode,
    filePath: string,
    relationships: Array<Omit<NewRelationship, 'sourceId' | 'targetId'> & { sourceId: string; targetId: string }>
  ): void {
    // Extract class inheritance
    if (node.type === 'class') {
      const nameNode = node.childForFieldName('name');
      const superclassNode = node.childForFieldName('superclass');

      if (nameNode && superclassNode) {
        relationships.push({
          sourceId: nameNode.text,
          targetId: superclassNode.text,
          type: 'extends',
        });
      }
    }

    // Recurse into children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.extractRubyRelationships(child, filePath, relationships);
      }
    }
  }
}
