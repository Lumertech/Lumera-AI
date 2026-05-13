// Normalize FastAPI/Axios errors into a friendly human-readable string
// suitable for passing to toast.error / displaying as text.
//
// Handles:
//  - Pydantic 422 detail: List[{type, loc, msg, input, ctx}]
//  - 4xx/5xx detail: string
//  - Network errors: err.message
//
export function extractApiError(err, fallback = 'Something went wrong') {
  if (!err) return fallback;
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((d) => d?.msg || JSON.stringify(d)).join('; ');
  }
  if (detail && typeof detail === 'object') {
    return detail.msg || JSON.stringify(detail);
  }
  if (err?.message) return err.message;
  return fallback;
}
