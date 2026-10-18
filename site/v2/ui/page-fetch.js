// One request per URL for the life of the page: the context line, the season's checks and Home
// each read the NFL schedule, the calendar and the draft, and MFL throttles bursts. A failed request
// is forgotten, so Retry asks again.

const responses = new Map();

export function pageFetch(url, init) {
    const key = String(url);
    if (!responses.has(key)) {
        const request = fetch(url, init).then((response) => {
            if (!response.ok) {
                responses.delete(key);
            }
            return response;
        }, (error) => {
            responses.delete(key);
            throw error;
        });
        responses.set(key, request);
    }
    // each caller reads its own copy of the body
    return responses.get(key).then((response) => response.clone());
}
