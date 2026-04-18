import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { serve } from '@hono/node-server';
import { Scalar } from '@scalar/hono-api-reference';
import type { Context, MiddlewareHandler } from 'hono';
import type { Logging } from 'homebridge';
import { SecurityState } from '../types/security-state-type.js';
import { OriginType } from '../types/origin-type.js';
import { stateToMode } from '../utils/state-util.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { StateHandler } from '../handlers/state-handler.js';
import type { TripHandler } from '../handlers/trip-handler.js';
import type { SwitchHandler } from '../handlers/switch-handler.js';
import { ErrorSchema } from '../schemas/error-schema.js';
import { StatusResponseSchema } from '../schemas/status-response-schema.js';
import { ModeRequestSchema } from '../schemas/mode-request-schema.js';
import { ArmingLockRequestSchema } from '../schemas/arming-lock-schema.js';

const MODE_TO_STATE: Record<string, SecurityState> = {
  home: SecurityState.HOME,
  away: SecurityState.AWAY,
  night: SecurityState.NIGHT,
  off: SecurityState.OFF,
};

const AUTH_RESPONSES = {
  401: {
    content: { 'application/json': { schema: ErrorSchema } },
    description: 'API key required',
  },
  403: {
    content: { 'application/json': { schema: ErrorSchema } },
    description: 'API key invalid or blocked',
  },
} as const;

const statusRoute = createRoute({
  method: 'get',
  path: '/status',
  summary: 'Get system status',
  description:
    'Returns the current arming state, active mode, target mode, and trip status of the security system.',
  security: [{ BearerAuth: [] }],
  responses: {
    200: {
      content: { 'application/json': { schema: StatusResponseSchema } },
      description: 'Current system status',
    },
    ...AUTH_RESPONSES,
  },
});

const modeRoute = createRoute({
  method: 'put',
  path: '/mode',
  summary: 'Change security mode',
  description:
    'Sets the target security mode. Supported modes: home, away, night, off, triggered. ' +
    'Use "triggered" to activate the alarm. An optional delay (ms) defers the transition.',
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: ModeRequestSchema,
          example: { mode: 'home', delay: 5000 },
        },
      },
      required: true,
    },
  },
  responses: {
    204: { description: 'Mode change accepted' },
    ...AUTH_RESPONSES,
    409: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Mode change rejected by the system',
    },
  },
});

const armingLockRoute = createRoute({
  method: 'put',
  path: '/switches/arming-lock',
  summary: 'Update arming lock switch',
  description: 'Enables or disables the arming lock for a specific mode or globally.',
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: ArmingLockRequestSchema,
          example: { mode: 'home', value: true },
        },
      },
      required: true,
    },
  },
  responses: {
    204: { description: 'Arming lock updated' },
    ...AUTH_RESPONSES,
    409: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Arming lock update rejected by the system',
    },
  },
});

/** Hono HTTP server providing remote control of the security system. */
export class ServerService {
  private readonly application = new OpenAPIHono();

  constructor(
    private readonly log: Logging,
    private readonly options: SecuritySystemOptions,
    private readonly state: SystemState,
    private readonly stateHandler: StateHandler,
    private readonly tripHandler: TripHandler,
    private readonly switchHandler: SwitchHandler,
  ) {}

  start(): void {
    this.registerRoutes();

    const server = serve(
      { fetch: this.application.fetch, port: this.options.serverPort! },
      () => this.log.info(`Server (${this.options.serverPort})`),
    );

    server.on('error', (error: Error) => {
      this.log.error('Server error.');
      this.log.error(String(error));
    });
  }

  private createAuthMiddleware(): MiddlewareHandler {
    return async (c, next) => {
      const authError = this.authenticate(c);
      if (authError !== null) {
        return authError;
      }
      await next();
    };
  }

  private registerRoutes(): void {
    const auth = this.createAuthMiddleware();

    // Scalar UI
    this.application.get(
      '/',
      Scalar({
        url: '/openapi.json',
        pageTitle: 'Homebridge Security System API',
        defaultOpenAllTags: true,
      }),
    );

    // Register Bearer auth security scheme for OpenAPI documentation
    this.application.openAPIRegistry.registerComponent('securitySchemes', 'BearerAuth', {
      type: 'http',
      scheme: 'bearer',
      description: 'API key configured via the server_api_key plugin option.',
    });

    // OpenAPI spec
    this.application.doc('/openapi.json', {
      openapi: '3.1.0',
      info: {
        title: 'Homebridge Security System API',
        version: '1.0.0',
        description: 'Remote control API for the Homebridge Security System plugin.',
      },
    });

    // GET /status
    this.application.use('/status', auth);
    this.application.openapi(statusRoute, (c) => {
      return c.json({
        arming: this.state.isArming,
        current_mode: stateToMode(this.state.currentState),
        target_mode: stateToMode(this.state.targetState),
        tripped: this.stateHandler.isTripping(),
      });
    });

    // PUT /mode
    this.application.use('/mode', auth);
    this.application.openapi(modeRoute, (c) => {
      const { mode, delay = 0 } = c.req.valid('json');
      let success: boolean;

      if (mode === 'triggered') {
        if (delay > 0) {
          success = this.tripHandler.updateTripSwitch(true, OriginType.EXTERNAL, false);
        } else {
          if (this.state.currentState === SecurityState.OFF && !this.options.overrideOff) {
            return c.json({ reason: 'Cannot trigger alarm while system is disarmed' }, 409);
          }
          this.stateHandler.setCurrentState(SecurityState.TRIGGERED, OriginType.EXTERNAL);
          success = true;
        }
      } else {
        success = this.stateHandler.updateTargetState(MODE_TO_STATE[mode], OriginType.EXTERNAL, delay);
      }

      if (!success) {
        return c.json({ reason: 'Mode change rejected by the system' }, 409);
      }

      return c.body(null, 204);
    });

    // PUT /switches/arming-lock
    this.application.use('/switches/arming-lock', auth);
    this.application.openapi(armingLockRoute, (c) => {
      const { mode, value } = c.req.valid('json');
      const success = this.switchHandler.updateArmingLock(mode, value);

      if (!success) {
        return c.json({ reason: 'Arming lock update rejected by the system' }, 409);
      }

      return c.body(null, 204);
    });
  }

  /**
   * Validates the Authorization: Bearer <key> header when serverApiKey is configured.
   * Returns an error Response on failure, or null to allow the request through.
   */
  private authenticate(context: Context): Response | null {
    if (this.options.serverApiKey === null) {
      return null;
    }

    const authHeader = context.req.header('Authorization');

    if (authHeader === undefined || !authHeader.startsWith('Bearer ')) {
      this.log.info('API key required - Authorization header missing (Server)');
      return context.json(
        { reason: 'API key required. Use the Authorization: Bearer <key> header.' },
        401,
      ) as Response;
    }

    if (this.state.serverAuthenticationAttempts >= 5) {
      this.log.warn('API key blocked - too many invalid attempts (Server)');
      return context.json(
        { reason: 'API key blocked due to too many invalid attempts' },
        403,
      ) as Response;
    }

    const apiKey = authHeader.slice('Bearer '.length).trim();

    if (apiKey !== this.options.serverApiKey) {
      this.state.serverAuthenticationAttempts++;
      this.log.warn(`API key invalid - attempt ${this.state.serverAuthenticationAttempts}/5 (Server)`);
      return context.json({ reason: 'API key invalid' }, 403) as Response;
    }

    this.state.serverAuthenticationAttempts = 0;
    return null;
  }
}
