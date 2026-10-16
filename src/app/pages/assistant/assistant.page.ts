import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonFooter, IonHeader, IonIcon, IonSegment, IonSegmentButton, IonLabel, IonSpinner, IonTitle, IonToolbar, ViewWillEnter } from '@ionic/angular';
import { evaluateFormula, FORMULA_VARIABLES, validateFormula, type ChartSpec } from '../../../domain/ai-tools';
import { formatBRL } from '../../../domain/money';
import { renderMarkdown } from '../../../domain/markdown';
import { ChartComponent } from '../../components/chart.component';
import { AiService, Attachment, ChatMessage, SavedItem } from '../../core/data/ai.service';
import { FinanceService } from '../../core/data/finance.service';
import { HouseholdService } from '../../core/data/household.service';

const SUGGESTIONS = [
  'Vale amortizar alguma dívida agora?',
  'Mostre um gráfico do saldo de cada dívida',
  'Quanto vou pagar de juros ainda?',
  'Crie uma fórmula do % da dívida que é juros',
];

@Component({
  selector: 'app-assistant',
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonFooter, IonIcon, IonSpinner, IonSegment, IonSegmentButton, IonLabel, FormsModule, ChartComponent],
  template: `
    <ion-header>
      <ion-toolbar><ion-title>Assistente</ion-title></ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="tab()" (ionChange)="setTab($event)">
          <ion-segment-button value="chat"><ion-label>Conversa</ion-label></ion-segment-button>
          <ion-segment-button value="saved"><ion-label>Salvos</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content #content>
      @if (tab() === 'chat') {
        <div class="page chat">
          @if (messages().length === 0) {
            <div class="card">
              <p class="muted" style="margin:0 0 10px">Pergunte sobre suas dívidas. Eu consulto seus dados, simulo amortizações e monto gráficos e fórmulas.</p>
              <div class="chips">
                @for (s of suggestions; track s) { <button class="chip" (click)="ask(s)">{{ s }}</button> }
              </div>
            </div>
          }

          @for (m of messages(); track $index) {
            <div class="msg" [class.me]="m.role === 'user'">
              @if (m.role === 'assistant') { <span class="tag"><ion-icon name="sparkles-outline" aria-hidden="true" /> Assistente</span> }
              @if (m.content) {
                @if (m.role === 'assistant') { <div class="md" [innerHTML]="md(m.content)"></div> }
                @else { <p>{{ m.content }}</p> }
              }
              @for (a of m.attachments ?? []; track $index) {
                <div class="att">
                  @switch (a.type) {
                    @case ('chart') {
                      <app-chart [spec]="asChart(a)" />
                      @if (household.canEdit()) { <button class="btn" (click)="save(a)">Salvar no painel</button> }
                    }
                    @case ('formula') {
                      <div class="muted">{{ asFormula(a).name }}</div>
                      <code class="num">{{ asFormula(a).expression }}</code>
                      <div class="num big-sm">= {{ round(asFormula(a).value) }}</div>
                      @if (household.canEdit()) { <button class="btn" (click)="save(a)">Salvar fórmula</button> }
                    }
                    @case ('simulation') {
                      <div class="muted">{{ asSim(a).debt }} · extra de {{ brl(asSim(a).extra) }}</div>
                      <div class="sim">
                        <div><span class="muted">Reduzir prazo</span><b class="num up">{{ brl(asSim(a).reduceTerm.juros_economizados) }}</b></div>
                        <div><span class="muted">Reduzir parcela</span><b class="num up">{{ brl(asSim(a).reducePayment.juros_economizados) }}</b></div>
                      </div>
                    }
                  }
                </div>
              }
            </div>
          }

          @if (busy()) { <div class="msg"><ion-spinner name="dots" /></div> }
          @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
          @if (notice()) { <p class="muted">{{ notice() }}</p> }
          <p class="muted disclaimer">Respostas geradas por IA (DeepSeek) com base nos seus dados. Simulações são educativas, não recomendação de investimento.</p>
        </div>
      } @else {
        <div class="page">
          @if (household.canEdit()) {
            @if (newFormula()) {
              <section class="card">
                <h2><ion-icon name="calculator-outline" class="gold" aria-hidden="true" /> Nova fórmula</h2>
                <div class="form">
                  <label class="full">Nome<input id="f-name" type="text" [(ngModel)]="formulaName" maxlength="80" placeholder="% da dívida que é juros" /></label>
                  <label class="full">Expressão<input id="f-expr" type="text" [(ngModel)]="formulaExpr" (ngModelChange)="checkFormula()" maxlength="200" placeholder="juros_restantes / divida_total * 100" autocapitalize="off" spellcheck="false" /></label>
                </div>
                @if (formulaCheck(); as c) {
                  <p [class.error]="!c.ok" [class.muted]="c.ok" style="margin:8px 0 0">{{ c.ok ? 'Resultado agora: ' + round(c.value) : c.error }}</p>
                }
                <details style="margin-top:8px">
                  <summary class="muted">Variáveis e operações disponíveis</summary>
                  <ul class="vars">
                    @for (v of variables; track v[0]) { <li><button class="chip-sm" (click)="insertVar(v[0])">{{ v[0] }}</button> {{ v[1] }}</li> }
                  </ul>
                  <p class="muted" style="font-size:12px">Operações: + − * / ^ e parênteses. Funções: min(a; b), max(a; b), abs(x), round(x; casas).</p>
                </details>
                <div style="display:flex;gap:8px;margin-top:10px">
                  <button class="btn primary" (click)="saveFormula()">Salvar</button>
                  <button class="btn" (click)="newFormula.set(false)">Cancelar</button>
                </div>
              </section>
            } @else {
              <button class="btn block" (click)="newFormula.set(true)"><ion-icon name="calculator-outline" aria-hidden="true" /> Criar fórmula</button>
            }
          }
          @for (s of saved(); track s.id) {
            <section class="card">
              @if (s.kind === 'chart') { <app-chart [spec]="savedChart(s)" /> }
              @else {
                <div class="muted">{{ s.title }}</div>
                <code class="num">{{ savedExpr(s) }}</code>
                <div class="num big-sm">= {{ formulaValue(savedExpr(s)) }}</div>
              }
              @if (household.canEdit()) { <button class="btn danger" style="margin-top:8px" (click)="remove(s)">Remover</button> }
            </section>
          } @empty {
            <section class="card empty">
              <ion-icon name="sparkles-outline" aria-hidden="true" />
              <p class="muted" style="margin:0">Gráficos e fórmulas que você salvar da conversa aparecem aqui para todo o lar.</p>
            </section>
          }
        </div>
      }
    </ion-content>

    @if (tab() === 'chat') {
      <ion-footer>
        <form class="composer" (submit)="$event.preventDefault(); ask(input)">
          <input id="chat-input" [(ngModel)]="input" name="q" placeholder="Pergunte algo sobre suas finanças" maxlength="2000" autocomplete="off" />
          <button class="btn primary" type="submit" [disabled]="busy()" aria-label="Enviar"><ion-icon name="arrow-forward-outline" /></button>
        </form>
      </ion-footer>
    }
  `,
  styles: `
    .chat { padding-bottom: 8px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { font: inherit; font-size: 13px; padding: 8px 12px; border-radius: 99px; border: 1px solid var(--cofre-line); background: var(--cofre-surface-2); color: var(--cofre-text); cursor: pointer; text-align: left; }
    .msg { max-width: 92%; padding: 10px 12px; border-radius: 14px; background: var(--cofre-surface); border: 1px solid var(--cofre-line); align-self: flex-start; }
    .msg.me { align-self: flex-end; background: var(--cofre-surface-2); border-color: transparent; }
    .msg p { margin: 0; white-space: pre-wrap; line-height: 1.5; }
    .tag { display: flex; gap: 4px; align-items: center; font-size: 11px; color: var(--cofre-gold); margin-bottom: 4px; }
    .att { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
    .att .btn { align-self: flex-start; padding: 8px 12px; }
    code { display: block; background: var(--cofre-surface-2); padding: 8px; border-radius: 8px; font-size: 13px; overflow-x: auto; }
    .big-sm { font-size: 20px; }
    .sim { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .sim > div { background: var(--cofre-surface-2); border-radius: 10px; padding: 8px; display: flex; flex-direction: column; }
    .composer { display: flex; gap: 8px; padding: 10px 16px; background: var(--cofre-surface); border-top: 1px solid var(--cofre-line); }
    .composer input { flex: 1; min-width: 0; font: inherit; background: var(--cofre-surface-2); border: 1px solid var(--cofre-line); color: var(--cofre-text); border-radius: 12px; padding: 10px 12px; }
    .disclaimer { font-size: 11px; text-align: center; }
    .vars { list-style: none; padding: 0; margin: 8px 0; display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--cofre-muted); }
    .chip-sm { font-family: var(--cofre-num); font-size: 12px; padding: 3px 8px; border-radius: 8px; border: 1px solid var(--cofre-line); background: var(--cofre-surface-2); color: var(--cofre-gold); cursor: pointer; }
  `,
})
export class AssistantPage implements ViewWillEnter {
  private ai = inject(AiService);
  readonly household = inject(HouseholdService);
  private finance = inject(FinanceService);
  private content = viewChild<ElementRef>('content');
  readonly suggestions = SUGGESTIONS;
  readonly brl = (reais: number) => formatBRL(Math.round(reais * 100));

