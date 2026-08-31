import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes so a single bad entry or malformed document
 * shows a recoverable card instead of a blank white screen.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  // @types/react is not installed in this project, so the inherited members
  // are not visible to tsc. Declaring them keeps `npm run lint` clean without
  // pulling in React's type packages (which would surface unrelated errors
  // across every existing component).
  declare props: Props;
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-ink-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-5">
          <div className="bg-ember-950 border border-rose-900/40 p-4 rounded-3xl text-rose-400 inline-block shadow-lg">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="text-paper-200 text-xl font-bold">Something broke on this screen</h1>
          <p className="text-paper-500 text-sm leading-relaxed">
            Your reflections are safe — everything is stored in Firestore, not in this page.
            Reloading will bring you back to where you were.
          </p>
          <pre className="text-left text-[11px] text-paper-600 bg-ink-900 border border-ink-800 rounded-xl p-3 overflow-x-auto">
            {this.state.error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center space-x-2 bg-ember-500 hover:bg-ember-600 text-ink-950 font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reload</span>
          </button>
        </div>
      </div>
    );
  }
}
