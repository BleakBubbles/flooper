import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiRequestError, keys } from "./api";

/** A client error (4xx): the same request will fail the same way again. */
export const isClientError = (error: unknown) =>
  error instanceof ApiRequestError && error.status >= 400 && error.status < 500;

/**
 * The portal's query client, with two app-wide error policies:
 *
 * - Retry failed loads (the network blips, servers hiccup), but never 4xx
 *   errors like 401 or 404, which won't fix themselves.
 * - If the session expires while the portal is open, any request comes back
 *   401. Instead of each page showing "You need to log in first", re-check
 *   who's logged in: that fails too, and the layout swaps in the login page.
 */
export function createQueryClient(): QueryClient {
  const onError = (error: Error, queryKey?: readonly unknown[]) => {
    // The check itself is the "me" query: re-running it on its own 401 would loop.
    const isMe = queryKey?.[0] === keys.me[0];
    if (error instanceof ApiRequestError && error.status === 401 && !isMe) {
      void client.invalidateQueries({ queryKey: keys.me });
    }
  };

  const client = new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => onError(error, query.queryKey) }),
    mutationCache: new MutationCache({ onError: (error) => onError(error) }),
    defaultOptions: {
      queries: {
        retry: (count, error) => !isClientError(error) && count < 2,
        staleTime: 10_000,
      },
    },
  });
  return client;
}
