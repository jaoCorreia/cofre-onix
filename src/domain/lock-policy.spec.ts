import { describe, expect, it } from 'vitest';
import { afterBiometricAttempt, LOCK_AFTER_MS, LockState, MAX_BIOMETRIC_FAILURES, shouldLockOnResume } from './lock-policy';

const on: LockState = { biometricEnabled: true, backgroundedAt: null, failedAttempts: 0 };

describe('shouldLockOnResume', () => {
  it('sem digital ativada nunca bloqueia', () => {
    expect(shouldLockOnResume({ ...on, biometricEnabled: false }, 0)).toBe(false);
  });
  it('abertura fria bloqueia', () => {
    expect(shouldLockOnResume(on, 0)).toBe(true);
  });
  it('volta rápida não bloqueia, demorada bloqueia', () => {
    const s = { ...on, backgroundedAt: 1000 };
    expect(shouldLockOnResume(s, 1000 + LOCK_AFTER_MS - 1)).toBe(false);
    expect(shouldLockOnResume(s, 1000 + LOCK_AFTER_MS)).toBe(true);
  });
});

describe('afterBiometricAttempt', () => {
  it('sucesso zera falhas', () => {
    const r = afterBiometricAttempt({ ...on, failedAttempts: 3 }, true);
    expect(r).toEqual({ state: { ...on, failedAttempts: 0 }, outcome: 'unlocked' });
  });
  it(`após ${MAX_BIOMETRIC_FAILURES} falhas exige Google`, () => {
    let s = on;
    let outcome = '';
    for (let k = 0; k < MAX_BIOMETRIC_FAILURES; k++) ({ state: s, outcome } = afterBiometricAttempt(s, false));
    expect(outcome).toBe('require_google');
  });
});
