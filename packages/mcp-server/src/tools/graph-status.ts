/**
 * Graph Status tool - displays current state of the knowledge graph
 *
 * Shows database statistics including:
 * - Total entity and relationship counts
 * - Counts by entity type (function, class, method, etc.)
 * - Counts by relationship type (calls, imports, extends, etc.)
 * - Recently parsed files with entity counts
 * - Database information (path or in-memory)
 */

import { z } from 'zod';
import { getDatabase } from '@code-graph/core';
import { createEntityStore, createRelationshipStore } from '@code-graph/core';
import { type ToolDefinition, createSuccessResponse } from './types.js';

// Empty schema - no inputs required
const graphStatusInputSchema = z.object({});

/**
 * Graph status tool definition
 *
 * Gathers statistics from the database stores and formats them
 * into a human-readable status report.
 */
export const graphStatusTool: ToolDefinition<typeof graphStatusInputSchema> = {
  metadata: {
    name: 'graph_status',
    description:
      'Show current status of the knowledge graph including entity counts, relationship counts, and recently parsed files',
    inputSchema: graphStatusInputSchema,
  },

  handler: () => {
    const db = getDatabase();
    const entityStore = createEntityStore(db);
    const relationshipStore = createRelationshipStore(db);

    // Gather statistics
    const totalEntities = entityStore.count();
    const totalRelationships = relationshipStore.count();
    const entityCounts = entityStore.countByType();
    const relationshipCounts = relationshipStore.countByType();
    const recentFiles = entityStore.getRecentFiles(10);

    // Format output
    const lines: string[] = [];

    lines.push('=== Knowledge Graph Status ===\n');

    // Database info
    const dbPath = db.name;
    if (dbPath === ':memory:') {
      lines.push('Database: In-memory database');
    } else {
      lines.push(`Database: ${dbPath}`);
    }
    lines.push('');

    // Overall counts
    lines.push('=== Overview ===');
    lines.push(`Total Entities: ${totalEntities}`);
    lines.push(`Total Relationships: ${totalRelationships}`);
    lines.push('');

    // Entity counts by type
    lines.push('=== Entities by Type ===');
    if (totalEntities === 0) {
      lines.push('  (no entities)');
    } else {
      for (const [type, count] of Object.entries(entityCounts)) {
        if (count > 0) {
          lines.push(`  ${type}: ${count}`);
        }
      }
    }
    lines.push('');

    // Relationship counts by type
    lines.push('=== Relationships by Type ===');
    if (totalRelationships === 0) {
      lines.push('  (no relationships)');
    } else {
      for (const [type, count] of Object.entries(relationshipCounts)) {
        if (count > 0) {
          lines.push(`  ${type}: ${count}`);
        }
      }
    }
    lines.push('');

    // Recent files
    lines.push('=== Recently Parsed Files ===');
    if (recentFiles.length === 0) {
      lines.push('  (no files parsed)');
    } else {
      for (const file of recentFiles) {
        const timestamp = new Date(file.lastUpdated).toLocaleString();
        lines.push(`  ${file.filePath}`);
        lines.push(`    Entities: ${file.entityCount} | Last Updated: ${timestamp}`);
      }
    }

    return createSuccessResponse(lines.join('\n'));
  },
};
