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
  extract(rootNode: SyntaxNode, _sourceCode: string): ExtractedRelationship[] {
    const relationships: ExtractedRelationship[] = [];

    // Will implement extraction logic in subsequent steps
    this.walkNode(rootNode, relationships, _sourceCode);

    return relationships;
  }

  private walkNode(
    node: SyntaxNode,
    relationships: ExtractedRelationship[],
    _sourceCode: string
  ): void {
    // Extract relationships based on node type
    if (node.type === 'call') {
      const methodNode = node.childForFieldName('method');
      if (methodNode) {
        const methodName = methodNode.text;
        if (methodName === 'require' || methodName === 'require_relative') {
          this.extractRequireRelationship(node, methodName, relationships);
        } else if (
          methodName === 'include' ||
          methodName === 'extend' ||
          methodName === 'prepend'
        ) {
          this.extractModuleOperationRelationship(node, methodName, relationships);
        } else {
          this.extractMethodCallRelationship(node, methodName, relationships);
        }
      }
    } else if (node.type === 'class') {
      this.extractClassInheritanceRelationship(node, relationships);
    }

    // Recursively walk children
    for (const child of node.children) {
      this.walkNode(child, relationships, _sourceCode);
    }
  }

  /**
   * Extract require/require_relative relationships
   */
  private extractRequireRelationship(
    callNode: SyntaxNode,
    methodName: string,
    relationships: ExtractedRelationship[]
  ): void {
    // Get the arguments
    const argumentsNode = callNode.childForFieldName('arguments');
    if (!argumentsNode) return;

    // Find string argument (usually first child that's a string)
    let modulePath: string | null = null;
    for (const arg of argumentsNode.children) {
      if (arg.type === 'string') {
        // Remove leading/trailing quotes
        modulePath = arg.text.slice(1, -1);
        break;
      }
      if (arg.type === 'simple_symbol') {
        // Remove leading colon
        modulePath = arg.text.slice(1);
        break;
      }
    }

    if (!modulePath) return;

    relationships.push({
      type: 'imports',
      sourceName: this.getCurrentContext(callNode) ?? '<top-level>',
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
    methodName: string,
    relationships: ExtractedRelationship[]
  ): void {
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
    relationships: ExtractedRelationship[]
  ): void {
    const nameNode = classNode.childForFieldName('name');
    if (!nameNode) return;

    const className = nameNode.text;

    // Check for superclass
    const superclassNode = classNode.childForFieldName('superclass');
    if (!superclassNode) return;

    // Get superclass name from the last child (the expression after '<')
    const superclassName = superclassNode.lastChild?.text;
    if (!superclassName) return;

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
    methodName: string,
    relationships: ExtractedRelationship[]
  ): void {
    const sourceName = this.getCurrentContext(callNode);
    if (!sourceName) return; // Only track calls within a named context

    // Get receiver if present (e.g., obj.method_name)
    const receiverNode = callNode.childForFieldName('receiver');
    const receiverName = receiverNode?.text ?? 'self';

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
      if (
        current.type === 'class' ||
        current.type === 'module' ||
        current.type === 'method'
      ) {
        const nameNode = current.childForFieldName('name');
        return nameNode?.text ?? null;
      }
      current = current.parent;
    }
    return null;
  }
}
