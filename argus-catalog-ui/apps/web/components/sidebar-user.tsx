// Added for SSO AUTH - sidebar footer component with user dropdown, profile dialog, and logout.
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronUp,
  LogOut,
  Mail,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
  User2,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@workspace/ui/components/sidebar"
import { Separator } from "@workspace/ui/components/separator"
import { useAuth } from "@/features/auth"

export function SidebarUser() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [profileOpen, setProfileOpen] = useState(false)

  if (!user) return null

  const displayName =
    `${user.last_name ?? ""}${user.first_name ?? ""}`.trim() || user.username

  // Role icon: admin > superuser > user
  const RoleIcon = user.is_admin
    ? ShieldCheck
    : user.is_superuser
      ? ShieldAlert
      : User
  const roleName =
    user.role === "admin"
      ? "Admin"
      : user.role === "superuser"
        ? "Super User"
        : "User"

  async function handleLogout() {
    await logout()
    router.replace("/login")
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">
                    <RoleIcon className="size-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </div>
                <ChevronUp className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
              side="bottom"
              align="end"
              sideOffset={4}
            >
              <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
                <User2 className="mr-2 size-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleLogout}>
                <LogOut className="mr-2 size-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      {/* Profile Dialog (read-only) */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Profile</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-2">
            <Avatar className="h-16 w-16 rounded-full">
              <AvatarFallback className="rounded-full">
                <RoleIcon className="size-7" />
              </AvatarFallback>
            </Avatar>
            <div className="text-center">
              <p className="text-lg font-semibold">{displayName}</p>
              <p className="text-sm text-muted-foreground">@{user.username}</p>
            </div>
          </div>

          <Separator />

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm pt-2">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <User className="size-3.5" />
              Name
            </dt>
            <dd className="font-medium">{displayName}</dd>

            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <User2 className="size-3.5" />
              Username
            </dt>
            <dd className="font-medium">@{user.username}</dd>

            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <Mail className="size-3.5" />
              Email
            </dt>
            <dd className="font-medium">{user.email}</dd>

            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <Shield className="size-3.5" />
              Role
            </dt>
            <dd className="font-medium">{roleName}</dd>
          </dl>
        </DialogContent>
      </Dialog>
    </>
  )
}
