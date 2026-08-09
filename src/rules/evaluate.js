import { assertValidEvent } from "../events/validate.js";
import { assertValidActionRequest } from "../actions/validate.js";
import { assertValidRule } from "./validate.js";

export const SUPPORTED_ACTION_TYPES = Object.freeze(["overlay.notification"]);

function resolvePointer(root, pointer) {
  if (typeof pointer !== "string" || !pointer.startsWith("/")) return { found: false, value: undefined };
  let value = root;
  for (const encoded of pointer.slice(1).split("/")) {
    const token = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    if (["__proto__", "constructor", "prototype"].includes(token)) return { found: false, value: undefined };
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, token)) return { found: false, value: undefined };
    value = value[token];
  }
  return { found: true, value };
}

function equalValues(left, right) {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null || typeof left !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
  return leftKeys.every((key) => equalValues(left[key], right[key]));
}

function predicateMatches(event, predicate) {
  const resolved = resolvePointer(event, predicate.path);
  switch (predicate.op) {
    case "exists": return resolved.found;
    case "notExists": return !resolved.found;
    case "equals": return resolved.found && equalValues(resolved.value, predicate.value);
    case "notEquals": return resolved.found && !equalValues(resolved.value, predicate.value);
    case "greaterThan": return resolved.found && Number.isFinite(resolved.value) && Number.isFinite(predicate.value) && resolved.value > predicate.value;
    case "lessThan": return resolved.found && Number.isFinite(resolved.value) && Number.isFinite(predicate.value) && resolved.value < predicate.value;
    default: throw new TypeError(`Unsupported predicate operator ${predicate.op}`);
  }
}

function ruleMatches(event, rule) {
  return rule.enabled && rule.eventType === event.type && rule.predicates.every((predicate) => predicateMatches(event, predicate));
}

export function evaluateRules(event, rules, { correlationId = `event:${event.sequence}`, sequenceStart = 1 } = {}) {
  assertValidEvent(event);
  if (!Array.isArray(rules)) throw new TypeError("Rules must be an array");
  if (typeof correlationId !== "string" || !correlationId) throw new TypeError("correlationId must be a non-empty string");
  if (!Number.isInteger(sequenceStart) || sequenceStart < 1) throw new TypeError("sequenceStart must be a positive integer");

  const ids = new Set();
  for (const rule of rules) {
    assertValidRule(rule);
    if (ids.has(rule.id)) throw new TypeError(`Duplicate rule id ${rule.id}`);
    ids.add(rule.id);
  }

  const requests = [];
  let sequence = sequenceStart;
  for (const rule of rules) {
    if (!ruleMatches(event, rule)) continue;
    for (const declaration of rule.actions) {
      if (!SUPPORTED_ACTION_TYPES.includes(declaration.actionType)) throw new TypeError(`Unsupported action type ${declaration.actionType}`);
      if (typeof declaration.payload.message !== "string") throw new TypeError("overlay.notification payload.message must be a string");
      const request = {
        actionType: declaration.actionType,
        sequence,
        correlationId,
        ruleId: rule.id,
        triggeringEvent: structuredClone(event),
        payload: structuredClone(declaration.payload),
      };
      assertValidActionRequest(request);
      requests.push(Object.freeze(request));
      sequence += 1;
    }
  }
  return requests;
}