  readonly tab = signal<'chat' | 'saved'>('chat');
  readonly messages = signal<ChatMessage[]>([]);
  readonly saved = signal<SavedItem[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  input = '';

  readonly variables = Object.entries(FORMULA_VARIABLES);
  readonly newFormula = signal(false);
  readonly formulaCheck = signal<{ ok: true; value: number } | { ok: false; error: string } | null>(null);
  formulaName = '';
  formulaExpr = '';

  ionViewWillEnter(): void {
    void this.finance.loadAll().catch(() => undefined);
    if (this.tab() === 'saved') void this.loadSaved();
  }

  checkFormula(): void {
    const expr = this.formulaExpr.trim();
    if (!expr) return this.formulaCheck.set(null);
    const v = validateFormula(expr, Object.keys(FORMULA_VARIABLES));
    if (!v.ok) return this.formulaCheck.set({ ok: false, error: v.error });
    try {
      this.formulaCheck.set({ ok: true, value: evaluateFormula(expr, this.finance.formulaScope()) });
    } catch (e) {
      this.formulaCheck.set({ ok: false, error: (e as Error).message });
    }
  }

  insertVar(name: string): void {
    this.formulaExpr = `${this.formulaExpr}${this.formulaExpr && !/\s$/.test(this.formulaExpr) ? ' ' : ''}${name}`;
    this.checkFormula();
  }

  async saveFormula(): Promise<void> {
    this.checkFormula();
    const c = this.formulaCheck();
    if (!this.formulaName.trim()) return this.error.set('Dê um nome à fórmula.');
    if (!c || !c.ok) return this.error.set('Corrija a fórmula antes de salvar.');
    this.error.set('');
    try {
      await this.ai.save('formula', this.formulaName.trim(), { expression: this.formulaExpr.trim() });
      this.newFormula.set(false);
      this.formulaName = this.formulaExpr = '';
      this.formulaCheck.set(null);
      await this.loadSaved();
    } catch {
      this.error.set('Não deu para salvar a fórmula.');
    }
  }

  /** Valor atual de uma fórmula salva, recalculado com os dados de agora. */
  formulaValue(expr: string): string {
    try {
      return String(this.round(evaluateFormula(expr, this.finance.formulaScope())));
    } catch {
      return '—';
    }
  }

  setTab(ev: CustomEvent): void {
    this.tab.set((ev.detail as { value: 'chat' | 'saved' }).value);
    if (this.tab() === 'saved') void this.loadSaved();
  }

  async ask(text: string): Promise<void> {
    const q = text.trim();
    if (!q || this.busy()) return;
    this.input = '';
    this.error.set('');
    this.notice.set('');
    this.messages.update((m) => [...m, { role: 'user', content: q }]);
    this.busy.set(true);
    this.scroll();
    try {
      const reply = await this.ai.send(this.messages());
      this.messages.update((m) => [...m, reply]);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
      this.scroll();
    }
  }

  async save(a: Attachment): Promise<void> {
    try {
      if (a.type === 'chart') await this.ai.save('chart', a.chart.title, a.chart);
      else if (a.type === 'formula') await this.ai.save('formula', a.name, { expression: a.expression });
      this.notice.set('Salvo no painel do lar.');
    } catch {
      this.error.set('Não deu para salvar.');
    }
  }

  async loadSaved(): Promise<void> {
    try {
      this.saved.set(await this.ai.saved());
    } catch {
      this.error.set('Não deu para carregar os itens salvos.');
    }
  }

  async remove(s: SavedItem): Promise<void> {
    await this.ai.remove(s.id);
    await this.loadSaved();
  }

  asChart = (a: Attachment) => (a as Extract<Attachment, { type: 'chart' }>).chart;
  asFormula = (a: Attachment) => a as Extract<Attachment, { type: 'formula' }>;
  asSim = (a: Attachment) => a as Extract<Attachment, { type: 'simulation' }>;
  savedChart = (s: SavedItem) => s.spec as ChartSpec;
  savedExpr = (s: SavedItem) => (s.spec as { expression: string }).expression;
  round = (v: number) => Math.round(v * 100) / 100;
  /** HTML gerado com todo texto escapado (ver domain/markdown.ts); o Angular ainda sanitiza. */
  md = (text: string) => renderMarkdown(text);

  private scroll(): void {
    setTimeout(() => this.content()?.nativeElement.scrollToBottom?.(250), 50);
  }
}
