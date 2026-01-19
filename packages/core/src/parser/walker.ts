import type { Tree, Node, TreeCursor } from 'web-tree-sitter';

/**
 * Control flow signals for tree walking
 */
export enum WalkControl {
  /** Continue normal traversal */
  Continue = 'continue',
  /** Skip children of current node, continue to siblings */
  SkipSubtree = 'skip',
  /** Stop walking entirely */
  Stop = 'stop',
}

/**
 * Context provided to visitor callbacks during traversal
 */
export interface WalkerContext {
  /** Current depth in tree (0 = root) */
  depth: number;
  /** Parent node (null for root) */
  parent: Node | null;
  /** Array of ancestor nodes from root to parent */
  ancestors: Node[];
  /** Field name if current node is a named field of parent */
  fieldName: string | null;
}

/**
 * Visitor callback invoked when entering a node
 */
export type EnterCallback = (
  node: Node,
  context: WalkerContext
) => WalkControl | void;

/**
 * Visitor callback invoked when exiting a node
 */
export type ExitCallback = (
  node: Node,
  context: WalkerContext
) => void;

/**
 * Visitor definition for AST traversal
 */
export interface Visitor {
  /** Called when entering a node (before children) */
  enter?: EnterCallback;
  /** Called when exiting a node (after children) */
  exit?: ExitCallback;
}

/**
 * Options for configuring tree traversal
 */
export interface WalkOptions {
  /** Only visit nodes of these types (empty = all types) */
  nodeTypes?: string[];
  /** Skip anonymous nodes if true */
  namedOnly?: boolean;
}

/**
 * AST walker with visitor pattern for tree-sitter trees
 *
 * Provides depth-first traversal with enter/exit callbacks,
 * node type filtering, and traversal control.
 *
 * @example
 * ```typescript
 * const walker = new Walker(tree);
 * walker.visitType('function_declaration', {
 *   enter: (node, ctx) => {
 *     console.log(`Function at depth ${ctx.depth}`);
 *   }
 * });
 * walker.walk();
 * ```
 */
export class Walker {
  private rootNode: Node;
  private visitors = new Map<string, Visitor>();
  private wildcardVisitor: Visitor | null = null;
  private options: WalkOptions;

  /**
   * Create a walker for a tree or node
   *
   * @param source - Tree or Node to walk
   * @param options - Optional traversal configuration
   */
  constructor(source: Tree | Node, options: WalkOptions = {}) {
    this.rootNode = 'rootNode' in source ? source.rootNode : source;
    this.options = options;
  }

  /**
   * Register a visitor for a specific node type
   *
   * @param nodeType - AST node type (e.g., 'function_declaration')
   * @param visitor - Visitor callbacks
   */
  visitType(nodeType: string, visitor: Visitor): void {
    this.visitors.set(nodeType, visitor);
  }

  /**
   * Register a visitor for all node types
   *
   * @param visitor - Visitor callbacks
   */
  visitAll(visitor: Visitor): void {
    this.wildcardVisitor = visitor;
  }

  /**
   * Start traversing the tree with registered visitors
   */
  walk(): void {
    const cursor = this.rootNode.walk();
    try {
      this.walkWithCursor(cursor);
    } finally {
      cursor.delete();
    }
  }

  /**
   * Collect all nodes of specified types
   *
   * @param nodeTypes - Array of node types to collect
   * @returns Array of matching nodes
   */
  collect(nodeTypes: string[]): Node[] {
    const collected: Node[] = [];
    const walker = new Walker(this.rootNode, { nodeTypes });

    walker.visitAll({
      enter: (node) => {
        collected.push(node);
      },
    });

    walker.walk();
    return collected;
  }

  /**
   * Internal traversal implementation using TreeCursor
   */
  private walkWithCursor(cursor: TreeCursor): void {
    const ancestors: Node[] = [];
    let depth = 0;

    const goToNextNode = (callExitOnParents: boolean = true): boolean => {
      // Try to go to next sibling
      if (cursor.gotoNextSibling()) {
        return true;
      }

      // Go back up, calling exit callbacks as we go
      while (cursor.gotoParent()) {
        const parentNode = cursor.currentNode;
        if (ancestors.length > 0) {
          ancestors.pop();
        }
        depth--;

        // Call exit callback for parent if we should visit it and caller requested it
        if (callExitOnParents && this.shouldVisitNode(parentNode)) {
          const parentContext: WalkerContext = {
            depth,
            parent: ancestors[ancestors.length - 1] ?? null,
            ancestors: [...ancestors],
            fieldName: cursor.currentFieldName,
          };
          this.callExitVisitor(parentNode, parentContext);
        }

        // Try next sibling of parent
        if (cursor.gotoNextSibling()) {
          return true;
        }
      }

      // Reached root with no more siblings
      return false;
    };

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const node = cursor.currentNode;
      const shouldVisit = this.shouldVisitNode(node);

      // Build context
      const context: WalkerContext = {
        depth,
        parent: ancestors[ancestors.length - 1] ?? null,
        ancestors: [...ancestors],
        fieldName: cursor.currentFieldName,
      };

      let control: WalkControl | void = WalkControl.Continue;

      // Call enter callback if we should visit this node
      if (shouldVisit) {
        control = this.callEnterVisitor(node, context);

        // Handle control flow
        if (control === WalkControl.Stop) {
          break;
        }

        if (control === WalkControl.SkipSubtree) {
          // Call exit callback before skipping
          this.callExitVisitor(node, context);
          // Skip subtree, go to next node
          if (!goToNextNode()) {
            break;
          }
          continue;
        }
      }

      // Try to go to first child (even if we didn't visit this node)
      if (cursor.gotoFirstChild()) {
        ancestors.push(node);
        depth++;
        continue;
      }

      // No children, call exit callback if we visited this node
      if (shouldVisit) {
        this.callExitVisitor(node, context);
      }

      // Go to next node
      if (!goToNextNode()) {
        break;
      }
    }
  }

  /**
   * Check if a node should be visited based on options
   */
  private shouldVisitNode(node: Node): boolean {
    if (this.options.namedOnly && !node.isNamed) {
      return false;
    }

    if (
      this.options.nodeTypes &&
      this.options.nodeTypes.length > 0 &&
      !this.options.nodeTypes.includes(node.type)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Invoke enter callbacks for a node
   */
  private callEnterVisitor(
    node: Node,
    context: WalkerContext
  ): WalkControl | void {
    // Type-specific visitor
    const visitor = this.visitors.get(node.type);
    if (visitor?.enter) {
      const control = visitor.enter(node, context);
      if (control) return control;
    }

    // Wildcard visitor
    if (this.wildcardVisitor?.enter) {
      const control = this.wildcardVisitor.enter(node, context);
      if (control) return control;
    }

    return WalkControl.Continue;
  }

  /**
   * Invoke exit callbacks for a node
   */
  private callExitVisitor(node: Node, context: WalkerContext): void {
    // Type-specific visitor
    const visitor = this.visitors.get(node.type);
    visitor?.exit?.(node, context);

    // Wildcard visitor
    this.wildcardVisitor?.exit?.(node, context);
  }
}
