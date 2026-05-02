import { createContext, useContext } from "react";

export const PageTitleContext = createContext({
  setTitle: () => {},
});

export function usePageTitle() {
  return useContext(PageTitleContext);
}
