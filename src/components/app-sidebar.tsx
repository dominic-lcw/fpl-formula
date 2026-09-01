"use client";

import { BarChart3, GitBranch, LineChart, UsersRound } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";

export type DashboardView = "rankings" | "team" | "tracker";

const navItems = [
  {
    id: "rankings" as const,
    title: "Rankings",
    icon: BarChart3,
  },
  {
    id: "team" as const,
    title: "My team",
    icon: UsersRound,
  },
  {
    id: "tracker" as const,
    title: "Formula tracker",
    icon: LineChart,
  },
];

export function AppSidebar({
  activeView,
  onNavigate,
  seasonLabel,
  liveLabel,
}: {
  activeView: DashboardView;
  onNavigate: (view: DashboardView) => void;
  seasonLabel?: string;
  liveLabel?: string | null;
}) {
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <BarChart3 className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">FPL Formula Lab</span>
                <span className="truncate text-xs text-muted-foreground">Explainable rankings</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Views</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={activeView === item.id}
                    onClick={() => onNavigate(item.id)}
                    tooltip={item.title}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {seasonLabel ? (
          <>
            <SidebarSeparator />
            <SidebarGroup className="group-data-[collapsible=icon]:hidden">
              <SidebarGroupLabel>Dataset</SidebarGroupLabel>
              <SidebarGroupContent>
                <div className="px-2 text-xs leading-5 text-muted-foreground">
                  <p className="font-medium text-sidebar-foreground">{seasonLabel}</p>
                  {liveLabel ? <p className="mt-1">{liveLabel}</p> : null}
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center justify-between gap-2 px-2 py-1 group-data-[collapsible=icon]:justify-center">
              <a
                href="https://github.com/dominic-lcw/fpl-formula"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden"
              >
                <GitBranch className="size-4" />
                GitHub
              </a>
              <ThemeToggle />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
