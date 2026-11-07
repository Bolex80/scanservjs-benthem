import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import { createI18n, useI18n } from 'vue-i18n';
import { createVuetify } from 'vuetify';
import { createVueI18nAdapter } from 'vuetify/locale/adapters/vue-i18n';
import messages from '@intlify/unplugin-vue-i18n/messages';
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg';
import '@fontsource-variable/inter';
import '@/styles/main.scss';
import { VueToastr } from 'vue-toastr';
import 'vue-toastr/dist/style.css';

import Constants from './classes/constants';
import App from './App.vue';
import Files from './components/Files.vue';
import Scan from './components/Scan.vue';
import Settings from './components/Settings.vue';
import About from './components/About.vue';

const datetimeFormats = {};
for (const locale of Constants.Locales) {
  datetimeFormats[locale] = Constants.DateTimeFormat;
}

const i18n = createI18n({
  legacy: false,
  datetimeFormats,
  locale: import.meta.env.VITE_APP_I18N_LOCALE,
  fallbackLocale: import.meta.env.VITE_APP_I18N_FALLBACK_LOCALE,
  messages: messages,
  missingWarn: false,
  fallbackWarn: false
});

const vuetify = createVuetify({
  defaults: {
    VBtn: {
      color: 'primary',
      variant: 'tonal',
    },
    VCard: {
      elevation: 0,
      rounded: 'xl',
    },
    VSelect: {
      variant: 'plain',
    },
    VTextField: {
      variant: 'plain',
    }
  },
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi,
    }
  },
  locale: {
    adapter: createVueI18nAdapter({ i18n, useI18n })
  },
  theme: {
    themes: {
      light: {
        dark: false,
        colors: {
          background: '#F3F5F7',
          'on-background': '#17202A',
          surface: '#FFFFFF',
          'surface-variant': '#E4E8EC',
          'on-surface': '#17202A',
          'on-surface-variant': '#46535F',
          primary: '#0F766E',
          'on-primary': '#FFFFFF',
          hairline: '#E4E8EC',
          warning: '#9A6200'
        }
      },
      dark: {
        dark: true,
        colors: {
          background: '#101418',
          'on-background': '#E4E9EE',
          surface: '#171C22',
          'surface-variant': '#1E252D',
          'on-surface': '#E4E9EE',
          'on-surface-variant': '#B2BEC9',
          primary: '#14B8A6',
          'on-primary': '#062B28',
          hairline: '#242D37'
        }
      }
    }
  }
});

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/about', component: About },
    { path: '/files', component: Files },
    { path: '/settings', component: Settings },
    { path: '/scan', component: Scan },
    { path: '/', component: Scan }
  ]
});

createApp(App)
  .use(vuetify)
  .use(router)
  .use(i18n)
  .use(VueToastr)
  .mount('#app');
