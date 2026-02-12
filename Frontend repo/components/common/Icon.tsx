import React from 'react';
import {
  LayoutDashboard, Users, Briefcase, Contact, CheckSquare, MoreVertical,
  PlusCircle, Search, Bell, Sun, Moon, ChevronDown, ChevronUp, X, Filter, 
  Calendar, ArrowRight, Bot, Send, Loader, Menu, Banknote, Building,
  ArrowLeft, Mail, Phone, Home, TrendingUp, TrendingDown, RefreshCw,
  FileText, Download, Pencil, FilePlus2, Sparkles, Info, Wifi, Frame,
  LandPlot, Layers3, FileBadge2, CalendarDays, Mountain, Construction,
  ShieldCheck, LayoutPanelTop, Landmark, BookKey, Scale, Wallet, PiggyBank,
  Percent, UserCog, ShieldAlert, ClipboardCheck, FileSignature, PhoneCall, Mic, Square,
  Paintbrush, Database, UserPlus, Settings, Gem, CreditCard, Code2, Headset, 
  DatabaseBackup, AppWindow, KeyRound, HelpCircle, Command, BarChart3, Play,
  GitFork, Star, Building2, DollarSign,   List, Plus, Share2, FolderPlus, Folder, Upload, Trash2
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';


const ICONS = {
  LayoutDashboard, Users, Briefcase, Contact, CheckSquare, MoreVertical,
  PlusCircle, Search, Bell, Sun, Moon, ChevronDown, ChevronUp, X, Filter, 
  Calendar, ArrowRight, Bot, Send, Loader, Menu, Banknote, Building,
  ArrowLeft, Mail, Phone, Home, TrendingUp, TrendingDown, RefreshCw,
  FileText, Download, Pencil, FilePlus2, Sparkles, Info, Wifi, Frame,
  LandPlot, Layers3, FileBadge2, CalendarDays, Mountain, Construction,
  ShieldCheck, LayoutPanelTop, Landmark, BookKey, Scale, Wallet, PiggyBank,
  Percent, UserCog, ShieldAlert, ClipboardCheck, FileSignature, PhoneCall, Mic, Square,
  Paintbrush, Database, UserPlus, Settings, Gem, CreditCard, Code2, Headset, 
  DatabaseBackup, AppWindow, KeyRound, HelpCircle, Command, BarChart3, Play,
  GitFork, Star, Building2, DollarSign, List, Plus, Share2, FolderPlus, Folder, Upload, Trash2
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