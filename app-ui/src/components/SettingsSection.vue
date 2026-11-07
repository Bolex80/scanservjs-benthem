<template>
  <v-card class="settings-card mb-6" rounded="xl">
    <v-card-title class="settings-card-title"><slot name="title" /></v-card-title>
    <v-divider />
    <v-card-text class="pa-0">
      <slot name="items" />
    </v-card-text>
  </v-card>
</template>

<style scoped>
.settings-card {
  overflow: hidden;
}

.settings-card-title {
  padding: 20px 24px;
  font-size: 1rem;
  font-weight: 650;
  letter-spacing: -.01em;
}
</style>
