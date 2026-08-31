import React, { useMemo, useState } from 'react';
import { JournalEntry } from '../types';
import { postJson } from '../lib/api';
import { 
  Sparkles, Calendar, BookOpen, BrainCircuit, Heart, 
  TrendingUp, BarChart2, CheckCircle2, ShieldCheck, Flame, PieChart,
  Mail, Loader2, AlertTriangle
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, 
  BarChart, Bar, Cell
} from 'recharts';

interface InsightsDashboardProps {
  entries: JournalEntry[];
}

// Map structured moods to numerical scores for trend calculations
const MOOD_SCORE_MAP: Record<string, number> = {
  '😊 joy': 5,
  'excited': 4.8,
  '💪 motivated': 4.5,
  'motivated': 4.5,
  'grateful': 4.3,
  '🧘 serene': 4.0,
  'calm': 4.0,
  'reflective': 3.5,
  'melancholy': 2.0,
  'anxious': 1.5,
};

// Simple helper to normalize stored mood string for mapping
const getMoodScore = (moodString: string): number => {
  const norm = moodString.toLowerCase().trim();
  // Check exact matches or substring matches
  for (const [key, value] of Object.entries(MOOD_SCORE_MAP)) {
    if (norm.includes(key)) {
      return value;
    }
  }
  return 3.5; // Default neutral score
};

