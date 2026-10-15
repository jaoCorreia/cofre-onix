import { publicEnv } from './env.generated';

export const environment = {
  production: true,
  supabase: { url: publicEnv.SUPABASE_URL, anonKey: publicEnv.SUPABASE_ANON_KEY },
  googleWebClientId: publicEnv.GOOGLE_WEB_CLIENT_ID,
};
