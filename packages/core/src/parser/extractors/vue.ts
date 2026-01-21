import type { Node } from 'web-tree-sitter';
import type { NewEntity } from '../../db/entities.js';
import { CodeParser } from '../parser.js';
import { TypeScriptExtractor } from './typescript.js';

export interface VueExtractorOptions {
  filePath: string;
}

/**
 * Extracts Vue component entities from a tree-sitter AST.
 * Handles both Options API and Composition API (<script setup>).
 */
export class VueExtractor {
  private filePath: string;
  private parser: CodeParser;

  constructor(options: VueExtractorOptions) {
    this.filePath = options.filePath;
    this.parser = new CodeParser();
  }

  /**
   * Extract all entities from the root node of a Vue AST.
   */
  async extract(rootNode: Node): Promise<NewEntity[]> {
    const entities: NewEntity[] = [];

    // Extract the component entity
    const componentEntity = this.extractComponent(rootNode);
    if (componentEntity) {
      entities.push(componentEntity);
    }

    // Extract detailed entities from script section using TypeScript parser
    const scriptEntities = await this.extractScriptEntities(rootNode);
    entities.push(...scriptEntities);

    return entities;
  }

  /**
   * Extract the Vue component as a high-level entity.
   */
  private extractComponent(rootNode: Node): NewEntity | null {
    // Try to infer component name from filename
    const filename = this.filePath.split('/').pop() ?? 'Component';
    const componentName = filename.replace(/\.vue$/, '');

    // Find script_element to get component location
    const scriptElement = rootNode.descendantsOfType('script_element')[0];
    const startLine = scriptElement?.startPosition.row ?? 0;
    const endLine = rootNode.endPosition.row;

    const metadata: Record<string, unknown> = {
      exported: true,
      componentType: this.isScriptSetup(rootNode) ? 'composition' : 'options',
    };

    // Extract props, emits, computed, methods from Options API
    if (!this.isScriptSetup(rootNode)) {
      const scriptContent = this.getScriptContent(rootNode);
      if (scriptContent) {
        metadata['props'] = this.extractPropsFromOptions(scriptContent);
        metadata['emits'] = this.extractEmitsFromOptions(scriptContent);
      }
    }

    return {
      type: 'class', // Use 'class' type for Vue components
      name: componentName,
      filePath: this.filePath,
      startLine: startLine + 1,
      endLine: endLine + 1,
      language: 'vue',
      metadata,
    };
  }

  /**
   * Extract script content and parse with TypeScript extractor.
   */
  private async extractScriptEntities(rootNode: Node): Promise<NewEntity[]> {
    const scriptContent = this.getScriptContent(rootNode);
    if (!scriptContent) {
      return [];
    }

    // tree-sitter-typescript can parse both JS and TS
    const scriptElement = rootNode.descendantsOfType('script_element')[0];
    const language = 'typescript';

    // Parse script content with TypeScript parser
    const parseResult = await this.parser.parse(scriptContent, language);
    if (!parseResult.success) {
      return [];
    }

    // Extract entities using TypeScriptExtractor
    const tsExtractor = new TypeScriptExtractor({
      filePath: this.filePath,
    });

    const entities = tsExtractor.extract(parseResult.result.tree.rootNode);

    // Adjust line numbers to account for script tag offset
    const scriptStartLine = scriptElement?.startPosition.row ?? 0;
    return entities.map((entity) => ({
      ...entity,
      language: 'vue', // Mark as Vue language
      startLine: entity.startLine + scriptStartLine,
      endLine: entity.endLine + scriptStartLine,
    }));
  }

  /**
   * Check if component uses <script setup>.
   */
  private isScriptSetup(rootNode: Node): boolean {
    const scriptElements = rootNode.descendantsOfType('script_element');
    for (const scriptEl of scriptElements) {
      const startTag = scriptEl.descendantsOfType('start_tag')[0];
      if (!startTag) continue;

      for (const attr of startTag.descendantsOfType('attribute')) {
        const name = attr.childForFieldName('name')?.text;
        // Boolean attribute 'setup' may not have a name field
        if (name === 'setup' || attr.text === 'setup') {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Extract raw script content from Vue file.
   */
  private getScriptContent(rootNode: Node): string | null {
    const scriptElements = rootNode.descendantsOfType('script_element');
    if (scriptElements.length === 0) return null;

    const scriptElement = scriptElements[0];
    if (!scriptElement) return null;

    // Find raw_text node inside script_element
    const rawText = scriptElement.descendantsOfType('raw_text')[0];
    if (!rawText) return null;

    return rawText.text;
  }

  /**
   * Extract props from Options API (simple string extraction).
   */
  private extractPropsFromOptions(scriptContent: string): string[] | undefined {
    // Simple regex to find props definition
    const propsRegex = /props:\s*\{([^}]+)\}/s;
    const propsMatch = propsRegex.exec(scriptContent);
    if (!propsMatch) return undefined;

    const propsContent = propsMatch[1];
    if (!propsContent) return undefined;

    // Extract prop names (handles both object and array syntax)
    const propNameRegex = /^(['"])?(\w+)\1?\s*:/;
    const propNames = propsContent
      .split(',')
      .map((line) => {
        const match = propNameRegex.exec(line.trim());
        return match?.[2];
      })
      .filter((name): name is string => name !== undefined);

    return propNames.length > 0 ? propNames : undefined;
  }

  /**
   * Extract emits from Options API (simple string extraction).
   */
  private extractEmitsFromOptions(scriptContent: string): string[] | undefined {
    // Simple regex to find emits definition
    const emitsRegex = /emits:\s*\[([^\]]+)\]/;
    const emitsMatch = emitsRegex.exec(scriptContent);
    if (!emitsMatch) return undefined;

    const emitsContent = emitsMatch[1];
    if (!emitsContent) return undefined;

    // Extract emit names
    const emitNameRegex = /['"](\w+)['"]/;
    const emitNames = emitsContent
      .split(',')
      .map((item) => {
        const match = emitNameRegex.exec(item.trim());
        return match?.[1];
      })
      .filter((name): name is string => name !== undefined);

    return emitNames.length > 0 ? emitNames : undefined;
  }
}
