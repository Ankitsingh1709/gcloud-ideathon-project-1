import React, { useState } from 'react';
import { JournalEntry, UserProfile } from '../types';
import { postJson, getStoredByokKey, setStoredByokKey, GEMINI_KEY_SHAPE } from '../lib/api';
import { cosineSimilarity } from '../lib/vector';
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

  const getMoodColor = (mood: string) => {
    switch (mood.toLowerCase()) {
      case 'calm': return 'bg-teal-950/40 text-teal-300 border-teal-900/40';
      case 'grateful': return 'bg-amber-950/40 text-amber-300 border-amber-900/40';
      case 'anxious': return 'bg-rose-950/40 text-rose-300 border-rose-900/40';
      case 'excited': return 'bg-sky-950/40 text-sky-300 border-sky-900/40';
      case 'reflective': return 'bg-[#1e1b26] text-[#8b5cf6] border-[#4c1d95]/30';
      case 'melancholy': return 'bg-violet-950/40 text-violet-300 border-violet-900/40';
      case 'motivated': return 'bg-emerald-950/40 text-emerald-300 border-emerald-900/40';
      default: return 'bg-[#1e1e1e] text-[#ccc] border-[#333]';
    }
  };

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
    <aside className="w-80 border-r border-[#2a2a2a] bg-[#121212] flex flex-col h-full shrink-0" id="sidebar-container">
      {/* Sidebar Header / Brand */}
      <div className="p-4 border-b border-[#2a2a2a] flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-br from-[#8b5cf6] to-[#d946ef] rounded-lg flex items-center justify-center text-white shadow-sm shadow-[#8b5cf6]/20">
            <BookOpen className="w-4 h-4" />
          </div>
          <span className="font-semibold text-white text-lg tracking-tight">Reflect.ai</span>
        </div>
        <button
          onClick={onNewEntry}
          id="sidebar-new-entry-btn"
          className="bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-medium p-2 rounded-xl transition duration-150 shadow-sm shadow-[#8b5cf6]/20 flex items-center justify-center cursor-pointer"
          title="New Journal Reflection"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation View Switcher */}
      <div className="px-4 py-3 flex border-b border-[#1c1c1c] gap-1" id="sidebar-navigation-view-switcher">
        <button
          onClick={() => onViewChange && onViewChange('workspace')}
          className={`flex-1 flex items-center justify-center space-x-1.5 py-2 text-center font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer ${
            currentView === 'workspace'
              ? 'bg-[#1a1a1a] text-white border border-[#2a2a2a]'
              : 'text-[#666] hover:text-[#ccc]'
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
              ? 'bg-[#1a1a1a] text-white border border-[#2a2a2a]'
              : 'text-[#666] hover:text-[#ccc]'
          }`}
          id="toggle-insights-view-btn"
        >
          <BrainCircuit className="w-3.5 h-3.5 text-[#8b5cf6] shrink-0" />
          <span>Insights</span>
        </button>
        {user.role === 'admin' && (
          <button
            onClick={() => onViewChange && onViewChange('admin')}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-2 text-center font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer ${
              currentView === 'admin'
                ? 'bg-purple-950/40 text-purple-200 border border-purple-900/30'
                : 'text-purple-400/70 hover:text-purple-300'
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
            ? <Loader2 className="absolute left-3 top-2.5 h-4 w-4 text-[#8b5cf6] animate-spin" />
            : <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#666]" />}
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
            className="w-full pl-9 pr-4 py-2 border border-[#333] rounded-xl text-sm placeholder-[#555] text-[#ccc] focus:outline-none focus:border-[#8b5cf6] bg-[#1a1a1a] transition"
          />
        </div>

        {/* Keyword vs meaning */}
        <div className="flex items-center gap-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-0.5" role="group" aria-label="Search mode">
          <button
            type="button"
            onClick={() => { setSemanticMode(false); setSemanticResults(null); setSemanticError(null); }}
            aria-pressed={!semanticMode}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
              !semanticMode ? 'bg-[#252525] text-white' : 'text-[#666] hover:text-[#aaa]'
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
              semanticMode ? 'bg-[#2a1f3d] text-[#c4b5fd] border border-[#4c1d95]/40' : 'text-[#666] hover:text-[#aaa]'
            }`}
          >
            <BrainCircuit className="w-3 h-3" />
            <span>Meaning</span>
          </button>
        </div>

        {semanticMode && (
          <div className="flex items-center justify-between text-[10px] text-[#555] px-0.5">
            <span>{indexedEntries.length} of {entries.length} indexed</span>
            <button
              type="button"
              onClick={runSemanticSearch}
              disabled={!searchQuery.trim() || semanticLoading}
              className="text-[#8b5cf6] hover:text-[#d946ef] font-bold disabled:opacity-40 cursor-pointer"
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
      {hasActiveFilters && (
        <div className="px-4 pb-2 flex items-center justify-between text-xs">
          <span className="text-[#666] font-medium">{filteredEntries.length} entries found</span>
          <button 
            onClick={clearFilters}
            className="text-[#8b5cf6] hover:text-[#d946ef] flex items-center space-x-0.5 cursor-pointer font-semibold"
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
            <span className="text-[10px] uppercase tracking-wider font-bold text-[#666] block mb-1">Categories</span>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => onCategoryChange('')}
                className={`px-2 py-0.5 rounded-full text-xs border transition cursor-pointer ${
                  !selectedCategory 
                    ? 'bg-[#8b5cf6] border-[#8b5cf6] text-white' 
                    : 'bg-[#1a1a1a] border-[#333] text-[#ccc] hover:bg-[#222]'
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
                      ? 'bg-[#8b5cf6] border-[#8b5cf6] text-white' 
                      : 'bg-[#1a1a1a] border-[#333] text-[#ccc] hover:bg-[#222]'
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
            <span className="text-[10px] uppercase tracking-wider font-bold text-[#666] block mb-1">Moods</span>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => onMoodChange('')}
                className={`px-2 py-0.5 rounded-full text-xs border transition cursor-pointer ${
                  !selectedMood 
                    ? 'bg-[#8b5cf6] border-[#8b5cf6] text-white' 
                    : 'bg-[#1a1a1a] border-[#333] text-[#ccc] hover:bg-[#222]'
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
                      ? 'bg-[#8b5cf6] border-[#8b5cf6] text-white' 
                      : 'bg-[#1a1a1a] border-[#333] text-[#ccc] hover:bg-[#222]'
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
      <div className="flex-1 overflow-y-auto px-2 py-2 border-t border-[#2a2a2a]" id="sidebar-entries-list">
        {semanticMode && semanticResults ? (
          semanticResults.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <BrainCircuit className="w-8 h-8 text-[#333] mx-auto mb-2" />
              <p className="text-sm font-medium text-[#888]">No related reflections</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider font-bold text-[#666] px-2 pb-1">
                Closest in meaning
              </p>
              {semanticResults.map(({ entry, score }) => (
                <div key={entry.id} className="relative">
                  <span className="absolute right-2 top-2 z-10 text-[9px] font-bold text-[#8b5cf6] bg-[#1e1b26] border border-[#4c1d95]/30 px-1.5 py-0.5 rounded-full pointer-events-none">
                    {(score * 100).toFixed(0)}%
                  </span>
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
            <BookOpen className="w-8 h-8 text-[#333] mx-auto mb-2" />
            <p className="text-sm font-medium text-[#888]">No reflections yet</p>
            <p className="text-xs text-[#555] mt-1">Start writing to preserve your inner voice.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredEntries.map(entry => (
              <SidebarEntryItem
                key={entry.id}
                entry={entry}
                isSelected={entry.id === selectedEntryId}
                onSelect={() => onSelectEntry(entry.id)}
                onDelete={() => onDeleteEntry(entry.id)}
                getMoodColor={getMoodColor}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bring your own Gemini key */}
      <div className="px-4 pt-3 border-t border-[#2a2a2a]">
        <button
          type="button"
          onClick={() => setShowKeyPanel(v => !v)}
          className="w-full flex items-center justify-between text-[11px] font-bold text-[#666] hover:text-[#aaa] transition cursor-pointer"
          aria-expanded={showKeyPanel}
        >
          <span className="flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5" />
            <span>Gemini API key</span>
          </span>
          <span className={byokSaved ? 'text-emerald-400' : 'text-[#555]'}>
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
              className="w-full px-3 py-1.5 bg-[#1a1a1a] border border-[#333] rounded-lg text-[11px] text-[#ccc] placeholder-[#444] focus:outline-none focus:border-[#8b5cf6] font-mono"
            />
            {byokDraft.trim() && !GEMINI_KEY_SHAPE.test(byokDraft.trim()) && (
              <p className="text-[10px] text-rose-400">That does not look like a Gemini API key.</p>
            )}
            <p className="text-[10px] text-[#555] leading-relaxed">
              Optional. Stored only in this browser — never written to the database.
              It is sent solely to call Gemini on your behalf. Leave empty to use the
              app's managed key from Secret Manager.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveByokKey}
                className="flex-1 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-[11px] font-bold py-1.5 rounded-lg transition cursor-pointer"
              >
                Save
              </button>
              {byokSaved && (
                <button
                  type="button"
                  onClick={() => { setByokDraft(''); setStoredByokKey(null); setByokSaved(false); }}
                  className="px-3 bg-[#1a1a1a] border border-[#333] text-[#888] hover:text-[#ccc] text-[11px] font-bold py-1.5 rounded-lg transition cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* User Information Profile Area */}
      <div className="p-4 border-t border-[#2a2a2a]" id="user-profile-footer">
        <div className="flex items-center gap-3 p-2 bg-[#1e1e1e] rounded-xl border border-[#333] overflow-hidden">
          {user.photoURL ? (
            <img 
              src={user.photoURL} 
              alt={user.displayName || 'Profile'} 
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover border border-[#2a2a2a] shadow-sm"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#8b5cf6] text-white flex items-center justify-center font-bold text-xs">
              {user.displayName ? user.displayName[0].toUpperCase() : 'U'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">{user.displayName || 'Reflective Mind'}</p>
            <p className="text-[10px] text-[#666] truncate">{user.email || 'Private Account'}</p>
          </div>

          <button
            onClick={onSignOut}
            id="logout-btn"
            className="p-1 hover:bg-[#1a1a1a] text-[#666] hover:text-[#d946ef] rounded-lg transition cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
