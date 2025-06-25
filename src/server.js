const express = require("express");
const options = require("./utils/options.js");

module.exports = function attachServer(SecuritySystem, Characteristic, originTypes) {
  SecuritySystem.prototype.isAuthenticated = function (req, res) {
    if (options.serverCode === null) {
      return null;
    }

    const code = req.query.code;

    if (code === undefined) {
      this.sendCodeRequiredError(res);
      return false;
    }

    if (this.invalidCodeCount >= 5) {
      req.blocked = true;
      this.sendCodeInvalidError(req, res);
      return false;
    }

    const userCode = parseInt(code);

    if (userCode !== options.serverCode) {
      this.invalidCodeCount++;
      this.sendCodeInvalidError(req, res);
      return false;
    }

    this.invalidCodeCount = 0;
    return true;
  };

  SecuritySystem.prototype.getDelayParameter = function (req) {
    return req.query.delay === "true" ? true : false;
  };

  SecuritySystem.prototype.sendCodeRequiredError = function (res) {
    this.log.info("Code required (Server)");

    const response = {
      error: true,
      message: "Code required",
      hint: "Add the 'code' URL parameter with your security code",
    };

    res.status(401).json(response);
  };

  SecuritySystem.prototype.sendCodeInvalidError = function (req, res) {
    const response = { error: true };

    if (req.blocked) {
      this.log.info("Code blocked (Server)");
      response.message = "Code blocked";
    } else {
      this.log.info("Code invalid (Server)");
      response.message = "Code invalid";
    }

    res.status(403).json(response);
  };

  SecuritySystem.prototype.sendResultResponse = function (res, success) {
    const response = {
      error: success ? false : true,
    };

    res.json(response);
  };

  SecuritySystem.prototype.startServer = async function () {
    const app = express();

    app.get("/", (req, res) => {
      res.redirect(
        "https://github.com/MiguelRipoll23/homebridge-securitysystem/wiki/Server"
      );
    });

    app.get("/status", (req, res) => {
      if (this.isAuthenticated(req, res) === false) {
        return;
      }

      const response = {
        arming: this.isArming,
        current_mode: this.state2Mode(this.currentState),
        target_mode: this.state2Mode(this.targetState),
        tripped: this.triggerTimeout !== null,
      };

      res.json(response);
    });

    app.get("/triggered", (req, res) => {
      if (this.isAuthenticated(req, res) === false) {
        return;
      }

      let result = true;

      if (this.getDelayParameter(req)) {
        result = this.updateTripSwitch(true, originTypes.EXTERNAL, false, null);
      } else {
        const isCurrentStateDisarmed =
          this.currentState === Characteristic.SecuritySystemCurrentState.DISARMED;

        if (isCurrentStateDisarmed && options.overrideOff === false) {
          this.sendResultResponse(res, false);
          return;
        }

        this.setCurrentState(
          Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED,
          originTypes.EXTERNAL
        );
      }

      this.sendResultResponse(res, result);
    });

    app.get("/home", (req, res) => {
      if (this.isAuthenticated(req, res) === false) {
        return;
      }

      const state = Characteristic.SecuritySystemTargetState.STAY_ARM;
      const delay = this.getDelayParameter(req);
      const result = this.updateTargetState(
        state,
        originTypes.EXTERNAL,
        delay,
        null
      );

      this.sendResultResponse(res, result);
    });

    app.get("/away", (req, res) => {
      if (this.isAuthenticated(req, res) === false) {
        return;
      }

      const state = Characteristic.SecuritySystemTargetState.AWAY_ARM;
      const delay = this.getDelayParameter(req);
      const result = this.updateTargetState(
        state,
        originTypes.EXTERNAL,
        delay,
        null
      );

      this.sendResultResponse(res, result);
    });

    app.get("/night", (req, res) => {
      if (this.isAuthenticated(req, res) === false) {
        return;
      }

      const state = Characteristic.SecuritySystemTargetState.NIGHT_ARM;
      const delay = this.getDelayParameter(req);
      const result = this.updateTargetState(
        state,
        originTypes.EXTERNAL,
        delay,
        null
      );

      this.sendResultResponse(res, result);
    });

    app.get("/off", (req, res) => {
      if (this.isAuthenticated(req, res) === false) {
        return;
      }

      const state = Characteristic.SecuritySystemTargetState.DISARM;
      const delay = this.getDelayParameter(req);
      const result = this.updateTargetState(
        state,
        originTypes.EXTERNAL,
        delay,
        null
      );

      this.sendResultResponse(res, result);
    });

    app.get("/arming-lock/:mode/:value", (req, res) => {
      if (this.isAuthenticated(req, res) === false) {
        return;
      }

      const mode = req.params["mode"].toLowerCase();
      const value = req.params["value"].includes("on");
      const result = this.updateArmingLock(mode, value);

      this.sendResultResponse(res, result);
    });

    const server = app.listen(options.serverPort, (error) => {
      if (error) {
        this.log.error("Error while starting server.");
        this.log.error(error);
        return;
      }

      this.log.info(`Server (${options.serverPort})`);
    });

    server.on("error", (error) => {
      this.log.error("Error while starting server.");
      this.log.error(error);
    });
  };
};
