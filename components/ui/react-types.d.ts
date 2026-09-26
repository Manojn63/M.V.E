// Type declarations for React, JSX runtime, and motion
// Resolves VS Code TypeScript errors when React/Node is not installed

declare module "react" {
  export type ReactNode = any;
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  export function useRef<T>(initialValue?: T | null): { current: T | null };
  export namespace JSX {
    type Element = any;
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
  const React: any;
  export default React;
}

declare module "react/jsx-runtime" {
  export namespace JSX {
    type Element = any;
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare module "react/jsx-dev-runtime" {
  export namespace JSX {
    type Element = any;
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
  export const jsxDEV: any;
  export const Fragment: any;
}

declare module "motion/react" {
  export const motion: any;
}
