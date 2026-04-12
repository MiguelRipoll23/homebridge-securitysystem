import fs from 'fs';
import type { Logging } from 'homebridge';
import type { SecuritySystemOptions } from '../interfaces/options-interface.js';

/** Wraps the homebridge logger to also append messages to a rotating daily log file. */
export function attachFileLogger(log: Logging, options: SecuritySystemOptions): void {
  if (!options.logDirectory) {
    return; 
  }

  const dir = options.logDirectory;

  const appendToFile = async (message: string): Promise<void> => {
    const logPath = `${dir}/securitysystem.log`;

    try {
      const stats = await fs.promises.stat(logPath);
      const today = new Date().toLocaleDateString();

      if (stats.birthtime.toLocaleDateString() !== today) {
        const rotated = `${dir}/securitysystem-${stats.birthtime.toLocaleDateString().replaceAll('/', '-')}.log`;
        await fs.promises.rename(logPath, rotated);
      }
    } catch {
      // No previous log file — first write will create it.
    }

    try {
      const line = `[${new Date().toLocaleString()}] ${message}\n`;
      await fs.promises.appendFile(logPath, line, { flag: 'a' });
    } catch (err) {
      // Avoid infinite recursion — call the original methods directly.
      process.stderr.write(`File logger error: ${err}\n`);
    }
  };

  const origInfo = log.info.bind(log);
  const origWarn = log.warn.bind(log);
  const origError = log.error.bind(log);

  // Re-assign to also write to file.
  (log as unknown as Record<string, unknown>).info = (msg: string) => {
    origInfo(msg);
    appendToFile(msg);
  };
  (log as unknown as Record<string, unknown>).warn = (msg: string) => {
    origWarn(msg);
    appendToFile(msg);
  };
  (log as unknown as Record<string, unknown>).error = (msg: string) => {
    origError(msg);
    appendToFile(msg);
  };
}
