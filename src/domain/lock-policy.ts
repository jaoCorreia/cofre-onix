/** Regras de bloqueio do app (puras, para poderem ser testadas sem Capacitor). */
export interface LockState {
  biometricEnabled: boolean;
  /** Momento em que o app foi para segundo plano; null se está em uso. */
  backgroundedAt: number | null;
  failedAttempts: number;
}

export const LOCK_AFTER_MS = 60_000;
export const MAX_BIOMETRIC_FAILURES = 5;
/**
 * A janela da digital deixa o app "inativo" e depois "ativo" de novo. Eventos que chegam
 * durante o pedido ou logo depois dele não contam como sair do app.
 */
export const PROMPT_GRACE_MS = 1_500;

/** Abertura do app do zero: com a digital ativada, sempre pede. */
export function shouldLockOnColdStart(state: LockState): boolean {
  return state.biometricEnabled;
}

/** Volta do segundo plano: só bloqueia se o app realmente saiu da tela por tempo suficiente. */
export function shouldLockOnResume(state: LockState, now: number, lockAfterMs = LOCK_AFTER_MS): boolean {
  if (!state.biometricEnabled || state.backgroundedAt === null) return false;
  return now - state.backgroundedAt >= lockAfterMs;
}

/** true se o evento de app ativo/inativo foi causado pela própria janela da digital. */
export function isPromptSideEffect(promptActive: boolean, promptEndedAt: number | null, now: number): boolean {
  return promptActive || (promptEndedAt !== null && now - promptEndedAt < PROMPT_GRACE_MS);
}

export type UnlockOutcome = 'unlocked' | 'retry' | 'require_google';

/** Depois de muitas falhas, exige o login com Google de novo. */
export function afterBiometricAttempt(state: LockState, success: boolean): { state: LockState; outcome: UnlockOutcome } {
  if (success) return { state: { ...state, failedAttempts: 0, backgroundedAt: null }, outcome: 'unlocked' };
  const failedAttempts = state.failedAttempts + 1;
  return {
    state: { ...state, failedAttempts },
    outcome: failedAttempts >= MAX_BIOMETRIC_FAILURES ? 'require_google' : 'retry',
  };
}
