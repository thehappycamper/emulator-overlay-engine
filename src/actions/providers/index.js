// The full set of harmless local action providers this task proves the
// architecture with. Domain-neutral executor code (src/actions/execute.js)
// has no knowledge these specific providers exist - callers choose which
// providers to register.
import { overlayNotificationProvider } from "./overlay-notification.js";
import { systemLogProvider } from "./system-log.js";

export { overlayNotificationProvider, systemLogProvider };

export const HARMLESS_LOCAL_PROVIDERS = Object.freeze([overlayNotificationProvider, systemLogProvider]);
