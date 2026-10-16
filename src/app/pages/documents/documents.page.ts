import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar, ViewWillEnter } from '@ionic/angular';
import { AmortizationSystem, schedule, totalInterest } from '../../../domain/amortization';
import { DocumentKind, ExtractedDocument } from '../../../domain/document-extraction';
import { suggestIcon } from '../../../domain/icon-catalog';
import { formatBRL, formatPercent, parseBRL, parsePercent } from '../../../domain/money';
import { AuthService } from '../../core/auth/auth.service';
import { DebtsService } from '../../core/data/debts.service';
import { DocumentError, DocumentsService } from '../../core/data/documents.service';
import { HouseholdService } from '../../core/data/household.service';
import { DocumentRow } from '../../core/data/models';

const KIND_LABEL: Record<DocumentKind, string> = { invoice: 'Fatura', contract: 'Contrato', boleto: 'Boleto', other: 'Outro' };

interface Review {
  kind: DocumentKind;
  name: string;
  creditor: string;
  amount: string;
  installments: string;
  rate: string;
  system: AmortizationSystem;
  firstDue: string;
  uncertain: string[];
}

@Component({
  selector: 'app-documents',
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, IonSpinner, FormsModule],
  template: `
    <ion-header><ion-toolbar><ion-title>Documentos</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page">
        @if (household.canEdit() && !review()) {
          <button class="drop" (click)="pick()" [disabled]="busy()">
            @if (busy()) { <ion-spinner name="crescent" /> <span>{{ progress() }}</span> }
            @else {
              <ion-icon name="cloud-upload-outline" aria-hidden="true" />
              <b>Anexar fatura, boleto ou contrato</b>
              <span class="muted">PDF ou foto. O texto é lido no seu aparelho; só o texto vai para a IA identificar os valores.</span>
            }
          </button>
          <input #file type="file" accept="application/pdf,image/jpeg,image/png,image/webp" hidden (change)="onFile($event)" />
        }

        @if (review(); as r) {
          <section class="card">
            <div class="row" style="border:0;padding-top:0">
              <h2 style="margin:0">Revisar lançamento</h2>
              <span class="pill gold">{{ fileName() }}</span>
            </div>
            <p class="muted" style="margin:0 0 12px">Confira os dados. Campos em âmbar a IA não conseguiu confirmar.</p>
            <div class="form">
              <label class="full">Tipo
                <select id="r-kind" [(ngModel)]="r.kind">
                  <option value="contract">Contrato / financiamento</option>
                  <option value="invoice">Fatura de cartão</option>
                  <option value="boleto">Boleto</option>
                  <option value="other">Outro</option>
                </select>
              </label>
              <label class="full">Nome<input id="r-name" type="text" [(ngModel)]="r.name" maxlength="120" /></label>
              <label class="full" [class.unsure]="unsure('creditor')">Credor<input id="r-cred" type="text" [(ngModel)]="r.creditor" /></label>
              <label [class.unsure]="unsure('amountCents')">{{ r.kind === 'contract' ? 'Valor financiado' : 'Valor' }} (R$)<input id="r-val" inputmode="decimal" [(ngModel)]="r.amount" /></label>
              <label [class.unsure]="unsure('firstDue')">{{ r.kind === 'contract' ? '1º vencimento' : 'Vencimento' }}<input id="r-due" type="date" [(ngModel)]="r.firstDue" /></label>
              @if (r.kind === 'contract') {
                <label [class.unsure]="unsure('installments')">Parcelas<input id="r-n" inputmode="numeric" [(ngModel)]="r.installments" /></label>
                <label [class.unsure]="unsure('monthlyRate')">Juros (% a.m.)<input id="r-rate" inputmode="decimal" [(ngModel)]="r.rate" /></label>
                <label class="full" [class.unsure]="unsure('system')">Sistema
                  <select id="r-sys" [(ngModel)]="r.system"><option value="price">Price (parcela fixa)</option><option value="sac">SAC (parcela cai)</option></select>
                </label>
              }
            </div>
            @if (preview(r); as p) {
              <div class="card" style="margin-top:12px;background:var(--cofre-surface-2)">
                <div class="row"><span class="muted">Parcela</span><span class="num">{{ brl(p.payment) }}</span></div>
                <div class="row"><span class="muted">Juros totais</span><span class="num down">{{ brl(p.interest) }}</span></div>
              </div>
            }
            @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
            <div class="actions">
              <button class="btn primary" (click)="confirm(r)" [disabled]="busy()">
                {{ r.kind === 'contract' ? 'Criar dívida e parcelas' : 'Criar lançamento' }}
              </button>
              <button class="btn" (click)="storeOnly(r)" [disabled]="busy()">Só guardar o arquivo</button>
              <button class="btn" (click)="cancel()" [disabled]="busy()">Descartar</button>
            </div>
          </section>
        }

        @if (!review() && error()) { <p class="error" role="alert">{{ error() }}</p> }
        @if (notice()) { <p class="muted">{{ notice() }}</p> }

        <section class="card">
          <h2>Arquivos do lar</h2>
          @for (d of docs.documents(); track d.id) {
            <div class="row">
              <div class="l">
                <div class="dot gold"><ion-icon name="document-text-outline" aria-hidden="true" /></div>
                <div>{{ d.file_name || 'documento' }}<div class="muted">{{ kindLabel[d.kind] }} · {{ date(d.created_at) }}</div></div>
              </div>
              <div style="display:flex;gap:6px">
                <button class="btn" style="padding:6px 10px" (click)="open(d)" aria-label="Abrir"><ion-icon name="open-outline" /></button>
                @if (household.canEdit()) { <button class="btn danger" style="padding:6px 10px" (click)="remove(d)" aria-label="Apagar"><ion-icon name="trash-outline" /></button> }
              </div>
            </div>
          } @empty {
            <p class="muted" style="margin:0">Nenhum arquivo ainda.</p>
          }
        </section>
      </div>
    </ion-content>
  `,
  styles: `
    .drop { width: 100%; border: 1.5px dashed var(--cofre-line); border-radius: 16px; background: none; color: var(--cofre-text); padding: 24px 16px; display: flex; flex-direction: column; gap: 6px; align-items: center; text-align: center; font: inherit; cursor: pointer; }
    .drop ion-icon { font-size: 34px; color: var(--cofre-gold); }
    .unsure input, .unsure select { border-color: var(--cofre-warn) !important; }
    .unsure { color: var(--cofre-warn) !important; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .actions .btn { padding: 10px 12px; }
  `,
})
export class DocumentsPage implements ViewWillEnter {
  readonly docs = inject(DocumentsService);
  readonly household = inject(HouseholdService);
  private debts = inject(DebtsService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private fileInput = viewChild<ElementRef<HTMLInputElement>>('file');
  readonly brl = formatBRL;
  readonly kindLabel = KIND_LABEL;

  readonly busy = signal(false);
  readonly progress = signal('');
  readonly error = signal('');
  readonly notice = signal('');
  readonly review = signal<Review | null>(null);
  readonly fileName = signal('');
  private file: File | null = null;

  ionViewWillEnter(): void {
    void this.docs.load().catch(() => this.error.set('Não deu para carregar os documentos.'));
  }

  pick(): void {
    this.error.set('');
    this.notice.set('');
    this.fileInput()?.nativeElement.click();
  }

  async onFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.busy.set(true);
    try {
      this.docs.validate(file);
      if (await this.docs.findDuplicate(file)) throw new DocumentError('Este documento já foi anexado antes.');
      const text = await this.docs.readText(file, (m) => this.progress.set(m));
      if (text.length < 20) throw new DocumentError('Não consegui ler texto no arquivo. Tente uma foto mais nítida e reta.');
      this.progress.set('A IA está identificando os valores…');
      const doc = await this.docs.extract(text);
      this.file = file;
      this.fileName.set(file.name.slice(0, 28));
      this.review.set(this.toReview(doc));
    } catch (e) {
      this.error.set(e instanceof DocumentError ? e.message : 'Não deu para processar o arquivo.');
      console.error(e);
    } finally {
      this.busy.set(false);
      this.progress.set('');
    }
  }

