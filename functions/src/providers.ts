import { ProviderRegistry } from './types';

/**
 * Provider Registry
 * Version: v1.1.1
 */
export const PROVIDER_REGISTRY: ProviderRegistry = {
  pollinations: {
    id: 'pollinations',
    label: 'Pollinations.ai',
    docsUrl: 'https://github.com/pollinations/pollinations',
    apiKeyUrl: 'https://enter.pollinations.ai/',
    auth: {
      type: 'bearer',
      headerName: 'Authorization',
      format: 'Bearer {API_KEY}'
    },
    categories: {
      image: {
        enabled: true,
        generate: {
          method: 'GET',
          urlTemplate: 'https://gen.pollinations.ai/image/${prompt}?width=${width}&height=${height}&model=${model}&seed=${seed}&nologo=true',
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
          method: 'POST',
          url: 'https://gen.pollinations.ai/v1/chat/completions',
          contentType: 'application/json',
          promptLocation: 'body'
        },
        fields: [
            { key: 'model', type: 'select', options: ['openai', 'mistral', 'searchgpt', 'gemini', 'deepseek'], optional: false }
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
        enabled: false,
        generate: {
          method: 'POST',
          url: 'https://openrouter.ai/api/v1/chat/completions',
          contentType: 'application/json',
          promptLocation: 'body'
        },
        fields: [
          { key: 'model', type: 'text', optional: false }
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
