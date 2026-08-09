export class LocalConfigError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "LocalConfigError";
  }
}

export function parseLocalEnv(text) {
  const values = {};

  for (const [index, originalLine] of String(text).split(/\r?\n/u).entries()) {
    const line = originalLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const assignment = line.startsWith("export ") ? line.slice(7).trimStart() : line;
    const separator = assignment.indexOf("=");
    if (separator < 1) {
      throw new LocalConfigError(`Invalid local config assignment on line ${index + 1}`);
    }

    const key = assignment.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
      throw new LocalConfigError(`Invalid local config key on line ${index + 1}`);
    }

    let value = assignment.slice(separator + 1).trim();
    const quote = value[0];
    if (quote === '"' || quote === "'") {
      if (value.length < 2 || value.at(-1) !== quote) {
        throw new LocalConfigError(`Unterminated quoted value on line ${index + 1}`);
      }
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}
