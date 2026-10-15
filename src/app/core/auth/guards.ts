import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const requireSession: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.signedIn()) return router.parseUrl('/login');
  if (auth.locked()) return router.parseUrl('/bloqueado');
  return true;
};

export const guestOnly: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.signedIn() ? inject(Router).parseUrl('/') : true;
};
