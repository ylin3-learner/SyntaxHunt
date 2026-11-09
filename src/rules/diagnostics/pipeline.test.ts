import { describe, it, expect, vi } from 'vitest';
import { runDiagnosisPipeline } from './pipeline';
import type { DiagnosticLayer, DiagnosticContext } from '../types';
import { L5HighlightFallback } from './layers/L5_HighlightFallback';

describe('Diagnostic Pipeline (Chain of Responsibility)', () => {
    const mockCtx: DiagnosticContext = {
        studentTokens: ['He', 'go', 'to', 'school'],
        correctTokens: ['He', 'went', 'to', 'school'],
        question: {
            id: 'q1', type: 'grammar', targetNoun: 'He',
            antecedent: { noun: 'He', number: 'singular', person: 'person' },
            chunks: [], correctAnswer: ['He', 'went', 'to', 'school'], ui_mode: 'BUILD'
        } as any,
    };

    it('should short-circuit and NOT call lower priority layers if a higher layer finds a definite error', async () => {
        const mockL1: DiagnosticLayer = {
            id: 'mock-L1', priority: 10,
            diagnose: vi.fn().mockResolvedValue([{ code: 'DUPLICATE_PRONOUN', message: 'Duplicate pronoun', source: 'local' }]),
        };
        const mockL2: DiagnosticLayer = {
            id: 'mock-L2', priority: 20,
            diagnose: vi.fn().mockResolvedValue([]),
        };

        const signals = await runDiagnosisPipeline(mockCtx, [mockL1, mockL2]);

        expect(signals[0].code).toBe('DUPLICATE_PRONOUN');
        expect(mockL2.diagnose).not.toHaveBeenCalled(); // L2 should be skipped
    });

    it('should ignore LT_ERROR and fallback to L5 highlight if LanguageTool fails', async () => {
        const mockL4: DiagnosticLayer = {
            id: 'mock-L4', priority: 40,
            diagnose: vi.fn().mockResolvedValue([{ code: 'LT_ERROR', message: 'Network error', source: 'languagetool' }]),
        };

        const signals = await runDiagnosisPipeline(mockCtx, [mockL4, L5HighlightFallback]);

        // Should skip LT_ERROR and get HIGHLIGHT_ONLY from L5
        expect(signals[0].code).toBe('HIGHLIGHT_ONLY');
        expect(signals[0].index).toBe(1); // 'go' is at index 1
    });
});