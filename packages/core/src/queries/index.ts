/**
 * Query functions for the code graph.
 *
 * These functions provide high-level queries over the entity and relationship stores.
 */

export { whatCalls } from './whatCalls.js';
export { whatDoesCall } from './whatDoesCall.js';
export { blastRadius } from './blastRadius.js';
export type { AffectedEntity, BlastRadiusResult } from './types.js';
export { getExports } from './getExports.js';
export type {
  ExportType,
  ExportedEntity,
  GetExportsResult,
} from './getExports.js';
