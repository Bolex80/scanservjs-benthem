<template>
  <div class="scan-view">
    <div class="scan-layout">
      <div class="scan-settings">
        <v-card class="source-card" rounded="xl">
          <v-card-title class="scan-card-title">Source settings</v-card-title>
          <v-card-text>
            <div class="d-flex align-center device-row">
              <v-select v-if="context.devices.length > 0"
                v-model="device"
                class="control-field"
                style="min-width: 0px;"
                :label="$t('scan.device')"
                :items="context.devices" return-object item-title="name" @update:model-value="clear" />
              <v-btn class="refresh-button ml-2" icon :aria-label="$t('settings.reset')"
                :title="$t('settings.reset')" @click="deviceRefresh">
                <v-icon :icon="mdiRefresh" />
              </v-btn>
            </div>

            <div class="field-grid">
              <v-select v-if="'--source' in device.features"
                v-model="request.params.source"
                class="control-field"
                :no-data-text="$t('global.no-data-text')" :label="$t('scan.source')"
                :items="sources" item-value="value" item-title="text" />

              <v-select v-if="'--adf-mode' in device.features"
                v-model="request.params.adfMode"
                class="control-field"
                :no-data-text="$t('global.no-data-text')" :label="$t('scan.adf-mode')"
                :items="adfModes" item-value="value" item-title="text" />

              <v-select
                v-model="request.params.resolution"
                class="control-field"
                :no-data-text="$t('global.no-data-text')" :label="$t('scan.resolution')"
                :items="device.features['--resolution']['options']" />

              <v-select v-if="'--mode' in device.features"
                v-model="request.params.mode"
                class="control-field"
                :no-data-text="$t('global.no-data-text')" :label="$t('scan.mode')"
                :items="modes" item-value="value" item-title="text" />

              <v-select v-if="'--disable-dynamic-lineart' in device.features"
                v-model="request.params.mode"
                class="control-field"
                :label="$t('scan.dynamic-lineart')"
                :items="[
                  { value: false, text: $t('scan.dynamic-lineart:disabled') },
                  { value: true, text: $t('scan.dynamic-lineart:enabled') }]"
                item-value="value" item-title="text" />

              <v-select v-model="request.batch" :label="$t('scan.batch')"
                class="control-field"
                :no-data-text="$t('global.no-data-text')"
                :items="batchModes" item-value="value" item-title="text" />
            </div>
          </v-card-text>
        </v-card>

        <v-card class="output-card" rounded="xl">
          <v-card-title class="scan-card-title">Output / filters</v-card-title>
          <v-card-text>
            <div class="field-grid">
              <v-select
                v-model="request.filters"
                class="control-field"
                :no-data-text="$t('global.no-data-text')"
                :items="filters"
                item-title="text"
                item-value="value"
                :label="$t('scan.filters')"
                multiple
                @update:model-value="readPreview" />

              <v-select
                v-model="request.pipeline"
                class="control-field"
                :no-data-text="$t('global.no-data-text')"
                :label="$t('scan.format')"
                :items="pipelines"
                item-title="text"
                item-value="value" />
            </div>

            <template v-if="'--brightness' in device.features">
              <v-slider v-model="request.params.brightness" color="primary" class="align-center ml-0 exposure-slider"
                :step="device.features['--brightness']['interval']"
                :min="device.features['--brightness']['limits'][0]"
                :max="device.features['--brightness']['limits'][1]">
                <template #prepend>
                  <v-text-field v-model="request.params.brightness"
                    class="control-field metric-value exposure-value"
                    :label="$t('scan.brightness')" style="width: 60px" type="number" />
                </template>
              </v-slider>
            </template>

            <div v-if="'--contrast' in device.features">
              <v-slider v-model="request.params.contrast" color="primary" class="align-center ml-0 exposure-slider"
                :step="device.features['--contrast']['interval']"
                :min="device.features['--contrast']['limits'][0]"
                :max="device.features['--contrast']['limits'][1]">
                <template #prepend>
                  <v-text-field v-model="request.params.contrast"
                    class="control-field metric-value exposure-value"
                    :label="$t('scan.contrast')" style="width: 60px" type="number" />
                </template>
              </v-slider>
            </div>

            <div class="secondary-actions">
              <v-btn class="secondary-action" @click="deletePreview">
                <v-icon class="mr-2" :icon="mdiDelete" />{{ $t('scan.btn-clear') }}
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </div>

      <v-card class="scan-preview" rounded="xl">
        <v-card-title class="scan-card-title">Preview &amp; crop</v-card-title>
        <v-card-text>
          <div class="preview-media" :style="{ maxWidth: `${preview.width}px` }">
            <cropper v-if="geometry" ref="cropper" :key="preview.key" class="cropper" :transition-time="10" :wheel-resize="false"
                :default-position="cropperDefaultPosition" :default-size="cropperDefaultSize"
                :src="img" @change="onCropperChange" />
            <v-img v-if="!geometry" :src="img" class="preview-image" />
            <div v-if="!img" class="preview-empty">
              <v-icon :icon="mdiDocumentScanner" size="44" color="primary" />
              <span>{{ $t('scan.btn-preview') }}</span>
            </div>
          </div>

          <template v-if="geometry">
            <v-divider class="my-5" />
            <div class="field-grid crop-grid">
              <v-text-field v-model="request.params.top" class="control-field metric-value" :label="$t('scan.top')" type="number" step="any" @blur="onCoordinatesChange" />
              <v-text-field v-model="request.params.left" class="control-field metric-value" :label="$t('scan.left')" type="number" step="any" @blur="onCoordinatesChange" />
              <v-text-field v-model="request.params.width" class="control-field metric-value" :label="$t('scan.width')" type="number" step="any" @blur="onCoordinatesChange" />
              <v-text-field v-model="request.params.height" class="control-field metric-value" :label="$t('scan.height')" type="number" step="any" @blur="onCoordinatesChange" />
            </div>

            <v-menu offset-y>
              <template #activator="{ props }">
                <v-btn class="mt-3" v-bind="props">
                  <v-icon class="mr-2" :icon="mdiCropFree" />{{ $t('scan.paperSize') }}
                </v-btn>
              </template>
              <v-list dense>
                <v-list-item
                  v-for="(item, index) in paperSizes"
                  :key="index"
                  @click="updatePaperSize(item)">
                  <v-list-item-title>{{ item.name }}</v-list-item-title>
                </v-list-item>
              </v-list>
            </v-menu>
          </template>
        </v-card-text>
      </v-card>

      <div class="scan-action-bar">
        <v-btn class="archive-cta" color="secondary" variant="tonal" min-height="56"
          :disabled="!!archiveProgress" @click="openArchive">
          <v-icon class="mr-2" :icon="mdiArchiveArrowDown" />{{ $t('archive.button') }}
        </v-btn>
        <v-btn class="preview-cta" variant="tonal" color="primary" min-height="56"
          :disabled="!!archiveProgress" @click="createPreview">
          <v-icon class="mr-2" :icon="mdiMagnify" />{{ $t('scan.btn-preview') }}
        </v-btn>
        <v-btn class="scan-cta" color="primary" variant="flat" min-height="56"
          :disabled="!!archiveProgress" @click="scan(1)">
          <v-icon class="mr-3" :icon="mdiDocumentScanner" size="26" />{{ $t('scan.btn-scan') }}
        </v-btn>
      </div>
    </div>

    <v-chip
      v-if="archiveProgress"
      class="archive-progress"
      color="secondary"
      variant="tonal"
      size="small"
      role="status"
      aria-live="polite">
      <v-progress-circular class="mr-2" indeterminate size="14" width="2" />{{ archiveProgress }}
    </v-chip>

    <archive-dialog ref="archiveDialog" @confirm="startArchive" />
    <batch-dialog ref="batchDialog" />
  </div>
