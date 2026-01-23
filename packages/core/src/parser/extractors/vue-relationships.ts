import type { Node } from 'web-tree-sitter';
import { resolve, dirname } from 'node:path';
import type { ParseResult } from '../parser.js';
import { CodeParser } from '../parser.js';
import {
  TypeScriptRelationshipExtractor,
  type ExtractedRelationship,
} from './typescript-relationships.js';
import { getScriptContent, getScriptElement } from './vue-utils.js';

// Fix #7: Common HTML5 tags at module scope to avoid recreating Set on each call
const HTML_TAGS = new Set([
  // Document structure
  'html', 'head', 'body', 'title', 'meta', 'link', 'script', 'style', 'noscript',
  // Content sectioning
  'header', 'footer', 'nav', 'main', 'section', 'article', 'aside', 'address',
  // Text content
  'div', 'span', 'p', 'pre', 'blockquote', 'figure', 'figcaption', 'hr',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  // Headings
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // Inline text semantics
  'a', 'em', 'strong', 'small', 'cite', 'q', 'abbr', 'code', 'var', 'kbd', 'samp',
  'sub', 'sup', 's', 'u', 'mark', 'ruby', 'rt', 'rp', 'bdi', 'bdo', 'br', 'wbr',
  'b', 'i', 'time', 'data', 'dfn',
  // Media
  'img', 'picture', 'source', 'video', 'audio', 'track', 'map', 'area',
  'iframe', 'embed', 'object', 'param', 'canvas', 'svg', 'math',
  // Tables
  'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  // Forms
  'form', 'fieldset', 'legend', 'label', 'input', 'button', 'select', 'datalist',
  'optgroup', 'option', 'textarea', 'output', 'progress', 'meter',
  // Interactive
  'details', 'summary', 'dialog', 'menu',
  // Web components / Vue special
  'template', 'slot', 'component', 'transition', 'keep-alive', 'teleport', 'suspense',
]);

/**
 * Extracts relationships from Vue Single File Components.
 */
export class VueRelationshipExtractor {
  private parser: CodeParser;

  constructor() {
    this.parser = new CodeParser();
  }

  async extract(parseResult: ParseResult): Promise<ExtractedRelationship[]> {
    const relationships: ExtractedRelationship[] = [];

    // Extract component name from file path (or use default if no path)
    const filename = parseResult.filePath?.split('/').pop() ?? 'Component.vue';
    const componentName = filename.replace(/\.vue$/, '');

    // Extract imports and other relationships from script section
    const scriptRelationships = await this.extractScriptRelationships(
      parseResult.tree.rootNode,
      parseResult.filePath
    );
    relationships.push(...scriptRelationships);

    // Build component import map for cross-file resolution
    const componentImportMap = this.buildComponentImportMap(
      scriptRelationships,
      parseResult.filePath
    );

    // Extract component relationships from template
    const componentRelationships = this.extractComponentRelationships(
      parseResult.tree.rootNode,
      componentName,
      componentImportMap
    );
    relationships.push(...componentRelationships);

    return relationships;
  }

  /**
   * Extract relationships from the script section using TypeScriptRelationshipExtractor.
   */
  private async extractScriptRelationships(
    rootNode: Node,
    filePath?: string | null
  ): Promise<ExtractedRelationship[]> {
    const scriptContent = getScriptContent(rootNode);
    if (!scriptContent) {
      return [];
    }

    // Parse script content with TypeScript parser (handles both JS and TS)
    const parseResult = await this.parser.parse(scriptContent, 'typescript');
    if (!parseResult.success) {
      const fileContext = filePath ? ` in ${filePath}` : '';
      console.warn(
        `[VueRelationshipExtractor] Failed to parse script${fileContext}: ${parseResult.error.message}. ` +
          'Relationship extraction will be incomplete for this file.'
      );
      return [];
    }

    try {
      // Extract relationships using TypeScriptRelationshipExtractor
      const tsExtractor = new TypeScriptRelationshipExtractor();
      const relationships = tsExtractor.extract(parseResult.result);

      // Adjust line numbers for script offset
      const scriptStartLine = getScriptElement(rootNode)?.startPosition.row ?? 0;
      return relationships.map((rel) => {
        if (rel.sourceLocation) {
          return {
            ...rel,
            sourceLocation: {
              line: rel.sourceLocation.line + scriptStartLine,
              column: rel.sourceLocation.column,
            },
          };
        }
        return rel;
      });
    } catch (error) {
      const fileContext = filePath ? ` in ${filePath}` : '';
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(
        `[VueRelationshipExtractor] TypeScript extraction failed${fileContext}: ${errorMessage}. ` +
          'Relationship extraction will be incomplete for this file.'
      );
      return [];
    }
  }

