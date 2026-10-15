#!/usr/bin/env node
// Checks that sbws.json (what the SBWS post editor may edit) still matches the
// site's content collections. Part of `npm run build`, after `astro sync`:
//
//   astro sync && node scripts/check-editor.mjs && ... && astro build
//
// The post editor never builds the site, so it cannot see the schemas in
// src/content.config.ts. It trusts sbws.json instead. If the two drift apart
// (a field renamed, made required, an image moved), staff could publish a post
// that breaks the next build. This check stops that drift at the developer's
// build, before it reaches them.
//
// Copied from ~/github/sbws-post-editor/site-kit/check-editor.mjs. The format
// of sbws.json is in that repository's docs/SITE-SETUP.md.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
// --manifest <file> checks another copy, for trying out a draft sbws.json.
const flag = process.argv.indexOf('--manifest');
const manifestPath = flag > 0 ? process.argv[flag + 1] : join(root, 'sbws.json');

if (!existsSync(manifestPath)) {
  console.log('check-editor: no sbws.json, so this site is not set up for the post editor. Nothing to check.');
  process.exit(0);
}

const errors = [];
const warnings = [];

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (err) {
  console.error(`check-editor: sbws.json is not valid JSON: ${err.message}`);
  process.exit(1);
}

if (manifest.version !== 1) errors.push('sbws.json: "version" must be 1.');
if (!Array.isArray(manifest.collections) || manifest.collections.length === 0) {
  errors.push('sbws.json: "collections" must list at least one collection.');
}

/** Every JSON type a schema property allows, wherever Astro put them. */
function typesOf(prop) {
  if (!prop) return new Set();
  const out = new Set();
  const add = (p) => {
    if (Array.isArray(p.type)) p.type.forEach((t) => out.add(t));
    else if (p.type) out.add(p.type);
    for (const k of ['anyOf', 'oneOf', 'allOf']) (p[k] ?? []).forEach(add);
  };
  add(prop);
  return out;
}

/** What a field of each sbws.json type must be in the Astro schema. */
function expectedType(field) {
  switch (field.type) {
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'tags': return 'array';
    case 'photos': return null; // files in the post's folder, not a frontmatter key
    case 'audio': return 'string'; // an address such as /sermons/audio/x.mp3
    default: return 'string';
  }
}

const TYPES = new Set(['text', 'textarea', 'url', 'number', 'boolean', 'select', 'tags', 'date', 'image', 'photos', 'audio']);

// Cloudflare Pages refuses any single file over 25 MiB.
const CLOUDFLARE_FILE_LIMIT = 25 * 1024 * 1024;

/** An audio field's "audio" block: where its MP3s go (under public/) and how big they may be. */
function checkAudio(where, f) {
  const a = f.audio;
  const field = `audio field "${f.name}"`;
  if (!a || typeof a !== 'object') {
    errors.push(`${where}: ${field} needs "audio": { "folder": "public/..." }.`);
    return;
  }
  if (typeof a.folder !== 'string' || !/^public\/[^/]/.test(a.folder) || a.folder.split('/').includes('..')) {
    errors.push(`${where}: ${field} needs "audio.folder" under public/, such as "public/sermons/audio" (it is written into posts as an address).`);
  }
  if (a.name !== undefined && (typeof a.name !== 'string' || !a.name.trim())) {
    errors.push(`${where}: ${field} has an empty "audio.name".`);
  }
  if (a.maxBytes !== undefined && (!Number.isInteger(a.maxBytes) || a.maxBytes < 10000 || a.maxBytes > CLOUDFLARE_FILE_LIMIT)) {
    errors.push(`${where}: ${field} "audio.maxBytes" must be a whole number of bytes up to ${CLOUDFLARE_FILE_LIMIT} (Cloudflare Pages' limit for one file).`);
  }
  if (a.bitrate !== undefined && (!Number.isInteger(a.bitrate) || a.bitrate < 16 || a.bitrate > 320)) {
    errors.push(`${where}: ${field} "audio.bitrate" must be a whole number of kbps from 16 to 320.`);
  }
}

