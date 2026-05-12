"use client";

import { usePathname } from 'next/navigation';
import { useEffect, useState, useRef, ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const [transitionStage, setTransitionStage] = useState<'enter' | 'idle' | 'exit'>('enter');
  const [displayChildren, setDisplayChildren] = useState(children);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      // Trigger enter animation on first render
      requestAnimationFrame(() => {
        setTransitionStage('idle');
      });
      return;
    }

    // Start exit animation
    setTransitionStage('exit');

    // After exit, swap content and enter
    const exitTimer = setTimeout(() => {
      setDisplayChildren(children);
      setTransitionStage('enter');

      // Settle to idle
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTransitionStage('idle');
        });
      });
    }, 200);

    return () => clearTimeout(exitTimer);
  }, [pathname]);

  // Update children when they change (but pathname didn't)
  useEffect(() => {
    if (transitionStage === 'idle') {
      setDisplayChildren(children);
    }
  }, [children, transitionStage]);

  const getClassName = () => {
    switch (transitionStage) {
      case 'enter':
        return 'page-transition page-entering';
      case 'exit':
        return 'page-transition page-exiting';
      default:
        return 'page-transition page-visible';
    }
  };

  return (
    <div className={getClassName()}>
      {displayChildren}
    </div>
  );
}
