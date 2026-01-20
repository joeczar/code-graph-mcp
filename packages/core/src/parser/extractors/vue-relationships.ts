import type { Node } from 'web-tree-sitter';
import type { ParseResult } from '../parser.js';
import { CodeParser } from '../parser.js';
import {
  TypeScriptRelationshipExtractor,
  type ExtractedRelationship,
} from './typescript-relationships.js';

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

    // Extract imports and other relationships from script section
    const scriptRelationships = await this.extractScriptRelationships(
      parseResult.tree.rootNode
    );
    relationships.push(...scriptRelationships);

    // Extract component relationships from template
    const componentRelationships = this.extractComponentRelationships(
      parseResult.tree.rootNode
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
    const scriptContent = this.getScriptContent(rootNode);
    if (!scriptContent) {
      return [];
    }

    // Determine language
    const scriptElement = rootNode.descendantsOfType('script_element')[0];
    const langAttr = this.getScriptLang(scriptElement);
    const language = langAttr === 'ts' || langAttr === 'tsx' ? 'typescript' : 'typescript';

    // Parse script content with TypeScript parser
    const parseResult = await this.parser.parse(scriptContent, language);
    if (!parseResult.success) {
      return [];
    }

    // Extract relationships using TypeScriptRelationshipExtractor
    const tsExtractor = new TypeScriptRelationshipExtractor();
    const relationships = tsExtractor.extract(parseResult.result);

    // Adjust line numbers for script offset
    const scriptStartLine = scriptElement?.startPosition.row ?? 0;
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
  }

  /**
   * Extract component usage from template section.
   * Detects custom components used in the template.
   */
  private extractComponentRelationships(rootNode: Node): ExtractedRelationship[] {
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
      let tagName: string | null = null;
      for (const child of tag.children) {
        if (child.type === 'tag_name') {
          tagName = child.text;
          break;
        }
      }

      if (!tagName) continue;

      // Check if it's a custom component (PascalCase or kebab-case with dash)
      if (this.isCustomComponent(tagName)) {
        relationships.push({
          type: 'imports',
          sourceName: '<template>',
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
    // Built-in HTML tags (lowercase, no dashes)
    const htmlTags = new Set([
      'div',
      'span',
      'p',
      'a',
      'img',
      'button',
      'input',
      'form',
      'ul',
      'ol',
      'li',
      'table',
      'tr',
      'td',
      'th',
      'section',
      'article',
      'header',
      'footer',
      'nav',
      'main',
      'aside',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'template',
      'slot',
    ]);

    if (htmlTags.has(tagName.toLowerCase())) {
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
   * Get script language attribute value.
   */
  private getScriptLang(scriptElement: Node | undefined): string | null {
    if (!scriptElement) return null;

    const startTag = scriptElement.descendantsOfType('start_tag')[0];
    if (!startTag) return null;

    const attrs = startTag.descendantsOfType('attribute');
    for (const attr of attrs) {
      const name = attr.childForFieldName('name')?.text;
      if (name === 'lang') {
        const value = attr.childForFieldName('value');
        if (value) {
          return value.text.replace(/['"]/g, '');
        }
      }
    }
    return null;
  }

  /**
   * Extract raw script content from Vue file.
   */
  private getScriptContent(rootNode: Node): string | null {
    const scriptElements = rootNode.descendantsOfType('script_element');
    if (scriptElements.length === 0) return null;

    const scriptElement = scriptElements[0];
    if (!scriptElement) return null;

    const rawText = scriptElement.descendantsOfType('raw_text')[0];
    if (!rawText) return null;

    return rawText.text;
  }
}
