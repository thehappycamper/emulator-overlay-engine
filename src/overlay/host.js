export function getDomainOverlayPresentation(domain) {
  if (!domain || typeof domain !== "object" || Array.isArray(domain)) {
    throw new TypeError("A domain descriptor is required for overlay presentation");
  }

  const presentation = domain.presentation;
  if (!presentation || typeof presentation !== "object" || typeof presentation.renderOverlay !== "function") {
    throw new Error(`Domain ${domain.id || "<unknown>"} does not provide overlay presentation`);
  }

  const stylesheets = presentation.stylesheets ?? [];
  if (!Array.isArray(stylesheets) || stylesheets.some((href) => typeof href !== "string" || href.length === 0)) {
    throw new TypeError(`Domain ${domain.id || "<unknown>"} overlay stylesheets must be non-empty strings`);
  }

  return presentation;
}

export function renderDomainOverlay(domain, state) {
  const markup = getDomainOverlayPresentation(domain).renderOverlay(state);
  if (typeof markup !== "string") {
    throw new TypeError(`Domain ${domain.id || "<unknown>"} overlay renderer must return a string`);
  }
  return markup;
}
