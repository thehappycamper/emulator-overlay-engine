import { createDomainRegistry } from "../platform/domain-registry.js";
import { pokemonDomain } from "./pokemon/index.js";

const domainRegistry = createDomainRegistry([pokemonDomain]);

export function resolveDomain(domainId) {
  return domainRegistry.resolve(domainId);
}
