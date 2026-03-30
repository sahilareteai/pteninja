import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";

interface LogoProps {
  className?: string;
  size?: number;
}

export const Logo: React.FC<LogoProps> = ({ className, size = 32 }) => {
  const [logoUrl, setLogoUrl] = useState<string | null>(localStorage.getItem('pte_ninja_logo'));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!logoUrl && !loading) {
      generateLogo();
    }
  }, [logoUrl]);

  const generateLogo = async () => {
    setLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              text: "Create a unique, globally distinct logo for 'PTE NINJA'. The design should feature a stylized, abstract ninja mask that subtly incorporates the negative space of an open book or a graduation cap. The eyes of the ninja should be represented by two small, glowing electric cyan dots. Use a premium color palette: deep midnight blue (#0B0C10), electric cyan (#66FCF1), and metallic silver. The overall shape should be a shield or a hexagon to symbolize strength and structure. The style must be ultra-modern, vector-based, and minimalist, avoiding any generic stock-logo tropes. Ensure it is completely original and represents a high-end, high-tech educational brand.",
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const base64EncodeString = part.inlineData.data;
          const imageUrl = `data:image/png;base64,${base64EncodeString}`;
          setLogoUrl(imageUrl);
          localStorage.setItem('pte_ninja_logo', imageUrl);
          break;
        }
      }
    } catch (error) {
      console.error("Error generating logo:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div 
        className={`bg-app-surface animate-pulse rounded-lg ${className}`} 
        style={{ width: size, height: size }} 
      />
    );
  }

  if (!logoUrl) {
    return (
      <div 
        className={`bg-app-primary/20 flex items-center justify-center rounded-lg ${className}`}
        style={{ width: size, height: size }}
      >
        <span className="text-[10px] font-bold text-app-primary">PTE</span>
      </div>
    );
  }

  return (
    <img 
      src={logoUrl} 
      alt="PTE Ninja Logo" 
      className={`rounded-lg object-contain ${className}`}
      style={{ width: size, height: size }}
      referrerPolicy="no-referrer"
    />
  );
};
