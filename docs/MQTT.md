# MQTT

Publish real-time security system state updates to an MQTT broker.

## Configuration

Add these fields to your plugin config (or configure via the Homebridge UI):

| Field | Type | Default | Description |
|---|---|---|---|
| `mqtt_broker` | `string` | — | Broker URL, e.g. `mqtt://localhost:1883` or `mqtts://broker.example.com:8883` |
| `mqtt_username` | `string` | — | Optional username for authentication |
| `mqtt_password` | `string` | — | Optional password for authentication |
| `mqtt_topic` | `string` | `security-system/state` | Topic to publish status payloads to |
| `mqtt_client_id` | `string` | — | Optional client ID (auto-generated if omitted) |

MQTT is **optional** — omit `mqtt_broker` to disable it.

## Payload

Published as a retained JSON message on every state change:

```json
{
  "arming": false,
  "current_mode": "home",
  "target_mode": "home",
  "tripped": true
}
```

| Field | Type | Description |
|---|---|---|
| `arming` | `boolean` | Whether the system is counting down an arming delay |
| `current_mode` | `string` | Current active mode: `off`, `home`, `away`, `night`, `triggered` |
| `target_mode` | `string` | Target mode being transitioned to |
| `tripped` | `boolean` | Whether a trip switch is active (trigger delay counting down) |

## Events

Publishes are triggered by these state machine changes:

- Current mode changes (`CURRENT_CHANGED`)
- Target mode changes (`TARGET_CHANGED`)
- Arming delay start (`ARMING`)
- Warning state (`WARNING`)

## Proxy Mode

If `proxy_mode` is enabled, publishes originating from external sources (e.g. HTTP API) are suppressed.
