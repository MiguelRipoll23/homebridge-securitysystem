# homebridge-securitysystem
[![NPM version](https://img.shields.io/npm/v/homebridge-securitysystem.svg)](https://www.npmjs.com/package/homebridge-securitysystem) ![NPM downloads](https://img.shields.io/npm/dt/homebridge-securitysystem.svg)

Homebridge plugin that creates a security system accessory that can be triggered by HomeKit accessories.

## Installation
If you already have Homebridge installed, skip to step two! If you had any issues installing this module previously, they're solved now and you should be able to install this module successfully.

1. Install Homebridge using `npm install -g --unsafe-perm homebridge`.
2. Install the plugin using `npm install -g --unsafe-perm homebridge-securitysystem`.
3. Update your configuration file from Homebridge (see `sample-config.json` as an example) that you can find on your personal folder. Also, change values from optional parameters if you need.

## Automations
Use Eve or a similar app to create automations like this:

| Trigger            | Condition                         | Scene actions                 |
|--------------------|-----------------------------------|-------------------------------|
| Motion is detected | Security system is set to `Night` | Turn on `Siren`               |
| Door is opened     | Security system is set to `Away`  | Turn on `Siren`               |
| Button is pressed  | Security system is set to `Away`  | Set security system to `Home` |

## Additional information
A switch called `Siren` that appears alongside your security system is used to trigger it. Changing modes while the security system is about to be triggered or already triggered will stop the alarm and continue its normal behaviour.
