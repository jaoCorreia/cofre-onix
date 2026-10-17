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

describe('set_installment_paid', () => {
  it('editor paga parcela e o saldo cai; leitor não consegue', async () => {
    const debtId = await as(db, joao, async (tx) => {
      const d = await addDebt(tx, { name: 'Parcelada' });
      await tx.query(`insert into installments (debt_id, n, payment_cents, interest_cents, amortization_cents) values ($1, 1, 1000, 100, 900)`, [d.id]);
      return d.id;
    });
    const inst = await as(db, joao, (tx) => one<{ id: string }>(tx, 'select id from installments where debt_id = $1', [debtId]));

    await expect(as(db, leitor, (tx) => tx.query('select set_installment_paid($1, true)', [inst.id]))).rejects.toThrow();
    await as(db, esposa, (tx) => tx.query('select set_installment_paid($1, true)', [inst.id]));
    await as(db, esposa, (tx) => tx.query('select set_installment_paid($1, true)', [inst.id])); // idempotente

    const d = await as(db, joao, (tx) => one<{ balance_cents: string }>(tx, 'select balance_cents from debts where id = $1', [debtId]));
    expect(Number(d.balance_cents)).toBe(2_740_000 - 900);
  });
});

describe('e-mail dos membros', () => {
  it('fica registrado para o dono e para quem aceitou convite', async () => {
    const rows = await as(db, esposa, async (tx) => (await tx.query<{ email: string }>('select email from household_members order by email')).rows);
    expect(rows.map((r) => r.email)).toEqual(expect.arrayContaining([joao.email, esposa.email]));
  });
});

describe('IA', () => {
  it('ai_consume conta mensagens e respeita o limite diário', async () => {
    const results = [];
    for (let k = 0; k < 3; k++) results.push(await as(db, leitor, async (tx) => (await one<{ ok: boolean }>(tx, 'select ai_consume(2) ok')).ok));
    expect(results).toEqual([true, true, false]);
  });

  it('ai_saved: editor salva, leitor vê mas não salva, estranho não vê', async () => {
    await as(db, esposa, (tx) => tx.query(`insert into ai_saved (household_id, kind, title, spec) values ($1, 'chart', 'Dívidas', '{}')`, [hh]));
    await as(db, leitor, async (tx) => expect(await count(tx, 'ai_saved')).toBe(1));
    await expect(as(db, leitor, (tx) => tx.query(`insert into ai_saved (household_id, kind, title, spec) values ($1, 'chart', 'x', '{}')`, [hh]))).rejects.toThrow();
    await as(db, estranho, async (tx) => expect(await count(tx, 'ai_saved')).toBe(0));
  });
});

describe('empréstimos', () => {
  it('editor registra recebimento parcial, sem passar do total; leitor não', async () => {
    const loan = await as(db, esposa, (tx) =>
      one<{ id: string }>(tx, `insert into loans (household_id, counterparty, direction, amount_cents) values ($1, 'Marcos', 'lent', 180000) returning id`, [hh]),
    );
    await as(db, esposa, (tx) => tx.query('select register_loan_payment($1, 30000)', [loan.id]));
    await as(db, esposa, (tx) => tx.query('select register_loan_payment($1, 999999)', [loan.id]));
    const r = await as(db, joao, (tx) => one<{ paid_cents: string }>(tx, 'select paid_cents from loans where id = $1', [loan.id]));
    expect(Number(r.paid_cents)).toBe(180000);
    await expect(as(db, leitor, (tx) => tx.query('select register_loan_payment($1, 100)', [loan.id]))).rejects.toThrow(/sem permissão/);
    await expect(as(db, esposa, (tx) => tx.query('select register_loan_payment($1, -5)', [loan.id]))).rejects.toThrow(/positivo/);
  });
});

