function browserIsOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function describeWorkspaceError(cause: unknown, online = browserIsOnline()) {
  const fallback = "The workspace change could not be completed.";
  const message = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : fallback;

  if (!online || /failed to fetch|fetch failed|network ?error|network request failed|load failed/i.test(message)) {
    return "Sift is offline. Your cloud workspace was not changed. Reconnect and try again.";
  }

  if (/jwt|session|unauthori[sz]ed|not permitted|permission denied|row-level security/i.test(message)) {
    return "Your session could not complete this cloud action. Sign in again or reload, then retry.";
  }

  return message;
}
