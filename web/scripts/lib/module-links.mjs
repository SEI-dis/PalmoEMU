// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parse} from '../i18n/vendor/acorn.mjs';

function visit(node, callback) {
  if (!node || typeof node !== 'object') return;
  callback(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => visit(child, callback));
    else if (value && typeof value === 'object') visit(value, callback);
  }
}

export function checkModuleLinks(directory) {
  const root = path.resolve(directory), counts = {modules:0, resources:0, dynamicBases:0};
  function check(file, specifier, kind, dynamic = false) {
    if (!specifier.startsWith('.')) return;
    const clean = specifier.split(/[?#]/)[0];
    const target = path.resolve(path.dirname(file), dynamic && !clean.endsWith('/') ? path.dirname(clean) : clean);
    assert(target === root || target.startsWith(root + path.sep), 'Reference outside web root: ' + file + ' → ' + specifier);
    const relative = path.relative(root, target).split(path.sep).join('/');
    // The development server supplies this optional core; it is not distributed.
    if (relative === '__dev3ds__' && file === path.join(root, 'src/core/three-ds-worker.js')) return;
    const stat = fs.statSync(target);
    assert(dynamic || clean.endsWith('/') ? stat.isDirectory() : stat.isFile(), 'Invalid reference: ' + file + ' → ' + specifier);
    counts[dynamic ? 'dynamicBases' : kind]++;
  }
  function javascript(file) {
    const source = fs.readFileSync(file, 'utf8');
    const tree = parse(source, {ecmaVersion:'latest', sourceType:'module'});
    function reference(node, kind) {
      if (node?.type === 'Literal' && typeof node.value === 'string') check(file, node.value, kind);
      else if (node?.type === 'TemplateLiteral') check(file, node.quasis[0].value.cooked, kind, node.expressions.length > 0);
      else if (node?.type === 'BinaryExpression' && node.operator === '+' && node.left.type === 'Literal' && typeof node.left.value === 'string') check(file, node.left.value, kind, true);
    }
    visit(tree, node => {
      if (['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration','ImportExpression'].includes(node.type) && node.source) reference(node.source, 'modules');
      if (node.type === 'CallExpression' && node.callee?.name === 'importScripts') node.arguments.forEach(arg => reference(arg, 'resources'));
      if (node.type === 'NewExpression' && node.callee?.name === 'URL' && node.arguments[1]) {
        const base = source.slice(node.arguments[1].start, node.arguments[1].end);
        if (['import.meta.url','self.location.href'].includes(base)) reference(node.arguments[0], 'resources');
      }
    });
  }
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (/\.m?js$/.test(entry.name)) javascript(file);
    }
  }
  scan(path.join(root, 'src'));
  if (fs.existsSync(path.join(root, 'sw.js'))) javascript(path.join(root, 'sw.js'));
  for (const name of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
    const file = path.join(root, name), source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
      if (!/^(?:[a-z]+:|\/)/i.test(match[1])) check(file, './' + match[1], 'resources');
    }
  }
  return counts;
}
