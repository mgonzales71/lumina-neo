const API_BASE_URL = '/api';

export async function fetchApi(endpoint, method = 'GET', body = null, headers = {}, signal = null) {
    const url = `${API_BASE_URL}${endpoint}`;

    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...headers
        },
        ...(signal && { signal })
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, options);
        const json = await response.json();

        if (!response.ok || !json.ok) {
            throw new Error(json.error?.message || `API Error: ${response.status}`);
        }

        return json.data;
    } catch (error) {
        if (error.name !== 'AbortError') console.error('API Request Failed:', error);
        throw error;
    }
}
