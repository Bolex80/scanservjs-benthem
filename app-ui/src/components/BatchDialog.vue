<template>
  <v-dialog v-model="show" aria-role="dialog" max-width="620" persistent aria-modal @keydown.stop="_onKeys">
    <v-card class="batch-dialog" rounded="2xl">
      <v-card-title class="batch-title">
        {{ message }}
      </v-card-title>
      <v-card-text class="batch-content">
        <v-img v-if="image" :src="'data:image/jpeg;base64,' + image" class="batch-image" contain rounded="lg" />
      </v-card-text>
      <v-card-actions class="batch-actions">
        <v-btn color="on-surface" @click.prevent="show = false">
          <v-icon class="mr-2" :icon="mdiClose" />{{ $t('batch-dialog.btn-cancel') }}
        </v-btn>
        <v-spacer />
        <v-btn v-if="onRescan" @click.prevent="rescan">
          <v-icon class="mr-2" :icon="mdiRefresh" />{{ $t('batch-dialog.btn-rescan') }}
        </v-btn>
        <v-btn v-if="onFinish" color="primary" @click.prevent="finish">
          <v-icon class="mr-2" :icon="mdiCheck" />{{ $t('batch-dialog.btn-finish') }}
        </v-btn>
        <v-btn color="primary" variant="flat" @click.prevent="next">
          <v-icon class="mr-2" :icon="mdiArrowRight" />{{ $t('batch-dialog.btn-next') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import { mdiArrowRight, mdiCheck, mdiClose, mdiRefresh } from '@mdi/js';
import Constants from '../classes/constants';

export default {
  name: 'BatchDialog',

  setup() {
    return {
      mdiArrowRight,
      mdiCheck,
      mdiClose,
      mdiRefresh
    };
  },

  data() {
    return {
      message: null,
      image: null,
      show: false,
      onFinish: null,
      onNext: null,
      onRescan: null,
    };
  },

  methods: {
    _onKeys(event) {
      if (event.keyCode === Constants.Keys.enter) {
        this.ok();
      }
    },

    finish() {
      this.show = false;
      if (this.onFinish) {
        this.onFinish();
      }
    },

    rescan() {
      this.show = false;
      if (this.onRescan) {
        this.onRescan();
      }
    },

    next() {
      this.show = false;
      if (this.onNext) {
        this.onNext();
      }
    },

    open(options) {
      this.message = options.message;
      this.image = options.image;
      this.onFinish = options.onFinish;
      this.onRescan = options.onRescan;
      this.onNext = options.onNext;
      this.show = true;
    }
  }
};
</script>

<style scoped>
.batch-dialog {
  overflow: hidden;
  border-radius: 24px;
}

.batch-title {
  padding: 24px 24px 12px;
  font-weight: 650;
  line-height: 1.35;
}

.batch-content {
  padding: 12px 24px;
}

.batch-image {
  max-height: 55vh;
  border: 1px solid var(--scanner-hairline);
}

.batch-actions {
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px 24px 24px;
}

.batch-actions .v-btn {
  min-height: 44px;
}

@media (max-width: 599px) {
  .batch-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .batch-actions :deep(.v-spacer) {
    display: none;
  }

  .batch-actions .v-btn {
    width: 100%;
    margin: 0;
    padding-inline: 8px;
  }
}
</style>
