import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { as, freshDb, user } from './harness';

const joao = user('joao');
const esposa = user('esposa');
const leitor = user('leitor');
const estranho = user('estranho');

let db: PGlite;
let hh: string;

const one = async <T>(tx: Transaction, sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows[0];
const count = async (tx: Transaction, table: string) => Number((await one<{ c: number }>(tx, `select count(*)::int c from ${table}`)).c);

async function addDebt(tx: Transaction, opts: { priv?: boolean; name?: string } = {}) {
  return one<{ id: string }>(
    tx,
    `insert into debts (household_id, name, principal_cents, balance_cents, monthly_rate, system, installments, private)
     values ($1, $2, 3800000, 2740000, 0.021, 'price', 48, $3) returning id`,
    [hh, opts.name ?? 'Carro', opts.priv ?? false],
  );
}

async function invite(email: string, role: string) {
  return as(db, joao, async (tx) => (await one<{ t: string }>(tx, 'select create_invite($1, $2, $3) t', [hh, email, role])).t);
}

beforeAll(async () => {
  db = await freshDb();
  hh = await as(db, joao, async (tx) => (await one<{ id: string }>(tx, `select create_household('Casa') id`)).id);
  await as(db, joao, (tx) => addDebt(tx));
  await as(db, joao, (tx) => addDebt(tx, { priv: true, name: 'Segredo' }));

  const t1 = await invite(esposa.email, 'editor');
  await as(db, esposa, (tx) => tx.query('select accept_invite($1)', [t1]));
  const t2 = await invite(leitor.email, 'viewer');
  await as(db, leitor, (tx) => tx.query('select accept_invite($1)', [t2]));
});

describe('isolamento entre lares', () => {
  it('quem não é membro não vê nada', async () => {
    await as(db, estranho, async (tx) => {
      for (const t of ['households', 'household_members', 'debts', 'installments', 'loans', 'investments', 'documents', 'audit_log', 'invites']) {
        expect(await count(tx, t), t).toBe(0);
      }
    });
  });

  it('quem não é membro não consegue gravar no lar', async () => {
    await expect(as(db, estranho, (tx) => addDebt(tx))).rejects.toThrow(/row-level security/);
  });

  it('não dá para se colocar como membro direto na tabela', async () => {
    await expect(
      as(db, estranho, (tx) => tx.query(`insert into household_members values ($1, $2, 'owner')`, [hh, estranho.id])),
    ).rejects.toThrow();
  });
});

describe('papéis', () => {
  it('editor (esposa) vê e grava dívidas compartilhadas', async () => {
    await as(db, esposa, async (tx) => {
      expect(await count(tx, 'debts')).toBe(1);
      await addDebt(tx, { name: 'Cartão dela' });
    });
  });

  it('leitor vê mas não grava', async () => {
    await as(db, leitor, async (tx) => expect(await count(tx, 'debts')).toBeGreaterThan(0));
    await expect(as(db, leitor, (tx) => addDebt(tx))).rejects.toThrow(/row-level security/);
  });

  it('leitor não altera nem apaga (afeta 0 linhas)', async () => {
    await as(db, leitor, async (tx) => {
      expect((await tx.query(`update debts set name = 'x'`)).affectedRows).toBe(0);
      expect((await tx.query(`delete from debts`)).affectedRows).toBe(0);
    });
  });

  it('só o dono convida', async () => {
    await expect(as(db, esposa, (tx) => tx.query(`select create_invite($1, 'x@exemplo.com', 'viewer')`, [hh]))).rejects.toThrow(
      /só o dono/,
    );
  });

  it('editor não promove ninguém a dono', async () => {
    await as(db, esposa, async (tx) => {
      const r = await tx.query(`update household_members set role = 'owner' where user_id = $1`, [esposa.id]);
      expect(r.affectedRows).toBe(0);
    });
  });

  it('o lar não fica sem dono', async () => {
    await expect(as(db, joao, (tx) => tx.query(`delete from household_members where user_id = $1`, [joao.id]))).rejects.toThrow(
      /pelo menos um dono/,
    );
  });
});

describe('itens privados', () => {
  it('só quem criou vê', async () => {
    await as(db, joao, async (tx) => expect(await count(tx, `debts where name = 'Segredo'`)).toBe(1));
    await as(db, esposa, async (tx) => expect(await count(tx, `debts where name = 'Segredo'`)).toBe(0));
  });

  it('parcelas de dívida privada também ficam ocultas', async () => {
    await as(db, joao, async (tx) => {
      const d = await one<{ id: string }>(tx, `select id from debts where name = 'Segredo'`);
      await tx.query(`insert into installments (debt_id, n, payment_cents, interest_cents, amortization_cents) values ($1, 1, 100, 10, 90)`, [d.id]);
    });
    await as(db, esposa, async (tx) => expect(await count(tx, 'installments')).toBe(0));
  });
});

describe('convites', () => {
  it('não serve para outro e-mail', async () => {
    const t = await invite('alguem@exemplo.com', 'viewer');
    await expect(as(db, estranho, (tx) => tx.query('select accept_invite($1)', [t]))).rejects.toThrow(/outro e-mail/);
  });

  it('não pode ser usado duas vezes', async () => {
    const outro = user('outro');
    const t = await invite(outro.email, 'viewer');
    await as(db, outro, (tx) => tx.query('select accept_invite($1)', [t]));
    await expect(as(db, outro, (tx) => tx.query('select accept_invite($1)', [t]))).rejects.toThrow(/inválido ou expirado/);
  });

  it('expira', async () => {
    const atrasado = user('atrasado');
    const t = await invite(atrasado.email, 'viewer');
    await db.query(`update invites set expires_at = now() - interval '1 minute' where email = $1`, [atrasado.email]);
    await expect(as(db, atrasado, (tx) => tx.query('select accept_invite($1)', [t]))).rejects.toThrow(/inválido ou expirado/);
  });

  it('o token não fica salvo em texto puro', async () => {
    const t = await invite('hash@exemplo.com', 'viewer');
    const r = await db.query(`select count(*)::int c from invites where token_hash = $1`, [t]);
    expect((r.rows[0] as { c: number }).c).toBe(0);
  });
});

describe('auditoria', () => {
  it('registra quem fez o quê e ninguém apaga o registro', async () => {
    await as(db, esposa, async (tx) => {
      const r = await one<{ c: number }>(tx, `select count(*)::int c from audit_log where actor = $1 and table_name = 'debts'`, [esposa.id]);
      expect(r.c).toBeGreaterThan(0);
    });
    await expect(as(db, joao, (tx) => tx.query('delete from audit_log'))).rejects.toThrow(/permission denied/);
  });
});
