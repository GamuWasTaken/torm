export interface TypstQueue {
  run<T>(task: () => Promise<T>): Promise<T>;
}

export function useTypstQueue(): TypstQueue {
  let tail: Promise<void> = Promise.resolve();

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.catch(() => undefined).then(task);
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}
