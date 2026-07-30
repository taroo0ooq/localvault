/** Typed API client — full surface in S2/S3. */
export interface ServerInfo {
  name: string;
  version: string;
  stage: string;
}

export async function fetchServerInfo(baseUrl: string): Promise<ServerInfo> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/server-info`);
  if (!res.ok) throw new Error(`server-info failed: ${res.status}`);
  return (await res.json()) as ServerInfo;
}

export async function fetchHealth(baseUrl: string): Promise<{ status: string }> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/healthz`);
  if (!res.ok) throw new Error(`healthz failed: ${res.status}`);
  return (await res.json()) as { status: string };
}
