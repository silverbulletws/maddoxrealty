// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://maddoxrealty.com',
  // Matches the URLs Google has indexed for the WordPress site.
  trailingSlash: 'always',
  vite: { plugins: [tailwindcss()] },
  integrations: [sitemap()],
});
