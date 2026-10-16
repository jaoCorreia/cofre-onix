import { Component, inject, input, model, signal } from '@angular/core';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { suggestIcon } from '../../domain/icon-catalog';
import { ALL_ICONS } from '../core/icons';
import { AiService } from '../core/data/ai.service';

/** Grade de ícones com "Sugerir": primeiro por palavras-chave (offline), depois pela IA. */
@Component({
  selector: 'app-icon-picker',
  imports: [IonIcon, IonSpinner],
  template: `
    <div class="head">
      <span class="muted">Ícone</span>
      <button type="button" class="link" (click)="suggest()" [disabled]="busy()">
        @if (busy()) { <ion-spinner name="dots" /> } @else { <ion-icon name="sparkles-outline" aria-hidden="true" /> Sugerir }
      </button>
    </div>
    <div class="grid" role="radiogroup" aria-label="Ícone">
      @for (i of visible(); track i) {
        <button type="button" class="tile" role="radio" [attr.aria-checked]="value() === i" [attr.aria-label]="i" (click)="value.set(i)"
                [class.on]="value() === i">
          <ion-icon [name]="i" aria-hidden="true" />
        </button>
      }
    </div>
    @if (!expanded()) { <button type="button" class="link more" (click)="expanded.set(true)">Ver todos os ícones</button> }
    @if (note()) { <p class="muted note">{{ note() }}</p> }
  `,
  styles: `
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(52px, 1fr)); gap: 8px; }
    .tile { padding: 12px 0; font-size: 20px; }
    .tile.on { border-color: var(--cofre-gold); color: var(--cofre-gold); }
    .link { background: none; border: 0; color: var(--cofre-gold); font: inherit; font-size: 13px; display: inline-flex; gap: 4px; align-items: center; cursor: pointer; padding: 4px; }
    .more { margin-top: 6px; }
    .note { font-size: 12px; margin: 6px 0 0; }
  `,
})
export class IconPickerComponent {
  private ai = inject(AiService);
  readonly value = model.required<string>();
  /** Texto usado para sugerir (nome, credor, pessoa). */
  readonly hint = input('');
  readonly preferred = input<string[]>([]);
  readonly expanded = signal(false);
  readonly busy = signal(false);
  readonly note = signal('');

  visible(): string[] {
    const first = this.preferred().length ? this.preferred() : ALL_ICONS.slice(0, 8);
    const list = this.expanded() ? [...first, ...ALL_ICONS.filter((i) => !first.includes(i))] : first;
    return list.includes(this.value()) ? list : [this.value(), ...list];
  }

  async suggest(): Promise<void> {
    const text = this.hint().trim();
    if (!text) return this.note.set('Preencha o nome primeiro.');
    this.note.set('');
    const local = suggestIcon(text);
    if (local) return this.value.set(local);
    this.busy.set(true);
    try {
      this.value.set(await this.ai.suggestIcon(text));
    } catch {
      this.note.set('Não encontrei um ícone. Escolha um da lista.');
    } finally {
      this.busy.set(false);
    }
  }
}
