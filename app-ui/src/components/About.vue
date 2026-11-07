<template>
  <div class="about-view">
    <v-card class="about-card" rounded="xl">
      <v-card-text class="about-hero">
        <v-avatar class="about-mark" size="56" color="primary" variant="tonal">
          <v-icon :icon="mdiDocumentScanner" color="primary" size="30" />
        </v-avatar>
        <div>
          <div class="text-h4 about-title">
            <a target="_blank" rel="noopener" href="https://sbs20.github.io/scanservjs/">{{ $t('global.application-name') }}</a>
          </div>
          <div class="text-body-2 mt-2 engine-line">Benthem Scanner — a Benthem edition of scanservjs v3.3.0 (GPL-2.0, © Sam Strachan)</div>
        </div>
        <v-chip class="version-chip metric-value" color="primary" variant="tonal">v{{ version }}</v-chip>
      </v-card-text>

      <v-divider />

      <v-card-text class="about-content">
        <p class="text-body-1 about-intro">
          {{ $t('about.main') }}
        </p>

        <div class="about-links">
          <div class="about-link-row">
            <v-icon :icon="mdiSourceRepository" color="primary" />
            <div class="text-body-1">
              {{ $t('about.issue') }}
              <a target="_blank" rel="noopener" href="https://github.com/sbs20/scanservjs">https://github.com/sbs20/scanservjs</a>
            </div>
          </div>
          <div class="about-link-row">
            <v-icon :icon="mdiApi" color="primary" />
            <div class="text-body-1">
              {{ $t('about.api') }}
              <a target="_blank" rel="noopener" href="api-docs">/api-docs</a>
            </div>
          </div>
        </div>

        <v-btn class="system-info-button" @click="showSystemInfo">
          <v-icon class="mr-2" :icon="mdiInformationOutline" />{{ $t('about.system-info') }}
        </v-btn>
      </v-card-text>
    </v-card>

    <v-dialog v-model="systemInfoDialog" aria-role="dialog" max-width="480" aria-modal @keydown.stop="_onKeys">
      <v-card rounded="xl">
        <v-card-title class="system-info-title">
          <v-icon class="mr-2" :icon="mdiInformationOutline" color="primary" />{{ $t('about.system-info') }}
        </v-card-title>
        <v-card-text>
          <pre class="text-caption system-info">{{ systemInfo }}</pre>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<script>
import { mdiApi, mdiInformationOutline, mdiSourceRepository } from '@mdi/js';
import { mdiDocumentScanner } from '../icons/document-scanner';
import Common from '../classes/common';
import Constants from '../classes/constants';

export default {
  name: 'About',

  emits: ['mask', 'notify'],

  setup() {
    return {
      mdiApi,
      mdiDocumentScanner,
      mdiInformationOutline,
      mdiSourceRepository
    };
  },

  data() {
    return {
      version: Constants.Version,
      systemInfo: null,
      systemInfoDialog: false
    };
  },

  methods: {
    _onKeys(event) {
      if (event.keyCode === Constants.Keys.enter) {
        this.ok();
      }
    },

    showSystemInfo() {
      this.$emit('mask', 1);
      Common.fetch('api/v1/system').then(data => {
        this.systemInfoDialog = true;
        this.systemInfo = data;
        this.$emit('mask', -1);
      }).catch(error => {
        this.$emit('notify', { type: 'e', message: error });
        this.$emit('mask', -1);
      });
    }
  }
};
</script>

<style scoped>
.about-view {
  max-width: 960px;
  margin-inline: auto;
}

.about-card {
  overflow: hidden;
}

.about-hero {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 20px;
  padding: 28px;
}

.about-mark {
  border: 1px solid rgb(var(--v-theme-primary));
  box-shadow: inset 0 0 0 4px rgb(var(--v-theme-surface));
}

.about-title {
  font-weight: 650;
  letter-spacing: -.01em;
}

.about-title a {
  color: inherit;
  text-decoration: none;
}

.engine-line {
  color: rgb(var(--v-theme-on-surface-variant));
  line-height: 1.5;
}

.version-chip {
  font-weight: 500;
}

.about-content {
  padding: 28px;
}

.about-intro {
  max-width: 75ch;
  margin-bottom: 28px;
  line-height: 1.7;
}

.about-links {
  display: grid;
  gap: 16px;
  margin-bottom: 28px;
}

.about-link-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.about-link-row a {
  display: block;
  margin-top: 4px;
  overflow-wrap: anywhere;
}

.system-info-button {
  min-height: 44px;
}

.system-info-title {
  font-size: 1.1rem;
  font-weight: 650;
}

.system-info {
  max-height: 55vh;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 599px) {
  .about-hero {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    padding: 20px;
  }

  .version-chip {
    grid-column: 2;
    justify-self: start;
  }

  .about-title {
    font-size: 1.65rem;
  }

  .about-content {
    padding: 20px;
  }
}
</style>
