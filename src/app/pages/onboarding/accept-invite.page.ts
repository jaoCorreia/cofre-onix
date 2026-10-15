import { Component, OnInit, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { HouseholdService } from '../../core/data/household.service';

@Component({
  selector: 'app-accept-invite',
  imports: [IonContent],
  template: `
    <ion-content>
      <main class="page empty" style="min-height:100%;justify-content:center">
        @if (error()) {
          <h1>Convite não aceito</h1>
          <p class="muted">{{ error() }}</p>
          <button class="btn block" (click)="home()">Ir para o início</button>
        } @else {
          <h1>Entrando no lar…</h1>
        }
      </main>
    </ion-content>
  `,
})
export class AcceptInvitePage implements OnInit {
  readonly token = input.required<string>();
  private households = inject(HouseholdService);
  private router = inject(Router);
  readonly error = signal('');

  async ngOnInit(): Promise<void> {
    try {
      await this.households.acceptInvite(this.token());
      await this.router.navigateByUrl('/inicio', { replaceUrl: true });
    } catch (e) {
      const msg = String((e as { message?: string }).message ?? '');
      this.error.set(
        msg.includes('outro e-mail')
          ? 'Este convite foi enviado para outro e-mail. Entre com a conta Google convidada.'
          : 'O convite é inválido, já foi usado ou expirou. Peça um novo.',
      );
    }
  }

  home(): void {
    void this.router.navigateByUrl('/', { replaceUrl: true });
  }
}
