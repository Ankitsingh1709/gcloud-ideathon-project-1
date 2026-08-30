import React, { useState, useRef, useEffect } from 'react';
import { JournalEntry, Message } from '../types';
import { auth } from '../lib/firebase';
import { 
  Sparkles, Send, Save, CheckCircle, AlertTriangle, 
  RefreshCw, Smile, Hash, BookOpen, BrainCircuit, Feather
} from 'lucide-react';

interface MainDashboardProps {
  entry: JournalEntry | null;
  onSaveEntry: (entry: JournalEntry) => Promise<void>;
  onNewEntry: () => void;
  onDeleteEntry?: (id: string) => Promise<void>;
}

export default function MainDashboard({
  entry,
  onSaveEntry,
  onNewEntry,
  onDeleteEntry
}: MainDashboardProps) {
  const [inputText, setInputText] = useState('');
  const [loadingReflection, setLoadingReflection] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  
  // Persistence state tracking
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastErrorMessage, setLastErrorMessage] = useState('');

  const [localTitle, setLocalTitle] = useState('');

  // Keep local title in sync with current entry
  useEffect(() => {
    if (entry) {
      setLocalTitle(entry.title || '');
    } else {
      setLocalTitle('');
    }
  }, [entry?.id, entry?.title]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entry?.messages, loadingReflection]);

  if (!entry) {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col items-center justify-center p-8 text-center" id="empty-state-workspace">
        <div className="w-full max-w-md bg-[#121212] rounded-3xl p-8 border border-[#2a2a2a] shadow-2xl space-y-6">
          <div className="bg-[#1e1b26] border border-[#4c1d95]/30 p-4 rounded-3xl text-[#8b5cf6] inline-block">
            <Feather className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">Your Reflection Workspace</h2>
            <p className="text-[#888] text-sm leading-relaxed">
              Begin a fresh, private reflection space or select an entry from your journal history to continue exploring your awareness.
            </p>
          </div>
          <button
            onClick={onNewEntry}
            id="empty-state-new-entry-btn"
            className="w-full bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-semibold py-3 rounded-xl transition duration-150 shadow-lg hover:shadow-[#8b5cf6]/20 cursor-pointer"
          >
            Create New Reflection
          </button>
        </div>
      </div>
    );
  }

  // Clean payload helper to prevent Firebase database driver from crashing on undefined properties
  const sanitizePayloadForFirebase = (rawObj: any): any => {
    return JSON.parse(JSON.stringify(rawObj, (_, val) => (val === undefined ? null : val)));
  };

  const handleManualSave = async () => {
    setSaveStatus('saving');
    try {
      const sanitized = sanitizePayloadForFirebase(entry);
      await onSaveEntry(sanitized);
      setSaveStatus('saved');
    } catch (err: any) {
      console.error('Save error:', err);
      setSaveStatus('error');
      setLastErrorMessage(err?.message || 'Database connection error.');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || loadingReflection) return;

    const userMessageContent = inputText.trim();
    setInputText('');

    // 1. Setup new message object
    const userMessage: Message = {
      role: 'user',
      content: userMessageContent,
      timestamp: Date.now()
    };

    // Update entry state locally
    const updatedMessages = [...entry.messages, userMessage];
    const interimEntry: JournalEntry = {
      ...entry,
      messages: updatedMessages,
      updatedAt: Date.now(),
      isDraft: true
    };

    // Promptly save the user's input before starting generation (Completeness Guarantee)
    setSaveStatus('saving');
    try {
      await onSaveEntry(sanitizePayloadForFirebase(interimEntry));
      setSaveStatus('saved');
    } catch (err: any) {
      console.error('Failed to pre-save user input:', err);
      setSaveStatus('error');
      setLastErrorMessage('Failed to save your input. Reconnecting...');
      // Retain user input in text field so they don't lose it if write fails
      setInputText(userMessageContent);
      return;
    }

    // 2. Fetch Reflection from Express backend proxy
    setLoadingReflection(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Authentication expired. Please sign in again.');

      const response = await fetch('/api/gemini/reflect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ messages: updatedMessages })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Server failed to process reflection.');
      }

      const result = await response.json();
      const modelMessage: Message = {
        role: 'model',
        content: result.response,
        timestamp: Date.now()
      };

      const finalMessages = [...updatedMessages, modelMessage];
      const completedEntry: JournalEntry = {
        ...interimEntry,
        messages: finalMessages,
        updatedAt: Date.now()
      };

      // Save complete thread immediately
      await onSaveEntry(sanitizePayloadForFirebase(completedEntry));
      setSaveStatus('saved');
    } catch (err: any) {
      console.error('Reflection Generation Error:', err);
      setSaveStatus('error');
      setLastErrorMessage(err?.message || 'AI engine was unreachable. Please try again.');
    } finally {
      setLoadingReflection(false);
    }
  };

  const handleGenerateSummaryAndMetadata = async () => {
    if (entry.messages.length === 0 || loadingAnalysis) return;

    setLoadingAnalysis(true);
    setSaveStatus('saving');

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Session expired. Please log in.');

      // Bundle all message text to analyze
      const conversationText = entry.messages
        .map(m => `${m.role === 'user' ? 'User' : 'Gemini'}: ${m.content}`)
        .join('\n');

      const response = await fetch('/api/gemini/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ text: conversationText })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Server failed to analyze conversation.');
      }

      const meta = await response.json();
      
      const analyzedEntry: JournalEntry = {
        ...entry,
        title: meta.title || entry.title,
        summary: meta.summary || entry.summary,
        category: meta.category || entry.category,
        mood: meta.mood || entry.mood,
        isDraft: false, // Save finalized states
        updatedAt: Date.now()
      };

      await onSaveEntry(sanitizePayloadForFirebase(analyzedEntry));
      setSaveStatus('saved');
    } catch (err: any) {
      console.error('Analysis generation failed:', err);
      setSaveStatus('error');
      setLastErrorMessage(err?.message || 'Failed to synthesize reflection summary.');
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const getMoodBadgeColor = (mood: string) => {
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

  return (
    <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full overflow-hidden" id="workspace-container">
      {/* Workspace Header */}
      <header className="px-6 py-4 border-b border-[#2a2a2a] bg-[#0c0c0c]/80 backdrop-blur-md flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center space-x-3 overflow-hidden">
          <div className="bg-[#1e1b26] border border-[#4c1d95]/30 p-2 rounded-xl text-[#8b5cf6] shrink-0">
            <Feather className="w-5 h-5" />
          </div>
          <div className="overflow-hidden flex flex-col justify-center">
            <input
              type="text"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              onBlur={async () => {
                if (!entry || localTitle === entry.title) return;
                const updated = {
                  ...entry,
                  title: localTitle,
                  updatedAt: Date.now()
                };
                setSaveStatus('saving');
                try {
                  await onSaveEntry(sanitizePayloadForFirebase(updated));
                  setSaveStatus('saved');
                } catch (err: any) {
                  setSaveStatus('error');
                  setLastErrorMessage(err?.message || 'Failed to update title.');
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              placeholder="Title your reflection..."
              className="bg-transparent border-b border-transparent hover:border-[#333] focus:border-[#8b5cf6] text-base font-bold text-white focus:outline-none py-0.5 rounded transition max-w-xs md:max-w-md"
              id="title-input-header"
            />
            <div className="flex items-center space-x-2 mt-0.5">
              <span className="text-[#666] text-xs font-semibold">
                Created {new Date(entry.createdAt).toLocaleDateString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
              {entry.isDraft && (
                <span className="text-[10px] uppercase font-bold tracking-wider bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] px-1.5 py-0.5 rounded-full">
                  Draft
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Sync / State Alerts */}
        <div className="flex items-center space-x-3 shrink-0">
          {saveStatus === 'saving' && (
            <div className="flex items-center space-x-1.5 text-xs text-[#ccc] bg-[#1e1e1e] border border-[#333] px-3 py-1.5 rounded-full animate-pulse font-semibold">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#8b5cf6]" />
              <span>Saving...</span>
            </div>
          )}
          {saveStatus === 'saved' && (
            <div className="flex items-center space-x-1.5 text-xs text-[#8b5cf6] bg-[#1e1b26] border border-[#4c1d95]/30 px-3 py-1.5 rounded-full font-semibold">
              <CheckCircle className="w-3.5 h-3.5 text-[#d946ef]" />
              <span>Saved</span>
            </div>
          )}
          {saveStatus === 'error' && (
            <button 
              onClick={handleManualSave}
              className="flex items-center space-x-1.5 text-xs text-rose-400 bg-rose-950/20 hover:bg-rose-950/30 px-3 py-1.5 rounded-full font-semibold border border-rose-900/50 cursor-pointer"
              title={lastErrorMessage}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Save Failed (Retry)</span>
            </button>
          )}

          <button
            onClick={handleManualSave}
            disabled={saveStatus === 'saving'}
            id="workspace-manual-save-btn"
            className="flex items-center space-x-1.5 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-semibold text-xs px-3.5 py-2 rounded-xl transition disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Thread</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Dynamic AI Insights Pane (Sticky or Top on small screens) */}
        <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-[#2a2a2a] bg-[#121212] p-6 flex flex-col justify-between overflow-y-auto shrink-0 space-y-6">
          <div className="space-y-6">
            <div>
              <div className="flex items-center space-x-2 text-white font-bold text-sm mb-3">
                <BrainCircuit className="w-4.5 h-4.5 text-[#8b5cf6]" />
                <span>AI Reflection Insights</span>
              </div>
              <p className="text-xs text-[#888] leading-relaxed">
                Reflect freely in the thread. Once you finish conversing, click the button below to have Gemini synthesize dynamic tags, summaries, and category fields.
              </p>
            </div>

            {/* Title Insight */}
            <div className="space-y-1.5 bg-[#1a1a1a] p-4 rounded-2xl border border-[#333]">
              <span className="text-[10px] font-bold text-[#666] uppercase tracking-wider block">Generated Title</span>
              <input
                type="text"
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                onBlur={async () => {
                  if (!entry || localTitle === entry.title) return;
                  const updated = {
                    ...entry,
                    title: localTitle,
                    updatedAt: Date.now()
                  };
                  setSaveStatus('saving');
                  try {
                    await onSaveEntry(sanitizePayloadForFirebase(updated));
                    setSaveStatus('saved');
                  } catch (err: any) {
                    setSaveStatus('error');
                    setLastErrorMessage(err?.message || 'Failed to update title.');
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Untitled Space"
                className="w-full bg-transparent border-b border-transparent hover:border-[#333] focus:border-[#8b5cf6] font-semibold text-white text-sm focus:outline-none py-0.5 rounded transition"
                id="title-input-insights"
              />
            </div>

            {/* Mood & Category Insight */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 bg-[#1a1a1a] p-3 rounded-xl border border-[#333]">
                <span className="text-[10px] font-bold text-[#666] uppercase tracking-wider block">Category</span>
                {entry.category ? (
                  <span className="inline-flex items-center text-xs font-semibold text-[#ccc] mt-1">
                    <Hash className="w-3.5 h-3.5 mr-0.5 text-[#666]" />
                    {entry.category}
                  </span>
                ) : (
                  <span className="text-xs text-[#555] mt-1 block font-medium">None yet</span>
                )}
              </div>

              <div className="space-y-1 bg-[#1a1a1a] p-3 rounded-xl border border-[#333]">
                <span className="text-[10px] font-bold text-[#666] uppercase tracking-wider block">Detected Mood</span>
                {entry.mood ? (
                  <span className={`inline-flex items-center text-xs font-bold border px-2 py-0.5 rounded-full mt-1 ${getMoodBadgeColor(entry.mood)}`}>
                    <Smile className="w-3.5 h-3.5 mr-0.5 opacity-85" />
                    {entry.mood}
                  </span>
                ) : (
                  <span className="text-xs text-[#555] mt-1 block font-medium">None yet</span>
                )}
              </div>
            </div>

            {/* AI Summary Card */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-[#666] uppercase tracking-wider block">AI Conversation Summary</span>
              {entry.summary ? (
                <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-4 text-xs text-[#ccc] leading-relaxed shadow-sm">
                  {entry.summary}
                </div>
              ) : (
                <div className="bg-transparent border-2 border-dashed border-[#333] rounded-2xl p-5 text-center text-xs text-[#555]">
                  No summary synthesized. Write a reflection and trigger synthesis below.
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-[#2a2a2a]">
            <button
              onClick={handleGenerateSummaryAndMetadata}
              disabled={entry.messages.length === 0 || loadingAnalysis}
              id="synthesize-insights-btn"
              className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-[#8b5cf6] to-[#d946ef] hover:opacity-90 text-white font-bold text-xs px-4 py-3 rounded-xl shadow-md disabled:opacity-40 cursor-pointer transition"
            >
              {loadingAnalysis ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Sparkles className="w-4.5 h-4.5" />
                  <span>Synthesize & Catalog</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Conversation / Typing Panel */}
        <div className="flex-1 flex flex-col justify-between bg-[#0a0a0a] overflow-hidden h-full">
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6" id="messages-container">
            {entry.messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
                <div className="bg-[#121212] p-4 rounded-3xl border border-[#2a2a2a] shadow-lg">
                  <Feather className="w-6 h-6 text-[#8b5cf6]" />
                </div>
                <h3 className="text-base font-bold text-white">Start Your Reflection Journal</h3>
                <p className="text-xs text-[#888] leading-relaxed">
                  Reflect on your day, write about your current feelings, or ask Gemini for guidance. Type your thoughts below and converse securely.
                </p>
              </div>
            ) : (
              <div className="space-y-6 max-w-3xl mx-auto">
                {entry.messages.map((message, idx) => {
                  const isUser = message.role === 'user';
                  return (
                    <div 
                      key={idx}
                      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-xl rounded-2xl px-5 py-3.5 text-sm leading-relaxed shadow-lg ${
                        isUser 
                          ? 'bg-[#8b5cf6] text-white rounded-br-none' 
                          : 'bg-[#121212] text-[#ccc] border border-[#2a2a2a] rounded-bl-none'
                      }`}>
                        <div className={`font-semibold text-[10px] opacity-75 uppercase tracking-wider mb-1.5 ${isUser ? 'text-white' : 'text-[#8b5cf6]'}`}>
                          {isUser ? 'Your Journal Reflection' : 'Gemini Companion'}
                        </div>
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        <div className="text-[9px] opacity-50 mt-1.5 text-right">
                          {new Date(message.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Loading typing bubble */}
                {loadingReflection && (
                  <div className="flex justify-start">
                    <div className="bg-[#121212] border border-[#2a2a2a] rounded-2xl rounded-bl-none px-5 py-4 max-w-xs shadow-lg">
                      <div className="font-semibold text-[10px] opacity-75 uppercase tracking-wider mb-1.5 text-[#8b5cf6] flex items-center space-x-1">
                        <Sparkles className="w-3 h-3 text-[#d946ef] animate-pulse" />
                        <span>Gemini is reflecting...</span>
                      </div>
                      <div className="flex space-x-1.5 py-1">
                        <div className="w-2 h-2 bg-[#8b5cf6] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-[#8b5cf6] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-[#8b5cf6] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Prompt Entry Box */}
          <div className="p-4 border-t border-[#2a2a2a] bg-[#0c0c0c]">
            <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto flex items-end space-x-3">
              <div className="flex-1 bg-[#121212] border border-[#2a2a2a] rounded-2xl px-4 py-2.5 flex items-end">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Express your thoughts or converse with Gemini..."
                  rows={2}
                  className="flex-1 bg-transparent border-none resize-none focus:outline-none text-sm placeholder-[#555] text-[#ccc]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={!inputText.trim() || loadingReflection}
                id="message-send-btn"
                className="bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-semibold p-3.5 rounded-2xl transition duration-150 disabled:opacity-40 shadow-lg cursor-pointer shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
