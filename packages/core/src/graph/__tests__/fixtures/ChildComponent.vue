<template>
  <div class="child">
    <p>{{ message }}</p>
  </div>
</template>

<script setup>
defineProps({
  message: String
})
</script>
