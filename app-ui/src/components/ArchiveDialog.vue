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

        <v-autocomplete
          v-model="folder"
          class="control-field"
          :label="$t('archive.folder')"
          :items="folders"
          item-title="title"
          item-value="value"
          :loading="loading"
          :no-data-text="$t('global.no-data-text')"
          :aria-label="$t('archive.folder')"
          clearable />

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
          :loading="loading"
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
import { mdiArchiveArrowDown, mdiClose } from '@mdi/js';
import {
  ARCHIVE_LAST_FOLDER_KEY,
  createArchiveTitle,
  fetchArchiveMetadata,
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
      mdiClose
    };
  },

  data() {
    return {
      show: false,
      loading: false,
      unreachable: false,
      folders: [],
      libraries: [],
      folder: null,
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

    canConfirm() {
      return this.folder !== null
        && this.folder !== undefined
        && normaliseArchiveTitle(this.title).length > 0;
    }
  },

  methods: {
    async open() {
      const generation = ++this.loadGeneration;
      this.show = true;
      this.loading = true;
      this.unreachable = false;
      this.folders = [];
      this.libraries = [];
      this.folder = localStorage.getItem(ARCHIVE_LAST_FOLDER_KEY);
      this.title = createArchiveTitle();
      this.preset = 'document';
      this.collection = 'auto';

      try {
        const metadata = await fetchArchiveMetadata(
          getArchiveServiceUrl(),
          undefined,
          this.$i18n.locale
        );
        if (generation !== this.loadGeneration) {
          return;
        }
        this.folders = metadata.folders;
        this.libraries = metadata.libraries;
        this.unreachable = metadata.unreachable;
        if (this.folder === null && this.folders.length > 0) {
          this.folder = this.folders[0].value;
        }
      } catch {
        if (generation === this.loadGeneration) {
          this.folders = [];
          this.libraries = [];
          this.unreachable = true;
        }
      } finally {
        if (generation === this.loadGeneration) {
          this.loading = false;
        }
      }
    },

    confirm() {
      if (!this.canConfirm) {
        return;
      }

      const folder = normaliseFolderPath(this.folder);
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
