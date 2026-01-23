import { describe, it, expect, beforeEach } from 'vitest';
import { VueRelationshipExtractor } from '../vue-relationships.js';
import { CodeParser } from '../../parser.js';

describe('VueRelationshipExtractor', () => {
  let parser: CodeParser;

  beforeEach(() => {
    parser = new CodeParser();
  });

  describe('import extraction', () => {
    it('extracts imports from script section', async () => {
      const code = `
<template>
  <div></div>
</template>

<script setup>
import { ref, computed } from 'vue'
import MyComponent from './MyComponent.vue'
</script>
      `;

      const result = await parser.parse(code, 'vue');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new VueRelationshipExtractor();
      const relationships = await extractor.extract(result.result);

      // Should extract Vue import
      const vueImport = relationships.find(
        (r) => r.type === 'imports' && r.targetName === 'vue'
      );
      expect(vueImport).toBeDefined();
      expect(vueImport?.metadata?.['named']).toEqual(['ref', 'computed']);

      // Should extract component import
      const componentImport = relationships.find(
        (r) => r.type === 'imports' && r.targetName === './MyComponent.vue'
      );
      expect(componentImport).toBeDefined();
      expect(componentImport?.metadata?.['default']).toBe('MyComponent');
    });

    it('adjusts line numbers for script imports', async () => {
      const code = `
<template>
  <div></div>
</template>

<script>
import utils from './utils'
</script>
      `;

      const result = await parser.parse(code, 'vue');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new VueRelationshipExtractor();
      const relationships = await extractor.extract(result.result);

      const importRel = relationships.find(
        (r) => r.type === 'imports' && r.targetName === './utils'
      );
      expect(importRel).toBeDefined();
      // Import should be on line 7 (accounting for template lines)
      expect(importRel?.sourceLocation?.line).toBeGreaterThan(5);
    });
  });

  describe('component usage extraction', () => {
    it('extracts custom component usage from template', async () => {
      const code = `
<template>
  <div>
    <MyButton @click="handleClick" />
    <CustomCard :title="title" />
  </div>
</template>

<script setup>
import MyButton from './MyButton.vue'
import CustomCard from './CustomCard.vue'
</script>
      `;

      const result = await parser.parse(code, 'vue');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new VueRelationshipExtractor();
      const relationships = await extractor.extract(result.result);

      // Should detect MyButton component usage
      const buttonUsage = relationships.find(
        (r) => r.targetName === 'MyButton' && r.metadata?.['usage'] === 'template-component'
      );
      expect(buttonUsage).toBeDefined();
      expect(buttonUsage?.type).toBe('calls');
      expect(buttonUsage?.sourceName).toBe('Component');

      // Should detect CustomCard component usage
      const cardUsage = relationships.find(
        (r) => r.targetName === 'CustomCard' && r.metadata?.['usage'] === 'template-component'
      );
      expect(cardUsage).toBeDefined();
    });

    it('adds targetFilePath for imported components', async () => {
      const code = `
<template>
  <div>
    <MyButton @click="handleClick" />
  </div>
</template>

<script setup>
import MyButton from './MyButton.vue'
</script>
      `;

      const result = await parser.parse(code, 'vue');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new VueRelationshipExtractor();
      const relationships = await extractor.extract(result.result);

      // Should detect MyButton component usage with targetFilePath
      const buttonUsage = relationships.find(
        (r) => r.targetName === 'MyButton' && r.metadata?.['usage'] === 'template-component'
      );
      expect(buttonUsage).toBeDefined();
      expect(buttonUsage?.targetFilePath).toBe('./MyButton.vue');
    });

    it('ignores built-in HTML tags', async () => {
      const code = `
<template>
  <div>
    <p>Text</p>
    <button>Click</button>
    <input type="text" />
  </div>
</template>

<script setup>
</script>
      `;

      const result = await parser.parse(code, 'vue');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new VueRelationshipExtractor();
      const relationships = await extractor.extract(result.result);

      // Should not extract HTML tags as component relationships
      const htmlTags = relationships.filter(
        (r) =>
          r.metadata?.['usage'] === 'template-component' &&
          ['div', 'p', 'button', 'input'].includes(r.targetName)
      );
      expect(htmlTags).toHaveLength(0);
    });

    it('detects kebab-case components', async () => {
      const code = `
<template>
  <div>
    <my-custom-button />
    <user-profile-card />
  </div>
</template>

<script setup>
</script>
      `;

      const result = await parser.parse(code, 'vue');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new VueRelationshipExtractor();
      const relationships = await extractor.extract(result.result);

      // Should detect kebab-case components
      const kebabComponents = relationships.filter(
        (r) =>
          r.metadata?.['usage'] === 'template-component' &&
          r.targetName.includes('-')
      );
      expect(kebabComponents.length).toBeGreaterThan(0);
    });
  });

  describe('function calls extraction', () => {
    it('extracts function calls from script section', async () => {
      const code = `
<template>
  <div></div>
</template>

<script setup>
function greet() {
  console.log('hello')
}

function sayHello() {
  greet()
}
</script>
      `;

      const result = await parser.parse(code, 'vue');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new VueRelationshipExtractor();
      const relationships = await extractor.extract(result.result);

      // Should extract function call relationship
      const callRel = relationships.find(
        (r) => r.type === 'calls' && r.targetName === 'greet'
      );
      expect(callRel).toBeDefined();
      expect(callRel?.sourceName).toBe('sayHello');
    });
  });

  describe('empty or minimal files', () => {
    it('handles component without script', async () => {
      const code = `
<template>
  <div>Static content</div>
</template>
      `;

      const result = await parser.parse(code, 'vue');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new VueRelationshipExtractor();
      const relationships = await extractor.extract(result.result);

      // Should not crash, may have empty relationships
      expect(Array.isArray(relationships)).toBe(true);
    });

    it('handles component without template', async () => {
      const code = `
<script setup>
import { ref } from 'vue'
const count = ref(0)
</script>
      `;

      const result = await parser.parse(code, 'vue');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new VueRelationshipExtractor();
      const relationships = await extractor.extract(result.result);

      // Should still extract imports from script
      const vueImport = relationships.find(
        (r) => r.type === 'imports' && r.targetName === 'vue'
      );
      expect(vueImport).toBeDefined();
    });
  });
});
