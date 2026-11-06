<script setup lang="ts">
type QuestionType = 'standard' | 'contrast' | 'chunk' | 'grammar';

defineProps<{
  title: string;
  questionType: QuestionType;
}>();

const emit = defineEmits<{
  (e: 'update:questionType', value: QuestionType): void;
}>();

const questionTypes: Array<{ value: QuestionType; label: string }> = [
  { value: 'standard', label: '標準題' },
  { value: 'contrast', label: '對比題' },
  { value: 'chunk', label: '片語題' },
  { value: 'grammar', label: '通用文法題' },
];
</script>

<template>
  <section class="question-editor editor">
    <header class="editor-header">
      <h3>{{ title }}</h3>
      <div class="type-switcher">
        <button v-for="type in questionTypes" :key="type.value" type="button"
          :class="{ active: questionType === type.value }"
          @click="emit('update:questionType', type.value)">
          {{ type.label }}
        </button>
      </div>
    </header>
    <div class="editor-body">
      <slot />
    </div>
    <footer class="editor-footer">
      <slot name="footer" />
    </footer>
  </section>
</template>

<style scoped>
.editor { display: flex; min-width: 0; min-height: 0; flex: 1; flex-direction: column; background: #fff; }
.editor-header { flex-shrink: 0; padding: 20px 32px; border-bottom: 2px solid #f0f0f0; }
.editor-header h3 { margin: 0; color: #333; font-size: 1.3rem; }
.type-switcher { display: flex; gap: 10px; margin-top: 16px; }
.type-switcher button { flex: 1; padding: 10px; border: 2px solid transparent; border-radius: 12px; background: #f0f0f0; color: #777; font-weight: 700; cursor: pointer; }
.type-switcher button.active { border-color: #1cb0f6; background: #e6f7ff; color: #1cb0f6; }
.editor-body { flex: 1; overflow-y: auto; padding: 24px 32px; }
.editor-footer { display: flex; flex-shrink: 0; justify-content: flex-end; gap: 16px; padding: 16px 32px; border-top: 2px solid #f0f0f0; background: #fafafa; }
</style>
