<template>
  <div>
    <v-app-bar class="app-bar elevation-0" color="surface" height="64" app>
      <v-app-bar-nav-icon class="d-md-none" @click.stop="drawer = !drawer" />

      <div class="product-identity">
        <v-avatar class="product-mark mr-3" size="38" color="primary" variant="tonal">
          <v-icon :icon="mdiDocumentScanner" color="primary" size="22" />
        </v-avatar>
        <v-toolbar-title class="product-title unselectable">
          {{ $t('global.application-name') }}
        </v-toolbar-title>
      </div>

      <v-spacer />

      <v-toolbar-items class="d-none d-md-flex nav-items">
        <v-btn class="nav-pill" rounded="pill" :variant="isActive('/scan') ? 'flat' : 'text'"
          :color="isActive('/scan') ? 'primary' : 'on-surface'" @click="go('/scan')">
          <v-icon class="mr-2" :icon="mdiDocumentScanner" />{{ $t('navigation.scan') }}
        </v-btn>
        <v-btn class="nav-pill" rounded="pill" :variant="isActive('/files') ? 'flat' : 'text'"
          :color="isActive('/files') ? 'primary' : 'on-surface'" @click="go('/files')">
          <v-icon class="mr-2" :icon="mdiFileDocumentMultiple" />{{ $t('navigation.files') }}
        </v-btn>
        <v-btn class="nav-pill" rounded="pill" :variant="isActive('/settings') ? 'flat' : 'text'"
          :color="isActive('/settings') ? 'primary' : 'on-surface'" @click="go('/settings')">
          <v-icon class="mr-2" :icon="mdiCog" />{{ $t('navigation.settings') }}
        </v-btn>
        <v-btn class="nav-pill" rounded="pill" :variant="isActive('/about') ? 'flat' : 'text'"
          :color="isActive('/about') ? 'primary' : 'on-surface'" @click="go('/about')">
          <v-icon class="mr-2" :icon="mdiInformation" />{{ $t('navigation.about') }}
        </v-btn>
      </v-toolbar-items>

      <v-btn class="theme-toggle ml-2" icon variant="text" color="on-surface"
        :aria-label="$t('settings.theme')" :title="$t('settings.theme')" @click="toggleTheme">
        <v-icon :icon="themeIcon" />
      </v-btn>
    </v-app-bar>

    <v-navigation-drawer v-model="drawer" class="elevation-0" app temporary>
      <v-list nav>
        <v-list-item :title="$t('navigation.scan')" :active="isActive('/scan')" color="primary" rounded="lg" @click="go('/scan')">
          <template #prepend>
            <v-icon :icon="mdiDocumentScanner" />
          </template>
        </v-list-item>

        <v-list-item :title="$t('navigation.files')" :active="isActive('/files')" color="primary" rounded="lg" @click="go('/files')">
          <template #prepend>
            <v-icon :icon="mdiFileDocumentMultiple" />
          </template>
        </v-list-item>

        <v-list-item :title="$t('navigation.settings')" :active="isActive('/settings')" color="primary" rounded="lg" @click="go('/settings')">
          <template #prepend>
            <v-icon :icon="mdiCog" />
          </template>
        </v-list-item>

        <v-list-item :title="$t('navigation.about')" :active="isActive('/about')" color="primary" rounded="lg" @click="go('/about')">
          <template #prepend>
            <v-icon :icon="mdiInformation" />
          </template>
        </v-list-item>

        <v-divider />

        <v-list-item>
          <v-list-item-title class="unselectable">{{ $t('navigation.version') }} {{ version }}</v-list-item-title>
          <template #prepend>
            <v-icon :icon="mdiTools" />
          </template>
        </v-list-item>
      </v-list>

      <template #append>
        <div class="d-flex flex-row pa-4 text-caption">
          <div class="ml-auto">
            &copy; 2016 - {{ new Date().getFullYear() }} Sam Strachan
          </div>
        </div>
      </template>
    </v-navigation-drawer>
  </div>
</template>

<script>
import Constants from '../classes/constants';
import ManifestBuilder from '../classes/manifest-builder';
import Storage from '../classes/storage';
import {
  mdiCog,
  mdiFileDocumentMultiple,
  mdiInformation,
  mdiTools,
  mdiWeatherNight,
  mdiWeatherSunny
} from '@mdi/js';
import { useTheme } from 'vuetify';
import { mdiDocumentScanner } from '../icons/document-scanner';

const storage = Storage.instance();

export default {
  name: 'Navigation',

  props: {
    appColor: {
      type: String,
      default: 'accent-4'
    }
  },

  setup() {
    const vuetifyTheme = useTheme();
    return {
      mdiCog,
      mdiDocumentScanner,
      mdiFileDocumentMultiple,
      mdiInformation,
      mdiTools,
      vuetifyTheme
    };
  },

  data() {
    return {
      drawer: false,
      version: Constants.Version
    };
  },

  computed: {
    themeIcon() {
      return this.vuetifyTheme.global.name.value === Constants.Themes.Dark
        ? mdiWeatherSunny
        : mdiWeatherNight;
    }
  },

  methods: {
    go(location) {
      if (this.$route.path !== location) {
        this.$router.push(location);
      }
      this.drawer = false;
    },

    isActive(location) {
      return this.$route.path === location
        || (location === '/scan' && this.$route.path === '/');
    },

    toggleTheme() {
      const theme = this.vuetifyTheme.global.name.value === Constants.Themes.Dark
        ? Constants.Themes.Light
        : Constants.Themes.Dark;
      this.vuetifyTheme.global.name.value = theme;

      const settings = storage.settings;
      settings.theme = theme;
      storage.settings = settings;

      const manifest = ManifestBuilder.create()
        .withDark(theme === Constants.Themes.Dark)
        .withStorage(storage)
        .build();
      const href = `data:manifest+json,${encodeURIComponent(JSON.stringify(manifest))}`;
      let element = document.querySelector('link[rel="manifest"]');
      if (!element) {
        element = document.createElement('link');
        element.setAttribute('rel', 'manifest');
        document.querySelector('head').appendChild(element);
      }
      element.setAttribute('href', href);
    }
  }
};
</script>

<style scoped>
.app-bar {
  border-bottom: 1px solid var(--scanner-hairline);
}

.product-identity {
  display: flex;
  align-items: center;
  min-width: 0;
}

.product-mark {
  border: 1px solid rgb(var(--v-theme-primary));
  box-shadow: inset 0 0 0 3px rgb(var(--v-theme-surface));
}

.product-title {
  font-size: 1.125rem;
  font-weight: 650;
  letter-spacing: -.01em;
  white-space: nowrap;
}

.nav-items {
  gap: 4px;
}

.nav-pill {
  min-height: 44px;
  padding-inline: 16px;
}

.theme-toggle {
  flex: 0 0 44px;
}

.unselectable {
  -moz-user-select: none;
  -webkit-user-select: none;
  -ms-user-select: none;
  user-select: none;
}

@media (max-width: 420px) {
  .product-title {
    font-size: 1rem;
  }

  .product-mark {
    margin-right: 8px !important;
  }
}
</style>
