import { signInWithPopup, signOut, GoogleAuthProvider, User } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";

const ALLOWED_DOMAINS = ["@rfnsyhmi.dpdns.org", "@kitabuddy.dpdns.org"];
const ALLOWED_EMAILS = [
  "rfnsyhmi.principal@gmail.com",
  "m-10531068@moe-dl.edu.my"
];

let cachedGoogleAccessToken: string | null = null;

export class AuthService {
  static getGoogleAccessToken(): string | null {
    if (cachedGoogleAccessToken) return cachedGoogleAccessToken;
    return sessionStorage.getItem("google_workspace_access_token");
  }

  static getGmailAccessToken(): string | null {
    return this.getGoogleAccessToken();
  }

  static setGoogleAccessToken(token: string): void {
    cachedGoogleAccessToken = token;
    try {
      sessionStorage.setItem("google_workspace_access_token", token);
    } catch (e) {
      // In private browsing or storage quota edge cases
    }
  }

  static setGmailAccessToken(token: string): void {
    this.setGoogleAccessToken(token);
  }

  static async requestGoogleAccess(): Promise<string> {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Gagal memperoleh token akses Google Workspace.");
    }
    this.setGoogleAccessToken(credential.accessToken);
    return credential.accessToken;
  }

  static async requestGmailAccess(): Promise<string> {
    return this.requestGoogleAccess();
  }

  static async signInWithGoogle(): Promise<User> {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      if (!user.email) {
        await signOut(auth);
        throw new Error("No email associated with this account.");
      }
      
      const userEmail = user.email.toLowerCase();
      const isAllowed = 
        ALLOWED_DOMAINS.some(domain => userEmail.endsWith(domain.toLowerCase())) ||
        ALLOWED_EMAILS.some(email => userEmail === email.toLowerCase());
      
      if (!isAllowed) {
        // Sign out immediately if domain/email is not allowed
        await signOut(auth);
        throw new Error(`Unauthorized email. Access is strictly restricted to ${ALLOWED_DOMAINS.join(", ")} and authorized accounts (${ALLOWED_EMAILS.join(", ")}).`);
      }

      // Cache the Google OAuth access token for Gmail API calls
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        this.setGmailAccessToken(credential.accessToken);
      }
      
      return user;
    } catch (error: any) {
      console.error("AuthService Error:", error.message);
      
      if (error.code === 'auth/unauthorized-domain' || error.message.includes('auth/unauthorized-domain')) {
        const currentDomain = window.location.hostname;
        throw new Error(
          `Domain not authorized. Please go to the Firebase Console -> Authentication -> Settings -> Authorized domains, and add "${currentDomain}" to the list.`
        );
      }
      
      throw error;
    }
  }

  static disconnectGmail(): void {
    cachedGoogleAccessToken = null;
    try {
      sessionStorage.removeItem("google_workspace_access_token");
    } catch (e) {}
  }

  static async logOut(): Promise<void> {
    this.disconnectGmail();
    return signOut(auth);
  }
}
