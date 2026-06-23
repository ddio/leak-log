// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  ssr: true, // static generate（nuxt generate）會預先渲染每頁

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
      crawlLinks: true, // 從首頁爬連結，自動預渲染每個 /entry/{id}
      routes: ['/'],
    },
  },

  devtools: { enabled: false },
})
