import { describe, expect, it } from 'vitest';
import { getGrammarTopic, grammarChapters, grammarTopics } from '../src/rules/grammarTopics';
import { getQuestionCanvasMode } from '../src/rules/types';

describe('grammar topic recommendations', () => {
  it('covers all 20 curriculum chapters with a single recommended UI per topic', () => {
    expect(grammarChapters.map(chapter => chapter.number)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1)
    );
    expect(grammarTopics.every(topic => ['BUILD', 'REDUCE', 'MORPH'].includes(topic.mode))).toBe(true);
    expect(grammarTopics.every(topic => topic.chapterId === `chapter-${topic.chapter}`)).toBe(true);
    expect(grammarChapters.every(chapter =>
      chapter.topics.every(topic => topic.chapterId === chapter.id)
    )).toBe(true);
    expect(grammarTopics.every(topic => [
      'BUILD', 'REDUCE', 'MORPH', 'MATRIX_GATE', 'PRAGMATIC_HP', 'GRAVITY_SWITCH',
    ].includes(topic.defaultCanvasMode))).toBe(true);
    expect(grammarTopics.every(topic => topic.focus.length > 0 && topic.recommendation.length > 0)).toBe(true);
    expect(grammarTopics.every(topic => typeof topic.shuffleTiles === 'boolean')).toBe(true);
    expect(new Set(grammarTopics.map(topic => topic.id)).size).toBe(grammarTopics.length);
  });

  it('looks up saved topic recommendations without changing legacy questions', () => {
    expect(getGrammarTopic('comparison-than')).toMatchObject({
      chapter: 9,
      mode: 'MORPH',
      defaultCanvasMode: 'MORPH',
      focus: expect.any(String),
    });
    expect(getGrammarTopic()).toBeUndefined();
  });

  it('maps special grammar topics to the shared physical canvas modes', () => {
    expect(grammarChapters[0]).toMatchObject({
      number: 1,
      title: '五大句型',
      defaultCanvasMode: 'BUILD',
    });
    expect(getGrammarTopic('five-sentence-patterns')).toMatchObject({
      chapter: 1,
      defaultCanvasMode: 'BUILD',
      shuffleTiles: true,
    });
    expect(getGrammarTopic('have-get-cost')?.defaultCanvasMode).toBe('MATRIX_GATE');
    expect(getGrammarTopic('modal-obligation')?.defaultCanvasMode).toBe('PRAGMATIC_HP');
    expect(getGrammarTopic('sense-passive-pattern')?.defaultCanvasMode).toBe('PRAGMATIC_HP');
    expect(getGrammarTopic('subjunctive-present-unreal')?.defaultCanvasMode).toBe('GRAVITY_SWITCH');
    expect(getGrammarTopic('pronoun-role')?.defaultCanvasMode).toBe('BUILD');
    expect(getGrammarTopic('participle-clause')?.defaultCanvasMode).toBe('REDUCE');
    expect(getGrammarTopic('pronoun-one-it')?.defaultCanvasMode).toBe('REDUCE');
    expect(getGrammarTopic('adjective-participle')?.defaultCanvasMode).toBe('MORPH');
    expect(getGrammarTopic('relative-reduction')?.defaultCanvasMode).toBe('REDUCE');
    expect(grammarChapters[19]).toMatchObject({
      id: 'chapter-20',
      title: '虛擬語氣與條件句',
      defaultCanvasMode: 'GRAVITY_SWITCH',
    });
    expect(getQuestionCanvasMode({
      id: 'saved-topic',
      type: 'grammar',
      grammarTopicId: 'have-get-cost',
      targetNoun: 'The ticket',
      antecedent: { noun: 'The ticket', number: 'singular', person: 'thing' },
    })).toBe('MATRIX_GATE');
  });

  it('only shuffles assembly BUILD topics, not fixed-form or reduction topics', () => {
    expect(getGrammarTopic('inversion')?.shuffleTiles).toBe(true);
    expect(getGrammarTopic('comparison-than')?.shuffleTiles).toBe(false);
    expect(getGrammarTopic('relative-reduction')?.shuffleTiles).toBe(false);
    expect(getGrammarTopic('subjunctive-present-unreal')?.shuffleTiles).toBe(false);
  });

  it('resolves old grammar questions to BUILD or REDUCE and honors explicit overrides', () => {
    expect(getQuestionCanvasMode({ id: 'legacy', type: 'standard', targetNoun: 'The girl',
      antecedent: { noun: 'The girl', number: 'singular', person: 'person' } })).toBe('BUILD');
    expect(getQuestionCanvasMode({ id: 'legacy-reduce', type: 'standard', mode: 'reduce', targetNoun: 'The girl',
      antecedent: { noun: 'The girl', number: 'singular', person: 'person' } })).toBe('REDUCE');
    expect(getQuestionCanvasMode({ id: 'override', type: 'grammar', canvas_mode: 'MATRIX_GATE', targetNoun: 'It',
      antecedent: { noun: 'It', number: 'singular', person: 'thing' } })).toBe('MATRIX_GATE');
  });
});
