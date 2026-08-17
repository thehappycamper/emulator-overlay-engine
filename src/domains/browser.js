import { createDomainRegistry } from "../platform/domain-registry.js";
import { pokemonBrowserDomain } from "./pokemon/presentation-descriptor.js";

const browserDomainRegistry = createDomainRegistry([pokemonBrowserDomain]);

export function resolveBrowserDomain(domainId) {
  return browserDomainRegistry.resolve(domainId);
}