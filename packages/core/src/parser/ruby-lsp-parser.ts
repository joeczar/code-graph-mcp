import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NewEntity } from '../db/entities.js';
import type { ExtractedRelationship } from './extractors/ruby-relationships.js';
import { spawnAndParseJSON, SubprocessError } from './subprocess-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * JSON output from ruby-indexer.rb script.
 */
interface RubyIndexerOutput {
  entities: RubyIndexerEntity[];
  relationships: RubyIndexerRelationship[];
}

/**
 * Entity format from ruby-indexer.rb.
 */
interface RubyIndexerEntity {
  type: 'class' | 'module' | 'method';
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  language: 'ruby';
  metadata?: Record<string, unknown>;
}

/**
 * Relationship format from ruby-indexer.rb.
 */
interface RubyIndexerRelationship {
  type: 'extends' | 'implements' | 'calls';
  sourceName: string;
  targetName: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result of parsing Ruby files with LSP indexer.
 */
export interface RubyLSPParseResult {
  entities: NewEntity[];
  relationships: ExtractedRelationship[];
}

/**
 * Options for Ruby LSP parser.
 */
export interface RubyLSPParserOptions {
  /** Path to ruby-indexer.rb script (defaults to scripts/ruby-indexer.rb) */
  scriptPath?: string;
  /** Timeout in milliseconds (defaults to 10000) */
  timeout?: number;
  /** Path to Ruby executable (defaults to 'ruby') */
  rubyPath?: string;
}

/**
 * Parses Ruby files using the Ruby LSP indexer to extract cross-file
 * method resolution information.
 *
 * Falls back gracefully when ruby-lsp gem is not installed.
 *
 * @example
 * ```typescript
 * try {
 *   const result = await parseWithRubyLSP(['app/models/user.rb']);
 *   console.log(result.entities.length);
 * } catch (error) {
 *   if (error instanceof RubyLSPNotAvailableError) {
 *     console.log('Ruby LSP not available, falling back to tree-sitter');
 *   }
 * }
 * ```
 */
export class RubyLSPParser {
  private scriptPath: string;
  private timeout: number;
  private rubyPath: string;

  constructor(options: RubyLSPParserOptions = {}) {
    // Default script path is relative to project root
    const projectRoot = path.resolve(__dirname, '../../../..');
    this.scriptPath = options.scriptPath ?? path.join(projectRoot, 'scripts/ruby-indexer.rb');
    this.timeout = options.timeout ?? 10000;
    this.rubyPath = options.rubyPath ?? 'ruby';
  }

  /**
   * Parse Ruby files and extract entities and relationships.
   *
   * @param filePaths - Absolute paths to Ruby files
   * @throws {RubyLSPNotAvailableError} if ruby-lsp gem is not installed
   * @throws {SubprocessError} if subprocess fails for other reasons
   */
  async parse(filePaths: string[]): Promise<RubyLSPParseResult> {
    if (filePaths.length === 0) {
      return { entities: [], relationships: [] };
    }

    try {
      const output = await spawnAndParseJSON<RubyIndexerOutput>({
        command: this.rubyPath,
        args: [this.scriptPath, ...filePaths],
        timeout: this.timeout,
      });

      return {
        entities: output.entities.map((e) => this.convertEntity(e)),
        relationships: output.relationships.map((r) => this.convertRelationship(r)),
      };
    } catch (error) {
      if (error instanceof SubprocessError) {
        // Check if error is due to missing ruby-lsp gem
        if (
          error.exitCode === 2 ||
          error.stderr.includes('ruby-lsp gem not installed') ||
          error.stderr.includes('cannot load such file -- ruby_lsp')
        ) {
          throw new RubyLSPNotAvailableError(
            'Ruby LSP gem not installed. Run: gem install ruby-lsp',
            error
          );
        }
      }
      throw error;
    }
  }

  /**
   * Check if Ruby LSP is available on this system.
   *
   * @returns true if ruby-lsp gem is installed and functional
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.parse([]);
      return true;
    } catch (error) {
      if (error instanceof RubyLSPNotAvailableError) {
        return false;
      }
      // Other errors might be temporary, so assume available
      return true;
    }
  }

  private convertEntity(entity: RubyIndexerEntity): NewEntity {
    const newEntity: NewEntity = {
      type: entity.type === 'method' ? 'method' : entity.type,
      name: entity.name,
      filePath: entity.filePath,
      startLine: entity.startLine,
      endLine: entity.endLine,
      language: 'ruby',
    };

    if (entity.metadata) {
      newEntity.metadata = entity.metadata;
    }

    return newEntity;
  }

  private convertRelationship(rel: RubyIndexerRelationship): ExtractedRelationship {
    const relationship: ExtractedRelationship = {
      type: rel.type,
      sourceName: rel.sourceName,
      targetName: rel.targetName,
    };

    if (rel.metadata) {
      relationship.metadata = rel.metadata;
    }

    return relationship;
  }
}

/**
 * Error thrown when Ruby LSP is not available.
 */
export class RubyLSPNotAvailableError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'RubyLSPNotAvailableError';
  }
}

/**
 * Convenience function to parse Ruby files with LSP.
 *
 * @param filePaths - Absolute paths to Ruby files
 * @param options - Parser options
 */
export async function parseWithRubyLSP(
  filePaths: string[],
  options?: RubyLSPParserOptions
): Promise<RubyLSPParseResult> {
  const parser = new RubyLSPParser(options);
  return parser.parse(filePaths);
}
