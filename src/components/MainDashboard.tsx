import React, { useState, useRef, useEffect } from 'react';
import { JournalEntry, Message } from '../types';
import { postJson, postStream } from '../lib/api';
import { useSpeechRecognition } from '../lib/useSpeechRecognition';
import { getMoodColor } from '../lib/mood';
import { 
  Sparkles, Send, Save, CheckCircle, AlertTriangle, 
  RefreshCw, Smile, Hash, BookOpen, BrainCircuit, Feather,
  Calendar, Clock, ChevronDown, ChevronUp, Plus, Mic, Maximize2, Minimize2
} from 'lucide-react';
import MapPicker from './MapPicker';

interface MainDashboardProps {
  entry: JournalEntry | null;
  onSaveEntry: (entry: JournalEntry) => Promise<void>;
  onNewEntry: () => void;
  onDeleteEntry?: (id: string) => Promise<void>;
  entries?: JournalEntry[];
  onSelectEntry?: (id: string) => void;
}

export default function MainDashboard({
  entry,
  onSaveEntry,
  onNewEntry,
  onDeleteEntry,
  entries = [],
  onSelectEntry
}: MainDashboardProps) {
  const [inputText, setInputText] = useState('');
  const [loadingReflection, setLoadingReflection] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  
  // Persistence state tracking
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastErrorMessage, setLastErrorMessage] = useState('');
  const [hasReflectionError, setHasReflectionError] = useState(false);

  // The reply currently arriving token by token, before it is persisted.
  const [streamingText, setStreamingText] = useState('');

  // Voice journaling on the native Web Speech API: the browser transcribes,
  // and only the resulting text is ever sent anywhere.
  const voice = useSpeechRecognition((transcript: string) => {
    setInputText(prev => (prev ? `${prev.trim()} ${transcript.trim()}` : transcript.trim()));
  });

  const [localTitle, setLocalTitle] = useState('');

  // On This Day milestone states
  const [onThisDayMatches, setOnThisDayMatches] = useState<{
    entry: JournalEntry;
    label: string;
    formattedDate: string;
  }[]>([]);
  const [isOnThisDayExpanded, setIsOnThisDayExpanded] = useState(false);
  const [seedingMilestone, setSeedingMilestone] = useState<string | null>(null);

  // The details/location pane folds away at every width so the conversation can
  // take the screen. It stays closed until there is room for three columns —
  // sidebar + pane + thread only fits from lg up.
  const [showDetails, setShowDetails] = useState(() => window.innerWidth >= 1024);

  // Milestone matching logic
  useEffect(() => {
    if (!entries || entries.length === 0) {
      setOnThisDayMatches([]);
      return;
    }

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const matches: {
      entry: JournalEntry;
      label: string;
      formattedDate: string;
    }[] = [];

    entries.forEach((e) => {
      // Exclude currently active entry
      if (entry && e.id === entry.id) return;

      const diffMs = now - e.createdAt;
      const diffDays = diffMs / oneDayMs;

      let label = '';
      if (diffDays >= 5 && diffDays <= 9) {
        label = '1 week ago';
      } else if (diffDays >= 25 && diffDays <= 35) {
        label = '1 month ago';
      } else if (diffDays >= 340 && diffDays <= 385) {
        label = '1 year ago';
      }

      if (label) {
        matches.push({
          entry: e,
          label,
          formattedDate: new Date(e.createdAt).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
          })
        });
      }
    });

    setOnThisDayMatches(matches);
  }, [entries, entry?.id]);

  const handleSeedPastEntry = async (daysAgo: number) => {
    const milestoneLabel = daysAgo === 7 ? '1 week ago' : daysAgo === 30 ? '1 month ago' : '1 year ago';
    setSeedingMilestone(milestoneLabel);
    
    const pastTimestamp = Date.now() - (daysAgo * 24 * 60 * 60 * 1000);
    const newId = `ref-${pastTimestamp}-${Math.floor(Math.random() * 1000)}`;
    
    let title = '';
    let category = '';
    let mood = '';
    let summary = '';
    let userMsg = '';
    let geminiMsg = '';

    if (daysAgo === 7) {
      title = 'Seeking Daily Flow';
      category = '#Habits';
      mood = '🧘 Serene';
      userMsg = 'I want to focus on my writing routine and build morning habits. But I feel distracted by notifications and tasks.';
      geminiMsg = 'Building a distraction-free space is key. Try creating tiny habits—like writing for just five minutes without your phone nearby. Consistent rhythm always beats intensity.';
      summary = 'An exploration on establishing early morning writing habits and managing digital distractions.';
    } else if (daysAgo === 30) {
      title = 'Connecting with Nature';
      category = '#Personal';
      mood = '😊 Joy';
      userMsg = 'Had a gorgeous hike today through the cedar pines. Smelling the damp forest floor made me feel so grounded and alive.';
      geminiMsg = 'Spending intentional time in nature has a beautiful grounding effect. Hold on to this feeling of vitality—it is a great anchor for busy or stressful days.';
      summary = 'A refreshing record of grounding nature walks, forest therapy, and emotional renewal.';
    } else {
      title = 'Year End Aspirations';
      category = '#Work';
      mood = '💪 Motivated';
      userMsg = 'Reflecting on my long-term goals. I want to build things that matter, simplify my routine, and learn to write cleaner code.';
      geminiMsg = 'Simplification is a highly powerful tool. By refining your goals to a few core aspirations, you gain tremendous focus. Keep simplifying and creating with purpose.';
      summary = 'Yearly goals review focused on professional simplicity, deep craft excellence, and clean development habits.';
    }

    const seededEntry: JournalEntry = {
      id: newId,
      title,
      createdAt: pastTimestamp,
      updatedAt: pastTimestamp,
      messages: [
        {
          role: 'user',
          content: userMsg,
          timestamp: pastTimestamp
        },
        {
          role: 'model',
          content: geminiMsg,
          timestamp: pastTimestamp + 5000
        }
      ],
      summary,
      category,
      mood,
      isDraft: false
    };

    try {
      await onSaveEntry(seededEntry);
      setSaveStatus('saved');
    } catch (err: any) {
      console.error('Failed to seed past entry:', err);
    } finally {
      setSeedingMilestone(null);
    }
  };

  const handleReflectOnPastEntry = (match: { entry: JournalEntry; label: string; formattedDate: string }) => {
    onNewEntry();
    const dateStr = match.formattedDate;
    const moodStr = match.entry.mood ? ` (Mood was ${match.entry.mood})` : '';
    const titleStr = match.entry.title ? ` "${match.entry.title}"` : ' untitled reflection';
    
    setInputText(
      `Today I am revisiting my reflection from ${match.label} (written on ${dateStr}${moodStr}) titled${titleStr}.\n\nBack then, my key focus was:\n> ${match.entry.summary || 'Exploring my routine and feelings.'}\n\nLooking back at that reflection, here is how I feel today...`
    );
  };

  // Keep local title in sync with current entry & reset error state
  useEffect(() => {
    setHasReflectionError(false);
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
  }, [entry?.messages, loadingReflection, streamingText]);

  if (!entry) {
    return (
      <div className="flex-1 bg-ink-950 flex flex-col items-center justify-center p-8 text-center" id="empty-state-workspace">
        <div className="w-full max-w-md bg-ink-900 rounded-3xl p-8 border border-ink-700 shadow-2xl space-y-6">
          <div className="bg-ember-950 border border-ember-900/30 p-4 rounded-3xl text-ember-500 inline-block">
            <Feather className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-paper-50">Your Reflection Workspace</h2>
            <p className="text-paper-500 text-sm leading-relaxed">
              Begin a fresh, private reflection space or select an entry from your journal history to continue exploring your awareness.
            </p>
          </div>
          <button
            onClick={onNewEntry}
            id="empty-state-new-entry-btn"
            className="w-full bg-ember-500 hover:bg-ember-600 text-ink-950 font-semibold py-3 rounded-xl transition duration-150 shadow-lg hover:shadow-ember-500/20 cursor-pointer"
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
    setHasReflectionError(false);

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

    // 2. Stream the reflection from the Express proxy.
    setLoadingReflection(true);
    setStreamingText('');
    try {
      let streamed = '';

      try {
        await postStream('/api/gemini/reflect/stream', { messages: updatedMessages }, (text) => {
          streamed += text;
          setStreamingText(streamed);
        });
        // A stream can succeed and still say nothing. Treat that as a failure
        // here, inside the try, so it falls back like any other — the
        // non-streaming route answers a provider refusal with care, and
        // throwing outside this block would skip it entirely.
        if (!streamed) throw new Error('The reflection came back empty.');
      } catch (streamErr: any) {
        // Falling back is only safe before anything reached the screen;
        // retrying afterwards would replay text the user already watched.
        if (streamed) throw streamErr;
        const result = await postJson<{ response: string }>('/api/gemini/reflect', {
          messages: updatedMessages
        });
        streamed = result.response;
      }

      if (!streamed) throw new Error('The reflection came back empty. Please try again.');

      const modelMessage: Message = {
        role: 'model',
        content: streamed,
        timestamp: Date.now()
      };

      const finalMessages = [...updatedMessages, modelMessage];
      const completedEntry: JournalEntry = {
        ...interimEntry,
        messages: finalMessages,
        updatedAt: Date.now()
      };

      // One write at the end. Saving per chunk would be a write storm.
      await onSaveEntry(sanitizePayloadForFirebase(completedEntry));
      setSaveStatus('saved');
    } catch (err: any) {
      console.error('Reflection Generation Error:', err);
      setSaveStatus('error');
      setLastErrorMessage(err?.message || 'AI engine was unreachable. Please try again.');
      setHasReflectionError(true);
    } finally {
      setLoadingReflection(false);
      setStreamingText('');
    }
  };

  const handleRetryReflection = async () => {
    if (loadingReflection || !entry) return;

    setLoadingReflection(true);
    setHasReflectionError(false);
    setSaveStatus('saving');

    try {
      // Retry deliberately uses the non-streaming route: it walks the whole
      // model fallback ladder, which is what a retry actually needs.
      const result = await postJson<{ response: string }>('/api/gemini/reflect', {
        messages: entry.messages
      });

      const modelMessage: Message = {
        role: 'model',
        content: result.response,
        timestamp: Date.now()
      };

      const finalMessages = [...entry.messages, modelMessage];
      const completedEntry: JournalEntry = {
        ...entry,
        messages: finalMessages,
        updatedAt: Date.now()
      };

      await onSaveEntry(sanitizePayloadForFirebase(completedEntry));
      setSaveStatus('saved');
    } catch (err: any) {
      console.error('Reflection Generation Retry Error:', err);
      setSaveStatus('error');
      setLastErrorMessage(err?.message || 'AI engine was unreachable. Please try again.');
      setHasReflectionError(true);
    } finally {
      setLoadingReflection(false);
    }
  };

  const handleGenerateSummaryAndMetadata = async () => {
    if (entry.messages.length === 0 || loadingAnalysis) return;

    setLoadingAnalysis(true);
    setSaveStatus('saving');

    try {
      // Bundle all message text to analyze
      const conversationText = entry.messages
        .map(m => `${m.role === 'user' ? 'User' : 'Gemini'}: ${m.content}`)
        .join('\n');

      // Metadata and the search vector are produced together, so an entry
      // becomes semantically searchable the moment it is catalogued.
      const [meta, embeddingResult] = await Promise.all([
        postJson<any>('/api/gemini/analyze', { text: conversationText }),
        postJson<{ embedding: number[] }>('/api/gemini/embed', { text: conversationText })
          .catch(err => {
            // Search is an enhancement — never fail the save over it.
            console.warn('Embedding failed; entry saved without semantic search:', err);
            return null;
          }),
      ]);

      const analyzedEntry: JournalEntry = {
        ...entry,
        title: meta.title || entry.title,
        summary: meta.summary || entry.summary,
        category: meta.category || entry.category,
        mood: meta.mood || entry.mood,
        embedding: embeddingResult?.embedding || entry.embedding,
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

  const handleLocationChange = async (newLocation?: any) => {
    if (!entry) return;
    const updated = {
      ...entry,
      location: newLocation || undefined,
      updatedAt: Date.now()
    };
    setSaveStatus('saving');
    try {
      await onSaveEntry(sanitizePayloadForFirebase(updated));
      setSaveStatus('saved');
    } catch (err: any) {
      setSaveStatus('error');
      setLastErrorMessage(err?.message || 'Failed to update location.');
    }
  };


  return (
    <div className="flex-1 bg-ink-950 flex flex-col h-full overflow-hidden" id="workspace-container">
      {/* Workspace Header */}
      <header className="px-3 sm:px-6 py-3 sm:py-4 border-b border-ink-700 bg-ink-900/80 backdrop-blur-md flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center space-x-3 overflow-hidden flex-1 min-w-0">
          <div className="bg-ember-950 border border-ember-900/30 p-2 rounded-xl text-ember-500 shrink-0">
            <Feather className="w-5 h-5" />
          </div>
          <div className="overflow-hidden flex flex-col justify-center min-w-0 flex-1">
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
              className="w-full bg-transparent border-b border-transparent hover:border-ink-700 focus:border-ember-500 text-base font-bold text-paper-50 focus:outline-none py-0.5 rounded transition"
              id="title-input-header"
            />
            <div className="flex items-center space-x-2 mt-0.5">
              <span className="text-paper-600 text-xs font-semibold">
                Created {new Date(entry.createdAt).toLocaleDateString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
              {entry.isDraft && (
                <span className="text-[10px] uppercase font-bold tracking-wider bg-ink-850 border border-ink-700 text-paper-500 px-1.5 py-0.5 rounded-full">
                  Draft
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Sync / State Alerts */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {saveStatus === 'saving' && (
            <div className="flex items-center space-x-1.5 text-xs text-paper-400 bg-ink-850 border border-ink-700 px-3 py-1.5 rounded-full animate-pulse font-semibold">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-ember-500" />
              <span className="hidden sm:inline">Saving...</span>
            </div>
          )}
          {saveStatus === 'saved' && (
            <div className="flex items-center space-x-1.5 text-xs text-ember-500 bg-ember-950 border border-ember-900/30 px-3 py-1.5 rounded-full font-semibold">
              <CheckCircle className="w-3.5 h-3.5 text-ember-400" />
              <span className="hidden sm:inline">Saved</span>
            </div>
          )}
          {saveStatus === 'error' && (
            <button 
              onClick={handleManualSave}
              className="flex items-center space-x-1.5 text-xs text-rose-400 bg-rose-950/20 hover:bg-rose-950/30 px-3 py-1.5 rounded-full font-semibold border border-rose-900/50 cursor-pointer"
              title={lastErrorMessage}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Save Failed (Retry)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowDetails(v => !v)}
            aria-expanded={showDetails}
            title={showDetails ? 'Hide details & location' : 'Show details & location'}
            id="details-toggle-btn"
            className="p-2 rounded-xl text-paper-50 hover:bg-ink-850 transition cursor-pointer shrink-0"
          >
            {showDetails ? <Maximize2 className="w-5 h-5" /> : <Minimize2 className="w-5 h-5" />}
          </button>

          <button
            onClick={handleManualSave}
            disabled={saveStatus === 'saving'}
            id="workspace-manual-save-btn"
            className="flex items-center space-x-1.5 bg-ember-500 hover:bg-ember-600 text-ink-950 font-semibold text-xs px-3.5 py-2 rounded-xl transition disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Save Thread</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Dynamic AI Insights Pane (Sticky or Top on small screens) */}
        <div className={`${showDetails ? 'flex' : 'hidden'} w-full lg:w-80 max-h-[65vh] lg:max-h-none border-b lg:border-b-0 lg:border-r border-ink-700 bg-ink-900 p-4 sm:p-6 flex-col justify-between overflow-y-auto shrink-0 space-y-6`}>
          <div className="space-y-6">
            <div>
              <div className="flex items-center space-x-2 text-paper-50 font-bold text-sm mb-3">
                <BrainCircuit className="w-4.5 h-4.5 text-ember-500" />
                <span>AI Reflection Insights</span>
              </div>
              <p className="text-xs text-paper-500 leading-relaxed">
                Reflect freely in the thread. Once you finish conversing, click the button below to have Gemini synthesize dynamic tags, summaries, and category fields.
              </p>
            </div>

            {/* Title Insight */}
            <div className="space-y-1.5 bg-ink-850 p-4 rounded-2xl border border-ink-700">
              <span className="text-[10px] font-bold text-paper-600 uppercase tracking-wider block">Generated Title</span>
              <textarea
                rows={2}
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
                className="w-full resize-none field-sizing-content bg-transparent border-b border-transparent hover:border-ink-700 focus:border-ember-500 font-semibold text-paper-50 text-sm leading-snug focus:outline-none py-0.5 rounded transition"
                id="title-input-insights"
              />
            </div>

            {/* Mood & Category Insight */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 bg-ink-850 p-3 rounded-xl border border-ink-700">
                <span className="text-[10px] font-bold text-paper-600 uppercase tracking-wider block">Category</span>
                {entry.category ? (
                  <span className="inline-flex items-center text-xs font-semibold text-paper-400 mt-1">
                    <Hash className="w-3.5 h-3.5 mr-0.5 text-paper-600" />
                    {entry.category}
                  </span>
                ) : (
                  <span className="text-xs text-paper-700 mt-1 block font-medium">None yet</span>
                )}
              </div>

              <div className="space-y-1 bg-ink-850 p-3 rounded-xl border border-ink-700">
                <span className="text-[10px] font-bold text-paper-600 uppercase tracking-wider block">Detected Mood</span>
                {entry.mood ? (
                  <span className={`inline-flex items-center text-xs font-bold border px-2 py-0.5 rounded-full mt-1 ${getMoodColor(entry.mood)}`}>
                    <Smile className="w-3.5 h-3.5 mr-0.5 opacity-85" />
                    {entry.mood}
                  </span>
                ) : (
                  <span className="text-xs text-paper-700 mt-1 block font-medium">None yet</span>
                )}
              </div>
            </div>

            {/* AI Summary Card */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-paper-600 uppercase tracking-wider block">AI Conversation Summary</span>
              {entry.summary ? (
                <div className="bg-ink-850 border border-ink-700 rounded-2xl p-4 text-xs text-paper-400 leading-relaxed shadow-sm">
                  {entry.summary}
                </div>
              ) : (
                <div className="bg-transparent border-2 border-dashed border-ink-700 rounded-2xl p-5 text-center text-xs text-paper-700">
                  No summary synthesized. Write a reflection and trigger synthesis below.
                </div>
              )}
            </div>

            {/* Google Map Location Picker */}
            <MapPicker location={entry.location} onChange={handleLocationChange} />
          </div>

          <div className="pt-4 border-t border-ink-700">
            <button
              onClick={handleGenerateSummaryAndMetadata}
              disabled={entry.messages.length === 0 || loadingAnalysis}
              id="synthesize-insights-btn"
              className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-ember-500 to-ember-400 hover:opacity-90 text-paper-50 font-bold text-xs px-4 py-3 rounded-xl shadow-md disabled:opacity-40 cursor-pointer transition"
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
        <div className="flex-1 flex flex-col justify-between bg-ink-950 overflow-hidden h-full">
          {/* "On This Day" Panel */}
          <div className="border-b border-ink-700 bg-ink-900/90 px-4 sm:px-6 py-3.5 flex flex-col space-y-3 shrink-0" id="on-this-day-dashboard-panel">
            <button 
              type="button"
              onClick={() => setIsOnThisDayExpanded(!isOnThisDayExpanded)}
              className="flex items-center justify-between w-full text-left font-bold text-xs uppercase tracking-wider text-paper-500 hover:text-paper-400 transition cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-ember-500" />
                <span>On This Day: Revisit Past Reflections ({onThisDayMatches.length})</span>
              </div>
              {isOnThisDayExpanded ? <ChevronUp className="w-4 h-4 text-paper-500" /> : <ChevronDown className="w-4 h-4 text-paper-500" />}
            </button>

            {isOnThisDayExpanded && (
              <div className="pt-2 animate-fade-in" id="on-this-day-expanded-section">
                {onThisDayMatches.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {onThisDayMatches.map((match, index) => (
                      <div 
                        key={index}
                        className="bg-ink-900 border border-ink-800 hover:border-ink-700 rounded-2xl p-4.5 space-y-3 transition flex flex-col justify-between"
                      >
                        <div className="space-y-1.5 text-left">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-ember-500 uppercase tracking-wider bg-ember-950 px-2 py-0.5 rounded-md border border-ember-900/20">
                              {match.label}
                            </span>
                            {match.entry.mood && (
                              <span className={`inline-flex items-center text-[10px] font-bold border px-2 py-0.5 rounded-full ${getMoodColor(match.entry.mood)}`}>
                                {match.entry.mood}
                              </span>
                            )}
                          </div>
                          <h4 className="text-xs font-bold text-paper-50 line-clamp-1">
                            {match.entry.title || 'Untitled Space'}
                          </h4>
                          <p className="text-[11px] text-paper-500 line-clamp-2 leading-relaxed">
                            {match.entry.summary || (match.entry.messages[0] ? match.entry.messages[0].content : 'No text content available.')}
                          </p>
                        </div>

                        <div className="pt-2 flex items-center space-x-2 border-t border-ink-850">
                          <button
                            type="button"
                            onClick={() => {
                              if (onSelectEntry) onSelectEntry(match.entry.id);
                            }}
                            className="flex-1 text-center bg-ink-850 hover:bg-ink-800 text-paper-400 border border-ink-700 font-semibold text-[10px] py-1.5 rounded-lg transition cursor-pointer"
                          >
                            Read Full
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReflectOnPastEntry(match)}
                            className="flex-1 text-center bg-ember-500 hover:bg-ember-600 text-ink-950 font-bold text-[10px] py-1.5 rounded-lg transition cursor-pointer inline-flex items-center justify-center space-x-1"
                          >
                            <Sparkles className="w-3 h-3 text-ember-400" />
                            <span>Reflect</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-ink-900/50 border border-ink-800 rounded-2xl p-5 text-center space-y-4">
                    <div className="space-y-1 max-w-sm mx-auto text-center">
                      <p className="text-xs font-semibold text-paper-400">No past milestones discovered today</p>
                      <p className="text-[11px] text-paper-600 leading-relaxed">
                        Reflect.ai compares your current date against historical entries. Click a button below to instantly seed a test reflection into Firestore to explore the feature!
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 max-w-md mx-auto pt-1">
                      <button
                        type="button"
                        onClick={() => handleSeedPastEntry(7)}
                        disabled={seedingMilestone !== null}
                        className="inline-flex items-center space-x-1 bg-ink-850 hover:bg-ink-800 text-paper-400 border border-ink-700 font-bold text-[10px] px-3 py-2 rounded-xl transition cursor-pointer disabled:opacity-40"
                      >
                        {seedingMilestone === '1 week ago' ? <RefreshCw className="w-3 h-3 animate-spin text-ember-500" /> : <Plus className="w-3 h-3 text-ember-500" />}
                        <span>Seed 1 Week Ago</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSeedPastEntry(30)}
                        disabled={seedingMilestone !== null}
                        className="inline-flex items-center space-x-1 bg-ink-850 hover:bg-ink-800 text-paper-400 border border-ink-700 font-bold text-[10px] px-3 py-2 rounded-xl transition cursor-pointer disabled:opacity-40"
                      >
                        {seedingMilestone === '1 month ago' ? <RefreshCw className="w-3 h-3 animate-spin text-ember-500" /> : <Plus className="w-3 h-3 text-ember-500" />}
                        <span>Seed 1 Month Ago</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSeedPastEntry(365)}
                        disabled={seedingMilestone !== null}
                        className="inline-flex items-center space-x-1 bg-ink-850 hover:bg-ink-800 text-paper-400 border border-ink-700 font-bold text-[10px] px-3 py-2 rounded-xl transition cursor-pointer disabled:opacity-40"
                      >
                        {seedingMilestone === '1 year ago' ? <RefreshCw className="w-3 h-3 animate-spin text-ember-500" /> : <Plus className="w-3 h-3 text-ember-500" />}
                        <span>Seed 1 Year Ago</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6" id="messages-container">
            {entry.messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
                <div className="bg-ink-900 p-4 rounded-3xl border border-ink-700 shadow-lg">
                  <Feather className="w-6 h-6 text-ember-500" />
                </div>
                <h3 className="text-base font-bold text-paper-50">Start Your Reflection Journal</h3>
                <p className="text-xs text-paper-500 leading-relaxed">
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
                      <div className={`max-w-xl rounded-2xl px-5 py-4 shadow-sink ${
                        isUser
                          ? 'bg-ink-800 text-paper-200 rounded-br-sm border border-ink-700'
                          : 'bg-ink-900 text-paper-200 border border-ink-800 rounded-bl-sm'
                      }`}>
                        <div className={`text-[11px] font-medium mb-2 ${isUser ? 'text-paper-500' : 'text-ember-500'}`}>
                          {isUser ? 'You wrote' : 'Gemini'}
                        </div>
                        <p className="prose-journal text-[15px] whitespace-pre-wrap">{message.content}</p>
                        <div className="text-[10px] text-paper-700 mt-2.5 tabular">
                          {new Date(message.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Live reply, streaming in token by token */}
                {streamingText && (
                  <div className="flex justify-start">
                    <div className="bg-ink-900 border border-ink-800 rounded-2xl rounded-bl-sm px-5 py-4 max-w-2xl shadow-sink">
                      <div className="text-[11px] font-medium mb-2 text-ember-500 flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-ember-400" aria-hidden="true" />
                        <span>Gemini</span>
                      </div>
                      <p className="prose-journal text-[15px] text-paper-200 whitespace-pre-wrap">
                        {streamingText}
                        <span className="inline-block w-1.5 h-4 ml-0.5 -mb-0.5 align-middle bg-ember-500 animate-pulse" />
                      </p>
                    </div>
                  </div>
                )}

                {/* Typing bubble — only until the first token lands */}
                {loadingReflection && !streamingText && (
                  <div className="flex justify-start">
                    <div className="bg-ink-900 border border-ink-800 rounded-2xl rounded-bl-sm px-5 py-4 max-w-xs shadow-sink">
                      <div className="text-[11px] font-medium mb-2 text-ember-500 flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-ember-400" aria-hidden="true" />
                        <span>Thinking</span>
                      </div>
                      <div className="flex space-x-1.5 py-1">
                        <div className="w-2 h-2 bg-ember-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-ember-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-ember-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Visible Retry on Reflection Error */}
                {hasReflectionError && (
                  <div className="bg-rose-950/20 border border-rose-900/40 rounded-2xl p-4.5 space-y-3 max-w-xl mr-auto ml-0 my-2 text-left" id="reflection-error-panel">
                    <div className="flex items-start space-x-3 text-rose-300">
                      <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5 text-rose-400" />
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-rose-200">Reflection Unreachable</h4>
                        <p className="text-[11px] text-rose-300/80 leading-relaxed">
                          {lastErrorMessage || 'The reflection companion was unreachable. Your input text has been saved safely.'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 pl-7.5">
                      <button
                        type="button"
                        onClick={handleRetryReflection}
                        disabled={loadingReflection}
                        id="retry-reflection-bubble-btn"
                        className="inline-flex items-center space-x-1.5 bg-ember-500 hover:bg-ember-600 text-ink-950 font-bold text-[11px] px-3 py-1.5 rounded-lg transition cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${loadingReflection ? 'animate-spin' : ''}`} />
                        <span>Retry Generation</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (entry.messages.length > 0) {
                            const lastMsg = entry.messages[entry.messages.length - 1];
                            if (lastMsg.role === 'user') {
                              setInputText(lastMsg.content);
                              const remainingMessages = entry.messages.slice(0, -1);
                              const updatedEntry: JournalEntry = {
                                ...entry,
                                messages: remainingMessages,
                                updatedAt: Date.now()
                              };
                              onSaveEntry(sanitizePayloadForFirebase(updatedEntry));
                            }
                          }
                          setHasReflectionError(false);
                        }}
                        id="restore-reflection-bubble-btn"
                        className="inline-flex items-center space-x-1 bg-ink-850 hover:bg-ink-800 text-paper-400 border border-ink-700 font-semibold text-[11px] px-3 py-1.5 rounded-lg transition cursor-pointer"
                      >
                        <span>Edit & Re-type</span>
                      </button>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Prompt Entry Box */}
          <div className="p-3 sm:p-4 border-t border-ink-700 bg-ink-900">
            <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto flex items-end gap-2 sm:gap-3">
              <div className="flex-1 min-w-0 bg-ink-900 border border-ink-700 rounded-2xl px-4 py-2.5 flex items-end">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Express your thoughts or converse with Gemini..."
                  rows={2}
                  className="flex-1 bg-transparent border-none resize-none focus:outline-none text-sm placeholder-paper-700 text-paper-400"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                />
              </div>
              {voice.supported && (
                <button
                  type="button"
                  onClick={voice.toggle}
                  title={voice.listening ? 'Stop dictation' : 'Dictate your reflection'}
                  aria-label={voice.listening ? 'Stop dictation' : 'Dictate your reflection'}
                  aria-pressed={voice.listening}
                  id="voice-input-btn"
                  className={`p-3.5 rounded-2xl border transition duration-150 shadow-lg cursor-pointer shrink-0 ${
                    voice.listening
                      ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 animate-pulse'
                      : 'bg-ink-900 border-ink-700 text-paper-500 hover:text-paper-400 hover:border-ink-600'
                  }`}
                >
                  <Mic className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                disabled={!inputText.trim() || loadingReflection}
                id="message-send-btn"
                className="bg-ember-500 hover:bg-ember-600 text-ink-950 font-semibold p-3.5 rounded-2xl transition duration-150 disabled:opacity-40 shadow-lg cursor-pointer shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            {voice.error && (
              <p className="max-w-3xl mx-auto text-[11px] text-rose-400 mt-2 px-1">{voice.error}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
