import type { Node } from 'web-tree-sitter';
import type { NewEntity } from '../../db/entities.js';
import { CodeParser } from '../parser.js';
import { TypeScriptExtractor } from './typescript.js';
import { getScriptContent, getScriptElement } from './vue-utils.js';

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

    const isSetup = this.isScriptSetup(rootNode);
    const metadata: Record<string, unknown> = {
      exported: true,
      componentType: isSetup ? 'composition' : 'options',
    };

    // Extract props, emits, computed, methods from Options API
    if (!isSetup) {
      const scriptContent = getScriptContent(rootNode);
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
    const scriptContent = getScriptContent(rootNode);
    if (!scriptContent) {
      return [];
    }

    // tree-sitter-typescript can parse both JS and TS
    const scriptElement = getScriptElement(rootNode);

    // Parse script content with TypeScript parser
    const parseResult = await this.parser.parse(scriptContent, 'typescript');
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
    return rootNode.descendantsOfType('script_element').some((scriptEl) => {
      const startTag = scriptEl.descendantsOfType('start_tag')[0];
      if (!startTag) return false;
      return startTag.descendantsOfType('attribute').some((attr) => {
        const name = attr.childForFieldName('name')?.text;
        // Boolean attribute 'setup' may not have a name field
        return name === 'setup' || attr.text === 'setup';
      });
    });
  }

  /**
   * Shared helper for extracting props/emits from Options API.
   */
  private extractOptionsArray(
    scriptContent: string,
    pattern: RegExp,
    itemPattern: RegExp,
    captureGroup: number
  ): string[] | undefined {
    const match = pattern.exec(scriptContent);
    if (!match?.[1]) return undefined;

    const items = match[1]
      .split(',')
      .map((item) => itemPattern.exec(item.trim())?.[captureGroup])
      .filter((name): name is string => name !== undefined);

    return items.length > 0 ? items : undefined;
  }

  /**
   * Extract props from Options API (simple string extraction).
   */
  private extractPropsFromOptions(scriptContent: string): string[] | undefined {
    return this.extractOptionsArray(
      scriptContent,
      /props:\s*\{([^}]+)\}/s,
      /^(['"])?(\w+)\1?\s*:/,
      2
    );
  }

  /**
   * Extract emits from Options API (simple string extraction).
   */
  private extractEmitsFromOptions(scriptContent: string): string[] | undefined {
    return this.extractOptionsArray(
      scriptContent,
      /emits:\s*\[([^\]]+)\]/,
      /['"](\w+)['"]/,
      1
    );
  }
}
