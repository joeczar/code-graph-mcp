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
    // Extract relationships based on node type
    if (node.type === 'call') {
      this.extractRequireRelationship(node, relationships, sourceCode);
      this.extractModuleOperationRelationship(node, relationships, sourceCode);
      this.extractMethodCallRelationship(node, relationships, sourceCode);
    } else if (node.type === 'class') {
      this.extractClassInheritanceRelationship(node, relationships, sourceCode);
    }

    // Recursively walk children
    for (const child of node.children) {
      this.walkNode(child, relationships, sourceCode);
    }
  }

  /**
   * Extract require/require_relative relationships
   */
  private extractRequireRelationship(
    callNode: SyntaxNode,
    relationships: ExtractedRelationship[],
    sourceCode: string
  ): void {
    const methodNode = callNode.childForFieldName('method');
    if (!methodNode) return;

    const methodName = methodNode.text;
    if (methodName !== 'require' && methodName !== 'require_relative') return;

    // Get the arguments
    const argumentsNode = callNode.childForFieldName('arguments');
    if (!argumentsNode) return;

    // Find string argument (usually first child that's a string)
    let modulePath: string | null = null;
    for (const arg of argumentsNode.children) {
      if (arg.type === 'string' || arg.type === 'simple_symbol') {
        // Extract text and remove quotes
        const text = arg.text;
        modulePath = text.replace(/^['":]+|['":]+$/g, '');
        break;
      }
    }

    if (!modulePath) return;

    relationships.push({
      type: 'imports',
      sourceName: this.getCurrentContext(callNode) || '<top-level>',
      sourceLocation: {
        line: callNode.startPosition.row + 1,
        column: callNode.startPosition.column,
      },
      targetName: modulePath,
      metadata: {
        requireType: methodName,
      },
    });
  }

  /**
   * Extract module operation relationships (include/extend/prepend)
   */
  private extractModuleOperationRelationship(
    callNode: SyntaxNode,
    relationships: ExtractedRelationship[],
    sourceCode: string
  ): void {
    const methodNode = callNode.childForFieldName('method');
    if (!methodNode) return;

    const methodName = methodNode.text;
    if (methodName !== 'include' && methodName !== 'extend' && methodName !== 'prepend') {
      return;
    }

    const sourceName = this.getCurrentContext(callNode);
    if (!sourceName) return; // Module operations must be within a context

    // Get the arguments (modules being included/extended/prepended)
    const argumentsNode = callNode.childForFieldName('arguments');
    if (!argumentsNode) return;

    // Process each module argument
    for (const arg of argumentsNode.children) {
      // Skip non-identifier nodes (like parentheses, commas)
      if (arg.type === 'identifier' || arg.type === 'constant') {
        const moduleName = arg.text;

        relationships.push({
          type: 'implements',
          sourceName,
          sourceLocation: {
            line: callNode.startPosition.row + 1,
            column: callNode.startPosition.column,
          },
          targetName: moduleName,
          metadata: {
            operation: methodName,
          },
        });
      }
    }
  }

  /**
   * Extract class inheritance relationships
   */
  private extractClassInheritanceRelationship(
    classNode: SyntaxNode,
    relationships: ExtractedRelationship[],
    sourceCode: string
  ): void {
    const nameNode = classNode.childForFieldName('name');
    if (!nameNode) return;

    const className = nameNode.text;

    // Check for superclass
    const superclassNode = classNode.childForFieldName('superclass');
    if (!superclassNode) return;

    const superclassName = superclassNode.text;

    relationships.push({
      type: 'extends',
      sourceName: className,
      sourceLocation: {
        line: classNode.startPosition.row + 1,
        column: classNode.startPosition.column,
      },
      targetName: superclassName,
    });
  }

  /**
   * Extract method call relationships
   */
  private extractMethodCallRelationship(
    callNode: SyntaxNode,
    relationships: ExtractedRelationship[],
    sourceCode: string
  ): void {
    const methodNode = callNode.childForFieldName('method');
    if (!methodNode) return;

    const methodName = methodNode.text;

    // Skip require/require_relative as they're handled separately
    if (methodName === 'require' || methodName === 'require_relative') return;

    // Skip module operations (handled separately)
    if (methodName === 'include' || methodName === 'extend' || methodName === 'prepend') {
      return;
    }

    const sourceName = this.getCurrentContext(callNode);
    if (!sourceName) return; // Only track calls within a named context

    // Get receiver if present (e.g., obj.method_name)
    const receiverNode = callNode.childForFieldName('receiver');
    const receiverName = receiverNode?.text || 'self';

    relationships.push({
      type: 'calls',
      sourceName,
      sourceLocation: {
        line: callNode.startPosition.row + 1,
        column: callNode.startPosition.column,
      },
      targetName: methodName,
      metadata: {
        receiver: receiverName,
      },
    });
  }

  /**
   * Get the current context (class, module, or method name)
   */
  private getCurrentContext(node: SyntaxNode): string | null {
    let current = node.parent;
    while (current) {
      if (current.type === 'class' || current.type === 'module') {
        const nameNode = current.childForFieldName('name');
        return nameNode?.text || null;
      }
      if (current.type === 'method') {
        const nameNode = current.childForFieldName('name');
        return nameNode?.text || null;
      }
      current = current.parent;
    }
    return null;
  }
}
