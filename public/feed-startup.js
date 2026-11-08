// Startup owner: Poetry Please loader development.
// Rendering, ranking and access decisions are supplied by the caller.
export function createFeedLoader({ feed, status, loadMore, onRetry, endMessage }) {
  let identity = null;
  let generation = 0;

  loadMore.addEventListener('click', onRetry);

  return {
    get identity() { return identity; },

    update(state) {
      feed.setAttribute('aria-busy', String(state.loading));
      loadMore.hidden = state.loading || !state.hasMore;
      loadMore.disabled = state.loading;
      loadMore.textContent = state.error ? 'Retry loading' : 'Load more';
      status.textContent = state.loading ? 'Loading more…' : state.error ? state.error.message :
        state.hasMore ? 'More below' : endMessage(state);
    },

    watchAuth(auth, { identityFor, reset, prepare }) {
      auth.getRedirectResult().catch(() => {});
      return auth.onAuthStateChanged(async (user) => {
        const nextIdentity = identityFor(user);
        if (nextIdentity === identity) return;
        identity = nextIdentity;
        const current = ++generation;
        const isCurrent = () => generation === current;
        reset(user);
        status.textContent = 'Loading your queue…';
        loadMore.hidden = true;
        try {
          await prepare(user, isCurrent);
        } catch (error) {
          if (isCurrent()) {
            status.textContent = error.message || 'Your account could not be loaded. Please reload or open the single-item view.';
          }
        }
      });
    },
  };
}