</template>

<script>
import { mdiArchiveArrowDown, mdiCropFree, mdiDelete, mdiMagnify, mdiRefresh } from '@mdi/js';
import { mdiDocumentScanner } from '../icons/document-scanner';
import { Cropper } from 'vue-advanced-cropper';
import { useI18n } from 'vue-i18n';
import ArchiveDialog from './ArchiveDialog.vue';
import BatchDialog from './BatchDialog.vue';

import {
  archivePdf,
  base64ToBlob,
  buildArchiveScanRequest,
  getArchiveServiceUrl
} from '../classes/archive';
import Common from '../classes/common';
import Device from '../classes/device';
import Request from '../classes/request';
import Storage from '../classes/storage';

import 'vue-advanced-cropper/dist/style.css';

const storage = Storage.instance();

function round(n, dp) {
  const f = Math.pow(10, dp || 0);
  return Math.round(n * f) / f;
}

function sanitiseLocaleKey(s) {
  return s.toLowerCase().replace(/\[/g, '(').replace(/\]/g, ')');
}

export default {

  name: 'Scan',

  components: {
    Cropper,
    ArchiveDialog,
    BatchDialog
  },

  emits: ['mask', 'notify'],

  setup() {
    const { te } = useI18n();
    return {
      mdiArchiveArrowDown,
      mdiCropFree,
      mdiDelete,
      mdiDocumentScanner,
      mdiMagnify,
      mdiRefresh,
      te
    };
  },

  data() {
    const device = Device.default();
    device.name = this.$t('global.no-data-text');
    const request = Request.create(null, device);

    return {
      context: {
        devices: [
          device
        ],
        paperSizes: [],
        version: '0'
      },
      device: device,
      img: null,
      request: request,
      pendingArchive: null,
      archiveProgress: null,
      preview: {
        timer: 0,
        width: 400,
        key: 0
      }
    };
  },

  computed: {
    geometry() {
      return ['-x', '-y', '-l', '-t'].every(s => s in this.device.features);
    },

    deviceSize() {
      return !this.geometry ? undefined : {
        width: this.device.features['-x'].limits[1],
        height: this.device.features['-y'].limits[1]
      };
    },

    batchModes() {
      return this.device.settings.batchMode.options.map(mode => {
        const key = `batch-mode.${sanitiseLocaleKey(mode)}`;
        let translation = this.$t(key);
        return {
          text: translation === key ? mode : translation,
          value: mode
        };
      });
    },

    filters() {
      return this.device.settings.filters.options.map(f => {
        return {
          text: this.$t(f),
          value: f
        };
      });
    },

    modes() {
      return '--mode' in this.device.features
        ? this.device.features['--mode'].options.map(mode => {
          const key = `mode.${sanitiseLocaleKey(mode)}`;
          return {
            text: this.te(key) ? this.$t(key) : mode,
            value: mode
          };
        })
        : undefined;
    },

    adfModes() {
      return '--adf-mode' in this.device.features
        ? this.device.features['--adf-mode'].options.map(adfMode => {
          const key = `adf-mode.${sanitiseLocaleKey(adfMode)}`;
          return {
            text: this.te(key) ? this.$t(key) : adfMode,
            value: adfMode
          };
        })
        : undefined;
    },

    paperSizes() {
      if (!this.geometry) {
        return undefined;
      }

      const deviceSize = {
        x: this.device.features['-x'].limits[1],
        y: this.device.features['-y'].limits[1]
      };

      return this.context.paperSizes
        .filter(paper => paper.dimensions.x <= deviceSize.x && paper.dimensions.y <= deviceSize.y)
        .map(paper => {
          const variables = (paper.name.match(/@:[a-z-.]+/ig) || []).map(s => s.substr(2));
          variables.forEach(v => {
            paper.name = paper.name.replaceAll(`@:${v}`, this.$t(v));
          });
          return paper;
        });
    },

    pipelines() {
      return this.device.settings.pipeline.options.map(p => {
        const variables = (p.match(/@:[a-z-.]+/ig) || []).map(s => s.substr(2));
        let text = p;
        variables.forEach(v => {
          text = text.replaceAll(`@:${v}`, this.$t(v));
        });

        return {
          text: text,
          value: p
        };
      });
    },

    sources() {
      return '--source' in this.device.features
        ? this.device.features['--source'].options.map(source => {
          const key = `source.${sanitiseLocaleKey(source)}`;
          const x =  {
            text: this.te(key) ? this.$t(key) : source,
            value: source
          };
          return x;
        })
        : undefined;
    }
  },

  watch: {
    request: {
      handler(request) {
        storage.request = request;
      },
      deep: true
    }
  },

  mounted() {
    this._resizePreview();
    this.readContext().then(() => {
      this.readPreview();
    });
    window.addEventListener('resize', () => {
      clearTimeout(this.preview.timer);
      this.preview.timer = setTimeout(this._resizePreview, 100);
    });
  },

  methods: {
    _resizePreview() {
      const paperRatio = this.geometry
        ? this.deviceSize.width / this.deviceSize.height
        : 210 / 297;

      // This only makes a difference when the col-width="auto" - so md+
      const mdBreakpoint = 960;
      if (window.innerWidth >= mdBreakpoint) {
        const appbarHeight = 80;
        const availableWidth = window.innerWidth - 30;
        const availableHeight = window.innerHeight - appbarHeight - 15;
        const desiredWidth = availableHeight * paperRatio;
        this.preview.width = Math.min(availableWidth / 2, desiredWidth);
        this.preview.key += 1;
      }
    },

    _fetch(url, options) {
      this.mask(1);
      return Common.fetch(url, options)
        .then(data => {
          this.mask(-1);
          return data;
        })
        .catch(error => {
          this.notify({ type: 'e', message: error });
          this.mask(-1);
          return error;
        });
    },

    createPreview() {
      this.mask(1);

      // Keep reloading the preview image
      const timer = window.setInterval(this.readPreview, 1000);

      let data = Common.clone(this.request);

      this._fetch('api/v1/preview', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }).then(() => {
        window.clearInterval(timer);

        // Some scanners don't create the preview until after the scan has finished.
        // Run preview one last time
        window.setTimeout(this.readPreview, 1000);
        this.mask(-1);
      }).catch(() => {
        this.mask(-1);
      });
    },

    deletePreview() {
      this.mask(1);
      Common.fetch('api/v1/preview', {
        method: 'DELETE'
      }).then(() => {
        this.notify({ type: 'i', message: this.$t('scan.message:deleted-preview') });
        this.readPreview();
        this.mask(-1);
      }).catch(error => {
        this.notify({ type: 'e', message: error });
        this.mask(-1);
      });
    },

    pixelsPerMm() {
      const scanner = this.deviceSize;

      // The preview image may not have perfectly scaled dimensions
      // because pixel counts are integers. So we report a horizontal
      // and vertical resolution
      const image = this.$refs.cropper.imageSize;
      return {
        x: image.width / scanner.width,
        y: image.height / scanner.height
      };
    },

    scaleCoordinates(coordinates, xScale, yScale) {
      return {
        width: round(coordinates.width * xScale, 1),
        height: round(coordinates.height * yScale, 1),
        left: round(coordinates.left * xScale, 1),
        top: round(coordinates.top * yScale, 1)
      };
    },

    cropperDefaultPosition() {
      const adjusted = this.scaleCoordinates(
        this.request.params,
        this.pixelsPerMm().x,
        this.pixelsPerMm().y);

      return {
        left: adjusted.left,
        top: adjusted.top
      };
    },

    cropperDefaultSize() {
      const adjusted = this.scaleCoordinates(
        this.request.params,
        this.pixelsPerMm().x,
        this.pixelsPerMm().y);

      return {
        width: adjusted.width,
        height: adjusted.height
      };
    },

    mask(add) {
      this.$emit('mask', add);
    },

    notify(notification) {
      this.$emit('notify', notification);
    },

    onCoordinatesChange() {
      const adjusted = this.scaleCoordinates(
        this.request.params,
        this.pixelsPerMm().x,
        this.pixelsPerMm().y);

      this.$refs.cropper.setCoordinates(adjusted);
    },

    onCropperChange({ coordinates }) {
      const adjusted = this.scaleCoordinates(
        coordinates,
        1 / this.pixelsPerMm().x,
        1 / this.pixelsPerMm().y);

      // The cropper changes even when coordinates are set manually. This will
      // result in manually set values being overwritten because of rounding.
      // If someone is taking the trouble to set values manually then they
      // should be preserved. We should only update the values if they breach
      // a threshold or the scanner dimensions
      const scanner = this.deviceSize;
      const params = this.request.params;
      const threshold = 0.4;
      const boundAndRound = (n, min, max) => round(Math.min(Math.max(min, n), max), 1);
      const bestValue = (current, crop, min, max) => Math.abs(current - crop) < threshold
        ? boundAndRound(current, min, max)
        : boundAndRound(crop, min, max);

      params.width = bestValue(params.width, adjusted.width, 0, scanner.width);
      params.height = bestValue(params.height, adjusted.height, 0, scanner.height);
      params.left = bestValue(params.left, adjusted.left, 0, scanner.width);
      params.top = bestValue(params.top, adjusted.top, 0, scanner.height);
    },

    readContext() {
      // Only show notification if things are slow (first time / force)
      const timer = window.setTimeout(() => {
        this.notify({ type: 'i', message: this.$t('scan.message:loading-devices') });
      }, 250);

      return this._fetch('api/v1/context').then(context => {
        window.clearTimeout(timer);

        if (context.devices && context.devices.length > 0) {
          this.context = context;
          this.device = context.devices[0];
          this.request = this.buildRequest();
          for (let test of context.diagnostics) {
            if (!test.success) {
              this.notify({ type: 'e', message: test.message });
            }
          }
        } else {
          this.notify({ type: 'e', message: this.$t('scan.message:no-devices') });
        }
      });
    },

    deviceRefresh() {
      this._fetch('api/v1/context', {
        method: 'DELETE'
      }).then(() => {
        this.readContext();
      });
    },

    readPreview() {
      // Gets the preview image as a base64 encoded jpg and updates the UI
      const uri = 'api/v1/preview?' + new URLSearchParams(
        this.request.filters.map(e => ['filter', e]));

      this._fetch(uri, {
        cache: 'no-store',
        method: 'GET'
      }).then(data => {
        this.img = 'data:image/jpeg;base64,' + data.content;
        this._resizePreview();
      });
    },

    buildRequest() {
      let request = storage.request;
      if (request && request.params) {
        this.device = this.context.devices.filter(d => d.id === request.params.deviceId)[0]
          || this.context.devices[0];
      }

      request = Request.create(request, this.device);
      return request;
    },

    clear() {
      storage.request = null;
      this.request = this.buildRequest();
    },

    openArchive() {
      this.$refs.archiveDialog.open();
    },

    startArchive(options) {
      try {
        const scanPreset = buildArchiveScanRequest(
          options.preset,
          this.device.settings.pipeline.options,
          this.device.features['--mode']?.options || []
        );
        this.request.pipeline = scanPreset.pipeline;
        this.request.params.resolution = scanPreset.resolution;
        this.request.params.mode = scanPreset.mode;
        this.pendingArchive = options;
        this.scan(1);
      } catch (error) {
        this.pendingArchive = null;
        this.notify({ type: 'e', message: error instanceof Error ? error.message : error });
      }
    },

    archiveStatus(job) {
      const key = `archive.status:${job.state || 'processing'}`;
      return this.te(key) ? this.$t(key) : this.$t('archive.status:processing');
    },

    async scanPdf(response) {
      const content = response.file?.content || response.content;
      if (content) {
        return base64ToBlob(content);
      }
      if (!response.file?.name) {
        throw new Error(this.$t('archive.message:missing-file'));
      }

      const fileResponse = await fetch(`api/v1/files/${encodeURIComponent(response.file.name)}`, {
        cache: 'no-store'
      });
      if (!fileResponse.ok) {
        throw new Error(this.$t('archive.message:download-failed'));
      }
      const blob = await fileResponse.blob();
      return new Blob([blob], { type: 'application/pdf' });
    },

    async archiveResponse(response, options) {
      this.archiveProgress = this.$t('archive.status:uploading');
      try {
        const pdf = await this.scanPdf(response);
        const job = await archivePdf({
          serviceUrl: getArchiveServiceUrl(),
          file: pdf,
          folder: options.folder,
          title: options.title,
          collection: options.collection,
          onProgress: current => {
            this.archiveProgress = this.archiveStatus(current);
          }
        });

        const result = job.result || {};
        const path = job.path || job.archive_path || job.final_path
          || result.path || result.archive_path || result.final_path
          || `${options.folder}/${options.title}.pdf`;
        const library = job.collection || job.library || result.collection || result.library
          || options.collection;
        const chunks = job.chunks ?? job.chunks_indexed ?? result.chunks ?? result.chunks_indexed ?? 0;
        this.notify({
          type: 's',
          message: this.$t('archive.message:success', { path, library, chunks })
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : error;
        this.notify({
          type: 'e',
          message: message === 'Archive job timed out' ? this.$t('archive.message:timeout') : message
        });
      } finally {
        this.archiveProgress = null;
      }
    },

    async finishScan(response) {
      const archive = this.pendingArchive;
      this.pendingArchive = null;
      if (archive) {
        await this.archiveResponse(response, archive);
      }

      if (storage.settings.showFilesAfterScan) {
        this.$router.push('/files');
      } else {
        this.readPreview();
      }
    },

    scan(index) {
      if (index !== undefined) {
        this.request.index = index;
      }

      const data = Common.clone(this.request);
      this._fetch('api/v1/scan', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }).then((response) => {
        if (response && 'index' in response) {
          const options = {
            message: this.$t('scan.message:turn-documents'),
            onFinish: () => {
            },
            onNext: () => {
              this.request.index = response.index + 1;
              this.scan();
            }
          };
          if (response.image) {
            options.message = `${this.$t('scan.message:preview-of-page')} ${response.index}`;
            options.image = response.image;
            options.onFinish = () => {
              this.request.index = -1;
              this.scan();
            };
            options.onRescan = () => {
              this.request.index = response.index;
              this.scan();
            };
          }
          this.$refs.batchDialog.open(options);
        } else if (response && (response.file || response.content)) {
          // Finish
          return this.finishScan(response);
        } else {
          this.pendingArchive = null;
        }
      });
    },

    updatePaperSize(value) {
      if (value.dimensions) {
        this.request.params.width = value.dimensions.x;
        this.request.params.height = value.dimensions.y;
        this.onCoordinatesChange();
      }
    }
  }
};
</script>

