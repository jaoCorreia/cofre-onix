import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HouseholdService } from '../data/household.service';
import { AuthService } from './auth.service';

export const requireSession: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.signedIn()) {
    // Guarda o destino (ex.: link de convite) para voltar depois do login.
    sessionStorage.setItem('cofre.after_login', state.url);
    return router.parseUrl('/login');
  }
  if (auth.locked()) return router.parseUrl('/bloqueado');
  return true;
};

/** Sem lar ainda: manda criar o primeiro. */
export const requireHousehold: CanActivateFn = async () => {
  const households = inject(HouseholdService);
  const router = inject(Router);
  if (households.households().length === 0) await households.load();
  return households.current() ? true : router.parseUrl('/lar/novo');
};

export const guestOnly: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.signedIn() ? inject(Router).parseUrl('/') : true;
};
