<template>
  <svg
    class="product-mark-svg"
    :width="size"
    :height="size"
    viewBox="0 0 40 40"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Benthem Scanner logo">
    <defs>
      <linearGradient :id="uid" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#6366F1" />
        <stop offset="0.52" stop-color="#A855F7" />
        <stop offset="1" stop-color="#EC4899" />
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="38" height="38" rx="11" :fill="`url(#${uid})`" />
    <path d="M13.5 10.5h13a2 2 0 0 1 2 2v9.6a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9.6a2 2 0 0 1 2-2Z"
      fill="none" stroke="#FFFFFF" stroke-width="2.1" stroke-linejoin="round" />
    <rect x="10.6" y="14.4" width="18.8" height="5.6" rx="2.8" fill="#22D3EE" fill-opacity="0.95" />
    <path d="M12.2 27.2h15.6" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round" />
  </svg>
</template>

<script>
let markUid = 0;

export default {
  name: 'ProductMark',
  props: {
    size: {
      type: Number,
      default: 38
    }
  },
  computed: {
    uid() {
      return `bm-grad-${markUid++}`;
    }
  }
};
</script>

<style scoped>
.product-mark-svg {
  display: block;
  flex: 0 0 auto;
  border-radius: 11px;
}
</style>
