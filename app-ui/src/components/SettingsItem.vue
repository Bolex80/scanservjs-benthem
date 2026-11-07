<template>
  <div class="settings-item">
    <div class="settings-description"><slot name="description" /></div>
    <div class="settings-action"><slot name="action" /></div>
  </div>
</template>

<style>
.settings-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 24px;
  min-height: 84px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--scanner-hairline);
}

.settings-item:last-child {
  border-bottom: 0;
}

.settings-description {
  line-height: 1.55;
}

.settings-action {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 180px;
}

@media (max-width: 599px) {
  .settings-item {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .settings-action {
    justify-content: flex-start;
    width: 100%;
    min-width: 0;
  }

  .settings-item:has(.v-switch) {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }

  .settings-item:has(.v-switch) .settings-action {
    width: auto;
  }
}
</style>
