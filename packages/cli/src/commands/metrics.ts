/**
 * Metrics CLI commands
 *
 * Display aggregated metrics from tool calls and parse operations.
 */

import { getDatabase, createMetricsStore } from '@code-graph/core';
import { formatTable } from '../utils/table.js';

export function runMetricsCommand(args: string[]): void {
  const subcommand = args[0];

  if (!subcommand || subcommand === 'help') {
    printMetricsHelp();
    return;
  }

  if (subcommand === 'summary') {
    handleSummary(args.slice(1));
  } else {
    throw new Error(`Unknown metrics subcommand: ${subcommand}\nUse: metrics summary`);
  }
}

function handleSummary(args: string[]): void {
  // Parse filter arguments
  let projectId: string | undefined;
  let toolName: string | undefined;
  let jsonOutput = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--project' && i + 1 < args.length) {
      projectId = args[i + 1];
      i++;
    } else if (arg === '--tool' && i + 1 < args.length) {
      toolName = args[i + 1];
      i++;
    } else if (arg === '--json') {
      jsonOutput = true;
    } else if (arg === '--help') {
      printSummaryHelp();
      return;
    }
  }

  const db = getDatabase();
  const metricsStore = createMetricsStore(db);

  try {
    // Get tool call summary
    const toolCallSummary = metricsStore.getToolCallSummary(projectId, toolName);

    // Get parse stats summary (only if no tool filter)
    const parseStatsSummary = toolName
      ? null
      : metricsStore.getParseStatsSummary(projectId);

    // Get tool usage ranking (only if no tool filter)
    const toolUsageRanking = toolName
      ? null
      : metricsStore.getToolUsageRanking(projectId, 10);

    if (jsonOutput) {
      console.log(
        JSON.stringify(
          {
            toolCallSummary,
            parseStatsSummary,
            toolUsageRanking,
          },
          null,
          2
        )
      );
    } else {
      printSummaryTable(toolCallSummary, parseStatsSummary, toolUsageRanking);
    }
  } finally {
    // Database is singleton, don't close it
  }
}

function printSummaryTable(
  toolCallSummary: {
    toolName: string;
    callCount: number;
    successCount: number;
    errorCount: number;
    successRate: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    avgLatencyMs: number;
  }[],
  parseStatsSummary: {
    totalParseRuns: number;
    totalFilesProcessed: number;
    totalFilesSuccess: number;
    totalFilesError: number;
    totalEntitiesExtracted: number;
    totalRelationshipsExtracted: number;
    avgDurationMs: number;
  } | null,
  toolUsageRanking: {
    toolName: string;
    callCount: number;
    avgLatencyMs: number;
  }[] | null
): void {
  console.log('\n=== Tool Call Summary ===\n');

  if (toolCallSummary.length === 0) {
    console.log('No tool call metrics found.\n');
  } else {
    const toolTable = formatTable({
      columns: [
        { header: 'Tool', align: 'left' },
        { header: 'Calls', align: 'right' },
        { header: 'Success', align: 'right' },
        { header: 'Errors', align: 'right' },
        { header: 'Success %', align: 'right' },
        { header: 'p50 (ms)', align: 'right' },
        { header: 'p95 (ms)', align: 'right' },
        { header: 'p99 (ms)', align: 'right' },
        { header: 'Avg (ms)', align: 'right' },
      ],
      rows: toolCallSummary.map((row) => [
        row.toolName,
        String(row.callCount),
        String(row.successCount),
        String(row.errorCount),
        `${(row.successRate * 100).toFixed(1)}%`,
        row.p50LatencyMs.toFixed(1),
        row.p95LatencyMs.toFixed(1),
        row.p99LatencyMs.toFixed(1),
        row.avgLatencyMs.toFixed(1),
      ]),
    });
    console.log(toolTable);
    console.log();
  }

  if (parseStatsSummary) {
    console.log('=== Parse Stats Summary ===\n');
    const parseTable = formatTable({
      columns: [
        { header: 'Metric', align: 'left' },
        { header: 'Value', align: 'right' },
      ],
      rows: [
        ['Total Parse Runs', String(parseStatsSummary.totalParseRuns)],
        ['Files Processed', String(parseStatsSummary.totalFilesProcessed)],
        ['Files Success', String(parseStatsSummary.totalFilesSuccess)],
        ['Files Error', String(parseStatsSummary.totalFilesError)],
        ['Entities Extracted', String(parseStatsSummary.totalEntitiesExtracted)],
        ['Relationships Extracted', String(parseStatsSummary.totalRelationshipsExtracted)],
        ['Avg Duration (ms)', parseStatsSummary.avgDurationMs.toFixed(1)],
      ],
    });
    console.log(parseTable);
    console.log();
  }

  if (toolUsageRanking && toolUsageRanking.length > 0) {
    console.log('=== Top 10 Most Used Tools ===\n');
    const rankingTable = formatTable({
      columns: [
        { header: 'Rank', align: 'right' },
        { header: 'Tool', align: 'left' },
        { header: 'Calls', align: 'right' },
        { header: 'Avg Latency (ms)', align: 'right' },
      ],
      rows: toolUsageRanking.map((row, index) => [
        String(index + 1),
        row.toolName,
        String(row.callCount),
        row.avgLatencyMs.toFixed(1),
      ]),
    });
    console.log(rankingTable);
    console.log();
  }
}

function printMetricsHelp(): void {
  console.log(`
Usage: code-graph-cli metrics <subcommand> [options]

Subcommands:
  summary       Display aggregated metrics summary

Use "metrics <subcommand> --help" for more information about a subcommand.
  `.trim());
}

function printSummaryHelp(): void {
  console.log(`
Usage: code-graph-cli metrics summary [options]

Display aggregated metrics from tool calls and parse operations.

Options:
  --project <id>    Filter by project ID
  --tool <name>     Filter by tool name
  --json            Output as JSON instead of table
  --help            Show this help message

Examples:
  # Show all metrics
  code-graph-cli metrics summary

  # Show metrics for a specific project
  code-graph-cli metrics summary --project my-project

  # Show metrics for a specific tool
  code-graph-cli metrics summary --tool parse_file

  # Output as JSON
  code-graph-cli metrics summary --json
  `.trim());
}
