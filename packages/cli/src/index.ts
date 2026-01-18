#!/usr/bin/env node

/**
 * @code-graph/cli
 *
 * Command-line interface for code-graph operations.
 */

import { runCheckpointCommand } from './commands/checkpoint.js';

const args = process.argv.slice(2);
const command = args[0];

async function main(): Promise<void> {
  if (!command) {
    printUsage();
    process.exit(1);
  }

  switch (command) {
    case 'checkpoint':
      await runCheckpointCommand(args.slice(1));
      break;

    case 'help':
    case '--help':
    case '-h':
      printUsage();
      break;

    case 'version':
    case '--version':
    case '-v':
      console.log('0.0.1');
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

function printUsage(): void {
  console.log(`
code-graph - Knowledge graph CLI for code

USAGE:
  code-graph <command> [options]

COMMANDS:
  checkpoint    Manage workflow checkpoints
  help          Show this help message
  version       Show version

CHECKPOINT SUBCOMMANDS:
  checkpoint workflow create <issue_number> <branch_name>
  checkpoint workflow find <issue_number>
  checkpoint workflow get <workflow_id>
  checkpoint workflow list [--status=running|completed|failed]
  checkpoint workflow set-phase <workflow_id> <phase>
  checkpoint workflow set-status <workflow_id> <status>
  checkpoint workflow log-action <workflow_id> <action_type> <status> [details]
  checkpoint workflow log-commit <workflow_id> <sha> <message>
  checkpoint workflow delete <workflow_id>

EXAMPLES:
  code-graph checkpoint workflow create 12 "feat/12-add-parser"
  code-graph checkpoint workflow find 12
  code-graph checkpoint workflow set-phase abc123 implement
  code-graph checkpoint workflow log-commit abc123 a1b2c3d "feat: add parser"
`);
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
