'use client';

import React, { ReactNode, useRef, useEffect } from 'react';
import { mobileUtils } from '@/lib/mobile/native';

interface TouchButtonProps {
  children: ReactNode;
  onClick?: (e: React.MouseEvent | React.TouchEvent) => void;
  onLongPress?: (e: React.TouchEvent) => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  haptic?: 'light' | 'medium' | 'heavy';
  loading?: boolean;
}

/**
 * Mobile-optimized button with 48px+ minimum touch target
 * Includes haptic feedback and gesture support
 */
export const TouchButton = React.forwardRef<HTMLButtonElement, TouchButtonProps>(
  (
    {
      children,
      onClick,
      onLongPress,
      disabled = false,
      variant = 'primary',
      size = 'md',
      className = '',
      haptic,
      loading = false,
    },
    ref
  ) => {
    const longPressTimer = useRef<number | null>(null);
    const isLongPress = useRef(false);

    const variantStyles = {
      primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800',
      secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 active:bg-gray-400',
      ghost: 'bg-transparent text-brand-600 hover:bg-brand-100 active:bg-brand-200',
    };

    const sizeStyles = {
      sm: 'h-10 px-3 text-sm min-w-10', // Still 40px but we prefer 48px+
      md: 'h-12 px-4 text-base min-w-12', // 48px - minimum recommended
      lg: 'h-14 px-6 text-lg min-w-14', // 56px - extra comfortable
    };

    const handleTouchStart = (e: React.TouchEvent) => {
      isLongPress.current = false;
      longPressTimer.current = window.setTimeout(() => {
        isLongPress.current = true;
        if (onLongPress) {
          onLongPress(e);
          triggerHaptic('medium');
        }
      }, 500);
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }

      if (!isLongPress.current && onClick) {
        triggerHaptic(haptic || 'light');
        onClick(e);
      }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
      if (!mobileUtils.isMobile()) {
        longPressTimer.current = window.setTimeout(() => {
          isLongPress.current = true;
          if (onLongPress) {
            onLongPress(e as any);
          }
        }, 500);
      }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }

      if (!isLongPress.current && onClick) {
        onClick(e);
      }
    };

    const triggerHaptic = async (type: 'light' | 'medium' | 'heavy') => {
      if (!mobileUtils.isMobile()) return;

      try {
        const { HapticFeedback } = await import('@capacitor/haptics');
        const styleMap = {
          light: 'Light',
          medium: 'Medium',
          heavy: 'Heavy',
        };
        await HapticFeedback.impact({ style: styleMap[type] as any });
      } catch {
        // Fallback to vibration API
        if ('vibrate' in navigator) {
          const pattern = {
            light: 10,
            medium: 50,
            heavy: 100,
          };
          navigator.vibrate(pattern[type]);
        }
      }
    };

    return (
      <button
        ref={ref}
        onClick={(e) => {
          if (!disabled && !loading) onClick?.(e);
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        disabled={disabled || loading}
        className={`
          flex items-center justify-center
          font-semibold rounded-lg
          transition-all duration-150
          active:scale-95
          disabled:opacity-50 disabled:cursor-not-allowed
          select-none
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
        aria-busy={loading}
      >
        {loading ? (
          <span className="animate-spin">⟳</span>
        ) : (
          children
        )}
      </button>
    );
  }
);

TouchButton.displayName = 'TouchButton';

// Gesture detector for swipe, pinch, etc
interface GestureEvent {
  type: 'swipe' | 'pinch' | 'rotate';
  direction?: 'left' | 'right' | 'up' | 'down';
  scale?: number;
  angle?: number;
  velocity?: number;
}

interface GestureDetectorProps {
  onGesture: (event: GestureEvent) => void;
  children: ReactNode;
  className?: string;
}

export const GestureDetector = React.forwardRef<
  HTMLDivElement,
  GestureDetectorProps
>(({ onGesture, children, className = '' }, ref) => {
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const initialTouches = useRef<Touch[]>([]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      touchStartTime.current = Date.now();
    } else if (e.touches.length === 2) {
      initialTouches.current = Array.from(e.touches);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0 && initialTouches.current.length === 1) {
      // Swipe detection
      const deltaX = touchStartX.current - e.changedTouches[0].clientX;
      const deltaY = touchStartY.current - e.changedTouches[0].clientY;
      const time = Date.now() - touchStartTime.current;
      const velocity = Math.sqrt(deltaX * deltaX + deltaY * deltaY) / time;

      if (Math.abs(deltaX) > 50 || Math.abs(deltaY) > 50) {
        let direction: 'left' | 'right' | 'up' | 'down';
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          direction = deltaX > 0 ? 'left' : 'right';
        } else {
          direction = deltaY > 0 ? 'up' : 'down';
        }

        onGesture({
          type: 'swipe',
          direction,
          velocity,
        });
      }
    }

    initialTouches.current = [];
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialTouches.current.length === 2) {
      // Pinch detection
      const t1 = initialTouches.current[0];
      const t2 = initialTouches.current[1];
      const currentT1 = e.touches[0];
      const currentT2 = e.touches[1];

      const initialDistance = Math.sqrt(
        Math.pow(t1.clientX - t2.clientX, 2) + Math.pow(t1.clientY - t2.clientY, 2)
      );

      const currentDistance = Math.sqrt(
        Math.pow(currentT1.clientX - currentT2.clientX, 2) +
          Math.pow(currentT1.clientY - currentT2.clientY, 2)
      );

      const scale = currentDistance / initialDistance;

      if (Math.abs(scale - 1) > 0.1) {
        onGesture({
          type: 'pinch',
          scale,
        });
      }
    }
  };

  return (
    <div
      ref={ref}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      className={className}
    >
      {children}
    </div>
  );
});

GestureDetector.displayName = 'GestureDetector';
