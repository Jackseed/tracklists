export const environment = {
  production: true,

  spotify: {
    apiUrl: 'https://api.spotify.com/v1/me',
    clientId: 'ef247ad2b6a6480ab274d9f32b27dfe9',
    clientSecret: '5c6e323a217c4a908670b26b8d0a6edc',
    responseType: 'token',
    redirectURI: 'https://listy-bcc65.web.app/home',
  },

  firebaseConfig: {
    apiKey: 'AIzaSyCZ2Sc4pjV_1gGaHXazCOit3Vs3PLm-Mv4',
    authDomain: 'listy-prod.firebaseapp.com',
    projectId: 'listy-prod',
    storageBucket: 'listy-prod.appspot.com',
    messagingSenderId: '230582633068',
    appId: '1:230582633068:web:afc13a67c5678ab6454e49',
    measurementId: 'G-S6KYFQPR9M',
  },
};
