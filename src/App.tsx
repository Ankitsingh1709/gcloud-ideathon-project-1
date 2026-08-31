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
import { AlertTriangle, BookOpen, RefreshCw } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'workspace' | 'insights' | 'admin'>('workspace');

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

  return (
    <div className="h-screen bg-ink-950 flex flex-col overflow-hidden" id="app-root-workspace">
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

      {/* Main Full-Screen Layout */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar 
          user={user}
          entries={entries}
          selectedEntryId={selectedEntryId}
          onSelectEntry={(id) => {
            setSelectedEntryId(id);
            setCurrentView('workspace');
          }}
          onNewEntry={handleNewEntry}
          onSignOut={handleSignOut}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          selectedMood={selectedMood}
          onMoodChange={setSelectedMood}
          onDeleteEntry={handleDeleteEntry}
          currentView={currentView}
          onViewChange={setCurrentView}
        />

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
