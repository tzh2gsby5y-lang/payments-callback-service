export const PspProviders = {
  STRIPE: 'stripe',
} as const;

export type PspProvider = (typeof PspProviders)[keyof typeof PspProviders];

export const GspProviders = {
  PRAGMATIC: 'pragmatic',
} as const;

export type GspProvider = (typeof GspProviders)[keyof typeof GspProviders];
