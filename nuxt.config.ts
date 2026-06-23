// https://nuxt.com/docs/api/configuration/nuxt-config
import { readFileSync } from 'node:fs'

// 單則分享頁 /r/{id} 只靠外部分享連結進入（站內時間軸是連去 Lightbox），
// crawler 不會找到，所以從 entries.json 明確列出每筆要預渲染的路由。
const entries = JSON.parse(
  readFileSync(new URL('./content/entries.json', import.meta.url), 'utf8'),
) as Array<{ id: string }>
const shareRoutes = entries.map((e) => `/r/${e.id}`)

export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  ssr: true, // static generate（nuxt generate）會預先渲染每頁

  css: ['~/assets/css/main.css'],

  app: {
    // GitHub Pages 專案站：https://ddio.github.io/leak-log/
    // 可用 NUXT_APP_BASE_URL 覆寫（之後綁自訂網域時）
    baseURL: '/leak-log/',
    head: {
      htmlAttrs: { lang: 'zh-Hant' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap',
        },
      ],
    },
  },

  runtimeConfig: {
    public: {
      // OG image / 分享連結要用絕對網址，可用 NUXT_PUBLIC_SITE_URL 覆寫
      siteUrl: 'https://ddio.github.io/leak-log/',
    },
  },

  nitro: {
    prerender: {
      crawlLinks: true, // 從首頁爬連結（含 /view）
      routes: ['/', '/view', ...shareRoutes], // 明確補上每筆分享頁
    },
  },

  devtools: { enabled: false },
})
