import {
  Bell,
  BookOpen,
  Box,
  Database,
  FolderOpen,
  Globe,
  HelpCircle,
  Shield,
  LayoutDashboard,
  Server,
  Settings,
  Tags,
  Users,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

const iconMap: Record<string, LucideIcon> = {
  Bell,
  BookOpen,
  Box,
  Database,
  FolderOpen,
  Globe,
  LayoutDashboard,
  Server,
  Settings,
  Shield,
  Tags,
  Users,
}

export function getIcon(name: string): LucideIcon {
  return iconMap[name] ?? HelpCircle
}
