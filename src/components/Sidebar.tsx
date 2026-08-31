import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { JournalEntry, UserProfile } from '../types';
import { postJson, getStoredByokKey, setStoredByokKey, GEMINI_KEY_SHAPE } from '../lib/api';
import { cosineSimilarity } from '../lib/vector';
import { getMoodColor } from '../lib/mood';
import { 
  LogOut, Plus, Search, BookOpen, 
  Calendar, Hash, Smile, Sparkles, FilterX, BrainCircuit, ShieldAlert,
  KeyRound, Loader2, Type as TypeIcon
} from 'lucide-react';
import SidebarEntryItem from './SidebarEntryItem';

interface SidebarProps {
  user: UserProfile;
  entries: JournalEntry[];
  selectedEntryId: string | null;
  onSelectEntry: (id: string) => void;
  onNewEntry: () => void;
  onSignOut: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  selectedMood: string;
  onMoodChange: (mood: string) => void;
  onDeleteEntry: (id: string) => void;
  currentView?: 'workspace' | 'insights' | 'admin';
  onViewChange?: (view: 'workspace' | 'insights' | 'admin') => void;
}

export default function Sidebar({
  user,
  entries,
  selectedEntryId,
  onSelectEntry,
  onNewEntry,
  onSignOut,
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  selectedMood,
  onMoodChange,
  onDeleteEntry,
  currentView = 'workspace',
  onViewChange
}: SidebarProps) {

  // --- Semantic memory search ---------------------------------------------
  // Keyword search filters locally; meaning search embeds the query and ranks
  // entries by cosine similarity against the vectors already in memory.
  const [semanticMode, setSemanticMode] = useState(false);
  const [semanticResults, setSemanticResults] = useState<{ entry: JournalEntry; score: number }[] | null>(null);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticError, setSemanticError] = useState<string | null>(null);

  // --- Bring your own key --------------------------------------------------
  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const [byokDraft, setByokDraft] = useState(getStoredByokKey() || '');
  const [byokSaved, setByokSaved] = useState(Boolean(getStoredByokKey()));

  const indexedEntries = entries.filter(e => Array.isArray(e.embedding) && e.embedding.length > 0);

  /*
   * Stagger the list on the first load only. Firestore pushes a snapshot on
   * every save and every finished stream, so a permanent stagger would pulse
   * the whole sidebar dozens of times a session.
   */
  const hasRenderedList = useRef(false);
  const staggerFirstLoad = !hasRenderedList.current && entries.length > 0;
  useEffect(() => {
    if (entries.length > 0) hasRenderedList.current = true;
  }, [entries.length]);

  const runSemanticSearch = async () => {
    const queryText = searchQuery.trim();
    if (!queryText || semanticLoading) return;

    if (indexedEntries.length === 0) {
      setSemanticError('Nothing is indexed yet. Run "Synthesize & Catalog" on an entry to make it searchable.');
      setSemanticResults([]);
      return;
    }

    setSemanticLoading(true);
    setSemanticError(null);
    try {
      const { embedding } = await postJson<{ embedding: number[] }>('/api/gemini/embed', { text: queryText });
      // ponytail: O(n) scan over entries already in React state. Revisit only
      // if a single user ever accumulates thousands of entries.
      const ranked = indexedEntries
        .map(entry => ({ entry, score: cosineSimilarity(embedding, entry.embedding as number[]) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      setSemanticResults(ranked);
    } catch (err: any) {
      setSemanticError(err?.message || 'Semantic search failed.');
      setSemanticResults(null);
    } finally {
      setSemanticLoading(false);
    }
  };

  const saveByokKey = () => {
    const trimmed = byokDraft.trim();
    if (trimmed && !GEMINI_KEY_SHAPE.test(trimmed)) return;
    setStoredByokKey(trimmed || null);
    setByokSaved(Boolean(trimmed));
    setShowKeyPanel(false);
  };

  // Extract all unique categories and moods
  const categories = Array.from(new Set(entries.map(e => e.category).filter(Boolean)));
  const moods = Array.from(new Set(entries.map(e => e.mood).filter(Boolean)));

  // Filter entries based on search, category, and mood
  const filteredEntries = entries.filter(entry => {
    const matchesSearch = 
      entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.messages.some(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = !selectedCategory || entry.category === selectedCategory;
    const matchesMood = !selectedMood || entry.mood === selectedMood;

    return matchesSearch && matchesCategory && matchesMood;
  });


  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const hasActiveFilters = selectedCategory || selectedMood || searchQuery;

  const clearFilters = () => {
    onCategoryChange('');
    onMoodChange('');
    onSearchChange('');
    setSemanticResults(null);
    setSemanticError(null);
  };

  return (
    <aside className="w-80 border-r border-ink-700 bg-ink-900 flex flex-col h-full shrink-0" id="sidebar-container">
      {/* Sidebar Header / Brand */}
      <div className="p-4 border-b border-ink-700 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-br from-ember-500 to-ember-400 rounded-lg flex items-center justify-center text-paper-50 shadow-sm shadow-ember-500/20">
            <BookOpen className="w-4 h-4" />
          </div>
          <span className="font-semibold text-paper-50 text-lg tracking-tight">Reflect.ai</span>
        </div>
        <button
          onClick={onNewEntry}
          id="sidebar-new-entry-btn"
          className="bg-ember-500 hover:bg-ember-600 text-paper-50 font-medium p-2 rounded-xl transition duration-150 shadow-sm shadow-ember-500/20 flex items-center justify-center cursor-pointer"
          title="New Journal Reflection"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation View Switcher */}
      <div className="px-4 py-3 flex border-b border-ink-850 gap-1" id="sidebar-navigation-view-switcher">
        <button
          onClick={() => onViewChange && onViewChange('workspace')}
          className={`flex-1 flex items-center justify-center space-x-1.5 py-2 text-center font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer ${
            currentView === 'workspace'
              ? 'bg-ink-850 text-paper-50 border border-ink-700'
              : 'text-paper-600 hover:text-paper-400'
          }`}
          id="toggle-reflections-view-btn"
        >
          <BookOpen className="w-3.5 h-3.5 shrink-0" />
          <span>Reflect</span>
        </button>
        <button
          onClick={() => onViewChange && onViewChange('insights')}
          className={`flex-1 flex items-center justify-center space-x-1.5 py-2 text-center font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer ${
            currentView === 'insights'
              ? 'bg-ink-850 text-paper-50 border border-ink-700'
              : 'text-paper-600 hover:text-paper-400'
          }`}
          id="toggle-insights-view-btn"
        >
          <BrainCircuit className="w-3.5 h-3.5 text-ember-500 shrink-0" />
          <span>Insights</span>
        </button>
        {user.role === 'admin' && (
          <button
            onClick={() => onViewChange && onViewChange('admin')}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-2 text-center font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer ${
              currentView === 'admin'
                ? 'bg-ember-950/40 text-ember-300 border border-ember-900/30'
                : 'text-ember-400/70 hover:text-ember-300'
            }`}
            id="toggle-admin-view-btn"
          >
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            <span>Admin</span>
          </button>
        )}
      </div>

      {/* Search Input */}
      <div className="px-4 pt-4 pb-2 space-y-2">
        <div className="relative">
          {semanticLoading
            ? <Loader2 className="absolute left-3 top-2.5 h-4 w-4 text-ember-500 animate-spin" />
            : <Search className="absolute left-3 top-2.5 h-4 w-4 text-paper-600" />}
          <input
            type="text"
            placeholder={semanticMode ? 'When have I felt like this before?' : 'Search reflections...'}
            value={searchQuery}
            onChange={(e) => {
              onSearchChange(e.target.value);
              if (semanticMode) { setSemanticResults(null); setSemanticError(null); }
            }}
            onKeyDown={(e) => {
              if (semanticMode && e.key === 'Enter') {
                e.preventDefault();
                runSemanticSearch();
              }
            }}
            className="w-full pl-9 pr-4 py-2 border border-ink-700 rounded-xl text-sm placeholder-paper-700 text-paper-400 focus:outline-none focus:border-ember-500 bg-ink-850 transition"
          />
        </div>

        {/* Keyword vs meaning */}
        <div className="flex items-center gap-1 bg-ink-850 border border-ink-700 rounded-xl p-0.5" role="group" aria-label="Search mode">
          <button
            type="button"
            onClick={() => { setSemanticMode(false); setSemanticResults(null); setSemanticError(null); }}
            aria-pressed={!semanticMode}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
              !semanticMode ? 'bg-ink-800 text-paper-50' : 'text-paper-600 hover:text-paper-400'
            }`}
          >
            <TypeIcon className="w-3 h-3" />
            <span>Keyword</span>
          </button>
          <button
            type="button"
            onClick={() => setSemanticMode(true)}
            aria-pressed={semanticMode}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
              semanticMode ? 'bg-ember-950 text-ember-300 border border-ember-900/40' : 'text-paper-600 hover:text-paper-400'
            }`}
          >
            <BrainCircuit className="w-3 h-3" />
            <span>Meaning</span>
          </button>
        </div>

        {semanticMode && (
          <div className="flex items-center justify-between text-[10px] text-paper-700 px-0.5">
            <span>{indexedEntries.length} of {entries.length} indexed</span>
            <button
              type="button"
              onClick={runSemanticSearch}
              disabled={!searchQuery.trim() || semanticLoading}
              className="text-ember-500 hover:text-ember-400 font-bold disabled:opacity-40 cursor-pointer"
            >
              {semanticLoading ? 'Searching…' : 'Search ↵'}
            </button>
          </div>
        )}

        {semanticError && (
          <p className="text-[10px] text-rose-400 leading-relaxed">{semanticError}</p>
        )}
      </div>

      {/* Filter Stats/Cleanups */}
      {hasActiveFilters && !(semanticMode && semanticResults) && (
        <div className="px-4 pb-2 flex items-center justify-between text-xs">
          <span className="text-paper-600 font-medium">{filteredEntries.length} entries found</span>
          <button 
            onClick={clearFilters}
            className="text-ember-500 hover:text-ember-400 flex items-center space-x-0.5 cursor-pointer font-semibold"
          >
            <FilterX className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>
      )}

      {/* Filters (Categories & Moods) */}
      <div className="px-4 py-2 space-y-3">
        {categories.length > 0 && (
          <div>
            <span className="text-[10px] uppercase tracking-wider font-bold text-paper-600 block mb-1">Categories</span>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => onCategoryChange('')}
                className={`px-2 py-0.5 rounded-full text-xs border transition cursor-pointer ${
                  !selectedCategory 
                    ? 'bg-ember-500 border-ember-500 text-paper-50' 
                    : 'bg-ink-850 border-ink-700 text-paper-400 hover:bg-ink-800'
                }`}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => onCategoryChange(cat)}
                  className={`px-2 py-0.5 rounded-full text-xs border transition cursor-pointer ${
                    selectedCategory === cat 
                      ? 'bg-ember-500 border-ember-500 text-paper-50' 
                      : 'bg-ink-850 border-ink-700 text-paper-400 hover:bg-ink-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}

        {moods.length > 0 && (
          <div>
            <span className="text-[10px] uppercase tracking-wider font-bold text-paper-600 block mb-1">Moods</span>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => onMoodChange('')}
                className={`px-2 py-0.5 rounded-full text-xs border transition cursor-pointer ${
                  !selectedMood 
                    ? 'bg-ember-500 border-ember-500 text-paper-50' 
                    : 'bg-ink-850 border-ink-700 text-paper-400 hover:bg-ink-800'
                }`}
              >
                All
              </button>
              {moods.map(md => (
                <button
                  key={md}
                  onClick={() => onMoodChange(md)}
                  className={`px-2 py-0.5 rounded-full text-xs border transition cursor-pointer ${
                    selectedMood === md 
                      ? 'bg-ember-500 border-ember-500 text-paper-50' 
                      : 'bg-ink-850 border-ink-700 text-paper-400 hover:bg-ink-800'
                  }`}
                >
                  {md}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Entries List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 border-t border-ink-700" id="sidebar-entries-list">
        {semanticMode && semanticResults ? (
          semanticResults.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <BrainCircuit className="w-8 h-8 text-ink-700 mx-auto mb-2" />
              <p className="text-sm font-medium text-paper-500">No related reflections</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider font-bold text-paper-600 px-2 pb-1">
                Closest in meaning
              </p>
              {semanticResults.map(({ entry, score }) => (
                <div key={entry.id} className="space-y-1 pt-1">
                  {/* In normal flow rather than an absolute overlay: a badge
                      positioned over the card was being painted behind it. */}
                  <div className="flex items-center gap-2 px-2">
                    <span className="text-[10px] font-bold text-ember-400 tabular shrink-0">
                      {(score * 100).toFixed(0)}% match
                    </span>
                    <span className="h-px flex-1 bg-ink-800" />
                  </div>
                  <SidebarEntryItem
                    entry={entry}
                    isSelected={entry.id === selectedEntryId}
                    onSelect={() => onSelectEntry(entry.id)}
                    onDelete={() => onDeleteEntry(entry.id)}
                    getMoodColor={getMoodColor}
                  />
                </div>
              ))}
            </div>
          )
        ) : filteredEntries.length === 0 ? (
          <div className="py-12 px-4 text-center">
            <BookOpen className="w-8 h-8 text-ink-700 mx-auto mb-2" />
            <p className="text-sm font-medium text-paper-500">No reflections yet</p>
            <p className="text-xs text-paper-700 mt-1">Start writing to preserve your inner voice.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {/*
              Motion earns its place here and nowhere else in this list: an
              entry being deleted cannot be animated with CSS, because by then
              React has unmounted it. `layout` slides the survivors up rather
              than snapping them.
            */}
            <AnimatePresence initial={false}>
              {filteredEntries.map((entry, index) => (
                <motion.div
                  key={entry.id}
                  layout
                  exit={{ opacity: 0, transform: 'translateX(-10px)' }}
                  transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                  className={staggerFirstLoad ? 'animate-rise' : undefined}
                  style={staggerFirstLoad ? { animationDelay: `${Math.min(index, 8) * 40}ms` } : undefined}
                >
                  <SidebarEntryItem
                    entry={entry}
                    isSelected={entry.id === selectedEntryId}
                    onSelect={() => onSelectEntry(entry.id)}
                    onDelete={() => onDeleteEntry(entry.id)}
                    getMoodColor={getMoodColor}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Bring your own Gemini key */}
      <div className="px-4 pt-3 border-t border-ink-700">
        <button
          type="button"
          onClick={() => setShowKeyPanel(v => !v)}
          className="w-full flex items-center justify-between text-[11px] font-bold text-paper-600 hover:text-paper-400 transition cursor-pointer"
          aria-expanded={showKeyPanel}
        >
          <span className="flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5" />
            <span>Gemini API key</span>
          </span>
          <span className={byokSaved ? 'text-emerald-400' : 'text-paper-700'}>
            {byokSaved ? 'Yours' : 'Managed'}
          </span>
        </button>

        {showKeyPanel && (
          <div className="mt-2 space-y-2">
            <input
              type="password"
              value={byokDraft}
              onChange={(e) => setByokDraft(e.target.value)}
              placeholder="AIza…"
              aria-label="Your Gemini API key"
              className="w-full px-3 py-1.5 bg-ink-850 border border-ink-700 rounded-lg text-[11px] text-paper-400 placeholder-ink-600 focus:outline-none focus:border-ember-500 font-mono"
            />
            {byokDraft.trim() && !GEMINI_KEY_SHAPE.test(byokDraft.trim()) && (
              <p className="text-[10px] text-rose-400">That does not look like a Gemini API key.</p>
            )}
            <p className="text-[10px] text-paper-700 leading-relaxed">
              Optional. Stored only in this browser — never written to the database.
              It is sent solely to call Gemini on your behalf. Leave empty to use the
              app's managed key from Secret Manager.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveByokKey}
                className="flex-1 bg-ember-500 hover:bg-ember-600 text-paper-50 text-[11px] font-bold py-1.5 rounded-lg transition cursor-pointer"
              >
                Save
              </button>
              {byokSaved && (
                <button
                  type="button"
                  onClick={() => { setByokDraft(''); setStoredByokKey(null); setByokSaved(false); }}
                  className="px-3 bg-ink-850 border border-ink-700 text-paper-500 hover:text-paper-400 text-[11px] font-bold py-1.5 rounded-lg transition cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* User Information Profile Area */}
      <div className="p-4 border-t border-ink-700" id="user-profile-footer">
        <div className="flex items-center gap-3 p-2 bg-ink-850 rounded-xl border border-ink-700 overflow-hidden">
          {user.photoURL ? (
            <img 
              src={user.photoURL} 
              alt={user.displayName || 'Profile'} 
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover border border-ink-700 shadow-sm"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-ember-500 text-paper-50 flex items-center justify-center font-bold text-xs">
              {user.displayName ? user.displayName[0].toUpperCase() : 'U'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-paper-50 truncate">{user.displayName || 'Reflective Mind'}</p>
            <p className="text-[10px] text-paper-600 truncate">{user.email || 'Private Account'}</p>
          </div>

          <button
            onClick={onSignOut}
            id="logout-btn"
            className="p-1 hover:bg-ink-850 text-paper-600 hover:text-ember-400 rounded-lg transition cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
