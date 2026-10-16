import { Injectable, computed, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { BiometricAuth, BiometryErrorType } from '@aparajita/capacitor-biometric-auth';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { isNative, supabase } from '../supabase';
import { environment } from '../../../environments/environment';
import {
  afterBiometricAttempt,
  isPromptSideEffect,
  LockState,
  shouldLockOnColdStart,
  shouldLockOnResume,
  UnlockOutcome,
} from '../../../domain/lock-policy';

const BIOMETRIC_FLAG = 'cofre.biometric_enabled';

type PromptResult = 'ok' | 'failed' | 'cancelled' | 'lockout';

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly session = signal<Session | null>(null);
  readonly locked = signal(false);
  readonly ready = signal(false);
  readonly signedIn = computed(() => this.session() !== null);

  private lock: LockState = { biometricEnabled: false, backgroundedAt: null, failedAttempts: 0 };
  private googleReady = false;

  async init(): Promise<void> {
    supabase.auth.onAuthStateChange((_event, s) => this.session.set(s));
    const { data } = await supabase.auth.getSession();
    this.session.set(data.session);

    if (isNative) {
      this.lock.biometricEnabled = (await SecureStorage.getItem(BIOMETRIC_FLAG)) === '1';
      this.locked.set(data.session !== null && shouldLockOnColdStart(this.lock));
    }
    this.ready.set(true);
  }

  // ------------------------------------------------------------ Google
  async signInWithGoogle(): Promise<void> {
    if (!isNative) {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${location.origin}${location.pathname}` }, // volta para a mesma página (local ou GitHub Pages)
      });
      if (error) throw error;
      return; // a página navega para o Google
    }

    if (!this.googleReady) {
      await SocialLogin.initialize({ google: { webClientId: environment.googleWebClientId } });
      this.googleReady = true;
    }
    // O Google recebe o hash do nonce; o Supabase recebe o valor puro e confere.
    const rawNonce = crypto.randomUUID();
    const res = await SocialLogin.login({
      provider: 'google',
      options: { nonce: await sha256Hex(rawNonce) }, // escopos padrão (email, profile)
    });
    const idToken = res.result.responseType === 'online' ? res.result.idToken : null;
    if (!idToken) throw new Error('O Google não devolveu o token de identidade.');

    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce: rawNonce });
    if (error) throw error;
  }

  // ------------------------------------------------------------ Código por e-mail
  /** Envia um código de 6 dígitos. No primeiro acesso, a conta é criada. */
  async sendEmailCode(email: string): Promise<void> {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw error;
  }

  async verifyEmailCode(email: string, code: string): Promise<void> {
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) throw error;
  }

  /** Apaga a conta (Edge Function delete-account) e encerra a sessão neste aparelho. */
  async deleteAccount(): Promise<void> {
    const { error } = await supabase.functions.invoke('delete-account', { body: {} });
    if (error) throw error;
    await this.signOut();
  }

  async signOut(): Promise<void> {
    await supabase.auth.signOut({ scope: 'local' });
    if (isNative) {
      await SocialLogin.logout({ provider: 'google' }).catch(() => undefined);
      await SecureStorage.removeItem(BIOMETRIC_FLAG);
      this.lock = { biometricEnabled: false, backgroundedAt: null, failedAttempts: 0 };
    }
    this.locked.set(false);
  }

  // ------------------------------------------------------------ Digital
  async biometryAvailable(): Promise<boolean> {
    if (!isNative) return false;
    const r = await BiometricAuth.checkBiometry();
    return r.isAvailable && r.strongBiometryIsAvailable;
  }

  get biometricEnabled(): boolean {
    return this.lock.biometricEnabled;
  }

  /** Ativa só depois de uma leitura bem-sucedida da digital. */
  async enableBiometric(): Promise<boolean> {
    if (!(await this.biometryAvailable())) return false;
    if ((await this.prompt('Confirme sua digital para ativar o desbloqueio')) !== 'ok') return false;
    await SecureStorage.setItem(BIOMETRIC_FLAG, '1');
    this.lock.biometricEnabled = true;
    return true;
  }

  async disableBiometric(): Promise<void> {
    await SecureStorage.removeItem(BIOMETRIC_FLAG);
    this.lock.biometricEnabled = false;
  }

  async unlock(): Promise<UnlockOutcome | 'cancelled' | 'lockout'> {
    const result = await this.prompt('Desbloquear o Cofre Ônix');
    // Cancelar (pelo usuário ou pelo sistema) não é digital errada: não conta tentativa.
    if (result === 'cancelled') return 'cancelled';
    if (result === 'lockout') return 'lockout';
    const r = afterBiometricAttempt(this.lock, result === 'ok');
    this.lock = r.state;
    if (r.outcome === 'unlocked') this.locked.set(false);
    if (r.outcome === 'require_google') await this.signOut();
    return r.outcome;
  }

  /** Pede a digital de novo antes de ações sensíveis (apagar, convidar, exportar). */
  async confirmSensitive(reason: string): Promise<boolean> {
    return !isNative || !this.lock.biometricEnabled || (await this.prompt(reason)) === 'ok';
  }

  /** A própria janela da digital deixa o app inativo/ativo: esses eventos são ignorados. */
  private promptSideEffect(): boolean {
    return isPromptSideEffect(this.inFlight !== null, this.promptEndedAt, Date.now());
  }

  onBackground(): void {
    if (this.promptSideEffect()) return;
    this.lock.backgroundedAt = Date.now();
  }

  onForeground(): void {
    if (this.promptSideEffect()) return;
    if (this.signedIn() && !this.locked() && shouldLockOnResume(this.lock, Date.now())) this.locked.set(true);
    this.lock.backgroundedAt = null;
  }

  private inFlight: Promise<PromptResult> | null = null;
  private promptEndedAt: number | null = null;

  /** Um pedido de digital por vez: chamadas simultâneas reaproveitam o mesmo resultado. */
  private prompt(reason: string): Promise<PromptResult> {
    this.inFlight ??= this.doPrompt(reason).finally(() => {
      this.inFlight = null;
      this.promptEndedAt = Date.now();
    });
    return this.inFlight;
  }

  private async doPrompt(reason: string): Promise<PromptResult> {
    try {
      await BiometricAuth.authenticate({
        reason,
        androidTitle: 'Cofre Ônix',
        androidSubtitle: reason,
        cancelTitle: 'Cancelar',
        allowDeviceCredential: false,
      });
      return 'ok';
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === BiometryErrorType.userCancel || code === BiometryErrorType.systemCancel || code === BiometryErrorType.appCancel) return 'cancelled';
      if (code === BiometryErrorType.biometryLockout) return 'lockout';
      return 'failed';
    }
  }
}
