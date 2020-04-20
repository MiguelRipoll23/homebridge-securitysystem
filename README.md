# homebridge-securitysystem
[![NPM version](https://img.shields.io/npm/v/homebridge-securitysystem.svg)](https://www.npmjs.com/package/homebridge-securitysystem) [![NPM downloads](https://img.shields.io/npm/dt/homebridge-securitysystem.svg)](https://www.npmjs.com/package/homebridge-securitysystem)

Homebridge plugin that creates a security system accessory that can be triggered by HomeKit accessories.

[One-time donation](https://paypal.me/miguelripoll23)

## Installation
If you already have Homebridge installed, skip to step two!

1. [Install Homebridge.](https://github.com/nfarina/homebridge)
2. Install the plugin using `npm install -g homebridge-securitysystem`.
3. Update your configuration file from Homebridge (see `config.example.json`) that you can find on your personal folder.

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

## Basic options

| Option              | Description                                                                    | Default |  Example  |
|---------------------|--------------------------------------------------------------------------------|---------|-----------|
| default_mode        | Initial mode for the security system when running Homebridge.                  | "off"   | "home"    |
| disabled_modes      | Modes to exclude from the available modes list.                                | []      | ["night"] |
| arm_seconds         | Time in seconds to arm the security system after the user requesting it.       | 0       | 60        |
| trigger_seconds     | Time in seconds to be able to disarm the security system before triggering it. | 0       | 15        |
| siren_switch (1)    | Shows a switch on the Home app to trigger the security system.                 | true    | false     |
| siren_mode_switches | Shows switches on the Home app to trigger the security system for each mode.   | false   | true      |
| override_off        | Allows to trigger the security system while disarmed.                          | false   | true      |
| save_state          | State persistence for shutdowns and reboots.                                   | false   | true      |

(1) A powerful HomeKit app like Eve is required if the siren switch option is disabled to trigger the security system without using a switch accessory.

## Server options (optional)
Use the options below to start a HTTP server on the device and interact with the security system.

| Option           | Description                                                     | Default | Example |
|------------------|-----------------------------------------------------------------|---------|---------|
| server_port      | Port of the web server that will run on your Homebridge device. | null    | 8080    |
| server_code      | Code to authenticate requests sent to the security system.      | null    | 1234    |
| server_arm_delay | Allows to enable or disable the arming delay.                   | false   | true    |

After setting the option, you can call these endpoints:

| Method | Endpoint                     | Description                                        |
|--------|------------------------------|----------------------------------------------------|
| GET    | /status                      | Gets current status from the security system.      |
| GET    | /home                        | Changes current security system mode to home.      |
| GET    | /away                        | Changes current security system mode to away.      |
| GET    | /night                       | Changes current security system mode to night.     |
| GET    | /off                         | Changes current security system mode to off.       |
| GET    | /triggered                   | Changes current security system mode to triggered. |

If you're using the `server_code` option, add `?code=[your_code]` at the end of the URL.

## Webhook options (optional)
Use the options below to send requests to a server when the security system mode changes.

| Option             | Description                                                                    | Value/s                |
|--------------------|--------------------------------------------------------------------------------| -----------------------|
| webhook_url        | URL of a web server if you would like to use webhooks.                         | http://example.ltd     |
| webhook_triggered  | Path of the 'triggered' mode used on your web server.                          | /your-path             |
| webhook_alert      | Path of the 'alert' state used on your web server.                             | /your-path             |
| webhook_home       | Path of the 'home' mode used on your web server.                               | /your-path             |
| webhook_away       | Path of the 'away' mode used on your web server.                               | /your-path             |
| webhook_night      | Path of the 'night' mode used on your web server.                              | /your-path             |
| webhook_off        | Path of the 'off' mode used on your web server.                                | /your-path             |

## Command options (optional)
Use the options below to execute commands on the device when the security system mode changes.

| Option             | Description                                                                    | Value/s                |
|--------------------|--------------------------------------------------------------------------------|------------------------|
| command_triggered  | Command of the 'triggered' mode to execute on the device.                      | your command           |
| command_alert      | Command of the 'alert' state to execute on the device.                         | your command           |
| command_home       | Command of the 'home' mode to execute on the device.                           | your command           |
| command_away       | Command of the 'away' mode to execute on the device.                           | your command           |
| command_night      | Command of the 'night' mode to execute on the device.                          | your command           |
| command_off        | Command of the 'off' mode to execute on the device.                            | your command           |
