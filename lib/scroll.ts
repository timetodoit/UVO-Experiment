/**
 * Shared scroll-driven state, mutated by <Hero>'s ScrollTrigger and read
 * every frame by camera + postprocessing. Kept off React state so ScrollTrigger
 * updates never trigger rerenders (the whole point of `scrub: 0.8`).
 */
export const scrollState = {
  /** 0..1 across the hero's pin range ("top top" → "+=100%"). */
  heroProgress: 0,
};
