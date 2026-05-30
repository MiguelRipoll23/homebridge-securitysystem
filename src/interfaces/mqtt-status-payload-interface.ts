export interface MqttStatusPayload {
  arming: boolean;
  current_mode: string;
  target_mode: string;
  tripped: boolean;
}
