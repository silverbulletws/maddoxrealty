#!/usr/bin/env node
/**
 * Accessibility and keyboard-order check for the built site.
 *
 * Serves dist/ with `astro preview` and, for every page at 1440 / 820 / 390:
 *   - runs axe-core (WCAG 2 A/AA) and fails on serious or critical violations —
 *     the same engine Lighthouse's accessibility score is built on;
 *   - tabs through the page and fails when the first stop isn't the skip link,
 *     when focus lands on something invisible (a closed menu, an off-screen
 *     slide), or when the header's order runs against reading order;
 *   - fails on any positive tabindex.
 *
 * Usage:  npm run build && npm run a11y            (every page)
 *         npm run a11y -- /contact/ /about-us/     (just these)
 * Needs a browser once: npx playwright install chromium
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const PORT = 4329;
const BASE = `http://localhost:${PORT}`;
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'mobile', width: 390, height: 844 },
];
const MAX_TABS = 150;

// Every built page, as its URL: dist/about-us/index.html -> /about-us/
async function builtPages(dir = 'dist', prefix = '/') {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...(await builtPages(path.join(dir, entry.name), `${prefix}${entry.name}/`)));
    else if (entry.name === 'index.html') out.push(prefix);
  }
  return out;
}

async function startPreview() {
  const child = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { stdio: 'pipe' });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).status < 500) return child;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(`astro preview didn't answer on ${BASE}`);
}

// Tab through the page and describe every stop, in order.
async function tabStops(page) {
  const stops = [];
  await page.focus('body').catch(() => {});
  for (let i = 0; i < MAX_TABS; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      // Hidden-until-focused (the skip link) counts as visible once it has focus.
      const visible = r.width > 0 && r.height > 0 && style.visibility !== 'hidden' &&
        Number(style.opacity) > 0 && el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
      return {
        key: el.outerHTML.slice(0, 200),
        label: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || el.tagName)
          .trim().replace(/\s+/g, ' ').slice(0, 50),
        tag: el.tagName.toLowerCase(),
        href: el.getAttribute('href'),
        inHeader: !!el.closest('header'),
        top: r.top + window.scrollY,
        left: r.left + window.scrollX,
        height: r.height,
        visible,
      };
    });
    if (!stop) break;
    if (stops.length && stop.key === stops[0].key) break;   // wrapped round
    stops.push(stop);
  }
  return stops;
}

function orderProblems(stops) {
  const problems = [];
  const first = stops[0];
  if (!first || first.href !== '#main')
    problems.push(`first tab stop is ${first ? `"${first.label}"` : 'nothing'}, not the "Skip to content" link`);

  for (const s of stops.filter((x) => !x.visible))
    problems.push(`focus lands on something invisible: <${s.tag}> "${s.label}"`);

  // The header reads left to right, then down. A stop to the LEFT of the one
  // before it on the same line, or on a line above it, is out of order.
  const header = stops.filter((s) => s.inHeader && s.visible);
  for (let i = 1; i < header.length; i++) {
    const [a, b] = [header[i - 1], header[i]];
    const sameLine = Math.abs(a.top - b.top) < Math.max(a.height, b.height) / 2;
    if ((sameLine && b.left < a.left - 4) || (!sameLine && b.top < a.top - 4))
      problems.push(`header order: "${b.label}" comes after "${a.label}" but sits ${sameLine ? 'to its left' : 'above it'}`);
  }
  return problems;
}

const only = process.argv.slice(2);
const pages = only.length ? only : await builtPages().catch(() => {
  console.error('  No dist/ — run `npm run build` first.');
  process.exit(1);
});

// Browser first: if it can't launch, there's no preview server left running.
const browser = await chromium.launch();
const server = await startPreview();
let failures = 0;

try {
  for (const url of pages) {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      // Turnstile holds a request open, so 'networkidle' never comes on a page
      // with a form. Block it (its widget is Cloudflare's markup anyway) and
      // wait for 'load'.
      await page.route('https://challenges.cloudflare.com/**', (route) => route.abort());
      await page.goto(`${BASE}${url}`, { waitUntil: 'load' });

      const problems = [];
      // Turnstile's iframe is Cloudflare's markup, not ours to fix.
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('.cf-turnstile')
        .analyze();
      for (const v of axe.violations.filter((x) => ['serious', 'critical'].includes(x.impact)))
        problems.push(`axe ${v.impact}: ${v.id} — ${v.help} (${v.nodes.length}× e.g. ${v.nodes[0]?.target.join(' ')})`);

      const positive = await page.$$eval('[tabindex]', (els) =>
        els.filter((e) => Number(e.getAttribute('tabindex')) > 0).map((e) => e.outerHTML.slice(0, 80)));
      for (const p of positive) problems.push(`positive tabindex: ${p}`);

      problems.push(...orderProblems(await tabStops(page)));

      if (problems.length) {
        failures += problems.length;
        console.log(`\n✖ ${url} @ ${vp.width}px`);
        for (const p of problems) console.log(`    ${p}`);
      } else {
        console.log(`✔ ${url} @ ${vp.width}px`);
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}

console.log(failures ? `\n  a11y: ${failures} problem(s).` : '\n  a11y: all clear.');
process.exit(failures ? 1 : 0);
