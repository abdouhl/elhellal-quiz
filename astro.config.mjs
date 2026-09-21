import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://quiz.elhellal.com',
  integrations: [sitemap({ filter: (page) => !page.includes('/q/') })],
  adapter: cloudflare(),
});
