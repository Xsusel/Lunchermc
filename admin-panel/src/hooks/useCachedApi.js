/**
 * Hook do cache'owania danych API
 * Implementuje wzorzec SWR (stale-while-revalidate)
 */
import { useState, useEffect, useCallback, useRef } from 'react';

// Globalny cache API
const apiCache = new Map();

/**
 * Hook useCachedApi - pobiera dane z cache lub API
 * @param {string} cacheKey - Unikalny klucz cache
 * @param {Function} fetchFn - Funkcja pobierająca dane z API
 * @param {object} options - Opcje
 * @param {number} options.ttl - Czas ważności cache w ms (domyślnie 60s)
 * @param {boolean} options.enabled - Czy pobieranie jest włączone (domyślnie true)
 * @param {boolean} options.refetchOnFocus - Czy odświeżać przy powrocie do karty
 */
export function useCachedApi(cacheKey, fetchFn, options = {}) {
    const {
        ttl = 60000,
        enabled = true,
        refetchOnFocus = false
    } = options;

    const [data, setData] = useState(() => {
        const cached = apiCache.get(cacheKey);
        return cached?.data || null;
    });
    const [loading, setLoading] = useState(!apiCache.has(cacheKey));
    const [error, setError] = useState(null);
    const mountedRef = useRef(true);

    const fetchData = useCallback(async (showLoading = true) => {
        if (!enabled) return;

        // Sprawdź cache
        const cached = apiCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < ttl) {
            setData(cached.data);
            setLoading(false);
            return cached.data;
        }

        if (showLoading && !cached) {
            setLoading(true);
        }

        try {
            const result = await fetchFn();
            if (mountedRef.current) {
                const responseData = result?.data || result;
                setData(responseData);
                setError(null);
                apiCache.set(cacheKey, {
                    data: responseData,
                    timestamp: Date.now()
                });
                return responseData;
            }
        } catch (err) {
            if (mountedRef.current) {
                setError(err);
                // Jeśli mamy stare dane w cache, użyj ich
                const stale = apiCache.get(cacheKey);
                if (stale) {
                    setData(stale.data);
                }
            }
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
        }
    }, [cacheKey, fetchFn, enabled, ttl]);

    const refetch = useCallback(() => {
        // Wymuś nowe pobranie (ignoruj cache)
        apiCache.delete(cacheKey);
        return fetchData(true);
    }, [cacheKey, fetchData]);

    const mutate = useCallback((newData) => {
        // Ustaw dane ręcznie (optimistic update)
        setData(newData);
        apiCache.set(cacheKey, {
            data: newData,
            timestamp: Date.now()
        });
    }, [cacheKey]);

    useEffect(() => {
        mountedRef.current = true;
        fetchData();
        return () => { mountedRef.current = false; };
    }, [fetchData]);

    // Refetch on window focus
    useEffect(() => {
        if (!refetchOnFocus) return;

        const handleFocus = () => {
            const cached = apiCache.get(cacheKey);
            if (!cached || Date.now() - cached.timestamp > ttl) {
                fetchData(false);
            }
        };

        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [refetchOnFocus, cacheKey, ttl, fetchData]);

    return { data, loading, error, refetch, mutate };
}

/**
 * Czyści cały cache lub wybrany klucz
 */
export function clearApiCache(key = null) {
    if (key) {
        apiCache.delete(key);
    } else {
        apiCache.clear();
    }
}

export default useCachedApi;
