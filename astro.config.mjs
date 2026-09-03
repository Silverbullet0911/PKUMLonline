// @ts-check
import { defineConfig } from 'astro/config'

export default defineConfig({
  output: 'static',
  // Cloudflare Pages serves from the root domain. The old GitHub Pages
  // `/PKUMLonline/` path is intentionally not carried over.
  site: 'https://pkumlonline.pages.dev',
  base: '/',
})
