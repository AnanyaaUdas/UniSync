// turns speech into text during a call, using the browser's speech recognition
// (works in chrome and edge). every person in the call turns their own mic
// into text, so we always know who said each sentence.
import { useEffect, useRef, useState } from 'react';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export default function useTranscriber({ active, onFinal }) {
  const [interim, setInterim] = useState(''); // words still being spoken
  const [error, setError] = useState('');
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    if (!active || !SpeechRecognition) {
      setInterim('');
      return;
    }
    let stopped = false;
    let rec;

    const start = () => {
      rec = new SpeechRecognition();
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (e) => {
        let notFinished = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i];
          if (result.isFinal) {
            const text = result[0].transcript.trim();
            if (text) onFinalRef.current(text);
          } else {
            notFinished += result[0].transcript;
          }
        }
        setInterim(notFinished);
      };

      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          setError('Microphone access for live transcription was blocked.');
          stopped = true;
        } else if (e.error === 'audio-capture') {
          setError('No microphone available for transcription. You can type notes below.');
          stopped = true;
        } else if (e.error === 'network') {
          setError('The speech service is unreachable. Check your internet, or type notes below.');
        }
      };

      // chrome stops listening after a while, so start again
      rec.onend = () => {
        if (!stopped) setTimeout(() => !stopped && start(), 250);
      };

      rec.start();
      setError('');
    };

    start();
    return () => {
      stopped = true;
      rec?.abort();
      setInterim('');
    };
  }, [active]);

  return { interim, error, supported: !!SpeechRecognition };
}
