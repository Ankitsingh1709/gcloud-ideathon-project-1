import { Sparkles, Search, Mic, BarChart3, MapPin, KeyRound, X } from 'lucide-react';

/**
 * Shown once, on a first sign-in. Two jobs: introduce the features a new
 * writer would otherwise never find, and state the trial allowance up front
 * rather than letting them discover it as a wall on their eleventh entry.
 */

interface WelcomeNoteProps {
  displayName?: string | null;
  trialLimit: number;
  onClose: () => void;
}

const FEATURES = [
  {
    icon: Sparkles,
    title: 'Reflections that write back',
    body: 'Write or speak an entry and Gemini answers as it streams — gentle questions, not advice.',
  },
  {
    icon: Search,
    title: 'Search by meaning',
    body: 'Catalogue an entry and it becomes searchable by feeling. Ask "when did I feel stuck?" and get entries that never use the word.',
  },
  {
    icon: Mic,
    title: 'Voice journaling',
    body: 'Speak instead of typing. Your browser does the transcription — no audio ever leaves your device.',
  },
  {
    icon: BarChart3,
    title: 'Insights and a weekly letter',
    body: 'Mood trends, writing streaks, and a short letter about the patterns in your week.',
  },
  {
    icon: MapPin,
    title: 'Places',
    body: 'Tag an entry with where you were, by one tap, a map, or coordinates.',
  },
];

export default function WelcomeNote({ displayName, trialLimit, onClose }: WelcomeNoteProps) {
  const firstName = displayName?.trim().split(/\s+/)[0];

  return (
    <div
      className="fixed inset-0 bg-ink-950/80 flex items-center justify-center z-[9999] p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-heading"
      id="welcome-overlay"
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-ink-900 border border-ink-700 rounded-3xl p-7 shadow-lift relative space-y-6 animate-rise">
        <button
          onClick={onClose}
          aria-label="Close welcome"
          className="absolute top-5 right-5 text-paper-600 hover:text-paper-400 transition p-1.5 rounded-lg hover:bg-ink-850 cursor-pointer press"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="space-y-2 pr-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ember-500">
            Welcome to Reflect.ai
          </p>
          <h2 id="welcome-heading" className="text-2xl font-bold text-paper-50">
            {firstName ? `Hello, ${firstName}.` : 'Hello.'}
          </h2>
          <p className="text-sm text-paper-500 leading-relaxed">
            A private journal that remembers what you meant. Here is what it can do.
          </p>
        </div>

        <ul className="space-y-3.5">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3.5">
              <div className="shrink-0 mt-0.5 p-2 bg-ink-850 border border-ink-800 rounded-xl text-ember-500">
                <Icon className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <p className="text-[13px] font-semibold text-paper-200">{title}</p>
                <p className="text-xs text-paper-600 leading-relaxed">{body}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="bg-ember-950 border border-ember-900/40 rounded-2xl p-4 flex gap-3.5">
          <div className="shrink-0 mt-0.5 text-ember-300">
            <KeyRound className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <p className="text-[13px] font-semibold text-ember-300">
              You have {trialLimit} AI generations on this trial
            </p>
            <p className="text-xs text-paper-500 leading-relaxed">
              Reflections, cataloguing, and weekly letters each use one. When they run
              out, add your own Gemini API key in the sidebar and keep writing — it is
              stored in this browser only, and never sent to our database.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          id="welcome-start-btn"
          className="w-full bg-ember-500 hover:bg-ember-600 text-ink-950 font-bold text-sm py-3 rounded-2xl transition cursor-pointer press shadow-sink"
        >
          Start writing
        </button>
      </div>
    </div>
  );
}
