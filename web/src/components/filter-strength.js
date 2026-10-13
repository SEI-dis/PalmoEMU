// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';
import {row} from './rows.js';
export function filterStrengthControl(settings){
 return `<div data-filter-strength ${['lcd','crt'].includes(settings.filter)?'':'hidden'}>${row(tr('効果の強さ'),tr`<input aria-label="効果の強さ" data-setting="filterStrength" type="range" min="0" max="1" step=".05" value="${settings.filterStrength??.5}">`,'image')}</div>`;
}
