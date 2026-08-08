import { evaluateExpression, parseJsonPointer, resolveJsonPointer } from "../expressions/evaluate.js";

function cloneJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneJsonValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item)]));
  }
  return value;
}

function isArrayIndex(segment) {
  return /^(0|[1-9][0-9]*)$/u.test(segment);
}

function resolveArrayIndex(array, segment) {
  if (!isArrayIndex(segment)) {
    throw new Error(`Array target path segment "${segment}" must be a non-negative integer.`);
  }

  const index = Number(segment);
  if (!Number.isSafeInteger(index)) {
    throw new Error(`Array target path index "${segment}" is not a safe integer.`);
  }
  if (index > array.length) {
    throw new RangeError(`Array target path index ${index} exceeds current length ${array.length}.`);
  }
  if (index < array.length && !Object.prototype.hasOwnProperty.call(array, index)) {
    throw new RangeError(`Array target path index ${index} does not reference an existing element.`);
  }

  return index;
}

function assignContainerValue(container, segment, value) {
  if (Array.isArray(container)) {
    const index = resolveArrayIndex(container, segment);
    if (index === container.length) {
      container.push(value);
    } else {
      container[index] = value;
    }
    return;
  }

  container[segment] = value;
}

export function setJsonPointer(target, pointer, value) {
  const segments = parseJsonPointer(pointer);
  if (segments.length === 0) {
    throw new Error("Mapping target paths must not replace the target root.");
  }

  let current = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const nextShouldBeArray = isArrayIndex(segments[index + 1]);

    if (Array.isArray(current)) {
      const arrayIndex = resolveArrayIndex(current, segment);
      if (arrayIndex === current.length) {
        current.push(nextShouldBeArray ? [] : {});
      } else if (current[arrayIndex] === null || typeof current[arrayIndex] !== "object") {
        throw new Error(`Cannot map through non-container target path segment "${segment}".`);
      }

      current = current[arrayIndex];
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      current[segment] = nextShouldBeArray ? [] : {};
    } else if (current[segment] === null || typeof current[segment] !== "object") {
      throw new Error(`Cannot map through non-container target path segment "${segment}".`);
    }

    current = current[segment];
  }

  assignContainerValue(current, segments.at(-1), cloneJsonValue(value));
}

function assertRequiredPaths(value, paths, label) {
  for (const path of paths ?? []) {
    if (resolveJsonPointer(value, path) === undefined) {
      throw new Error(`${label} is missing required path "${path}".`);
    }
  }
}

function applyFieldMappings(project, source, target) {
  for (const mapping of project.fieldMappings ?? []) {
    let value = resolveJsonPointer(source, mapping.sourcePath);
    if (value === undefined && Object.prototype.hasOwnProperty.call(mapping, "default")) {
      value = mapping.default;
    }
    if (value === undefined) {
      if (mapping.required) {
        throw new Error(`Required source path "${mapping.sourcePath}" is missing.`);
      }
      continue;
    }
    setJsonPointer(target, mapping.targetPath, value);
  }
}

function applyValueMappings(project, source, target) {
  for (const mapping of project.valueMappings ?? []) {
    const sourceValue = resolveJsonPointer(source, mapping.sourcePath);
    const match = mapping.entries.find((entry) => Object.is(entry.from, sourceValue));

    if (match) {
      setJsonPointer(target, mapping.targetPath, match.to);
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(mapping, "default")) {
      setJsonPointer(target, mapping.targetPath, mapping.default);
      continue;
    }

    switch (mapping.unmatched ?? "error") {
      case "omit":
        break;
      case "passthrough":
        if (sourceValue !== undefined) {
          setJsonPointer(target, mapping.targetPath, sourceValue);
        }
        break;
      case "error":
        throw new Error(`No value mapping matched source path "${mapping.sourcePath}".`);
      default:
        throw new Error(`Unknown unmatched value mapping behavior "${mapping.unmatched}".`);
    }
  }
}

function applyCalculatedFields(project, source, target, context) {
  for (const calculatedField of project.calculatedFields ?? []) {
    const value = evaluateExpression(calculatedField.expression, { source, target, context });
    if (value === undefined) {
      if (calculatedField.required) {
        throw new Error(`Calculated target path "${calculatedField.targetPath}" produced no value.`);
      }
      continue;
    }
    setJsonPointer(target, calculatedField.targetPath, value);
  }
}

export function applyMappingProject(project, source, options = {}) {
  if (project === null || typeof project !== "object" || Array.isArray(project)) {
    throw new TypeError("Mapping project must be an object.");
  }

  assertRequiredPaths(source, project.validation?.requiredSourcePaths, "Source");

  const target = {};
  applyFieldMappings(project, source, target);
  applyValueMappings(project, source, target);
  applyCalculatedFields(project, source, target, options.context);

  assertRequiredPaths(target, project.validation?.requiredTargetPaths, "Target");

  if (options.validateTarget) {
    const result = options.validateTarget(target, project.target, project.target.schema);
    if (result === false) {
      throw new Error(`Target failed validation for contract "${project.target.id}".`);
    }
  }

  return target;
}
