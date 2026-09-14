type Stage = "business" | "knowledge" | "configuration" | "generation" | "validation" | "consultation" | "model" | "usage";

// Fixed metric names and numeric durations only: never log prompts or responses.
export function createChatTiming() {
  const started = performance.now();
  const durations: Partial<Record<Stage, number>> = {};
  let finished = false;
  const add = (stage: Stage, duration: number) => {
    durations[stage] = (durations[stage] || 0) + duration;
  };
  return {
    add,
    async measure<T>(stage: Stage, operation: () => Promise<T>): Promise<T> {
      const start = performance.now();
      try { return await operation(); }
      finally { add(stage, performance.now() - start); }
    },
    finish(status: number) {
      const total = Math.round(performance.now() - started);
      if (!finished) {
        finished = true;
        console.info("Chat timing", { status, totalMs: total,
          stagesMs: Object.fromEntries(Object.entries(durations).map(([key, value]) => [key, Math.round(value)])) });
      }
      return `total;dur=${total}`;
    },
  };
}

export type ChatTiming = ReturnType<typeof createChatTiming>;
