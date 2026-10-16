import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Precisa ser igual ao pacote cadastrado no cliente OAuth Android do Google Cloud.
  appId: 'com.cofreonix.app',
  appName: 'Cofre Ônix',
  webDir: 'www',
  android: { allowMixedContent: false },
  // Não registra chamadas de plugins no log do Android (elas incluem a sessão do usuário).
  loggingBehavior: 'none',
};

export default config;
