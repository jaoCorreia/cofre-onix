/** Regras de bloqueio do app (puras, para poderem ser testadas sem Capacitor). */
export interface LockState {
  biometricEnabled: boolean;
  /** Momento em que o app foi para segundo plano; null se está em uso. */
  backgroundedAt: number | null;
  failedAttempts: number;
}

export const LOCK_AFTER_MS = 60_000;
export const MAX_BIOMETRIC_FAILURES = 5;

export function shouldLockOnResume(state: LockState, now: number, lockAfterMs = LOCK_AFTER_MS): boolean {
  if (!state.biometricEnabled) return false;
  if (state.backgroundedAt === null) return true; // abertura fria: sempre pede a digital
  return now - state.backgroundedAt >= lockAfterMs;
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
