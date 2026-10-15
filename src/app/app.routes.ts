import { Routes } from '@angular/router';
import { guestOnly, requireSession } from './core/auth/guards';

export const routes: Routes = [
  { path: 'login', canActivate: [guestOnly], loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage) },
  { path: 'bloqueado', loadComponent: () => import('./pages/lock/lock.page').then((m) => m.LockPage) },
  {
    path: '',
    canActivate: [requireSession],
    loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
];
