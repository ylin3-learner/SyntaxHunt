import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import MagneticBuildCanvas from '../src/components/grammar/MagneticBuildCanvas.vue';
import ShredderReduceCanvas from '../src/components/grammar/ShredderReduceCanvas.vue';
import TileSentenceCanvas from '../src/components/grammar/TileSentenceCanvas.vue';
import FeatureMatrixCanvas from '../src/components/grammar/FeatureMatrixCanvas.vue';
import PragmaticHpCanvas from '../src/components/grammar/PragmaticHpCanvas.vue';
import MorphChoiceCanvas from '../src/components/grammar/MorphChoiceCanvas.vue';
import type { GrammarQuestionData } from '../src/rules/types';

vi.mock('../src/utils/useSpeech', () => ({ useTTS: () => ({ speak: vi.fn() }) }));
vi.mock('../src/utils/useSound', () => ({ useSound: () => ({ playSuccess: vi.fn(), playError: vi.fn() }) }));

const createMockQuestion = (overrides: Partial<GrammarQuestionData>): GrammarQuestionData => ({
    id: 'test-q-1',
    type: 'grammar',
    ui_mode: 'BUILD',
    targetNoun: 'The boy',
    antecedent: { noun: 'The boy', number: 'singular', person: 'person' },
    correctAnswer: [],
    chunks: [],
    ...overrides,
} as GrammarQuestionData);

