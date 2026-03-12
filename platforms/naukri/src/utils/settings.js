// ─────────────────────────────────────────────────────────────
//  platforms/naukri/src/utils/settings.js
//  Naukri-scoped settings wrapper
//
//  All naukri files import getSetting from HERE — not from core.
//  Platform isolation: keys stored as "naukri_MIN_SCORE" in DB.
// ─────────────────────────────────────────────────────────────

import {
  getSetting as _get,
  setSetting as _set,
  getAllSettings as _all,
} from '../../../../core/db/queries/settings.js';
import { FILTERS } from '../../config/filters.js';

const PLATFORM = 'naukri';

export const getSetting = (key) => _get(key, FILTERS, PLATFORM);
export const setSetting = (key, val) => _set(key, val, PLATFORM);
export const getAllSettings = () => _all(FILTERS, PLATFORM);
