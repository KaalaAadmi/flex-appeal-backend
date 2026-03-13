export interface ApiErrorDetail {
  field: string;
  message: string;
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: ApiErrorDetail[],
) {
  const body: {
    error: { code: string; message: string; details?: ApiErrorDetail[] };
  } = {
    error: { code, message },
  };
  if (details && details.length > 0) {
    body.error.details = details;
  }
  return Response.json(body, { status });
}

export function badRequest(message: string, details?: ApiErrorDetail[]) {
  return errorResponse("BAD_REQUEST", message, 400, details);
}

export function notFound(message = "Resource not found") {
  return errorResponse("NOT_FOUND", message, 404);
}

export function conflict(message: string) {
  return errorResponse("CONFLICT", message, 409);
}

export function validationError(message: string, details?: ApiErrorDetail[]) {
  return errorResponse("VALIDATION_ERROR", message, 422, details);
}

export function internalError(message = "An unexpected error occurred") {
  return errorResponse("INTERNAL_ERROR", message, 500);
}