<style scoped>
.scan-layout,
.scan-settings {
  display: grid;
  gap: 24px;
}

.scan-view {
  padding-bottom: 88px;
}

.scan-layout {
  grid-template-columns: minmax(0, 1fr);
}

.scan-settings {
  align-content: start;
  min-width: 0;
}

.scan-card-title {
  padding: 20px 20px 8px;
  font-size: 1rem;
  font-weight: 650;
  letter-spacing: -.01em;
}

.scan-card-title + .v-card-text {
  padding: 16px 20px 20px;
}

.device-row :deep(.control-field) {
  flex: 1 1 auto;
}

.refresh-button {
  flex: 0 0 44px;
  margin-top: -22px;
}

.field-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  column-gap: 16px;
}

.preview-media {
  position: relative;
  width: 100%;
  min-height: 260px;
  margin-inline: auto;
  overflow: hidden;
  border: 1px solid var(--scanner-hairline);
  border-radius: 12px;
  background: rgb(var(--v-theme-surface-variant));
}

.preview-image,
.cropper {
  width: 100%;
}

.preview-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: rgb(var(--v-theme-on-surface-variant));
  font-weight: 500;
}

.exposure-slider {
  margin-top: 20px;
}

.exposure-value {
  flex: 0 0 92px;
}

.secondary-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.secondary-action {
  min-height: 44px;
}

