import { inject } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom, take } from 'rxjs';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  const user = await firstValueFrom(authState(auth).pipe(take(1)));

  return user
    ? true
    : router.createUrlTree(['/account/user/login'], {
        queryParams: { returnUrl: state.url },
      });
};
