import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn, Router } from '@angular/router';
import { signOut } from 'firebase/auth';
import { AUTH, currentUser } from '../../core/firebase';
import { SessionService } from '../session.service';

/** Landing and login pages: somebody already signed in goes straight to the app. */
export const redirectLoggedInToHome: CanActivateFn = async () => {
  const router = inject(Router);
  const user = await currentUser(inject(AUTH));
  return user ? router.createUrlTree(['home']) : true;
};

/** The app itself: anonymous visitors go back to the landing page. */
export const requireLogin: CanActivateFn = async () => {
  const router = inject(Router);
  const user = await currentUser(inject(AUTH));
  return user ? true : router.createUrlTree(['']);
};

/** Loads the signed-in user's document (and keeps it in sync) before showing the app. */
export const startSession: CanActivateFn = async () => {
  const router = inject(Router);
  const auth = inject(AUTH);
  const ready = await inject(SessionService).start();
  if (ready) return true;
  // No usable account behind the session (document missing or unreadable): sign out,
  // otherwise the landing page would send the visitor straight back here.
  await signOut(auth).catch(() => undefined);
  return router.createUrlTree(['']);
};

export const stopSession: CanDeactivateFn<unknown> = () => {
  inject(SessionService).stop();
  return true;
};
