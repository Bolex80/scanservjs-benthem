<template>
  <v-dialog
    v-model="show"
    class="archive-dialog"
    width="calc(100% - 32px)"
    max-width="600"
    aria-labelledby="archive-dialog-title">
    <v-card class="archive-dialog-card" rounded="xl">
      <v-card-title id="archive-dialog-title" class="archive-dialog-title">
        <v-icon class="mr-3" :icon="mdiArchiveArrowDown" color="primary" />
        <span>{{ $t('archive.title') }}</span>
      </v-card-title>
      <v-divider />
      <v-card-text class="archive-dialog-content">
        <v-chip
          v-if="unreachable"
          class="archive-warning"
          color="warning"
          variant="tonal"
          size="small">
          {{ $t('archive.unreachable') }}
        </v-chip>

        <label class="archive-label" for="archive-folder-panel">{{ $t('archive.folder') }}</label>
        <div id="archive-folder-panel" class="archive-browser" :class="{ unreachable }" role="navigation" :aria-label="$t('archive.folder')">
          <div class="archive-crumbs">
            <button type="button" class="crumb crumb-root" @click="goTo('')">
              <v-icon size="14" :icon="mdiHomeOutline" />
              <span>{{ $t('archive.share-root') }}</span>
            </button>
            <template v-for="segment in segments" :key="segment.path">
              <v-icon class="crumb-sep" size="15" :icon="mdiChevronRight" />
              <button type="button" class="crumb" :class="{current: segment.path === browsePath}" @click="goTo(segment.path)">{{ segment.name }}</button>
            </template>
          </div>
          <div class="archive-browser-list" role="listbox" :aria-label="$t('archive.folder')">
            <button v-if="browseParent !== null" type="button" class="browser-row up" @click="goTo(browseParent)">
              <v-icon :icon="mdiArrowUp" size="18" />
              <span class="browser-name">{{ $t('archive.up-level') }}</span>
            </button>
            <button
              v-for="entry in entries"
              :key="entry.path"
              type="button"
              class="browser-row"
              role="option"
              @click="goTo(entry.path)">
              <v-icon :icon="mdiFolderOutline" size="19" class="folder-icon" />
              <span class="browser-name">{{ entry.name }}</span>
              <v-icon :icon="mdiChevronRight" size="16" class="browser-chevron" />
            </button>
            <div v-if="browseError" class="browser-empty browser-error">{{ $t('archive.browse-error') }}</div>
            <div v-else-if="!browseLoading && entries.length === 0" class="browser-empty">{{ $t('archive.empty-folder') }}</div>
            <v-progress-linear v-if="browseLoading" indeterminate height="2" class="browser-progress" />
          </div>
          <div class="archive-current">
            <v-icon size="16" :icon="mdiFolderOpenOutline" class="mr-1" />
            <code class="archive-current-path">{{ currentLabel }}</code>
          </div>
        </div>
        <p v-if="!browsePath" class="archive-root-note">{{ $t('archive.root-not-selectable') }}</p>

        <v-text-field
          v-model="title"
          class="control-field"
          :label="$t('archive.document-title')"
          :hint="$t('archive.document-title:hint')"
          persistent-hint
          autocomplete="off" />

        <v-radio-group
          v-model="preset"
          class="archive-quality"
          color="primary"
          :label="$t('archive.quality')">
          <v-radio value="document" :label="$t('archive.quality:document')" />
          <v-radio value="photo" :label="$t('archive.quality:photo')" />
          <v-radio value="quick" :label="$t('archive.quality:quick')" />
        </v-radio-group>

        <v-select
          v-model="collection"
          class="control-field"
          :label="$t('archive.library')"
          :items="libraryItems"
          item-title="title"
          item-value="value"
          :loading="librariesLoading"
          :no-data-text="$t('global.no-data-text')" />
      </v-card-text>
      <v-divider />
      <v-card-actions class="archive-dialog-actions">
        <v-btn color="on-surface" variant="text" @click="show = false">
          <v-icon class="mr-2" :icon="mdiClose" />{{ $t('archive.cancel') }}
        </v-btn>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!canConfirm"
          @click="confirm">
          <v-icon class="mr-2" :icon="mdiArchiveArrowDown" />{{ $t('archive.confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import { mdiArchiveArrowDown, mdiArrowUp, mdiChevronRight, mdiClose, mdiFolderOpenOutline, mdiFolderOutline, mdiHomeOutline } from '@mdi/js';
import {
  ARCHIVE_LAST_FOLDER_KEY,
  createArchiveTitle,
  fetchArchiveChildren,
  fetchArchiveLibraries,
  getArchiveServiceUrl,
  normaliseArchiveTitle,
  normaliseFolderPath
} from '../classes/archive';

export default {
  name: 'ArchiveDialog',

  emits: ['confirm'],

  setup() {
    return {
      mdiArchiveArrowDown,
      mdiArrowUp,
      mdiChevronRight,
      mdiClose,
      mdiFolderOpenOutline,
      mdiFolderOutline,
      mdiHomeOutline
    };
  },

  data() {
    return {
      show: false,
      librariesLoading: false,
      browseLoading: false,
      browseError: false,
      unreachable: false,
      libraries: [],
      browsePath: '',
      browseParent: null,
      entries: [],
      title: '',
      preset: 'document',
      collection: 'auto',
      loadGeneration: 0
    };
  },

  computed: {
    libraryItems() {
      return [
        { title: this.$t('archive.library:auto'), value: 'auto' },
        ...this.libraries
      ];
    },

    segments() {
      if (!this.browsePath) {
        return [];
      }
      const parts = this.browsePath.split('/');
      const segments = [];
      parts.reduce((path, part) => {
        const next = path ? `${path}/${part}` : part;
        segments.push({ name: part, path: next });
        return next;
      }, '');
      return segments;
    },

    currentLabel() {
      return this.browsePath ? `/${this.browsePath}` : this.$t('archive.share-root');
    },

    canConfirm() {
      return Boolean(this.browsePath) && normaliseArchiveTitle(this.title).length > 0;
    }
  },

  methods: {
    async open() {
      const generation = ++this.loadGeneration;
      this.show = true;
      this.librariesLoading = true;
      this.unreachable = false;
      this.libraries = [];
      this.title = createArchiveTitle();
      this.preset = 'document';
      this.collection = 'auto';
      const start = normaliseFolderPath(localStorage.getItem(ARCHIVE_LAST_FOLDER_KEY) || '');
      this.browsePath = start;
      this.entries = [];
      this.browseParent = null;
      this.browseError = false;

      const serviceUrl = getArchiveServiceUrl();
      const [librariesResult] = await Promise.allSettled([
        fetchArchiveLibraries(serviceUrl, this.$i18n.locale)
      ]);
      if (generation === this.loadGeneration) {
        if (librariesResult.status === 'fulfilled') {
          this.libraries = librariesResult.value;
        } else {
          this.unreachable = true;
        }
        this.librariesLoading = false;
      }
      this.navigate(start, generation);
    },

    async navigate(path, generation) {
      const gen = generation ?? ++this.loadGeneration;
      this.browseLoading = true;
      this.browseError = false;
      try {
        const result = await fetchArchiveChildren(getArchiveServiceUrl(), path);
        if (gen !== this.loadGeneration) {
          return;
        }
        this.browsePath = result.path;
        this.browseParent = result.parent;
        this.entries = result.entries;
      } catch {
        if (gen === this.loadGeneration) {
          this.browseError = true;
          this.entries = [];
          this.browseParent = normaliseFolderPath(path).includes('/')
            ? normaliseFolderPath(path).split('/').slice(0, -1).join('/')
            : '';
        }
      } finally {
        if (gen === this.loadGeneration) {
          this.browseLoading = false;
        }
      }
    },

    goTo(path) {
      this.navigate(normaliseFolderPath(path || ''));
    },

    confirm() {
      if (!this.canConfirm) {
        return;
      }

      const folder = this.browsePath;
      localStorage.setItem(ARCHIVE_LAST_FOLDER_KEY, folder);
      this.show = false;
      this.$emit('confirm', {
        folder,
        title: normaliseArchiveTitle(this.title),
        preset: this.preset,
        collection: this.collection || 'auto'
      });
    }
  }
};
</script>

<style scoped>
.archive-dialog-card {
  display: flex;
  max-height: calc(100dvh - 32px);
  flex-direction: column;
  overflow: hidden;
}

.archive-dialog-title {
  display: flex;
  align-items: center;
  padding: 20px 24px;
  font-size: 1.15rem;
  font-weight: 650;
  letter-spacing: -.01em;
}

.archive-dialog-content {
  min-height: 0;
  padding: 20px 24px 8px;
  overflow-y: auto;
}

.archive-label {
  display: block;
  font-size: .875rem;
  font-weight: 600;
  margin: 2px 0 6px;
  color: rgb(var(--v-theme-on-surface));
}

.archive-warning {
  max-width: 100%;
  height: auto;
  min-height: 32px;
  margin-bottom: 16px;
  white-space: normal;
}

.archive-warning :deep(.v-chip__content) {
  white-space: normal;
}

.archive-browser {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 14px;
}

.archive-browser.unreachable {
  opacity: .55;
  pointer-events: none;
}

.archive-crumbs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 10px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  overflow-x: auto;
  white-space: nowrap;
}

.crumb {
  appearance: none;
  border: 0;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), .72);
  font: inherit;
  font-size: .8125rem;
  font-weight: 600;
  padding: 3px 6px;
  border-radius: 6px;
  cursor: pointer;
}

