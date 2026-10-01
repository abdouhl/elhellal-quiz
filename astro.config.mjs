import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://quiz.elhellal.com',
  integrations: [sitemap()],
  adapter: cloudflare(),
  // The quiz scripts load their language's questions with a top-level await.
  vite: { build: { target: 'es2022' } },
});
