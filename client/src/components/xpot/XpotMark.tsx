/**
 * The square Xpot app mark. Served by /api/branding/favicon so Settings › Branding can replace
 * icon-sized surfaces independently of the fixed horizontal product wordmark.
 */
export function XpotMark({ className = "h-7 w-7 rounded-lg" }: { className?: string }) {
  return (
    <img
      src="/api/branding/favicon"
      alt=""
      aria-hidden="true"
      className={`shrink-0 object-cover ${className}`}
      onError={(event) => {
        const image = event.currentTarget;
        if (image.getAttribute("src") !== "/favicon.png") image.src = "/favicon.png";
      }}
    />
  );
}
