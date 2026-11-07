<template>
  <div class="files-view">
    <v-data-table
        v-model="selectedFiles"
        class="files-table"
        :headers="headers"
        :items="files"
        :items-per-page-text="$t('files.items-per-page')"
        return-object
        show-select>
      <template #top>
        <v-toolbar flat color="surface" class="files-toolbar" rounded="xl">
          <v-checkbox v-model="thumbnails.show"
            class="toolbar-toggle" :label="$t('files.thumbnail-show')" />
          <v-slider v-if="thumbnails.show" v-model="thumbnails.size" class="thumbnail-slider" color="primary" min="32" max="128"
            step="16" :inverse-label="true"
            :label="`${$t('files.thumbnail-size')} (${thumbnails.size})`" />
          <v-spacer />
          <v-btn v-if="!smAndDown" :disabled="selectedFiles.length === 0" color="error" variant="tonal"
            class="toolbar-action" @click="multipleDelete">
            <v-icon class="mr-2" :icon="mdiDelete" />{{ $t('files.button:delete-selected') }}
          </v-btn>
          <v-menu v-if="actions.length > 0" bottom :offset-y="true">
            <template #activator="{ props }">
              <v-btn
                  :disabled="selectedFiles.length === 0"
                  color="primary"
                  class="toolbar-action"
                  v-bind="props">
                <v-icon :class="{ 'mr-2': !smAndDown }" :icon="mdiDotsVertical" />
                <span v-if="!smAndDown">{{ $t('files.button:action-selected') }}</span>
              </v-btn>
            </template>
            <v-list>
              <v-list-item v-if="smAndDown" :title="$t('files.button:delete-selected')" @click="multipleDelete">
                <template #prepend><v-icon :icon="mdiDelete" color="error" /></template>
              </v-list-item>
              <v-list-item v-for="(action, index) in actions" :key="index" :title="action" @click="multipleAction(action)">
                <template #prepend><v-icon :icon="mdiPlay" /></template>
              </v-list-item>
            </v-list>
          </v-menu>
          <v-dialog v-model="dialogEdit" max-width="500px">
            <v-card rounded="xl">
              <v-card-title class="text-h5">{{ $t('files.dialog:rename') }}</v-card-title>
              <v-card-text>
                <v-container>
                  <v-text-field v-model="editedItem.newName" class="control-field" :label="$t('files.filename')" />
                </v-container>
              </v-card-text>
              <v-card-actions class="px-6 pb-5">
                <v-spacer />
                <v-btn @click="closeRename">
                  <v-icon class="mr-2" :icon="mdiClose" />{{ $t('files.dialog:rename-cancel') }}
                </v-btn>
                <v-btn color="primary" variant="flat" @click="renameFileConfirm">
                  <v-icon class="mr-2" :icon="mdiContentSave" />{{ $t('files.dialog:rename-save') }}
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-dialog>
        </v-toolbar>
      </template>

      <template v-if="thumbnails.show" #[`item.thumb`]="{ item }">
        <v-img :src="`api/v1/files/${item.name}/thumbnail`"
          class="result-thumbnail"
          width="128"
          :max-height="thumbnails.size" :max-width="thumbnails.size"
          :contain="true">
          <template #error>
            <div class="thumbnail-fallback" :style="{ width: `${thumbnails.size}px`, height: `${thumbnails.size}px` }">
              <v-icon :icon="mdiFile" color="primary" />
            </div>
          </template>
        </v-img>
      </template>
      <template #[`item.name`]="{ item }">
        <span class="file-name">{{ item.name }}</span>
      </template>
      <template #[`item.lastModified`]="{ item }">
        <span class="metric-value file-meta">{{ $d(new Date(item.lastModified), 'long') }}</span>
      </template>
      <template #[`item.sizeString`]="{ item }">
        <span class="metric-value file-meta">{{ item.sizeString }}</span>
      </template>
      <template #[`item.actions`]="{ item }">
        <div class="file-actions">
          <v-btn variant="text" color="primary" aria-label="Download" title="Download" @click="open(item)">
            <v-icon :icon="mdiDownload" /><span class="d-none d-md-inline ml-2">Download</span>
          </v-btn>
          <v-btn variant="text" color="on-surface" aria-label="Rename" title="Rename" @click="fileRename(item)">
            <v-icon :icon="mdiPencil" /><span class="d-none d-md-inline ml-2">Rename</span>
          </v-btn>
          <v-btn variant="text" color="error" aria-label="Delete" title="Delete" @click="fileRemove(item)">
            <v-icon :icon="mdiDelete" /><span class="d-none d-md-inline ml-2">Delete</span>
          </v-btn>
        </div>
      </template>
      <template #no-data>
        <div class="files-empty">
          <v-icon :icon="mdiFolderOpen" size="52" color="primary" />
          <div class="text-h6">No scanned files yet</div>
          <div class="text-body-2 text-medium-emphasis">Your scanned files will appear here.</div>
        </div>
      </template>
      <template #[`footer.page-text`]="items">
        <span class="metric-value">{{ items.pageStart }} - {{ items.pageStop }} / {{ items.itemsLength }}</span>
      </template>
    </v-data-table>
  </div>
