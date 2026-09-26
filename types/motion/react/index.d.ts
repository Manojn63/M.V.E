import * as React from "react";

type ComponentType<P = any> = (props: P) => React.ReactNode;

type MotionProps = {
  className?: string;
  style?: Record<string, any>;
  animate?: Record<string, any>;
  initial?: Record<string, any>;
  exit?: Record<string, any>;
  transition?: Record<string, any>;
  [key: string]: any;
};

type MotionComponent<T = any> = ComponentType<T & MotionProps>;

type MotionProxy = {
  [key: string]: MotionComponent<any>;
};

export const motion: MotionProxy;
export const AnimatePresence: ComponentType<{ children?: React.ReactNode; [key: string]: any }>;
export const useAnimation: () => any;
export const useMotionValue: (initial: any) => any;
export const useTransform: (...args: any[]) => any;
