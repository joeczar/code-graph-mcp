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
  private contextStack: string[] = [];

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
      case 'assignment': {
        const entity = this.extractConstant(node);
        if (entity) entities.push(entity);
        break;
      }
      case 'class': {
        const entity = this.extractClass(node);
        if (entity) {
          entities.push(entity);
          // Push class name onto context stack
          this.contextStack.push(entity.name);
          // Walk children with this context
          for (const child of node.children) {
            this.walkNode(child, entities);
          }
          // Pop context when exiting class
          this.contextStack.pop();
          return; // Skip normal child walking
        }
        break;
      }
      case 'module': {
        const entity = this.extractModule(node);
        if (entity) {
          entities.push(entity);
          // Push module name onto context stack
          this.contextStack.push(entity.name);
          // Walk children with this context
          for (const child of node.children) {
            this.walkNode(child, entities);
          }
          // Pop context when exiting module
          this.contextStack.pop();
          return; // Skip normal child walking
        }
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

    const methodName = nameNode.text;
    const params = this.extractParameters(node);

    // Build fully qualified name using context stack
    let qualifiedName: string;
    if (this.contextStack.length === 0) {
      // Top-level method, no prefix
      qualifiedName = methodName;
    } else {
      // Method inside class/module
      const contextPath = this.contextStack.join('::');
      const separator = methodType === 'instance' ? '#' : '.';
      qualifiedName = `${contextPath}${separator}${methodName}`;
    }

    const metadata: Record<string, unknown> = {
      methodName,
      parameters: params,
      methodType,
    };

    // Add context if present
    if (this.contextStack.length > 0) {
      metadata['context'] = this.contextStack.join('::');
    }

    return {
      type: 'method',
      name: qualifiedName,
      filePath: this.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      language: 'ruby',
      metadata,
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

  /**
   * Extract a constant entity from an assignment node.
   * Only processes assignments where the left side is a constant (UPPERCASE).
   */
  private extractConstant(node: Node): NewEntity | null {
    const leftNode = node.childForFieldName('left');
    if (!leftNode?.type || leftNode.type !== 'constant') return null;

    const constantName = leftNode.text;

    // Build qualified name using context stack
    let qualifiedName: string;
    if (this.contextStack.length === 0) {
      // Top-level constant
      qualifiedName = constantName;
    } else {
      // Constant inside class/module
      const contextPath = this.contextStack.join('::');
      qualifiedName = `${contextPath}::${constantName}`;
    }

    const metadata: Record<string, unknown> = {
      kind: 'constant',
      constantName,
    };

    // Add context if present
    if (this.contextStack.length > 0) {
      metadata['context'] = this.contextStack.join('::');
    }

    return {
      type: 'variable',
      name: qualifiedName,
      filePath: this.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      language: 'ruby',
      metadata,
    };
  }

  private extractParameters(node: Node): string[] {
    const paramsNode = node.childForFieldName('parameters');
    if (!paramsNode) return [];

    // Handle all Ruby parameter types:
    // - identifier: simple positional (foo)
    // - optional_parameter: default values (bar = 1)
    // - keyword_parameter: keyword args (bar:, baz: 1)
    // - splat_parameter: *args
    // - hash_splat_parameter: **kwargs
    // - block_parameter: &block
    const validParamTypes = [
      'identifier',
      'optional_parameter',
      'keyword_parameter',
      'splat_parameter',
      'hash_splat_parameter',
      'block_parameter',
    ];

    return paramsNode.children
      .filter((child) => validParamTypes.includes(child.type))
      .map((child) => child.text);
  }
}