.crumb:hover {
  background: rgba(var(--v-theme-on-surface), .1);
  color: rgb(var(--v-theme-on-surface));
}

.crumb.current {
  color: rgb(var(--v-theme-primary));
}

.crumb-root {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.crumb-sep {
  color: rgba(var(--v-theme-on-surface), .4);
}

.archive-browser-list {
  max-height: 172px;
  overflow-y: auto;
  padding: 4px;
}

.browser-row {
  appearance: none;
  border: 0;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), .92);
  padding: 8px 10px;
  border-radius: 10px;
  font: inherit;
  font-size: .875rem;
  text-align: left;
  cursor: pointer;
}

.browser-row:hover {
  background: rgba(var(--v-theme-primary), .1);
}

.browser-row.up {
  color: rgba(var(--v-theme-on-surface), .62);
  font-style: italic;
}

.folder-icon {
  color: rgb(var(--v-theme-document));
  flex: none;
}

.browser-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.browser-chevron {
  margin-left: auto;
  color: rgba(var(--v-theme-on-surface), .35);
  flex: none;
}

.browser-empty {
  padding: 14px 12px;
  font-size: .8125rem;
  color: rgba(var(--v-theme-on-surface), .55);
}

.browser-error {
  color: rgb(var(--v-theme-warning));
}

