import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ className, size = 40, showText = false }) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div 
        className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-[#0B0C10] shadow-xl border border-[#1F2833]"
        style={{ width: size, height: size }}
      >
        {/* Unique Ninja Logo SVG */}
        <svg 
          viewBox="0 0 100 100" 
          className="w-[85%] h-[85%]"
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Hexagonal Shield Background */}
          <path 
            d="M50 5L89 27.5V72.5L50 95L11 72.5V27.5L50 5Z" 
            fill="#1F2833" 
            stroke="#45A29E" 
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          
          {/* Ninja Mask Area */}
          <path 
            d="M25 40C25 40 38 34 50 34C62 34 75 40 75 40V62C75 62 62 70 50 70C38 70 25 62 25 62V40Z" 
            fill="#0B0C10"
            stroke="#45A29E"
            strokeWidth="1.5"
          />
          
          {/* Glowing Ninja Eyes */}
          <g className="animate-pulse">
            <path 
              d="M35 48C35 48 38 46 42 46C46 46 49 48 49 48" 
              stroke="#66FCF1" 
              strokeWidth="3" 
              strokeLinecap="round"
            />
            <path 
              d="M51 48C51 48 54 46 58 46C62 46 65 48 65 48" 
              stroke="#66FCF1" 
              strokeWidth="3" 
              strokeLinecap="round"
            />
          </g>
          
          {/* Stylized "V" Chin/Smile */}
          <path 
            d="M38 75L50 85L62 75" 
            stroke="#45A29E" 
            strokeWidth="3" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
          
          {/* Subtle Shuriken/Star Detail */}
          <path 
            d="M50 15L53 22H60L54 26L56 33L50 29L44 33L46 26L40 22H47L50 15Z" 
            fill="#66FCF1" 
            opacity="0.6"
          />
        </svg>
        
        {/* Glassy Highlight */}
        <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />
      </div>

      {showText && (
        <div className="flex flex-col leading-none">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black tracking-tighter text-white uppercase">PTE</span>
            <span className="text-2xl font-black tracking-tighter text-[#45A29E] uppercase">NINJA</span>
          </div>
          <span className="text-[10px] font-bold tracking-[0.2em] text-[#66FCF1]/60 uppercase ml-0.5">Mastery Awaits</span>
        </div>
      )}
    </div>
  );
};
