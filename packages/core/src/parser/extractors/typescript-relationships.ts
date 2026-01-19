import type { Tree } from 'web-tree-sitter';
import type { ParseResult } from '../parser.js';

// Using the actual node type from tree-sitter
type SyntaxNode = ReturnType<Tree['rootNode']['child']> & { type: string; text: string };

export type ExtractedRelationshipType = 'imports' | 'calls' | 'extends' | 'implements';

export interface ExtractedRelationship {
  type: ExtractedRelationshipType;
  sourceName: string;
  sourceLocation?: { line: number; column: number };
  targetName: string;
  metadata?: Record<string, unknown>;
}

export class TypeScriptRelationshipExtractor {
  extract(parseResult: ParseResult): ExtractedRelationship[] {
    const relationships: ExtractedRelationship[] = [];
    const tree = parseResult.tree;
    const sourceCode = parseResult.sourceCode;

    // Extract all relationship types
    relationships.push(...this.extractImports(tree, sourceCode));
    relationships.push(...this.extractCalls(tree, sourceCode));
    relationships.push(...this.extractClassInheritance(tree, sourceCode));
    relationships.push(...this.extractInterfaceImplementations(tree, sourceCode));

    return relationships;
  }

  private extractImports(tree: Tree, _sourceCode: string): ExtractedRelationship[] {
    const relationships: ExtractedRelationship[] = [];
    const importStatements = tree.rootNode.descendantsOfType('import_statement');

    for (const importNode of importStatements) {
      const sourceNode = importNode.childForFieldName('source');
      if (!sourceNode) continue;

      // Remove quotes from module path
      const targetName = sourceNode.text.slice(1, -1);

      const metadata: Record<string, unknown> = {};
      const importClause = importNode.child(1);

      if (importClause?.type === 'import_clause') {
        // Handle named imports: import { foo, bar } from 'module'
        const namedImports = importClause.descendantsOfType('import_specifier');
        if (namedImports.length > 0) {
          metadata['named'] = namedImports.map(spec => {
            const name = spec.childForFieldName('name');
            return name?.text ?? '';
          }).filter(name => name !== '');
        }

        // Handle default import: import React from 'module'
        // First child of import_clause is the identifier for default imports
        const firstChild = importClause.child(0);
        if (firstChild?.type === 'identifier') {
          metadata['default'] = firstChild.text;
        }

        // Handle namespace import: import * as fs from 'module'
        const namespaceImport = importClause.descendantsOfType('namespace_import');
        if (namespaceImport.length > 0) {
          // Find the identifier child of namespace_import
          const identifiers = namespaceImport[0]?.descendantsOfType('identifier');
          if (identifiers && identifiers.length > 0) {
            metadata['namespace'] = identifiers[0]?.text;
          }
        }
      }

      relationships.push({
        type: 'imports',
        sourceName: '<file>',
        sourceLocation: {
          line: importNode.startPosition.row + 1,
          column: importNode.startPosition.column,
        },
        targetName,
        metadata,
      });
    }

    return relationships;
  }

  private extractCalls(tree: Tree, _sourceCode: string): ExtractedRelationship[] {
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
          column: callNode.startPosition.column,
        },
        targetName,
      });
    }

    return relationships;
  }

  private extractClassInheritance(tree: Tree, _sourceCode: string): ExtractedRelationship[] {
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
            column: extendsNode.startPosition.column,
          },
          targetName: parentClassName,
        });
      }
    }

    return relationships;
  }

  private extractInterfaceImplementations(tree: Tree, _sourceCode: string): ExtractedRelationship[] {
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
                column: child.startPosition.column,
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

  private findContainingFunction(node: SyntaxNode): SyntaxNode | null {
    let current: SyntaxNode | null = node.parent;

    while (current) {
      if (
        current.type === 'function_declaration' ||
        current.type === 'method_definition' ||
        current.type === 'arrow_function' ||
        current.type === 'function_expression'
      ) {
        return current;
      }
      current = current.parent;
    }

    return null;
  }

  private getFunctionName(functionNode: SyntaxNode): string | null {
    if (functionNode.type === 'function_declaration' || functionNode.type === 'method_definition') {
      const name = functionNode.childForFieldName('name');
      return name?.text ?? null;
    }

    // For arrow functions and function expressions, try to find the variable name
    if (functionNode.type === 'arrow_function' || functionNode.type === 'function_expression') {
      const parent = functionNode.parent;
      if (parent?.type === 'variable_declarator') {
        const name = parent.childForFieldName('name');
        return name?.text ?? null;
      }
    }

    return null;
  }

  private getCalledFunctionName(functionNode: SyntaxNode): string | null {
    if (functionNode.type === 'identifier') {
      return functionNode.text;
    }

    if (functionNode.type === 'member_expression') {
      const property = functionNode.childForFieldName('property');
      return property?.text ?? null;
    }

    return null;
  }

  private getTypeName(typeNode: SyntaxNode): string | null {
    if (typeNode.type === 'type_identifier' || typeNode.type === 'identifier') {
      return typeNode.text;
    }

    // Handle nested types (e.g., generic types)
    const identifier = typeNode.descendantsOfType('type_identifier')[0];
    return identifier?.text ?? null;
  }
}