  /**
   * Build a map of component imports for cross-file resolution.
   * Maps imported component names to their absolute file paths.
   */
  private buildComponentImportMap(
    scriptRelationships: ExtractedRelationship[],
    currentFilePath: string | null
  ): Map<string, string> {
    const importMap = new Map<string, string>();

    for (const rel of scriptRelationships) {
      if (rel.type === 'imports' && rel.targetName.endsWith('.vue')) {
        // Extract the imported component name (default import)
        const importedName = rel.metadata?.['default'] as string | undefined;
        if (importedName) {
          // Resolve relative import path to absolute path
          let absolutePath = rel.targetName;
          if (currentFilePath && rel.targetName.startsWith('.')) {
            const currentDir = dirname(currentFilePath);
            absolutePath = resolve(currentDir, rel.targetName);
          }
          importMap.set(importedName, absolutePath);
        }
      }
    }

    return importMap;
  }

  /**
   * Extract component usage from template section.
   * Detects custom components used in the template and creates "calls" relationships.
   */
  private extractComponentRelationships(
    rootNode: Node,
    componentName: string,
    componentImportMap: Map<string, string>
  ): ExtractedRelationship[] {
    const relationships: ExtractedRelationship[] = [];
    const templateElement = rootNode.descendantsOfType('template_element')[0];

    if (!templateElement) {
      return relationships;
    }

    // Find both start_tag and self_closing_tag nodes
    const startTags = templateElement.descendantsOfType('start_tag');
    const selfClosingTags = templateElement.descendantsOfType('self_closing_tag');
    const allTags = [...startTags, ...selfClosingTags];

    for (const tag of allTags) {
      // Find tag_name as a direct child
      const tagNameNode = tag.children.find((child) => child.type === 'tag_name');
      if (!tagNameNode) continue;

      const tagName = tagNameNode.text;

      // Check if it's a custom component (PascalCase or kebab-case with dash)
      if (this.isCustomComponent(tagName)) {
        // Look up the import path for this component
        // Try exact match first, then try PascalCase for kebab-case tags
        let targetFilePath = componentImportMap.get(tagName);
        if (!targetFilePath && tagName.includes('-')) {
          const pascalName = this.kebabToPascalCase(tagName);
          targetFilePath = componentImportMap.get(pascalName);
        }

        relationships.push({
          type: 'calls',
          sourceName: componentName,
          sourceLocation: {
            line: tag.startPosition.row + 1,
            column: tag.startPosition.column + 1,
          },
          targetName: tagName,
          ...(targetFilePath && { targetFilePath }),
          metadata: {
            usage: 'template-component',
          },
        });
      }
    }

    return relationships;
  }

  /**
   * Check if a tag name represents a custom component.
   */
  private isCustomComponent(tagName: string): boolean {
    if (HTML_TAGS.has(tagName.toLowerCase())) {
      return false;
    }

    // PascalCase components (starts with uppercase)
    if (/^[A-Z]/.test(tagName)) {
      return true;
    }

    // kebab-case components with dash
    if (tagName.includes('-')) {
      return true;
    }

    return false;
  }

  /**
   * Convert kebab-case to PascalCase.
   * E.g., "child-component" -> "ChildComponent"
   */
  private kebabToPascalCase(str: string): string {
    return str
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }
}
