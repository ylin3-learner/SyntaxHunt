import { describe, it, expect } from 'vitest';
import { L1LocalRules } from './L1_LocalRules';
import type { DiagnosticContext } from '../../types';

describe('L1 Local Rules Layer', () => {
    it('should return definite signals and filter out UNKNOWN_ERROR', async () => {
        const ctx: DiagnosticContext = {
            studentTokens: ['The', 'man', 'who', 'he', 'came'],
            correctTokens: ['The', 'man', 'who', 'came'],
            question: {
                type: 'grammar',
                concept: 'ADJECTIVE_CLAUSE',
                antecedent: { noun: 'man', number: 'singular', person: 'person' },
            } as any,
        };

        const signals = await L1LocalRules.diagnose(ctx);

        expect(signals.length).toBeGreaterThan(0);
        expect(signals[0].code).toBe('U:PRON'); // grammarRules 回傳的代碼是 U:PRON，不是 DUPLICATE_PRONOUN
    });
});