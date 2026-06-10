import type { ActionManager } from "../../actions/manager";
import type { Action } from "../../actions/types";

export const DEFAULT_CATEGORIES = {
  app: "Aplicación",
  export: "Exportar",
  tools: "Herramientas",
  editor: "Editor",
  elements: "Elementos",
  links: "Enlaces",
  library: "Biblioteca",
};

export type CommandPaletteItem = {
  label: string;
  /** additional keywords to match against
   * (appended to haystack, not displayed) */
  keywords?: string[];
  /**
   * string we should match against when searching
   * (deburred name + keywords)
   */
  haystack?: string;
  icon?: Action["icon"];
  category: string;
  order?: number;
  predicate?: boolean | Action["predicate"];
  shortcut?: string | null;
  /** if false, command will not show while in view mode */
  viewMode?: boolean;
  perform: (data: {
    actionManager: ActionManager;
    event: React.MouseEvent | React.KeyboardEvent | KeyboardEvent;
  }) => void;
};
