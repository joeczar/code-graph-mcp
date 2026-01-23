import type { Node } from 'web-tree-sitter';
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
      parseResult.tree.rootNode
    );
    relationships.push(...scriptRelationships);

    // Extract component relationships from template
    const componentRelationships = this.extractComponentRelationships(
      parseResult.tree.rootNode,
      componentName
    );
    relationships.push(...componentRelationships);

    return relationships;
  }

  /**
   * Extract relationships from the script section using TypeScriptRelationshipExtractor.
   */
  private async extractScriptRelationships(
    rootNode: Node
  ): Promise<ExtractedRelationship[]> {
    const scriptContent = getScriptContent(rootNode);
    if (!scriptContent) {
      return [];
    }

    // Parse script content with TypeScript parser (handles both JS and TS)
    const parseResult = await this.parser.parse(scriptContent, 'typescript');
    if (!parseResult.success) {
      console.warn(
        `[VueRelationshipExtractor] Failed to parse script: ${parseResult.error.message}`
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
      console.warn('[VueRelationshipExtractor] Extraction failed:', error);
      return [];
    }
  }

  /**
   * Extract component usage from template section.
   * Detects custom components used in the template and creates "calls" relationships.
   */
  private extractComponentRelationships(
    rootNode: Node,
    componentName: string
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
      const tagName = tagNameNode?.text ?? null;

      if (!tagName) continue;

      // Check if it's a custom component (PascalCase or kebab-case with dash)
      if (this.isCustomComponent(tagName)) {
        relationships.push({
          type: 'calls',
          sourceName: componentName,
          sourceLocation: {
            line: tag.startPosition.row + 1,
            column: tag.startPosition.column + 1,
          },
          targetName: tagName,
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
}
