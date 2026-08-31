import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { Lock, BrainCircuit, Mic } from 'lucide-react';

interface LoginScreenProps {
  onLoginStart: () => void;
  onLoginError: (error: string) => void;
}

/** Sign-in is a rare, first-time moment — the one place a stagger is earned. */
const rise = (delayMs: number) => ({ animationDelay: `${delayMs}ms` });

const PROMISES = [
  {
    icon: Lock,
    title: 'Owner-only, by design',
    body: 'Not even an administrator can read your entries. That is enforced in the database rules, not promised in a policy.',
  },
  {
    icon: BrainCircuit,
    title: 'It remembers what you meant',
    body: 'Search your journal by meaning rather than keywords. Ask when you last felt like this, and read your own answer.',
  },
  {
    icon: Mic,
    title: 'Speak it or type it',
    body: 'Dictate an entry out loud. Gemini replies as it writes, then catalogues the entry when you are done.',
  },
];

export default function LoginScreen({ onLoginStart, onLoginError }: LoginScreenProps) {
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    onLoginStart();
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('Google Sign-In Error:', error);
      let errorMsg = 'We could not sign you in. Please try again.';
      if (error.code === 'auth/popup-blocked') {
        errorMsg = 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.';
      } else if (error.code === 'auth/popup-closed-by-user') {
        errorMsg = 'The sign-in window closed before you finished.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMsg = 'Network connection failed. Check your connection and try again.';
      }
      onLoginError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-ink-950 text-paper-200 flex flex-col" id="login-container">
      <header className="px-6 md:px-10 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5 animate-rise">
          <span
            aria-hidden="true"
            className="w-8 h-8 rounded-lg bg-ember-500 text-ink-950 grid place-items-center font-serif text-lg font-semibold leading-none pb-0.5"
          >
            R
          </span>
          <span className="font-semibold text-paper-50 text-[15px] tracking-tight">Reflect</span>
        </div>
        <span className="text-xs text-paper-600 animate-rise" style={rise(60)}>
          Private journal · Google sign-in
        </span>
      </header>

      <main className="flex-1 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-20 items-center px-6 md:px-10 lg:px-16 py-10 max-w-[1240px] w-full mx-auto">
        {/* Editorial half */}
        <section className="space-y-9">
          <div className="space-y-5">
            <h1
              className="font-serif text-[2.6rem] leading-[1.08] md:text-6xl md:leading-[1.05] text-paper-50 font-medium animate-rise"
              style={rise(80)}
            >
              Write it down.
              <br />
              <span className="text-ember-400 italic">Think it through.</span>
            </h1>
            <p
              className="text-paper-400 text-base md:text-[1.0625rem] leading-relaxed max-w-[52ch] animate-rise"
              style={rise(150)}
            >
              A journal that answers back. Write or speak a reflection, think it through with
              Gemini, and let it remember — so months later you can ask what you felt like the
              last time, and get your own words returned to you.
            </p>
          </div>

          <ul className="space-y-px">
            {PROMISES.map(({ icon: Icon, title, body }, index) => (
              <li
                key={title}
                className="flex gap-4 py-5 border-t border-ink-800 animate-rise"
                style={rise(220 + index * 70)}
              >
                <Icon className="w-[18px] h-[18px] text-ember-500 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1">
                  <h2 className="text-paper-200 text-sm font-semibold">{title}</h2>
                  <p className="text-paper-600 text-[13px] leading-relaxed max-w-[46ch]">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Sign-in half */}
        <section
          className="relative bg-ink-900 border border-ink-800 rounded-3xl p-8 md:p-10 shadow-lift animate-rise"
          style={rise(180)}
        >
          <div
            aria-hidden="true"
            className="absolute -top-24 -right-16 w-56 h-56 bg-ember-500/[0.07] rounded-full blur-3xl pointer-events-none"
          />

          <div className="relative space-y-7">
            <div className="space-y-2">
              <h2 className="text-paper-50 text-xl font-semibold tracking-tight">Start your journal</h2>
              <p className="text-paper-600 text-[13px] leading-relaxed">
                Sign in with Google. Your workspace is created the first time, and only your
                account can open it.
              </p>
            </div>

            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              id="google-signin-btn"
              className="press w-full flex items-center justify-center gap-3 bg-paper-50 hover:bg-white text-ink-950 font-semibold text-[15px] px-6 py-3.5 rounded-xl disabled:opacity-60 disabled:cursor-wait cursor-pointer"
            >
              {loading ? (
                <>
                  <span
                    className="w-4 h-4 border-2 border-ink-950/25 border-t-ink-950 rounded-full animate-spin"
                    aria-hidden="true"
                  />
                  <span>Opening Google…</span>
                </>
              ) : (
                <>
                  <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Continue with Google</span>
                </>
              )}
            </button>

            <p className="text-paper-700 text-xs leading-relaxed border-t border-ink-800 pt-6">
              Entries are stored in Cloud Firestore under your user ID and are readable only by
              you. The Gemini key stays on the server and never reaches your browser.
            </p>
          </div>
        </section>
      </main>

      <footer className="px-6 md:px-10 py-6 text-xs text-paper-700">
        <span>Built on Cloud Run, Firestore and the Gemini API.</span>
      </footer>
    </div>
  );
}
