"use client";

import React, { useState } from 'react';
import { cn } from '@kit/ui/utils';
import CustomerValidatorModal from './CustomerValidatorModal';

// Check if the fake door feature is enabled
const FAKEDOOR_ENABLED = process.env.NEXT_PUBLIC_FAKEDOOR_ENABLE === 'true';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  className?: string;
  // New props for handling CTA and fake door behavior
  isCta?: boolean; // Flag to identify if this is a Call-to-Action button
  ignoreFakeDoor?: boolean; // Flag to bypass fake door validation even if enabled
  ctaId?: string; // Optional ID for the CTA to track in the validator
}

const Button = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  icon, 
  iconPosition = 'right',
  className,
  isCta = false,
  ignoreFakeDoor = false,
  ctaId = 'general-cta',
  onClick,
  ...props 
}: ButtonProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const variants = {
    primary: 'bg-gradient-to-r from-claw-red to-claw-coral button-gradient text-white border-0 hover:shadow-lg hover:shadow-claw-red/20',
    secondary: 'glass hover:bg-white/10 dark:hover:bg-white/10 text-foreground dark:text-white border-white/10',
    outline: 'bg-transparent border border-foreground/20 dark:border-white/20 hover:bg-foreground/5 dark:hover:bg-white/5 text-foreground dark:text-white',
    ghost: 'bg-transparent text-foreground dark:text-white hover:bg-foreground/5 dark:hover:bg-white/5'
  };
  
  const sizes = {
    sm: 'py-1.5 px-3 text-sm',
    md: 'py-2.5 px-5 text-base',
    lg: 'py-3 px-6 text-lg'
  };

  // Handle button click to intercept for fake door validation
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Check if this is a CTA button and if fake door is enabled and not ignored
    if (isCta && FAKEDOOR_ENABLED && !ignoreFakeDoor) {
      e.preventDefault();
      // Open the validator modal
      setIsModalOpen(true);
    }
    
    // Always call the original onClick handler if it exists and fake door is disabled
    if ((!isCta || !FAKEDOOR_ENABLED || ignoreFakeDoor) && onClick) {
      onClick(e);
    }
  };

  return (
    <>
      <button
        className={cn(
          'cursor-pointer rounded-md font-medium flex items-center justify-center gap-2 transition-all ease-in-out',
          variants[variant],
          sizes[size],
          className
        )}
        onClick={handleClick}
        {...props}
      >
        {icon && iconPosition === 'left' && <span>{icon}</span>}
        {children}
        {icon && iconPosition === 'right' && <span>{icon}</span>}
      </button>

      {/* Render the validator modal conditionally */}
      {isCta && FAKEDOOR_ENABLED && (
        <CustomerValidatorModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          selectedPlan={ctaId}
        />
      )}
    </>
  );
};

export default Button;
