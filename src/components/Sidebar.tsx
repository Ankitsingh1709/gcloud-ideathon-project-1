import React from 'react';
import { JournalEntry, UserProfile } from '../types';
import { 
  LogOut, Plus, Search, BookOpen, 
  Calendar, Hash, Smile, Sparkles, FilterX 
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
  onDeleteEntry
}: SidebarProps) {

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

      {/* Search Input */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#666]" />
          <input
            type="text"
            placeholder="Search reflections..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-[#333] rounded-xl text-sm placeholder-[#555] text-[#ccc] focus:outline-none focus:border-[#8b5cf6] bg-[#1a1a1a] transition"
          />
        </div>
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
        {filteredEntries.length === 0 ? (
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
