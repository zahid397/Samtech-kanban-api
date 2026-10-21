import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export type MascotState =
  | 'idle'
  | 'floating'
  | 'blinking'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'happy'
  | 'error'
  | 'completed'
  | 'sleeping';
export type MascotEvent =
  | 'REST'
  | 'FLOAT'
  | 'BLINK'
  | 'LISTEN'
  | 'THINK'
  | 'SPEAK'
  | 'HAPPY'
  | 'FAIL'
  | 'COMPLETE'
  | 'SLEEP';
const target: Record<MascotEvent, MascotState> = {
  REST: 'idle',
  FLOAT: 'floating',
  BLINK: 'blinking',
  LISTEN: 'listening',
  THINK: 'thinking',
  SPEAK: 'speaking',
  HAPPY: 'happy',
  FAIL: 'error',
  COMPLETE: 'completed',
  SLEEP: 'sleeping',
};
const allowed: Record<MascotState, MascotEvent[]> = {
  idle: ['FLOAT', 'BLINK', 'LISTEN', 'THINK', 'SPEAK', 'HAPPY', 'FAIL', 'COMPLETE', 'SLEEP'],
  floating: ['REST', 'BLINK', 'LISTEN', 'THINK', 'SPEAK', 'HAPPY', 'FAIL', 'COMPLETE', 'SLEEP'],
  blinking: ['REST', 'FLOAT', 'LISTEN', 'THINK', 'SPEAK', 'FAIL', 'SLEEP'],
  listening: ['REST', 'THINK', 'SPEAK', 'FAIL', 'COMPLETE', 'SLEEP'],
  thinking: ['REST', 'SPEAK', 'COMPLETE', 'HAPPY', 'FAIL', 'SLEEP'],
  speaking: ['REST', 'LISTEN', 'THINK', 'COMPLETE', 'FAIL', 'SLEEP'],
  happy: ['REST', 'FLOAT', 'LISTEN', 'THINK', 'SPEAK', 'SLEEP', 'FAIL'],
  error: ['REST', 'LISTEN', 'THINK', 'SPEAK', 'SLEEP'],
  completed: ['REST', 'FLOAT', 'LISTEN', 'THINK', 'SPEAK', 'SLEEP', 'FAIL'],
  sleeping: ['REST', 'SPEAK', 'LISTEN'],
};
export const transition = (state: MascotState, event: MascotEvent) =>
  allowed[state].includes(event) ? target[event] : state;
export const useMascot = create<{
  state: MascotState;
  mouth: number;
  event: (e: MascotEvent) => void;
  setMouth: (n: number) => void;
}>((set) => ({
  state: 'idle',
  mouth: 0,
  event: (e) => set((s) => ({ state: transition(s.state, e) })),
  setMouth: (mouth) => set({ mouth }),
}));
export const usePreferences = create(
  persist<{
    voice: boolean;
    lowPerformance: boolean;
    reducedMotion: boolean;
    localVoice: boolean;
    set: (
      x: Partial<{
        voice: boolean;
        lowPerformance: boolean;
        reducedMotion: boolean;
        localVoice: boolean;
      }>,
    ) => void;
  }>(
    (set) => ({
      voice: false,
      lowPerformance: false,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      localVoice: false,
      set: (x) => set(x),
    }),
    { name: 'sammtech-preferences' },
  ),
);
