import { forwardRef } from "react";

const Card = forwardRef(function Card({ children, className = "" }, ref) {
  return (
    <div
      ref={ref}
      className={`
        bg-white rounded-xl border border-slate-200 shadow-sm
        transition-transform transition-shadow duration-200
        hover:-translate-y-0.5 hover:shadow-md
        motion-reduce:transition-none motion-reduce:hover:transform-none
        ${className}
      `}
    >
      {children}
    </div>
  );
});

export default Card;
