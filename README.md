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
| Option           | Required | Description                                                                    | Value/s                |
|------------------|----------|--------------------------------------------------------------------------------|------------------------|
| default_mode     | No       | Initial mode for the security system when running Homebridge.                  | home|away|night|off    |
| arm_seconds      | No       | Time in seconds to arm the security system after the user requesting it.       | any positive number    |
| trigger_seconds  | No       | Time in seconds to be able to disarm the security system before triggering it. | any positive number    |
| siren_switch (1) | No       | Shows a switch on the Home app to trigger the security system.                 | true/false             |
| save_state       | No       | State persistence for shutdowns and reboots.                                   | true/false             |

(1) A powerful HomeKit app like Eve is required if the siren switch option is disabled to trigger the security system without using a switch accessory.

## Advanced options
| Option          | Required | Description                                                                    | Value/s                |
|-----------------|----------|--------------------------------------------------------------------------------|------------------------|
| url             | No       | URL of a web server if you would like to use webhooks.                         | http://example.ltd     |
| path_home       | No       | Path of the 'home' mode used on your web server.                               | /your-path             |
| path_away       | No       | Path of the 'away' mode used on your web server.                               | /your-path             |
| path_night      | No       | Path of the 'night' mode used on your web server.                              | /your-path             |
| path_triggered  | No       | Path of the 'triggered' mode used on your web server.                          | /your-path             |

## Update the state when it changed from another source
Use case: If your alarm can be controlled by a remote, when the user change the alarm state with the remote, the state is not updated in Homebridge.
You can set the option `port` that will start a web server on your Homebridge device and listen for state changes to update the display state in Home app.
| Option          | Required | Description                                                                    | Value/s                |
|-----------------|----------|--------------------------------------------------------------------------------|------------------------|
| Port            | No       | Port of the web server that will run on your Homebridge device                 | 3030                   |

After setting the port, you can call the url `http://<homebridge_ip>:<config_port>/alarm-state-changed/<new_state>`
The `new_state` can be one of the following:
 * STAY_ARM: `0`
 * AWAY_ARM: `1`
 * NIGHT_ARM: `2`
 * DISARMED: `3`
 * ALARM_TRIGGERED: `4`