for (const [i, col] of (manifest.collections ?? []).entries()) {
  const where = `sbws.json collection ${col?.key ?? `#${i + 1}`}`;
  if (!col?.key) { errors.push(`${where}: "key" is missing.`); continue; }
  if (!col.folder || !existsSync(join(root, col.folder))) {
    errors.push(`${where}: folder "${col.folder}" does not exist.`);
  }
  if (!col.path) errors.push(`${where}: "path" is missing.`);

  const fields = typeof col.fields === 'string' ? manifest.fieldsets?.[col.fields] : col.fields;
  if (!Array.isArray(fields)) {
    errors.push(`${where}: "fields" must be a list, or the name of a fieldset that exists.`);
    continue;
  }

  const schemaFile = join(root, '.astro', 'collections', `${col.key}.schema.json`);
  if (!existsSync(schemaFile)) {
    errors.push(`${where}: Astro has no collection named "${col.key}" (no ${schemaFile.slice(root.length + 1)}). Run \`npx astro sync\` first, or fix the key.`);
    continue;
  }
  const schema = JSON.parse(readFileSync(schemaFile, 'utf8'));
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const covered = new Set(['$schema']);

  const checkKey = (name, want, label) => {
    covered.add(name);
    if (!(name in props)) {
      errors.push(`${where}: ${label} "${name}" is not in the Astro schema.`);
      return;
    }
    const have = typesOf(props[name]);
    if (want && have.size && !have.has(want)) {
      errors.push(`${where}: ${label} "${name}" is ${want} in sbws.json but ${[...have].join('/')} in the Astro schema.`);
    }
  };

  for (const f of fields) {
    if (!f?.name || !TYPES.has(f.type)) {
      errors.push(`${where}: field ${JSON.stringify(f?.name)} has an unknown type ${JSON.stringify(f?.type)}.`);
      continue;
    }
    if (f.type === 'photos') continue;
    checkKey(f.name, expectedType(f), 'field');
    if (required.has(f.name) && !f.required && !f.always) {
      errors.push(`${where}: Astro requires "${f.name}", but sbws.json neither marks it "required" nor "always", so staff could publish a post without it.`);
    }
    if (f.type === 'date') {
      const prop = props[f.name] ?? {};
      const isString = (f.format ?? 'date') === 'date-string';
      if (!isString && prop.format !== 'date-time' && !JSON.stringify(prop).includes('date-time')) {
        warnings.push(`${where}: "${f.name}" is a date in sbws.json, but Astro does not read it as a date. If it is z.string(), use "format": "date-string".`);
      }
    }
    if (f.type === 'audio') checkAudio(where, f);
    else if (f.audio !== undefined) errors.push(`${where}: field "${f.name}" has "audio" settings but is not an audio field.`);
    if (f.type === 'image') {
      if (f.alt) checkKey(f.alt, 'string', 'alt text field');
      if (f.width) checkKey(f.width, 'number', 'width field');
      if (f.height) checkKey(f.height, 'number', 'height field');
    }
  }

  for (const name of required) {
    if (!covered.has(name)) {
      errors.push(`${where}: Astro requires "${name}", but sbws.json does not list it. New posts made in the editor would break the build.`);
    }
  }
  for (const name of Object.keys(props)) {
    if (!covered.has(name)) warnings.push(`${where}: "${name}" is not in sbws.json. It is kept as it is, but staff cannot edit it.`);
  }
}

for (const w of warnings) console.warn(`check-editor: note: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`check-editor: ${e}`);
  console.error(`check-editor: ${errors.length} problem(s). sbws.json must match src/content.config.ts; see the "Post editor" section of CLAUDE.md.`);
  process.exit(1);
}
console.log(`check-editor: sbws.json matches the content collections (${manifest.collections.length} checked).`);
