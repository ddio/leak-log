<script setup lang="ts">
// 時間軸首頁：依日分組、倒序。三欄（時間 / 軸 / 內容）。
// 有照片的則 → 進 Lightbox；純文字則 → 進單則分享頁。
const entries = useEntries()
const groups = groupByDay(entries)
const stats = useStats(entries)
const lastGroupKey = groups.length ? groups[groups.length - 1].key : null // 最早一天 = 起點

const base = useRuntimeConfig().app.baseURL.replace(/\/$/, '')
const asset = (p: string) => `${base}/${p.replace(/^\//, '')}`
const linkOf = (e: { id: string; photos: unknown[] }) =>
  e.photos.length ? `/view?r=${e.id}` : `/r/${e.id}`

useSeoMeta({
  title: '漏水狀況時間軸',
  description: '住處漏水點的長期、多人協作觀察紀錄。',
  ogTitle: '漏水狀況時間軸',
  ogDescription: '住處漏水點的長期、多人協作觀察紀錄。',
})
</script>

<template>
  <div class="page" data-testid="timeline-page">
    <main class="card">
      <header class="head" data-testid="timeline-header">
        <div class="head-top">
          <span class="mono brand" data-testid="timeline-brand">LEAK-LOG</span>
          <span class="mono count" data-testid="timeline-count">{{ stats.total }} 則 · 追蹤 {{ stats.trackedDays }} 天</span>
        </div>
        <h1 class="title" data-testid="timeline-title">漏水狀況時間軸</h1>
        <p class="sub">
          <template v-if="stats.lastUpdated">最後更新 {{ formatDateSlash(stats.lastUpdated) }} · </template>多人協作紀錄
        </p>
      </header>

      <div class="legend" data-testid="timeline-legend">
        <span class="leg"><span class="m-key" /> 關鍵事件</span>
        <span class="leg"><span class="m-routine" /> 例行紀錄</span>
      </div>

      <p v-if="!entries.length" class="empty" data-testid="timeline-empty">還沒有任何紀錄。</p>

      <div class="timeline" data-testid="timeline-list">
        <template v-for="(g, gi) in groups" :key="g.key">
          <!-- 日標題列 -->
          <div class="row day" :class="{ first: gi === 0 }" data-testid="timeline-day">
            <div class="col-time mono day-date">{{ g.monthDay }}</div>
            <div class="col-axis"><span class="m-day" /></div>
            <div class="col-content day-meta">
              <span class="wd">{{ g.weekday }}</span>
              <span class="mono dn">· {{ g.entries.length }} 則</span>
              <span v-if="g.key === lastGroupKey" class="mono dn">· 起點</span>
            </div>
          </div>

          <!-- 當日各則 -->
          <div
            v-for="e in g.entries"
            :key="e.id"
            class="row entry"
            :class="e.keyEvents.length ? 'is-key' : 'is-routine'"
            data-testid="timeline-entry"
            :data-record-id="e.id"
          >
            <!-- 覆蓋整列的主連結（→ Lightbox / 純文字則 → 分享頁） -->
            <NuxtLink
              :to="linkOf(e)"
              class="row-cover"
              data-testid="entry-open"
              :aria-label="`檢視 ${formatTime(e.eventTimestamp)} 這則`"
            />
            <div class="col-time mono">{{ formatTime(e.eventTimestamp) }}</div>
            <div class="col-axis">
              <span :class="e.keyEvents.length ? 'm-key' : 'm-routine'" />
            </div>
            <div class="col-content">
              <div class="meta-line">
                <div v-if="e.keyEvents.length" class="tags">
                  <span v-for="t in e.keyEvents" :key="t" class="tag" data-testid="key-tag">
                    <span class="mono kicker">關鍵</span>
                    <span class="kw">{{ t }}</span>
                  </span>
                </div>
                <NuxtLink :to="`/r/${e.id}`" class="share-link mono" data-testid="entry-share">
                  分享頁 ↗
                </NuxtLink>
              </div>
              <h2 v-if="e.title" class="entry-title" data-testid="entry-title">{{ e.title }}</h2>
              <p class="desc" data-testid="entry-desc">{{ e.description }}</p>
              <div v-if="e.photos.length" class="thumbs" data-testid="entry-thumbs">
                <span v-for="(p, i) in e.photos" :key="i" class="thumb" data-testid="entry-thumb">
                  <img :src="asset(p.thumb)" :alt="`照片 ${i + 1}`" loading="lazy" />
                </span>
              </div>
            </div>
          </div>
        </template>
      </div>

      <SiteFooter />
    </main>
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
  max-width: 760px;
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-card);
  padding: clamp(20px, 4vw, 32px);
}
.head-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}
.brand {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--accent);
}
.count {
  font-size: 10px;
  color: var(--faint);
}
.title {
  margin: 10px 0 4px;
  font-size: clamp(20px, 5vw, 23px);
  font-weight: 700;
}
.sub {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--muted-3);
}
.legend {
  display: flex;
  gap: 18px;
  background: var(--panel);
  padding: 8px 12px;
  border-radius: var(--r-sm);
  margin-bottom: 8px;
}
.leg {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--muted);
}
.empty {
  color: var(--muted-2);
}

