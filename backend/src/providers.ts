import { ProviderRegistry } from './types';

export const PROVIDER_REGISTRY: ProviderRegistry = {
  pollinations: {
    id: 'pollinations',
    label: 'Pollinations.ai',
    docsUrl: 'https://github.com/pollinations/pollinations',
    apiKeyUrl: '',
    auth: {
      type: 'bearer', // Not used for Pollinations usually, but fitting the schema
      headerName: 'Authorization',
      format: 'Bearer {API_KEY}'
    },
    categories: {
      image: {
        enabled: true,
        generate: {
          method: 'GET',
          urlTemplate: 'https://image.pollinations.ai/prompt/{prompt}?width={width}&height={height}&model={model}&seed={seed}&nologo=true',
          promptLocation: 'query'
        },
        fields: [
          { key: 'model', type: 'select', options: ['flux', 'flux-realism', 'any-dark', 'turbo'], optional: false },
          { key: 'seed', type: 'number', optional: true }
        ]
      },
      text: {
        enabled: true,
        generate: {
          method: 'POST', // Pollinations text is usually POST
          url: 'https://text.pollinations.ai/',
          contentType: 'application/json',
          promptLocation: 'body'
        },
        fields: [
            { key: 'model', type: 'select', options: ['openai', 'mistral', 'karma'], optional: false }
        ]
      }
    }
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    docsUrl: 'https://openrouter.ai/docs',
    apiKeyUrl: 'https://openrouter.ai/keys',
    auth: {
      type: 'bearer',
      headerName: 'Authorization',
      format: 'Bearer {API_KEY}'
    },
    categories: {
      image: {
        enabled: false, // Can be enabled if user provides key
        generate: {
          method: 'POST',
          url: 'https://openrouter.ai/api/v1/chat/completions',
          contentType: 'application/json',
          promptLocation: 'body'
        },
        fields: [
          { key: 'model', type: 'text', optional: false } // e.g. "stabilityai/stable-diffusion-xl-beta-v2-2-2"
        ]
      },
      text: {
        enabled: true,
        generate: {
          method: 'POST',
          url: 'https://openrouter.ai/api/v1/chat/completions',
          contentType: 'application/json',
          promptLocation: 'body'
        },
        fields: [
           { key: 'model', type: 'text', optional: false }
        ]
      }
    }
  }
};
