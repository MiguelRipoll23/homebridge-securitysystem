import { z } from '@hono/zod-openapi';

export const TripModeRequestSchema = z
  .object({
    mode: z
      .enum(['home', 'away', 'night'])
      .nullable()
      .optional()
      .openapi({
        example: 'home',
        description: 'Mode to trip. If omitted or null, the action applies to all modes.',
      }),
    delay: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .optional()
      .openapi({
        example: 5,
        description: 'Delay in seconds before activating the alarm.',
      }),
  })
  .openapi('TripModeRequest');