export default function InsightsDashboard({ entries }: InsightsDashboardProps) {
  // 1. Data Calculation: Filter out drafts and sort chronologically
  const activeEntries = useMemo(() => {
    return [...entries]
      .filter(e => !e.isDraft && e.createdAt)
      .sort((a, b) => a.createdAt - b.createdAt);
  }, [entries]);

  // 2. Metrics Calculations
  const stats = useMemo(() => {
    const totalReflections = activeEntries.length;
    
    // Find most active category
    const categoryCounts: Record<string, number> = {};
    activeEntries.forEach(e => {
      if (e.category) {
        categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
      }
    });
    let topCategory = 'None Yet';
    let topCategoryCount = 0;
    Object.entries(categoryCounts).forEach(([cat, val]) => {
      if (val > topCategoryCount) {
        topCategory = cat;
        topCategoryCount = val;
      }
    });

    // Find most frequent mood
    const moodCounts: Record<string, number> = {};
    activeEntries.forEach(e => {
      if (e.mood) {
        moodCounts[e.mood] = (moodCounts[e.mood] || 0) + 1;
      }
    });
    let topMood = 'None Yet';
    let topMoodCount = 0;
    Object.entries(moodCounts).forEach(([m, val]) => {
      if (val > topMoodCount) {
        topMood = m;
        topMoodCount = val;
      }
    });

    // Calculate Streak (consecutive days of active reflection)
    let currentStreak = 0;
    if (totalReflections > 0) {
      const dates = activeEntries.map(e => {
        const d = new Date(e.createdAt);
        return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      });
      const uniqueDates = Array.from(new Set(dates)).map((dStr: string) => new Date(dStr).getTime());
      uniqueDates.sort((a, b) => b - a); // descending order (newest first)

      const oneDayMs = 24 * 60 * 60 * 1000;
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      const yesterdayStart = todayStart - oneDayMs;

      // Check if last reflection was today or yesterday
      if (uniqueDates[0] >= yesterdayStart) {
        currentStreak = 1;
        for (let i = 0; i < uniqueDates.length - 1; i++) {
          const diff = uniqueDates[i] - uniqueDates[i + 1];
          // Allow up to 30 hours of slack between entry days
          if (diff <= oneDayMs * 1.5) {
            currentStreak++;
          } else {
            break;
          }
        }
      }
    }

    return {
      totalReflections,
      topCategory: topCategoryCount > 0 ? `${topCategory} (${topCategoryCount})` : 'No category logged',
      topMood: topMoodCount > 0 ? topMood : 'No mood logged',
      streak: currentStreak
    };
  }, [activeEntries]);

  // 3. Weekly Trend Line Data: Group entries into weeks
  const trendData = useMemo(() => {
    if (activeEntries.length === 0) return [];

    // Group entries into 7-day windows trailing backwards from today
    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const weeklyWindows = Array.from({ length: 6 }).map((_, index) => {
      const windowEnd = now - (index * oneWeekMs);
      const windowStart = windowEnd - oneWeekMs;
      return {
        label: index === 0 ? 'This Week' : `${index}w ago`,
        start: windowStart,
        end: windowEnd,
        scores: [] as number[],
      };
    });

    activeEntries.forEach(entry => {
      weeklyWindows.forEach(w => {
        if (entry.createdAt >= w.start && entry.createdAt < w.end) {
          const score = getMoodScore(entry.mood || 'Reflective');
          w.scores.push(score);
        }
      });
    });

    // reverse to show chronologically
    return weeklyWindows
      .reverse()
      .map(w => {
        const avgScore = w.scores.length > 0 
          ? Number((w.scores.reduce((a, b) => a + b, 0) / w.scores.length).toFixed(1))
          : 3.5; // default to neutral when silent
        return {
          week: w.label,
          'Mood Index': avgScore,
          Reflections: w.scores.length,
        };
      });
  }, [activeEntries]);

  // 4. Category Breakdown Data
  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    activeEntries.forEach(e => {
      if (e.category) {
        counts[e.category] = (counts[e.category] || 0) + 1;
      }
    });

    return Object.entries(counts)
      .map(([name, value]) => ({
        name,
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [activeEntries]);

  // Color scheme constants matched to our luxury dark palette
  const accentColors = ['#8b5cf6', '#d946ef', '#10b981', '#f59e0b', '#3b82f6'];

  // --- Weekly digest --------------------------------------------------------
  // Generated on demand and held in component state. Only entry METADATA is
  // sent; the server re-projects it to five fields, so journal bodies never
  // reach the model through this route.
  const [digest, setDigest] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestError, setDigestError] = useState<string | null>(null);

  const [digestPeriod, setDigestPeriod] = useState<'week' | 'all'>('week');

  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const cataloguedEntries = entries.filter(e => !e.isDraft && (e.summary || e.title));
  const thisWeekEntries = cataloguedEntries.filter(e => Date.now() - e.createdAt <= WEEK_MS);
  const digestCandidates = digestPeriod === 'week' ? thisWeekEntries : cataloguedEntries;

  const generateDigest = async () => {
    if (digestLoading || digestCandidates.length === 0) return;
    setDigestLoading(true);
    setDigestError(null);
    try {
      const payload = digestCandidates
        .slice(0, 30)
        .map(({ createdAt, title, summary, mood, category }) => ({ createdAt, title, summary, mood, category }));
      const result = await postJson<{ digest: string }>('/api/gemini/digest', {
        entries: payload,
        period: digestPeriod,
      });
      setDigest(result.digest);
    } catch (err: any) {
      setDigestError(err?.message || 'Could not generate your digest. Please try again.');
    } finally {
      setDigestLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-ink-950 overflow-y-auto p-8 space-y-8" id="insights-dashboard-root">
      {/* Tab Header Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-ink-700 pb-6 space-y-4 md:space-y-0">
        <div className="space-y-1.5 text-left">
          <div className="flex items-center space-x-2">
            <BrainCircuit className="w-5 h-5 text-ember-500" />
            <h1 className="text-xl font-bold text-paper-50 tracking-tight">Personal Reflection Insights</h1>
          </div>
          <p className="text-xs text-paper-500 leading-relaxed max-w-xl">
            A dynamic, client-side intelligence dashboard compiling emotional, psychological, and categorization trends derived securely from your isolated past reflections.
          </p>
        </div>
        <div className="flex items-center space-x-1.5 bg-ink-900 border border-ink-800 px-3 py-1.5 rounded-full text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Private uid-scoped queries only</span>
        </div>
      </div>

      {/* Weekly Digest — a letter Gemini writes back to you */}
      <div className="bg-ink-900 border border-ink-800 rounded-2xl p-6 space-y-4 text-left" id="weekly-digest-panel">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Mail className="w-4 h-4 text-ember-400" />
              <h2 className="text-sm font-bold text-paper-50 tracking-tight">
                {digestPeriod === 'week' ? 'Your Week in Review' : 'Your Journal So Far'}
              </h2>
            </div>
            <p className="text-[11px] text-paper-500 leading-relaxed max-w-xl">
              Gemini reads the shape of your entries — dates, moods, categories and one-line
              summaries — and writes back. Full journal text never leaves your browser for this.
            </p>
            <div className="flex items-center gap-1 bg-ink-900 border border-ink-700 rounded-lg p-0.5 w-fit" role="group" aria-label="Digest period">
              {([['week', `This week (${thisWeekEntries.length})`], ['all', `All time (${cataloguedEntries.length})`]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setDigestPeriod(value); setDigest(null); setDigestError(null); }}
                  aria-pressed={digestPeriod === value}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${
                    digestPeriod === value ? 'bg-ember-950 text-ember-300' : 'text-paper-600 hover:text-paper-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={generateDigest}
            disabled={digestLoading || digestCandidates.length === 0}
            id="generate-digest-btn"
            className="shrink-0 inline-flex items-center justify-center space-x-2 bg-ember-500 hover:bg-ember-600 disabled:opacity-40 text-paper-50 font-bold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer"
          >
            {digestLoading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Sparkles className="w-3.5 h-3.5" />}
            <span>{digestLoading ? 'Writing…' : digest ? 'Write a new one' : 'Write my letter'}</span>
          </button>
        </div>

        {digestCandidates.length === 0 && (
          <p className="text-[11px] text-paper-600">
            {digestPeriod === 'week' && cataloguedEntries.length > 0
              ? <>No catalogued reflections in the past seven days. Switch to <strong>All time</strong> to look further back.</>
              : <>Catalog at least one reflection to unlock your letter.</>}
          </p>
        )}

        {digestError && (
          <div className="flex items-start space-x-2 text-rose-300 bg-rose-950/20 border border-rose-900/40 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <p className="text-[11px] leading-relaxed">{digestError}</p>
          </div>
        )}

        {digest && (
          /* Rare and slow to arrive — the reveal is earned here. */
          <p className="prose-journal text-[15px] text-paper-200 whitespace-pre-wrap border-t border-ink-800 pt-5 animate-rise">
            {digest}
          </p>
        )}
      </div>

      {/* Hero Stats Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="insights-grid-stats">
        <div className="bg-ink-900/80 border border-ink-800 rounded-2xl p-5 space-y-2 text-left">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-paper-600">Total Reflections</span>
            <BookOpen className="w-4 h-4 text-ember-500" />
          </div>
          <p className="text-2xl font-black text-paper-50">{stats.totalReflections}</p>
          <p className="text-[10px] text-paper-700">Preserved entries in database</p>
        </div>

        <div className="bg-ink-900/80 border border-ink-800 rounded-2xl p-5 space-y-2 text-left">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-paper-600">Active Streak</span>
            <Flame className="w-4 h-4 text-ember-400" />
          </div>
          <p className="text-2xl font-black text-paper-50">{stats.streak} {stats.streak === 1 ? 'Day' : 'Days'}</p>
          <p className="text-[10px] text-paper-700">Consecutive writing days</p>
        </div>

        <div className="bg-ink-900/80 border border-ink-800 rounded-2xl p-5 space-y-2 text-left">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-paper-600">Primary Category</span>
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-base font-bold text-paper-50 line-clamp-1">{stats.topCategory}</p>
          <p className="text-[10px] text-paper-700">Most written focus area</p>
        </div>

        <div className="bg-ink-900/80 border border-ink-800 rounded-2xl p-5 space-y-2 text-left">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-paper-600">Dominant Mood</span>
            <Heart className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-lg font-bold text-paper-50 line-clamp-1">{stats.topMood}</p>
          <p className="text-[10px] text-paper-700">Most cataloged sentiment</p>
        </div>
      </div>

      {stats.totalReflections > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Trend Chart (Line chart over last 6 weeks) */}
          <div className="lg:col-span-8 bg-ink-900/80 border border-ink-800 rounded-2xl p-5 space-y-4 flex flex-col justify-between min-h-[350px]">
            <div className="flex items-center justify-between text-left">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-paper-50 flex items-center space-x-1.5">
                  <TrendingUp className="w-4 h-4 text-ember-500" />
                  <span>Weekly Mood Index Trend</span>
                </h3>
                <p className="text-[11px] text-paper-600">Calculated average from mood metadata across 7-day increments</p>
              </div>
            </div>

            <div className="flex-1 w-full min-h-[220px] pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="moodGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#d4814c" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#d4814c" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="week" 
                    stroke="#322b26" 
                    fontSize={10} 
                    fontWeight="bold"
                    tickLine={false} 
                  />
                  <YAxis 
                    domain={[1, 5]} 
                    ticks={[1, 2, 3, 4, 5]} 
                    stroke="#322b26" 
                    fontSize={10} 
                    fontWeight="bold"
                    tickLine={false} 
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#121212', 
                      borderColor: '#333', 
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="Mood Index" 
                    stroke="#d4814c" 
                    strokeWidth={2.5} 
                    fillOpacity={1} 
                    fill="url(#moodGradient)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Categories Bar Distribution */}
          <div className="lg:col-span-4 bg-ink-900/80 border border-ink-800 rounded-2xl p-5 space-y-4 flex flex-col justify-between min-h-[350px]">
            <div className="text-left space-y-1">
              <h3 className="text-sm font-bold text-paper-50 flex items-center space-x-1.5">
                <BarChart2 className="w-4 h-4 text-ember-400" />
                <span>Focus Distribution</span>
              </h3>
              <p className="text-[11px] text-paper-600">Occurrence counts across categorized journal focus labels</p>
            </div>

            <div className="flex-1 w-full min-h-[200px] flex items-center justify-center">
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryData} layout="vertical" margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <XAxis type="number" stroke="#322b26" fontSize={10} hide />
                    <YAxis dataKey="name" type="category" stroke="#8c8378" fontSize={10} fontWeight="bold" tickLine={false} width={80} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#121212', 
                        borderColor: '#333', 
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '11px'
                      }} 
                    />
                    <Bar dataKey="value" fill="#d4814c" radius={[0, 6, 6, 0]}>
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={accentColors[index % accentColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8">
                  <PieChart className="w-8 h-8 text-ink-800 mx-auto mb-2" />
                  <p className="text-xs text-paper-700 font-semibold">No structured categories logged yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-ink-900/80 border border-ink-800 rounded-2xl p-12 text-center max-w-lg mx-auto space-y-5" id="insights-empty-dashboard">
          <div className="w-12 h-12 bg-ink-850 rounded-2xl flex items-center justify-center mx-auto text-ember-500 border border-ink-700">
            <BrainCircuit className="w-6 h-6 animate-pulse" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-paper-50">Analysis Workspace Offline</h3>
            <p className="text-xs text-paper-600 leading-relaxed">
              We require at least one active saved reflection to trace trend patterns. Begin writing inside the workspace to auto-catalog tags!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
