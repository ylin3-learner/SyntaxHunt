import { describe, expect, it } from 'vitest';
import { getGrammarTopic, grammarChapters, grammarTopics } from '../src/rules/grammarTopics';

describe('grammar topic recommendations', () => {
  it('covers all 20 curriculum chapters with a single recommended UI per topic', () => {
    expect(grammarChapters.map(chapter => chapter.number)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1)
    );
    expect(grammarTopics.every(topic => ['BUILD', 'REDUCE', 'MORPH'].includes(topic.mode))).toBe(true);
    expect(grammarTopics.every(topic => topic.focus.length > 0 && topic.recommendation.length > 0)).toBe(true);
    expect(new Set(grammarTopics.map(topic => topic.id)).size).toBe(grammarTopics.length);
  });

  it('looks up saved topic recommendations without changing legacy questions', () => {
    expect(getGrammarTopic('comparison-than')).toMatchObject({
      chapter: 9,
      mode: 'MORPH',
      focus: expect.any(String),
    });
    expect(getGrammarTopic()).toBeUndefined();
  });
});