</template>

<script>
import Common from '../classes/common';
import Storage from '../classes/storage';
import {
  mdiClose,
  mdiContentSave,
  mdiDelete,
  mdiDotsVertical,
  mdiDownload,
  mdiFile,
  mdiFolderOpen,
  mdiPencil,
  mdiPlay
} from '@mdi/js';
import { useDisplay } from 'vuetify';
const storage = Storage.instance();

export default {
  name: 'Files',

  emits: ['mask', 'notify'],

  setup() {
    const { smAndDown } = useDisplay();
    return {
      mdiClose,
      mdiContentSave,
      mdiDelete,
      mdiDotsVertical,
      mdiDownload,
      mdiFile,
      mdiFolderOpen,
      mdiPencil,
      mdiPlay,
      smAndDown
    };
  },
  
  data() {
    return {
      dialogDelete: false,
      dialogEdit: false,
      files: [],
      editedItem: {
        name: '',
        newName: ''
      },
      defaultItem: {
        name: '',
        newName: ''
      },
      selectedFiles: [],
      thumbnails: {
        show: storage.settings.thumbnails.show,
        size: storage.settings.thumbnails.size
      },
      actions: []
    };
  },

  computed: {
    headers() {
      const headers = [
        {
          align: 'start',
          sortable: false,
          value: 'thumb',
          key: 'thumb',
        },
        {
          title: this.$t('files.filename'),
          align: 'start',
          sortable: true,
          key: 'name',
        },
        {
          title: this.$t('files.date'),
          align: 'start',
          sortable: true,
          key: 'lastModified',
        },
        {
          title: this.$t('files.size'),
          align: 'start',
          sortable: true,
          key: 'sizeString',
        },
        {
          title: this.$t('files.actions'),
          align: 'end',
          value: 'actions',
          sortable: false,
          key: 'actions',
        },
      ];

      if (this.smAndDown) {
        headers.splice(2, 2);
      }
      return headers;
    }
  },

  watch: {
    dialogEdit(val) {
      val || this.closeRename();
    },
    thumbnails: {
      handler(thumbnails) {
        const settings = storage.settings;
        settings.thumbnails = thumbnails;
        storage.settings = settings;
      },
      deep: true
    }
  },

  mounted() {
    this.fileList();
    this.actionList();
  },

  methods: {
    actionList() {
      this.$emit('mask', 1);
      Common.fetch('api/v1/context').then(context => {
        this.actions = context.actions;
        this.$emit('mask', -1);
      }).catch(error => {
        this.$emit('notify', {type: 'e', message: error});
        this.$emit('mask', -1);
      });
    },

    fileList() {
      this.$emit('mask', 1);
      Common.fetch('api/v1/files').then(files => {
        this.files = files;
        this.$emit('mask', -1);
      }).catch(error => {
        this.$emit('notify', {type: 'e', message: error});
        this.$emit('mask', -1);
      });
    },

    fileRemove(file) {
      this.$emit('mask', 1);
      Common.fetch(`api/v1/files/${file.name}`, {
        method: 'DELETE'
      }).then(data => {
        this.$emit('notify', {type: 'i', message: `${this.$t('files.message:deleted', [data.name])}`});
        this.fileList();
        this.$emit('mask', -1);
      }).catch(error => {
        this.$emit('notify', {type: 'e', message: error});
        this.$emit('mask', -1);
      });
    },

    fileRename(file) {
      this.editedIndex = this.files.indexOf(file);
      this.editedItem = Object.assign({}, file);
      this.editedItem.newName = this.editedItem.name;
      this.dialogEdit = true;
    },

    renameFileConfirm() {
      this.$emit('mask', 1);
      Common.fetch(`api/v1/files/${this.editedItem.name}`, {
        method: 'PUT',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({newName: this.editedItem.newName})
      }).then(() => {
        this.$emit('notify', {type: 'i', message: `${this.$t('files.message:renamed')}`});
        this.fileList();
        this.$emit('mask', -1);
      }).catch(error => {
        this.$emit('notify', {type: 'e', message: error});
        this.$emit('mask', -1);
      }).finally(() => {
        this.closeRename();
      });
    },

    closeRename() {
      this.dialogEdit = false;
      this.$nextTick(() => {
        this.editedItem = Object.assign({}, this.defaultItem);
        this.editedIndex = -1;
      });
    },

    async multipleDelete() {
      let refresh = false;
      while (this.selectedFiles.length > 0) {
        refresh = true;
        const name = this.selectedFiles[0].name;
        try {
          await Common.fetch(`api/v1/files/${name}`, {method: 'DELETE'});
          this.$emit('notify', {type: 'i', message: `${this.$t('files.message:deleted', [name])}`});
        } catch (error) {
          this.$emit('notify', {type: 'e', message: error});
        }
        this.selectedFiles.splice(0, 1);
      }

      if (refresh) {
        this.fileList();
      }
    },

    async multipleAction(actionName) {
      let refresh = false;
      while (this.selectedFiles.length > 0) {
        refresh = true;
        const filename = this.selectedFiles[0].name;
        try {
          await Common.fetch(`api/v1/files/${filename}/actions/${actionName}`, {method: 'POST'});
          this.$emit('notify', {type: 'i', message: `${this.$t('files.message:action', [actionName, filename])}`});
        } catch (error) {
          this.$emit('notify', {type: 'e', message: error});
        }
        this.selectedFiles.splice(0, 1);
      }

      if (refresh) {
        this.fileList();
      }
    },

    open(file) {
      window.location.href = `api/v1/files/${file.name}`;
    },

    selectToggle(value) {
      this.selectedFiles = value ? this.files.map(f => f.name) : [];
    }
  }
};
</script>

