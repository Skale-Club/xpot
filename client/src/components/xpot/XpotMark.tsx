/**
 * The Xpot logo: the blue-green X on its dark tile. Served by /api/branding/favicon so an admin
 * upload in Settings › Branding replaces it everywhere at once (default: client/public/favicon.png).
 */
export function XpotMark({ className = "h-7 w-7 rounded-lg" }: { className?: string }) {
  return <img src="/api/branding/favicon" alt="" aria-hidden="true" className={`shrink-0 object-cover ${className}`} />;
}
