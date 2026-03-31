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
        className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-app-surface shadow-xl border border-app-border p-1 shrink-0"
        style={{ width: size, height: size }}
      >
        {/* Premium Ninja Badge Logo SVG */}
        <svg 
          viewBox="0 0 100 100" 
          className="w-full h-full"
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Outer Mastery Hexagon */}
          <path 
            d="M50 5L89 27.5V72.5L50 95L11 72.5V27.5L50 5Z" 
            stroke="currentColor" 
            strokeWidth="1" 
            opacity="0.3"
            style={{ color: 'var(--app-primary)' }}
          />
          
          {/* Crossed Katanas with Guards */}
          <g style={{ color: 'var(--app-primary)' }}>
            {/* Sword 1 */}
            <path 
              d="M22 78L78 22" 
              stroke="currentColor" 
              strokeWidth="3.5" 
              strokeLinecap="round" 
              opacity="0.8"
            />
            {/* Guard (Tsuba) */}
            <rect x="18" y="74" width="8" height="3" transform="rotate(-45 18 74)" fill="currentColor" />
            {/* Hilt (Tsuka) */}
            <path 
              d="M14 86L22 78" 
              stroke="currentColor" 
              strokeWidth="5" 
              strokeLinecap="round" 
            />
            
            {/* Sword 2 */}
            <path 
              d="M78 78L22 22" 
              stroke="currentColor" 
              strokeWidth="3.5" 
              strokeLinecap="round" 
              opacity="0.8"
            />
            {/* Guard (Tsuba) */}
            <rect x="74" y="74" width="8" height="3" transform="rotate(45 74 74)" fill="currentColor" />
            {/* Hilt (Tsuka) */}
            <path 
              d="M86 86L78 78" 
              stroke="currentColor" 
              strokeWidth="5" 
              strokeLinecap="round" 
            />
          </g>

          {/* Ninja Hood (Inner Badge) */}
          <path 
            d="M50 18C38 18 28 28 28 45C28 62 38 82 50 82C62 82 72 62 72 45C72 28 62 18 50 18Z" 
            fill="currentColor" 
            className="text-app-bg"
            stroke="currentColor" 
            strokeWidth="2.5"
            style={{ color: 'var(--app-primary)' }}
          />
          
          {/* Mask Opening */}
          <path 
            d="M34 42C34 42 42 38 50 38C58 38 66 42 66 42V52C66 52 58 48 50 48C42 48 34 52 34 52V42Z" 
            fill="currentColor"
            className="text-app-surface"
            stroke="currentColor"
            strokeWidth="1"
            style={{ color: 'var(--app-primary)' }}
          />
          
          {/* Cyber Glow Eyes */}
          <g style={{ color: 'var(--app-accent)' }}>
            <path 
              d="M40 44H46" 
              stroke="currentColor" 
              strokeWidth="2.5" 
              strokeLinecap="round" 
            />
            <path 
              d="M54 44H60" 
              stroke="currentColor" 
              strokeWidth="2.5" 
              strokeLinecap="round" 
            />
            {/* Eye Glow Effect */}
            <circle cx="43" cy="44" r="4" fill="currentColor" opacity="0.2" />
            <circle cx="57" cy="44" r="4" fill="currentColor" opacity="0.2" />
          </g>
          
          {/* Rank Star (Shuriken) */}
          <path 
            d="M50 25L52 30H57L53 33L55 38L50 35L45 38L47 33L43 30H48L50 25Z" 
            fill="currentColor" 
            style={{ color: 'var(--app-accent)' }}
          />
        </svg>
        
        {/* Glassy Highlight */}
        <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />
      </div>

      {showText && (
        <div className="flex flex-col leading-none whitespace-nowrap">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black tracking-tighter text-app-text uppercase">PTE</span>
            <span className="text-2xl font-black tracking-tighter text-app-primary uppercase">NINJA</span>
          </div>
        </div>
      )}
    </div>
  );
};
