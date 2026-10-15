import { Routes } from '@angular/router';
import { guestOnly, requireHousehold, requireSession } from './core/auth/guards';

export const routes: Routes = [
  { path: 'login', canActivate: [guestOnly], loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage) },
  { path: 'bloqueado', loadComponent: () => import('./pages/lock/lock.page').then((m) => m.LockPage) },
  {
    path: 'lar/novo',
    canActivate: [requireSession],
    loadComponent: () => import('./pages/onboarding/new-household.page').then((m) => m.NewHouseholdPage),
  },
  {
    path: 'convite/:token',
    canActivate: [requireSession],
    loadComponent: () => import('./pages/onboarding/accept-invite.page').then((m) => m.AcceptInvitePage),
  },
  {
    path: '',
    canActivate: [requireSession, requireHousehold],
    loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
];
