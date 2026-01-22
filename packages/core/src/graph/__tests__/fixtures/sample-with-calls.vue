<template>
  <div>
    <MyButton @click="handleClick" />
  </div>
</template>

<script setup lang="ts">
function helper() {
  return 42;
}

function handleClick() {
  const result = helper();
  console.log(result);
}
</script>