.scan-action-bar {
  position: sticky;
  bottom: 0;
  z-index: 5;
  display: flex;
  gap: 12px;
  align-items: stretch;
  margin: 0 -16px -24px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--scanner-hairline);
  border-radius: 16px 16px 0 0;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 -8px 24px rgba(0, 0, 0, .08);
}

.archive-progress {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 20;
  max-width: calc(100vw - 32px);
  height: auto;
  min-height: 32px;
  padding-block: 6px;
  border: 1px solid var(--scanner-hairline);
  background: rgb(var(--v-theme-surface)) !important;
  color: rgb(var(--v-theme-on-surface));
  box-shadow: var(--scanner-card-shadow);
}

.archive-progress :deep(.v-chip__content) {
  white-space: normal;
}

.archive-cta,
.preview-cta {
  flex: 0 0 auto;
  min-width: 148px;
  border-radius: var(--v-border-radius);
  font-weight: 600;
}

.archive-cta {
  min-width: 132px;
}

.scan-cta {
  flex: 1 1 auto;
  min-width: 220px;
  width: auto;
  min-height: 56px;
  border-radius: var(--v-border-radius);
  font-size: 1.05rem;
  font-weight: 650;
  letter-spacing: 0;
}

@media (max-width: 959px) {
  .archive-progress {
    right: 16px;
    bottom: 96px;
    left: 16px;
    width: fit-content;
    margin-left: auto;
  }
}

