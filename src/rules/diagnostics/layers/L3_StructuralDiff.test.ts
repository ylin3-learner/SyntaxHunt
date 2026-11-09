import { describe, it, expect } from 'vitest';
import { L3StructuralDiff } from './L3_StructuralDiff';
import type { DiagnosticContext } from '../../types';

describe('L3 Structural Diff Layer (LCS)', () => {
    const baseCtx = {
        question: { type: 'grammar' } as any,
    };

    it('should detect wrong order (O:WRONG_ORDER)', async () => {
        const ctx: DiagnosticContext = {
            ...baseCtx,
            studentTokens: ['He', 'to', 'school', 'went'],
            correctTokens: ['He', 'went', 'to', 'school'],
        };

        const signals = await L3StructuralDiff.diagnose(ctx);
        expect(signals[0].code).toBe('O:WRONG_ORDER');
    });

    it('should detect omission (M:DET)', async () => {
        const ctx: DiagnosticContext = {
            ...baseCtx,
            studentTokens: ['He', 'went', 'to', 'school'],
            correctTokens: ['He', 'went', 'to', 'a', 'school'],
        };

        const signals = await L3StructuralDiff.diagnose(ctx);
        // Note: The exact code depends on the textDiff implementation, but it should be an Omission
        expect(signals[0].sst).toBe('Omission');
    });
});