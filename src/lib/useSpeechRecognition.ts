import { useEffect, useRef, useState } from 'react';

/**
 * Voice journaling on the native Web Speech API — no dependency, no audio
 * upload. Speech is transcribed by the browser; only the resulting text is
 * ever sent anywhere.
 */

const SpeechRecognitionImpl =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : undefined;

/** False on Firefox, which has no Web Speech API. Callers hide the control. */
export const isSpeechRecognitionSupported = Boolean(SpeechRecognitionImpl);

export function useSpeechRecognition(onFinalTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // Held in a ref so the recognition instance is built once, not rebuilt on
  // every keystroke that changes the caller's closure.
  const callbackRef = useRef(onFinalTranscript);
  callbackRef.current = onFinalTranscript;

  useEffect(() => {
    if (!SpeechRecognitionImpl) return;

    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) callbackRef.current(result[0].transcript);
      }
    };

    recognition.onerror = (event: any) => {
      setError(
        event.error === 'not-allowed'
          ? 'Microphone permission denied. Enable it in your browser settings.'
          : `Voice input stopped: ${event.error}`
      );
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    return () => {
      try { recognition.stop(); } catch { /* already stopped */ }
      recognitionRef.current = null;
    };
  }, []);

  const toggle = () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (listening) {
      recognition.stop();
      setListening(false);
      return;
    }

    setError(null);
    try {
      recognition.start();
      setListening(true);
    } catch {
      /* start() throws if already running — treat as already listening */
    }
  };

  return { listening, error, toggle, supported: isSpeechRecognitionSupported };
}
