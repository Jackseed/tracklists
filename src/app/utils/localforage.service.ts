import { Injectable } from '@angular/core';
import * as localforage from 'localforage';

localforage.config({
  driver: localforage.INDEXEDDB,
  name: 'Tracklists',
  version: 1.0,
  storeName: 'tracklists-storage',
});

@Injectable({
  providedIn: 'root',
})
export class LocalforageService {
  constructor() {}

  getItem(key: string) {
    return localforage.getItem(key);
  }

  setItem(key: string, value: any) {
    return localforage.setItem(key, value);
  }

  removeItem(key: string) {
    return localforage.removeItem(key);
  }
}
