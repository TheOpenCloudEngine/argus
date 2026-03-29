import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar"
import { AppSidebarNav } from "@/components/app-sidebar-nav"
import { AppSidebarUser } from "@/components/app-sidebar-user"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"
import { getMenu } from "@/lib/menu"

export async function AppSidebar() {
  const menu = await getMenu()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="cursor-default hover:bg-transparent active:bg-transparent">
              <div className="grid flex-1 leading-tight group-data-[collapsible=icon]:justify-items-center">
                <span className="truncate text-lg font-bold">
                  <span className="group-data-[collapsible=icon]:hidden">Argus Insight</span>
                  <span className="hidden group-data-[collapsible=icon]:inline">AI</span>
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <WorkspaceSwitcher />
        <AppSidebarNav groups={menu.groups} />
      </SidebarContent>

      <SidebarFooter>
        <AppSidebarUser />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
