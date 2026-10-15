import { Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      { path: 'inicio', loadComponent: () => import('../pages/home/home.page').then((m) => m.HomePage) },
      { path: 'dividas', loadComponent: () => import('../pages/debts/debts.page').then((m) => m.DebtsPage) },
      { path: 'dividas/nova', loadComponent: () => import('../pages/debts/debt-new.page').then((m) => m.DebtNewPage) },
      { path: 'dividas/:id', loadComponent: () => import('../pages/debts/debt-detail.page').then((m) => m.DebtDetailPage) },
      { path: 'lar', loadComponent: () => import('../pages/household/household.page').then((m) => m.HouseholdPage) },
      { path: 'ia', loadComponent: () => import('../pages/assistant/assistant.page').then((m) => m.AssistantPage) },
      { path: 'investir', data: { title: 'Investimentos', text: 'Carteira e reserva de emergência chegam em breve.' }, loadComponent: () => import('../pages/soon/soon.page').then((m) => m.SoonPage) },
      { path: 'docs', data: { title: 'Documentos', text: 'Anexar faturas e contratos chega em breve.' }, loadComponent: () => import('../pages/soon/soon.page').then((m) => m.SoonPage) },
      { path: '', redirectTo: 'inicio', pathMatch: 'full' },
    ],
  },
];
