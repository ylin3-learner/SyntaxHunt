import type { GrammarConcept } from './types';
import type { RuleValidator } from './grammarRules';

export interface GrammarRuleRegistration {
  id: string;
  validate: RuleValidator;
  concepts?: readonly GrammarConcept[];
}

const registeredRules = new Map<string, GrammarRuleRegistration>();

export function registerGrammarRule(rule: GrammarRuleRegistration): () => void {
  const previous = registeredRules.get(rule.id);
  registeredRules.set(rule.id, rule);

  return () => {
    if (registeredRules.get(rule.id) !== rule) return;
    if (previous) registeredRules.set(rule.id, previous);
    else registeredRules.delete(rule.id);
  };
}

export function getGrammarRules(concept?: GrammarConcept): RuleValidator[] {
  return [...registeredRules.values()]
    .filter(rule => !rule.concepts || (concept !== undefined && rule.concepts.includes(concept)))
    .map(rule => rule.validate);
}
