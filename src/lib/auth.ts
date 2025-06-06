// src/lib/auth.ts
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { app } from "./firebase"; // Assuming this path is correct for firebase app instance

export function ensureAnonymousAuth() {
  const auth = getAuth(app);
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      signInAnonymously(auth)
        .then(() => {
          console.log("Firebase: Signed in anonymously.");
        })
        .catch((error) => {
          console.error("Firebase: Error signing in anonymously:", error);
        });
    } else {
      // console.log("Firebase: User is already signed in (or became signed in):", user.uid);
    }
  });
}
