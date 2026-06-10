export function apiError(code, message) {
  const error = new Error(message || code)
  error.code = code
  return error
}

export function isApiError(error, code) {
  return error?.code === code
}
