// Ownership semantics: once a domain package is handed to createDomainRegistry,
// the registry becomes the sole authority on what that domain looks like for the
// rest of its lifetime. Callers must not rely on being able to mutate a package
// after registering it - the registry enforces this by freezing the descriptor
// tree in place at registration time, rather than trusting each domain package
// to freeze itself.
//
// Freezing is deliberately scoped to plain-object/array "container"
// values (the same distinction src/mapping/apply.js and src/expressions/evaluate.js
// use for JSON-shaped data), recursing through however many such containers a
// descriptor actually contains. Functions, class instances, and other exotic
// objects are left untouched: freezing a function does not meaningfully change
// its behavior, and deep-freezing arbitrary object types could produce
// surprising results for descriptor shapes this registry doesn't yet know about.
// A recursive deep-freeze framework good for every possible object type would
// be more machinery than this boundary needs.
//
function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isDescriptorContainer(value) {
  return Array.isArray(value) || isPlainObject(value);
}

function freezeDescriptorTree(value, visited = new WeakSet()) {
  if (!isDescriptorContainer(value) || visited.has(value)) {
    return value;
  }

  visited.add(value);
  if (!Object.isFrozen(value)) {
    Object.freeze(value);
  }

  for (const key of Object.keys(value)) {
    freezeDescriptorTree(value[key], visited);
  }

  return value;
}

export function createDomainRegistry(domains = []) {
  const domainsById = new Map();

  for (const domain of domains) {
    if (!domain || typeof domain !== "object") {
      throw new TypeError("Domain packages must be objects");
    }

    if (!isPlainObject(domain)) {
      throw new TypeError("Domain packages must be plain objects");
    }

    if (typeof domain.id !== "string" || domain.id.length === 0) {
      throw new TypeError("Domain packages must define a non-empty string id");
    }

    if (domainsById.has(domain.id)) {
      throw new Error(`Duplicate domain id: ${domain.id}`);
    }

    domainsById.set(domain.id, freezeDescriptorTree(domain));
  }

  return Object.freeze({
    has(domainId) {
      return domainsById.has(domainId);
    },

    resolve(domainId) {
      const domain = domainsById.get(domainId);
      if (!domain) {
        throw new Error(`Unknown domain: ${domainId}`);
      }
      return domain;
    }
  });
}
