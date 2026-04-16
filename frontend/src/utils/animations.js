/**
 * Shared animation hooks for MoneyFlow — all built on React Native's Animated API.
 * No extra dependencies required.
 */
import { useRef, useEffect, useState, useCallback } from 'react';
import { Animated, Easing } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Fade-in + slide-up entrance on mount.
 * Returns { style } to spread onto an Animated.View.
 */
export function useEntrance({ delay = 0, fromY = 28, duration = 480 } = {}) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(fromY)).current;

  useFocusEffect(
    useCallback(() => {
      opacity.setValue(0);
      translateY.setValue(fromY);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          delay,
          damping: 22,
          stiffness: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }, [])
  );

  return { opacity, translateY, style: { opacity, transform: [{ translateY }] } };
}

/**
 * Staggered entrance for list items — delays based on index.
 */
export function useStaggerEntrance(index, { baseDelay = 70, fromY = 18, duration = 420 } = {}) {
  return useEntrance({ delay: index * baseDelay, fromY, duration });
}

/**
 * Spring scale feedback for pressable elements.
 * Use onPressIn / onPressOut on TouchableOpacity, spread style onto Animated.View wrapper.
 */
export function usePressScale(toValue = 0.96) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scale, {
      toValue,
      damping: 14,
      stiffness: 450,
      useNativeDriver: true,
    }).start();

  const onPressOut = () =>
    Animated.spring(scale, {
      toValue: 1,
      damping: 14,
      stiffness: 450,
      useNativeDriver: true,
    }).start();

  return { scale, onPressIn, onPressOut, style: { transform: [{ scale }] } };
}

/**
 * Animated number counter — counts from 0 to `target` on mount / target change.
 * Returns a plain number you can render directly.
 */
export function useCountUp(target, { duration = 950, delay = 0 } = {}) {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    if (!target) { setDisplayed(0); return; }
    const anim = new Animated.Value(0);
    const listenerId = anim.addListener(({ value }) => setDisplayed(Math.round(value)));
    Animated.timing(anim, {
      toValue: target,
      duration,
      delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
    return () => {
      anim.removeListener(listenerId);
      anim.stopAnimation();
    };
  }, [target]);

  return displayed;
}

/**
 * Infinite slow breathe / pulse — great for glows and idle zones.
 * Returns { style } to spread onto an Animated.View.
 */
export function usePulse({ min = 0.3, max = 0.85, duration = 2000 } = {}) {
  const opacity = useRef(new Animated.Value(min)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: max,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: min,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return { opacity, style: { opacity } };
}

/**
 * Drives an SVG ring progress from 0 → target using Animated.spring.
 * Returns the current progress value (0–1) as plain state — rerenders are cheap.
 */
export function useRingProgress(target) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const anim = new Animated.Value(0);
    const id = anim.addListener(({ value }) => setProgress(value));
    Animated.spring(anim, {
      toValue: target,
      damping: 18,
      stiffness: 100,
      useNativeDriver: false,
    }).start();
    return () => {
      anim.removeListener(id);
      anim.stopAnimation();
    };
  }, [target]);

  return progress;
}
