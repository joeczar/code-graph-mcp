import { describe, it, expect, beforeEach } from 'vitest';
import { VueExtractor } from '../vue.js';
import { CodeParser } from '../../parser.js';

describe('VueExtractor', () => {
  let parser: CodeParser;

  beforeEach(() => {
    parser = new CodeParser();
  });

  describe('component extraction', () => {
    it('extracts Options API component', async () => {
      const code = `
<template>
  <div>{{ message }}</div>
</template>

<script>
export default {
  name: 'HelloWorld',
  props: {
    msg: String
  },
  data() {
    return {
      message: 'Hello'
    }
  }
}
</script>
      `;

      const result = await parser.parse(code, 'vue');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new VueExtractor({
        filePath: '/test/HelloWorld.vue',
      });

      const entities = await extractor.extract(result.result.tree.rootNode);

      // Should extract component entity
      const component = entities.find((e) => e.type === 'class');
      expect(component).toBeDefined();
      expect(component?.name).toBe('HelloWorld');
      expect(component?.language).toBe('vue');
      expect(component?.metadata?.['componentType']).toBe('options');
      expect(component?.metadata?.['exported']).toBe(true);
    });

    it('extracts Composition API component with script setup', async () => {
      const code = `
<template>
  <div>{{ count }}</div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)
const increment = () => {
  count.value++
}
</script>
      `;

      const result = await parser.parse(code, 'vue');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new VueExtractor({
        filePath: '/test/Counter.vue',
      });

      const entities = await extractor.extract(result.result.tree.rootNode);

      // Should extract component entity
      const component = entities.find((e) => e.type === 'class');
      expect(component).toBeDefined();
      expect(component?.name).toBe('Counter');
      expect(component?.language).toBe('vue');
      expect(component?.metadata?.['componentType']).toBe('composition');
    });

    it('extracts functions from script section', async () => {
      const code = `
<template>
  <div>{{ greeting }}</div>
</template>

<script setup lang="ts">
function formatMessage(msg: string): string {
  return msg.toUpperCase()
}

const greeting = formatMessage('hello')
</script>
      `;

      const result = await parser.parse(code, 'vue');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new VueExtractor({
        filePath: '/test/Greeter.vue',
      });

      const entities = await extractor.extract(result.result.tree.rootNode);

      // Should extract function from script
      const func = entities.find((e) => e.type === 'function' && e.name === 'formatMessage');
      expect(func).toBeDefined();
      expect(func?.language).toBe('vue');
      expect(func?.metadata?.['parameters']).toEqual(['msg']);
    });

    it('handles component without script section', async () => {
      const code = `
<template>
  <div>Static content</div>
</template>
      `;

      const result = await parser.parse(code, 'vue');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new VueExtractor({
        filePath: '/test/Static.vue',
      });

      const entities = await extractor.extract(result.result.tree.rootNode);

      // Should still extract component entity
      const component = entities.find((e) => e.type === 'class');
      expect(component).toBeDefined();
      expect(component?.name).toBe('Static');
    });

    it('extracts props from Options API', async () => {
      const code = `
<template>
  <div></div>
</template>

<script>
export default {
  props: {
    title: String,
    count: Number,
    enabled: Boolean
  }
}
</script>
      `;

      const result = await parser.parse(code, 'vue');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new VueExtractor({
        filePath: '/test/Component.vue',
      });

      const entities = await extractor.extract(result.result.tree.rootNode);

      const component = entities.find((e) => e.type === 'class');
      expect(component?.metadata?.['props']).toEqual(['title', 'count', 'enabled']);
    });

    it('extracts emits from Options API', async () => {
      const code = `
<template>
  <div></div>
</template>

<script>
export default {
  emits: ['update', 'delete', 'save']
}
</script>
      `;

      const result = await parser.parse(code, 'vue');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new VueExtractor({
        filePath: '/test/Component.vue',
      });

      const entities = await extractor.extract(result.result.tree.rootNode);

      const component = entities.find((e) => e.type === 'class');
      expect(component?.metadata?.['emits']).toEqual(['update', 'delete', 'save']);
    });

    it('adjusts line numbers for script entities', async () => {
      const code = `
<template>
  <div>Test</div>
</template>

<script>
function testFunc() {
  return true
}
</script>
      `;

      const result = await parser.parse(code, 'vue');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new VueExtractor({
        filePath: '/test/Test.vue',
      });

      const entities = await extractor.extract(result.result.tree.rootNode);

      const func = entities.find((e) => e.name === 'testFunc');
      expect(func).toBeDefined();
      // Function should be on line 7 (accounting for template lines)
      expect(func?.startLine).toBeGreaterThan(5);
    });
  });
});
