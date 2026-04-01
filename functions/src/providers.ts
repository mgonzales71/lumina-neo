import { ProviderRegistry } from './types';

/**
 * Provider Registry
 * Version: v1.3.1
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
          { key: 'model', type: 'select', options: ['flux', 'flux-realism', 'any-dark', 'turbo', 'gptimage', 'gptimage-large', 'zimage'], optional: false },
          { key: 'seed', type: 'number', optional: true },
          { key: 'enhance', type: 'boolean', optional: true },
          { key: 'safe', type: 'boolean', optional: true },
          { key: 'quality', type: 'select', options: ['low', 'medium', 'high', 'hd'], optional: true },
          { key: 'transparent', type: 'boolean', optional: true },
          { key: 'negative_prompt', type: 'text', optional: true }
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
    docsUrl: 'https://openrouter.ai/docs#images',
    apiKeyUrl: 'https://openrouter.ai/keys',
    auth: {
      type: 'bearer',
      headerName: 'Authorization',
      format: 'Bearer {API_KEY}'
    },
    categories: {
      image: {
        enabled: true,
        modelsUrl: 'https://openrouter.ai/api/v1/models',
        generate: {
          method: 'POST',
          url: 'https://openrouter.ai/api/v1/images/generations',
          contentType: 'application/json',
          promptLocation: 'body'
        },
        fields: [
          { key: 'model', type: 'select', source: 'models', options: [
            'black-forest-labs/flux-schnell',
            'black-forest-labs/flux-1.1-pro',
            'black-forest-labs/flux-1.1-pro-ultra',
            'openai/dall-e-3',
            'openai/dall-e-2',
            'stability-ai/stable-diffusion-xl-base-1.0'
          ], optional: false },
          { key: 'prompt_upsampling', type: 'boolean',  optional: true },
          { key: 'seed',             type: 'number',   optional: true },
          { key: 'steps',            type: 'number',   optional: true },
          { key: 'guidance_scale',   type: 'number',   optional: true },
          { key: 'negative_prompt',  type: 'text',     optional: true }
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