<style scoped>
.files-view {
  min-width: 0;
}

.files-toolbar {
  height: auto;
  min-height: 72px;
  margin-bottom: 20px;
  padding: 8px 16px;
  border: 1px solid var(--scanner-hairline);
  box-shadow: var(--scanner-card-shadow);
}

.files-toolbar :deep(.v-toolbar__content) {
  height: auto !important;
  min-height: 56px;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding-block: 8px;
}

.toolbar-toggle {
  flex: 0 0 auto;
}

.toolbar-toggle :deep(.v-input__details) {
  display: none;
}

.toolbar-action {
  min-height: 44px;
  margin-left: 8px;
}

.thumbnail-slider {
  min-width: 180px;
  max-width: 250px;
  margin-left: 16px !important;
}

.files-table {
  background: transparent;
}

.files-table :deep(.v-table__wrapper) {
  overflow: visible;
}

.files-table :deep(table) {
  border-collapse: separate;
  border-spacing: 0 12px;
}

.files-table :deep(thead th) {
  height: 44px;
  border: 0;
  color: rgb(var(--v-theme-on-surface-variant));
  font-size: .75rem;
  font-weight: 650;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.files-table :deep(tbody tr) {
  background: rgb(var(--v-theme-surface));
  box-shadow: var(--scanner-card-shadow);
}

.files-table :deep(tbody td) {
  padding-top: 16px !important;
  padding-bottom: 16px !important;
  border-top: 1px solid var(--scanner-hairline);
  border-bottom: 1px solid var(--scanner-hairline);
  background: rgb(var(--v-theme-surface));
}

.files-table :deep(tbody td:first-child) {
  border-left: 1px solid var(--scanner-hairline);
  border-radius: 16px 0 0 16px;
}

.files-table :deep(tbody td:last-child) {
  border-right: 1px solid var(--scanner-hairline);
  border-radius: 0 16px 16px 0;
}

.result-thumbnail,
.thumbnail-fallback {
  overflow: hidden;
  border-radius: var(--v-border-radius);
  background: rgb(var(--v-theme-surface-variant));
}

.thumbnail-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-name {
  display: inline-block;
  max-width: 32ch;
  overflow-wrap: anywhere;
  font-weight: 500;
}

.file-meta {
  color: rgb(var(--v-theme-on-surface-variant));
  white-space: nowrap;
}

.file-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

.file-actions .v-btn {
  min-width: 44px;
  min-height: 44px;
  padding-inline: 10px;
}

.files-empty {
  display: flex;
  min-height: 280px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border: 1px dashed var(--scanner-hairline);
  border-radius: 16px;
  background: rgb(var(--v-theme-surface));
  text-align: center;
}

.files-table :deep(.v-data-table-footer) {
  padding-top: 16px;
}

@media (max-width: 959px) {
  .files-toolbar :deep(.v-toolbar__content) {
    align-items: flex-start;
  }

  .thumbnail-slider {
    min-width: 140px;
    margin-left: 12px !important;
  }

  .file-actions {
    gap: 0;
  }

  .file-actions .v-btn {
    padding-inline: 0;
  }
}

@media (max-width: 599px) {
  .files-toolbar :deep(.v-toolbar__content) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }

  .toolbar-toggle {
    grid-column: 1;
    grid-row: 1;
  }

  .thumbnail-slider {
    grid-column: 1 / -1;
    grid-row: 2;
    width: 100%;
    min-width: 0;
    max-width: none;
    margin: 0 !important;
  }

  .files-toolbar :deep(.v-spacer) {
    display: none;
  }

  .toolbar-action {
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
    margin-left: 0;
  }

  .files-table :deep(thead) {
    display: none;
  }

  .files-table :deep(tbody tr) {
    display: grid;
    grid-template-columns: 40px 64px minmax(0, 1fr);
    grid-template-areas:
      'select thumb name'
      'actions actions actions';
    align-items: center;
    overflow: hidden;
    border: 1px solid var(--scanner-hairline);
    border-radius: 16px;
  }

  .files-table :deep(tbody td) {
    height: auto;
    min-height: 72px;
    padding: 12px 8px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent;
  }

  .files-table :deep(tbody td:nth-child(1)) {
    grid-area: select;
  }

  .files-table :deep(tbody td:nth-child(2)) {
    grid-area: thumb;
  }

  .files-table :deep(tbody td:nth-child(3)) {
    grid-area: name;
  }

  .files-table :deep(tbody td:nth-child(4)) {
    grid-area: actions;
    min-height: 56px;
    padding-block: 4px !important;
    border-top: 1px solid var(--scanner-hairline) !important;
  }

  .files-table :deep(tbody td:has(.files-empty)) {
    grid-column: 1 / -1;
  }

  .file-name {
    max-width: none;
    overflow-wrap: break-word;
    word-break: normal;
    line-height: 1.35;
  }

  .file-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
