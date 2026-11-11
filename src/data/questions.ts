// 刪除原本的 interface，改為直接引入
import type { QuestionData } from '../rules/types';

export const defaultQuestions: QuestionData[] = [
  {
    id: 'q1',
    type: 'standard',
    mode: 'build',
    targetNoun: 'The girl',
    antecedent: { noun: 'The girl', number: 'singular', person: 'person' },
    imageUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=AnimeGirl',
    enabledStages: ['input', 'macro', 'micro', 'pronunciation', 'noticing'],
    grammarFeature: {
      relative: {
        label: 'who wears a blue uniform',
        tiles: ['wears', 'uniform', 'who', 'blue', 'a', 'she'],
        correctAnswer: ['who', 'wears', 'a', 'blue', 'uniform'],
        distractors: ['she']
      },
      preposition: {
        label: 'in a blue uniform',
        tiles: ['uniform', 'in', 'blue', 'a'],
        correctAnswer: ['in', 'a', 'blue', 'uniform']
      }
    },
    explanation: {
      title: '✨ 你發現了嗎？',
      desc: '在英文中，修飾語要放在名詞的後面喔！',
    },
    inputData: {
      audioText: 'The girl who wears a blue uniform is my sister.',
      options: [
        { image: 'https://api.dicebear.com/7.x/adventurer/svg?seed=AnimeGirl', text: 'who wears a blue uniform', isCorrect: true },
        { image: 'https://api.dicebear.com/7.x/adventurer/svg?seed=OtherGirl', text: 'who wears a red dress', isCorrect: false }
      ]
    },
    noticingData: {
      examples: [
        'The girl who wears a blue uniform is my sister.',
        'The boy who plays basketball is my brother.'
      ],
      question: '請觀察這兩個句子，關係代名詞 who 代替的是什麼？',
      options: [
        { text: '事物（Things）', isCorrect: false },
        { text: '人（People）', isCorrect: true }
      ],
      explanation: '沒錯！當先行詞是「人」的時候，我們使用 who 來引導關係子句。'
    }
  }
];