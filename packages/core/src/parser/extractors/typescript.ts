import type { Node } from 'web-tree-sitter';
import type { NewEntity } from '../../db/entities.js';

export interface TypeScriptExtractorOptions {
  filePath: string;
}

/**
 * Extracts TypeScript entities (functions, classes, types, interfaces) from a tree-sitter AST.
 */
export class TypeScriptExtractor {
  private filePath: string;
  private namedExports = new Set<string>();

  constructor(options: TypeScriptExtractorOptions) {
    this.filePath = options.filePath;
  }

  /**
   * Extract all entities from the root node of a TypeScript AST.
   */
  extract(rootNode: Node): NewEntity[] {
    const entities: NewEntity[] = [];

    // First pass: collect all named exports (e.g., export { Foo, Bar })
    this.collectNamedExports(rootNode);

    // Second pass: extract entities
    this.walkNode(rootNode, entities);

    return entities;
  }

  /**
   * Collect identifiers from named export statements.
   * Handles: export { Foo, Bar }, export { Foo as Bar }
   */
  private collectNamedExports(rootNode: Node): void {
    this.namedExports.clear();
    const exportStatements = rootNode.descendantsOfType('export_statement');

    for (const exportStmt of exportStatements) {
      const exportClause = exportStmt.children.find(
        (c) => c.type === 'export_clause'
      );
      if (exportClause) {
        // Find all export_specifier nodes (handles: export { Foo, Bar })
        const specifiers = exportClause.descendantsOfType('export_specifier');
        for (const spec of specifiers) {
          // The first identifier child is the local name
          const nameNode = spec.childForFieldName('name');
          if (nameNode) {
            this.namedExports.add(nameNode.text);
          }
        }
      }
    }
  }

  /**
   * Recursively walks the AST and extracts entities.
   * Note: This extracts entities at all levels, including nested ones.
   * Nested entities (e.g., a class inside a function) are extracted as separate
   * top-level entities. If scoped extraction is needed in the future,
   * consider adding a parentId field to track nesting.
   */
  private walkNode(node: Node, entities: NewEntity[]): void {
    switch (node.type) {
      case 'function_declaration':
        this.extractFunction(node, entities);
        break;
      case 'lexical_declaration':
      case 'variable_declaration':
        // Extract arrow functions: const x = () => {}
        // Also extract regular variables/constants
        this.extractVariableOrArrowFunction(node, entities);
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
    const isExported = this.isExported(node, name);
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

  /**
   * Extract variables, constants, or arrow functions from a declaration.
   * Arrow functions are extracted as 'function' type, others as 'variable' type.
   */
  private extractVariableOrArrowFunction(
    node: Node,
    entities: NewEntity[]
  ): void {
    // Determine the variable kind (const, let, var)
    const kind = this.getVariableKind(node);

    const declarators = node.descendantsOfType('variable_declarator');
    for (const declarator of declarators) {
      const nameNode = declarator.childForFieldName('name');
      const valueNode = declarator.childForFieldName('value');

      if (!nameNode) {
        continue;
      }

      const name = nameNode.text;
      const isExported = this.isExported(node.parent ?? node, name);

      // Check if this is an arrow function
      if (valueNode) {
        const arrowFunc = this.findDirectArrowFunction(valueNode);
        if (arrowFunc) {
          // Extract as function
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
          continue;
        }
      }

      // Extract as variable
      const typeAnnotation = this.extractTypeAnnotation(declarator);

      entities.push({
        type: 'variable',
        name,
        filePath: this.filePath,
        startLine: declarator.startPosition.row + 1,
        endLine: declarator.endPosition.row + 1,
        language: 'typescript',
        metadata: {
          exported: isExported,
          kind,
          typeAnnotation,
        },
      });
    }
  }

  /**
   * Get the variable kind (const, let, var) from a declaration node.
   */
  private getVariableKind(node: Node): 'const' | 'let' | 'var' {
    // lexical_declaration uses 'const' or 'let'
    // variable_declaration uses 'var'
    if (node.type === 'variable_declaration') {
      return 'var';
    }

    // Check for 'const' or 'let' keyword
    for (const child of node.children) {
      if (child.type === 'const') {
        return 'const';
      }
      if (child.type === 'let') {
        return 'let';
      }
    }

    return 'const'; // default fallback
  }

  /**
   * Extract type annotation from a variable declarator.
   */
  private extractTypeAnnotation(declarator: Node): string | undefined {
    const typeNode = declarator.childForFieldName('type');
    return typeNode?.text;
  }

  /**
   * Find an arrow function that is the direct value or wrapped in parentheses/type assertion.
   * Does NOT use descendantsOfType to avoid finding nested arrow functions.
   */
  private findDirectArrowFunction(valueNode: Node): Node | null {
    // Direct arrow function
    if (valueNode.type === 'arrow_function') {
      return valueNode;
    }

    // Unwrap common wrappers: parenthesized_expression, as_expression, type_assertion
    const wrapperTypes = ['parenthesized_expression', 'as_expression', 'type_assertion'];
    if (wrapperTypes.includes(valueNode.type)) {
      const inner = valueNode.children.find((c) => c.isNamed);
      if (inner?.type === 'arrow_function') {
        return inner;
      }
    }

    return null;
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
    return node.childForFieldName('return_type')?.text;
  }

  private isExported(node: Node, entityName?: string): boolean {
    // Check if entity is in named exports (e.g., export { Foo })
    if (entityName && this.namedExports.has(entityName)) {
      return true;
    }

    // Check if node or parent is wrapped in an export statement
    let current: Node | null = node;
    while (current) {
      if (
        current.type === 'export_statement' ||
        current.type === 'export_default_declaration'
      ) {
        return true;
      }
      current = current.parent;
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
    const isExported = this.isExported(node, name);
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
    const nameNode = node.childForFieldName('name');
    if (!nameNode) {
      return;
    }

    const name = nameNode.text;
    const isExported = this.isExported(node, name);
    const typeParameters = this.extractTypeParameters(node);

    entities.push({
      type: 'type',
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
  }

  private extractInterface(node: Node, entities: NewEntity[]): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) {
      return;
    }

    const name = nameNode.text;
    const isExported = this.isExported(node, name);
    const typeParameters = this.extractTypeParameters(node);

    entities.push({
      type: 'type',
      name,
      filePath: this.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      language: 'typescript',
      metadata: {
        exported: isExported,
        typeParameters,
        interface: true,
      },
    });
  }
}
