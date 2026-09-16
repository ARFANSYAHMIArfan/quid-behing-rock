import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyD9ECegWI5K70iNZ75jAyzejFYOylypncE",
  authDomain: "app-rfnsyhmi-s-workspace.firebaseapp.com",
  projectId: "app-rfnsyhmi-s-workspace",
  storageBucket: "app-rfnsyhmi-s-workspace.firebasestorage.app",
  messagingSenderId: "746985920657",
  appId: "1:746985920657:web:2415d2f5acb6d630320730",
  measurementId: "G-TBCTRCZ0MG"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use default Firestore database for the new project
export const db = getFirestore(app);

export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
// We can optionally add custom parameters like prompt: 'select_account'
googleProvider.setCustomParameters({
  prompt: 'select_account'
});
