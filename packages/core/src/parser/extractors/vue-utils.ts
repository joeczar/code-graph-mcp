import type { Node } from 'web-tree-sitter';

/**
 * Shared utilities for Vue extractors.
 */

/**
 * Get the first script element from a Vue AST.
 */
export function getScriptElement(rootNode: Node): Node | undefined {
  return rootNode.descendantsOfType('script_element')[0];
}

/**
 * Extract raw script content from Vue file.
 * Returns null if no script element or raw_text is found.
 */
export function getScriptContent(rootNode: Node): string | null {
  const scriptElement = getScriptElement(rootNode);
  if (!scriptElement) return null;

  const rawText = scriptElement.descendantsOfType('raw_text')[0];
  return rawText?.text ?? null;
}
