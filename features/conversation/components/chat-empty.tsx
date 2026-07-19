import { MessageSquareIcon, SearchIcon, GitBranchIcon, SparklesIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/** Empty-state placeholder shown before the first message is sent, acting as a minimalist landing page. */
export function ChatEmpty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 max-w-2xl mx-auto py-12">
      <Empty className="border-0 p-0 flex flex-col gap-8">
        <EmptyHeader className="max-w-md">
          <EmptyMedia variant="icon" className="bg-primary/10 text-primary">
            <SparklesIcon className="h-5 w-5" />
          </EmptyMedia>
          <EmptyTitle className="text-3xl font-bold tracking-tight text-foreground mt-2">
            Welcome to Echo
          </EmptyTitle>
          <EmptyDescription className="text-muted-foreground text-sm leading-relaxed">
            A clean, modern chat assistant. Ask questions directly or let the assistant fetch live web results.
          </EmptyDescription>
        </EmptyHeader>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full text-left">
          {/* Web Search Feature */}
          <div className="flex gap-3 rounded-2xl border border-border bg-card p-4 transition-all hover:bg-muted/30">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <SearchIcon className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-foreground">AI Web Search</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Fetches real-time search results automatically when current information is required.
              </p>
            </div>
          </div>

          {/* Chat Branching Feature */}
          <div className="flex gap-3 rounded-2xl border border-border bg-card p-4 transition-all hover:bg-muted/30">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <GitBranchIcon className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-foreground">Chat Branching</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Edit and fork any prompt. Explore multiple response paths inline with instant history toggling.
              </p>
            </div>
          </div>
        </div>

        {/* Start indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center mt-2">
          <MessageSquareIcon className="h-3.5 w-3.5" />
          <span>Type a message below to start</span>
        </div>
      </Empty>
    </div>
  );
}
