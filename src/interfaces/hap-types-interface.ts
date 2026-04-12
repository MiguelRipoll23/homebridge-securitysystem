import type { API } from 'homebridge';

/**
 * Runtime type of `api.hap.Characteristic` (the class with all static characteristic
 * definitions). Using `API['hap']['Characteristic']` avoids the self-referential
 * `typeof Characteristic` issue that arises with `import type { Characteristic }`.
 */
export type CharacteristicConstructor = API['hap']['Characteristic'];

/** Runtime type of `api.hap.Service`. */
export type ServiceConstructor = API['hap']['Service'];
