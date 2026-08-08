const browserFetch = globalThis.fetch.bind(globalThis);

export const fetch = browserFetch;
export default browserFetch;
