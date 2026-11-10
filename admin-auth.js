import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { initializeAuth, inMemoryPersistence, browserPopupRedirectResolver, GoogleAuthProvider, signInWithPopup, signOut }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const app = initializeApp({
  apiKey: 'AIzaSyD2DSmaCFEWETra0JH2M4zZrkc0DvkrKFg',
  authDomain: 'science-portal-8b814.firebaseapp.com',
  projectId: 'science-portal-8b814',
  appId: '1:428053709401:web:d322b970fe6e868c1d6748'
}, 'happy-farm-admin');

const auth = initializeAuth(app, {
  persistence: inMemoryPersistence,
  popupRedirectResolver: browserPopupRedirectResolver
});

function isAdmin() {
  const user = auth.currentUser;
  return user?.emailVerified === true && user.email === 'prayer168@gmail.com';
}

window.farmAdminAuth = Object.freeze({
  isAdmin,
  async signIn() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
    if (isAdmin()) return true;
    await signOut(auth);
    return false;
  },
  signOut: () => signOut(auth)
});
