import { ref } from 'vue';

const apiUrl = ref('');

export function useApi() {
    const initApi = async () => {
        // Unified Server / Dev Mode : Relative path for cookies support
        if (window.location.protocol.startsWith('http')) {
            apiUrl.value = '/api';
            console.log('API config (HTTP): Relative /api');
            return;
        }

        if (window.electronAPI) {
            try {
                let config = await window.electronAPI.getApiConfig();
                // Attendre que le backend ait communiqué son port
                while (!config) {
                    console.log('Waiting for backend port assignment...');
                    await new Promise(r => setTimeout(r, 500));
                    config = await window.electronAPI.getApiConfig();
                }

                if (config && config.baseUrl) {
                    apiUrl.value = config.baseUrl;
                    console.log('API URL initialized:', apiUrl.value);

                    // Vérifier que l'API répond (retry pendant 10s)
                    let retries = 20;
                    while (retries > 0) {
                        try {
                            await fetch(apiUrl.value + '/auth/me'); // Simple ping
                            console.log('API is ready!');
                            break;
                        } catch (e) {
                            console.log('Waiting for API...', retries);
                            await new Promise(r => setTimeout(r, 500));
                            retries--;
                        }
                    }
                }
            } catch (e) {
                console.error('Failed to get API config:', e);
            }
        }
    };

    return {
        apiUrl,
        initApi
    };
}
