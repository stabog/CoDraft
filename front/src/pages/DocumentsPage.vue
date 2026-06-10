<template>
  <section class="welcome-page">
    <div class="welcome-content">
      <p class="eyebrow">CoDraft</p>
      <h1>Выберите документ</h1>
      <p class="welcome-hint">Откройте документ в списке слева или создайте новый.</p>
    </div>
  </section>
</template>

<style scoped>
.welcome-page {
  align-items: center;
  display: flex;
  height: 100%;
  justify-content: center;
  padding: 24px;
}

.welcome-content {
  max-width: 420px;
  text-align: center;
}

.welcome-content h1 {
  color: var(--text-normal);
  font-size: 28px;
  font-weight: 600;
  margin: 8px 0 12px;
}

.welcome-hint {
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
}
</style>
