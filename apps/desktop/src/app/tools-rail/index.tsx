import { useStore } from '@nanostores/react'

import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'
import { useI18n } from '@/i18n'
import { $activeTool, type ActiveTool, setActiveTool } from '@/store/tools'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Narrow vertical rail beside the sidebar. Each entry is a *mode*, not a view:
 * picking one leaves the chat pane and composer exactly as they are and only
 * changes which sessions the sidebar lists and what `source` a new session
 * gets — so each tool keeps its own history.
 *
 * `tool: null` is general Chat (the default). Add a tool by appending here and
 * to TOOL_SESSION_SOURCE_IDS in lib/session-source.ts (see that file for the
 * full checklist — the backend source list is load-bearing).
 */
interface ToolRailItem {
  tool: ActiveTool
  /** Key into t.toolsRail.items — the rail is icon-only, so this is the
   *  tooltip and the accessible name. */
  labelKey: 'chat' | 'report-generator' | 'tender-analyze'
  icon: string
}

const RAIL_ITEMS: ToolRailItem[] = [
  { tool: null, labelKey: 'chat', icon: 'comment-discussion' },
  { tool: 'tender-analyze', labelKey: 'tender-analyze', icon: 'checklist' },
  { tool: 'report-generator', labelKey: 'report-generator', icon: 'pie-chart' }
]

interface ToolsRailProps {
  /** Called after the mode changes, so the shell can refresh the (now
   *  differently-scoped) session list and leave any open session behind. */
  onSelectTool?: (tool: ActiveTool) => void
}

export function ToolsRail({ onSelectTool }: ToolsRailProps) {
  const { t } = useI18n()
  const copy = t.toolsRail
  const activeTool = useStore($activeTool)

  return (
    <nav
      aria-label={copy.label}
      className="flex h-full w-11 shrink-0 flex-col items-center gap-1 border-r border-(--ui-stroke-tertiary) bg-(--ui-bg-sidebar) pt-[calc(var(--titlebar-height)+0.375rem)]"
    >
      {RAIL_ITEMS.map(item => {
        const active = activeTool === item.tool
        const label = copy.items[item.labelKey]

        return (
          <Tooltip key={item.labelKey}>
            <TooltipTrigger asChild>
              <button
                aria-current={active ? 'page' : undefined}
                aria-label={label}
                className={cn(
                  // no-drag: the rail's top button sits directly under the
                  // titlebar's drag strip, which otherwise wins hit-testing.
                  // Same carve-out as the sidebar nav rows.
                  'flex size-8 items-center justify-center rounded-md border border-transparent text-(--ui-text-secondary) transition-colors duration-100 ease-out [-webkit-app-region:no-drag] hover:bg-(--ui-control-hover-background) hover:text-foreground',
                  active && 'border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) text-foreground'
                )}
                onClick={() => {
                  if (activeTool === item.tool) {
                    return
                  }

                  setActiveTool(item.tool)
                  onSelectTool?.(item.tool)
                }}
                type="button"
              >
                <Codicon name={item.icon} size="1rem" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        )
      })}
    </nav>
  )
}
