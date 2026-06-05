import type { PendientesActions } from '@/components/inicio/dm/pendientes-action-buttons';

/**
 * Catalog stub for the DM approve/reject handlers. Injected into the real
 * PendientesActionButtons (and its parents) so the catalog renders the genuine
 * production components WITHOUT ever firing the real server actions.
 */
export const NOOP_PENDIENTES_ACTIONS: PendientesActions = {
  onApprove: async () => {},
  onReject: async () => {},
};
