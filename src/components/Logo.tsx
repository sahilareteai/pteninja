import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

export const Logo: React.FC<LogoProps> = ({ className, size = 32 }) => {
  return (
    <div 
      className={`relative flex items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[#0B0C10] to-[#1F2833] shadow-lg ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Ninja Mask SVG */}
      <svg 
        viewBox="0 0 100 100" 
        className="w-4/5 h-4/5"
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer Shield/Hexagon Shape */}
        <path 
          d="M50 5L90 25V75L50 95L10 75V25L50 5Z" 
          fill="#1F2833" 
          stroke="#45A29E" 
          strokeWidth="2"
        />
        
        {/* Ninja Mask Detail */}
        <path 
          d="M20 40C20 40 35 35 50 35C65 35 80 40 80 40V60C80 60 65 65 50 65C35 65 20 60 20 60V40Z" 
          fill="#0B0C10"
        />
        
        {/* Eyes (Glowing Cyan) */}
        <circle cx="35" cy="50" r="4" fill="#66FCF1" className="animate-pulse" />
        <circle cx="65" cy="50" r="4" fill="#66FCF1" className="animate-pulse" />
        
        {/* Subtle Book/Graduation Cap Reference */}
        <path 
          d="M30 70L50 80L70 70" 
          stroke="#45A29E" 
          strokeWidth="2" 
          strokeLinecap="round"
        />
      </svg>
      
      {/* Glossy Overlay */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />
    </div>
  );
};
