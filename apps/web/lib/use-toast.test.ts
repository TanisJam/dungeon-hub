/**
 * useToast hook — C5 web-component-catalog
 * Tests: state management + timer behavior.
 * Vitest fake timers required — the hook schedules a real setTimeout.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast } from './use-toast';

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('(1) initial state: message is null', () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.message).toBeNull();
  });

  it('(2) showToast sets the message immediately', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('El estado cambió, actualizando...');
    });
    expect(result.current.message).toBe('El estado cambió, actualizando...');
  });

  it('(3) advancing 3500ms clears the message', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('Hello');
    });
    expect(result.current.message).toBe('Hello');
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(result.current.message).toBeNull();
  });

  it('(4) message is NOT cleared before 3500ms', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('Hello');
    });
    act(() => {
      vi.advanceTimersByTime(3499);
    });
    expect(result.current.message).toBe('Hello');
  });

  it('(5) re-showing before timeout resets the timer (no stale clear)', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('First');
    });
    // Advance 2000ms — half way through
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    // Re-show — this resets the timer
    act(() => {
      result.current.showToast('Second');
    });
    expect(result.current.message).toBe('Second');
    // Advance another 2000ms (4000ms total from first show, 2000ms from second show)
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    // Should NOT be cleared yet (only 2000ms since second showToast)
    expect(result.current.message).toBe('Second');
    // Advance the remaining 1500ms
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.message).toBeNull();
  });

  it('(6) custom duration is respected', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('Custom', 5000);
    });
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(result.current.message).toBe('Custom');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.message).toBeNull();
  });

  it('(7) unmount clears the pending timeout (no memory leak / no state update after unmount)', () => {
    const { result, unmount } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('Will be cleaned up');
    });
    // Unmount before timer fires — should not throw or warn
    unmount();
    // Advancing time after unmount — timer should have been cancelled
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    // No assertion on result state (component unmounted) — just verifying no throw
    // The clearTimeout in cleanup prevents the "can't perform state update on unmounted" warning
  });
});
