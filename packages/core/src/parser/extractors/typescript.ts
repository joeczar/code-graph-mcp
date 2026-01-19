import type { Node } from 'web-tree-sitter';
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
  extract(rootNode: Node): NewEntity[] {
    const entities: NewEntity[] = [];

    // We'll walk the AST and extract entities
    this.walkNode(rootNode, entities);

    return entities;
  }

  private walkNode(node: Node, entities: NewEntity[]): void {
    // Process current node
    switch (node.type) {
      case 'function_declaration':
        this.extractFunction(node, entities);
        break;
      case 'lexical_declaration':
      case 'variable_declaration':
        // Check for arrow functions: const x = () => {}
        this.extractArrowFunction(node, entities);
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

  private extractFunction(node: Node, entities: NewEntity[]): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) {
      return;
    }

    const name = nameNode.text;
    const isExported = this.isExported(node);
    const isAsync = this.hasModifier(node, 'async');
    const isGenerator = this.hasModifier(node, 'generator');

    const parameters = this.extractParameters(node);
    const returnType = this.extractReturnType(node);

    entities.push({
      type: 'function',
      name,
      filePath: this.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      language: 'typescript',
      metadata: {
        exported: isExported,
        async: isAsync,
        generator: isGenerator,
        parameters,
        returnType,
      },
    });
  }

  private extractArrowFunction(node: Node, entities: NewEntity[]): void {
    // Look for arrow_function in variable declarator
    const declarators = node.descendantsOfType('variable_declarator');
    for (const declarator of declarators) {
      const nameNode = declarator.childForFieldName('name');
      const valueNode = declarator.childForFieldName('value');

      if (!nameNode || !valueNode) {
        continue;
      }

      // Check if value is an arrow function
      if (
        valueNode.type === 'arrow_function' ||
        valueNode.descendantsOfType('arrow_function').length > 0
      ) {
        const arrowFunc =
          valueNode.type === 'arrow_function'
            ? valueNode
            : valueNode.descendantsOfType('arrow_function')[0];

        if (!arrowFunc) {
          continue;
        }

        const name = nameNode.text;
        const isExported = this.isExported(node.parent ?? node);
        const isAsync = this.hasModifier(arrowFunc, 'async');

        const parameters = this.extractParameters(arrowFunc);
        const returnType = this.extractReturnType(arrowFunc);

        entities.push({
          type: 'function',
          name,
          filePath: this.filePath,
          startLine: declarator.startPosition.row + 1,
          endLine: declarator.endPosition.row + 1,
          language: 'typescript',
          metadata: {
            exported: isExported,
            async: isAsync,
            arrowFunction: true,
            parameters,
            returnType,
          },
        });
      }
    }
  }

  private extractParameters(node: Node): string[] {
    const params: string[] = [];
    const paramsNode = node.childForFieldName('parameters');

    if (paramsNode) {
      for (const child of paramsNode.children) {
        if (
          child.type === 'required_parameter' ||
          child.type === 'optional_parameter'
        ) {
          const pattern = child.childForFieldName('pattern');
          if (pattern) {
            params.push(pattern.text);
          }
        }
      }
    }

    return params;
  }

  private extractReturnType(node: Node): string | undefined {
    const returnTypeNode = node.childForFieldName('return_type');
    if (returnTypeNode) {
      return returnTypeNode.text;
    }
    return undefined;
  }

  private isExported(node: Node): boolean {
    // Check if node has export keyword
    let current: Node | null = node;
    while (current) {
      if (current.type === 'export_statement') {
        return true;
      }
      current = current.parent;
    }

    // Check children for export keyword
    for (const child of node.children) {
      if (child.type === 'export') {
        return true;
      }
    }

    return false;
  }

  private hasModifier(node: Node, modifier: string): boolean {
    for (const child of node.children) {
      if (child.type === modifier) {
        return true;
      }
    }
    return false;
  }

  private extractClass(node: Node, entities: NewEntity[]): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) {
      return;
    }

    const name = nameNode.text;
    const isExported = this.isExported(node);
    const typeParameters = this.extractTypeParameters(node);

    // Extract the class entity
    entities.push({
      type: 'class',
      name,
      filePath: this.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      language: 'typescript',
      metadata: {
        exported: isExported,
        typeParameters,
      },
    });

    // Extract methods within the class
    this.extractClassMethods(node, entities, name);
  }

  private extractClassMethods(
    classNode: Node,
    entities: NewEntity[],
    className: string
  ): void {
    const bodyNode = classNode.childForFieldName('body');
    if (!bodyNode) {
      return;
    }

    for (const child of bodyNode.children) {
      if (child.type === 'method_definition') {
        const methodName = child.childForFieldName('name');
        if (!methodName) {
          continue;
        }

        const name = methodName.text;
        const isAsync = this.hasModifier(child, 'async');
        const isGenerator = this.hasModifier(child, 'generator');
        const isStatic = this.hasModifier(child, 'static');

        const parameters = this.extractParameters(child);
        const returnType = this.extractReturnType(child);

        entities.push({
          type: 'method',
          name: `${className}.${name}`,
          filePath: this.filePath,
          startLine: child.startPosition.row + 1,
          endLine: child.endPosition.row + 1,
          language: 'typescript',
          metadata: {
            className,
            methodName: name,
            async: isAsync,
            generator: isGenerator,
            static: isStatic,
            parameters,
            returnType,
          },
        });
      }
    }
  }

  private extractTypeParameters(node: Node): string[] | undefined {
    const typeParamsNode = node.childForFieldName('type_parameters');
    if (!typeParamsNode) {
      return undefined;
    }

    const params: string[] = [];
    for (const child of typeParamsNode.children) {
      if (child.type === 'type_parameter') {
        const nameNode = child.childForFieldName('name');
        if (nameNode) {
          params.push(nameNode.text);
        }
      }
    }

    return params.length > 0 ? params : undefined;
  }

  private extractTypeAlias(node: Node, entities: NewEntity[]): void {
    // Placeholder - will implement in Step 4
  }

  private extractInterface(node: Node, entities: NewEntity[]): void {
    // Placeholder - will implement in Step 4
  }
}
