import React from "react";
import { motion, AnimatePresence } from "framer-motion";

interface PageTransitionProps {
  children: React.ReactNode;
  /** Unique key for the current page — triggers enter/exit when it changes */
  pageKey?: string;
}

const variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const transition = { duration: 0.2, ease: "easeOut" as const };

/** Wraps a single screen in a Framer Motion fade + slide transition. */
export function PageTransition({ children, pageKey }: PageTransitionProps) {
  return (
    <motion.div
      key={pageKey}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={transition}
      style={{ width: "100%", height: "100%" }}
    >
      {children}
    </motion.div>
  );
}

interface AnimatedRoutesProps {
  /** The current route key — changing this triggers the exit/enter animation */
  routeKey: string;
  children: React.ReactNode;
}

/** Wraps AnimatePresence around route-level PageTransition children. */
export function AnimatedRoutes({ routeKey, children }: AnimatedRoutesProps) {
  return (
    <AnimatePresence mode="wait">
      <PageTransition key={routeKey} pageKey={routeKey}>
        {children}
      </PageTransition>
    </AnimatePresence>
  );
}
