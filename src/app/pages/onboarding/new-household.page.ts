import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { HouseholdService } from '../../core/data/household.service';

@Component({
  selector: 'app-new-household',
  imports: [IonContent, FormsModule],
  template: `
    <ion-content>
      <main class="page" style="min-height:100%;justify-content:center">
        <h1 style="margin:0">Crie seu lar</h1>
        <p class="muted" style="margin:0">
          O lar reúne dívidas, empréstimos e investimentos. Depois você pode convidar alguém, como sua esposa, para acompanhar junto.
        </p>
        <label class="field">Nome do lar
          <input class="field" id="hh-name" [(ngModel)]="name" maxlength="80" placeholder="Casa" autofocus />
        </label>
        <button class="btn primary block" (click)="create()" [disabled]="busy()">Criar lar</button>
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      </main>
    </ion-content>
  `,
})
export class NewHouseholdPage {
  private households = inject(HouseholdService);
  private router = inject(Router);
  name = 'Casa';
  readonly busy = signal(false);
  readonly error = signal('');

  async create(): Promise<void> {
    const name = this.name.trim();
    if (!name) return this.error.set('Dê um nome ao lar.');
    this.busy.set(true);
    try {
      await this.households.create(name);
      await this.router.navigateByUrl('/inicio', { replaceUrl: true });
    } catch (e) {
      console.error(e);
      this.error.set('Não deu para criar o lar. Tente de novo.');
    } finally {
      this.busy.set(false);
    }
  }
}
