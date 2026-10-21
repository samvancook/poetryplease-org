// Preserve one origin across nested full-poem/video links. Account changes
// discard the origin instead of exposing another person's retained queue.
export function createReadingReturn({ capture, show, restore }) {
  let origin;
  return {
    get active() { return origin !== undefined; },
    open(item) {
      const first = origin === undefined;
      if (first) origin = capture();
      show(item, first);
    },
    close() {
      if (origin === undefined) return;
      const saved = origin;
      origin = undefined;
      restore(saved);
    },
    discard() { origin = undefined; },
  };
}
