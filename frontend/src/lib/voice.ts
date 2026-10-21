import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useMascot, usePreferences } from './store';
let disposePlayback: (() => void) | undefined;
let speechGeneration = 0;
export function stopSpeech() {
  speechGeneration++;
  disposePlayback?.();
  disposePlayback = undefined;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  useMascot.getState().setMouth(0);
  useMascot.getState().event('REST');
}
export async function speak(text: string) {
  if (!usePreferences.getState().voice) return;
  stopSpeech();
  const generation = speechGeneration;
  const state = useMascot.getState();
  if (usePreferences.getState().localVoice) {
    const controller = new AbortController();
    disposePlayback = () => controller.abort();
    try {
      const data = await api<{ audio: string; mimeType: string }>(
        '/voice/speak',
        'POST',
        { text: text.slice(0, 1000) },
        controller.signal,
      );
      if (generation !== speechGeneration) return;
      const audio = new Audio(`data:${data.mimeType};base64,${data.audio}`);
      const context = new AudioContext();
      const source = context.createMediaElementSource(audio);
      const analyser = context.createAnalyser();
      source.connect(analyser);
      analyser.connect(context.destination);
      const bins = new Uint8Array(analyser.frequencyBinCount);
      let animation = 0;
      const cleanup = () => {
        cancelAnimationFrame(animation);
        audio.onplay = audio.onended = audio.onerror = null;
        audio.pause();
        source.disconnect();
        if (context.state !== 'closed') void context.close();
        if (generation === speechGeneration) {
          state.setMouth(0);
          state.event('REST');
        }
      };
      disposePlayback = cleanup;
      const update = () => {
        analyser.getByteFrequencyData(bins);
        state.setMouth(Math.min(1, bins.reduce((a, b) => a + b, 0) / bins.length / 80));
        animation = requestAnimationFrame(update);
      };
      audio.onplay = () => {
        state.event('SPEAK');
        update();
      };
      audio.onended = audio.onerror = cleanup;
      await context.resume();
      if (generation !== speechGeneration) {
        cleanup();
        return;
      }
      await audio.play();
      return;
    } catch {
      if (generation !== speechGeneration) return;
      disposePlayback?.();
      disposePlayback = undefined;
      // A configured local voice can fall back to an installed browser voice.
    }
  }
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.96;
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastBoundary = performance.now();
  const cleanup = () => {
    clearInterval(timer);
    if (generation === speechGeneration) {
      state.setMouth(0);
      state.event('REST');
    }
  };
  disposePlayback = cleanup;
  utterance.onstart = () => {
    if (generation !== speechGeneration) return;
    state.event('SPEAK');
    state.setMouth(0.5);
    timer = setInterval(() => {
      const elapsed = performance.now() - lastBoundary;
      state.setMouth(Math.max(0.08, Math.sin(elapsed / 75) * 0.3 + 0.35));
    }, 70);
  };
  utterance.onboundary = () => {
    if (generation !== speechGeneration) return;
    lastBoundary = performance.now();
    state.setMouth(0.85);
  };
  utterance.onend = utterance.onerror = cleanup;
  window.speechSynthesis.speak(utterance);
}
export function useVoice(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const recognition = useRef<any>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const requestingPermission = useRef(false);
  const transcription = useRef<AbortController | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout>>(undefined);
  const callback = useRef(onText);
  callback.current = onText;
  const release = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    clearTimeout(deadline.current);
  };
  const stop = useCallback(() => {
    // Stop while permission is pending must also discard a later permission grant.
    if (requestingPermission.current) {
      generation.current++;
      requestingPermission.current = false;
    }
    recognition.current?.stop();
    if (recorder.current?.state === 'recording') recorder.current.stop();
    release();
    setListening(false);
    useMascot.getState().event('REST');
  }, []);
  const cancel = useCallback(() => {
    generation.current++;
    transcription.current?.abort();
    transcription.current = null;
    recognition.current?.abort();
    recognition.current = null;
    stop();
    stopSpeech();
  }, [stop]);
  useEffect(() => () => cancel(), [cancel]);
  const start = async () => {
    cancel();
    setError('');
    const current = ++generation.current;
    const active = () => current === generation.current;
    const { event } = useMascot.getState();
    setListening(true);
    try {
      if (usePreferences.getState().localVoice) {
        requestingPermission.current = true;
        const captured = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!active()) {
          captured.getTracks().forEach((t) => t.stop());
          return;
        }
        requestingPermission.current = false;
        stream.current = captured;
        const chunks: BlobPart[] = [];
        const rec = new MediaRecorder(captured);
        recorder.current = rec;
        rec.ondataavailable = (e) => chunks.push(e.data);
        rec.onstop = async () => {
          if (!active()) return;
          release();
          recorder.current = null;
          setListening(false);
          const controller = new AbortController();
          transcription.current = controller;
          try {
            event('THINK');
            const blob = new Blob(chunks, { type: rec.mimeType });
            if (blob.size > 4_000_000) throw new Error('Recording is too large');
            const raw = await blob.arrayBuffer();
            if (!active()) return;
            let binary = '';
            for (const b of new Uint8Array(raw)) binary += String.fromCharCode(b);
            const result = await api<{ text: string }>(
              '/voice/transcribe',
              'POST',
              { audio: btoa(binary) },
              controller.signal,
            );
            if (active()) {
              event('REST');
              callback.current(result.text);
            }
          } catch (e) {
            if (active()) {
              setError((e as Error).message);
              event('FAIL');
            }
          } finally {
            if (active()) transcription.current = null;
          }
        };
        rec.start();
        deadline.current = setTimeout(stop, 55000);
      } else {
        const SpeechRecognition =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition)
          throw new Error(
            'Speech recognition is unavailable in this browser. Type below, or configure local speech in Settings.',
          );
        const r = new SpeechRecognition();
        recognition.current = r;
        r.lang = 'en-US';
        r.interimResults = false;
        r.continuous = false;
        r.onresult = (e: any) => {
          if (active()) callback.current(e.results[0][0].transcript);
        };
        r.onerror = (e: any) => {
          if (active()) {
            setError(`Microphone: ${e.error}. You can type instead.`);
            event('FAIL');
          }
        };
        r.onend = () => {
          if (active()) {
            recognition.current = null;
            setListening(false);
            if (useMascot.getState().state === 'listening') event('REST');
          }
        };
        r.start();
      }
      event('LISTEN');
    } catch (e) {
      if (active()) {
        requestingPermission.current = false;
        release();
        setListening(false);
        setError((e as Error).message);
        event('FAIL');
      }
    }
  };
  return { listening, error, start, stop, cancel };
}
