// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  spotify: {
    apiUrl: 'https://api.spotify.com/v1/me',
    clientId: 'ef247ad2b6a6480ab274d9f32b27dfe9',
    clientSecret: '5c6e323a217c4a908670b26b8d0a6edc',
    responseType: 'token',
    redirectURI: 'http://localhost:4200/home',
  },
  firebaseConfig: {
    apiKey: "AIzaSyDU6A1HcHI7HM2Q2m7ONn3JEvI1f9Dtp8E",
    authDomain: "listy-bcc65.firebaseapp.com",
    databaseURL: "https://listy-bcc65.firebaseio.com",
    projectId: "listy-bcc65",
    storageBucket: "listy-bcc65.appspot.com",
    messagingSenderId: "15699329799",
    appId: "1:15699329799:web:31d0b0c9b6da3c5d357ba2",
    measurementId: "G-NSL8RT8J02"
  }
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/dist/zone-error';  // Included with Angular CLI.
