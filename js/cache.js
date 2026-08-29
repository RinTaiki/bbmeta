

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

export function getCachedData(tag) {
    const key = `player_${tag}`;
    const cached = localStorage.getItem(key);
    
    if (cached) {
        try {
            const data = JSON.parse(cached);
            if (Date.now() - data.timestamp < CACHE_TTL) {
                return data.value;
            } else {
                localStorage.removeItem(key);
            }
        } catch (err) {
            console.error('Failed to parse cached item', err);
            localStorage.removeItem(key);
        }
    }
    return null;
}

export function setCachedData(tag, data) {
    const key = `player_${tag}`;
    const payload = {
        timestamp: Date.now(),
        value: data
    };
    try {
        localStorage.setItem(key, JSON.stringify(payload));
    } catch (err) {
        console.error('Failed to write to cache', err);
    }
}