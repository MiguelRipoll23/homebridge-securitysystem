import { z } from '@hono/zod-openapi';

export const ModeRequestSchema = z
  .object({
    mode: z
      .enum(['home', 'away', 'night', 'off'])
      .openapi({ example: 'home', description: 'Target mode to activate (home, away, night, or off)' }),
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
