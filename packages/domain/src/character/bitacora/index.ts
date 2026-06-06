/**
 * Character bitácora domain module.
 *
 * Exports the page validation function, input type, issue codes, and Zod schema.
 * bitacora-personal SDD design #1975 §ADR-2.
 */

export type {
  BitacoraPageInput,
  BitacoraPageRef,
  BitacoraPageIssue,
  BitacoraPageIssueCode,
  BitacoraPageResult,
} from './page.js';

export { validateBitacoraPage, BitacoraPageInputSchema } from './page.js';
