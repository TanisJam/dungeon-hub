/**
 * Character knowledge domain — default visibility rules.
 *
 * Exports structured so Wave 2 functions (isItemKnownByDefault, etc.)
 * slot in without signature change.
 *
 * REQ-CK-GATE-01, REQ-CK-GATE-02 (spec #1626)
 */
export { isMonsterKnownByDefault, seesEntry } from './default-rules.js';
