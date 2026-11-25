// SPDX-License-Identifier: AGPL-3.0-or-later
import {localizeDocument} from './index.js';
import {icon} from '../shared.js';
localizeDocument();
for(const link of document.querySelectorAll('.legal-back'))link.insertAdjacentHTML('afterbegin',icon('back'));