describe('GrammarCanvas 六大題型 UI 互動測試', () => {

    // 1. BUILD (磁吸插槽)
    it('BUILD: 點擊字庫字磚後，應該移到作答區', async () => {
        const question = createMockQuestion({
            ui_mode: 'BUILD',
            canvas_mode: 'BUILD',
            chunks: [
                { id: '1', text: 'The', draggable: true },
                { id: '2', text: 'boy', draggable: true },
                { id: '3', text: 'plays', draggable: true }
            ],
            correctAnswer: ['The', 'boy', 'plays']
        });

        // 改為掛載 MagneticBuildCanvas
        const wrapper = mount(MagneticBuildCanvas, {
            props: {
                question,
                initialChunks: question.chunks,
                speechRate: 0.8,
                shuffleWordBank: false
            }
        });

        const wordBankTiles = wrapper.findAll('.word-bank .tile');
        expect(wordBankTiles.length).toBe(3);

        const firstTileText = wordBankTiles[0].text();
        expect(firstTileText).toBe('The');

        await wordBankTiles[0].trigger('click');

        expect(wrapper.findAll('.word-bank .tile').length).toBe(2);
        const answerAreaTiles = wrapper.findAll('.answer-area .tile');
        expect(answerAreaTiles.length).toBe(1);
        expect(answerAreaTiles[0].text()).toBe(firstTileText);
    });

    // 2. MORPH (摺紙變形)
    it('MORPH: 點擊變形字磚應彈出選單，點擊選項後應改變單字', async () => {
        const question = createMockQuestion({
            ui_mode: 'MORPH',
            canvas_mode: 'MORPH',
            concept: 'TENSE_ASPECT',
            chunks: [
                { id: '1', text: 'He', draggable: false },
                { id: '2', text: 'go', draggable: false, can_morph: true, options: ['go', 'goes', 'went'] }
            ],
            correctAnswer: ['He', 'went']
        });

        // MORPH 留在 TileSentenceCanvas
        const wrapper = mount(TileSentenceCanvas, {
            props: { question, initialChunks: question.chunks, speechRate: 0.8, fixedMorph: true }
        });

        const morphTile = wrapper.find('.morph-capsule');
        expect(morphTile.exists()).toBe(true);
        expect(morphTile.text()).toBe('go');

        await morphTile.trigger('click');
        const menuButtons = wrapper.findAll('.morph-menu button');
        expect(menuButtons.length).toBe(3);

        await menuButtons[2].trigger('click');
        expect(wrapper.find('.morph-capsule').text()).toBe('went');
    });

    // 3. REDUCE (碎紙機)
    it('REDUCE: 點擊作答區的「移除」後，字磚應掉進垃圾桶', async () => {
        const question = createMockQuestion({
            ui_mode: 'REDUCE',
            canvas_mode: 'REDUCE',
            chunks: [
                { id: '1', text: 'The', draggable: false },
                { id: '2', text: 'who', draggable: true }
            ],
            correctAnswer: ['The']
        });

        // 改為掛載 ShredderReduceCanvas
        const wrapper = mount(ShredderReduceCanvas, {
            props: { question, initialChunks: question.chunks, speechRate: 0.8 }
        });

        expect(wrapper.findAll('.removable-word').length).toBe(1);
        expect(wrapper.findAll('.fixed-word').length).toBe(1);

        const discardBtn = wrapper.find('.removable-word');
        await discardBtn.trigger('click');

        expect(wrapper.findAll('.removable-word').length).toBe(0);
        expect(wrapper.findAll('.trash-tile').length).toBe(1);
        expect(wrapper.find('.trash-tile').text()).toContain('who');
    });

    // 4. MATRIX_GATE (特徵解鎖)
    it('MATRIX_GATE: 點擊特徵開關後，解鎖按鈕應該變為可用', async () => {
        const question = createMockQuestion({
            ui_mode: 'BUILD',
            canvas_mode: 'MATRIX_GATE',
            matrix_config: {
                xOptions: ['主詞是人', '主詞是物'],
                yOptions: ['花費時間', '花費金錢'],
                correctX: 1,
                correctY: 1,
                prompt: 'The book ______ me 10 dollars.',
                answer: 'cost',
                options: ['cost', 'spend', 'take']
            }
        });

        const wrapper = mount(FeatureMatrixCanvas, {
            props: { question, initialChunks: [], speechRate: 0.8 }
        });

        const decodeBtn = wrapper.find('.decode-button');
        expect(decodeBtn.attributes('disabled')).toBeDefined();

        await wrapper.findAll('.matrix-axes fieldset:first-child button')[1].trigger('click');
        await wrapper.findAll('.matrix-axes fieldset:nth-child(2) button')[1].trigger('click');

        expect(wrapper.find('.decode-button').attributes('disabled')).toBeUndefined();
    });

    // 5. PRAGMATIC_HP (語情血條)
    it('PRAGMATIC_HP: 送出強烈命令語氣時，血條應該下降', async () => {
        const question = createMockQuestion({
            ui_mode: 'BUILD',
            canvas_mode: 'PRAGMATIC_HP',
            pragmatic_target: { statusGap: 3, npcLabel: '總經理' },
            chunks: [
                { id: '1', text: 'Give', draggable: true }
            ],
            correctAnswer: ['Could', 'you', 'give']
        });

        const wrapper = mount(PragmaticHpCanvas, {
            props: { question, initialChunks: question.chunks }
        });

        const wordBankBtns = wrapper.findAll('.pragmatic-word-bank button');
        const giveBtn = wordBankBtns.find(btn => btn.text().toLowerCase() === 'give');

        expect(giveBtn).toBeDefined();
        if (giveBtn) {
            await giveBtn.trigger('click');
        }

        await wrapper.vm.$nextTick();

        const submitBtn = wrapper.find('.submit-button');
        expect(submitBtn.attributes('disabled')).toBeUndefined();
        await submitBtn.trigger('click');

        await wrapper.vm.$nextTick();

        expect(wrapper.find('.social-meter strong').text()).not.toContain('100 / 100');
        expect(wrapper.find('.impact').text()).toContain('-');
    });

    // 6. GRAVITY_SWITCH (重力開關)
    it('GRAVITY_SWITCH: 切換重力開關後，UI 應該變成失重模式', async () => {
        const question = createMockQuestion({
            ui_mode: 'MORPH',
            canvas_mode: 'GRAVITY_SWITCH',
            concept: 'SUBJUNCTIVE',
            chunks: [
                { id: '1', text: 'If', draggable: false },
                { id: '2', text: 'I', draggable: false },
                { id: '3', text: 'was', draggable: false, can_morph: true, options: ['was', 'were'] }
            ]
        });

        const wrapper = mount(MorphChoiceCanvas, {
            props: { question, initialChunks: question.chunks, strategy: 'timeline' }
        });

        const toggleBtn = wrapper.findAll('button').find(b => b.text().includes('切換假設模式'));
        expect(toggleBtn).toBeDefined();

        if (toggleBtn) {
            await toggleBtn.trigger('click');
        }

        expect(wrapper.find('.gravity-irreal').exists()).toBe(true);
    });
});