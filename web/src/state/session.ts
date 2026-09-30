const KEY = "strangler.sessionId";
const REPO_KEY = "strangler.repoUrl";

export function loadSessionId(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveSessionId(id: string): void {
  sessionStorage.setItem(KEY, id);
}

export function loadRepoUrl(): string {
  try {
    return sessionStorage.getItem(REPO_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveRepoUrl(url: string): void {
  sessionStorage.setItem(REPO_KEY, url);
}

export function clearSession(): void {
  sessionStorage.removeItem(KEY);
}