  private toReview(d: ExtractedDocument): Review {
    const name = d.description || (d.creditor ? `${KIND_LABEL[d.kind]} ${d.creditor}` : KIND_LABEL[d.kind]);
    return {
      kind: d.kind === 'other' && d.installments && d.installments > 1 ? 'contract' : d.kind,
      name,
      creditor: d.creditor ?? '',
      amount: d.amountCents ? formatBRL(d.amountCents).replace('R$ ', '') : '',
      installments: d.installments ? String(d.installments) : d.kind === 'contract' ? '' : '1',
      rate: d.monthlyRate !== null ? formatPercent(d.monthlyRate).replace('%', '') : '',
      system: d.system ?? 'price',
      firstDue: d.firstDue ?? '',
      uncertain: d.uncertain,
    };
  }

  unsure(field: string): boolean {
    return this.review()?.uncertain.includes(field) ?? false;
  }

  /** Converte a revisão nos campos do motor; contas avulsas (fatura/boleto) viram 1 parcela sem juros. */
  private parsed(r: Review) {
    const principalCents = parseBRL(r.amount);
    const contract = r.kind === 'contract';
    const installments = contract ? Number(r.installments) : 1;
    const monthlyRate = contract ? parsePercent(r.rate || '0') : 0;
    if (!r.name.trim()) return 'Dê um nome ao lançamento.';
    if (!principalCents || principalCents <= 0) return 'Informe o valor.';
    if (!Number.isInteger(installments) || installments < 1 || installments > 600) return 'Parcelas entre 1 e 600.';
    if (monthlyRate === null || monthlyRate > 1) return 'Juros inválidos.';
    if (!r.firstDue) return 'Informe o vencimento.';
    return { principalCents, installments, monthlyRate };
  }