describe('storage de documentos', () => {
  it('membro lê, editor envia, leitor e estranho não enviam, estranho não lê', async () => {
    const path = `${hh}/nota.pdf`;
    await as(db, esposa, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('documents', $1)`, [path]));
    await expect(as(db, leitor, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('documents', $1)`, [`${hh}/x.pdf`]))).rejects.toThrow();
    await expect(as(db, estranho, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('documents', $1)`, [`${hh}/y.pdf`]))).rejects.toThrow();
    await as(db, leitor, async (tx) => expect(await count(tx, `storage.objects where name = '${path}'`)).toBe(1));
    await as(db, estranho, async (tx) => expect(await count(tx, 'storage.objects')).toBe(0));
  });
});

describe('exclusão de conta', () => {
  it('apaga lar solitário; em lar compartilhado passa a posse e apaga só itens privados', async () => {
    const solo = user('solo');
    const soloHh = await as(db, solo, async (tx) => (await one<{ id: string }>(tx, `select create_household('Só meu') id`)).id);

    // joão é o único dono de "Casa"; tem uma dívida privada ("Segredo") e compartilhadas.
    await db.query('select app.delete_account_data($1)', [joao.id]);
    await db.query('select app.delete_account_data($1)', [solo.id]);

    const lares = await db.query<{ id: string }>('select id from households where id = any($1)', [[hh, soloHh]]);
    expect(lares.rows.map((r) => r.id)).toEqual([hh]);
    const donos = await db.query<{ user_id: string }>(`select user_id from household_members where household_id = $1 and role = 'owner'`, [hh]);
    expect(donos.rows.map((r) => r.user_id)).toEqual([esposa.id]);
    const segredo = await db.query(`select 1 from debts where name = 'Segredo'`);
    expect(segredo.rows).toHaveLength(0);
    const compartilhada = await db.query(`select 1 from debts where name = 'Carro'`);
    expect(compartilhada.rows.length).toBeGreaterThan(0);
  });

  it('usuário comum não consegue chamar a função', async () => {
    await expect(as(db, esposa, (tx) => tx.query('select app.delete_account_data($1)', [esposa.id]))).rejects.toThrow(/permission denied/);
  });
});

describe('delete_account_data exposto', () => {
  it('a versão pública também é negada a usuários comuns', async () => {
    await expect(as(db, esposa, (tx) => tx.query('select delete_account_data($1)', [esposa.id]))).rejects.toThrow(/permission denied/);
  });
});

describe('receitas', () => {
  it('editor lança, leitor vê mas não lança, estranho não vê; privada só para quem criou', async () => {
    const lar2 = await as(db, joao, async (tx) => (await one<{ id: string }>(tx, `select create_household('Lar receitas') id`)).id);
    const t = await as(db, joao, (tx) => one<{ t: string }>(tx, `select create_invite($1, $2, 'editor') t`, [lar2, esposa.email]));
    await as(db, esposa, (tx) => tx.query('select accept_invite($1)', [t.t]));
    const t2 = await as(db, joao, (tx) => one<{ t: string }>(tx, `select create_invite($1, $2, 'viewer') t`, [lar2, leitor.email]));
    await as(db, leitor, (tx) => tx.query('select accept_invite($1)', [t2.t]));

    const ins = (priv: boolean) =>
      `insert into incomes (household_id, description, category, amount_cents, received_on, recurring, private) values ('${lar2}', 'Salário', 'salary', 500000, '2026-10-05', true, ${priv})`;
    await as(db, esposa, (tx) => tx.query(ins(false)));
    await as(db, joao, (tx) => tx.query(ins(true)));
    await expect(as(db, leitor, (tx) => tx.query(ins(false)))).rejects.toThrow(/row-level security/);

    await as(db, leitor, async (tx) => expect(await count(tx, `incomes where household_id = '${lar2}'`)).toBe(1));
    await as(db, joao, async (tx) => expect(await count(tx, `incomes where household_id = '${lar2}'`)).toBe(2));
    await as(db, estranho, async (tx) => expect(await count(tx, 'incomes')).toBe(0));
  });

  it('rejeita valor zero e categoria desconhecida', async () => {
    await expect(as(db, esposa, (tx) => tx.query(`insert into incomes (household_id, description, category, amount_cents, received_on) values ($1, 'x', 'salary', 0, '2026-10-01')`, [hh]))).rejects.toThrow();
    await expect(as(db, esposa, (tx) => tx.query(`insert into incomes (household_id, description, category, amount_cents, received_on) values ($1, 'x', 'loteria', 10, '2026-10-01')`, [hh]))).rejects.toThrow();
  });
});
