import { create } from "zustand";

import type { Tab } from "../types";

const DEFAULT_TAB: Tab = "overview";

type TenantTabState = {
  openedTabs: Tab[];
  activeTab: Tab;
  refreshSeedByTab: Partial<Record<Tab, number>>;
  activateTab: (tab: Tab) => void;
  closeTab: (tab: Tab) => Tab;
  closeAllTabs: (nextActiveTab?: Tab) => Tab;
  refreshTab: (tab: Tab) => void;
  resetTabs: (tab?: Tab) => void;
};

const ensureTabOpened = (openedTabs: Tab[], tab: Tab) =>
  openedTabs.includes(tab) ? openedTabs : [...openedTabs, tab];

export const useTenantTabStore = create<TenantTabState>((set, get) => ({
  openedTabs: [DEFAULT_TAB],
  activeTab: DEFAULT_TAB,
  refreshSeedByTab: {},
  activateTab: (tab) =>
    set((state) => ({
      openedTabs: ensureTabOpened(state.openedTabs, tab),
      activeTab: tab
    })),
  closeTab: (tab) => {
    const { openedTabs, activeTab } = get();
    const closingIndex = openedTabs.indexOf(tab);

    if (tab === DEFAULT_TAB) {
      return activeTab;
    }

    const nextOpenedTabs = openedTabs.filter((openedTab) => openedTab !== tab);
    const nextActiveTab =
      activeTab !== tab
        ? activeTab
        : nextOpenedTabs[Math.max(closingIndex - 1, 0)] ?? nextOpenedTabs[nextOpenedTabs.length - 1] ?? DEFAULT_TAB;

    set({
      openedTabs: nextOpenedTabs.length > 0 ? nextOpenedTabs : [DEFAULT_TAB],
      activeTab: nextActiveTab
    });

    return nextActiveTab;
  },
  closeAllTabs: (nextActiveTab = DEFAULT_TAB) => {
    set({
      openedTabs: [nextActiveTab],
      activeTab: nextActiveTab
    });

    return nextActiveTab;
  },
  refreshTab: (tab) =>
    set((state) => ({
      refreshSeedByTab: {
        ...state.refreshSeedByTab,
        [tab]: (state.refreshSeedByTab[tab] ?? 0) + 1
      }
    })),
  resetTabs: (tab = DEFAULT_TAB) =>
    set({
      openedTabs: [tab],
      activeTab: tab,
      refreshSeedByTab: {}
    })
}));
