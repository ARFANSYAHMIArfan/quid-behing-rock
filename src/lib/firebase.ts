import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import firebaseAppletConfig from "../../firebase-applet-config.json";

// Your web app's Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyD9ECegWI5K70iNZ75jAyzejFYOylypncE",
  authDomain: "app-rfnsyhmi-s-workspace.firebaseapp.com",
  databaseURL: "https://app-rfnsyhmi-s-workspace-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "app-rfnsyhmi-s-workspace",
  storageBucket: "app-rfnsyhmi-s-workspace.firebasestorage.app",
  messagingSenderId: "746985920657",
  appId: "1:746985920657:web:2415d2f5acb6d630320730",
  measurementId: "G-TBCTRCZ0MG"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Initialize Firebase Analytics safely for browser environments
let analyticsInstance: any = null;
if (typeof window !== "undefined") {
  try {
    analyticsInstance = getAnalytics(app);
  } catch (err) {
    // Analytics is optional or restricted in certain sandbox iframe environments
  }
}
export const analytics = analyticsInstance;

export const auth = getAuth(app);

// Initialize Firestore targeting the provisioned database ID
const dbId = (firebaseAppletConfig as any)?.firestoreDatabaseId;
export const db = dbId ? getFirestore(app, dbId) : getFirestore(app);

export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
// Google Workspace scopes: Gmail & Google Calendar
googleProvider.addScope("https://www.googleapis.com/auth/gmail.modify");
googleProvider.addScope("https://www.googleapis.com/auth/calendar.events.readonly");
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

