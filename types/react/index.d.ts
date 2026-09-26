export type ReactNode = any;
export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
export function useRef<T>(initialValue?: T | null): { current: T };

export namespace JSX {
  interface Element {}
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

declare const React: {
  useEffect: typeof useEffect;
  useRef: typeof useRef;
  createElement: any;
  Fragment: any;
};

export default React;
