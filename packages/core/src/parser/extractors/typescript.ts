import type { SyntaxNode } from 'web-tree-sitter';
import type { NewEntity } from '../../db/entities.js';

export interface TypeScriptExtractorOptions {
  filePath: string;
  sourceCode: string;
}

/**
 * Extracts TypeScript entities (functions, classes, types, interfaces) from a tree-sitter AST.
 */
export class TypeScriptExtractor {
  private filePath: string;
  private sourceCode: string;

  constructor(options: TypeScriptExtractorOptions) {
    this.filePath = options.filePath;
    this.sourceCode = options.sourceCode;
  }

  /**
   * Extract all entities from the root node of a TypeScript AST.
   */
  extract(rootNode: SyntaxNode): NewEntity[] {
    const entities: NewEntity[] = [];

    // We'll walk the AST and extract entities
    this.walkNode(rootNode, entities);

    return entities;
  }

  private walkNode(node: SyntaxNode, entities: NewEntity[]): void {
    // Process current node
    switch (node.type) {
      case 'function_declaration':
        this.extractFunction(node, entities);
        break;
      case 'class_declaration':
        this.extractClass(node, entities);
        break;
      case 'type_alias_declaration':
        this.extractTypeAlias(node, entities);
        break;
      case 'interface_declaration':
        this.extractInterface(node, entities);
        break;
    }

    // Recursively process children
    for (const child of node.children) {
      this.walkNode(child, entities);
    }
  }

  private extractFunction(node: SyntaxNode, entities: NewEntity[]): void {
    // Placeholder - will implement in next step
  }

  private extractClass(node: SyntaxNode, entities: NewEntity[]): void {
    // Placeholder - will implement in Step 3
  }

  private extractTypeAlias(node: SyntaxNode, entities: NewEntity[]): void {
    // Placeholder - will implement in Step 4
  }

  private extractInterface(node: SyntaxNode, entities: NewEntity[]): void {
    // Placeholder - will implement in Step 4
  }
}
