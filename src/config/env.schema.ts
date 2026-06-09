import { z, ZodIssueCode } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().min(1),
    DB_SYNCHRONIZE: z
      .preprocess((value) => {
        if (typeof value === 'string') {
          return value.toLowerCase() === 'true';
        }

        return value;
      }, z.boolean())
      .default(true),
    SESSION_TTL_SECONDS: z.coerce.number().int().min(60).default(86_400),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),
    STRIPE_SIGNATURE_TOLERANCE_SECONDS: z.coerce.number().int().min(1).default(300),
    PRAGMATIC_WEBHOOK_SECRET: z.string().optional().default(''),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV !== 'production') {
      return;
    }

    if (!env.STRIPE_WEBHOOK_SECRET) {
      context.addIssue({
        code: ZodIssueCode.custom,
        path: ['STRIPE_WEBHOOK_SECRET'],
        message: 'STRIPE_WEBHOOK_SECRET is required in production',
      });
    }

    if (!env.PRAGMATIC_WEBHOOK_SECRET) {
      context.addIssue({
        code: ZodIssueCode.custom,
        path: ['PRAGMATIC_WEBHOOK_SECRET'],
        message: 'PRAGMATIC_WEBHOOK_SECRET is required in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${formatted}`);
  }

  return parsed.data;
}
