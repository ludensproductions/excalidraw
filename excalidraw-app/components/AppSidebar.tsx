import { DefaultSidebar, Sidebar } from "@excalidraw/excalidraw";
import { messageCircleIcon } from "@excalidraw/excalidraw/components/icons";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";

import { CommentsPanel } from "./CommentsPanel";

export const AppSidebar = () => {
  const { openSidebar } = useUIAppState();

  return (
    <DefaultSidebar>
      <DefaultSidebar.TabTriggers>
        <Sidebar.TabTrigger
          tab="comments"
          style={{ opacity: openSidebar?.tab === "comments" ? 1 : 0.4 }}
          title="Comentarios"
        >
          {messageCircleIcon}
        </Sidebar.TabTrigger>
      </DefaultSidebar.TabTriggers>
      <Sidebar.Tab tab="comments">
        <CommentsPanel />
      </Sidebar.Tab>
    </DefaultSidebar>
  );
};
