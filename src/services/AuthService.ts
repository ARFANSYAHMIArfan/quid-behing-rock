import { signInWithPopup, signOut, User } from "firebase/auth";
import { isAllowedAccount } from '../lib/access';
import { auth, googleProvider } from "../lib/firebase";

const ALLOWED_DOMAINS = ["@rfnsyhmi.dpdns.org", "@kitabuddy.dpdns.org"];
const ALLOWED_EMAILS = [
  "rfnsyhmi.principal@gmail.com",
  "m-10531068@moe-dl.edu.my"
];

export class AuthService {
  static async signInWithGoogle(): Promise<User> {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      if (!user.email) {
        await signOut(auth);
        throw new Error("No email associated with this account.");
      }
      
      const isAllowed = isAllowedAccount(user.email, user.emailVerified);
      
      if (!isAllowed) {
        // Sign out immediately if domain/email is not allowed
        await signOut(auth);
        throw new Error(`Unauthorized email. Access is strictly restricted to ${ALLOWED_DOMAINS.join(", ")} and authorized accounts (${ALLOWED_EMAILS.join(", ")}).`);
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

  static async logOut(): Promise<void> {
    return signOut(auth);
  }
}

