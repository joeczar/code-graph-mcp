import type { Tree } from 'web-tree-sitter';
import type { RelationshipType } from '../../db/relationships.js';

export interface ExtractedRelationship {
  type: RelationshipType;
  sourceName: string;
  sourceLocation?: { line: number; column: number };
  targetName: string;
  metadata?: Record<string, unknown>;
}

type SyntaxNode = Tree['rootNode'];

export class RubyRelationshipExtractor {
  /**
   * Extract all relationships from a Ruby AST
   */
  extract(rootNode: SyntaxNode, sourceCode: string): ExtractedRelationship[] {
    const relationships: ExtractedRelationship[] = [];

    // Will implement extraction logic in subsequent steps
    this.walkNode(rootNode, relationships, sourceCode);

    return relationships;
  }

  private walkNode(
    node: SyntaxNode,
    relationships: ExtractedRelationship[],
    sourceCode: string
  ): void {
    // Base implementation - will be expanded
    for (const child of node.children) {
      this.walkNode(child, relationships, sourceCode);
    }
  }
}
