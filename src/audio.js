const fs = require('fs');
const { spawn } = require('child_process');
const fetch = require('node-fetch');
const options = require('./utils/options');

function registerAudio(SecuritySystem, Characteristic, originTypes) {
  SecuritySystem.prototype.playAudio = async function (type, state) {
    // Check option
    if (options.audio === false) {
      return;
    }
  
    const mode = this.state2Mode(state);
  
    // Close previous player
    this.stopAudio();
  
    // Ignore 'Current Off' event
    if (mode === "off") {
      if (type === "target") {
        return;
      }
    }
  
    // Check audio switch except for triggered
    const audioSwitchOnCharacteristic = this.audioSwitchService.getCharacteristic(
      Characteristic.On
    );
    const isAudioDisabledBySwitch = audioSwitchOnCharacteristic.value === false;
  
    if (mode !== "triggered" && isAudioDisabledBySwitch) {
      return;
    }
  
    // Directory
    let directory = `${__dirname}/../sounds`;
  
    if (options.isValueSet(options.audioPath)) {
      directory = options.audioPath;
  
      if (directory[directory.length] === "/") {
        directory = directory.substring(0, directory.length - 1);
      }
    }
  
    // Check if file exists
    const filename = `${type}-${mode}.mp3`;
    const filePath = `${directory}/${options.audioLanguage}/${filename}`;
  
    try {
      await fs.promises.access(filePath);
    } catch (error) {
      this.log.debug(`Sound file not found (${filePath})`);
      return;
    }
  
    // Arguments
    let commandArguments = ["-loglevel", "error", "-nodisp", "-i", `${filePath}`];
  
    if (mode === "triggered") {
      commandArguments.push("-loop");
      commandArguments.push("-1");
    } else if (
      (mode === "home" || mode === "night" || mode === "away") &&
      type === "target" &&
      options.audioArmingLooped
    ) {
      commandArguments.push("-loop");
      commandArguments.push("-1");
    } else if (mode === "warning" && options.audioAlertLooped) {
      commandArguments.push("-loop");
      commandArguments.push("-1");
    } else {
      commandArguments.push("-autoexit");
    }
  
    if (options.isValueSet(options.audioVolume)) {
      commandArguments.push("-volume");
      commandArguments.push(options.audioVolume);
    }
  
    // Process
    const environmentVariables = [process.env];
  
    options.audioExtraVariables.forEach((variable) => {
      const key = variable.key;
      const value = variable.value;
      environmentVariables[key] = value;
    });
  
    this.log.debug("Environment Variables (Audio)", environmentVariables);
  
    const ffplayEnv = {
      ...process.env,
      ...environmentVariables,
    };
  
    this.audioProcess = spawn("ffplay", commandArguments, { env: ffplayEnv });
    this.log.debug(`ffplay ${commandArguments.join(" ")}`);
  
    this.audioProcess.on("error", (data) => {
      // Check if command is missing
      if (data !== null && data.toString().indexOf("ENOENT") > -1) {
        this.log.error("Unable to play sound, ffmpeg is not installed.");
        return;
      }
  
      this.log.error(`Unable to play sound.\n${data}`);
    });
  
    this.audioProcess.on("close", function () {
      this.audioProcess = null;
    });
  };
  
  SecuritySystem.prototype.stopAudio = function () {
    if (this.audioProcess !== null) {
      this.audioProcess.kill();
    }
  };
  
  SecuritySystem.prototype.setupAudio = async function () {
    try {
      await fs.promises.access(`${options.audioPath}/${options.audioLanguage}`);
    } catch (error) {
      await fs.promises.mkdir(`${options.audioPath}/${options.audioLanguage}`);
      await fs.promises.copyFile(
        `${__dirname}/sounds/README`,
        `${options.audioPath}/README`
      );
      await fs.promises.copyFile(
        `${__dirname}/sounds/README`,
        `${options.audioPath}/README.txt`
      );
  
      this.log.warn("Check audio path directory for instructions.");
    }
  };
  
  // Command
  SecuritySystem.prototype.executeCommand = function (type, state, origin) {
    // Check proxy mode
    if (options.proxyMode && origin === originTypes.EXTERNAL) {
      this.log.debug("Command bypassed as proxy mode is enabled.");
      return;
    }
  
    let command = null;
  
    switch (state) {
      case Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED:
        command = options.commandCurrentTriggered;
        break;
  
      case Characteristic.SecuritySystemCurrentState.STAY_ARM:
        if (type === "current") {
          command = options.commandCurrentHome;
          break;
        }
  
        command = options.commandTargetHome;
        break;
  
      case Characteristic.SecuritySystemCurrentState.AWAY_ARM:
        if (type === "current") {
          command = options.commandCurrentAway;
          break;
        }
  
        command = options.commandTargetAway;
        break;
  
      case Characteristic.SecuritySystemCurrentState.NIGHT_ARM:
        if (type === "current") {
          command = options.commandCurrentNight;
          break;
        }
  
        command = options.commandTargetNight;
        break;
  
      case Characteristic.SecuritySystemCurrentState.DISARMED:
        if (type === "current") {
          command = options.commandCurrentOff;
          break;
        }
  
        command = options.commandTargetOff;
        break;
  
      case "warning":
        command = options.commandCurrentWarning;
        break;
  
      default:
        this.log.error(`Unknown command ${type} state (${state})`);
    }
  
    if (command === undefined || command === null) {
      this.log.debug(`Command option for ${type} mode is not set.`);
      return;
    }
  
    // Parameters
    command = command.replace(
      "${currentMode}",
      this.state2Mode(this.currentState)
    );
  
    const process = spawn(command, { shell: true });
  
    process.stderr.on("data", (data) => {
      this.log.error(`Command failed (${command})\n${data}`);
    });
  
    process.stdout.on("data", (data) => {
      this.log.info(`Command output: ${data}`);
    });
  };
  
  // Webhooks
  SecuritySystem.prototype.sendWebhookEvent = function (type, state, origin) {
    // Check webhook host
    if (options.isValueSet(options.webhookUrl) === false) {
      this.log.debug("Webhook base URL option is not set.");
      return;
    }
  
    // Check proxy mode
    if (options.proxyMode && origin === originTypes.EXTERNAL) {
      this.log.debug("Webhook bypassed as proxy mode is enabled.");
      return;
    }
  
    let path = null;
  
    switch (state) {
      case Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED:
        path = options.webhookCurrentTriggered;
        break;
  
      case Characteristic.SecuritySystemCurrentState.STAY_ARM:
        if (type === "current") {
          path = options.webhookCurrentHome;
          break;
        }
  
        path = options.webhookTargetHome;
        break;
  
      case Characteristic.SecuritySystemCurrentState.AWAY_ARM:
        if (type === "current") {
          path = options.webhookCurrentAway;
          break;
        }
  
        path = options.webhookTargetAway;
        break;
  
      case Characteristic.SecuritySystemCurrentState.NIGHT_ARM:
        if (type === "current") {
          path = options.webhookCurrentNight;
          break;
        }
  
        path = options.webhookTargetNight;
        break;
  
      case Characteristic.SecuritySystemCurrentState.DISARMED:
        if (type === "current") {
          path = options.webhookCurrentOff;
          break;
        }
  
        path = options.webhookTargetOff;
        break;
  
      case "warning":
        path = options.webhookCurrentWarning;
        break;
  
      default:
        this.log.error(`Unknown webhook ${type} state (${state})`);
        return;
    }
  
    if (path === undefined || path === null) {
      this.log.debug(`Webhook option for ${type} mode is not set.`);
      return;
    }
  
    // Parameters
    path = path.replace("${currentMode}", this.state2Mode(this.currentState));
  
    // Send GET request to server
    fetch(options.webhookUrl + path)
      .then((response) => {
        if (response.ok === false) {
          throw new Error(`Status code (${response.status})`);
        }
  
        this.log.info("Webhook event (Sent)");
      })
      .catch((error) => {
        this.log.error(`Request to webhook failed. (${path})`);
        this.log.error(error);
      });
  };
}

module.exports = { registerAudio };
