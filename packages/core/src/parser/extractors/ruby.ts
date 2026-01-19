import type { Node } from 'web-tree-sitter';
import type { NewEntity } from '../../db/entities.js';

export interface RubyExtractorOptions {
  filePath: string;
  sourceCode: string;
}

/**
 * Extracts code entities from Ruby AST.
 * Supports: methods, classes, modules.
 */
export class RubyExtractor {
  private filePath: string;
  private sourceCode: string;

  constructor(options: RubyExtractorOptions) {
    this.filePath = options.filePath;
    this.sourceCode = options.sourceCode;
  }

  /**
   * Extract all entities from the provided Ruby AST root node.
   */
  extract(rootNode: Node): NewEntity[] {
    const entities: NewEntity[] = [];

    // Walk the tree and collect all entity types
    this.walkNode(rootNode, entities);

    return entities;
  }

  private walkNode(node: Node, entities: NewEntity[]): void {
    // Extract based on node type
    if (node.type === 'method') {
      const entity = this.extractMethod(node);
      if (entity) entities.push(entity);
    } else if (node.type === 'singleton_method') {
      const entity = this.extractSingletonMethod(node);
      if (entity) entities.push(entity);
    } else if (node.type === 'class') {
      const entity = this.extractClass(node);
      if (entity) entities.push(entity);
    } else if (node.type === 'module') {
      const entity = this.extractModule(node);
      if (entity) entities.push(entity);
    }

    // Recursively walk children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.walkNode(child, entities);
      }
    }
  }

  private extractMethod(node: Node): NewEntity | null {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return null;

    const name = nameNode.text;
    const params = this.extractParameters(node);

    return {
      type: 'method',
      name,
      filePath: this.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      language: 'ruby',
      metadata: {
        parameters: params,
        methodType: 'instance',
      },
    };
  }

  private extractSingletonMethod(node: Node): NewEntity | null {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return null;

    const name = nameNode.text;
    const params = this.extractParameters(node);

    return {
      type: 'method',
      name,
      filePath: this.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      language: 'ruby',
      metadata: {
        parameters: params,
        methodType: 'class',
      },
    };
  }

  private extractClass(node: Node): NewEntity | null {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return null;

    const name = nameNode.text;
    const superclassNode = node.childForFieldName('superclass');

    const entity: NewEntity = {
      type: 'class',
      name,
      filePath: this.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      language: 'ruby',
    };

    if (superclassNode) {
      entity.metadata = {
        superclass: superclassNode.text,
      };
    }

    return entity;
  }

  private extractModule(node: Node): NewEntity | null {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return null;

    const name = nameNode.text;

    return {
      type: 'module',
      name,
      filePath: this.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      language: 'ruby',
    };
  }

  private extractParameters(node: Node): string[] {
    const paramsNode = node.childForFieldName('parameters');
    if (!paramsNode) return [];

    const params: string[] = [];
    for (let i = 0; i < paramsNode.childCount; i++) {
      const child = paramsNode.child(i);
      if (child && child.type === 'identifier') {
        params.push(child.text);
      }
    }

    return params;
  }
}
