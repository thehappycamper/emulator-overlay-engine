export function createDomainRegistry(domains = []) {
  const domainsById = new Map();

  for (const domain of domains) {
    if (!domain || typeof domain !== "object") {
      throw new TypeError("Domain packages must be objects");
    }

    if (typeof domain.id !== "string" || domain.id.length === 0) {
      throw new TypeError("Domain packages must define a non-empty string id");
    }

    if (domainsById.has(domain.id)) {
      throw new Error(`Duplicate domain id: ${domain.id}`);
    }

    domainsById.set(domain.id, domain);
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