  preview(r: Review) {
    if (r.kind !== 'contract') return null;
    const p = this.parsed(r);
    if (typeof p === 'string') return null;
    const rows = schedule(r.system, p.principalCents, p.monthlyRate, p.installments);
    return { payment: rows[0].payment, interest: totalInterest(rows) };
  }

  async confirm(r: Review): Promise<void> {
    const p = this.parsed(r);
    if (typeof p === 'string') return this.error.set(p);
    if (!this.file) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const debtId = await this.debts.create({
        ...p,
        alreadyPaid: 0,
        name: r.name.trim(),
        creditor: r.creditor.trim(),
        icon: suggestIcon(`${r.name} ${r.creditor}`) ?? (r.kind === 'invoice' ? 'card-outline' : 'receipt-outline'),
        system: r.system,
        firstDue: r.firstDue,
        private: false,
      });
      await this.docs.store(this.file, r.kind, debtId);
      this.reset();
      await this.router.navigateByUrl(`/dividas/${debtId}`);
    } catch (e) {
      this.error.set(e instanceof DocumentError ? e.message : 'Não deu para salvar. Tente de novo.');
      console.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  async storeOnly(r: Review): Promise<void> {
    if (!this.file) return;
    this.busy.set(true);
    try {
      await this.docs.store(this.file, r.kind, null);
      this.reset();
      this.notice.set('Arquivo guardado.');
    } catch (e) {
      this.error.set(e instanceof DocumentError ? e.message : 'Não deu para guardar o arquivo.');
    } finally {
      this.busy.set(false);
    }
  }

  cancel(): void {
    this.reset();
  }

  private reset(): void {
    this.review.set(null);
    this.file = null;
    this.error.set('');
  }

  async open(d: DocumentRow): Promise<void> {
    try {
      window.open(await this.docs.openUrl(d), '_blank');
    } catch {
      this.error.set('Não deu para abrir o arquivo.');
    }
  }

  async remove(d: DocumentRow): Promise<void> {
    if (!(await this.auth.confirmSensitive('Confirme para apagar o documento'))) return;
    try {
      await this.docs.remove(d);
    } catch {
      this.error.set('Não deu para apagar.');
    }
  }

  date(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR');
  }
}
