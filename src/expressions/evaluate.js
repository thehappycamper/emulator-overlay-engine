const BLOCKED_PATH_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_EXPRESSION_DEPTH = 100;

function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an expression object.`);
  }
}

function assertKeys(expression, allowed) {
  for (const key of Object.keys(expression)) {
    if (!allowed.has(key)) {
      throw new Error(`Property "${key}" is not allowed for expression operator "${expression.op}".`);
    }
  }
}

function assertBoolean(value, operator) {
  if (typeof value !== "boolean") {
    throw new TypeError(`Expression operator "${operator}" requires boolean operands.`);
  }
  return value;
}

function assertNumber(value, operator) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`Expression operator "${operator}" requires finite numeric operands.`);
  }
  return value;
}

function assertPrimitive(value, operator) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return value;
  }
  throw new TypeError(`Expression operator "${operator}" requires primitive JSON operands.`);
}

function cloneJsonValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Expression literals must contain finite JSON numbers.");
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(cloneJsonValue);
  }

  if (typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item)]));
  }

  throw new TypeError("Expression literals must be JSON-serializable values.");
}

export function parseJsonPointer(pointer) {
  if (typeof pointer !== "string" || (pointer !== "" && !pointer.startsWith("/"))) {
    throw new TypeError("Field paths must be RFC 6901 JSON Pointers.");
  }

  if (pointer === "") {
    return [];
  }

  return pointer.slice(1).split("/").map((segment) => {
    if (/~(?:[^01]|$)/u.test(segment)) {
      throw new Error(`Invalid JSON Pointer escape in "${pointer}".`);
    }

    const decoded = segment.replaceAll("~1", "/").replaceAll("~0", "~");
    if (BLOCKED_PATH_SEGMENTS.has(decoded)) {
      throw new Error(`Path segment "${decoded}" is not allowed.`);
    }
    return decoded;
  });
}

export function resolveJsonPointer(value, pointer) {
  let current = value;

  for (const segment of parseJsonPointer(pointer)) {
    if (current === null || (typeof current !== "object" && !Array.isArray(current))) {
      return undefined;
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

function evaluateArgs(expression, environment, depth) {
  if (!Array.isArray(expression.args)) {
    throw new TypeError(`Expression operator "${expression.op}" requires an args array.`);
  }
  return expression.args.map((argument) => evaluateNode(argument, environment, depth + 1));
}

function evaluateArithmetic(expression, environment, depth) {
  assertKeys(expression, new Set(["op", "args"]));
  const values = evaluateArgs(expression, environment, depth).map((value) => assertNumber(value, expression.op));
  if (values.length < 2) {
    throw new Error(`Expression operator "${expression.op}" requires at least two operands.`);
  }

  let result;
  switch (expression.op) {
    case "add":
      result = values.reduce((total, value) => total + value);
      break;
    case "subtract":
      result = values.slice(1).reduce((total, value) => total - value, values[0]);
      break;
    case "multiply":
      result = values.reduce((total, value) => total * value);
      break;
    case "divide":
      if (values.slice(1).some((value) => value === 0)) {
        throw new RangeError("Expression operator \"divide\" cannot divide by zero.");
      }
      result = values.slice(1).reduce((total, value) => total / value, values[0]);
      break;
    case "modulo":
      if (values.slice(1).some((value) => value === 0)) {
        throw new RangeError("Expression operator \"modulo\" cannot divide by zero.");
      }
      result = values.slice(1).reduce((total, value) => total % value, values[0]);
      break;
  }

  if (!Number.isFinite(result)) {
    throw new RangeError(`Expression operator "${expression.op}" produced a non-finite number.`);
  }
  return result;
}

function evaluateComparison(expression, environment, depth) {
  assertKeys(expression, new Set(["op", "left", "right"]));
  const left = assertPrimitive(evaluateNode(expression.left, environment, depth + 1), expression.op);
  const right = assertPrimitive(evaluateNode(expression.right, environment, depth + 1), expression.op);

  if (!["equal", "notEqual"].includes(expression.op)) {
    const orderedTypes = new Set(["number", "string"]);
    if (typeof left !== typeof right || !orderedTypes.has(typeof left)) {
      throw new TypeError(`Expression operator "${expression.op}" requires operands of the same numeric or string type.`);
    }
  }

  switch (expression.op) {
    case "equal": return left === right;
    case "notEqual": return left !== right;
    case "greaterThan": return left > right;
    case "greaterThanOrEqual": return left >= right;
    case "lessThan": return left < right;
    case "lessThanOrEqual": return left <= right;
  }
}

function evaluateNode(expression, environment, depth) {
  if (depth > MAX_EXPRESSION_DEPTH) {
    throw new RangeError(`Expression exceeds the maximum depth of ${MAX_EXPRESSION_DEPTH}.`);
  }

  assertObject(expression, "Expression");
  if (typeof expression.op !== "string") {
    throw new TypeError("Expression operator must be a string.");
  }

  switch (expression.op) {
    case "literal":
      assertKeys(expression, new Set(["op", "value"]));
      if (!Object.prototype.hasOwnProperty.call(expression, "value")) {
        throw new Error("Literal expressions require a value.");
      }
      return cloneJsonValue(expression.value);

    case "field": {
      assertKeys(expression, new Set(["op", "root", "path"]));
      const root = expression.root ?? "source";
      if (!new Set(["source", "target", "context"]).has(root)) {
        throw new Error(`Unknown field root "${root}".`);
      }
      return resolveJsonPointer(environment[root], expression.path);
    }

    case "array":
      assertKeys(expression, new Set(["op", "items"]));
      if (!Array.isArray(expression.items)) {
        throw new TypeError("Expression operator \"array\" requires an items array.");
      }
      return expression.items.map((item) => evaluateNode(item, environment, depth + 1));

    case "compact": {
      assertKeys(expression, new Set(["op", "value"]));
      const value = evaluateNode(expression.value, environment, depth + 1);
      if (!Array.isArray(value)) {
        throw new TypeError("Expression operator \"compact\" requires an array value.");
      }
      return value.filter(Boolean);
    }

    case "add":
    case "subtract":
    case "multiply":
    case "divide":
    case "modulo":
      return evaluateArithmetic(expression, environment, depth);

    case "equal":
    case "notEqual":
    case "greaterThan":
    case "greaterThanOrEqual":
    case "lessThan":
    case "lessThanOrEqual":
      return evaluateComparison(expression, environment, depth);

    case "and": {
      assertKeys(expression, new Set(["op", "args"]));
      const values = evaluateArgs(expression, environment, depth)
        .map((value) => assertBoolean(value, "and"));
      if (values.length < 1) {
        throw new Error("Expression operator \"and\" requires at least one operand.");
      }
      return values.every(Boolean);
    }

    case "or": {
      assertKeys(expression, new Set(["op", "args"]));
      const values = evaluateArgs(expression, environment, depth)
        .map((value) => assertBoolean(value, "or"));
      if (values.length < 1) {
        throw new Error("Expression operator \"or\" requires at least one operand.");
      }
      return values.some(Boolean);
    }

    case "not":
      assertKeys(expression, new Set(["op", "value"]));
      return !assertBoolean(evaluateNode(expression.value, environment, depth + 1), "not");

    case "if":
      assertKeys(expression, new Set(["op", "condition", "then", "else"]));
      return assertBoolean(evaluateNode(expression.condition, environment, depth + 1), "if")
        ? evaluateNode(expression.then, environment, depth + 1)
        : evaluateNode(expression.else, environment, depth + 1);

    case "coalesce": {
      assertKeys(expression, new Set(["op", "args"]));
      if (!Array.isArray(expression.args) || expression.args.length < 1) {
        throw new Error("Expression operator \"coalesce\" requires at least one operand.");
      }
      for (const argument of expression.args) {
        const value = evaluateNode(argument, environment, depth + 1);
        if (value !== null && value !== undefined) {
          return value;
        }
      }
      return undefined;
    }

    case "default": {
      assertKeys(expression, new Set(["op", "value", "fallback"]));
      const value = evaluateNode(expression.value, environment, depth + 1);
      return value === null || value === undefined
        ? evaluateNode(expression.fallback, environment, depth + 1)
        : value;
    }

    default:
      throw new Error(`Unknown expression operator "${expression.op}".`);
  }
}

export function evaluateExpression(expression, environment = {}) {
  assertObject(environment, "Expression environment");
  for (const key of Object.keys(environment)) {
    if (!new Set(["source", "target", "context"]).has(key)) {
      throw new Error(`Unknown expression environment root "${key}".`);
    }
  }

  return evaluateNode(expression, {
    source: environment.source,
    target: environment.target,
    context: environment.context
  }, 0);
}
