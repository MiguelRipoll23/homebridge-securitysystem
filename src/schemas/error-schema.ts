import { z } from '@hono/zod-openapi';

export const ErrorSchema = z
  .object({
    reason: z.string().openapi({ example: 'API key invalid' }),
  })
  .openapi('Error');
