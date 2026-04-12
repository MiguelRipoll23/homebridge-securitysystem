import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { Context } from 'hono';
import type { Logging } from 'homebridge';
import { SecurityState } from '../types/security-state-type.js';
import { OriginType } from '../types/origin-type.js';
import { stateToMode } from '../utils/state-util.js';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';
import type { SystemState } from '../interfaces/system-state-interface.js';
import type { StateHandler } from '../handlers/state-handler.js';
import type { TripHandler } from '../handlers/trip-handler.js';
import type { SwitchHandler } from '../handlers/switch-handler.js';

/** Hono HTTP server providing remote control of the security system. */
export class ServerService {
  private readonly application = new Hono();

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

  private registerRoutes(): void {
    this.application.get('/', (context) =>
      context.redirect('https://github.com/MiguelRipoll23/homebridge-securitysystem/wiki/Server'),
    );

    this.application.get('/status', (context) => {
      const authError = this.authenticate(context);
      if (authError !== null) {
        return authError;
      }

      return context.json({
        arming: this.state.isArming,
        current_mode: stateToMode(this.state.currentState),
        target_mode: stateToMode(this.state.targetState),
        tripped: this.stateHandler.isTripping(),
      });
    });

    this.application.get('/triggered', (context) => {
      const authError = this.authenticate(context);
      if (authError !== null) {
        return authError;
      }

      const delay = this.parseDelay(context);
      let success: boolean;

      if (delay > 0) {
        success = this.tripHandler.updateTripSwitch(true, OriginType.EXTERNAL, false);
      } else {
        if (this.state.currentState === SecurityState.OFF && !this.options.overrideOff) {
          return context.json({ error: true });
        }
        this.stateHandler.setCurrentState(SecurityState.TRIGGERED, OriginType.EXTERNAL);
        success = true;
      }

      return context.json({ error: !success });
    });

    this.application.get('/home', (context) => {
      const authError = this.authenticate(context);
      if (authError !== null) {
        return authError;
      }

      const delay = this.parseDelay(context);
      const success = this.stateHandler.updateTargetState(SecurityState.HOME, OriginType.EXTERNAL, delay);
      return context.json({ error: !success });
    });

    this.application.get('/away', (context) => {
      const authError = this.authenticate(context);
      if (authError !== null) {
        return authError;
      }

      const delay = this.parseDelay(context);
      const success = this.stateHandler.updateTargetState(SecurityState.AWAY, OriginType.EXTERNAL, delay);
      return context.json({ error: !success });
    });

    this.application.get('/night', (context) => {
      const authError = this.authenticate(context);
      if (authError !== null) {
        return authError;
      }

      const delay = this.parseDelay(context);
      const success = this.stateHandler.updateTargetState(SecurityState.NIGHT, OriginType.EXTERNAL, delay);
      return context.json({ error: !success });
    });

    this.application.get('/off', (context) => {
      const authError = this.authenticate(context);
      if (authError !== null) {
        return authError;
      }

      const success = this.stateHandler.updateTargetState(SecurityState.OFF, OriginType.EXTERNAL, 0);
      return context.json({ error: !success });
    });

    this.application.get('/arming-lock/:mode/:value', (context) => {
      const authError = this.authenticate(context);
      if (authError !== null) {
        return authError;
      }

      const mode = context.req.param('mode').toLowerCase();
      const value = context.req.param('value').includes('on');
      const success = this.switchHandler.updateArmingLock(mode, value);
      return context.json({ error: !success });
    });
  }

  /**
   * Checks authentication and returns an error Response if it fails,
   * or null if the request is allowed to proceed.
   */
  private authenticate(context: Context): Response | null {
    if (this.options.serverCode === null) {
      return null;
    }

    const code = context.req.query('code');

    if (code === undefined) {
      this.log.info('Code required (Server)');
      return context.json(
        { error: true, message: 'Code required', hint: 'Add the \'code\' URL parameter.' },
        401,
      );
    }

    if (this.state.invalidCodeCount >= 5) {
      this.log.info('Code blocked (Server)');
      return context.json({ error: true, message: 'Code blocked' }, 403);
    }

    if (parseInt(code, 10) !== this.options.serverCode) {
      this.state.invalidCodeCount++;
      this.log.info('Code invalid (Server)');
      return context.json({ error: true, message: 'Code invalid' }, 403);
    }

    this.state.invalidCodeCount = 0;
    return null;
  }

  private parseDelay(context: Context): number {
    const rawValue = parseInt(context.req.query('delay') ?? '', 10);
    return isNaN(rawValue) || rawValue < 0 ? 0 : rawValue;
  }
}
