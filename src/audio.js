const fs = require("fs");
const { spawn } = require("child_process");
const options = require("./utils/options.js");

module.exports = function attachAudio(SecuritySystem, Characteristic) {
  SecuritySystem.prototype.playAudio = async function (type, state) {
    if (options.audio === false) {
      return;
    }

    const mode = this.state2Mode(state);
    this.stopAudio();

    if (mode === "off") {
      if (type === "target") {
        return;
      }
    }

    const audioSwitchOnCharacteristic = this.audioSwitchService.getCharacteristic(
      Characteristic.On
    );
    const isAudioDisabledBySwitch = audioSwitchOnCharacteristic.value === false;

    if (mode !== "triggered" && isAudioDisabledBySwitch) {
      return;
    }

    let directory = `${__dirname}/../sounds`;

    if (options.isValueSet(options.audioPath)) {
      directory = options.audioPath;

      if (directory[directory.length] === "/") {
        directory = directory.substring(0, directory.length - 1);
      }
    }

    const filename = `${type}-${mode}.mp3`;
    const filePath = `${directory}/${options.audioLanguage}/${filename}`;

    try {
      await fs.promises.access(filePath);
    } catch (error) {
      this.log.debug(`Sound file not found (${filePath})`);
      return;
    }

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
      if (data !== null && data.toString().indexOf("ENOENT") > -1) {
        this.log.error("Unable to play sound, ffmpeg is not installed.");
        return;
      }

      this.log.error(`Unable to play sound.\n${data}`);
    });

    this.audioProcess.on("close", () => {
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

  SecuritySystem.prototype.getAudioSwitch = function (callback) {
    const value = this.audioSwitchService.getCharacteristic(
      Characteristic.On
    ).value;
    callback(null, value);
  };

  SecuritySystem.prototype.setAudioSwitch = function (value, callback) {
    this.log.info(`Audio (${value ? "Enabled" : "Disabled"})`);
    callback(null);
  };
};
