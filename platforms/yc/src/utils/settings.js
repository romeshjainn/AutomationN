// ─────────────────────────────────────────────────────────────
//  platforms/yc/src/utils/settings.js
//  YC-scoped settings wrapper
//  Keys stored as "yc_MIN_SCORE" etc. — isolated from naukri
// ─────────────────────────────────────────────────────────────

import {
  getSetting as _get,
  setSetting as _set,
  getAllSettings as _all,
} from '../../../../core/db/queries/settings.js';
import { FILTERS } from '../../config/filters.js';

const PLATFORM = 'yc';

export const getSetting = (key) => _get(key, FILTERS, PLATFORM);
export const setSetting = (key, val) => _set(key, val, PLATFORM);
export const getAllSettings = () => _all(FILTERS, PLATFORM);
