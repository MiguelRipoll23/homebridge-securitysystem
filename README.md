# homebridge-securitysystem
[![NPM version](https://img.shields.io/npm/v/homebridge-securitysystem.svg)](https://www.npmjs.com/package/homebridge-securitysystem) [![NPM downloads](https://img.shields.io/npm/dt/homebridge-securitysystem.svg)](https://www.npmjs.com/package/homebridge-securitysystem)

Homebridge plugin that creates a security system accessory that can be triggered by HomeKit accessories.

## Installation
If you already have Homebridge installed, skip to step two!

1. [Install Homebridge.](https://github.com/nfarina/homebridge)
2. Install the plugin using `npm install -g --unsafe-perm homebridge-securitysystem`.
3. Update your configuration file from Homebridge (see `sample-config.json` as an example) that you can find on your personal folder.

## Automations
Use Eve or a similar app to create automations like these:

| Trigger                       | Condition                         | Scene actions                     |
|-------------------------------|-----------------------------------|-----------------------------------|
| Motion is detected            | Security system is set to `Night` | Turn on `Siren`                   |
| Door is opened                | Security system is set to `Away`  | Turn on `Siren`                   |
| NFC tag is detected (1) (2)   | None                              | Set security system to `Home`     |
| Security system triggers      | None                              | Play media (1)                    |

(1) Requires iOS 13 or above.

(2) Shortcuts app is required to create this automation.

**Important:** Use a NFC tag to arm/disarm the security system easily and securely without using the Home app.

## Options
| Option           | Required | Description                                                                    | Value/s                   |
|------------------|----------|--------------------------------------------------------------------------------|---------------------------|
| default_mode     | No       | Initial mode for the security system when running Homebridge.                  | home\|away\|night\|off    |
| disabled_modes   | No       | Modes to exclude from the available modes list.                                | [home, away, night, off]  |
| arm_seconds      | No       | Time in seconds to arm the security system after the user requesting it.       | any positive number       |
| trigger_seconds  | No       | Time in seconds to be able to disarm the security system before triggering it. | any positive number       |
| siren_switch (1) | No       | Shows a switch on the Home app to trigger the security system.                 | true/false                |
| override_off     | No       | Allows to trigger the security system while disarmed.                          | true/false                |
| save_state       | No       | State persistence for shutdowns and reboots.                                   | true/false                |

(1) A powerful HomeKit app like Eve is required if the siren switch option is disabled to trigger the security system without using a switch accessory.

## Server options
To enable remote state changes you can set the option `server_port` that will start a web server on your Homebridge device and allow you to change the current state from the security system or trigger it remotely.

| Option            | Required | Description                                                                     | Value/s                |
|-------------------|----------|---------------------------------------------------------------------------------|------------------------|
| server_port       | No       | Port of the web server that will run on your Homebridge device.                 | 0-65535                |
| server_code       | No       | Code to authenticate requests sent to the security system.                      | any number             |
| server_arm_delay  | No       | Allows to enable or disable the arming delay.                                   | true/false             |

After setting the option, you can call these endpoints:

| Method | Endpoint                     | Description                                        |
|--------|------------------------------|----------------------------------------------------|
| GET    | /home                        | Changes current security system mode to home.      |
| GET    | /away                        | Changes current security system mode to away.      |
| GET    | /night                       | Changes current security system mode to night.     |
| GET    | /off                         | Changes current security system mode to off.       |
| GET    | /triggered                   | Changes current security system mode to triggered. |

If you're using the `server_code` option, add `?code=[your_code]` at the end of the URL.

## Webhook options
To enable webhooks you can set the option `webhook_url` and requests to the server set will be made when the security system mode changes.

| Option             | Required | Description                                                                    | Value/s                |
|--------------------|----------|--------------------------------------------------------------------------------|------------------------|
| webhook_url        | No       | URL of a web server if you would like to use webhooks.                         | http://example.ltd     |
| webhook_home       | No       | Path of the 'home' mode used on your web server.                               | /your-path             |
| webhook_away       | No       | Path of the 'away' mode used on your web server.                               | /your-path             |
| webhook_night      | No       | Path of the 'night' mode used on your web server.                              | /your-path             |
| webhook_off        | No       | Path of the 'off' mode used on your web server.                                | /your-path             |
| webhook_triggered  | No       | Path of the 'triggered' mode used on your web server.                          | /your-path             |

## Command options
To enable commands you can set the option `command` and commands on the running device will be executed when the security system mode changes.

| Option             | Required | Description                                                                    | Value/s                |
|--------------------|----------|--------------------------------------------------------------------------------|------------------------|
| command            | No       | Enables commands on the running device.                                        | true/false             |
| command_home       | No       | Command of the 'home' mode to execute on the running device.                   | any string             |
| command_away       | No       | Command of the 'away' mode to execute on the running device.                   | any string             |
| command_night      | No       | Command of the 'night' mode to execute on the running device.                  | any string             |
| command_off        | No       | Command of the 'off' mode to execute on the running device.                    | any string             |
| command_triggered  | No       | Command of the 'triggered' mode to execute on the running device.              | any string             |
