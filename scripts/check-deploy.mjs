#!/usr/bin/env node
/**
 * Pre-deploy checks. Runs before every `npm run build`, so Cloudflare Pages runs
 * it too, and a failure stops the deploy instead of shipping something broken.
 *
 *   1. No file in public/ over Cloudflare Pages' 25 MiB per-file limit. One
 *      over-size file fails the whole deploy, after the build has run.
 *   2. public/_redirects only uses what Cloudflare Pages understands. It is not
 *      .htaccess: a query-string rule like /?feed=* matches "/" and loops the
 *      home page.
 *   3. The form endpoint, site slug and Turnstile key appear only in
 *      src/config/site.js.
 *   4. No page-builder field names (form_fields[...]) left in a form.
 *   5. Cloudflare's always-pass Turnstile test key, or a <placeholder>, is still
 *      in src/config/site.js. A warning, never an error — a site can go live
 *      before its real key exists — but louder on a production branch.
 *
 * Errors fail the build; warnings are printed and let it through.
 * Usage: node scripts/check-deploy.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const CONFIG = path.join('src', 'config', 'site.js');
const MIB = 1048576;
const errors = [];
const warnings = [];

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const rel = (p) => path.relative(ROOT, p);

// ---- 1. file sizes
for (const file of await walk(path.join(ROOT, 'public'))) {
  const { size } = await fs.stat(file);
  const mb = (size / MIB).toFixed(1);
  if (size > 25 * MIB)
    errors.push(`${rel(file)} is ${mb} MiB — over Cloudflare Pages' 25 MiB limit. Compress it (see CLAUDE.md, "Files over 25 MiB").`);
  else if (size > 20 * MIB)
    warnings.push(`${rel(file)} is ${mb} MiB — under the limit, but heavy for a phone.`);
}

// ---- 2. _redirects
const STATUSES = new Set(['200', '301', '302', '303', '307', '308']);
try {
  const lines = (await fs.readFile(path.join(ROOT, 'public', '_redirects'), 'utf8')).split('\n');
  let staticRules = 0;
  let dynamicRules = 0;
  const seen = new Map();
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const at = `_redirects:${i + 1}`;
    if (/^Rewrite(Rule|Cond|Engine)\b|^Redirect(Match)?\b/i.test(line)) {
      errors.push(`${at} is Apache syntax. Cloudflare Pages ignores it: ${line}`);
      return;
    }
    const [from, to, status = '302', ...rest] = line.split(/\s+/);
    if (!to) return errors.push(`${at} has no destination: ${line}`);
    if (rest.length) errors.push(`${at} has extra fields after the status: ${line}`);
    if (status === '404' || status === '410')
      warnings.push(`${at} status ${status} is ignored by Cloudflare Pages, so ${from} just 404s. Delete the line, or use a Pages Function if a real ${status} matters.`);
    else if (!STATUSES.has(status)) errors.push(`${at} status ${status} isn't one Cloudflare Pages supports (200, 301, 302, 303, 307, 308).`);
    if (from.includes('?'))
      errors.push(`${at} matches a query string, which Cloudflare Pages can't do — the query is ignored, so "${from}" matches "${from.split('?')[0] || '/'}". Use a Redirect Rule in the Cloudflare dashboard.`);
    if (/^https?:\/\//i.test(from))
      errors.push(`${at} is a host/protocol rule. Pages can't match a domain; use "Always Use HTTPS" or a Redirect Rule on the zone.`);
    if (/[\^$()\\|]|\.\*/.test(from))
      errors.push(`${at} looks like a regex. Pages only has * (as :splat) and :placeholders: ${from}`);
    if ((from.match(/\*/g) || []).length > 1) errors.push(`${at} has more than one *; Pages allows one splat.`);
    if (from === to) errors.push(`${at} redirects ${from} to itself — a loop.`);
    if (status === '200' && /^https?:\/\//i.test(to)) errors.push(`${at} proxies (200) to another site, which Pages doesn't do.`);
    if (from === '/' && status !== '200') warnings.push(`${at} redirects the home page away. Intended?`);
    if (seen.has(from)) warnings.push(`${at} repeats ${from} from line ${seen.get(from)}; only the first one ever matches.`);
    seen.set(from, i + 1);
    if (/[*:]/.test(from)) dynamicRules++;
    else staticRules++;
  });
  if (staticRules > 2000) errors.push(`_redirects has ${staticRules} static rules; Pages reads 2,000 and drops the rest. Move the extras to a Bulk Redirect list.`);
  if (dynamicRules > 100) errors.push(`_redirects has ${dynamicRules} dynamic rules; Pages reads 100 and drops the rest.`);
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
  warnings.push('No public/_redirects — old WordPress URLs will 404. Copy _source/_redirects in.');
}

// ---- 3 & 4. form settings in one place, clean field names
const configText = await fs.readFile(path.join(ROOT, CONFIG), 'utf8').catch(() => '');
// Real site keys all start 0x4AAAA; the test keys are 1x/2x/3x plus twenty zeros.
const TURNSTILE_KEY = /\b0x4AAAA[0-9A-Za-z_-]{10,}|\b[123]x0{20}[A-Z]{2}\b/;
const SOURCE = /\.(astro|js|mjs|ts|jsx|tsx|md|mdx|html)$/;
for (const file of (await walk(path.join(ROOT, 'src'))).filter((f) => SOURCE.test(f))) {
  if (rel(file) === CONFIG) continue;
  const text = await fs.readFile(file, 'utf8');
  if (/contact-api\.|\/v1\/forms\//.test(text))
    errors.push(`${rel(file)} has the form endpoint in it. Import FORMS from ${CONFIG} instead.`);
  if (TURNSTILE_KEY.test(text))
    errors.push(`${rel(file)} has a Turnstile site key in it. Import FORMS from ${CONFIG} instead.`);
  const builder = text.match(/name=["'{`](form_fields\[|wpforms\[|input_\d+[._]\d|item_meta\[)[^"'`}]*/);
  if (builder)
    errors.push(`${rel(file)} uses the page builder's field name "${builder[0].slice(6)}". Use the Send as key from _source/forms.md.`);
}

// ---- 5. the Turnstile key itself
const branch = process.env.CF_PAGES_BRANCH || '';
const production = ['main', 'master', 'production'].includes(branch);
if (configText) {
  // Cloudflare's documented test keys: 1x… always passes, 2x… always blocks, 3x… forces a challenge.
  if (/['"][123]x0{20}[A-Z]{2}['"]/.test(configText)) {
    warnings.push(`${production ? `PRODUCTION (${branch}): ` : ''}${CONFIG} still has Cloudflare's Turnstile TEST key — every bot passes. Swap in the real site key before launch.`);
  }
  if (/<[a-z-]+>/.test(configText))
    warnings.push(`${production ? `PRODUCTION (${branch}): ` : ''}${CONFIG} still has a <placeholder> value in it — forms won't submit until it's filled in.`);
} else {
  warnings.push(`No ${CONFIG} — form settings belong there.`);
}

// ---- report
for (const w of warnings) console.warn(`  ⚠ ${w}`);
for (const e of errors) console.error(`  ✖ ${e}`);
if (errors.length) {
  console.error(`\n  check-deploy: ${errors.length} error(s). Fix them before this deploys.\n`);
  process.exit(1);
}
console.log(`  check-deploy: ok${warnings.length ? ` (${warnings.length} warning(s))` : ''}`);
