# homebridge-securitysystem

[![npm version](https://badgen.net/npm/v/homebridge-securitysystem)](https://www.npmjs.com/package/homebridge-securitysystem)
[![npm downloads](https://badgen.net/npm/dt/homebridge-securitysystem)](https://www.npmjs.com/package/homebridge-securitysystem)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Homebridge plugin that creates a security system accessory that can be triggered by HomeKit sensors.

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/MiguelRipoll23)

## Installation

If you already have [Homebridge](https://github.com/homebridge/homebridge) installed, execute the following command:

`npm i -g --unsafe-perm homebridge-securitysystem`

## Demo

<div align="left">
  <img align="right" width="205" height="445" src="./.github/demo.jpg">
  <p>Want to know how it looks like? It's pretty customizable, you can configure it to show as many switches as you like.</p>
  <p>What you are seeing at your right is <b>the friendliest</b> configuration that you can start with. Each <code>Trip</code> switch that you see can only trip the security system if the mode is currently set. This allows you to create logic-less automations from the very Home app that comes already installed on iOS.</p>
  <p>There are also <code>Mode</code> switches which let you run automations that interact with your accessories when a mode is changed or set modes bypassing HomeKit confirmation dialogs.</p>
  <p>A web server, webhooks or even shell commands are available to integrate the security system with other devices or services plus a plenty of more settings to make this plugin your own DIY security system.</p>
  <p>Homebridge / HOOBS UI is recommended to configure the plugin, for additional help please check the <a href="https://github.com/MiguelRipoll23/homebridge-securitysystem/wiki">Wiki</a> page.</p>
</div>

## Automations

Using the `Home` app is recommended for regular users, for more advanced users the `Eve` or a similar app will let you make use of the custom options that the security system itself exposes.

Here are some examples of automations that can be created:

| Trigger                  | Actions                       |
| ------------------------ | ----------------------------- |
| Motion is Detected       | Turn on `Trip Night`          |
| Door is Opened           | Turn on `Trip Away`           |
| NFC Tag is Detected (1)  | Set Security system to `Home` |
| Security System Triggers | Play Audio (2)                |

(1) Shortcuts app is required to create this automation.

(2) AirPlay 2 speaker and Apple Music subscription are required.

## Contributions

Pull requests are welcome.
