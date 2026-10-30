export type Workspace = "work" | "management";

/** Data scope belongs to the page being used, never to a remembered device-wide switch. */
export function workspaceForPath(path: string): Workspace {
  const pathname = path.split(/[?#]/, 1)[0];
  return ["/admin", "/organizations"].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ? "management" : "work";
}

export function workspaceHeaders(path: string): Record<string, string> {
  return { "X-Xpot-View": workspaceForPath(path) === "management" ? "manage" : "rep" };
}
