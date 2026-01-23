import type { Node, Tree } from 'web-tree-sitter';
import type { ParseResult } from '../parser.js';

export type ExtractedRelationshipType = 'imports' | 'calls' | 'extends' | 'implements';

export interface ExtractedRelationship {
  type: ExtractedRelationshipType;
  sourceName: string;
  sourceLocation?: { line: number; column: number };
  targetName: string;
  /** File path where the target entity is defined (for cross-file resolution) */
  targetFilePath?: string;
  /** File path where the source entity is defined (for cross-file resolution) */
  sourceFilePath?: string;
  metadata?: Record<string, unknown>;
}

export class TypeScriptRelationshipExtractor {
  private filePath: string | null = null;

  extract(parseResult: ParseResult): ExtractedRelationship[] {
    const relationships: ExtractedRelationship[] = [];
    const tree = parseResult.tree;
    this.filePath = parseResult.filePath;

    relationships.push(...this.extractImports(tree));
    relationships.push(...this.extractCalls(tree));
    relationships.push(...this.extractClassInheritance(tree));
    relationships.push(...this.extractInterfaceImplementations(tree));

    return relationships;
  }

  private extractImports(tree: Tree): ExtractedRelationship[] {
    const relationships: ExtractedRelationship[] = [];
    const importStatements = tree.rootNode.descendantsOfType('import_statement');

    for (const importNode of importStatements) {
      const sourceNode = importNode.childForFieldName('source');
      if (!sourceNode) continue;

      // Remove quotes from module path
      const targetName = sourceNode.text.slice(1, -1);

      const metadata: Record<string, unknown> = {};
      // Find import_clause by type instead of magic index
      const importClause = importNode.children.find(c => c.type === 'import_clause');

      if (importClause) {
        // Handle named imports: import { foo, bar } from 'module'
        const namedImports = importClause.descendantsOfType('import_specifier');
        if (namedImports.length > 0) {
          metadata['named'] = namedImports.map(spec => {
            const name = spec.childForFieldName('name');
            return name?.text ?? '';
          }).filter(name => name !== '');
        }

        // Handle default import: import React from 'module'
        // The default import identifier is a direct child of import_clause
        const defaultImport = importClause.children.find(c => c.type === 'identifier');
        if (defaultImport) {
          metadata['default'] = defaultImport.text;
        }

        // Handle namespace import: import * as fs from 'module'
        const namespaceImport = importClause.descendantsOfType('namespace_import');
        if (namespaceImport.length > 0) {
          const identifier = namespaceImport[0]?.children.find(c => c.type === 'identifier');
          if (identifier) {
            metadata['namespace'] = identifier.text;
          }
        }
      }

      relationships.push({
        type: 'imports',
        sourceName: this.filePath ?? '<file>',
        sourceLocation: {
          line: importNode.startPosition.row + 1,
          column: importNode.startPosition.column + 1,
        },
        targetName,
        metadata,
      });
    }

    return relationships;
  }

  private extractCalls(tree: Tree): ExtractedRelationship[] {
    const relationships: ExtractedRelationship[] = [];
    const callExpressions = tree.rootNode.descendantsOfType('call_expression');

    for (const callNode of callExpressions) {
      // Find which function/method contains this call
      const containingFunction = this.findContainingFunction(callNode);
      if (!containingFunction) continue;

      const sourceName = this.getFunctionName(containingFunction);
      if (!sourceName) continue;

      // Get the called function name
      const functionNode = callNode.childForFieldName('function');
      if (!functionNode) continue;

      const targetName = this.getCalledFunctionName(functionNode);
      if (!targetName) continue;

      relationships.push({
        type: 'calls',
        sourceName,
        sourceLocation: {
          line: callNode.startPosition.row + 1,
          column: callNode.startPosition.column + 1,
        },
        targetName,
      });
    }

    return relationships;
  }

  private extractClassInheritance(tree: Tree): ExtractedRelationship[] {
    const relationships: ExtractedRelationship[] = [];
    const classDeclarations = tree.rootNode.descendantsOfType('class_declaration');

    for (const classNode of classDeclarations) {
      const className = classNode.childForFieldName('name')?.text;
      if (!className) continue;

      // Look for class_heritage node
      const heritage = classNode.descendantsOfType('class_heritage');
      if (heritage.length === 0) continue;

      // Look for extends_clause within class_heritage
      const extendsClauses = heritage[0]?.descendantsOfType('extends_clause');
      if (!extendsClauses) continue;

      for (const extendsNode of extendsClauses) {
        const valueNode = extendsNode.childForFieldName('value');
        if (!valueNode) continue;

        const parentClassName = this.getTypeName(valueNode);
        if (!parentClassName) continue;

        relationships.push({
          type: 'extends',
          sourceName: className,
          sourceLocation: {
            line: extendsNode.startPosition.row + 1,
            column: extendsNode.startPosition.column + 1,
          },
          targetName: parentClassName,
        });
      }
    }

    return relationships;
  }

  private extractInterfaceImplementations(tree: Tree): ExtractedRelationship[] {
    const relationships: ExtractedRelationship[] = [];
    const classDeclarations = tree.rootNode.descendantsOfType('class_declaration');

    for (const classNode of classDeclarations) {
      const className = classNode.childForFieldName('name')?.text;
      if (!className) continue;

      // Look for class_heritage node
      const heritage = classNode.descendantsOfType('class_heritage');
      if (heritage.length === 0) continue;

      const implementsClauses = heritage[0]?.descendantsOfType('implements_clause');
      if (!implementsClauses) continue;

      for (const implementsNode of implementsClauses) {
        // implements_clause contains type_identifier nodes as direct children
        // Skip the first child which is the "implements" keyword
        for (let i = 0; i < implementsNode.childCount; i++) {
          const child = implementsNode.child(i);
          if (child?.type === 'type_identifier') {
            const interfaceName = child.text;
            if (!interfaceName) continue;

            relationships.push({
              type: 'implements',
              sourceName: className,
              sourceLocation: {
                line: child.startPosition.row + 1,
                column: child.startPosition.column + 1,
              },
              targetName: interfaceName,
            });
          }
        }
      }
    }

    return relationships;
  }

  // Helper methods

  private findContainingFunction(node: Node): Node | null {
    const functionTypes = new Set([
      'function_declaration',
      'method_definition',
      'arrow_function',
      'function_expression',
    ]);

    let current: Node | null = node.parent;
    while (current) {
      if (functionTypes.has(current.type)) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  private getFunctionName(functionNode: Node): string | null {
    // Direct name field for function declarations and methods
    if (functionNode.type === 'function_declaration' || functionNode.type === 'method_definition') {
      return functionNode.childForFieldName('name')?.text ?? null;
    }

    // For arrow functions and function expressions, check parent variable declarator
    if (functionNode.type === 'arrow_function' || functionNode.type === 'function_expression') {
      if (functionNode.parent?.type === 'variable_declarator') {
        return functionNode.parent.childForFieldName('name')?.text ?? null;
      }
    }

    return null;
  }

  private getCalledFunctionName(functionNode: Node): string | null {
    if (functionNode.type === 'identifier') {
      return functionNode.text;
    }
    if (functionNode.type === 'member_expression') {
      return functionNode.childForFieldName('property')?.text ?? null;
    }
    return null;
  }

  private getTypeName(typeNode: Node): string | null {
    if (typeNode.type === 'type_identifier' || typeNode.type === 'identifier') {
      return typeNode.text;
    }
    // Handle nested types (e.g., generic types)
    return typeNode.descendantsOfType('type_identifier')[0]?.text ?? null;
  }
}
