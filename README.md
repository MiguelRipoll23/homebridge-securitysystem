# homebridge-securitysystem
[![npm version](https://badgen.net/npm/v/homebridge-securitysystem)](https://www.npmjs.com/package/homebridge-securitysystem) 
[![npm downloads](https://badgen.net/npm/dt/homebridge-securitysystem)](https://www.npmjs.com/package/homebridge-securitysystem)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Homebridge plugin that creates a security system accessory that can be triggered by HomeKit accessories.

[❤️ One-time donation](https://paypal.me/miguelripoll23)

## Installation
If you already have [Homebridge](https://github.com/homebridge/homebridge) installed, execute the following command:

`npm i -g --unsafe-perm homebridge-securitysystem`

## Demo
<div align="left">
  <img align="left" width="222" height="480" src="https://github.com/MiguelRipoll23/homebridge-securitysystem/blob/alpha/.github/images/demo.gif?raw=true">
  <p>Want to know how it looks like? It's pretty customizable, you can have one single switch, one for every mode avaliable or even no switches at all.</p>
  <p>What you are seeing at your left it's <b>the friendliest</b> configuration that you can start with. Each <code>Siren</code> switch that you see can only be activated if its mode is selected on the security system, this allows you to create logic-less automations from the very Home app that comes already installed on iOS.</p>
  <p>There are also the so called <code>Mode</code> switches which let you trigger automations when a mode is changed or bypass HomeKit confirmation dialogs. Need to temporarily disarm the security system? There's a <code>Pause</code> switch for that.</p>
  <p>Still, the <code>Sensor</code> category also got some love. Receiving multiple notifications when the alarm gets triggered or triggering an automation when the security system has reset would be possible by enabling them.</p>
  <p>If you thought that was all... there is a server to interact with the security system, webhooks or even commands to integrate with other devices or services and a plenty of more options to make this plugin your own DIY security system.</p>
  <p>Homebridge / HOOBS UI is recommended to configure the plugin. If you need to submit feedback, create an issue or discussion here.</p>
</div>

## Automations
Using the `Home` app is recommended for regular users, for more advanced users the `Eve` or a similar app  will let you make use of the custom options that the security system itself exposes.

Here are some examples of automations that can be created:

| Trigger                       | Actions                           |
|-------------------------------|-----------------------------------|
| Motion is Detected            | Turn on `Siren Night`             |
| Door is Opened                | Turn on `Siren Away`              |
| NFC Tag is Detected (1)       | Set Security system to `Home`     |
| Security system Triggers      | Play Audio (2)                    |

(1) Shortcuts app is required to create this automation.

(2) AirPlay 2 speaker and Apple Music subscription are required.

**IMPORTANT:** Use an NFC tag to arm/disarm the security system easily and securely without using the Home app.

## Contributions
Pull requests are welcome.