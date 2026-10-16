// Edge Function "delete-account": exclui a conta de quem chama (exigência da Play Store).
// Usa a chave service_role (disponível só no servidor) para apagar dados e o usuário do Auth.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'método não permitido' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'login necessário' }, 401);

  // Identifica o usuário pelo próprio token; ninguém consegue apagar outra conta.
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data } = await asUser.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return json({ error: 'sessão inválida' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // Arquivos de lares que vão desaparecer (só a pessoa era integrante).
  const { data: memberships } = await admin.from('household_members').select('household_id').eq('user_id', uid);
  for (const m of memberships ?? []) {
    const { count } = await admin.from('household_members').select('user_id', { count: 'exact', head: true }).eq('household_id', m.household_id);
    if (count === 1) {
      const { data: files } = await admin.storage.from('documents').list(m.household_id, { limit: 1000 });
      if (files?.length) await admin.storage.from('documents').remove(files.map((f) => `${m.household_id}/${f.name}`));
    }
  }

  const { error: dataError } = await admin.rpc('delete_account_data', { uid });
  if (dataError) {
    console.error('delete_account_data', dataError);
    return json({ error: 'não deu para apagar os dados' }, 500);
  }
  const { error: authError } = await admin.auth.admin.deleteUser(uid);
  if (authError) {
    console.error('deleteUser', authError);
    return json({ error: 'não deu para apagar a conta' }, 500);
  }
  return json({ ok: true });
});
