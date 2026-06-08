export const ProviderWebhookResponseStatuses = {
  ACCEPTED: 'accepted',
  DUPLICATE: 'duplicate',
  PROCESSING: 'processing',
} as const;

export type ProviderWebhookResponseStatus =
  (typeof ProviderWebhookResponseStatuses)[keyof typeof ProviderWebhookResponseStatuses];

export const ProviderWebhookHandoffStates = {
  PENDING_EVALUATION: 'pending_evaluation',
  ALREADY_PENDING: 'already_pending',
  PENDING_ORIGINAL_CLAIM: 'pending_original_claim',
} as const;

export type ProviderWebhookHandoffState =
  (typeof ProviderWebhookHandoffStates)[keyof typeof ProviderWebhookHandoffStates];
