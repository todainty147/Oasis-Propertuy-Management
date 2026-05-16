import { forwardRef } from "react";

/*
  Card — base surface component.

  macOS HIG: cards use a very light border over a white surface.
  No shadow, no hover-lift. Lift is a mobile/Material pattern;
  macOS items highlight (bg tint) on hover, they do not float.

  Pages that need a clickable card can wrap in a <button> or <Link>
  and add their own hover:bg-black/[0.02] treatment.
*/
const Card = forwardRef(function Card({ children, className = "", ...props }, ref) {
  return (
    <div
      ref={ref}
      {...props}
      className={`tenaqo-card ${className}`}
    >
      {children}
    </div>
  );
});

export default Card;
