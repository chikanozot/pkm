import React from "react";

interface LumoraLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showBg?: boolean;
}

export const LumoraLogo: React.FC<LumoraLogoProps> = ({ size = "md", showBg = true }) => {
  // Dimensions based on size prop
  const containerClasses = {
    sm: "w-12 h-12",
    md: "w-20 h-20",
    lg: "w-36 h-36",
    xl: "w-56 h-56 sm:w-64 sm:h-64"
  }[size];

  const titleClasses = {
    sm: "text-[8px] tracking-[0.16em] font-light",
    md: "text-[12px] tracking-[0.18em] font-light",
    lg: "text-[21px] tracking-[0.22em] font-light",
    xl: "text-[32px] sm:text-[36px] tracking-[0.25em] font-light"
  }[size];

  const subtitleClasses = {
    sm: "text-[4.5px] tracking-[0.12em]",
    md: "text-[6.5px] tracking-[0.15em]",
    lg: "text-[11px] tracking-[0.18em]",
    xl: "text-[16px] sm:text-[18px] tracking-[0.2em]"
  }[size];

  const flowLineHeight = {
    sm: "h-[1px] w-2.5",
    md: "h-[1px] w-4",
    lg: "h-[1.5px] w-7",
    xl: "h-[2px] w-12 sm:w-14"
  }[size];

  const content = (
    <div className="flex flex-col items-center justify-center text-center select-none font-sans">
      {/* LUMORA TEXT */}
      <span className={`text-white font-normal ${titleClasses} uppercase leading-none`}>
        LUMORA
      </span>
      
      {/* FLOW AND LINES */}
      <div className="flex items-center justify-center gap-1.5 mt-[8%] w-full">
        {/* Left purple-to-pink gradient line */}
        <div className={`${flowLineHeight} bg-gradient-to-r from-violet-600 to-fuchsia-500 rounded-full opacity-90`} />
        
        {/* FLOW TEXT with gradient fill */}
        <span className={`font-bold ${subtitleClasses} uppercase bg-gradient-to-r from-violet-400 via-pink-400 to-orange-400 bg-clip-text text-transparent`}>
          FLOW
        </span>
        
        {/* Right pink-to-orange gradient line */}
        <div className={`${flowLineHeight} bg-gradient-to-r from-fuchsia-500 to-orange-500 rounded-full opacity-90`} />
      </div>
    </div>
  );

  if (showBg) {
    return (
      <div className={`rounded-full bg-[#020718] flex items-center justify-center shadow-lg border border-white/5 ${containerClasses}`}>
        {content}
      </div>
    );
  }

  return content;
};
