import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';

@Component({
  selector: 'app-soon',
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon],
  template: `
    <ion-header><ion-toolbar><ion-title>{{ data['title'] }}</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page"><div class="card empty">
        <ion-icon name="sparkles-outline" aria-hidden="true"></ion-icon>
        <p class="muted" style="margin:0">{{ data['text'] }}</p>
      </div></div>
    </ion-content>
  `,
})
export class SoonPage {
  readonly data = inject(ActivatedRoute).snapshot.data;
}
