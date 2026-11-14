import { Injectable } from '@angular/core';
import localforage from 'localforage';

localforage.config({
  driver: localforage.INDEXEDDB,
  name: 'Tracklists',
  version: 1.0,
  storeName: 'tracklists-storage',
});

/** Browser storage (IndexedDB) used to cache the library between visits. */
@Injectable({
  providedIn: 'root',
})
export class LocalforageService {
  getItem<T>(key: string): Promise<T | null> {
    return localforage.getItem<T>(key);
  }

  setItem<T>(key: string, value: T): Promise<T> {
    return localforage.setItem(key, value);
  }

  removeItem(key: string): Promise<void> {
    return localforage.removeItem(key);
  }

  clear(): Promise<void> {
    return localforage.clear();
  }
}
