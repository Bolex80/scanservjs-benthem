# Benthem Scanner — Design Spec (v1)

Written: 07/11/2026. This is the binding spec for the visual overhaul of scanservjs v3.3.0
for the Benthem household. Implement everything below; nothing outside it.

## Identity

| Token | Value |
|---|---|
| Product name | **Benthem Scanner** (replace `"scanservjs"` value of key `global.application-name` in **all 21** `app-ui/src/locales/*.json`; the key stays) |
| `<title>` | `Benthem Scanner` |
| Engine line in About | "Benthem Scanner — a Benthem edition of scanservjs v3.3.0 (GPL-2.0, © Sam Strachan)" |
| Favicon | Optional: add `app-ui/public/favicon.svg` simple scan-beam mark in accent teal + reference from `index.html` (keep `favicon.ico` fallback). Skip if it costs > 20 min. |

## Art direction

Crisp optical-tool aesthetic: calm neutral surfaces, one confident teal accent, generous
whitespace, soft elevation, rounded geometry, fast subtle motion. Nothing gaudy.

### Color tokens (CSS custom properties in `main.scss` + Vuetify theme objects in `main.js`)

Light theme:
- `background: #F3F5F7`, `surface: #FFFFFF`, `surface-variant / hairline: #E4E8EC`
- primary `#0F766E` (teal), `on-primary: #FFFFFF`
- success/warning/error/info: Vuetify defaults are fine (darken warning slightly for AA on light)
- Vuetify `surface` variants follow from `surface` token

Dark theme:
- `background: #101418` (blue-tinted near-black), `surface: #171C22`, `surface-variant: #1E252D`
- primary `#14B8A6`, hairline `#242D37`
- text: default Vuetify on-surface roles are fine; avoid pure `#FFF` for body text

Both themes: `--v-border-radius: 10px` controls radius; cards use `rounded-xl` (16px).
Keep `manifest-builder.js` theme-color values in sync (`#F3F5F7` / `#101418`).

### Typography

- Bundle `@fontsource-variable/inter` (npm dep; wire `Inter Variable` first in the font stack,
  then `Segoe UI`, Roboto, system fallbacks). If registry install fails, skip dep and use system stack.
- App title: weight 650, letter-spacing -0.01em. Body: 400. Labels: 500.
- Tabular numbers where metrics appear (font-variant-numeric on values).

### Elevation & motion

- Cards: soft two-layer shadow (`0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.08)` in light;
  lighter alpha in dark), 1px hairline border in `surface-variant`.
- Hover on interactive cards/buttons: lift 1–2px + shadow deepen, ~150ms ease;
  press: scale 0.98. Page transitions already exist — keep.

### Buttons (the recognizability requirement)

- **Primary CTA (Scan button in Scan.vue):** filled accent (`filled` variant), min-height 56px,
  icon `mdiDocumentScanner` + label, full width on mobile, min 220px on desktop, accent-tinted
  shadow, disabled state clearly dimmed. It must be the visually loudest element on the page.
- Global default override in `main.js` stays `tonal`, but **tonal tint** should follow primary.
- Secondary actions (Clear, Cancel, Delete all): `tonal`. Rare/destructive: `text` variant in
  error color. Icon-only buttons: 44×44 hit area minimum.
- Every CTA carries an icon; labels never truncated.

### App bar & navigation (Navigation.vue)

- App bar: `surface` background (not accent-colored), hairline bottom border, height 64px.
- Left: nav drawer icon (mobile), product mark (small scan-beam SVG or `mdiDocumentScanner`
  in accent-ringed avatar) + title "Benthem Scanner".
- Right (≥ md): nav items as pills — active route gets filled pill (primary on-primary text),
  inactive are quiet `text` buttons. Below md keep drawer.
- **Far right: theme toggle button** (icon 44px): shows `mdiWeatherSunny` in dark mode,
  `mdiWeatherNight` in light mode. Clicking cycles Light ⇄ Dark (writes
  `storage.settings.theme` via the existing Settings storage class, applies
  `useTheme(...).global.name.value` immediately, and keeps the manifest in sync like App.vue
  does). Default behavior on first load stays as upstream System-detect logic. Do not touch the
  Settings dialog select — it keeps working.

### Scan.vue (main view)

- Restructure presentation only — **all existing bindings, selects, $t keys, api calls, events stay**.
- ≥ md: two-column grid. Left: a "Source settings" card (Device, Source, Resolution, Mode, Batch,
  and any other existing controls, with tidy section labels) + "Output / filters" card(s) if the
  existing markup groups them. Right column: preview + crop area, sticky within viewport.
- `< md`: single column; order = settings card → preview → sticky bottom action bar containing
  the primary Scan button.
- Selects: give each an explicit section label ("Device", "Source", …) using existing $t keys;
  keep `variant: plain` but add consistent outlined field styling via a shared class so rows align
  in a tidy 2-col grid on md+ where sensible.
- Loading: replace bare spinner with card-level shimmer/skeleton if cheap; otherwise keep mask
  spinner but tint accent.

### Files.vue

- Result rows as elevated cards: thumbnail (existing `/thumbnail` behavior; graceful fallback icon
  `mdiFile`), file name, size/date if already provided by API (do not invent new API fields).
- Actions: existing download/delete buttons styled as icon buttons with visible labels on desktop.
- Empty state: friendly illustration-free message + `mdiFolderOpen` icon.
- Toolbar ("Delete all" etc.): right-aligned, destructive in error `tonal`.

### BatchDialog.vue, Settings.vue, SettingsSection.vue, SettingsItem.vue, About.vue

- Keep all logic. Dialog: rounded-2xl, spaced rows, accent primary action.
- Settings: section titles + cards with hairlines; inputs aligned.
- About: clean layout, the engine line above, versions and links grouped; keep upstream
  copyright footer in drawer append.

## Hard constraints

1. `app-server/` must remain byte-identical (git diff shows nothing).
2. No dependency upgrades; single allowed new dep: `@fontsource-variable/inter`.
3. Every existing i18n key, `v-model`, $t call, API call, storage key persists. Renaming only
   permitted for the `application-name` value.
4. `cd app-ui && npm run build` must succeed; `npm run lint` must pass.
5. Verify both themes and 375px + 1280px widths for every touched view before reporting done.
6. Do not edit `scripts/`, `README.md`, `CHANGELOG.md` (other agent owns those).

## Deliverable

- All changes in `app-ui/src/**` (+ optional favicon) on branch `benthem-ui` (create it),
  committed with clear messages. Report: files changed, build output, lint result.
