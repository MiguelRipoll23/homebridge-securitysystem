import { z } from '@hono/zod-openapi';

export const ModeRequestSchema = z
  .object({
    mode: z
      .enum(['home', 'away', 'night', 'off', 'triggered'])
      .openapi({ example: 'home', description: 'Target security mode to activate' }),
    delay: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .openapi({
        example: 5,
        description: 'Optional delay in seconds before applying the mode change',
      }),
  })
  .openapi('ModeRequest');
