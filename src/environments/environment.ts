import { publicEnv } from './env.generated';

// Os valores vêm do .env (veja .env.example), gerados por `npm run env`.
export const environment = {
  production: false,
  supabase: { url: publicEnv.SUPABASE_URL, anonKey: publicEnv.SUPABASE_ANON_KEY },
  googleWebClientId: publicEnv.GOOGLE_WEB_CLIENT_ID,
};
