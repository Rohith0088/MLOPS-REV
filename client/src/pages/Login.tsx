import { useEffect, useState, type FormEvent } from "react";
import { ShieldCheck, ArrowRight, Check, LockKeyhole, Mail, RotateCcw } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { COOKIE_NAME, startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { supabase, supabaseAuthConfigured } from "@/lib/supabase";
import { TRPCClientError } from "@trpc/client";

const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL as string | undefined;

export default function Login() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, loading } = useAuth();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSubmitted, setResetSubmitted] = useState(false);
  const [demoEmail, setDemoEmail] = useState("");
  const [demoPassword, setDemoPassword] = useState("");
  const [demoError, setDemoError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [supabaseError, setSupabaseError] = useState("");
  const [supabasePending, setSupabasePending] = useState(false);
  const [authMode, setAuthMode] = useState<"signIn" | "signUp">("signIn");
  const [confirmationSent, setConfirmationSent] = useState(false);
  const demoConfig = trpc.auth.demoConfig.useQuery();
  const utils = trpc.useUtils();
  const demoSignIn = trpc.auth.demoSignIn.useMutation({
    onSuccess: async ({ token }) => {
      try {
        sessionStorage.setItem("manus-cookie", `${COOKIE_NAME}=${token}`);
      } catch {
        setDemoError("Demo session storage is unavailable in this browser");
        return;
      }
      await utils.auth.me.invalidate();
      setLocation("/");
    },
    onError: (error) => {
      setDemoError(error instanceof TRPCClientError ? error.message : "Demo sign-in failed");
    },
  });

  useEffect(() => {
    if (!loading && isAuthenticated) setLocation("/");
  }, [isAuthenticated, loading, setLocation]);

  const beginOAuth = () => {
    if (oauthPortalUrl) {
      startLogin();
    }
  };

  const signInWithSupabase = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setSupabaseError("");
    setSupabasePending(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSupabasePending(false);
    if (error) {
      setSupabaseError(error.message.toLowerCase().includes("confirm")
        ? "Confirm your email address before signing in."
        : error.message);
      return;
    }
    setLocation("/");
  };

  const signUpWithSupabase = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setSupabaseError("");
    setSupabasePending(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setSupabasePending(false);
    if (error) {
      setSupabaseError(error.message);
      return;
    }
    if (data.session) {
      setLocation("/");
      return;
    }
    setSupabaseError("Account created. Check your email to confirm your account, then sign in.");
    setConfirmationSent(true);
    setAuthMode("signIn");
  };

  const resendConfirmation = async () => {
    if (!supabase || !email) return;
    setSupabasePending(true);
    setSupabaseError("");
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setSupabasePending(false);
    setSupabaseError(error ? error.message : "Confirmation email sent. Check your inbox and spam folder.");
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#05070d] text-slate-100">
      <div className="mx-auto grid min-h-screen max-w-[1440px] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden border-r border-white/10 px-12 py-12 lg:flex lg:flex-col lg:justify-between xl:px-20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(37,99,235,0.22),transparent_35%),linear-gradient(145deg,#07101d,#05070d_60%)]" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500/15 text-blue-300 ring-1 ring-blue-300/30"><ShieldCheck size={22} /></span>
              <div><p className="font-semibold tracking-tight text-white">FRAUD SENTINEL</p><p className="text-[10px] tracking-[0.2em] text-slate-500">CYBERSECURITY INTELLIGENCE PLATFORM</p></div>
            </div>
          </div>
          <div className="relative max-w-xl">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">Security operations, clarified</p>
            <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-0.04em] text-white xl:text-6xl">Your security.<br />Our intelligence.</h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-400">Detect fraud, investigate suspicious activity, and protect digital interactions with intelligent security analysis.</p>
            <div className="mt-10 grid gap-4 text-sm text-slate-300">
              {["Real-time threat detection", "Intelligent risk analysis", "Continuous model monitoring"].map((item) => <div key={item} className="flex items-center gap-3"><span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-300/20"><Check size={14} /></span>{item}</div>)}
            </div>
          </div>
          <p className="relative text-xs text-slate-600">Encrypted enterprise access · Fraud Sentinel Operations</p>
          <div className="pointer-events-none absolute bottom-20 right-20 h-56 w-56 rounded-full border border-blue-400/15 shadow-[0_0_100px_rgba(37,99,235,0.18)]" />
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-10">
          <div className="w-full max-w-[440px]">
            <div className="mb-10 flex items-center gap-3 lg:hidden">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500/15 text-blue-300 ring-1 ring-blue-300/30"><ShieldCheck size={22} /></span>
              <div><p className="font-semibold tracking-tight text-white">FRAUD SENTINEL</p><p className="text-[10px] tracking-[0.16em] text-slate-500">SECURITY INTELLIGENCE</p></div>
            </div>
            <div className="mb-8">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">Secure workspace</p>
              <h2 className="text-3xl font-semibold tracking-tight text-white">Welcome back</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">Sign in through your organization&apos;s secure identity provider to access Risk Operations.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#0b1018]/90 p-6 shadow-2xl shadow-black/30 sm:p-8">
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-300/15 bg-blue-400/[0.06] p-4 text-sm text-slate-300">
                <LockKeyhole className="mt-0.5 shrink-0 text-blue-300" size={18} />
                <p>Authentication is handled by the configured enterprise OAuth provider. Fraud Sentinel never receives or stores your password.</p>
              </div>
              <button type="button" onClick={beginOAuth} disabled={!oauthPortalUrl} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">
                {oauthPortalUrl ? <>Continue with secure sign-in <ArrowRight size={17} /></> : "Secure sign-in is not configured"}
              </button>
              {supabaseAuthConfigured && <form onSubmit={authMode === "signIn" ? signInWithSupabase : signUpWithSupabase} className="mt-6 space-y-3 border-t border-white/10 pt-6">
                <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{authMode === "signIn" ? "Sign in" : "Create account"}</p><button type="button" onClick={() => { setAuthMode(authMode === "signIn" ? "signUp" : "signIn"); setSupabaseError(""); setConfirmationSent(false); }} className="text-xs text-blue-300 hover:text-blue-200">{authMode === "signIn" ? "Create an account" : "Already have an account?"}</button></div>
                <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-300">Email</span><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-blue-300/60 focus:ring-2 focus:ring-blue-500/20" /></label>
                <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-300">Password</span><input type="password" autoComplete={authMode === "signIn" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-blue-300/60 focus:ring-2 focus:ring-blue-500/20" /></label>
                {supabaseError && <p role="alert" className="text-xs text-rose-300">{supabaseError}</p>}
                {confirmationSent && <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3 text-xs leading-5 text-emerald-100"><p>We sent a confirmation link to your email.</p><button type="button" onClick={resendConfirmation} disabled={supabasePending} className="mt-1 font-semibold text-emerald-200 underline">Resend confirmation email</button></div>}
                <button type="submit" disabled={supabasePending} className="h-10 w-full rounded-lg border border-blue-300/30 bg-blue-300/10 text-sm font-semibold text-blue-100 hover:bg-blue-300/20 disabled:opacity-60">{supabasePending ? (authMode === "signIn" ? "Signing in…" : "Creating account…") : authMode === "signIn" ? "Sign in" : "Create account"}</button>
              </form>}
              {demoConfig.data?.enabled && <div className="mt-6 rounded-xl border border-amber-300/20 bg-amber-400/[0.06] p-4">
                <div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">Demo mode</p><span className="rounded-full bg-amber-300/10 px-2 py-1 text-[10px] text-amber-200">Not production auth</span></div>
                <p className="mb-4 text-xs leading-5 text-amber-100/70">Use the temporary local account to preview the dashboard while OAuth is being configured.</p>
                <form onSubmit={(event) => { event.preventDefault(); setDemoError(""); demoSignIn.mutate({ email: demoEmail, password: demoPassword }); }} className="space-y-3">
                  <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-300">Demo email</span><input type="email" autoComplete="email" required value={demoEmail} onChange={(event) => setDemoEmail(event.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-amber-300/60 focus:ring-2 focus:ring-amber-500/20" placeholder={demoConfig.data.email ?? "demo@fraudsentinel.local"} /></label>
                  <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-300">Demo password</span><input type="password" autoComplete="current-password" required value={demoPassword} onChange={(event) => setDemoPassword(event.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-amber-300/60 focus:ring-2 focus:ring-amber-500/20" placeholder="Enter demo password" /></label>
                  {demoError && <p role="alert" className="text-xs text-rose-300">{demoError}</p>}
                  <button type="submit" disabled={demoSignIn.isPending} className="h-10 w-full rounded-lg border border-amber-300/30 bg-amber-300/10 text-sm font-semibold text-amber-100 hover:bg-amber-300/20 disabled:opacity-60">{demoSignIn.isPending ? "Signing in…" : "Sign in to demo"}</button>
                </form>
                <p className="mt-3 text-[11px] text-amber-100/50">Credentials: {demoConfig.data.email} / SentinelDemo123!</p>
              </div>}
              {!oauthPortalUrl && <p className="mt-3 text-center text-xs text-amber-300/80">Set VITE_OAUTH_PORTAL_URL and VITE_APP_ID to enable authentication.</p>}
              <div className="my-7 flex items-center gap-3 text-[10px] uppercase tracking-[0.16em] text-slate-600"><span className="h-px flex-1 bg-white/10" /> New to the platform? <span className="h-px flex-1 bg-white/10" /></div>
              <button type="button" onClick={beginOAuth} disabled={!oauthPortalUrl} className="w-full rounded-lg border border-white/10 px-4 py-3 text-sm font-medium text-slate-300 hover:border-blue-300/40 hover:text-white disabled:cursor-not-allowed disabled:text-slate-600">Request workspace access</button>
              <button type="button" onClick={() => { setResetOpen(true); setResetSubmitted(false); }} className="mt-5 flex w-full items-center justify-center gap-2 text-xs text-slate-500 hover:text-blue-300"><RotateCcw size={13} /> Password help</button>
            </div>
            <p className="mt-6 text-center text-xs leading-5 text-slate-600">By continuing, you agree to your organization&apos;s access policy.<br />Need help? Contact your Fraud Sentinel administrator.</p>
          </div>
        </section>
      </div>
      {resetOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-5" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b1018] p-6 shadow-2xl">
          <div className="mb-5 flex items-center justify-between"><div><h3 id="reset-title" className="text-lg font-semibold text-white">Password help</h3><p className="mt-1 text-xs text-slate-500">Managed by your identity provider</p></div><button type="button" onClick={() => setResetOpen(false)} className="text-slate-500 hover:text-white" aria-label="Close">×</button></div>
          {resetSubmitted ? <div className="rounded-lg border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">Your organization&apos;s sign-in portal handles password recovery. Return to secure sign-in to continue.</div> : <form onSubmit={(event) => { event.preventDefault(); if (resetEmail.trim()) setResetSubmitted(true); }}><label htmlFor="reset-email" className="mb-2 block text-xs font-medium text-slate-300">Work email</label><div className="relative"><Mail className="absolute left-3 top-3 text-slate-500" size={16} /><input id="reset-email" type="email" required value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} className="h-11 w-full rounded-lg border border-white/10 bg-white/5 pl-10 pr-3 text-sm text-white outline-none focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20" placeholder="you@company.com" /></div><button type="submit" className="mt-5 h-11 w-full rounded-lg bg-blue-500 text-sm font-semibold text-white hover:bg-blue-400">Continue to password recovery</button></form>}
        </div>
      </div>}
    </main>
  );
}
