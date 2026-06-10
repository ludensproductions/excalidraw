import { actionToggleTheme } from "../../actions";
import { t } from "../../i18n";
import { DEFAULT_CATEGORIES } from "./types";

import type { CommandPaletteItem } from "./types";

export const toggleTheme: CommandPaletteItem = {
  ...actionToggleTheme,
  category: DEFAULT_CATEGORIES.app,
  label: t("labels.toggleTheme"),
  perform: ({ actionManager }) => {
    actionManager.executeAction(actionToggleTheme, "commandPalette");
  },
};
