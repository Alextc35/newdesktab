import {Easing, interpolate} from 'remotion';

export const ease = Easing.bezier(0.22, 1, 0.36, 1);
export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
export const ramp = (frame: number, start = 0, duration = 44) =>
  interpolate(frame, [start, start + duration], [0, 1], {...clamp, easing: ease});
export const fade = (frame: number, start = 0, duration = 22) =>
  interpolate(frame, [start, start + duration], [0, 1], clamp);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
