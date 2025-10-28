import React from 'react';
import {
  LayoutDashboard, Users, Briefcase, Contact, CheckSquare, MoreVertical,
  PlusCircle, Search, Bell, Sun, Moon, ChevronDown, ChevronUp, X, Filter, 
  Calendar, ArrowRight, Bot, Send, Loader, Menu, Banknote, Building,
  ArrowLeft, Mail, Phone, Home, TrendingUp, TrendingDown, RefreshCw,
  FileText, Download, Pencil, FilePlus2, Sparkles
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';


const ICONS = {
  LayoutDashboard, Users, Briefcase, Contact, CheckSquare, MoreVertical,
  PlusCircle, Search, Bell, Sun, Moon, ChevronDown, ChevronUp, X, Filter, 
  Calendar, ArrowRight, Bot, Send, Loader, Menu, Banknote, Building,
  ArrowLeft, Mail, Phone, Home, TrendingUp, TrendingDown, RefreshCw,
  FileText, Download, Pencil, FilePlus2, Sparkles
} as const;

export type IconName = keyof typeof ICONS;

// FIX: The IconProps interface is simplified to only contain the 'name' property.
interface IconProps {
  name: IconName;
}

// FIX: The component's props are updated to be an intersection of IconProps and LucideProps.
// This correctly types all props passed to the Icon component, including `className` which comes from LucideProps, resolving the TypeScript errors.
export const Icon: React.FC<IconProps & LucideProps> = ({ name, ...props }) => {
  const LucideIcon = ICONS[name];
  if (!LucideIcon) {
    return null;
  }
  return <LucideIcon {...props} />;
};