import { z } from '@hono/zod-openapi';

export const StatusResponseSchema = z
  .object({
    arming: z.boolean().openapi({ example: false, description: 'Whether the system is currently arming' }),
    current_mode: z.string().openapi({ example: 'off', description: 'The current active mode' }),
    target_mode: z.string().openapi({ example: 'home', description: 'The target mode being transitioned to' }),
    tripped: z.boolean().openapi({ example: false, description: 'Whether a trip switch is active' }),
  })
  .openapi('StatusResponse');