/* markers */
.m-day {
  width: 9px;
  height: 9px;
  transform: rotate(45deg);
  border: 1.5px solid #a9a89f;
  background: var(--card);
}
.m-key {
  width: 9px;
  height: 9px;
  background: var(--accent);
  border-radius: 1px;
}
.m-routine {
  width: 6px;
  height: 6px;
  border: 1.5px solid #c4c3bc;
  border-radius: 50%;
  background: var(--card);
}

/* timeline rows */
.timeline {
  margin-top: 4px;
}
.row {
  display: flex;
}
.col-time {
  width: clamp(52px, 13vw, 62px);
  flex: none;
  font-size: 11px;
  line-height: 1.4;
  color: var(--muted);
}
.col-axis {
  width: 26px;
  flex: none;
  position: relative;
  display: flex;
  justify-content: center;
}
.col-axis::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  background: var(--axis);
  transform: translateX(-50%);
}
.col-axis > span {
  position: relative;
  z-index: 1;
}
.col-content {
  flex: 1;
  min-width: 0;
}

/* day header row */
.row.day .col-time {
  padding-top: 18px;
  font-size: 13px;
  font-weight: 500;
  color: #1a1c20;
}
.row.day .col-axis > span {
  margin-top: 19px;
}
.row.day .day-meta {
  padding: 14px 0 6px;
}
.row.day:not(.first) {
  border-top: 1px solid var(--border-2);
  margin-top: 6px;
}
.day-meta .wd {
  font-size: 13px;
  color: var(--muted);
}
.day-meta .dn {
  font-size: 11px;
  color: var(--faint);
}

/* entry rows */
.row.entry {
  position: relative;
  color: inherit;
}
.row.entry:hover {
  background: var(--stage);
}
/* 覆蓋整列的主連結（stretched link），讓整列可點又不巢狀 <a> */
.row-cover {
  position: absolute;
  inset: 0;
  z-index: 1;
}
.row.entry .col-time {
  padding-top: 12px;
}
.row.entry.is-key .col-axis > span {
  margin-top: 13px;
}
.row.entry.is-routine .col-axis > span {
  margin-top: 12px;
}
.row.entry .col-content {
  padding: 10px 0 8px;
}
.row.entry.is-key .col-content {
  padding: 11px 0 12px;
}
/* tags 與分享頁連結同一行，連結靠右 */
.meta-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.share-link {
  margin-left: auto;
  position: relative;
  z-index: 2; /* 蓋在 row-cover 之上，可獨立點擊 */
  flex-shrink: 0;
  font-size: 11px;
  color: var(--accent-text);
  text-decoration: none;
  white-space: nowrap;
}
.share-link:hover {
  text-decoration: underline;
}
.tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 9px;
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
.entry-title {
  margin: 0 0 4px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
}
.is-key .entry-title {
  font-size: 15px;
}
.is-routine .entry-title {
  font-size: 13px;
  color: var(--text-2);
}
.desc {
  margin: 0;
  white-space: pre-line;
}
.is-key .desc {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-2);
}
.is-routine .desc {
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-3);
}
.thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.thumb {
  flex: 0 1 110px;
  aspect-ratio: 3 / 2;
  border-radius: var(--r-sm);
  overflow: hidden;
  border: 1px solid var(--img-border);
  background: var(--stripe);
}
.is-key .thumb {
  flex-basis: 120px;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
