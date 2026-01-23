<template>
  <div class="parent">
    <h1>{{ title }}</h1>
    <ChildComponent :message="greeting" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import ChildComponent from './ChildComponent.vue'

const title = ref('Parent Component')
const greeting = ref('Hello from parent')
</script>
