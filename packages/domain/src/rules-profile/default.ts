import type { RulesProfile } from './types.js';

/**
 * Rules Profile que se asigna a una campaña nueva.
 * Basado en las decisiones tomadas en CONSTRAINTS.md.
 *
 * Sources habilitadas por default: las "core 2014" decididas con el equipo.
 * Las demás sources que existen en la DB (BMT, ERLW, BGDIA, etc.) quedan off
 * y el DM puede habilitarlas individualmente.
 */
export const DEFAULT_RULES_PROFILE: RulesProfile = {
  sources: {
    PHB: true,
    DMG: true,
    XGE: true,
    TCE: true,
    MPMM: true,
    MTF: true,
    SCAG: true,
    FTD: true,
    VGM: true,
    EGW: true,
    // Resto de sources defaultean a false (clave ausente = deshabilitada).
  },
  disabledEntities: {
    races: [],
    subraces: [],
    classes: [],
    subclasses: [],
    backgrounds: [],
    spells: [],
    items: [],
    feats: [],
    optionalFeatures: [],
  },
  variantRules: {
    multiclassing: true,
    feats: true,
    variantHumanAndCustomLineage: true,
    encumbranceVariant: false,
    tashasCustomOrigin: false,
    tashasOptionalClassFeatures: false,
  },
  statGeneration: {
    standardArray: true,
    pointBuy: true,
    roll: true,
  },
  hpOnLevelUp: 'player-choice',
};
