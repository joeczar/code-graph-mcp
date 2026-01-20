import type { Node } from 'web-tree-sitter';
import type { NewEntity } from '../../db/entities.js';

export interface RubyExtractorOptions {
  filePath: string;
}

/**
 * Extracts code entities from Ruby AST.
 * Supports: methods, classes, modules.
 */
export class RubyExtractor {
  private filePath: string;

  constructor(options: RubyExtractorOptions) {
    this.filePath = options.filePath;
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
    switch (node.type) {
      case 'method': {
        const entity = this.extractMethodEntity(node, 'instance');
        if (entity) entities.push(entity);
        break;
      }
      case 'singleton_method': {
        const entity = this.extractMethodEntity(node, 'class');
        if (entity) entities.push(entity);
        break;
      }
      case 'class': {
        const entity = this.extractClass(node);
        if (entity) entities.push(entity);
        break;
      }
      case 'module': {
        const entity = this.extractModule(node);
        if (entity) entities.push(entity);
        break;
      }
    }

    // Recursively walk children
    for (const child of node.children) {
      this.walkNode(child, entities);
    }
  }

  /**
   * Extract a method entity (both instance and singleton/class methods).
   */
  private extractMethodEntity(
    node: Node,
    methodType: 'instance' | 'class'
  ): NewEntity | null {
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
        methodType,
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
      // Extract superclass name using AST traversal instead of string manipulation.
      // The superclass node contains a constant or scope_resolution child.
      const superclassName = this.extractSuperclassName(superclassNode);
      if (superclassName) {
        entity.metadata = {
          superclass: superclassName,
        };
      }
    }

    return entity;
  }

  /**
   * Extract the superclass name from a superclass node using AST traversal.
   */
  private extractSuperclassName(superclassNode: Node): string | null {
    // Find the constant or scope_resolution child that holds the class name
    const nameNode = superclassNode.children.find(
      (c) => c.type === 'constant' || c.type === 'scope_resolution'
    );
    return nameNode?.text ?? null;
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
      if (child?.type === 'identifier') {
        params.push(child.text);
      }
    }

    return params;
  }
}
