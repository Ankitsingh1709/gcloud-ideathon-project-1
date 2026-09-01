import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { JournalEntry, UserProfile } from './types';
import LoginScreen from './components/LoginScreen';
import Sidebar from './components/Sidebar';
import MainDashboard from './components/MainDashboard';
import InsightsDashboard from './components/InsightsDashboard';
import AdminDashboard from './components/AdminDashboard';
import WelcomeNote from './components/WelcomeNote';
import { getTrialStatus, onTrialRemainingChange, type TrialStatus } from './lib/api';
import { AlertTriangle, BookOpen, LogOut, Menu, Moon, RefreshCw, Sun } from 'lucide-react';
import { applyTheme, getTheme, type Theme } from './lib/theme';

const WELCOME_SEEN_KEY = 'reflect.welcomeSeen';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'workspace' | 'insights' | 'admin'>('workspace');
  // The sidebar collapses at every width. It overlays on a phone and pushes
  // the workspace on a wide screen, where it starts open as it always has.
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);

  // Shown once per browser on a first sign-in. Reading it lazily keeps the
  // modal from flashing for a returning writer while auth resolves.
  const [showWelcome, setShowWelcome] = useState(false);
  const [trial, setTrial] = useState<TrialStatus | null>(null);

  // The top bar owns the theme so there is only ever one toggle to keep in sync.
  const [theme, setTheme] = useState<Theme>(getTheme);
  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedMood, setSelectedMood] = useState('');

  // 1. Listen for user authentication state changes
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Force refresh the token to retrieve the latest custom claims
          const idTokenResult = await firebaseUser.getIdTokenResult(true);
          const role = idTokenResult.claims.role as 'admin' | 'user' | undefined;
          
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            role: role || 'user'
          });
        } catch (error) {
          console.error('Failed to retrieve token custom claims:', error);
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            role: 'user'
          });
        }
        setGlobalError(null);

        try {
          if (!localStorage.getItem(WELCOME_SEEN_KEY)) setShowWelcome(true);
        } catch {
          /* private mode: skip the note rather than showing it every load */
        }

        // The allowance is the server's number. Read it once here so a reload
        // does not lose the count, then follow X-Trial-Remaining after that.
        getTrialStatus()
          .then(setTrial)
          .catch(() => { /* the count is a courtesy; the server still enforces it */ });
      } else {
        setUser(null);
        setEntries([]);
        setSelectedEntryId(null);
      }
      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  // 2. Load Firestore entries in real-time when the user is signed in
  useEffect(() => {
    if (!user) return;

    const entriesRef = collection(db, 'users', user.uid, 'entries');
    const q = query(entriesRef, orderBy('createdAt', 'desc'));

    const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
      const loadedEntries: JournalEntry[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        loadedEntries.push({
          id: docSnap.id,
          title: data.title || '',
          createdAt: data.createdAt || Date.now(),
          updatedAt: data.updatedAt || Date.now(),
          messages: data.messages || [],
          summary: data.summary || '',
          category: data.category || '',
          mood: data.mood || '',
          isDraft: data.isDraft !== undefined ? data.isDraft : true,
          location: data.location || undefined,
          // This parser copies fields one by one, so anything not named here
          // is silently dropped on read even though it is stored correctly.
          // Omitting `embedding` left semantic search with nothing to rank.
          embedding: Array.isArray(data.embedding) ? data.embedding : undefined
        });
      });
      setEntries(loadedEntries);
    }, (error) => {
      console.error('Firestore reading failed:', error);
      setGlobalError('Failed to synchronize with database. Check database permissions.');
    });

    return () => unsubscribeSnapshot();
  }, [user]);

  // Follow the trial count that every generation reports back on its response.
  // Must sit above the early returns below: a hook that only runs once the
  // user is loaded changes the hook count between renders.
  useEffect(() => {
    onTrialRemainingChange((remaining) =>
      setTrial(prev => (prev ? { ...prev, remaining } : prev))
    );
    return () => onTrialRemainingChange(null);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign-out failed:', error);
      setGlobalError('Failed to sign out. Please refresh the page.');
    }
  };

  const handleNewEntry = () => {
    const newId = `ref-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newEntry: JournalEntry = {
      id: newId,
      title: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      summary: '',
      category: '',
      mood: '',
      isDraft: true
    };
    
    // Set locally first to open the workspace instantly
    setCurrentView('workspace');
    setSelectedEntryId(newId);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  // Safe save handler to Firestore
  const handleSaveEntry = async (updatedEntry: JournalEntry) => {
    if (!user) throw new Error('You must be authenticated to save journal entries.');

    const entryRef = doc(db, 'users', user.uid, 'entries', updatedEntry.id);
    
    // Deep sanitize properties of undefined to nulls to prevent Firebase SDK crash
    const sanitizedObj = JSON.parse(JSON.stringify(updatedEntry, (_, v) => v === undefined ? null : v));
    
    await setDoc(entryRef, sanitizedObj, { merge: true });
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!user) return;
    try {
      const entryRef = doc(db, 'users', user.uid, 'entries', entryId);
      await deleteDoc(entryRef);
      if (selectedEntryId === entryId) {
        setSelectedEntryId(null);
      }
    } catch (error: any) {
      console.error('Failed to delete entry:', error);
      setGlobalError('Failed to delete reflection entry. Please try again.');
    }
  };

  // Find selected entry (or create a virtual one if starting fresh before first save)
  const getActiveEntry = (): JournalEntry | null => {
    if (!selectedEntryId) return null;
    const existing = entries.find(e => e.id === selectedEntryId);
    if (existing) return existing;

    // Return a virtual initial entry if starting fresh
    return {
      id: selectedEntryId,
      title: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      summary: '',
      category: '',
      mood: '',
      isDraft: true
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-950 flex flex-col items-center justify-center p-6 text-center" id="global-loading">
        <div className="space-y-4 max-w-sm">
          <div className="bg-ember-950 border border-ember-900/30 p-4 rounded-3xl text-ember-500 inline-block shadow-lg">
            <BookOpen className="w-8 h-8 animate-pulse text-ember-500" />
          </div>
          <div className="flex items-center justify-center space-x-2 text-paper-500 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin text-ember-500" aria-hidden="true" />
            <span>Opening your journal…</span>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginScreen 
        onLoginStart={() => setGlobalError(null)}
        onLoginError={(err) => setGlobalError(err)}
      />
    );
  }

  const activeEntry = getActiveEntry();

  const dismissWelcome = () => {
    setShowWelcome(false);
    try {
      localStorage.setItem(WELCOME_SEEN_KEY, '1');
    } catch {
      /* it will simply be shown again next time */
    }
  };

  return (
    <div className="h-screen bg-ink-950 flex flex-col overflow-hidden" id="app-root-workspace">
      {showWelcome && trial && (
        <WelcomeNote
          displayName={user.displayName}
          trialLimit={trial.limit}
          onClose={dismissWelcome}
        />
      )}
      {/* Global Error Banner */}
      {globalError && (
        <div className="bg-rose-950/40 border-b border-rose-900/50 text-rose-300 text-xs px-6 py-2.5 flex items-center justify-between font-semibold">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>{globalError}</span>
          </div>
          <button 
            onClick={() => setGlobalError(null)}
            className="text-paper-600 hover:text-paper-400 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top bar: hosts the sidebar toggle at every width */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ink-700 bg-ink-900 shrink-0">
        <button
          onClick={() => setSidebarOpen(v => !v)}
          aria-label={sidebarOpen ? 'Hide reflections' : 'Show reflections'}
          aria-expanded={sidebarOpen}
          id="sidebar-toggle-btn"
          className="p-2 -ml-1 rounded-xl text-paper-400 hover:text-paper-50 hover:bg-ink-850 transition cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="font-semibold text-paper-50 tracking-tight">Reflect.ai</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleTheme}
            id="theme-toggle-btn"
            className="p-2 rounded-xl text-paper-400 hover:text-ember-400 hover:bg-ink-850 transition cursor-pointer"
            title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || 'Profile'}
              title={user.email || user.displayName || 'Signed in'}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover border border-ink-700 shrink-0"
            />
          ) : (
            <div
              title={user.email || user.displayName || 'Signed in'}
              className="w-8 h-8 rounded-full bg-ember-500 text-ink-950 flex items-center justify-center font-bold text-xs shrink-0"
            >
              {user.displayName ? user.displayName[0].toUpperCase() : 'U'}
            </div>
          )}
          <button
            onClick={handleSignOut}
            id="logout-btn"
            title="Sign Out"
            aria-label="Sign out"
            className="p-2 rounded-xl text-paper-400 hover:text-ember-400 hover:bg-ink-850 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Full-Screen Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {sidebarOpen && (
          <button
            aria-label="Close reflections"
            onClick={() => setSidebarOpen(false)}
            className="md:hidden absolute inset-0 z-30 bg-ink-950/70 backdrop-blur-sm"
          />
        )}
        <div
          className={`absolute inset-y-0 left-0 z-40 h-full shrink-0 transition-all duration-300 md:static md:z-auto md:translate-x-0 md:overflow-hidden ${
            sidebarOpen ? 'translate-x-0 md:w-80' : '-translate-x-full md:w-0'
          }`}
        >
        <Sidebar 
          user={user}
          trial={trial}
          entries={entries}
          selectedEntryId={selectedEntryId}
          onSelectEntry={(id) => {
            setSelectedEntryId(id);
            setCurrentView('workspace');
            if (window.innerWidth < 768) setSidebarOpen(false);
          }}
          onNewEntry={handleNewEntry}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          selectedMood={selectedMood}
          onMoodChange={setSelectedMood}
          onDeleteEntry={handleDeleteEntry}
          currentView={currentView}
          onViewChange={(view) => {
            setCurrentView(view);
            if (window.innerWidth < 768) setSidebarOpen(false);
          }}
        />
        </div>

        <div key={currentView} className="flex-1 flex min-w-0 animate-settle">
        {currentView === 'admin' && user?.role === 'admin' ? (
          <AdminDashboard />
        ) : currentView === 'insights' ? (
          <InsightsDashboard entries={entries} />
        ) : (
          <MainDashboard 
            entry={activeEntry}
            onSaveEntry={handleSaveEntry}
            onNewEntry={handleNewEntry}
            entries={entries}
            onSelectEntry={(id) => {
              setSelectedEntryId(id);
              setCurrentView('workspace');
            }}
          />
        )}
        </div>
      </div>
    </div>
  );
}
