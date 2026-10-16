import { describe, expect, it } from 'vitest';
import {
  afterBiometricAttempt,
  isPromptSideEffect,
  LOCK_AFTER_MS,
  LockState,
  MAX_BIOMETRIC_FAILURES,
  PROMPT_GRACE_MS,
  shouldLockOnColdStart,
  shouldLockOnResume,
} from './lock-policy';

const on: LockState = { biometricEnabled: true, backgroundedAt: null, failedAttempts: 0 };

describe('shouldLockOnColdStart', () => {
  it('pede a digital ao abrir só se ela estiver ativada', () => {
    expect(shouldLockOnColdStart(on)).toBe(true);
    expect(shouldLockOnColdStart({ ...on, biometricEnabled: false })).toBe(false);
  });
});

describe('shouldLockOnResume', () => {
  it('sem digital ativada nunca bloqueia', () => {
    expect(shouldLockOnResume({ ...on, biometricEnabled: false, backgroundedAt: 0 }, LOCK_AFTER_MS * 10)).toBe(false);
  });

  it('voltar sem ter saído do app não bloqueia (causa do loop da digital)', () => {
    expect(shouldLockOnResume(on, Date.now())).toBe(false);
  });

  it('volta rápida não bloqueia, demorada bloqueia', () => {
    const s = { ...on, backgroundedAt: 1000 };
    expect(shouldLockOnResume(s, 1000 + LOCK_AFTER_MS - 1)).toBe(false);
    expect(shouldLockOnResume(s, 1000 + LOCK_AFTER_MS)).toBe(true);
  });
});

describe('isPromptSideEffect', () => {
  it('ignora eventos durante o pedido de digital e logo depois', () => {
    expect(isPromptSideEffect(true, null, 0)).toBe(true);
    expect(isPromptSideEffect(false, 1000, 1000 + PROMPT_GRACE_MS - 1)).toBe(true);
    expect(isPromptSideEffect(false, 1000, 1000 + PROMPT_GRACE_MS)).toBe(false);
    expect(isPromptSideEffect(false, null, 5000)).toBe(false);
  });
});

describe('sequência real: desbloqueio seguido do evento "app ativo"', () => {
  it('não volta a bloquear depois de desbloquear', () => {
    // 1) desbloqueou com sucesso
    let state = afterBiometricAttempt(on, true).state;
    // 2) o Android avisa "app ativo" logo depois da janela da digital
    expect(shouldLockOnResume(state, Date.now())).toBe(false);
    // 3) mesmo que o evento "inativo" tenha sido registrado durante o pedido, voltar em segundos não bloqueia
    state = { ...state, backgroundedAt: Date.now() - 2000 };
    expect(shouldLockOnResume(state, Date.now())).toBe(false);
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
