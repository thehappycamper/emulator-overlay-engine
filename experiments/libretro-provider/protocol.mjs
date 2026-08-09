export const PROTOCOL_VERSION = "1.0.0";

export class ProviderError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.details = details;
  }
}

export function errorPayload(error) {
  return {
    code: error?.code ?? "PROVIDER_ERROR",
    message: error?.message ?? String(error),
    ...(error?.details === undefined ? {} : { details: error.details }),
  };
}

export function assertRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new ProviderError("MALFORMED_REQUEST", "Request must be a JSON object");
  }
  if (typeof request.id !== "string" || !request.id) {
    throw new ProviderError("MALFORMED_REQUEST", "Request id must be a non-empty string");
  }
  if (typeof request.op !== "string" || !request.op) {
    throw new ProviderError("MALFORMED_REQUEST", "Request op must be a non-empty string");
  }
}
