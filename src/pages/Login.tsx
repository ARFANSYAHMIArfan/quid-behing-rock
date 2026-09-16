import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, Fingerprint } from "lucide-react";
import { AuthService } from "../services/AuthService";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // If already authenticated, redirect straight to workspace /
  useEffect(() => {
    if (!authLoading && user) {
      navigate("/", { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await AuthService.signInWithGoogle();
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err.message || "Failed to sign in");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 bg-white p-8 shadow-xl rounded-2xl border border-slate-100">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-900 shadow-sm">
            <Fingerprint className="h-8 w-8 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-slate-900">
            Workspace Authentication
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Zero-Trust, Client-Side E2EE Environment
          </p>
        </div>
        
        {error && (
          <div className="rounded-md bg-red-50 p-4 border border-red-200">
            <div className="flex">
              <div className="flex-shrink-0">
                <ShieldAlert className="h-5 w-5 text-red-400" aria-hidden="true" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Authentication Error</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 space-y-6">
          <button
            onClick={handleLogin}
            disabled={isLoading}
            className="group relative flex w-full justify-center rounded-lg bg-slate-900 px-3 py-3 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-70 disabled:cursor-not-allowed transition-all"
          >
            {isLoading ? "Authenticating..." : "Continue with Google"}
          </button>

          <p className="text-center text-xs text-slate-400">
            Restricted to @rfnsyhmi.dpdns.org, @kitabuddy.dpdns.org, and rfnsyhmi.principal@gmail.com.
          </p>
        </div>
      </div>
    </div>
  );
}
