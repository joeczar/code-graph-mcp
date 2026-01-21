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

const REQUIRE_METHODS = new Set(['require', 'require_relative']);
const MODULE_OPERATIONS = new Set(['include', 'extend', 'prepend']);

export class RubyRelationshipExtractor {
  /**
   * Extract all relationships from a Ruby AST.
   */
  extract(rootNode: SyntaxNode): ExtractedRelationship[] {
    const relationships: ExtractedRelationship[] = [];
    this.walkNode(rootNode, relationships);
    return relationships;
  }

  private walkNode(
    node: SyntaxNode,
    relationships: ExtractedRelationship[]
  ): void {
    if (node.type === 'call') {
      this.extractCallRelationships(node, relationships);
    } else if (node.type === 'class') {
      this.extractClassInheritanceRelationship(node, relationships);
    }

    for (const child of node.children) {
      this.walkNode(child, relationships);
    }
  }

  private extractCallRelationships(
    callNode: SyntaxNode,
    relationships: ExtractedRelationship[]
  ): void {
    const methodNode = callNode.childForFieldName('method');
    if (!methodNode) return;

    const methodName = methodNode.text;

    if (REQUIRE_METHODS.has(methodName)) {
      this.extractRequireRelationship(callNode, methodName, relationships);
    } else if (MODULE_OPERATIONS.has(methodName)) {
      this.extractModuleOperationRelationship(callNode, methodName, relationships);
    } else {
      this.extractMethodCallRelationship(callNode, methodName, relationships);
    }
  }

  /**
   * Extract require/require_relative relationships.
   */
  private extractRequireRelationship(
    callNode: SyntaxNode,
    methodName: string,
    relationships: ExtractedRelationship[]
  ): void {
    const argumentsNode = callNode.childForFieldName('arguments');
    if (!argumentsNode) return;

    const modulePath = this.extractModulePath(argumentsNode);
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
   * Extract the module path from require arguments.
   * Handles both string literals and symbols.
   */
  private extractModulePath(argumentsNode: SyntaxNode): string | null {
    const stringArg = argumentsNode.children.find((arg) => arg.type === 'string');
    if (stringArg) {
      return stringArg.text.slice(1, -1); // Remove quotes
    }

    const symbolArg = argumentsNode.children.find((arg) => arg.type === 'simple_symbol');
    if (symbolArg) {
      return symbolArg.text.slice(1); // Remove leading colon
    }

    return null;
  }

  /**
   * Extract module operation relationships (include/extend/prepend).
   */
  private extractModuleOperationRelationship(
    callNode: SyntaxNode,
    methodName: string,
    relationships: ExtractedRelationship[]
  ): void {
    const sourceName = this.getCurrentContext(callNode);
    if (!sourceName) return; // Module operations must be within a context

    const argumentsNode = callNode.childForFieldName('arguments');
    if (!argumentsNode) return;

    const moduleArgs = argumentsNode.children.filter(
      (arg) => arg.type === 'identifier' || arg.type === 'constant'
    );

    for (const arg of moduleArgs) {
      relationships.push({
        type: 'implements',
        sourceName,
        sourceLocation: {
          line: callNode.startPosition.row + 1,
          column: callNode.startPosition.column,
        },
        targetName: arg.text,
        metadata: {
          operation: methodName,
        },
      });
    }
  }

  /**
   * Extract class inheritance relationships.
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
   * Extract method call relationships.
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
   * Get the current context (class, module, or method name).
   * Returns fully qualified name using Ruby conventions:
   * - Module::Class for nested structures
   * - Class#method for instance methods
   * - Class.method for class methods
   */
  private getCurrentContext(node: SyntaxNode): string | null {
    const contextParts: string[] = [];
    let current = node.parent;
    let immediateParent: SyntaxNode | null = null;

    // Walk up the tree collecting all class/module/method names
    while (current) {
      if (
        current.type === 'class' ||
        current.type === 'module' ||
        current.type === 'method' ||
        current.type === 'singleton_method'
      ) {
        const nameNode = current.childForFieldName('name');
        if (nameNode) {
          contextParts.unshift(nameNode.text);
          immediateParent ??= current;
        }
      }
      current = current.parent;
    }

    if (contextParts.length === 0) return null;

    // Build qualified name with appropriate separators
    if (contextParts.length === 1) {
      return contextParts[0] ?? null;
    }

    // Check if the immediate parent is a method
    if (
      immediateParent &&
      (immediateParent.type === 'method' || immediateParent.type === 'singleton_method')
    ) {
      // For calls within methods, return the method's fully qualified name
      const methodName = contextParts.pop();
      if (!methodName) return null;
      const contextPath = contextParts.join('::');
      const separator = immediateParent.type === 'singleton_method' ? '.' : '#';
      return contextPath ? `${contextPath}${separator}${methodName}` : methodName;
    }

    // For calls within classes/modules (but not in a method), join with ::
    return contextParts.join('::');
  }
}
