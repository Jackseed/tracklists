import { inject, InjectionToken } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { Auth, connectAuthEmulator, getAuth, indexedDBLocalPersistence, initializeAuth, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { connectFirestoreEmulator, Firestore, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, Functions, getFunctions } from 'firebase/functions';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { isNativeApp } from './native';

/** Ports of `firebase.json`. */
const EMULATOR_HOST = '127.0.0.1';
const EMULATOR_PORTS = { auth: 9099, firestore: 8080, functions: 5001 };

export const FIREBASE_APP = new InjectionToken<FirebaseApp>('Firebase app', {
  providedIn: 'root',
  factory: () => initializeApp(environment.firebaseConfig),
});

export const AUTH = new InjectionToken<Auth>('Firebase Auth', {
  providedIn: 'root',
  factory: () => {
    // In the app's WebView, getAuth() can hang while it sets up the popup/redirect
    // sign-in helpers, which need a web origin; the app only signs in with a custom token.
    const app = inject(FIREBASE_APP);
    const auth = isNativeApp ? initializeAuth(app, { persistence: indexedDBLocalPersistence }) : getAuth(app);
    if (environment.useEmulators) {
      connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_PORTS.auth}`, { disableWarnings: true });
    }
    return auth;
  },
});

export const FIRESTORE = new InjectionToken<Firestore>('Firestore', {
  providedIn: 'root',
  factory: () => {
    const firestore = getFirestore(inject(FIREBASE_APP));
    if (environment.useEmulators) connectFirestoreEmulator(firestore, EMULATOR_HOST, EMULATOR_PORTS.firestore);
    return firestore;
  },
});

export const FUNCTIONS = new InjectionToken<Functions>('Cloud Functions', {
  providedIn: 'root',
  factory: () => {
    const functions = getFunctions(inject(FIREBASE_APP), environment.functionsRegion);
    if (environment.useEmulators) connectFunctionsEmulator(functions, EMULATOR_HOST, EMULATOR_PORTS.functions);
    return functions;
  },
});

/** Emits the signed-in Firebase user, or `null`, on every change. */
export function authState(auth: Auth): Observable<FirebaseUser | null> {
  return new Observable((subscriber) =>
    onAuthStateChanged(
      auth,
      (user) => subscriber.next(user),
      (error) => subscriber.error(error)
    )
  );
}

/** Resolves once Firebase knows whether somebody is signed in. */
export function currentUser(auth: Auth): Promise<FirebaseUser | null> {
  return auth.authStateReady().then(() => auth.currentUser);
}

/** Message of a failed callable function, without the HTTP status Firebase appends to it ("... [400]"). */
export function callableErrorMessage(error: unknown): string | null {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message ? message.replace(/\s*\[\d{3}\]$/, '') : null;
}
