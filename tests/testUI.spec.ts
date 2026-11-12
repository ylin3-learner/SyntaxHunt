import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import MagneticBuildCanvas from '../src/components/grammar/MagneticBuildCanvas.vue';
import type { GrammarQuestionData } from '../src/rules/types';

vi.mock('../src/utils/useSpeech', () => ({ useTTS: () => ({ speak: vi.fn() }) }));
vi.mock('../src/utils/useSound', () => ({ useSound: () => ({ playSuccess: vi.fn(), playError: vi.fn() }) }));

describe('Standard BUILD mock render', () => {
  it('should render word bank tiles for standard BUILD question', () => {
    const question: GrammarQuestionData = {
      id: 'mock-std-build',
      type: 'grammar',
      mode: 'build',
      ui_mode: 'BUILD',
      canvas_mode: 'BUILD',
      targetNoun: 'The boy',
      antecedent: { noun: 'The boy', number: 'singular', person: 'person' },
      chunks: [
        { id: '1', text: 'The', draggable: true },
        { id: '2', text: 'boy', draggable: true },
        { id: '3', text: 'is', draggable: true },
      ],
      correctAnswer: ['The', 'boy', 'is'],
      enabledStages: ['micro'],
    };

    // 改為掛載 MagneticBuildCanvas
    const wrapper = mount(MagneticBuildCanvas, {
      props: {
        question,
        initialChunks: question.chunks,
        speechRate: 0.8,
        shuffleWordBank: false,
      },
    });

    // 預期會看到 3 個字庫字磚
    expect(wrapper.findAll('.word-bank .tile').length).toBe(3);
    // 預期作答區開始為空
    expect(wrapper.findAll('.answer-area .tile').length).toBe(0);
  });
});