// Browser storage that fails quietly: private windows and blocked storage just don't remember.

export const storage = {
    get(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (error) {
            return null;
        }
    },
    set(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch (error) {
        }
    }
};

// {storedAt, value} under `key`, or null
export function saved(key) {
    try {
        const entry = JSON.parse(storage.get(key));
        return entry && "storedAt" in entry ? entry : null;
    } catch (error) {
        return null;
    }
}

export function save(key, value) {
    storage.set(key, JSON.stringify({storedAt: Date.now(), value}));
}

export async function cached(key, maxAge, load) {
    const entry = saved(key);
    if (entry && Date.now() - entry.storedAt < maxAge) {
        return entry.value;
    }
    const value = await load();
    save(key, value);
    return value;
}
