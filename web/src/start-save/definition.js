// SPDX-License-Identifier: AGPL-3.0-or-later
// One metadata source for the UI, worker and output validation.
import {MANIFEST} from '../../vendor/start-save-migrate/manifest.js';
import {defineStartComponent} from './contract.js';
export const START_COMPONENT=defineStartComponent(MANIFEST);
export const START_MIGRATION_VERSION=START_COMPONENT.output.version;
export const START_SOURCE_VERSIONS=Object.freeze(START_COMPONENT.versions.map(source=>Object.freeze({version:source.version,sampleTested:source.saveSampleTested===true,boxes:source.boxes,encrypted:source.encrypted,crc32:source.crc32??null})));
