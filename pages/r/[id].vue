<script setup lang="ts">
// 單則分享頁 /r/{recordId}：每筆 submit 一個可分享 URL，含 OG 卡。
const route = useRoute()
const entry = useEntry(route.params.id as string)
if (!entry) {
  throw createError({ statusCode: 404, statusMessage: '找不到這則紀錄', fatal: true })
}
const e = entry

const config = useRuntimeConfig()
const base = config.app.baseURL.replace(/\/$/, '')
const site = (config.public.siteUrl as string).replace(/\/$/, '')
const asset = (p: string) => `${base}/${p.replace(/^\//, '')}`
const absolute = (p: string) => `${site}/${p.replace(/^\//, '')}`

const dateSlash = formatDateSlash(e.eventTimestamp)
const headline = e.title || e.keyEvents[0] || '漏水紀錄'
const shareTitle = `${headline} · ${dateSlash}`
const excerpt = e.description.replace(/\s+/g, ' ').trim().slice(0, 100)
// OG 卡與 LINE unfurl 只吃圖片，不能餵 mp4 —— 純影片的紀錄改用封面幀
const cover = coverMedia(e)
const coverPath = coverImage(e)
const ogImage = coverPath ? absolute(coverPath) : undefined

useSeoMeta({
  title: shareTitle,
  description: excerpt,
  ogType: 'article',
  ogTitle: shareTitle,
  ogDescription: excerpt,
  ogImage,
  twitterCard: ogImage ? 'summary_large_image' : 'summary',
})
</script>

<template>
  <div class="page" data-testid="share-page">
    <article class="card">
      <NuxtLink to="/" class="back" data-testid="share-back">
        <span class="mono arrow">←</span>
        <span class="mono label">返回時間軸 · LEAK-LOG</span>
      </NuxtLink>

      <div v-if="cover && coverPath" class="hero" data-testid="share-hero">
        <img :src="asset(coverPath)" alt="" />
        <span class="mono filename">{{ mediaName(cover) }}</span>
      </div>

      <div class="body">
        <div v-if="e.keyEvents.length" class="tags">
          <span v-for="t in e.keyEvents" :key="t" class="tag" data-testid="key-tag">
            <span class="mono kicker">關鍵</span>
            <span class="kw">{{ t }}</span>
          </span>
        </div>

        <h1 v-if="e.title" class="title" data-testid="share-title">{{ e.title }}</h1>

        <div class="mono datetime" data-testid="share-datetime">{{ formatDateTimeSlash(e.eventTimestamp) }}</div>

        <p v-if="e.description" class="desc" data-testid="share-desc">{{ e.description }}</p>

        <div v-if="e.media.length" class="photos" data-testid="share-photos">
          <NuxtLink
            v-for="(m, i) in e.media"
            :key="i"
            :to="`/view?r=${e.id}&p=${i}`"
            class="photo"
            data-testid="share-photo"
          >
            <img :src="asset(mediaThumb(m))" :alt="`附件 ${i + 1}`" loading="lazy" />
            <span v-if="m.kind === 'video'" class="play" data-testid="share-photo-video">
              <span class="tri">▶</span>
              <span class="mono dur">{{ formatDuration(m.duration) }}</span>
            </span>
            <span class="mono filename sm">{{ seqName(m.seq - 1, '') }}</span>
          </NuxtLink>
        </div>

        <div class="og" data-testid="share-og">
          <div class="mono og-label">分享預覽</div>
          <div class="og-card" data-testid="share-og-card">
            <div class="og-thumb">
              <img v-if="cover" :src="asset(mediaThumb(cover))" alt="" />
            </div>
            <div class="og-text">
              <div class="og-title" data-testid="share-og-title">{{ shareTitle }}</div>
              <div class="og-sub">漏水紀錄</div>
            </div>
          </div>
        </div>

        <div class="mono footnote" data-testid="share-footnote">
          已移除 EXIF 地理資訊 · 照片最大邊 2048px · 影片 720p 並清除 metadata
        </div>

        <SiteFooter />
      </div>
    </article>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  padding: clamp(0px, 3vw, 40px);
}
.card {
  width: 100%;
  max-width: 640px;
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-card);
  overflow: hidden;
}
.back {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px clamp(18px, 4vw, 24px);
  border-bottom: 1px solid var(--border);
  text-decoration: none;
}
.back .arrow {
  font-size: 11px;
  color: var(--accent);
}
.back .label {
  font-size: 11px;
  color: var(--muted-3);
}
.hero {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  background: var(--stripe);
  border-bottom: 1px solid var(--img-border);
}
.hero img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.filename {
  position: absolute;
  left: 0;
  bottom: 0;
  font-size: 9px;
  color: var(--faint);
  padding: 6px 8px;
}
.filename.sm {
  font-size: 8px;
  padding: 3px 4px;
}
.body {
  padding: clamp(20px, 4vw, 28px) clamp(18px, 4vw, 28px);
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border: 1px solid var(--accent-border);
  border-radius: var(--r-sm);
}
.kicker {
  font-size: 9px;
  letter-spacing: 0.05em;
  color: var(--accent-text);
}
.kw {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent-text);
}
.title {
  font-size: clamp(19px, 5vw, 22px);
  font-weight: 700;
  color: var(--text);
  line-height: 1.4;
  margin: 0 0 8px;
}
.datetime {
  font-size: 13px;
  color: var(--text);
  margin-bottom: 16px;
}
.desc {
  font-size: clamp(14px, 3.6vw, 15px);
  line-height: 1.85;
  color: var(--text-2);
  margin: 0 0 20px;
  white-space: pre-line;
}
.photos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
  margin-bottom: 24px;
}
.photo {
  position: relative;
  aspect-ratio: 3 / 2;
  border-radius: var(--r-sm);
  overflow: hidden;
  border: 1px solid var(--img-border);
  background: var(--stripe);
  display: block;
}
.photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
/* 影片：播放記號放右下，左下留給檔名序號 */
.play {
  position: absolute;
  right: 4px;
  bottom: 4px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: var(--r-sm);
  background: rgba(20, 20, 20, 0.72);
}
.play .tri {
  font-size: 8px;
  color: #fff;
  line-height: 1;
}
.play .dur {
  font-size: 9px;
  color: #fff;
  line-height: 1;
}
.og {
  border-top: 1px solid var(--border);
  padding-top: 18px;
}
.og-label {
  font-size: 9px;
  letter-spacing: 0.08em;
  color: var(--faint);
  text-transform: uppercase;
  margin-bottom: 8px;
}
.og-card {
  display: flex;
  border: 1px solid var(--img-border);
  border-radius: var(--r-card);
  overflow: hidden;
}
.og-thumb {
  width: clamp(90px, 28vw, 120px);
  flex: none;
  aspect-ratio: 1 / 1;
  background: var(--stripe);
}
.og-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.og-text {
  padding: 12px 14px;
  min-width: 0;
}
.og-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
}
.og-sub {
  font-size: 11px;
  color: var(--muted-3);
  margin-top: 4px;
}
.footnote {
  font-size: 9px;
  color: var(--faint-3);
  margin-top: 18px;
  line-height: 1.6;
}
</style>
