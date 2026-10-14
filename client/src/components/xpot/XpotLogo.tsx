type XpotLogoProps = {
  className?: string;
  decorative?: boolean;
};

/** The complete horizontal Xpot logo used on dark product surfaces. */
export function XpotLogo({ className = "h-8 w-auto", decorative = false }: XpotLogoProps) {
  return (
    <img
      src="/api/branding/logo"
      alt={decorative ? "" : "Xpot"}
      aria-hidden={decorative || undefined}
      className={`shrink-0 object-contain ${className}`}
      onError={(event) => {
        const image = event.currentTarget;
        if (image.getAttribute("src") !== "/xpot-logo.svg") image.src = "/xpot-logo.svg";
      }}
    />
  );
}
