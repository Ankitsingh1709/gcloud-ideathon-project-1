import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { BookOpen, LogIn, Sparkles, ShieldCheck } from 'lucide-react';

interface LoginScreenProps {
  onLoginStart: () => void;
  onLoginError: (error: string) => void;
}

export default function LoginScreen({ onLoginStart, onLoginError }: LoginScreenProps) {
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    onLoginStart();
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('Google Sign-In Error:', error);
      let errorMsg = 'Failed to sign in with Google. Please try again.';
      if (error.code === 'auth/popup-blocked') {
        errorMsg = 'Sign-in popup was blocked by your browser. Please allow popups for this site.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMsg = 'Network connection error. Please check your internet connection.';
      }
      onLoginError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] flex flex-col justify-between" id="login-container">
      {/* Top Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-[#2a2a2a] bg-[#0c0c0c]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center space-x-2">
          <div className="bg-[#1e1b26] border border-[#4c1d95]/30 p-2 rounded-xl text-[#8b5cf6]">
            <BookOpen className="w-5 h-5" />
          </div>
          <span className="font-semibold text-white text-lg tracking-tight">Reflect.ai</span>
        </div>
        <div className="flex items-center space-x-1 text-xs text-[#8b5cf6] bg-[#1e1e1e] border border-[#8b5cf6]/20 px-2.5 py-1 rounded-full font-semibold">
          <ShieldCheck className="w-3.5 h-3.5 text-[#d946ef] mr-1" />
          <span>Secure AES Auth</span>
        </div>
      </header>

      {/* Main Content Hero */}
      <main className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-xl bg-[#121212] rounded-3xl border border-[#2a2a2a] shadow-2xl p-8 md:p-12 space-y-8 text-center relative overflow-hidden">
          {/* Subtle design blobs */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#8b5cf6]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-[#d946ef]/10 rounded-full blur-3xl pointer-events-none" />

          <div className="space-y-4">
            <div className="inline-flex bg-gradient-to-br from-[#8b5cf6] to-[#d946ef] p-4 rounded-3xl text-white shadow-lg shadow-[#8b5cf6]/30 mb-2">
              <Sparkles className="w-8 h-8 animate-pulse" />
            </div>
            
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight leading-tight">
              A Private Sanctuary for Your Thoughts
            </h1>
            
            <p className="text-[#888] text-base md:text-lg max-w-md mx-auto leading-relaxed">
              Reflect.ai is your secure personal journal. Converse with Gemini to explore your insights, summarize reflections, and uncover deeper awareness.
            </p>
          </div>

          <div className="pt-4 space-y-4 max-w-sm mx-auto">
            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              id="google-signin-btn"
              className="w-full flex items-center justify-center space-x-3 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-semibold px-6 py-4 rounded-2xl shadow-lg hover:shadow-[#8b5cf6]/20 transition duration-200 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <svg className="w-5 h-5 mr-1 fill-current" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Sign In with Google</span>
                </>
              )}
            </button>

            <p className="text-xs text-[#555] leading-normal px-4">
              By continuing, you gain access to your fully isolated private workspace. Your entries are visible only to you.
            </p>
          </div>

          {/* Value props */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-[#2a2a2a] text-left">
            <div className="p-3">
              <h3 className="font-semibold text-white text-sm">Strictly Private</h3>
              <p className="text-xs text-[#666] mt-1">Row-level Firestore isolation ensures your text is never exposed.</p>
            </div>
            <div className="p-3">
              <h3 className="font-semibold text-white text-sm">Interactive AI</h3>
              <p className="text-xs text-[#666] mt-1">Reflect, brainstorm, and seek perspective with Gemini dynamically.</p>
            </div>
            <div className="p-3">
              <h3 className="font-semibold text-white text-sm">Insights Archive</h3>
              <p className="text-xs text-[#666] mt-1">Browse, search, and trace your past states and summaries easily.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-[#2a2a2a] bg-[#0c0c0c]/80 text-center text-xs text-[#666]">
        <span>© {new Date().getFullYear()} Reflect.ai. Built securely using Google Cloud Run, Firestore, and the Gemini API.</span>
      </footer>
    </div>
  );
}
