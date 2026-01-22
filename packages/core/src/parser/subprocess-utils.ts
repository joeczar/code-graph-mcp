import { spawn } from 'node:child_process';

/**
 * Error thrown when a subprocess fails.
 */
export class SubprocessError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number | null,
    public readonly signal: string | null,
    public readonly stderr: string
  ) {
    super(message);
    this.name = 'SubprocessError';
  }
}

/**
 * Options for spawning a subprocess.
 */
export interface SpawnOptions {
  /** Command to execute */
  command: string;
  /** Arguments to pass to command */
  args: string[];
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
  /** Timeout in milliseconds (0 = no timeout) */
  timeout?: number;
  /** Environment variables to pass to subprocess */
  env?: Record<string, string>;
}

/**
 * Result of a successful subprocess execution.
 */
export interface SpawnResult {
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Exit code */
  exitCode: number;
}

/**
 * Spawns a subprocess and returns stdout, stderr, and exit code.
 *
 * Rejects with SubprocessError if:
 * - Process exits with non-zero code
 * - Process is killed by signal
 * - Timeout is exceeded
 * - Process fails to spawn
 *
 * @example
 * ```typescript
 * const result = await spawnSubprocess({
 *   command: 'ruby',
 *   args: ['script.rb', 'arg1'],
 *   timeout: 5000
 * });
 * console.log(result.stdout);
 * ```
 */
export async function spawnSubprocess(
  options: SpawnOptions
): Promise<SpawnResult> {
  const { command, args, cwd, timeout = 0, env } = options;

  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: cwd ?? process.cwd(),
      env: env ? { ...process.env, ...env } : process.env,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timeoutId: NodeJS.Timeout | undefined;

    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
      }, timeout);
    }

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(
        new SubprocessError(
          `Failed to spawn ${command}: ${error.message}`,
          null,
          null,
          stderr
        )
      );
    });

    proc.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      if (timeoutId) clearTimeout(timeoutId);

      if (timedOut) {
        reject(
          new SubprocessError(
            `Process timed out after ${String(timeout)}ms`,
            code,
            signal,
            stderr
          )
        );
        return;
      }

      if (signal !== null) {
        reject(
          new SubprocessError(
            `Process killed with signal ${signal}`,
            code,
            signal,
            stderr
          )
        );
        return;
      }

      if (code !== null && code !== 0) {
        reject(
          new SubprocessError(
            `Process exited with code ${String(code)}`,
            code,
            signal,
            stderr
          )
        );
        return;
      }

      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
  });
}

/**
 * Spawns a subprocess and parses JSON from stdout.
 *
 * Combines spawnSubprocess with JSON.parse, rejecting if JSON is invalid.
 *
 * @example
 * ```typescript
 * const data = await spawnAndParseJSON<{ entities: any[] }>({
 *   command: 'ruby',
 *   args: ['indexer.rb', 'file.rb']
 * });
 * console.log(data.entities);
 * ```
 */
export async function spawnAndParseJSON<T>(
  options: SpawnOptions
): Promise<T> {
  const result = await spawnSubprocess(options);

  try {
    return JSON.parse(result.stdout) as T;
  } catch (error) {
    throw new SubprocessError(
      `Failed to parse JSON output: ${error instanceof Error ? error.message : String(error)}`,
      result.exitCode,
      null,
      result.stderr
    );
  }
}
