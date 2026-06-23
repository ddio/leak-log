<template>
  <footer class="site-foot" data-testid="site-footer">
    <a class="mono repo" href="https://github.com/ddio/leak-log" target="_blank" rel="noopener">
      github.com/ddio/leak-log
    </a>
    <span class="mono lic">
      程式
      <a href="https://github.com/ddio/leak-log/blob/main/LICENSE" target="_blank" rel="noopener">MIT</a>
      · 資料
      <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>
    </span>
  </footer>
</template>

<style scoped>
.site-foot {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 6px 14px;
  font-size: 10px;
  color: var(--faint);
}
.repo {
  color: var(--accent-text);
  text-decoration: none;
}
.repo:hover {
  text-decoration: underline;
}
.lic a {
  color: var(--accent-text);
  text-decoration: none;
}
.lic a:hover {
  text-decoration: underline;
}
</style>
