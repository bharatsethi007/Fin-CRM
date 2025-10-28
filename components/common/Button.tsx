import React from 'react';
import { Icon, IconName } from './Icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  // FIX: Add size prop to allow for different button sizes.
  size?: 'sm' | 'md' | 'lg';
  leftIcon?: IconName;
  rightIcon?: IconName;
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  // FIX: Destructure size prop with a default value.
  size = 'md',
  leftIcon,
  rightIcon,
  isLoading = false,
  className = '',
  ...props
}) => {
  // FIX: Remove size-specific classes from baseClasses to be handled dynamically.
  const baseClasses = 'inline-flex items-center justify-center border rounded-md font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed';

  // FIX: Add size classes to dynamically apply padding and font size.
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  const variantClasses = {
    primary: 'border-transparent bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500',
    secondary: 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus:ring-primary-500',
    danger: 'border-transparent bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    ghost: 'border-transparent bg-transparent text-primary-600 hover:bg-primary-100 dark:hover:bg-primary-900/20 focus:ring-primary-500',
  };

  return (
    <button
      // FIX: Apply size class along with other classes.
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && <Icon name="Loader" className="animate-spin -ml-1 mr-2 h-4 w-4" />}
      {leftIcon && !isLoading && <Icon name={leftIcon} className="-ml-1 mr-2 h-4 w-4" />}
      {children}
      {rightIcon && <Icon name={rightIcon} className="ml-2 -mr-1 h-4 w-4" />}
    </button>
  );
};