.browser-progress {
  margin: 2px 4px 4px;
}

.archive-current {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), .09);
}

.archive-current-path {
  font-family: ui-monospace, ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .75rem;
  color: rgba(var(--v-theme-on-surface), .78);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-root-note {
  margin: -8px 2px 8px;
  font-size: .75rem;
  color: rgba(var(--v-theme-on-surface), .55);
}

.archive-quality {
  margin-block: 8px 12px;
}

.archive-quality :deep(.v-input__control) {
  padding-top: 4px;
}

.archive-quality :deep(.v-selection-control-group) {
  gap: 2px;
}

.archive-quality :deep(.v-selection-control) {
  min-height: 40px;
}

.archive-quality :deep(.v-label) {
  white-space: normal;
}

.archive-dialog-actions {
  gap: 8px;
  padding: 16px 24px 20px;
}

.archive-dialog-actions .v-btn {
  min-height: 44px;
}

@media (max-width: 599px) {
  .archive-dialog-title {
    padding: 18px 20px;
  }

  .archive-dialog-content {
    padding: 16px 20px 4px;
  }

  .archive-browser-list {
    max-height: 140px;
  }

  .archive-dialog-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr);
    padding: 12px 20px 16px;
  }

  .archive-dialog-actions :deep(.v-spacer) {
    display: none;
  }

  .archive-dialog-actions .v-btn {
    width: 100%;
    min-width: 0;
    margin: 0;
    padding-inline: 8px;
  }
}
</style>