@media (max-width: 599px) {
  .scan-action-bar {
    gap: 6px;
    padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
  }

  .archive-cta,
  .preview-cta,
  .scan-cta {
    flex: 1 1 0;
    width: auto;
    min-width: 0;
    min-height: 54px;
    padding-inline: 4px;
    font-size: .8rem;
    line-height: 1.15;
  }

  .archive-cta :deep(.v-icon),
  .preview-cta :deep(.v-icon),
  .scan-cta :deep(.v-icon) {
    margin-inline-end: 4px !important;
  }
}

.scan-cta:deep(.v-btn__overlay) {
  display: none;
}

.scan-cta.v-btn--disabled {
  opacity: .45;
  box-shadow: none;
}

@media (min-width: 600px) {
  .field-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .crop-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (min-width: 960px) {
  .scan-view {
    padding-bottom: 0;
  }

  .scan-layout {
    grid-template-columns: minmax(320px, 5fr) minmax(0, 7fr);
  }

  .scan-settings {
    display: contents;
  }

  .source-card {
    grid-column: 1;
    grid-row: 1;
  }

  .output-card {
    grid-column: 1;
    grid-row: 3;
  }

  .scan-preview {
    position: sticky;
    top: 88px;
    grid-column: 2;
    grid-row: 1 / span 3;
    align-self: start;
    min-width: 0;
  }

  .scan-action-bar {
    position: static;
    grid-column: 1;
    grid-row: 2;
    justify-self: end;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .scan-cta {
    width: auto;
    min-width: 220px;
  }
}

@media (min-width: 960px) and (max-width: 1349px) {
  .scan-action-bar {
    flex-wrap: wrap;
  }

  .scan-cta {
    flex-basis: 100%;
  }
}

@media (min-width: 600px) and (max-width: 1279px) {
  .crop-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
